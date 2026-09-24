# AI Service (Google ADK)

The AI brain of the lead-audit pipeline: a FastAPI service running one-shot
[Google ADK](https://google.github.io/adk-docs/) agents. AI is used **only
where it adds value** — summarization, competitor discovery, analysis, and
copywriting. Everything deterministic (scraping, parsing, validation, signal
computation, dedup) lives in the Node backend.

## Architecture

```
app/
├── main.py       # FastAPI endpoints; agent-vs-fallback dispatch
├── schemas.py    # pydantic contracts (mirrors backend/src/ai/ai.types.ts)
├── llm.py        # per-request LLM construction (LiteLLM via ADK)
├── runner.py     # one-shot ADK agent runner + robust JSON extraction
├── fallbacks.py  # deterministic no-LLM fallbacks for every endpoint
└── agents/
    ├── research.py   # summarize a company from its scraped pages
    ├── rivals.py     # propose real competitors (backend verifies them)
    ├── analysis.py   # structured audit: weaknesses/gaps/opportunities/…
    └── email.py      # personalized email grounded in the audit findings
```

Each agent module owns exactly its prompt + parsing; `runner.py` owns the ADK
plumbing. Adding a capability = one agent module + one endpoint + one fallback.

## Endpoints

| Method | Path                  | Purpose                                      |
| ------ | --------------------- | -------------------------------------------- |
| GET    | `/health`             | Readiness probe                              |
| POST   | `/research/summarize` | Structured company profile from scraped pages|
| POST   | `/rivals/discover`    | Propose direct competitors                   |
| POST   | `/audit/analyze`      | Full structured audit analysis               |
| POST   | `/email/write`        | Personalized outreach email                  |
| POST   | `/llm/test`           | Verify a user's LLM config                   |

## Credentials

The service holds **no credentials**. The LLM (provider, model, API key/base,
temperature) arrives on each request from the user's in-app *AI providers*
account (Gemini, OpenAI, Kimi, or Ollama — all via ADK's LiteLLM integration).
Without one, every endpoint returns a deterministic fallback derived from the
request's own scraped data — so the pipeline always completes, and its degraded
output is still grounded in real research rather than invented.

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
