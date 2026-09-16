import Anthropic from "@anthropic-ai/sdk";

/**
 * One call to Claude that must come back as JSON. The system prompt is
 * cached (it is the same every time); the reply is parsed leniently — fences
 * and stray control characters tolerated — and API errors are turned into
 * messages a teacher can act on, since the key is the platform's, not theirs.
 */

export const claudeModel = process.env.ANTHROPIC_ASSESSMENT_MODEL || "claude-opus-5";

export class ClaudeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function askClaudeJson(system: string, user: string) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ClaudeError("Missing ANTHROPIC_API_KEY.", 500);
  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: claudeModel,
      max_tokens: 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }]
    });
  } catch (error) {
    throw translateApiError(error);
  }
  if (response.stop_reason === "refusal") throw new ClaudeError("AI 拒绝了这次请求，请稍后再试。");
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return {
    json: extractJson(text),
    model: response.model,
    inputTokens: response.usage.input_tokens || 0,
    outputTokens: response.usage.output_tokens || 0
  };
}

function translateApiError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return new ClaudeError("AI 服务的密钥无效，请联系平台管理员。", 503);
  if (error instanceof Anthropic.RateLimitError) return new ClaudeError("AI 服务当前繁忙或额度已用完，请稍后再试或联系平台管理员。", 503);
  if (error instanceof Anthropic.APIError) return new ClaudeError(`AI 服务出错（${error.status}）：${error.message}`, 502);
  return error instanceof Error ? error : new ClaudeError("AI 请求失败。", 500);
}

// The reply should be bare JSON; tolerate a fenced block or stray prose around
// it, control characters (a raw newline inside a string is one common parse
// failure), a missing closing bracket or two (the model loses count at the
// end of a long object), and a student quote left unescaped inside a string
// (the most common: the comments are full of quoted English).
export function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^`{3}(?:json)?\s*/i, "")
    .replace(/\s*`{3}$/, "")
    .replace(/\p{Cc}+/gu, " ");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const candidates = [trimmed, first >= 0 && last > first ? trimmed.slice(first, last + 1) : "", first >= 0 ? trimmed.slice(first) : ""];
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const attempt of [candidate, closeBrackets(candidate), closeBrackets(escapeInnerQuotes(candidate))]) {
      try {
        return JSON.parse(attempt);
      } catch {
        // try the next shape
      }
    }
  }
  return null;
}

// A quote inside a string that is not followed by a structural character
// (, } ] :) cannot be the end of that string, so it must be a literal quote
// the model forgot to escape.
function escapeInnerQuotes(text: string) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        const next = text.slice(i + 1).match(/^\s*(.)/s);
        const closes = !next || ",}]:".includes(next[1]);
        if (!closes) {
          out += '\\"';
          continue;
        }
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

// Append whatever closers are still open, ignoring brackets inside strings.
function closeBrackets(text: string) {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack[stack.length - 1] === ch) stack.pop();
  }
  return (inString ? text + '"' : text) + stack.reverse().join("");
}
