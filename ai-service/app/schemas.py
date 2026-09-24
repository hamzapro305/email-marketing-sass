"""Request/response contracts shared with the NestJS backend.

These mirror `backend/src/ai/ai.types.ts`. The service holds no credentials —
every request may carry the user's LLM config (`llm`); without one, endpoints
return deterministic fallbacks built from the request's own data.
"""
from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class LlmConfig(BaseModel):
    """The user's chosen LLM, sent per request by the backend."""

    provider: str = ""  # gemini | openai | kimi | ollama
    model: str = ""
    apiKey: str = ""
    apiBase: str = ""
    temperature: float = 0.7


class Usage(BaseModel):
    """What one model call cost — surfaced in the audit trace."""

    model: str = ""
    inputTokens: int = 0
    outputTokens: int = 0
    # Subset of outputTokens spent on hidden reasoning (when reported).
    reasoningTokens: int = 0
    ms: int = 0


class Lead(BaseModel):
    email: str = ""
    firstName: str = ""
    lastName: str = ""
    company: str = ""
    title: str = ""
    website: str = ""
    industry: str = ""
    location: str = ""


class Campaign(BaseModel):
    name: str = ""
    description: str = ""


class WriterSettings(BaseModel):
    """The user's email-writing preferences (Settings → AI email writer)."""

    model: str = ""
    temperature: float = 0.7
    tone: str = "professional"
    language: str = "English"
    wordLimit: int = 120
    callToAction: str = "a quick 15-minute call"
    senderName: str = ""
    senderRole: str = ""
    senderCompany: str = ""
    instructions: str = ""

    model_config = {"extra": "ignore"}


class WirePage(BaseModel):
    url: str = ""
    title: str = ""
    description: str = ""
    text: str = ""


# ── /research/brief (profile + rivals in ONE model call) ─────


class CompanyRef(BaseModel):
    name: str = ""
    domain: str = ""
    website: str = ""


class BriefRequest(BaseModel):
    company: CompanyRef = Field(default_factory=CompanyRef)
    industry: str = ""
    location: str = ""
    pages: List[WirePage] = Field(default_factory=list)
    signals: Optional[dict] = None
    maxRivals: int = 3
    llm: Optional[LlmConfig] = None


class CompanyProfileOut(BaseModel):
    name: str = ""
    summary: str = ""
    products: List[str] = Field(default_factory=list)
    services: List[str] = Field(default_factory=list)
    targetCustomers: str = ""
    positioning: str = ""


class RivalOut(BaseModel):
    name: str = ""
    website: str = ""
    reason: str = ""


class BriefResponse(BaseModel):
    profile: CompanyProfileOut
    rivals: List[RivalOut]
    engine: str
    # Why the fallback was used (empty when the LLM answered).
    error: str = ""
    usage: Optional[Usage] = None


# ── /audit/analyze ────────────────────────────────────────────
# Company-scoped on purpose: nothing lead-specific enters the prompt, so the
# backend can cache one analysis per company domain and reuse it for every
# lead at that company.


class CompanyEvidence(BaseModel):
    profile: dict = Field(default_factory=dict)
    industry: str = ""
    location: str = ""
    signals: Optional[dict] = None
    excerpts: List[str] = Field(default_factory=list)


class RivalEvidence(BaseModel):
    name: str = ""
    website: str = ""
    summary: str = ""
    signals: Optional[dict] = None
    excerpts: List[str] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    company: CompanyEvidence = Field(default_factory=CompanyEvidence)
    rivals: List[RivalEvidence] = Field(default_factory=list)
    llm: Optional[LlmConfig] = None


class AnalysisItem(BaseModel):
    title: str = ""
    detail: str = ""
    evidence: str = ""


class RivalComparison(BaseModel):
    rivalName: str = ""
    leadAdvantages: List[str] = Field(default_factory=list)
    rivalAdvantages: List[str] = Field(default_factory=list)
    notes: str = ""


class Recommendation(BaseModel):
    title: str = ""
    detail: str = ""
    priority: Literal["high", "medium", "low"] = "medium"


class Analysis(BaseModel):
    summary: str = ""
    weaknesses: List[AnalysisItem] = Field(default_factory=list)
    gaps: List[AnalysisItem] = Field(default_factory=list)
    opportunities: List[AnalysisItem] = Field(default_factory=list)
    comparisons: List[RivalComparison] = Field(default_factory=list)
    insights: List[str] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    analysis: Analysis
    engine: str
    error: str = ""
    usage: Optional[Usage] = None


# ── /email/write ──────────────────────────────────────────────


class AuditContext(BaseModel):
    """The audit distilled to what the writer can cite."""

    companySummary: str = ""
    signals: Optional[dict] = None
    weaknesses: List[AnalysisItem] = Field(default_factory=list)
    opportunities: List[AnalysisItem] = Field(default_factory=list)
    rivalNames: List[str] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
    insights: List[str] = Field(default_factory=list)


class WriteEmailRequest(BaseModel):
    lead: Lead = Field(default_factory=Lead)
    campaign: Campaign = Field(default_factory=Campaign)
    settings: WriterSettings = Field(default_factory=WriterSettings)
    audit: Optional[AuditContext] = None
    llm: Optional[LlmConfig] = None


class WriteEmailResponse(BaseModel):
    subject: str
    body: str
    engine: str
    error: str = ""
    usage: Optional[Usage] = None


# ── /llm/test ─────────────────────────────────────────────────


class TestRequest(BaseModel):
    llm: LlmConfig


class TestResponse(BaseModel):
    success: bool
    engine: str = ""
    error: str = ""


def truncate(value: Any, limit: int) -> str:
    """Bound arbitrary text before it enters a prompt."""
    text = str(value or "")
    return text if len(text) <= limit else text[:limit] + "…"
