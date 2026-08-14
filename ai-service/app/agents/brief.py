"""Company-brief agent: profile + competitor discovery in ONE model call.

Research and rival discovery both depend only on the company, so combining
them halves the per-company LLM spend. The backend caches the result per
domain — for a campaign, this agent runs once per unique company, not once
per lead.

The profile half must be grounded strictly in the supplied scraped pages;
the rivals half may draw on model knowledge but only for REAL companies —
the backend verifies every proposed website by actually fetching it.
"""
from __future__ import annotations

from ..runner import extract_json, run_agent
from ..schemas import (
    BriefRequest,
    CompanyProfileOut,
    LlmConfig,
    RivalOut,
    truncate,
)

_INSTRUCTION = """You are a B2B research analyst. You are given the text of a
company's public website pages. Produce, in one pass:

1. A factual structured profile grounded ONLY in the provided content — if
   something is not stated on the pages, leave that field empty rather than
   guessing.
2. Up to {max_rivals} REAL direct competitors of this company. Only name
   companies you are confident exist, with their real primary website. Prefer
   direct competitors (same product category and buyer). Never include the
   company itself, its subsidiaries, or generic marketplaces. If you cannot
   name confident real competitors, return an empty list.

Respond with ONLY a JSON object of this exact shape (no markdown, no fences):
{{
  "profile": {{
    "name": "official company name",
    "summary": "3-4 sentence factual summary of what the company does",
    "products": ["named products, if any"],
    "services": ["named services, if any"],
    "targetCustomers": "who they sell to, if stated",
    "positioning": "how they position/differentiate themselves, if stated"
  }},
  "rivals": [
    {{"name": "Competitor name", "website": "https://competitor.com",
      "reason": "one sentence: why this is a direct competitor"}}
  ]
}}"""


def _prompt(req: BriefRequest) -> str:
    lines = [
        f"Company: {req.company.name or req.company.domain}",
        f"Domain: {req.company.domain}",
        f"Industry: {req.industry or 'unknown'}",
        f"Location: {req.location or 'unknown'}",
        "",
        "Scraped pages:",
    ]
    for page in req.pages[:5]:
        lines += [
            f"--- {page.url}",
            f"Title: {truncate(page.title, 200)}",
            f"Meta description: {truncate(page.description, 300)}",
            f"Content: {truncate(page.text, 3000)}",
            "",
        ]
    if not req.pages:
        lines.append("(no pages could be scraped — profile from name/domain only)")
    return "\n".join(lines)


async def brief(
    req: BriefRequest, cfg: LlmConfig
) -> tuple[CompanyProfileOut, list[RivalOut]]:
    text = await run_agent(
        name="company_brief",
        description="Profiles a company and names its direct competitors.",
        instruction=_INSTRUCTION.format(max_rivals=req.maxRivals),
        prompt=_prompt(req),
        cfg=cfg,
    )
    data = extract_json(text)
    if not isinstance(data, dict):
        raise ValueError("Brief agent returned non-object JSON")

    p = data.get("profile") or {}
    profile = CompanyProfileOut(
        name=str(p.get("name") or req.company.name or req.company.domain),
        summary=str(p.get("summary") or ""),
        products=[str(x) for x in (p.get("products") or []) if x][:10],
        services=[str(x) for x in (p.get("services") or []) if x][:10],
        targetCustomers=str(p.get("targetCustomers") or ""),
        positioning=str(p.get("positioning") or ""),
    )

    rivals: list[RivalOut] = []
    for item in (data.get("rivals") or [])[: req.maxRivals * 2]:
        if not isinstance(item, dict):
            continue
        rivals.append(
            RivalOut(
                name=str(item.get("name") or "").strip(),
                website=str(item.get("website") or "").strip(),
                reason=str(item.get("reason") or "").strip(),
            )
        )
    return profile, rivals
