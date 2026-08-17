import OpenAI from "openai";

/**
 * The feedback model provider.
 *
 * DeepSeek speaks the OpenAI wire format, so the OpenAI SDK works unchanged
 * against its base URL. It is reachable from mainland hosts, which OpenAI is
 * not: calls to api.openai.com from the production server fail with
 * `unsupported_country_region_territory`.
 *
 * Point AI_BASE_URL and AI_FEEDBACK_MODEL elsewhere to switch providers, as
 * long as the target is OpenAI-compatible.
 */
const defaultBaseUrl = "https://api.deepseek.com";
const defaultModel = "deepseek-chat";

export function getAiClient() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_BASE_URL || defaultBaseUrl
  });
}

export function feedbackModel() {
  return process.env.AI_FEEDBACK_MODEL || process.env.OPENAI_FEEDBACK_MODEL || defaultModel;
}

export type AiClient = OpenAI;
