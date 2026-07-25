"""Keyless local email writer.

Used when no GOOGLE_API_KEY is configured (so the service runs and is testable
without credentials) or when the ADK/Gemini call fails. Mirrors the NestJS demo
writer so behavior is consistent whichever path runs.
"""
from __future__ import annotations

import re

from .schemas import Lead, Settings, WriteRequest, WriteResponse


def _subject_for(tone: str, company: str) -> str:
    return {
        "friendly": f"Quick idea for {company} 👋",
        "casual": f"{company} — worth a chat?",
        "concise": f"{company}: 15 min?",
        "persuasive": f"A faster path to pipeline for {company}",
    }.get(tone, f"Quick question about {company}")


def _opener_for(tone: str, company: str, role: str) -> str:
    role_bit = f" as {role}" if role else ""
    return {
        "friendly": f"I came across {company} and loved what you're building{role_bit}.",
        "casual": f"Been following {company}{role_bit} — figured I'd reach out directly.",
        "concise": f"Reaching out about {company}{role_bit}.",
        "persuasive": f"Teams like {company} are leaving pipeline on the table — and it's fixable.",
    }.get(
        tone,
        f"I've been following {company}{role_bit} and had a quick thought I wanted to share.",
    )


def _render_tags(text: str, lead: Lead) -> str:
    subs = {
        "firstName": lead.firstName or "there",
        "lastName": lead.lastName or "",
        "company": lead.company or "your team",
        "title": lead.title or "",
        "email": lead.email or "",
    }
    for key, val in subs.items():
        text = re.sub(r"\{\{\s*" + key + r"\s*\}\}", val, text, flags=re.IGNORECASE)
    return text


def _signature(s: Settings) -> str:
    name = s.senderName.strip() or "The team"
    lines = ["Best,", name]
    role_company = ", ".join(x for x in (s.senderRole.strip(), s.senderCompany.strip()) if x)
    if role_company:
        lines.append(role_company)
    return "\n".join(lines)


def _clamp_words(text: str, word_limit: int) -> str:
    if not word_limit or word_limit <= 0:
        return text
    words = text.split()
    if len(words) <= word_limit + 20:
        return text
    return " ".join(words[:word_limit]) + "…"


def write_fallback(req: WriteRequest) -> WriteResponse:
    lead, campaign, settings = req.lead, req.campaign, req.settings
    greeting = (lead.firstName or "").strip() or "there"
    company = (lead.company or "your team").strip()
    role = (lead.title or "").strip()

    subject = _render_tags(
        campaign.subject.strip() or _subject_for(settings.tone, company), lead
    )
    opener = _opener_for(settings.tone, company, role)
    value = (
        campaign.description.strip()
        or f"We help teams like {company} run outreach that actually gets replies."
    )
    cta = settings.callToAction.strip() or "reply if you are open to it"

    body = "\n".join(
        [
            f"Hi {greeting},",
            "",
            opener,
            "",
            value,
            "",
            f"Would you be open to {cta}?",
            "",
            _signature(settings),
        ]
    )
    return WriteResponse(
        subject=subject,
        body=_clamp_words(body, settings.wordLimit),
        engine="fallback",
    )
