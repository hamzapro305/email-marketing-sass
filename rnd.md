# Email Marketing SaaS — Build Specification

**Technical Specification · R&D / Proof-of-Concept**

Desktop App (Frontend) · NestJS + TypeScript (Backend) · MongoDB · Docker
Demo Email Agent (no external API) · SMTP-ready · One-command spin-up

**Document Version 1.0 — Prepared for: Code Generation Agent**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack & Decisions](#3-technology-stack--decisions)
4. [Data Model](#4-data-model)
5. [Email Agent Specification](#5-email-agent-specification)
6. [Backend API Specification](#6-backend-api-specification)
7. [Frontend & UI Specification](#7-frontend--ui-specification)
8. [Environment & Configuration](#8-environment--configuration)
9. [Docker & Local Setup](#9-docker--local-setup)
10. [Deliverables & Acceptance Criteria](#10-deliverables--acceptance-criteria)

---

## 1. Project Overview

This document is a complete build specification for an Email Marketing SaaS proof-of-concept intended for internal demonstration. The goal is to demonstrate a working bulk email-sending workflow to stakeholders without consuming real email-sending resources or external API credits. To achieve this, the email-sending step is handled by a demo agent that simulates work with a realistic random delay, while the architecture remains ready to switch to real SMTP sending via a single environment flag.

### 1.1 Objectives

- Import leads (exported from Apollo) via CSV or XLSX file upload.
- Display all imported leads in a clean, professional table with per-row status.
- On submit, dispatch a bulk email job that processes each lead sequentially/concurrently.
- A **demo email-writer agent** simulates composing + sending each email with a random 5–10 second delay — no API calls, no resources consumed.
- Provide real SMTP configuration through environment variables, ready to activate when moving beyond the demo.
- Deliver a peak-professional UI covering every state: idle, loading, submitting, per-lead progress, success, and error.
- Everything spins up with a single Docker Compose command for the dev environment.

### 1.2 Non-Goals (for this R&D phase)

- No real AI email generation (the writer agent is a stub/simulation).
- No authentication / multi-tenancy / billing.
- No direct Apollo API integration — leads arrive as an exported CSV/XLSX file.
- No production deployment hardening (this targets a local dev demo).

> **KEY PRINCIPLE**
> The demo agent and real SMTP sender share one interface. Switching from demo to live sending must require only changing `EMAIL_MODE=demo` to `EMAIL_MODE=live` in the `.env` file — no code changes.

---

## 2. System Architecture

The system is split into three cleanly separated tiers. The desktop app is a pure frontend client that talks to the NestJS backend over HTTP/REST. The backend owns all business logic, persistence, and the email agent. MongoDB stores leads and campaign runs.

### 2.1 High-Level Flow

1. User exports leads from Apollo and saves a CSV/XLSX file.
2. User opens the desktop app and imports the file.
3. Frontend parses (or uploads) the file; backend validates and persists leads with status = `pending`.
4. The lead table renders every lead with its current status.
5. User clicks Submit / Start Campaign.
6. Backend creates a campaign (batch) and begins processing leads.
7. For each lead, the email agent runs: status `pending` → `sending` → `sent`/`failed`.
8. Frontend polls (or subscribes) for live status and updates the table in real time.
9. On completion, a success summary is shown (sent count, failed count, duration).

### 2.2 Component Responsibilities

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Desktop app (React + HeroUI) | File import, lead table, submit action, all UI states, live progress display |
| Backend | NestJS + TypeScript | REST API, validation, persistence, campaign orchestration, email agent |
| Database | MongoDB (Docker) | Store leads, campaigns, per-lead send status & timestamps |
| Email Agent | NestJS service | Demo simulation (5–10s) OR real SMTP via nodemailer, selected by env flag |
| Orchestration | Docker Compose | One-command spin-up of Mongo + backend for dev |

### 2.3 Proposed Repository Structure

```
email-marketing-saas/
├── docker-compose.yml          # one-command dev spin-up
├── README.md                   # setup + run instructions
├── backend/
│   ├── Dockerfile
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       ├── config/             # env schema + validation
│       ├── leads/              # import, list, schema, DTOs
│       ├── campaigns/          # campaign (batch) run + status
│       └── email-agent/        # demo agent + smtp service (shared interface)
└── frontend/                   # desktop app (your existing shell)
    └── src/
        ├── api/                # typed API client
        ├── components/         # LeadTable, ImportPanel, StatusBadge…
        ├── hooks/              # useCampaign, useLeads, polling
        └── pages/              # main workflow screen
```

---

## 3. Technology Stack & Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Frontend runtime | Existing desktop app (Electron) | Reuse current shell; acts as frontend only |
| UI library | HeroUI + Tailwind CSS | Professional components, built-in states, theming |
| Backend framework | NestJS (TypeScript) | Modular, DI, testable, first-class Mongo + config support |
| ORM/ODM | Mongoose (@nestjs/mongoose) | Mature MongoDB integration for Nest |
| Database | MongoDB 7 | Flexible schema for varied Apollo lead fields |
| File parsing | papaparse (CSV), xlsx / SheetJS | Robust CSV + XLSX parsing |
| Email (real) | nodemailer | Standard SMTP client, drop-in for live mode |
| Validation | class-validator + class-transformer | DTO validation on all endpoints |
| Config | @nestjs/config + Joi schema | Validated, typed environment variables |
| Containerization | Docker + Docker Compose | One-command reproducible dev env |

---

## 4. Data Model

Two primary collections: `leads` and `campaigns`. Each lead belongs to a campaign (batch) once a run starts.

### 4.1 Lead

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `email` | string | Required, validated |
| `firstName` | string | Optional |
| `lastName` | string | Optional |
| `company` | string | Optional (from Apollo) |
| `title` | string | Optional (job title) |
| `status` | enum | `pending` \| `sending` \| `sent` \| `failed` |
| `errorMessage` | string? | Populated on failure |
| `sentAt` | Date? | Timestamp when marked sent |
| `campaignId` | ObjectId? | Set when a run begins |
| `createdAt` / `updatedAt` | Date | Timestamps (auto) |

### 4.2 Campaign (Batch Run)

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `name` | string | Optional label / auto-generated |
| `status` | enum | `draft` \| `running` \| `completed` \| `failed` |
| `totalLeads` | number | Count at start |
| `sentCount` | number | Incremented on each success |
| `failedCount` | number | Incremented on each failure |
| `startedAt` / `completedAt` | Date? | Run timing |
| `createdAt` / `updatedAt` | Date | Timestamps (auto) |

### 4.3 Status Lifecycle

- **Lead:** `pending` → `sending` → `sent` (or) `failed`
- **Campaign:** `draft` → `running` → `completed` (or) `failed`

---

## 5. Email Agent Specification

The email agent is the core of the demo. It exposes a single method that both the demo simulator and the real SMTP sender implement, so the rest of the system is agnostic about which is active.

### 5.1 Shared Interface

```typescript
interface IEmailSender {
  sendToLead(lead: Lead): Promise<{ success: boolean; error?: string }>;
}
```

### 5.2 Demo Mode Behavior

- Applies when `EMAIL_MODE=demo`.
- Awaits a random delay between 5000 and 10000 ms to mimic the agent "writing + sending".
- Makes NO network / API / SMTP calls — zero resource consumption.
- Randomly fails a small share of sends (e.g. ~5%) returning a simulated error, so the **error UI states can be demonstrated** live.
- Logs each simulated send for visibility in the console.

### 5.3 Live Mode Behavior

- Applies when `EMAIL_MODE=live`.
- Uses nodemailer configured from `SMTP_*` env variables.
- Sends a real email per lead; returns success/failure from the transport.

> **IMPORTANT**
> No other part of the codebase should branch on `EMAIL_MODE`. Only the agent module reads the flag and provides the correct implementation (e.g. via a NestJS custom provider / factory).

### 5.4 Processing Strategy

For the demo, process leads with a small bounded concurrency (e.g. 3–5 in parallel) so a large list does not take excessively long, while still visibly progressing. Each lead transitions `pending` → `sending` → `sent`/`failed`, and the campaign counters update after each result. Recommended: make concurrency configurable via an env variable (e.g. `SEND_CONCURRENCY`, default 3).

---

## 6. Backend API Specification

All endpoints return JSON. Use DTO validation on every request body. Prefix routes with `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/leads/import` | Upload/parse CSV/XLSX, persist leads as `pending`, return inserted leads |
| GET | `/api/leads` | List all leads (optionally filter by `campaignId`/`status`) |
| DELETE | `/api/leads` | Clear leads (reset the demo) |
| POST | `/api/campaigns` | Create a campaign from current pending leads and start the run |
| GET | `/api/campaigns/:id` | Get campaign status + counters (for polling) |
| GET | `/api/campaigns/:id/leads` | Get leads for a campaign with live per-row status |

### 6.1 Import Endpoint Details

- Accepts `multipart/form-data` with a single file field, OR a JSON array of already-parsed rows (frontend may parse locally).
- Maps common Apollo columns (email, first name, last name, company, title) — mapping should be tolerant of header variations.
- Rejects rows without a valid email; returns a summary of imported vs skipped.

### 6.2 Real-Time Updates

For simplicity in R&D, the frontend polls `GET /api/campaigns/:id/leads` every ~1–2 seconds while status = `running`. (Optional upgrade: WebSocket / Server-Sent Events via `@nestjs/websockets` for push updates — nice-to-have, not required for the demo.)

---

## 7. Frontend & UI Specification

The desktop app is frontend-only and must feel polished and production-grade. Use HeroUI components with a consistent theme. Every interaction must have a clearly designed state — no dead ends, no unstyled spinners.

### 7.1 Primary Screen — Workflow

1. **Import panel:** drag-and-drop or file picker for CSV/XLSX, with file-name + row-count preview.
2. **Lead table:** paginated, showing email, name, company, title, and a status badge per row.
3. **Action bar:** primary Submit / Start Campaign button, disabled until leads exist.
4. **Progress header:** live counters (sent / failed / remaining) and overall progress bar during a run.
5. **Summary:** on completion, a success card with totals and elapsed time.

### 7.2 Required UI States

| State | When | UI Treatment |
|---|---|---|
| Idle / Empty | No file imported yet | Empty-state illustration + import call-to-action |
| Parsing / Loading | File being read/uploaded | Skeleton rows or spinner with label |
| Loaded | Leads listed, not yet sent | Full table + enabled Submit button |
| Submitting | Campaign starting | Button spinner, disable re-submit |
| Running (per-row) | Agent processing leads | Row badge `sending`; animated; live counters |
| Row success | Lead sent | Green "Sent" badge + timestamp |
| Row error | Lead failed | Red "Failed" badge + tooltip with error |
| Campaign success | All done, mostly sent | Success toast + summary card |
| Campaign error | Fatal/backend error | Error banner + retry option |

### 7.3 Component Checklist

- `ImportPanel` — file input, validation, preview.
- `LeadTable` — sortable/paginated, StatusBadge per row.
- `StatusBadge` — maps status enum → color + label + icon.
- `CampaignProgress` — progress bar + sent/failed/remaining counters.
- `SummaryCard` — final results, elapsed time, reset action.
- Toast/Notification system — success and error feedback.
- Global loading + error boundaries.

> **UI QUALITY BAR**
> Treat this as a portfolio-grade demo. Consistent spacing, a single accent color, smooth transitions on status changes, accessible contrast, and no unhandled state. Loading and error must look as intentional as success.

---

## 8. Environment & Configuration

All configuration is via environment variables, validated at startup with a Joi schema. Provide a committed `.env.example`; never commit real secrets.

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend HTTP port |
| `MONGO_URI` | `mongodb://root:pass@mongo:27017/ems?authSource=admin` | Mongo connection string |
| `EMAIL_MODE` | `demo` | `demo` \| `live` — selects agent implementation |
| `SEND_CONCURRENCY` | `3` | Parallel sends during a run |
| `SMTP_HOST` | `smtp.example.com` | Live mode only |
| `SMTP_PORT` | `587` | Live mode only |
| `SMTP_SECURE` | `false` | Live mode only |
| `SMTP_USER` | `user` | Live mode only |
| `SMTP_PASS` | `secret` | Live mode only |
| `SMTP_FROM` | `You <you@example.com>` | Live mode only |

---

## 9. Docker & Local Setup

The dev environment must come up with a single command. Docker Compose provisions MongoDB and the NestJS backend. The desktop frontend runs on the host and points at the backend.

### 9.1 Services

- **mongo** — MongoDB 7 with a named volume for persistence and root credentials via env.
- **backend** — builds from `./backend/Dockerfile`, depends on mongo, exposes port 3000, reads `./backend/.env`.

### 9.2 Expected Commands

```bash
# spin everything up (Mongo + backend)
docker compose up --build

# stop and remove
docker compose down

# reset the database volume (fresh demo)
docker compose down -v

# run the desktop app (host) — points at http://localhost:3000
cd frontend && npm run dev
```

> **ACCEPTANCE**
> A reviewer with only Docker installed should be able to clone the repo, copy `.env.example` to `.env`, run one compose command, start the desktop app, import a sample CSV, click Submit, and watch leads move to Sent/Failed — all without any external API keys.

---

## 10. Deliverables & Acceptance Criteria

1. Working NestJS backend with the modules and endpoints in sections 4–6.
2. Demo email agent with 5–10s random delay and simulated ~5% failure, swappable to SMTP via `EMAIL_MODE`.
3. MongoDB persistence of leads and campaigns with correct status lifecycle.
4. CSV + XLSX import with tolerant Apollo column mapping.
5. Polished HeroUI frontend covering every state in section 7.2.
6. `docker-compose.yml` providing one-command spin-up + `.env.example`.
7. README with setup, run, and reset instructions, plus a sample CSV for demo.

### 10.1 Definition of Done

- End-to-end demo runs locally with no external credentials.
- Every UI state is visibly and intentionally handled.
- Switching to live SMTP requires only editing `.env`.
- Code is typed, validated, and organized by feature module.

---

*— End of Specification —*