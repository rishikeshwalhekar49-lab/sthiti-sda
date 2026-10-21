"""Model-written answers for "Ask the engine", from whichever provider is configured.

One dispatcher, several providers, tried in order with retries and fallback:
  claude      Anthropic Claude, through the official `anthropic` SDK   ANTHROPIC_API_KEY
  groq        Groq (OpenAI-compatible chat API)                       GROQ_API_KEY
  gemini      Google Gemini (OpenAI-compatible endpoint)              GEMINI_API_KEY
  deepseek    DeepSeek                                                DEEPSEEK_API_KEY
  openrouter  OpenRouter                                              OPENROUTER_API_KEY

LLM_ORDER (comma-separated) sets the order; providers without a key are skipped. Model names
for the non-Claude providers are read from <NAME>_MODEL so they can be updated without code
changes. Keys are only ever read from the environment.

Every provider gets the same instructions as the original: answer only from the engine's JSON,
never invent a number, never give investment advice.
"""
import asyncio
import json
import os

import anthropic
import httpx

SYSTEM = (
    "You explain topological data analysis of Indian stock-market data to people who are not quants. "
    "Answer in at most four sentences, in plain English, using only the numbers in the JSON given to you. "
    "Never invent a number, a stock or an event. If the JSON does not answer the question, say so. "
    "Do not give investment advice or tell anyone to buy or sell."
)

CLAUDE_MODEL = "claude-opus-5-5"


class ProviderError(Exception):
    """A provider could not produce an answer; the dispatcher moves on to the next one."""


class Claude:
    name = "claude"

    def __init__(self):
        self.model = CLAUDE_MODEL
        self.client = None

    def available(self):
        return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))

    async def answer(self, system, user):
        if self.client is None:
            self.client = anthropic.AsyncAnthropic(timeout=60.0, max_retries=2)  # SDK retries 408/409/429/5xx itself
        try:
            res = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=4000,  # thinking is always on for this model and counts toward the cap
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={"effort": "low"},
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
            raise ProviderError(f"Claude: credentials rejected ({e.status_code})")
        except (anthropic.NotFoundError, anthropic.BadRequestError) as e:
            raise ProviderError(f"Claude: request rejected ({e.status_code}): {e.message}")
        except anthropic.RateLimitError:
            raise ProviderError("Claude: rate limited")
        except anthropic.APIStatusError as e:
            raise ProviderError(f"Claude: API error {e.status_code}")
        except anthropic.APIConnectionError:
            raise ProviderError("Claude: could not connect")
        if res.stop_reason == "refusal":
            raise ProviderError("Claude: declined to answer")
        text = "\n".join(b.text for b in res.content if b.type == "text").strip()
        if not text:
            raise ProviderError("Claude: empty answer")
        return text, res.model


class OpenAICompatible:
    """Groq, Gemini, DeepSeek and OpenRouter all speak the same chat-completions dialect."""

    def __init__(self, name, base_url, key_env, model_env, default_model):
        self.name, self.base_url, self.key_env = name, base_url, key_env
        self.model = os.environ.get(model_env) or default_model

    def available(self):
        return bool(os.environ.get(self.key_env))

    async def answer(self, system, user):
        body = {"model": self.model, "max_tokens": 600, "temperature": 0.2,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        headers = {"Authorization": f"Bearer {os.environ[self.key_env]}", "Content-Type": "application/json"}
        last = None
        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(3):
                try:
                    r = await client.post(f"{self.base_url}/chat/completions", json=body, headers=headers)
                except (httpx.TimeoutException, httpx.TransportError) as e:
                    last = f"{self.name}: network error ({type(e).__name__})"
                else:
                    if r.status_code == 200:
                        try:
                            data = r.json()
                            text = (data["choices"][0]["message"].get("content") or "").strip()
                        except (ValueError, KeyError, IndexError, TypeError):
                            raise ProviderError(f"{self.name}: unexpected response shape")
                        if not text:
                            raise ProviderError(f"{self.name}: empty answer")
                        return text, data.get("model") or self.model
                    if r.status_code in (401, 403):
                        raise ProviderError(f"{self.name}: credentials rejected ({r.status_code})")
                    if r.status_code not in (408, 409, 429) and r.status_code < 500:
                        raise ProviderError(f"{self.name}: request rejected ({r.status_code})")
                    last = f"{self.name}: HTTP {r.status_code}"
                    retry_after = r.headers.get("retry-after")
                    if retry_after and retry_after.isdigit() and int(retry_after) <= 5:
                        await asyncio.sleep(int(retry_after))
                        continue
                await asyncio.sleep(0.5 * 3 ** attempt)  # 0.5 s, 1.5 s
        raise ProviderError(last or f"{self.name}: failed")


PROVIDERS = {
    "claude": Claude(),
    "groq": OpenAICompatible("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY", "GROQ_MODEL", "llama-3.3-70b-versatile"),
    "gemini": OpenAICompatible("gemini", "https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY", "GEMINI_MODEL", "gemini-2.5-flash"),
    "deepseek": OpenAICompatible("deepseek", "https://api.deepseek.com", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "deepseek-chat"),
    "openrouter": OpenAICompatible("openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
}


def order():
    names = [n.strip() for n in os.environ.get("LLM_ORDER", "claude,groq,gemini,deepseek,openrouter").split(",") if n.strip()]
    return [PROVIDERS[n] for n in names if n in PROVIDERS and PROVIDERS[n].available()]


def available():
    return bool(order())


def configured():
    return [{"name": p.name, "model": p.model} for p in order()]


async def answer(question, facts):
    """Try each configured provider in turn. Returns (text, provider, model, errors)."""
    user = f"Engine output (JSON):\n{json.dumps(facts)}\n\nQuestion: {question}"
    errors = []
    for p in order():
        try:
            text, model = await p.answer(SYSTEM, user)
            return text, p.name, model, errors
        except ProviderError as e:
            errors.append(str(e))
    return None, None, None, errors
