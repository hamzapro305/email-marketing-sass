# Email Writer — Google ADK service (multi-LLM)

A small FastAPI microservice that writes each lead's email using the
[Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/). The
NestJS backend calls it over HTTP for the **live** AI path
(`EmailWriterService.composeWithAdk`).

## Credentials — per request, not env

This service holds **no LLM credentials of its own**. The backend sends the
user's chosen LLM in every `/write` call as an `llm` object
(`{ provider, model, apiKey, apiBase, temperature }`), configured in the app
under **Settings → AI providers**. All providers (Gemini, OpenAI, Ollama) run
through ADK's LiteLLM integration, so the key/base URL travel with the request.

`POST /test` verifies one such config with a tiny generation.

If a request carries **no** `llm` (or the call fails for any reason — bad key,
model down, Ollama unreachable) the service returns a local **fallback** email
rather than failing, so a send is never blocked and the service works with zero
configuration.

`engine` in the response is the provider name (`"gemini"` / `"openai"` /
`"ollama"`) for real generation, or `"fallback"` for the local writer.

## API

| Method | Path      | Body / Result |
| ------ | --------- | ------------- |
| GET    | `/health` | `{ status, framework }` |
| POST   | `/write`  | `{ lead, campaign, settings, llm? }` → `{ subject, body, engine }` |
| POST   | `/test`   | `{ llm }` → `{ success, engine, error }` |

## Run locally

```bash
cd ai-writer
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

No `.env` needed — configure providers in the app (Settings → AI providers).

## Run in Docker (with the rest of the stack)

Wired into the root `docker-compose.yml` as the `email-writer` service, reached
by the backend at `http://email-writer:8000`:

```bash
docker compose up --build
```

For a local **Ollama** on the host, set its base URL in the app to
`http://host.docker.internal:11434` (compose already adds that host alias).
