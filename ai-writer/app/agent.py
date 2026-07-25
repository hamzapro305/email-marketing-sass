"""Email-writing agent (Google ADK).

The LLM (provider, model, API key / base URL, temperature) is supplied **per
request** by the backend — it comes from the user's in-app settings
(Settings → AI providers), not from this service's environment. All providers
run through ADK's LiteLLM integration so the credentials travel with the request.

If a request carries no LLM config (or a call fails) the service returns a local
fallback email, so it always works with zero credentials.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from pydantic import BaseModel

from .schemas import LlmConfig, WriteRequest, WriteResponse

APP_NAME = "email_writer"
USER_ID = "nest-backend"


class _Email(BaseModel):
    subject: str
    body: str


def _instruction(req: WriteRequest) -> str:
    """Build the agent's system instruction.

    The writer's directives come from the user's Settings (`settings.instructions`)
    — nothing about the persona or style is hardcoded here. Around that we inject
    the other configured parameters (tone, language, word limit, sender, CTA) and
    the mandatory JSON output contract (a technical requirement, not "content").
    """
    s = req.settings
    sender = ", ".join(x for x in (s.senderName, s.senderRole, s.senderCompany) if x)
    guidance = (s.instructions or "").strip() or (
        "Write ONE short, personalized outreach email to the recipient."
    )
    lines = [
        guidance,
        "",
        "Apply these settings:",
        f"- Tone: {s.tone}",
        f"- Language: {s.language}",
        f"- Keep it under {s.wordLimit} words",
        f"- Sender: {sender or 'the team'}",
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


def _prompt(req: WriteRequest) -> str:
    lead, camp = req.lead, req.campaign
    lines = [
        "Recipient:",
        f"- Name: {(lead.firstName + ' ' + lead.lastName).strip() or 'unknown'}",
        f"- Company: {lead.company or 'unknown'}",
        f"- Title: {lead.title or 'unknown'}",
        "",
        "Campaign context:",
        f"- Name: {camp.name}",
    ]
    if camp.subject:
        lines.append(f"- Desired subject (may contain merge tags): {camp.subject}")
    if camp.description:
        lines.append(f"- What we offer: {camp.description}")
    return "\n".join(lines)


def _parse_email(text: str, req: WriteRequest) -> _Email:
    """Robustly extract {subject, body} from the model's text."""
    raw = (text or "").strip()
    # Strip ```json fences if present.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
    for candidate in (raw, (re.search(r"\{.*\}", raw, re.S) or [None])[0]):
        if not candidate:
            continue
        try:
            obj = json.loads(candidate)
            if obj.get("subject") and obj.get("body"):
                return _Email(subject=str(obj["subject"]), body=str(obj["body"]))
        except (json.JSONDecodeError, TypeError, AttributeError):
            pass
    # Last resort: treat the whole text as the body.
    subject = req.campaign.subject.strip() or f"Quick note for {req.lead.company or 'you'}"
    return _Email(subject=subject, body=raw or "")


async def _run_agent(instruction: str, prompt: str, model, gen_config=None) -> str:
    """Run a one-shot ADK agent and return its final text response."""
    from google.adk.agents import LlmAgent
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    agent = LlmAgent(
        name="email_writer",
        model=model,
        description="Writes personalized B2B cold outreach emails.",
        instruction=instruction,
        generate_content_config=gen_config,
    )

    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID
    )
    message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])

    final_text: Optional[str] = None
    async for event in runner.run_async(
        user_id=USER_ID, session_id=session.id, new_message=message
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_text = event.content.parts[0].text

    if not final_text:
        raise RuntimeError("LLM returned no final response")
    return final_text


# ── Per-request LLM config (the user's in-app "AI providers") ─────────────────

def _normalize_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    return {"google": "gemini"}.get(p, p)


def _build_model_from_config(cfg: LlmConfig):
    """Build an ADK/LiteLLM model from a per-request config so the API key and
    base URL come from the user's account rather than the environment."""
    from google.adk.models.lite_llm import LiteLlm

    provider = _normalize_provider(cfg.provider)
    temperature = cfg.temperature

    if provider == "gemini":
        model = cfg.model or "gemini-2.0-flash"
        return LiteLlm(
            model=f"gemini/{model}", api_key=cfg.apiKey, temperature=temperature
        )
    if provider == "openai":
        model = cfg.model or "gpt-4o-mini"
        return LiteLlm(
            model=f"openai/{model}", api_key=cfg.apiKey, temperature=temperature
        )
    if provider == "ollama":
        model = cfg.model or "llama3.2"
        api_base = cfg.apiBase or "http://localhost:11434"
        return LiteLlm(
            model=f"ollama_chat/{model}",
            api_base=api_base,
            temperature=temperature,
        )
    raise ValueError(f"Unknown LLM provider: {cfg.provider!r}")


async def write_with_config(req: WriteRequest, cfg: LlmConfig) -> WriteResponse:
    """Write an email using the user's configured LLM (provider/model/key)."""
    model = _build_model_from_config(cfg)
    text = await _run_agent(_instruction(req), _prompt(req), model)
    email = _parse_email(text, req)
    return WriteResponse(
        subject=email.subject,
        body=email.body,
        engine=_normalize_provider(cfg.provider) or "llm",
    )


async def test_config(cfg: LlmConfig) -> str:
    """Do a tiny generation to verify the LLM works; returns the reply text.

    Raises on any failure — the caller turns that into a test error message."""
    model = _build_model_from_config(cfg)
    return await _run_agent(
        "You are a connectivity check. Reply with a single lowercase word.",
        "Reply with exactly: ok",
        model,
    )
