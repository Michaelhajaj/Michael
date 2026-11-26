/* ==========================================================
   plan-worker – זיהוי אוטומטי של תוכנית אדריכלית עם Claude
   POST /analyze  { image: "data:image/jpeg;base64,...", width, height }
   מחזיר JSON מובנה: קנה מידה, תקרות, מחיצות, אביזרי תקרה, אלמנטים בקירות.
   ========================================================== */
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

const MODEL = "claude-opus-5-5";

import { PLAN_SCHEMA, SYSTEM } from "./prompt.js";
import { MAX_IMAGE_BYTES, cors, json, overLimit } from "./http.js";

export async function analyzePlan(client, { mediaType, data }) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaJSONSchemaOutputFormat(PLAN_SCHEMA) },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: "Extract the drywall-relevant data from this drawing." }
      ]
    }]
  });
  if (response.stop_reason === "refusal") return { error: "refusal", status: 422 };
  if (response.stop_reason === "max_tokens") return { error: "too_long", status: 422 };
  if (!response.parsed_output) return { error: "parse_failed", status: 502 };
  return { result: response.parsed_output, usage: response.usage };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const c = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
    const url = new URL(request.url);
    if (url.pathname !== "/analyze" || request.method !== "POST") return json({ error: "not_found" }, 404, c.headers);
    if (!c.ok) return json({ error: "origin" }, 403, c.headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, c.headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body?.image || "");
    if (!m) return json({ error: "bad_image" }, 400, c.headers);
    if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "image_too_large" }, 413, c.headers);
    if (await overLimit(request, env)) return json({ error: "daily_limit" }, 429, c.headers);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
    try {
      const out = await analyzePlan(client, { mediaType: m[1], data: m[2] });
      if (out.error) return json({ error: out.error }, out.status, c.headers);
      return json({ result: out.result }, 200, c.headers);
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429, c.headers);
      if (error instanceof Anthropic.BadRequestError) return json({ error: "bad_request", detail: error.message }, 400, c.headers);
      if (error instanceof Anthropic.AuthenticationError) return json({ error: "not_configured" }, 503, c.headers);
      if (error instanceof Anthropic.APIError) return json({ error: "upstream", status: error.status }, 502, c.headers);
      return json({ error: "server" }, 500, c.headers);
    }
  }
};
