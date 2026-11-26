// src/prompt.js
var SYSTEM = `You read Israeli architectural drawings (floor plans, reflected ceiling plans, electrical plans) for a drywall (gypsum board) contractor.
From the single drawing image you are given, extract what the contractor needs to plan ceiling grids and stud walls.

Coordinates: every x/y is normalized to 0-1000 across the image (x from the LEFT edge, y from the TOP edge), independent of the image's pixel size. Be as precise as you can - the contractor will place profiles around these points.

What to extract:
- scale: one clearly printed dimension (prefer the longest dimension line with a readable number). Give the two end points of that dimension line and its real length in meters (Israeli drawings are usually in cm, e.g. "420" = 4.20 m). found=false if no readable dimension.
- ceilings: rectangular areas that get a suspended gypsum ceiling (hatched or labeled areas, "\u05EA\u05E7\u05E8\u05EA \u05D2\u05D1\u05E1", "\u05EA.\u05D2", "\u05D4\u05E0\u05DE\u05DB\u05D4", levels like "+2.60"). If the drawing is a floor plan with no ceiling information, return each room as an area. wet=true for bathrooms, toilets, showers, laundry (\u05D0\u05DE\u05D1\u05D8\u05D9\u05D4, \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD, \u05DE\u05E7\u05DC\u05D7\u05EA, \u05DB\u05D1\u05D9\u05E1\u05D4). height_cm = finished ceiling height if printed, else 0. drop_cm = drop below the slab if printed, else 0. For non-rectangular rooms, give the bounding rectangle and mention it in notes.
- partitions: NEW gypsum walls only (labeled "\u05D2\u05D1\u05E1", "\u05E7\u05D9\u05E8 \u05D2\u05D1\u05E1", "\u05DE\u05D7\u05D9\u05E6\u05EA \u05D2\u05D1\u05E1", or drawn with the drywall hatch). Each as a center-line segment. lining=true for gypsum lining on an existing wall (\u05D7\u05D9\u05E4\u05D5\u05D9 \u05D2\u05D1\u05E1). height_cm if printed else 0. Do not return existing concrete or block walls as partitions.
- fixtures: ceiling items - recessed spots, round downlights, speakers, sprinklers, smoke detectors, linear light profiles (linear, length_mm = their length), recessed magnetic track profiles (magnetic, length_mm), linear slot AC diffusers (slot, length_mm), AC supply/return grilles (vent), indoor AC units above the ceiling (acunit), access panels (panel). Use the legend on the sheet when there is one. One entry per symbol - count carefully.
- wall_elements: doors (width_mm from the plan, e.g. 80/90 cm), windows, and on electrical plans power outlets (box), switches (switch), and data/TV/phone points (data) - placed at the point on the wall.
- notes: short Hebrew notes about anything uncertain (unclear symbols, missing scale, parts of the sheet that are cut off).
- spot_cutout_mm: the largest recessed-spot cut-out diameter in mm if the legend or a note states it (e.g. "\u05E1\u05E4\u05D5\u05D8 \u05E7\u05D5\u05D8\u05E8 8 \u05E1"\u05DE" = 80), else 0.
- summary: one or two Hebrew sentences describing the sheet.

Report only what you can see. If something is unclear, lower its confidence or leave it out and say so in notes rather than guessing.`;

// src/schema-wire.js
var WIRE_FORMAT = {
  "type": "json_schema",
  "schema": {
    "type": "object",
    "properties": {
      "plan_type": {
        "enum": [
          "ceiling",
          "electrical",
          "floor",
          "mixed",
          "other"
        ]
      },
      "summary": {
        "type": "string"
      },
      "spot_cutout_mm": {
        "type": "number"
      },
      "scale": {
        "type": "object",
        "properties": {
          "found": {
            "type": "boolean"
          },
          "x1": {
            "type": "number"
          },
          "y1": {
            "type": "number"
          },
          "x2": {
            "type": "number"
          },
          "y2": {
            "type": "number"
          },
          "meters": {
            "type": "number"
          },
          "label": {
            "type": "string"
          }
        },
        "additionalProperties": false,
        "required": [
          "found",
          "x1",
          "y1",
          "x2",
          "y2",
          "meters",
          "label"
        ]
      },
      "ceilings": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "x0": {
              "type": "number"
            },
            "y0": {
              "type": "number"
            },
            "x1": {
              "type": "number"
            },
            "y1": {
              "type": "number"
            },
            "wet": {
              "type": "boolean"
            },
            "height_cm": {
              "type": "number"
            },
            "drop_cm": {
              "type": "number"
            }
          },
          "additionalProperties": false,
          "required": [
            "name",
            "x0",
            "y0",
            "x1",
            "y1",
            "wet",
            "height_cm",
            "drop_cm"
          ]
        }
      },
      "partitions": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "x1": {
              "type": "number"
            },
            "y1": {
              "type": "number"
            },
            "x2": {
              "type": "number"
            },
            "y2": {
              "type": "number"
            },
            "lining": {
              "type": "boolean"
            },
            "height_cm": {
              "type": "number"
            }
          },
          "additionalProperties": false,
          "required": [
            "x1",
            "y1",
            "x2",
            "y2",
            "lining",
            "height_cm"
          ]
        }
      },
      "fixtures": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "spot",
                "downlight",
                "speaker",
                "sprinkler",
                "detector",
                "linear",
                "magnetic",
                "slot",
                "vent",
                "acunit",
                "panel",
                "custom"
              ]
            },
            "x": {
              "type": "number"
            },
            "y": {
              "type": "number"
            },
            "length_mm": {
              "type": "number"
            },
            "confidence": {
              "enum": [
                "high",
                "medium",
                "low"
              ]
            }
          },
          "additionalProperties": false,
          "required": [
            "kind",
            "x",
            "y",
            "length_mm",
            "confidence"
          ]
        }
      },
      "wall_elements": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "kind": {
              "enum": [
                "door",
                "window",
                "box",
                "switch",
                "data"
              ]
            },
            "x": {
              "type": "number"
            },
            "y": {
              "type": "number"
            },
            "width_mm": {
              "type": "number"
            }
          },
          "additionalProperties": false,
          "required": [
            "kind",
            "x",
            "y",
            "width_mm"
          ]
        }
      },
      "notes": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "additionalProperties": false,
    "required": [
      "plan_type",
      "summary",
      "spot_cutout_mm",
      "scale",
      "ceilings",
      "partitions",
      "fixtures",
      "wall_elements",
      "notes"
    ]
  }
};

// src/http.js
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "https://michaelhajaj.github.io").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin || "");
  return {
    ok,
    headers: {
      "Access-Control-Allow-Origin": ok && origin ? origin : allowed[0] || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  };
}
var json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
async function overLimit(request, env, bucket = "ai", limit = env.DAILY_LIMIT || "8") {
  if (!env.LIMITS) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${bucket}:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}:${ip}`;
  const used = parseInt(await env.LIMITS.get(key) || "0", 10);
  if (used >= parseInt(limit, 10)) return true;
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

// src/chat.js
var CHAT_SYSTEM = `You are the AI drywall consultant on the website of Michael Hajaj, an Israeli gypsum-board (drywall) contractor serving Ashdod and the area. Visitors are homeowners, architects and other installers planning gypsum ceilings, partitions and wall linings.

Language and style:
- Always answer in Hebrew, in plain words a homeowner understands, and keep professional terms the trade uses in Israel (\u05E0\u05D9\u05E6\u05D1, \u05DE\u05E1\u05D9\u05DC\u05D4, F47, C60, \u05E9\u05EA\u05D9 \u05D5\u05E2\u05E8\u05D1, \u05DE\u05EA\u05DC\u05D4, \u05E7\u05D5\u05E4\u05E8\u05D9\u05D1\u05E0\u05D3, \u05DC\u05D5\u05D7 \u05D9\u05E8\u05D5\u05E7, \u05E1\u05E4\u05D5\u05D8, \u05E4\u05E1 \u05DE\u05D9\u05D6\u05D5\u05D2, \u05E4\u05E8\u05D5\u05E4\u05D9\u05DC \u05E0\u05D9\u05EA\u05D5\u05E7, \u05E4\u05E8\u05D5\u05E4\u05D9\u05DC \u05DE\u05D2\u05E0\u05D8\u05D9, \u05E7\u05E8\u05E0\u05D9\u05D6).
- Be short and practical: a direct answer first, then a few bullet points with numbers. No long essays.
- When the question is missing what matters (room type, wet or dry, span, height, what goes in the ceiling), ask one or two focused questions instead of guessing.
- If a "project context" block is attached, use it: refer to the user's actual rooms, walls and warnings.

Accuracy:
- Base answers on the Israeli standard SI 1924 (2011) and the manufacturers' instructions. The key numbers you may rely on are below. Say which source a number comes from.
- If you are not sure of a value, say so and recommend checking the manufacturer's sheet or an engineer. Never invent clause numbers or values.
- Structural questions (load-bearing, heavy hanging loads, seismic, fire ratings) need an engineer or the manufacturer's tested system; say so.

Key requirements (SI 1924 unless noted):
- Partitions: studs at most 600 mm apart for 1200-wide vertical boards; at most 406 mm in wet rooms, under tiles, or with horizontal boards. Studs one piece, about 10 mm shorter than the gap between tracks. Tracks fixed to floor/ceiling every 600 mm max (300 mm in wet rooms); end studs fixed to walls every 600 mm.
- Max partition height (Table 1, 0.6 mm studs, spacing 610/406/305 mm): single layer 12.7 board: C50 3.5/3.6/3.7 m, C70 4.2/4.4/4.5 m, C100 5.1/5.2/5.4 m. Double layer 12.7: C50 4.1/4.2/4.3, C70 4.9/5.0/5.1, C100 5.9/6.0/6.1 m. Above that: engineering design.
- Sealing/separation strip (\u05E7\u05D5\u05E4\u05E8\u05D9\u05D1\u05E0\u05D3) along every junction of the metal frame with floor, ceiling and walls, in every room; continuous one piece in wet rooms (3.3.1.2).
- Wet rooms: partitions stand on a raised concrete curb (\u05D7\u05D2\u05D5\u05E8\u05EA \u05D4\u05D2\u05D1\u05D4\u05D4, e.g. a row of concrete-filled blocks) (3.2.2); water-resistant (green) boards; seal the 10-15 mm gap under the boards; gypsum-based (not lime-based) joint compound on untiled areas; no vapour barrier in wet-room ceilings.
- Boards: minimum 12.7 mm in a single-layer partition; boards 10-15 mm above the finished floor; no point where 4 boards meet; joints of the two sides not on the same stud; tapered edge to tapered edge, cut to cut, never tapered to cut; joints at least 150 mm from door/window corners (L-shaped board around the opening).
- Screws, vertical boards: about 250 mm at board edges and 300 mm in the field (Tambour recommends about 250 mm everywhere); 10 mm from long edges, 100 mm from short edges; at least 10 mm through the metal. Ceiling screws at most 200 mm apart.
- Doors: jamb studs of 1.25 mm steel or a stud filled with timber full height, anchored with 1.5 mm angles (3.5).
- Pipes: only through the stud holes, water pipes in a plastic sleeve; never cut stud flanges; never fix pipes to the board (3.7).
- Tiles on gypsum: up to 30 kg/m2, and up to 85 kg per running metre on a single-layer partition (115 kg double layer).
- Expansion joints about every 12 m in partitions and ceilings.
- Ceilings, cross grid (\u05E9\u05EA\u05D9 \u05D5\u05E2\u05E8\u05D1, F47 or C60): secondary profiles at most 500 mm apart with 12.7 boards across them (550 mm with 15.9), 406 mm when boards run parallel and in wet rooms; primary profiles at most 1000 mm apart; hangers at most 1000 mm apart along the primary, the first at most 400 mm from the wall (Knauf F47 sheet: 250 mm); each hanger at most 200 N; top fixings tested to 4x the load and at least 800 N.
- Stud-and-track ceilings (\u05EA\u05E7\u05E8\u05EA \u05D6\u05E7\u05E4\u05D9\u05DD \u05D5\u05DE\u05E1\u05D9\u05DC\u05D5\u05EA, self-spanning between two walls, Table 4): max span between the tracks with 0.6 mm studs: C50 1.70 m, C70 2.00 m, C100 2.40 m; studs face alternately. Larger spans need hangers or a cross grid.
- Items in the ceiling: up to 3 kg may hang from the board itself (one per m2), up to 5 kg through the board into the frame; heavier items (AC units, large fixtures) hang separately from the structure. Openings wider than the profile spacing (slot diffusers, access panels, large fittings) need trimming: cut the profile and frame the opening.
- Finish levels: basic (joints and screw heads), good (thin skim over everything), excellent (thick skim over everything).

The business:
- Michael plans and installs gypsum ceilings, partitions, niches, lighting coves, acoustic ceilings and decorative plaster. When someone wants a quote or an installation, suggest the WhatsApp button on the site.
- The site's planner (\u05DE\u05EA\u05DB\u05E0\u05DF \u05D4\u05D2\u05D1\u05E1) lays out studs and profiles around spots, speakers and outlets and produces a bill of materials; suggest it when someone needs quantities.`;
var MAX_TURNS = 20;
var MAX_CHARS = 4e3;
var MAX_CONTEXT = 8e3;
function validateChat(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages.slice(-MAX_TURNS) : null;
  if (!msgs || !msgs.length) return { error: "bad_messages" };
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m || m.role !== "user" && m.role !== "assistant" || typeof m.content !== "string" || !m.content.trim()) return { error: "bad_messages" };
    if (m.content.length > MAX_CHARS) return { error: "message_too_long" };
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return { error: "bad_messages" };
  for (let i = 1; i < msgs.length; i++) if (msgs[i].role === msgs[i - 1].role) return { error: "bad_messages" };
  const context = typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT) : "";
  return { msgs, context };
}
function chatBody({ msgs, context }) {
  const messages = msgs.map((m, i) => {
    const last = i === msgs.length - 1;
    if (!last || !context) return { role: m.role, content: m.content };
    return { role: "user", content: [
      { type: "text", text: `<project_context>
${context}
</project_context>` },
      { type: "text", text: m.content }
    ] };
  });
  return {
    model: "claude-opus-5-5",
    max_tokens: 4e3,
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    output_config: { effort: "medium" },
    system: CHAT_SYSTEM,
    messages
  };
}
var SHEET_HINTS = {
  gypsum: "This sheet is the GYPSUM / ceiling plan: focus on ceiling areas, levels, bulkheads and new gypsum partitions.",
  lighting: "This sheet is the LIGHTING plan: focus on every light fixture (spots, downlights, linear profiles, magnetic tracks, LED coves). Return ceilings only if clearly drawn.",
  speakers: "This sheet is the SPEAKERS / audio plan: focus on ceiling speakers. Return ceilings only if clearly drawn.",
  hvac: "This sheet is the AIR-CONDITIONING plan: focus on supply/return grilles, linear slot diffusers (length) and indoor units / access panels.",
  electrical: "This sheet is the ELECTRICAL plan: focus on outlets, switches, data/TV points and doors on the partitions.",
  other: ""
};

// src/worker-lite.js
var MODEL = "claude-opus-5-5";
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
      max_tokens: 16e3,
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
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { result: JSON.parse(text) };
  } catch {
    return { error: "parse_failed", status: 502 };
  }
}
var worker_lite_default = {
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
      try {
        cb = await request.json();
      } catch {
        return json({ error: "bad_json" }, 400, c.headers);
      }
      const v = validateChat(cb);
      if (v.error) return json({ error: v.error }, 400, c.headers);
      if (await overLimit(request, env, "chat", env.CHAT_LIMIT || "60")) return json({ error: "daily_limit" }, 429, c.headers);
      try {
        const res = await callClaude(env, chatBody(v), "server-side-fallback-2026-07-01");
        if (!res.ok) {
          const e = upstreamError(res);
          return json({ error: e.error }, e.status, c.headers);
        }
        const msg = await res.json();
        if (msg.stop_reason === "refusal") return json({ error: "refusal" }, 422, c.headers);
        const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        return json({ reply: text || "\u2026", truncated: msg.stop_reason === "max_tokens" }, 200, c.headers);
      } catch {
        return json({ error: "server" }, 500, c.headers);
      }
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400, c.headers);
    }
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
export {
  worker_lite_default as default
};
