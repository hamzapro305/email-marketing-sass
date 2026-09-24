"""Per-request LLM construction.

The provider, model, API key / base URL, and temperature all come from the
request (the user's in-app "AI providers" account) — never from this service's
environment. Every provider runs through ADK's LiteLLM integration so the
credentials travel with the request and nothing is stored here.
"""
from __future__ import annotations

from .schemas import LlmConfig

_DEFAULT_MODELS = {
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-4o-mini",
    "ollama": "llama3.2",
    "kimi": "kimi-k2.6",
}


def normalize_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    return {"google": "gemini", "moonshot": "kimi"}.get(p, p)


def build_model(cfg: LlmConfig, max_tokens: int | None = None):
    """An ADK/LiteLLM model bound to the user's provider + credentials.

    `max_tokens` bounds each call's output so a rambling model can't burn an
    unbounded budget; every agent passes a cap sized to its JSON shape.
    """
    from google.adk.models.lite_llm import LiteLlm

    provider = normalize_provider(cfg.provider)
    model = cfg.model or _DEFAULT_MODELS.get(provider, "")
    limits = {"max_tokens": max_tokens} if max_tokens else {}

    if provider == "gemini":
        return LiteLlm(
            model=f"gemini/{model}",
            api_key=cfg.apiKey,
            temperature=cfg.temperature,
            **limits,
        )
    if provider == "openai":
        return LiteLlm(
            model=f"openai/{model}",
            api_key=cfg.apiKey,
            temperature=cfg.temperature,
            **limits,
        )
    if provider == "kimi":
        # Moonshot AI. LiteLLM drops/clamps temperature for Kimi models itself.
        # apiBase is optional: blank = international (api.moonshot.ai/v1);
        # China-region keys need https://api.moonshot.cn/v1.
        #
        # K2.x models "think" before answering by default, and those reasoning
        # tokens are billed as output we then discard. Our tasks are structured
        # extraction and short copywriting, which don't need it. Measured on a
        # real audit prompt: 2,245 → 618 output tokens, 24s → 7s, same answer.
        # (Kimi ignores `reasoning_effort`; its own `thinking` switch works.)
        return LiteLlm(
            model=f"moonshot/{model}",
            api_key=cfg.apiKey,
            api_base=cfg.apiBase or None,
            temperature=cfg.temperature,
            extra_body={"thinking": {"type": "disabled"}},
            **limits,
        )
    if provider == "ollama":
        return LiteLlm(
            model=f"ollama_chat/{model}",
            api_base=cfg.apiBase or "http://localhost:11434",
            temperature=cfg.temperature,
            **limits,
        )
    raise ValueError(f"Unknown LLM provider: {cfg.provider!r}")
