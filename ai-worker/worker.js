/**
 * Cloudflare Worker – AI ceiling visualization for the ceiling planner.
 *
 * Receives the customer's room photo + the planner choices, builds the prompt
 * on the server (so nobody can use this endpoint for arbitrary prompts), and
 * asks OpenAI's image-edit model to redraw only the ceiling.
 *
 * Environment (Cloudflare dashboard → Worker → Settings → Variables):
 *   OPENAI_API_KEY   (secret, required)
 *   ALLOWED_ORIGINS  e.g. "https://michaelhajaj.github.io"  (comma separated)
 *   OPENAI_IMAGE_MODEL  optional, default "gpt-image-1"
 *   IMAGE_QUALITY       optional: "low" | "medium" | "high"  (default "medium")
 */

const STYLES = {
  floating: "a floating gypsum ceiling: a lowered flat gypsum panel with a recessed shadow gap around it, set back about 35 cm from the walls",
  stepped: "a stepped (tray) gypsum ceiling: a lowered gypsum frame about 60 cm wide along all walls, with a higher recessed center field",
  flat: "a smooth flat lowered gypsum board ceiling from wall to wall with crisp clean edges",
  cove: "a gypsum cornice/cove along the top of all walls that washes the ceiling with indirect light",
  fineline: "a suspended acoustic ceiling made of 60x60 cm white mineral tiles in a thin black fine-line grid",
};
const ROOMS = { living: "living room", bedroom: "bedroom", kitchen: "kitchen", bath: "bathroom", office: "office or classroom", business: "commercial space" };
const LIGHTS = { spots: "small round recessed downlight spots", panels: "flush 60x60 cm LED light panels", track: "slim black magnetic track lights" };
const TEMPS = { warm: "warm white (3000K)", neutral: "neutral white (4000K)", cool: "cool white (6000K)" };

function buildPrompt(p) {
  const parts = [
    `Photorealistic interior renovation visualization of this ${ROOMS[p.room]}.`,
    "Keep the exact same room, camera angle, perspective, walls, windows, doors, floor and furniture as in the photo.",
    `Change only the ceiling into ${STYLES[p.style]}, lowered by about ${p.drop} cm.`,
  ];
  if (p.count > 0) parts.push(`Add ${p.count} ${LIGHTS[p.light]}, evenly spaced in a neat layout.`);
  if (p.led || p.style === "cove") parts.push(`Include a concealed LED strip glowing ${TEMPS[p.temp]} from the ceiling edges.`);
  parts.push("Smooth white painted gypsum, perfectly straight lines, premium finish, realistic soft lighting, high-end architectural interior photography.");
  return parts.join(" ");
}

function cors(origin, allowed) {
  const ok = !allowed.length || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
const json = (obj, status, headers) => new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const h = cors(origin, allowed);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    if (req.method !== "POST") return json({ error: "method" }, 405, h);
    if (allowed.length && !allowed.includes(origin)) return json({ error: "origin" }, 403, h);
    if (!env.OPENAI_API_KEY) return json({ error: "not configured" }, 500, h);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, h); }
    const { image, params = {} } = body || {};
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image || "");
    if (!m || m[2].length > 8_000_000) return json({ error: "bad image" }, 400, h);

    const p = {
      style: STYLES[params.style] ? params.style : "flat",
      room: ROOMS[params.room] ? params.room : "living",
      light: LIGHTS[params.light] ? params.light : "spots",
      temp: TEMPS[params.temp] ? params.temp : "warm",
      count: Math.max(0, Math.min(60, parseInt(params.count, 10) || 0)),
      led: !!params.led,
      drop: Math.max(5, Math.min(120, parseInt(params.drop, 10) || 15)),
    };

    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", env.OPENAI_IMAGE_MODEL || "gpt-image-1");
    form.append("image", new Blob([bytes], { type: m[1] }), "room." + m[1].split("/")[1]);
    form.append("prompt", buildPrompt(p));
    form.append("size", "auto");
    form.append("quality", env.IMAGE_QUALITY || "medium");
    form.append("n", "1");

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.data || !out.data[0] || !out.data[0].b64_json) {
      return json({ error: "ai failed" }, 502, h);
    }
    return json({ image: "data:image/png;base64," + out.data[0].b64_json }, 200, h);
  },
};
