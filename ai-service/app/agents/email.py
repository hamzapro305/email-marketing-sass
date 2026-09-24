"""Email agent: write the personalized outreach email from the audit.

The prompt carries the audit's actual findings (weaknesses, opportunities,
verified rival names, recommendations). The agent is explicitly instructed to
reference them concretely — this is what separates the output from generic
AI outreach copy.
"""
from __future__ import annotations

import json

from ..runner import extract_json, run_agent
from ..schemas import LlmConfig, WriteEmailRequest, truncate


def _instruction(req: WriteEmailRequest) -> str:
    s = req.settings
    sender = ", ".join(x for x in (s.senderName, s.senderRole, s.senderCompany) if x)
    guidance = (s.instructions or "").strip() or (
        "Write ONE short, highly personalized outreach email to the recipient."
    )
    lines = [
        guidance,
        "",
        "Hard requirements:",
        "- Reference at least one CONCRETE finding from the research below"
        " (a specific weakness, gap, or competitor fact). Generic flattery or"
        " template-sounding copy is a failure.",
        "- Never fabricate facts beyond the provided research.",
        "- Never invent claims about the SENDER: no client names, case studies,"
        " percentages, results, or testimonials unless they appear verbatim in"
        " the campaign offer. If the offer gives no proof points, make none.",
        f"- Tone: {s.tone}",
        f"- Language: {s.language}",
        f"- Keep it under {s.wordLimit} words",
        f"- Sender: {sender or 'the team'}",
        "",
        "Deliverability rules (spam filters read this email too):",
        "- Subject: specific and plain — no ALL CAPS, no exclamation marks,"
        " no 'free/guarantee/act now/limited time' style phrasing, no emoji.",
        "- Body: plain conversational text; no links unless one was explicitly"
        " provided in the offer; never invent URLs; no attachments talk;"
        " no excessive punctuation!!! or spammy urgency.",
        "- Write like one human emailing another, not a broadcast.",
        "- Punctuation: never use em dashes (—) or en dashes (–). Use commas,"
        " periods, or colons instead; a plain hyphen only inside compound words.",
    ]
    if s.callToAction.strip():
        lines.append(
            f"- End with a single, low-friction call to action: {s.callToAction}"
        )
    lines += [
        "",
        'Respond with ONLY a JSON object: {"subject": "...", "body": "..."}.',
        "No markdown, no code fences, no extra commentary.",
    ]
    return "\n".join(lines)


def _prompt(req: WriteEmailRequest) -> str:
    lead, camp, audit = req.lead, req.campaign, req.audit
    lines = [
        "Recipient:",
        f"- Name: {(lead.firstName + ' ' + lead.lastName).strip() or 'unknown'}",
        f"- Role: {lead.title or 'unknown'} at {lead.company or 'unknown'}",
        f"- Company website: {lead.website or 'unknown'}",
        "",
        "Campaign context (what WE offer):",
        f"- Name: {camp.name}",
        f"- Offer: {truncate(camp.description, 600) or 'not specified'}",
        "",
    ]
    if audit:
        lines += [
            "Research findings about the recipient's company (USE THESE):",
            f"- Company summary: {truncate(audit.companySummary, 600)}",
        ]
        for w in audit.weaknesses[:3]:
            lines.append(f"- Weakness: {w.title} — {truncate(w.detail, 240)}")
        for o in audit.opportunities[:2]:
            lines.append(f"- Opportunity: {o.title} — {truncate(o.detail, 240)}")
        if audit.rivalNames:
            lines.append(f"- Verified competitors: {', '.join(audit.rivalNames)}")
        for r in audit.recommendations[:2]:
            lines.append(f"- Recommendation: {r.title} — {truncate(r.detail, 240)}")
        for i in audit.insights[:2]:
            lines.append(f"- Insight: {truncate(i, 240)}")
        if audit.signals:
            lines.append(
                "- Website signals: " + truncate(json.dumps(audit.signals), 500)
            )
    else:
        lines.append("(No research available — write from the lead fields only.)")
    return "\n".join(lines)


async def write(req: WriteEmailRequest, cfg: LlmConfig) -> tuple[str, str]:
    """Returns (subject, body)."""
    text = await run_agent(
        name="email_writer",
        description="Writes personalized B2B outreach emails from research.",
        instruction=_instruction(req),
        prompt=_prompt(req),
        cfg=cfg,
        # Output cap (reasoning included) sized to the JSON this agent returns.
        max_tokens=1500,
    )
    data = extract_json(text)
    if not isinstance(data, dict) or not data.get("subject") or not data.get("body"):
        raise ValueError("Email agent returned an incomplete email")
    return str(data["subject"]), str(data["body"])
