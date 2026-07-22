# Email Marketing SaaS — Demo

A proof-of-concept bulk email-sending workflow. Import leads (exported from
Apollo) via CSV/XLSX, review them in a polished table, start a campaign, and
watch each lead move from **pending → sending → sent/failed** in real time.

The email step is handled by a **demo agent** that simulates composing + sending
with a random 5–10s delay and a ~5% simulated failure rate — **no external API
calls, no resources consumed**. Switching to real SMTP sending requires only
changing one environment flag (`EMAIL_MODE=demo` → `EMAIL_MODE=live`).

## Stack

| Layer     | Tech                                                     |
| --------- | -------------------------------------------------------- |
| Frontend  | Electron + React + TypeScript + **shadcn/ui** + Tailwind |
| Backend   | NestJS + TypeScript                                      |
| Database  | MongoDB 7 (Mongoose)                                     |
| Email     | Demo agent (default) / nodemailer SMTP (live)            |
| Dev infra | Docker (MongoDB); backend + frontend run on the host     |

The UI is built on [shadcn/ui](https://ui.shadcn.com) — components live in
`frontend/src/components/ui` (Radix primitives + Tailwind + CSS-variable design
tokens), so the dashboard is easy to extend. Add more with
`npx shadcn@latest add <component>` (config is in `frontend/components.json`).

## Repository layout

```
.
├── docker-compose.yml     # MongoDB service (+ optional dockerized backend)
├── sample-leads.csv       # 15 demo leads for the walkthrough
├── backend/               # NestJS API + demo/SMTP email agent
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
│       ├── config/        # env schema (Joi) + typed config
│       ├── leads/         # import (CSV/XLSX), list, clear
│       ├── campaigns/     # campaign run + orchestration + status
│       └── email-agent/   # IEmailSender: demo + SMTP (chosen by env)
└── frontend/              # Electron desktop app (frontend only)
    ├── components.json    # shadcn/ui config
    └── src/
        ├── api/           # typed API client + local file parser
        ├── hooks/         # useLeads, useCampaign, useHealth, useTheme
        ├── lib/           # cn() + formatting helpers
        ├── components/
        │   ├── ui/        # shadcn primitives (button, card, table, …)
        │   └── layout/    # Sidebar, Header (dashboard shell)
        └── pages/         # WorkflowPage (the single workflow screen)
```

## Prerequisites

- **Docker** — runs MongoDB.
- **Node.js 20+** — runs the backend and the desktop frontend.

## 1. Start MongoDB (Docker)

```bash
# from the repo root
docker compose up -d mongo     # MongoDB on localhost:27017
```

## 2. Start the backend (host)

```bash
cd backend
cp .env.example .env    # first time only (defaults to localhost Mongo)
npm install             # first time only
npm run start:dev       # NestJS API on http://localhost:3000
```

Verify it's healthy:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","emailMode":"demo",...}
```

## 3. Start the desktop app (host)

```bash
cd frontend
npm install        # first time only
npm run dev        # launches the Electron desktop app
```

The app points at `http://localhost:3000` by default.

> **Prefer everything in Docker?** `docker compose up --build` runs Mongo **and**
> the backend together (the compose file points the backend at the `mongo`
> service automatically). Then just run the frontend on the host.

## 4. Run the demo

1. Import **`sample-leads.csv`** (drag-and-drop or click to browse).
2. Review the leads in the table — each starts as **Pending**.
3. Click **Start campaign**.
4. Watch rows move to **Sending → Sent / Failed** live (concurrency 3), with
   progress counters updating. Hover a **Failed** badge to see the error.
5. On completion, a **summary card** shows totals + elapsed time.
6. **Reset demo** (or **Start a new campaign**) clears everything for another run.

## Useful commands

```bash
docker compose up -d mongo    # start only MongoDB (common workflow)
docker compose up --build     # start Mongo + backend together
docker compose down           # stop + remove containers
docker compose down -v        # stop + WIPE the database (fresh demo)
docker compose logs -f mongo
```

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

| Variable           | Default              | Purpose                                   |
| ------------------ | -------------------- | ----------------------------------------- |
| `PORT`             | `3000`               | Backend HTTP port                         |
| `MONGO_URI`        | (see `.env.example`) | Mongo connection string                   |
| `EMAIL_MODE`       | `demo`               | `demo` (simulated) or `live` (real SMTP)  |
| `SEND_CONCURRENCY` | `3`                  | Leads processed in parallel during a run  |
| `CORS_ORIGIN`      | `*`                  | Allowed frontend origin(s)                |
| `SMTP_*`           | —                    | Live mode only (required when `live`)     |

## API reference

All routes are prefixed with `/api` and return JSON.

| Method | Endpoint                | Purpose                                            |
| ------ | ----------------------- | -------------------------------------------------- |
| POST   | `/api/leads/import`     | Upload CSV/XLSX **or** POST `{leads:[…]}` JSON      |
| GET    | `/api/leads`            | List leads (`?campaignId=` / `?status=` filters)   |
| DELETE | `/api/leads`            | Clear all leads (reset the demo)                   |
| POST   | `/api/campaigns`        | Create a campaign from pending leads + start it    |
| GET    | `/api/campaigns/:id`    | Campaign status + counters (polled)                |
| GET    | `/api/campaigns/:id/leads` | Campaign leads with live per-row status         |
| GET    | `/api/health`           | Health + active email mode                          |

Column mapping on import is tolerant of header variations (e.g. `Email`,
`Email Address`, `Work Email`; `First Name`, `first_name`, `Given Name`). Rows
without a valid email are skipped and reported in the import summary.
