"""Analysis agent: turn collected research into a structured audit analysis.

Receives the company profile, deterministic website signals, and scraped
competitor evidence; produces weaknesses, gaps, opportunities, comparisons,
insights, and recommendations — each grounded in the supplied material.

Deliberately company-scoped: nothing lead-specific enters the prompt, so the
backend caches one analysis per company domain and reuses it for every lead
at that company (the per-lead personalization happens in the email agent).
"""
from __future__ import annotations

import json

from ..runner import extract_json, run_agent
from ..schemas import (
    Analysis,
    AnalysisItem,
    AnalyzeRequest,
    LlmConfig,
    Recommendation,
    RivalComparison,
    truncate,
)

_INSTRUCTION = """You are a competitive-intelligence analyst producing a sales
audit of a prospect's company. You receive: the company's profile, deterministic
signals computed from its website, and scraped evidence from competitor
websites. Ground every finding in that material — each weakness/gap/opportunity
must cite its evidence. Do not invent facts. Where evidence is thin, say less.

Respond with ONLY a JSON object of this exact shape (no markdown, no fences):
{
  "summary": "4-5 sentence executive summary of the audit",
  "weaknesses": [{"title": "...", "detail": "...", "evidence": "what supports this"}],
  "gaps": [{"title": "...", "detail": "...", "evidence": "..."}],
  "opportunities": [{"title": "...", "detail": "...", "evidence": "..."}],
  "comparisons": [{"rivalName": "...", "leadAdvantages": ["..."],
                   "rivalAdvantages": ["..."], "notes": "..."}],
  "insights": ["short standalone insight strings"],
  "recommendations": [{"title": "...", "detail": "...",
                       "priority": "high|medium|low"}]
}

"weaknesses" = problems visible in the company's own presence.
"gaps" = things competitors demonstrably do that this company does not.
"opportunities" = concrete improvements implied by the weaknesses/gaps.
Keep lists focused: at most 5 items each."""


def _prompt(req: AnalyzeRequest) -> str:
    lines = [
        f"Industry: {req.company.industry or 'unknown'} | "
        f"Location: {req.company.location or 'unknown'}",
        "",
        "Company profile:",
        truncate(json.dumps(req.company.profile, ensure_ascii=False), 2500),
        "",
        "Deterministic website signals (computed, factual):",
        truncate(json.dumps(req.company.signals, ensure_ascii=False), 1200)
        if req.company.signals
        else "(website could not be scraped)",
        "",
        "Excerpts from the company's website:",
    ]
    for excerpt in req.company.excerpts[:3]:
        lines.append(f"- {truncate(excerpt, 1200)}")
    if not req.company.excerpts:
        lines.append("(none)")

    lines += ["", f"Competitors ({len(req.rivals)}):"]
    for rival in req.rivals:
        lines += [
            f"--- {rival.name} ({rival.website})",
            f"Summary: {truncate(rival.summary, 400)}",
            "Signals: "
            + (
                truncate(json.dumps(rival.signals, ensure_ascii=False), 800)
                if rival.signals
                else "(site not scraped)"
            ),
        ]
        for excerpt in rival.excerpts[:2]:
            lines.append(f"Excerpt: {truncate(excerpt, 700)}")
    if not req.rivals:
        lines.append("(no competitors could be verified)")
    return "\n".join(lines)


def _items(raw: object, limit: int = 5) -> list[AnalysisItem]:
    out: list[AnalysisItem] = []
    if isinstance(raw, list):
        for item in raw[:limit]:
            if isinstance(item, dict):
                out.append(
                    AnalysisItem(
                        title=str(item.get("title") or "").strip(),
                        detail=str(item.get("detail") or "").strip(),
                        evidence=str(item.get("evidence") or "").strip(),
                    )
                )
    return [i for i in out if i.title or i.detail]


async def analyze(req: AnalyzeRequest, cfg: LlmConfig) -> Analysis:
    text = await run_agent(
        name="audit_analysis",
        description="Produces structured competitive audits from research data.",
        instruction=_INSTRUCTION,
        prompt=_prompt(req),
        cfg=cfg,
    )
    data = extract_json(text)
    if not isinstance(data, dict):
        raise ValueError("Analysis agent returned non-object JSON")

    comparisons = []
    for item in data.get("comparisons") or []:
        if isinstance(item, dict):
            comparisons.append(
                RivalComparison(
                    rivalName=str(item.get("rivalName") or "").strip(),
                    leadAdvantages=[str(x) for x in (item.get("leadAdvantages") or []) if x][:5],
                    rivalAdvantages=[str(x) for x in (item.get("rivalAdvantages") or []) if x][:5],
                    notes=str(item.get("notes") or "").strip(),
                )
            )

    recommendations = []
    for item in data.get("recommendations") or []:
        if isinstance(item, dict):
            priority = str(item.get("priority") or "medium").lower()
            recommendations.append(
                Recommendation(
                    title=str(item.get("title") or "").strip(),
                    detail=str(item.get("detail") or "").strip(),
                    priority=priority if priority in ("high", "medium", "low") else "medium",
                )
            )

    return Analysis(
        summary=str(data.get("summary") or ""),
        weaknesses=_items(data.get("weaknesses")),
        gaps=_items(data.get("gaps")),
        opportunities=_items(data.get("opportunities")),
        comparisons=comparisons[:5],
        insights=[str(x) for x in (data.get("insights") or []) if x][:6],
        recommendations=recommendations[:5],
    )
