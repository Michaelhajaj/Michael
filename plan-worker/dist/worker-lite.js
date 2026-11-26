// src/prompt.js
var SYSTEM = `You read Israeli architectural drawings (floor plans, reflected ceiling plans, electrical plans) for a drywall (gypsum board) contractor.
From the single drawing image you are given, extract what the contractor needs to plan ceiling grids and stud walls.

Coordinates: every x/y is normalized to 0-1000 across the image (x from the LEFT edge, y from the TOP edge), independent of the image's pixel size. Be as precise as you can - the contractor will place profiles around these points.

What to extract:
- scale: one clearly printed dimension (prefer the longest dimension line with a readable number). Give the two end points of that dimension line and its real length in meters (Israeli drawings are usually in cm, e.g. "420" = 4.20 m). found=false if no readable dimension.
- ceilings: rectangular areas that get a suspended gypsum ceiling (hatched or labeled areas, "\u05EA\u05E7\u05E8\u05EA \u05D2\u05D1\u05E1", "\u05EA.\u05D2", "\u05D4\u05E0\u05DE\u05DB\u05D4", levels like "+2.60"). If the drawing is a floor plan with no ceiling information, return each room as an area. wet=true for bathrooms, toilets, showers, laundry (\u05D0\u05DE\u05D1\u05D8\u05D9\u05D4, \u05E9\u05D9\u05E8\u05D5\u05EA\u05D9\u05DD, \u05DE\u05E7\u05DC\u05D7\u05EA, \u05DB\u05D1\u05D9\u05E1\u05D4). height_cm = finished ceiling height if printed, else 0. drop_cm = drop below the slab if printed, else 0. For non-rectangular rooms, give the bounding rectangle and mention it in notes.
- partitions: NEW gypsum walls only (labeled "\u05D2\u05D1\u05E1", "\u05E7\u05D9\u05E8 \u05D2\u05D1\u05E1", "\u05DE\u05D7\u05D9\u05E6\u05EA \u05D2\u05D1\u05E1", or drawn with the drywall hatch). Each as a center-line segment. lining=true for gypsum lining on an existing wall (\u05D7\u05D9\u05E4\u05D5\u05D9 \u05D2\u05D1\u05E1). height_cm if printed else 0. Do not return existing concrete or block walls as partitions.
- fixtures: ceiling items - recessed spots, round downlights, speakers, sprinklers, smoke detectors, linear light profiles (length_mm = their length), AC supply/return grilles (vent), access panels (panel). Use the legend on the sheet when there is one. One entry per symbol - count carefully.
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
                "vent",
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  };
}
var json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
async function overLimit(request, env) {
  if (!env.LIMITS) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `ai:${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}:${ip}`;
  const used = parseInt(await env.LIMITS.get(key) || "0", 10);
  if (used >= parseInt(env.DAILY_LIMIT || "8", 10)) return true;
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

// src/worker-lite.js
var MODEL = "claude-opus-5-5";
async function analyzePlan(env, { mediaType, data }) {
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
          { type: "text", text: "Extract the drywall-relevant data from this drawing." }
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
    if (url.pathname !== "/analyze" || request.method !== "POST") return json({ error: "not_found" }, 404, c.headers);
    if (!c.ok) return json({ error: "origin" }, 403, c.headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "not_configured" }, 503, c.headers);
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
      const out = await analyzePlan(env, { mediaType: m[1], data: m[2] });
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
