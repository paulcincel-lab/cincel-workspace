import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

/**
 * Language model for the assistant. Provider-neutral by design: `LLM_BASE_URL`
 * selects the endpoint (OpenAI, a local model via an OpenAI-compatible /v1
 * surface, Anthropic through an OpenAI-compat proxy, …) with no
 * provider-specific branching. Env is read at call time so this never leaks
 * into a client bundle.
 */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY);
}

export function getLanguageModel() {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  if (!baseURL || !apiKey) {
    throw new Error("El asistente no está configurado");
  }

  const provider = createOpenAI({ baseURL, apiKey });
  // `.chat(model)` targets POST {baseURL}/chat/completions. Calling the
  // provider directly resolves to OpenAI's proprietary /responses surface,
  // which most "OpenAI-compatible" providers don't implement.
  return provider.chat(model);
}
