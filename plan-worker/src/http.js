/* כלי עזר משותפים: CORS, תשובות JSON, מגבלה יומית */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // מגבלת תמונה של ה-API

export function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "https://michaelhajaj.github.io").split(",").map(s => s.trim()).filter(Boolean);
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
export const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

export async function overLimit(request, env, bucket = "ai", limit = env.DAILY_LIMIT || "8") {
  if (!env.LIMITS) return false;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${bucket}:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const used = parseInt(await env.LIMITS.get(key) || "0", 10);
  if (used >= parseInt(limit, 10)) return true;
  await env.LIMITS.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

