# Email Marketing SaaS — Lead Audit & Outreach Platform

Import leads from CSV/XLSX, and for **every lead** run an automated research
pipeline: scrape the company's website, discover and scrape its competitors,
analyze weaknesses/gaps/opportunities, assemble a complete structured **Lead
Audit**, generate a genuinely personalized outreach email from the findings,
and deliver it over the user's own SMTP account — at 10,000+ lead scale.

```
CSV → Import/Dedup → Lead Processing → Company Research → Rival Discovery
    → Web Scraping → AI Analysis → Structured Audit → Email Generation
    → Send Queue → SMTP
```

## Stack

| Layer      | Tech                                                              |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React + TypeScript + Vite + shadcn/ui (SPA, served by nginx)      |
| Gateway    | nginx — serves the SPA, proxies `/api`, the only published port   |
| API        | NestJS (`APP_ROLE=api`) — HTTP only, enqueues work                |
| Workers    | NestJS (`APP_ROLE=worker`, same image) — audit pipeline + sending |
| AI service | Python FastAPI + **Google ADK** agents (research/rivals/analysis/email) |
| Database   | MongoDB 7 (Mongoose) — leads, audits, campaigns, research caches  |
| Queue      | Redis 7 + BullMQ — stage-by-stage pipeline fan-out across workers |
| Email      | nodemailer over per-user SMTP accounts — works with any provider (Gmail App Passwords, Outlook, Zoho, SES, …); port/TLS mismatches are auto-corrected |

## How the pipeline scales

Starting a campaign enqueues **one small job per lead** (its first stage) onto
a shared BullMQ queue. Completing a stage enqueues the next, so a 10k-lead
campaign becomes a stream of tiny, retryable jobs that Redis distributes across
**every worker replica**. Throughput ≈ `WORKER_REPLICAS × PIPELINE_CONCURRENCY`
(and `× SEND_CONCURRENCY` for delivery). Scale with:

```bash
make up-prod WORKER_REPLICAS=6
```

Built-in efficiency and safety mechanisms:

- **Minimal AI spend** — one combined "brief" model call returns the company
  profile AND its rivals; the analysis is company-scoped and cached per
  domain. A campaign with N leads across D companies costs **2×D + N** model
  calls total (brief + analysis per company, one email per lead) — and cached
  fallback results are recomputed automatically once an API key is added in
  Settings.
- **Domain-level research cache** — company research, rival discovery,
  analysis, and scraped pages are cached per *company domain* (Mongo, TTL):
  500 leads from acme.com trigger **one** research pass, not 500.
- **Cross-replica coordination** — a Redis lock prevents two workers from
  researching the same domain simultaneously; a per-domain pacing key
  guarantees a minimum delay between hits on any external website (politeness),
  across all replicas. robots.txt `Disallow` rules are honored.
- **Idempotency** — every run has a `runId`; job ids embed
  `runId:stage:leadId`, stale jobs from superseded runs are dropped, and
  retried jobs skip already-completed stages.
- **Retries with backoff** — every stage retries up to 3 total attempts
  (exponential backoff). Sends never auto-retry more than 2 times.
- **Failure recovery** — AI service down → deterministic local fallbacks
  (signals-based analysis, audit-grounded template email); website unreachable
  → negative-cached, audit continues degraded; a lead only fails after its
  final retry, and campaign counters always converge.
- **Batching + indexes** — imports insert in 2k chunks against a unique
  `(campaignId, email)` index (DB-level dedup); lead lists are server-paginated;
  counters update atomically.

## The Lead Audit

Each lead's detail page shows the full structured audit as it happens (stages
light up live): lead data → pipeline progress → company research (profile,
website signals, scraped pages with excerpts) → rivals (verified by actually
fetching their sites) → AI analysis (weaknesses, competitive gaps,
opportunities, head-to-head comparisons, insights, prioritized
recommendations) → the generated email. Every AI finding carries the evidence
that supports it, and the email writer is instructed to cite concrete findings
— not generic AI copy. Audits can also be run per-lead ("Run audit") without
sending anything.

## Repository layout

```
.
├── Makefile                 # make dev / make prod
├── docker-compose.yml       # base: gateway + api×N + worker×N + ai-service + redis + mongo
├── docker-compose.dev.yml   # dev override  — exposes Mongo/Redis, 1 replica each
├── docker-compose.prod.yml  # prod override — only the gateway exposed, restart:always
├── .env.dev / .env.prod     # per-environment config; Makefile copies one to .env
├── sample-leads.csv         # demo leads
├── backend/                 # NestJS — API + workers (one image, APP_ROLE switch)
│   └── src/
│       ├── config/          # validated env (Joi) + typed config
│       ├── common/          # session decorator, global exception filter
│       ├── redis/           # shared Redis client: locks + domain pacing
│       ├── leads/           # lead schema, CSV/XLSX parser (normalize + dedup)
│       ├── audits/          # LeadAudit + company research cache + audit API
│       ├── scraper/         # bounded fetching, extraction, signals, page cache
│       ├── ai/              # typed AI-service client + deterministic fallbacks
│       ├── pipeline/        # BullMQ pipeline: stages, processor, counters
│       ├── campaigns/       # campaign CRUD, uploads, start, send processor
│       ├── email-agent/     # nodemailer SMTP sender (pooled per account)
│       ├── smtp-accounts/   # per-user SMTP accounts (in-app, masked)
│       ├── llm-accounts/    # per-user LLM providers (Gemini/OpenAI/Ollama)
│       ├── settings/        # per-user email-writing preferences
│       └── health/          # deep health: mongo/redis/queue depths
├── ai-service/              # Google ADK agents (see ai-service/README.md)
│   └── app/
│       ├── agents/          # research / rivals / analysis / email
│       ├── runner.py        # one-shot ADK plumbing + JSON extraction
│       ├── llm.py           # per-request LLM construction (LiteLLM)
│       └── fallbacks.py     # deterministic no-LLM fallbacks
└── frontend/                # React SPA (Vite) + nginx gateway image
    └── src/
        ├── api/             # typed client + React Query + session id
        ├── hooks/           # useCampaigns, useLeadAudit (live polling), …
        ├── components/      # shadcn/ui primitives + dashboard components
        └── pages/           # Campaigns, Leads, LeadDetail (full audit), Settings
```

## Run it

**Prerequisite: Docker.**

```bash
make dev      # DEV : http://localhost:3000 — Mongo/Redis exposed, 1 api + 1 worker
make prod     # PROD: gateway on :80 only, 2 api + 3 workers
```

Verify:

```bash
curl http://localhost:3000/api/health          # mongo/redis status per replica
curl http://localhost:3000/api/health/queues   # live pipeline + send queue depth
```

Then open **http://localhost:3000**:

1. **Settings → SMTP accounts** — add the account campaigns send from
   (required before starting a campaign).
2. **Settings → AI providers** — add a Gemini/OpenAI/Ollama key (optional but
   recommended: without one, research summaries/analysis fall back to
   deterministic heuristics and no rivals are discovered).
3. **Campaigns → New campaign** — name it, describe your offer (the email
   writer uses this), upload `sample-leads.csv` (or an Apollo export — headers
   are matched tolerantly; website/phone/industry/location/LinkedIn columns are
   picked up when present). Invalid rows are skipped, duplicates dropped.
4. **Start campaign** — watch each lead move through
   *queued → researching → analyzing → writing → sending → sent*. Processing
   continues even if you close the browser.
5. Click any lead for its **full audit**; **Run audit** re-researches a single
   lead without sending.

### Deploy to a VPS (IP only, no domain needed)

Everything — frontend included — runs in Docker; the gateway serves the web
app and proxies `/api` on the same origin, so there are no CORS issues by
construction. On the server:

```bash
git clone <repo> && cd email-marketing-sass
# .env.prod: PUBLIC_URL is the server address (e.g. http://169.58.90.213),
# and change MONGO_PASSWORD + ENCRYPTION_KEY before the FIRST start.
make prod
```

Open `http://<your-ip>` — that's the app. Only port 80 is published; Mongo,
Redis, the AI service, and the api/worker replicas stay on the internal
Docker network. Scale later with `make up-prod WORKER_REPLICAS=6`.

### Host-side development (no containers for the app)

```bash
make dev                                  # infra (or: docker compose up mongo redis ai-service)
cd backend && cp .env.example .env && npm install && npm run start:dev
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api
```

## Deliverability (staying out of spam)

Built into the app:

- **One-click unsubscribe** — every email carries `List-Unsubscribe` +
  `List-Unsubscribe-Post` headers (a Gmail/Yahoo bulk-sender requirement) and
  a footer link to a public, signed unsubscribe page. Unsubscribed addresses
  land on a suppression list and are never emailed again. Set `PUBLIC_URL` so
  the links resolve.
- **Send pacing** — at most `SEND_HOURLY_LIMIT` emails per hour per SMTP
  account (default 80); extra sends are deferred automatically, so campaigns
  drip instead of burst.
- **Clean content** — multipart text+HTML, escaped HTML, and the AI writer is
  instructed to avoid spam-trigger phrasing, links, and clickbait subjects.

What only you can do (DNS on your sending domain — the single biggest factor):

1. **SPF** — TXT record authorizing your SMTP provider
   (e.g. `v=spf1 include:_spf.google.com ~all` for Gmail/Workspace).
2. **DKIM** — enable it in your provider and publish the key they give you
   (personal Gmail signs automatically; Workspace: Admin → Gmail → Authenticate).
3. **DMARC** — TXT at `_dmarc.yourdomain.com`, e.g.
   `v=DMARC1; p=quarantine; rua=mailto:you@yourdomain.com`.
4. **From alignment** — send from the mailbox you authenticated (the app warns
   when the From address can't match).
5. **Warm up** — keep volume low for the first weeks on a fresh mailbox/domain
   and raise `SEND_HOURLY_LIMIT` gradually; a burst from a cold mailbox is the
   fastest route to the spam folder.

## Configuration reference

| Variable                     | Default | Purpose                                        |
| ---------------------------- | ------- | ---------------------------------------------- |
| `APP_ROLE`                   | `all`   | `api` (HTTP only) / `worker` (queues only)     |
| `API_REPLICAS`               | `2`     | HTTP replicas behind the gateway               |
| `WORKER_REPLICAS`            | `3`     | Pipeline/send workers — scale for throughput   |
| `PIPELINE_CONCURRENCY`       | `5`     | Per-worker concurrent audit stages             |
| `SEND_CONCURRENCY`           | `3`     | Per-worker concurrent SMTP sends               |
| `MAX_RIVALS`                 | `3`     | Competitors researched per company             |
| `SCRAPE_MAX_PAGES_PER_SITE`  | `4`     | Pages read per website                         |
| `SCRAPE_MIN_DOMAIN_DELAY_MS` | `1500`  | Min gap between hits on one domain (politeness)|
| `SCRAPE_CACHE_TTL_HOURS`     | `168`   | Scraped-page cache freshness                   |
| `RESEARCH_CACHE_TTL_HOURS`   | `168`   | Company research cache freshness               |
| `GATEWAY_PORT`               | `3000`  | Published port of the nginx gateway            |
| `MONGO_URI` / `REDIS_HOST`…  | —       | Wired automatically inside compose             |

SMTP accounts and LLM API keys are **per-user, in-app** (masked in every API
response) — never environment variables.

## API reference

All routes are prefixed `/api` and scoped by an `x-session-id` header the
frontend generates automatically.

| Method | Endpoint                              | Purpose                                    |
| ------ | ------------------------------------- | ------------------------------------------ |
| POST   | `/api/campaigns`                      | Create a draft campaign                    |
| GET    | `/api/campaigns` / `/:id`             | List / detail (+ live counters)            |
| DELETE | `/api/campaigns/:id`                  | Delete campaign + leads + files            |
| POST   | `/api/campaigns/:id/uploads`          | Upload CSV/XLSX (validate/normalize/dedup) |
| GET/DELETE | `/api/campaigns/:id/uploads[/:fileId]` | List / remove uploaded files          |
| GET    | `/api/campaigns/:id/leads`            | Campaign leads with live status            |
| POST   | `/api/campaigns/:id/start`            | Run the full pipeline + send               |
| GET    | `/api/leads?page=&q=&status=`         | Paginated leads across campaigns           |
| GET    | `/api/leads/:id`                      | One lead (+ campaign, generated email)     |
| GET    | `/api/leads/:id/audit`                | **The complete structured Lead Audit**     |
| POST   | `/api/leads/:id/audit`                | (Re)run the audit for one lead — no send   |
| CRUD   | `/api/smtp-accounts…`, `/api/llm-accounts…` | Per-user sending + AI accounts       |
| GET/PUT| `/api/settings/ai` (+ `/preview`)     | Email-writing preferences + sample email   |
| GET    | `/api/health`, `/api/health/queues`   | Deep health + queue depths                 |

## Useful commands

```bash
make dev / make prod            # bring the stack up
make up-prod WORKER_REPLICAS=6  # scale workers
make logs                       # follow all logs
make down                       # stop (keeps data)
make clean                      # stop + wipe volumes
docker compose logs -f worker   # watch the pipeline work spread across replicas
```
