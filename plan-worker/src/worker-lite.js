/* ==========================================================
   plan-worker (גרסה קלה) – אותו שרת, בלי ספריות חיצוניות,
   כדי שיהיה אפשר להדביק אותו בעורך של Cloudflare גם מהטלפון.
   שולח ל-Claude בדיוק את אותה בקשה כמו src/worker.js.
   ========================================================== */
import { SYSTEM } from "./prompt.js";
import { WIRE_FORMAT } from "./schema-wire.js";
import { MAX_IMAGE_BYTES, cors, json, overLimit } from "./http.js";
import { validateChat, chatBody, SHEET_HINTS } from "./chat.js";

const MODEL = "claude-opus-5-5";

function callClaude(env, body, beta) {
  return fetch((env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": beta,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
function upstreamError(res) {
  if (res.status === 429 || res.status === 529) return { error: "busy", status: 429 };
  if (res.status === 401 || res.status === 403) return { error: "not_configured", status: 503 };
  if (res.status === 400) return { error: "bad_request", status: 400 };
  return { error: "upstream", status: 502 };
}

async function analyzePlan(env, { mediaType, data, sheet }) {
  const res = await fetch((env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01,structured-outputs-2025-12-15",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort: "high", format: WIRE_FORMAT },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: ("Extract the drywall-relevant data from this drawing. " + (SHEET_HINTS[sheet] || "")).trim() }
        ]
      }]
    })
  });
  if (res.status === 429 || res.status === 529) return { error: "busy", status: 429 };
  if (res.status === 401 || res.status === 403) return { error: "not_configured", status: 503 };
  if (res.status === 400) return { error: "bad_request", status: 400 };
  if (!res.ok) return { error: "upstream", status: 502 };
  const msg = await res.json();
  if (msg.stop_reason === "refusal") return { error: "refusal", status: 422 };
  if (msg.stop_reason === "max_tokens") return { error: "too_long", status: 422 };
  const text = (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  try { return { result: JSON.parse(text) }; } catch { return { error: "parse_failed", status: 502 }; }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const c = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: c.headers });
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET")
      return json({ ok: true, service: "plan-worker", key: env.ANTHROPIC_API_KEY ? "set" : "missing" }, 200, c.headers);
    if (!["/analyze", "/chat"].includes(url.pathname) || request.method !== "POST") return json({ error: "not_found" }, 404, c.headers);
    if (!c.ok) return json({ error: "origin" }, 403, c.headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, c.headers);

    if (url.pathname === "/chat") {
      let cb;
      try { cb = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }
      const v = validateChat(cb);
      if (v.error) return json({ error: v.error }, 400, c.headers);
      if (await overLimit(request, env, "chat", env.CHAT_LIMIT || "60")) return json({ error: "daily_limit" }, 429, c.headers);
      try {
        const res = await callClaude(env, chatBody(v), "server-side-fallback-2026-07-01");
        if (!res.ok) { const e = upstreamError(res); return json({ error: e.error }, e.status, c.headers); }
        const msg = await res.json();
        if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 422, c.headers);
        const text = (msg.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
        return json({ reply: text || "…", truncated: msg.stop_reason === "max_tokens" }, 200, c.headers);
      } catch {
        return json({ error: "server" }, 500, c.headers);
      }
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400, c.headers); }
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body?.image || "");
    if (!m) return json({ error: "bad_image" }, 400, c.headers);
    if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return json({ error: "image_too_large" }, 413, c.headers);
    if (await overLimit(request, env)) return json({ error: "daily_limit" }, 429, c.headers);
    try {
      const out = await analyzePlan(env, { mediaType: m[1], data: m[2], sheet: body.sheet });
      if (out.error) return json({ error: out.error }, out.status, c.headers);
      return json({ result: out.result }, 200, c.headers);
    } catch {
      return json({ error: "server" }, 500, c.headers);
    }
  }
};
