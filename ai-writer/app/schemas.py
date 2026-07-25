"""Request/response contract shared with the NestJS backend."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LlmConfig(BaseModel):
    """A per-request LLM override sent by the backend (the user's configured
    provider). When present it takes priority over environment-based selection."""

    provider: str = ""  # gemini | openai | ollama
    model: str = ""
    apiKey: str = ""
    apiBase: str = ""
    temperature: float = 0.7


class Lead(BaseModel):
    email: str = ""
    firstName: str = ""
    lastName: str = ""
    company: str = ""
    title: str = ""


class Campaign(BaseModel):
    name: str = ""
    subject: str = ""
    description: str = ""


class Settings(BaseModel):
    model: str = "gemini-2.0-flash"
    temperature: float = 0.7
    tone: str = "professional"
    language: str = "English"
    wordLimit: int = 120
    callToAction: str = "a quick 15-minute call"
    senderName: str = ""
    senderRole: str = ""
    senderCompany: str = ""
    instructions: str = ""


class WriteRequest(BaseModel):
    lead: Lead = Field(default_factory=Lead)
    campaign: Campaign = Field(default_factory=Campaign)
    settings: Settings = Field(default_factory=Settings)
    # The user's chosen LLM (from Settings → AI providers). None → env/fallback.
    llm: Optional[LlmConfig] = None


class WriteResponse(BaseModel):
    subject: str
    body: str
    # Which path produced this: the provider name (real generation) or "fallback".
    engine: str


class TestRequest(BaseModel):
    llm: LlmConfig


class TestResponse(BaseModel):
    success: bool
    engine: str = ""
    error: str = ""
