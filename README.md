# Email Marketing SaaS — Demo

A proof-of-concept bulk email-sending workflow. Import leads (exported from
Apollo) via CSV/XLSX, review them in a polished table, start a campaign, and
watch each lead move from **pending → sending → sent/failed** in real time.

The email step is handled by a **demo agent** that simulates composing + sending
with a random 5–10s delay and a ~5% simulated failure rate — **no external API
calls, no resources consumed**. Switching to real SMTP sending requires only
changing one environment flag (`EMAIL_MODE=demo` → `EMAIL_MODE=live`).

## Stack

| Layer        | Tech                                                     |
| ------------ | -------------------------------------------------------- |
| Frontend     | Electron + React + TypeScript + **shadcn/ui** + Tailwind |
| Backend      | NestJS + TypeScript (REST API **+** BullMQ worker)       |
| Database     | MongoDB 7 (Mongoose) — source of truth                   |
| Queue        | Redis 7 + **BullMQ** — distributes sends across replicas |
| Load balancer| **nginx** — single entry point, round-robins replicas    |
| AI writer    | **Google ADK** (Python/FastAPI sidecar) + Gemini; local demo fallback |
| Email        | Demo agent (default) / nodemailer SMTP (live)            |
| Dev infra    | Docker Compose — nginx + N backends + Redis + Mongo      |

### How the parallel processing works

A campaign is **not** processed inside the container that receives the "start"
request. Instead:

```
             ┌─────────────────────────── nginx (:3000, the only exposed port)
             │ round-robins the REST API across replicas
   ┌─────────┴──────────┐
   ▼         ▼          ▼
backend-1  backend-2  backend-3      each is BOTH an API server AND a BullMQ worker
   │  \       │       /  │
   │   \      │      /   │
   ▼    ▼     ▼     ▼    ▼
        Redis (shared job queue)  ◄── "start campaign" enqueues 1 job per lead
        Mongo (leads / files / campaigns — source of truth)
```

When you click **Start**, the backend enqueues **one job per lead** onto a shared
Redis/BullMQ queue and returns immediately. **Every** backend replica is a worker
on that queue, so Redis hands jobs to whichever replicas are free — a 10k-lead
campaign is processed in parallel across **all** containers. Total throughput ≈
`replicas × SEND_CONCURRENCY`. Add replicas (`--scale backend=N`) for more.

> nginx alone would **not** parallelize the work — it only balances HTTP traffic,
> so a single container would still run the whole campaign. The Redis queue is
> what actually spreads the sending across containers.

You **create a campaign** (name + subject + description), then upload one or more
lead files **into that campaign** — leads are stored in Mongo **first** as
`pending`. You can review and **delete** any file (removing its not-yet-sent
leads) before starting, and add more leads later (any time except mid-run).
**Start** enqueues the campaign's pending leads; the queue is decoupled from the
UI, so processing continues even if you close the app. Everything is scoped by an
`x-session-id` header the app generates once and stores locally.

The UI is built on [shadcn/ui](https://ui.shadcn.com) — components live in
`frontend/src/components/ui` (Radix primitives + Tailwind + CSS-variable design
tokens), so the dashboard is easy to extend. Add more with
`npx shadcn@latest add <component>` (config is in `frontend/components.json`).

## Repository layout

```
.
├── Makefile               # `make dev` / `make prod` — writes .env, brings stack up
├── docker-compose.yml     # base: nginx + backend×N + redis + mongo + email-writer
├── docker-compose.dev.yml # dev override  — exposes Mongo/Redis, 1 backend
├── docker-compose.prod.yml# prod override — only nginx exposed, restart:always
├── .env.dev / .env.prod   # per-environment config; Makefile copies one to .env
├── nginx/nginx.conf       # load balancer → round-robins backend replicas
├── ai-writer/             # Google ADK (FastAPI) email-writer sidecar (live AI)
├── sample-leads.csv       # 15 demo leads for the walkthrough
├── backend/               # NestJS API + BullMQ worker + demo/SMTP email agent
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── common/        # session-id header decorator
│       ├── config/        # env schema (Joi) + typed config
│       ├── leads/         # lead schema + parser + read-only lead views
│       ├── campaigns/     # campaign CRUD, file upload, start, BullMQ send.processor
│       └── email-agent/   # IEmailSender: demo + SMTP (chosen by env)
└── frontend/              # Electron desktop app (frontend only)
    ├── components.json    # shadcn/ui config
    └── src/
        ├── .env.example   # VITE_API_URL — backend URL the app talks to
        ├── api/           # typed API client + React Query client/keys + session id
        ├── hooks/         # React Query hooks: useCampaigns, useCampaignDetail, …
        ├── lib/           # cn() + formatting + in-app router (nav.ts)
        ├── components/
        │   ├── ui/        # shadcn primitives (button, card, table, dialog, …)
        │   └── layout/    # Sidebar, Header (dashboard shell)
        └── pages/         # Campaigns, CampaignDetail, Leads, LeadDetail
```

## Prerequisites

- **Docker** — runs the full stack (nginx + backends + Redis + Mongo).
- **Node.js 20+** — runs the desktop frontend (and the backend if run on host).

## Option A — full parallel stack in Docker (recommended)

Two profiles, driven by a Makefile. Each run regenerates `.env` from the
matching profile file (`.env.dev` / `.env.prod`), so `.env` always matches the
environment you asked for:

```bash
make dev      # DEV : nginx :3000 + 1 backend, Mongo/Redis exposed for tooling
make prod     # PROD: nginx :80 only, 3 backends, datastores NOT exposed
```

Under the hood these compose the base file with an override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml  up --build -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Scale the worker pool on demand:

```bash
make up-prod BACKEND_REPLICAS=5   # more replicas = more throughput
```

**Port exposure:** in **prod only nginx is published** — Mongo (27017) and Redis
(6379) stay on the internal network. The dev override republishes them purely
for local debugging.

Verify it's healthy (through nginx):

```bash
curl http://localhost:3000/api/health
# {"status":"ok","emailMode":"demo",...}
```

Then start the desktop app (see below). Watch the work spread across replicas:

```bash
docker compose logs -f backend | grep sent   # each [instance-id] is a container
```

## Option B — infra in Docker, backend on the host (single worker)

Useful for backend development. Runs one backend process (no cross-container
parallelism, but the queue still works):

```bash
make dev                             # or: docker compose ... up -d mongo redis
cd backend
cp .env.example .env                 # first time only (localhost Mongo + Redis)
npm install                          # first time only
npm run start:dev                    # NestJS API on http://localhost:3000
```

## Start the desktop app (host)

```bash
cd frontend
cp .env.example .env   # first time only — sets VITE_API_URL (the backend URL)
npm install            # first time only
npm run dev            # launches the Electron desktop app
```

The backend URL is read from **`frontend/.env`** (`VITE_API_URL`), defaulting to
`http://localhost:3000/api`. After deploying the containers to a server, point
the app at it by setting e.g. `VITE_API_URL=https://mail.example.com/api` and
rebuilding (`npm run make`) — no code changes needed. The app generates its own
session id on first launch.

## 4. Run the demo

The app has two sections in the sidebar — **Campaigns** and **Leads**.

1. On **Campaigns**, click **New campaign** and enter a name (+ optional subject
   and description). You land on the campaign's detail page.
2. Upload **`sample-leads.csv`** (drag-and-drop or click to browse) to add leads
   to this campaign. Upload more files if you like; **delete** any you don't want.
3. Review the leads — each starts as **Pending**.
4. Click **Start campaign**. Its pending leads are enqueued and processed in
   parallel across every backend replica. **You can close the app** — the backend
   keeps processing the queue; reopen to see the results.
5. Watch rows move to **Sending → Sent / Failed** live, with progress counters
   updating. Hover a **Failed** badge to see the error.
6. On completion, a **summary card** shows totals + elapsed time. You can add
   more leads and re-run, or open any lead / campaign for its detail page.
7. The **Leads** section lists every lead across all campaigns, with a
   **Campaign** column; click a row for the lead's detail page.

## Useful commands

```bash
make dev                       # DEV stack  (nginx :3000, Mongo/Redis exposed)
make prod                      # PROD stack (nginx only)
make up-prod BACKEND_REPLICAS=5   # scale the worker pool
make down                      # stop + remove containers (keeps data)
make clean                     # stop + WIPE data (fresh demo)
make logs                      # follow logs from all services
make help                      # list every target
```

## AI email writer (demo)

Each lead's email is composed by an **AI writer service** before it's sent.
Configure it under **Settings → AI email writer** (name/subject/tone/instructions,
model, API key, temperature). It mirrors the email-sender's demo/live split:

- **`demo` (default)** — writes personalized emails **locally, no API calls or
  key** (`backend/src/email-writer/demo-email-writer.ts`). Merge tags like
  `{{firstName}}`/`{{company}}` are rendered; tone changes the copy.
- **`live`** — calls the **Google ADK Python sidecar** (`ai-writer/`, a FastAPI
  service) over HTTP (`email-writer.service.ts → composeWithAdk`). The sidecar
  supports **Google (Gemini), OpenAI, or a local Ollama** — chosen purely from
  its own environment, and **only the provider whose env is configured runs**
  (priority: Google → OpenAI → Ollama, or force one with `LLM_PROVIDER`). With
  none configured it returns its own local fallback — so live mode works even
  without any key. See [`ai-writer/README.md`](ai-writer/README.md).

  ```bash
  # pick ONE:
  GOOGLE_API_KEY=your-key docker compose up --build          # Gemini
  OPENAI_API_KEY=your-key docker compose up --build           # OpenAI
  OLLAMA_MODEL=llama3.1 docker compose up --build              # local Ollama
  ```
  Model per provider comes from env too (`GOOGLE_MODEL`, `OPENAI_MODEL`,
  `OLLAMA_MODEL`). The backend reaches the sidecar at `http://email-writer:8000`
  (compose) or `AI_WRITER_URL` on the host. If the sidecar or chosen provider is
  unreachable, it falls back to a local writer so a send is never blocked.

The generated email is stored on each lead and shown on its detail page. Use the
**Preview email** button in Settings to test your configuration on a sample lead.
Settings are per-session (stored in Mongo, keyed by the `x-session-id` header).

## Switching to real SMTP (live mode)

No code changes required. In `backend/.env`:

```dotenv
EMAIL_MODE=live
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-pass
SMTP_FROM=You <you@example.com>
```

Then `docker compose up --build`. Only the email-agent module reads
`EMAIL_MODE`; the rest of the system is unchanged. In live mode the SMTP_\*
variables are **required** and validated at startup.

## Configuration reference

| Variable           | Default              | Purpose                                          |
| ------------------ | -------------------- | ------------------------------------------------ |
| `PORT`             | `3000`               | Backend HTTP port                                |
| `MONGO_URI`        | (see `.env.example`) | Mongo connection string                          |
| `REDIS_HOST`       | `localhost`          | Redis host (compose overrides to `redis`)        |
| `REDIS_PORT`       | `6379`               | Redis port                                       |
| `EMAIL_MODE`       | `demo`               | `demo` (simulated) or `live` (real SMTP)         |
| `SEND_CONCURRENCY` | `25`                 | **Per-replica** worker concurrency               |
| `INSTANCE_ID`      | container hostname   | Label shown in logs to identify the replica      |
| `CORS_ORIGIN`      | `*`                  | Allowed frontend origin(s)                       |
| `SMTP_*`           | —                    | Live mode only (required when `live`)            |

Total parallelism ≈ `replicas × SEND_CONCURRENCY` (e.g. 3 × 25 = 75 concurrent
sends).

## API reference

All routes are prefixed with `/api` and return JSON. Every request must send an
**`x-session-id`** header (the frontend generates and stores one automatically);
requests without it get `400`.

| Method | Endpoint                            | Purpose                                          |
| ------ | ----------------------------------- | ------------------------------------------------ |
| POST   | `/api/campaigns`                    | Create a draft campaign (name/subject/description) |
| GET    | `/api/campaigns`                    | List the session's campaigns (newest first)      |
| GET    | `/api/campaigns/:id`                | Campaign detail + counters (polled)              |
| DELETE | `/api/campaigns/:id`                | Delete a campaign and its leads/files            |
| POST   | `/api/campaigns/:id/uploads`        | Upload a CSV/XLSX (field `file`) into the campaign |
| GET    | `/api/campaigns/:id/uploads`        | List the campaign's files (+ pending counts)     |
| DELETE | `/api/campaigns/:id/uploads/:fileId`| Delete a file and its not-yet-sent leads         |
| GET    | `/api/campaigns/:id/leads`          | Campaign leads with live per-row status          |
| POST   | `/api/campaigns/:id/start`          | Start/re-run — enqueues the campaign's pending leads |
| GET    | `/api/leads`                        | All leads across campaigns (`?campaignId=`/`?status=`) |
| GET    | `/api/leads/:id`                    | One lead with its campaign name + AI email       |
| GET    | `/api/settings/ai`                  | AI writer settings (API key masked)              |
| PUT    | `/api/settings/ai`                  | Update AI writer settings                        |
| POST   | `/api/settings/ai/preview`          | Generate a sample email with current settings    |
| GET    | `/api/health`                       | Health + active email mode                        |

The desktop app has three sidebar sections: **Campaigns** (list → campaign
detail: upload, start, live progress), **Leads** (all leads with a campaign
column → lead detail, incl. the AI-written email), and **Settings** (AI email
writer configuration + preview).

Column mapping on import is tolerant of header variations (e.g. `Email`,
`Email Address`, `Work Email`; `First Name`, `first_name`, `Given Name`). Rows
without a valid email are skipped and reported in the upload summary.

Failed sends are retried up to **3×** with exponential backoff (BullMQ); a lead
is only counted as `failed` after the final attempt.
