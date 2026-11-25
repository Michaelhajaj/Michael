/**
 * Cloudflare Worker – paid AI ceiling visualization (Grow / Meshulam + OpenAI).
 *
 * Flow:
 *   1. POST /checkout   site sends photo + planner choices + name/phone.
 *                       Worker stores the job (KV), opens a Grow payment process
 *                       and returns the Grow payment page URL.
 *   2. POST /notify     Grow server-to-server callback after payment. The worker
 *                       re-checks the payment with Grow (using the process token it
 *                       stored, never data from the request), approves it, and marks
 *                       the job as paid.
 *   3. GET  /result     site polls after returning from Grow. If the job is paid the
 *                       image is generated once (OpenAI) and cached.
 *
 * Bindings / variables (Cloudflare → Worker → Settings):
 *   JOBS               KV namespace binding (required)
 *   OPENAI_API_KEY     secret (required)
 *   GROW_PAGE_CODE     secret, from Grow (required)
 *   GROW_USER_ID       secret, from Grow (required)
 *   GROW_API_BASE      "https://sandbox.meshulam.co.il/api/light/server/1.0" for testing,
 *                      "https://secure.meshulam.co.il/api/light/server/1.0" for live
 *   SITE_URL           e.g. "https://michaelhajaj.github.io/Michael/planner.html"
 *   ALLOWED_ORIGINS    e.g. "https://michaelhajaj.github.io"
 *   PRICE              price in ILS, default "5"
 *   OPENAI_IMAGE_MODEL optional, default "gpt-image-1"
 *   IMAGE_QUALITY      optional, "low" | "medium" | "high" (default "medium")
 *
 * NOTE: Grow field names follow developers.grow.business ("light server" API).
 * Confirm them against the docs/credentials Grow sends you and test in sandbox first.
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
const JOB_TTL = 60 * 60 * 24 * 3; // 3 days

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

function cleanParams(params = {}) {
  return {
    style: STYLES[params.style] ? params.style : "flat",
    room: ROOMS[params.room] ? params.room : "living",
    light: LIGHTS[params.light] ? params.light : "spots",
    temp: TEMPS[params.temp] ? params.temp : "warm",
    count: Math.max(0, Math.min(60, parseInt(params.count, 10) || 0)),
    led: !!params.led,
    drop: Math.max(5, Math.min(120, parseInt(params.drop, 10) || 15)),
  };
}

const corsHeaders = (origin, allowed) => ({
  "Access-Control-Allow-Origin": !allowed.length || allowed.includes(origin) ? origin || "*" : "null",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});
const json = (obj, status, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
// Grow rejects special characters in parameters – keep only Hebrew/Latin letters, digits, spaces
const safeText = (s, max) => String(s || "").replace(/[^֐-׿a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

async function grow(env, method, fields) {
  const form = new FormData();
  form.append("pageCode", env.GROW_PAGE_CODE);
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, String(v));
  const r = await fetch(`${env.GROW_API_BASE}/${method}`, { method: "POST", body: form });
  const out = await r.json().catch(() => ({}));
  return out;
}

async function generateImage(env, job) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(job.image);
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  const form = new FormData();
  form.append("model", env.OPENAI_IMAGE_MODEL || "gpt-image-1");
  form.append("image", new Blob([bytes], { type: m[1] }), "room." + m[1].split("/")[1]);
  form.append("prompt", buildPrompt(job.params));
  form.append("size", "auto");
  form.append("quality", env.IMAGE_QUALITY || "medium");
  form.append("n", "1");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.data || !out.data[0] || !out.data[0].b64_json) throw new Error("ai failed");
  return "data:image/png;base64," + out.data[0].b64_json;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const h = corsHeaders(origin, allowed);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const price = Number(env.PRICE || 5);

    /* ---- 1. checkout ---- */
    if (url.pathname === "/checkout" && req.method === "POST") {
      if (allowed.length && !allowed.includes(origin)) return json({ error: "origin" }, 403, h);
      let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, h); }
      const img = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image || "") && body.image.length < 8_000_000;
      const name = safeText(body.name, 40), phone = String(body.phone || "").replace(/\D/g, "");
      if (!img) return json({ error: "bad image" }, 400, h);
      if (name.length < 2 || !/^0\d{8,9}$/.test(phone)) return json({ error: "bad contact" }, 400, h);

      const id = crypto.randomUUID();
      const site = env.SITE_URL;
      const res = await grow(env, "createPaymentProcess", {
        userId: env.GROW_USER_ID,
        sum: price,
        chargeType: 1,
        description: "Hadmayat AI tikrat geves",
        successUrl: `${site}?job=${id}`,
        cancelUrl: `${site}?job=${id}&cancel=1`,
        notifyUrl: `${url.origin}/notify?job=${id}`,
        "pageField[fullName]": name,
        "pageField[phone]": phone,
        cField1: id,
      });
      if (res.status !== 1 || !res.data || !res.data.url) return json({ error: "payment init failed" }, 502, h);
      await env.JOBS.put(id, JSON.stringify({
        image: body.image, params: cleanParams(body.params), name, phone,
        processId: res.data.processId, processToken: res.data.processToken,
        paid: false, created: Date.now(),
      }), { expirationTtl: JOB_TTL });
      return json({ id, url: res.data.url }, 200, h);
    }

    /* ---- 2. Grow server callback ---- */
    if (url.pathname === "/notify" && req.method === "POST") {
      const id = url.searchParams.get("job") || "";
      const raw = await env.JOBS.get(id);
      if (!raw) return new Response("ok");
      const job = JSON.parse(raw);
      if (job.paid) return new Response("ok");
      // Never trust the callback body: ask Grow about the process we created.
      const info = await grow(env, "getPaymentProcessInfo", { processId: job.processId, processToken: job.processToken });
      const t = info && info.status === 1 && info.data ? (info.data.transactions ? info.data.transactions[0] : info.data) : null;
      const paidOk = t && Number(t.sum) >= price && String(t.statusCode ?? t.status_code ?? t.status) === "2";
      if (!paidOk) return new Response("ok");
      await grow(env, "approveTransaction", {
        transactionId: t.transactionId, transactionToken: t.transactionToken,
        transactionTypeId: t.transactionTypeId, paymentType: t.paymentType, sum: t.sum,
        firstPaymentSum: t.firstPaymentSum, periodicalPaymentSum: t.periodicalPaymentSum,
        paymentsNum: t.paymentsNum, allPaymentsNum: t.allPaymentsNum, paymentDate: t.paymentDate,
        asmachta: t.asmachta, description: t.description, fullName: t.fullName, payerPhone: t.payerPhone,
        payerEmail: t.payerEmail, cardSuffix: t.cardSuffix, cardType: t.cardType, cardTypeCode: t.cardTypeCode,
        cardBrand: t.cardBrand, cardBrandCode: t.cardBrandCode, cardExp: t.cardExp,
        processId: job.processId, processToken: job.processToken,
      });
      job.paid = true; job.paidAt = Date.now();
      await env.JOBS.put(id, JSON.stringify(job), { expirationTtl: JOB_TTL });
      // start generating right away so the customer waits less
      ctx.waitUntil(ensureImage(env, id));
      return new Response("ok");
    }

    /* ---- 3. result polling ---- */
    if (url.pathname === "/result" && req.method === "GET") {
      const id = url.searchParams.get("job") || "";
      const raw = await env.JOBS.get(id);
      if (!raw) return json({ state: "missing" }, 404, h);
      const job = JSON.parse(raw);
      if (!job.paid) return json({ state: "waiting_payment" }, 200, h);
      const done = await env.JOBS.get(id + ":img");
      if (done) return json({ state: "done", image: done }, 200, h);
      if (job.failed) return json({ state: "failed" }, 200, h);
      ctx.waitUntil(ensureImage(env, id));
      return json({ state: "generating" }, 200, h);
    }

    return json({ error: "not found" }, 404, h);
  },
};

async function ensureImage(env, id) {
  if (await env.JOBS.get(id + ":lock") || await env.JOBS.get(id + ":img")) return;
  await env.JOBS.put(id + ":lock", "1", { expirationTtl: 300 });
  const job = JSON.parse(await env.JOBS.get(id));
  try {
    const img = await generateImage(env, job);
    await env.JOBS.put(id + ":img", img, { expirationTtl: JOB_TTL });
  } catch (e) {
    job.attempts = (job.attempts || 0) + 1;
    if (job.attempts >= 2) job.failed = true;
    await env.JOBS.put(id, JSON.stringify(job), { expirationTtl: JOB_TTL });
    await env.JOBS.delete(id + ":lock");
  }
}
