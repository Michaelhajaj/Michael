/* ==========================================================
   plan-worker – זיהוי אוטומטי של תוכנית אדריכלית עם Claude
   POST /analyze  { image: "data:image/jpeg;base64,...", width, height }
   מחזיר JSON מובנה: קנה מידה, תקרות, מחיצות, אביזרי תקרה, אלמנטים בקירות.
   ========================================================== */
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";

const MODEL = "claude-opus-5-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // מגבלת תמונה של ה-API

const num = { type: "number" };
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plan_type", "summary", "spot_cutout_mm", "scale", "ceilings", "partitions", "fixtures", "wall_elements", "notes"],
  properties: {
    plan_type: { type: "string", enum: ["ceiling", "electrical", "floor", "mixed", "other"] },
    summary: { type: "string" },
    spot_cutout_mm: num,
    scale: {
      type: "object", additionalProperties: false,
      required: ["found", "x1", "y1", "x2", "y2", "meters", "label"],
      properties: { found: { type: "boolean" }, x1: num, y1: num, x2: num, y2: num, meters: num, label: { type: "string" } }
    },
    ceilings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "x0", "y0", "x1", "y1", "wet", "height_cm", "drop_cm"],
        properties: { name: { type: "string" }, x0: num, y0: num, x1: num, y1: num, wet: { type: "boolean" }, height_cm: num, drop_cm: num }
      }
    },
    partitions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["x1", "y1", "x2", "y2", "lining", "height_cm"],
        properties: { x1: num, y1: num, x2: num, y2: num, lining: { type: "boolean" }, height_cm: num }
      }
    },
    fixtures: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "x", "y", "length_mm", "confidence"],
        properties: {
          kind: { type: "string", enum: ["spot", "downlight", "speaker", "sprinkler", "detector", "linear", "vent", "panel", "custom"] },
          x: num, y: num, length_mm: num,
          confidence: { type: "string", enum: ["high", "medium", "low"] }
        }
      }
    },
    wall_elements: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "x", "y", "width_mm"],
        properties: { kind: { type: "string", enum: ["door", "window", "box", "switch", "data"] }, x: num, y: num, width_mm: num }
      }
    },
    notes: { type: "array", items: { type: "string" } }
  }
};

const SYSTEM = `You read Israeli architectural drawings (floor plans, reflected ceiling plans, electrical plans) for a drywall (gypsum board) contractor.
From the single drawing image you are given, extract what the contractor needs to plan ceiling grids and stud walls.

Coordinates: every x/y is normalized to 0-1000 across the image (x from the LEFT edge, y from the TOP edge), independent of the image's pixel size. Be as precise as you can - the contractor will place profiles around these points.

What to extract:
- scale: one clearly printed dimension (prefer the longest dimension line with a readable number). Give the two end points of that dimension line and its real length in meters (Israeli drawings are usually in cm, e.g. "420" = 4.20 m). found=false if no readable dimension.
- ceilings: rectangular areas that get a suspended gypsum ceiling (hatched or labeled areas, "תקרת גבס", "ת.ג", "הנמכה", levels like "+2.60"). If the drawing is a floor plan with no ceiling information, return each room as an area. wet=true for bathrooms, toilets, showers, laundry (אמבטיה, שירותים, מקלחת, כביסה). height_cm = finished ceiling height if printed, else 0. drop_cm = drop below the slab if printed, else 0. For non-rectangular rooms, give the bounding rectangle and mention it in notes.
- partitions: NEW gypsum walls only (labeled "גבס", "קיר גבס", "מחיצת גבס", or drawn with the drywall hatch). Each as a center-line segment. lining=true for gypsum lining on an existing wall (חיפוי גבס). height_cm if printed else 0. Do not return existing concrete or block walls as partitions.
- fixtures: ceiling items - recessed spots, round downlights, speakers, sprinklers, smoke detectors, linear light profiles (length_mm = their length), AC supply/return grilles (vent), access panels (panel). Use the legend on the sheet when there is one. One entry per symbol - count carefully.
- wall_elements: doors (width_mm from the plan, e.g. 80/90 cm), windows, and on electrical plans power outlets (box), switches (switch), and data/TV/phone points (data) - placed at the point on the wall.
- notes: short Hebrew notes about anything uncertain (unclear symbols, missing scale, parts of the sheet that are cut off).
- spot_cutout_mm: the largest recessed-spot cut-out diameter in mm if the legend or a note states it (e.g. "ספוט קוטר 8 ס\"מ" = 80), else 0.
- summary: one or two Hebrew sentences describing the sheet.

Report only what you can see. If something is unclear, lower its confidence or leave it out and say so in notes rather than guessing.`;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin || "");
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok && origin ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

async function overLimit(request, env) {
  if (!env.LIMITS) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `ai:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = parseInt(await env.LIMITS.get(key) || "0", 10);
  if (used >= parseInt(env.DAILY_LIMIT || "8", 10)) return true;
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

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
