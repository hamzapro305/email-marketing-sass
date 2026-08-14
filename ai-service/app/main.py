"""AI service (Google ADK) — FastAPI entry point.

One endpoint per pipeline capability, each with the same contract:
LLM configured on the request → run the matching agent; no LLM (or the agent
fails) → return a deterministic fallback built from the request's own data.
The service never blocks the pipeline and holds no credentials of its own.

Call efficiency is part of the contract: `/research/brief` returns the company
profile AND its rivals from a single model call, and `/audit/analyze` is
company-scoped so the backend can cache one analysis per domain. For a
campaign with N leads across D companies the total model spend is
2×D (brief + analysis) + N (emails).

  GET  /health          → readiness
  POST /research/brief  → company profile + proposed rivals (one model call)
  POST /audit/analyze   → structured audit analysis (company-scoped, cacheable)
  POST /email/write     → personalized email grounded in the audit
  POST /llm/test        → verify a user's LLM config
"""
from __future__ import annotations

import logging

from fastapi import FastAPI

from . import fallbacks
from .agents import analysis as analysis_agent
from .agents import brief as brief_agent
from .agents import email as email_agent
from .llm import normalize_provider
from .runner import run_agent
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    BriefRequest,
    BriefResponse,
    LlmConfig,
    TestRequest,
    TestResponse,
    WriteEmailRequest,
    WriteEmailResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ai-service")

app = FastAPI(title="AI Service (Google ADK)", version="3.1.0")


def _usable(llm: LlmConfig | None) -> bool:
    return bool(llm and llm.provider)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "framework": "google-adk"}


@app.post("/research/brief", response_model=BriefResponse)
async def research_brief(req: BriefRequest) -> BriefResponse:
    if _usable(req.llm):
        try:
            profile, rivals = await brief_agent.brief(req, req.llm)
            return BriefResponse(
                profile=profile,
                rivals=rivals,
                engine=normalize_provider(req.llm.provider),
            )
        except Exception as exc:  # noqa: BLE001 — degrade, never block
            logger.warning("Brief agent failed (%s): %s", req.company.domain, exc)
    # No LLM → grounded profile from scraped pages, and NO invented rivals.
    return BriefResponse(
        profile=fallbacks.fallback_brief(req), rivals=[], engine="fallback"
    )


@app.post("/audit/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if _usable(req.llm):
        try:
            result = await analysis_agent.analyze(req, req.llm)
            return AnalyzeResponse(
                analysis=result, engine=normalize_provider(req.llm.provider)
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Analysis agent failed (%s): %s",
                req.company.profile.get("name", "?"),
                exc,
            )
    return AnalyzeResponse(analysis=fallbacks.fallback_analysis(req), engine="fallback")


@app.post("/email/write", response_model=WriteEmailResponse)
async def write(req: WriteEmailRequest) -> WriteEmailResponse:
    if _usable(req.llm):
        try:
            subject, body = await email_agent.write(req, req.llm)
            return WriteEmailResponse(
                subject=subject, body=body, engine=normalize_provider(req.llm.provider)
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Email agent failed (%s): %s", req.lead.email, exc)
    return fallbacks.fallback_email(req)


@app.post("/llm/test", response_model=TestResponse)
async def test(req: TestRequest) -> TestResponse:
    """Verify a user's LLM config with a tiny generation."""
    try:
        await run_agent(
            name="connectivity_check",
            description="Connectivity check.",
            instruction="You are a connectivity check. Reply with a single lowercase word.",
            prompt="Reply with exactly: ok",
            cfg=req.llm,
        )
        return TestResponse(success=True, engine=normalize_provider(req.llm.provider))
    except Exception as exc:  # noqa: BLE001 — report the failure to the UI
        logger.warning("LLM test failed (%s): %s", req.llm.provider, exc)
        return TestResponse(success=False, error=str(exc))
