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
}


def normalize_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    return {"google": "gemini"}.get(p, p)


def build_model(cfg: LlmConfig):
    """An ADK/LiteLLM model bound to the user's provider + credentials."""
    from google.adk.models.lite_llm import LiteLlm

    provider = normalize_provider(cfg.provider)
    model = cfg.model or _DEFAULT_MODELS.get(provider, "")

    if provider == "gemini":
        return LiteLlm(
            model=f"gemini/{model}", api_key=cfg.apiKey, temperature=cfg.temperature
        )
    if provider == "openai":
        return LiteLlm(
            model=f"openai/{model}", api_key=cfg.apiKey, temperature=cfg.temperature
        )
    if provider == "ollama":
        return LiteLlm(
            model=f"ollama_chat/{model}",
            api_base=cfg.apiBase or "http://localhost:11434",
            temperature=cfg.temperature,
        )
    raise ValueError(f"Unknown LLM provider: {cfg.provider!r}")
