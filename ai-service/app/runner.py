"""One-shot ADK agent execution + robust JSON extraction.

All agents in this service are single-turn: build an LlmAgent with an
instruction, send one prompt, read the final response. This module owns that
plumbing so the agent modules contain nothing but their prompts and parsing.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from .llm import build_model
from .schemas import LlmConfig

APP_NAME = "ai_service"
USER_ID = "nest-backend"


async def run_agent(
    name: str,
    description: str,
    instruction: str,
    prompt: str,
    cfg: LlmConfig,
) -> str:
    """Run a one-shot ADK agent against the user's LLM; return the final text."""
    from google.adk.agents import LlmAgent
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    agent = LlmAgent(
        name=name,
        model=build_model(cfg),
        description=description,
        instruction=instruction,
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


def extract_json(text: str) -> Any:
    """Extract the first JSON object/array from model output.

    Tolerates code fences and prose around the JSON. Raises ValueError when
    nothing parseable is found — callers turn that into a fallback.
    """
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()

    candidates = [raw]
    match = re.search(r"[\[{].*[\]}]", raw, re.S)
    if match:
        candidates.append(match.group(0))

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
    raise ValueError("Model output contained no parseable JSON")
