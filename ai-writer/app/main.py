"""FastAPI wrapper around the email writer (Google ADK).

Endpoints:
  GET  /health  → readiness
  POST /write   → { subject, body, engine } for one lead
  POST /test    → verify a user's LLM config

The LLM (provider, model, key/base, temperature) is supplied per request by the
backend from the user's in-app settings — this service holds NO credentials of
its own. If a request carries no LLM config (or a call fails) it returns a local
fallback email so the service is always functional.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from . import agent
from .fallback import write_fallback
from .schemas import TestRequest, TestResponse, WriteRequest, WriteResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-writer")

app = FastAPI(title="Email Writer (Google ADK)", version="2.0.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "framework": "google-adk"}


@app.post("/write", response_model=WriteResponse)
async def write(req: WriteRequest) -> WriteResponse:
    # The user's configured LLM (Settings → AI providers) is sent per request.
    if req.llm and req.llm.provider:
        try:
            return await agent.write_with_config(req, req.llm)
        except Exception as exc:  # noqa: BLE001 — never fail the send over this
            logger.warning(
                "Configured LLM (%s/%s) failed, using fallback: %s",
                req.llm.provider,
                req.llm.model,
                exc,
            )
    else:
        logger.info("No LLM in request — using local fallback writer.")
    return write_fallback(req)


@app.post("/test", response_model=TestResponse)
async def test(req: TestRequest) -> TestResponse:
    """Verify a user's LLM config by doing a tiny generation."""
    try:
        await agent.test_config(req.llm)
        return TestResponse(
            success=True,
            engine=agent._normalize_provider(req.llm.provider),
            error="",
        )
    except Exception as exc:  # noqa: BLE001 — report the failure to the UI
        logger.warning("LLM test failed (%s): %s", req.llm.provider, exc)
        return TestResponse(success=False, error=str(exc))
