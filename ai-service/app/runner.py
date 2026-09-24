"""One-shot ADK agent execution + robust JSON extraction.

All agents in this service are single-turn: build an LlmAgent with an
instruction, send one prompt, read the final response. This module owns that
plumbing so the agent modules contain nothing but their prompts and parsing.
"""
from __future__ import annotations

import json
import re
import time
from contextvars import ContextVar
from typing import Any, Optional

from .llm import build_model
from .schemas import LlmConfig, Usage

APP_NAME = "ai_service"
USER_ID = "nest-backend"


# Token/latency accounting for the current request. Each FastAPI request runs
# in its own context, so endpoints read back exactly what their agent spent.
_usage: ContextVar[Optional[Usage]] = ContextVar("agent_usage", default=None)


def last_usage() -> Optional[Usage]:
    """Usage of the most recent agent call in this request, if any."""
    return _usage.get()


async def run_agent(
    name: str,
    description: str,
    instruction: str,
    prompt: str,
    cfg: LlmConfig,
    max_tokens: int | None = None,
) -> str:
    """Run a one-shot ADK agent against the user's LLM; return the final text."""
    from google.adk.agents import LlmAgent
    from google.adk.runners import InMemoryRunner
    from google.genai import types

    agent = LlmAgent(
        name=name,
        model=build_model(cfg, max_tokens),
        description=description,
        instruction=instruction,
    )

    runner = InMemoryRunner(agent=agent, app_name=APP_NAME)
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID
    )
    message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])

    final_text: Optional[str] = None
    usage = Usage(model=getattr(agent.model, "model", ""))
    started = time.monotonic()
    async for event in runner.run_async(
        user_id=USER_ID, session_id=session.id, new_message=message
    ):
        meta = getattr(event, "usage_metadata", None)
        if meta is not None:
            usage.inputTokens += meta.prompt_token_count or 0
            usage.outputTokens += meta.candidates_token_count or 0
            usage.reasoningTokens += meta.thoughts_token_count or 0
        if event.is_final_response() and event.content and event.content.parts:
            # Reasoning models (Kimi K2, DeepSeek-R1, o-series via LiteLLM)
            # emit their chain of thought as `thought=True` parts ahead of the
            # answer. Only the non-thought parts are the answer.
            answer = "".join(
                p.text for p in event.content.parts if p.text and not p.thought
            )
            final_text = answer or final_text

    usage.ms = int((time.monotonic() - started) * 1000)
    _usage.set(usage)

    if not final_text:
        raise RuntimeError(
            "LLM returned no answer (only reasoning) — the output cap may be too low"
        )
    return final_text


def extract_json(text: str) -> Any:
    """Extract the first JSON object/array from model output.

    Tolerates code fences, reasoning blocks (`<think>…</think>`), and prose
    around the JSON. Raises ValueError — carrying a preview of the raw output
    so the audit trace can show *what* the model actually said — when nothing
    parseable is found; callers turn that into a fallback.
    """
    raw = (text or "").strip()
    # Reasoning models (Kimi K2, DeepSeek-R1, …) may prefix a thinking block.
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()

    candidates = [raw]
    # Any fenced block anywhere in the text.
    for fenced in re.findall(r"```(?:json)?\s*(.*?)```", raw, flags=re.S):
        candidates.append(fenced.strip())
    # Greedy first-to-last bracket span, then a balanced scan from each opener.
    match = re.search(r"[\[{].*[\]}]", raw, re.S)
    if match:
        candidates.append(match.group(0))
    candidates.extend(_balanced_spans(raw))

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
    preview = " ".join(raw.split())[:300] or "(empty response)"
    raise ValueError(f"Model output contained no parseable JSON. Output began: {preview}")


def _balanced_spans(text: str) -> list[str]:
    """Substrings starting at each `{`/`[` that close with balanced brackets."""
    spans: list[str] = []
    pairs = {"{": "}", "[": "]"}
    for start, ch in enumerate(text):
        if ch not in pairs:
            continue
        depth, in_str, esc = 0, False, False
        for i in range(start, len(text)):
            c = text[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c in "{[":
                depth += 1
            elif c in "}]":
                depth -= 1
                if depth == 0:
                    spans.append(text[start : i + 1])
                    break
        if len(spans) >= 3:
            break
    return spans
