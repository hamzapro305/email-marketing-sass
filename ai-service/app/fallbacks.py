"""Deterministic no-LLM fallbacks for every endpoint.

Used when a request carries no LLM config, or when the configured LLM fails.
Everything here is derived from the request's own (scraped) data — nothing is
invented — so the service is always functional with zero credentials and its
degraded output is still truthful.
"""
from __future__ import annotations

import re

from .schemas import (
    Analysis,
    AnalysisItem,
    AnalyzeRequest,
    BriefRequest,
    CompanyProfileOut,
    Recommendation,
    RivalComparison,
    WriteEmailRequest,
    WriteEmailResponse,
)


def _first_sentences(text: str, count: int = 2, cap: int = 400) -> str:
    sentences = re.findall(r"[^.!?]+[.!?]+", text or "")
    if not sentences:
        return (text or "")[:240]
    return " ".join(s.strip() for s in sentences[:count])[:cap]


def fallback_brief(req: BriefRequest) -> CompanyProfileOut:
    """Profile from scraped pages; no invented rivals (callers return [])."""
    home = req.pages[0] if req.pages else None
    name = req.company.name or req.company.domain
    summary = ""
    if home:
        summary = home.description or _first_sentences(home.text)
    return CompanyProfileOut(
        name=name,
        summary=summary or f"No public website content could be read for {name}.",
        positioning=home.title if home else "",
    )


def fallback_analysis(req: AnalyzeRequest) -> Analysis:
    """Signal-grounded heuristic analysis (mirrors the backend's local one)."""
    s = req.company.signals or {}
    company = str(req.company.profile.get("name") or "the company")

    weaknesses: list[AnalysisItem] = []
    gaps: list[AnalysisItem] = []
    insights: list[str] = []

    if s and not s.get("hasPricingPage"):
        weaknesses.append(
            AnalysisItem(
                title="No public pricing page",
                detail="Visitors cannot evaluate cost without contacting sales, which loses self-serve buyers.",
                evidence=f"No pricing page found among {s.get('pagesScraped', 0)} scraped pages.",
            )
        )
    if s and not s.get("hasBlog"):
        weaknesses.append(
            AnalysisItem(
                title="No blog or content marketing",
                detail="No content hub was found, limiting organic traffic and buyer education.",
                evidence="No blog/news/insights section detected on the site.",
            )
        )
    if s and s.get("missingMetaDescription"):
        weaknesses.append(
            AnalysisItem(
                title="Missing homepage meta description",
                detail="Search engines will improvise the snippet, hurting search click-through.",
                evidence='The homepage has no <meta name="description">.',
            )
        )
    word_count = int(s.get("homepageWordCount") or 0)
    if 0 < word_count < 150:
        weaknesses.append(
            AnalysisItem(
                title="Very thin homepage copy",
                detail="The homepage explains little about the offering, weakening SEO and conversion.",
                evidence=f"Homepage contains roughly {word_count} words of visible text.",
            )
        )
    if s and not s.get("socialLinks"):
        weaknesses.append(
            AnalysisItem(
                title="No visible social presence",
                detail="No social profiles are linked from the website.",
                evidence="No social profile links found on scraped pages.",
            )
        )
    tech = s.get("techHints") or []
    if tech:
        insights.append(f"Detected stack/tooling: {', '.join(map(str, tech))}.")

    for rival in req.rivals:
        rs = rival.signals or {}
        if s and rs.get("hasPricingPage") and not s.get("hasPricingPage"):
            gaps.append(
                AnalysisItem(
                    title=f"{rival.name} publishes pricing",
                    detail=f"{rival.name} shows pricing publicly while {company} does not.",
                    evidence=f"Pricing page found on {rival.website}.",
                )
            )
        if s and rs.get("hasBlog") and not s.get("hasBlog"):
            gaps.append(
                AnalysisItem(
                    title=f"{rival.name} invests in content",
                    detail=f"{rival.name} runs an active content section while {company} has none.",
                    evidence=f"Blog/insights section found on {rival.website}.",
                )
            )

    opportunities = [
        AnalysisItem(
            title=f"Fix: {w.title.lower()}",
            detail="Addressing this is a concrete, provable improvement and a natural outreach angle.",
            evidence=w.evidence,
        )
        for w in weaknesses[:4]
    ]
    recommendations = [
        Recommendation(
            title=re.sub(r"^(No|Missing) ", "Add ", w.title),
            detail=w.detail,
            priority="medium",
        )
        for w in weaknesses[:4]
    ]

    def _advantages(a: dict, b: dict) -> list[str]:
        out = []
        if a.get("hasPricingPage") and not b.get("hasPricingPage"):
            out.append("Public pricing page")
        if a.get("hasBlog") and not b.get("hasBlog"):
            out.append("Active blog/content")
        if (a.get("socialLinks") or []) and not (b.get("socialLinks") or []):
            out.append("Visible social presence")
        return out

    comparisons = [
        RivalComparison(
            rivalName=r.name,
            leadAdvantages=_advantages(s, r.signals or {}),
            rivalAdvantages=_advantages(r.signals or {}, s),
            notes=r.summary,
        )
        for r in req.rivals
    ]

    return Analysis(
        summary=(
            f"Heuristic audit of {company} based on "
            f"{s.get('pagesScraped', 0)} scraped pages"
            + (
                f" and {len(req.rivals)} competitor site(s)."
                if req.rivals
                else " (no competitor data available)."
            )
        ),
        weaknesses=weaknesses,
        gaps=gaps,
        opportunities=opportunities,
        comparisons=comparisons,
        insights=insights,
        recommendations=recommendations,
    )


def fallback_email(req: WriteEmailRequest) -> WriteEmailResponse:
    """Audit-grounded template email (mirrors the backend's local writer)."""
    lead, settings, audit = req.lead, req.settings, req.audit
    greeting = (lead.firstName or "").strip() or "there"
    company = (lead.company or "your team").strip()

    weakness = audit.weaknesses[0] if audit and audit.weaknesses else None
    opportunity = audit.opportunities[0] if audit and audit.opportunities else None
    rival_names = audit.rivalNames[:2] if audit else []

    subject = (
        f"{company}: quick note on {weakness.title.lower()}"
        if weakness
        else f"Quick question about {company}"
    )

    lines = [f"Hi {greeting},", ""]
    if audit and audit.companySummary:
        first = _first_sentences(audit.companySummary, 1)
        lines += [f"I spent some time on {company}'s site: {first[0].lower() + first[1:]}", ""]
    else:
        lines += [f"I've been looking at {company} and had a thought to share.", ""]
    if weakness:
        lines += [f"One thing stood out: {weakness.detail[0].lower() + weakness.detail[1:]}", ""]
    if rival_names and opportunity:
        lines += [
            f"Compared with {' and '.join(rival_names)}, that's a gap worth closing. "
            f"{opportunity.detail[0].upper() + opportunity.detail[1:]}",
            "",
        ]

    value = (req.campaign.description or "").strip() or (
        "We help teams turn findings like these into pipeline."
    )
    cta = settings.callToAction.strip() or "a quick 15-minute call"
    lines += [value, "", f"Would you be open to {cta}?", ""]

    name = settings.senderName.strip() or "The team"
    role_company = ", ".join(
        x for x in (settings.senderRole.strip(), settings.senderCompany.strip()) if x
    )
    lines += ["Best,", name]
    if role_company:
        lines.append(role_company)

    body = "\n".join(lines)
    if settings.wordLimit > 0:
        words = body.split()
        if len(words) > settings.wordLimit + 30:
            body = " ".join(words[: settings.wordLimit]) + "…"

    return WriteEmailResponse(subject=subject, body=body, engine="fallback")
