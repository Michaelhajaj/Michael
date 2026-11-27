/* ==========================================================
   מתכנן הגבס החכם – עורך תוכניות, תוצאות, תשלום
   ========================================================== */
(function () {
  const R = window.GYPSUM_RULES, E = window.GypsumEngine;
  const CFG = (typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : window.SITE_CONFIG) || {};
  const PAY = Object.assign({ prices: [35, 30, 25], maxPlans: 10, paypal: "", bit: "", paybox: "", card: "", unlockHashes: [] }, CFG.payments || {});
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const fmt = (n, d = 0) => Number(n).toLocaleString("he-IL", { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const STORE = "gp-project-v1";

  /* ---------------- State ---------------- */
  const S = {
    plans: [], cur: 0, tool: "select", sel: null, pending: null,
    unlocked: false, order: "", results: {}, prices: {}, ruleset: "si1924", spotD: 0
  };
  const plan = () => S.plans[S.cur];

  function newPlan(name) {
    return { id: uid(), name: name || `תוכנית ${S.plans.length + 1}`, img: null, imgW: 0, imgH: 0, mpp: 0.01, calibrated: false,
      roomH: 2.7, items: [], view: null };
  }

  function defaultsCeiling() {
    return { thickness: 12.5, layers: 1, boardType: "regular", wet: false, boardLen: 2600, dir: "auto", profile: "F47",
      dropCm: 15, insulation: false, finish: "basic", secondarySpacing: 0, primarySpacing: 0, avoidPrimaries: true, name: "" };
  }
  function defaultsWall(lining) {
    return { height: Math.round(plan().roomH * 1000), profile: lining ? "F47" : "C70", layers: 1, sides: lining ? 1 : 2, thickness: 12.5,
      boardType: "regular", wet: false, tiles: false, insulation: !lining, boardLen: 3000, spacing: 0, finish: "basic", lining: !!lining, name: "" };
  }

  /* ---------------- Persistence ---------------- */
  function save() {
    const data = { plans: S.plans.map(p => ({ ...p, view: null })), cur: S.cur, order: S.order, unlocked: S.unlocked && !PAY.free, prices: S.prices, ruleset: S.ruleset, spotD: S.spotD };
    try { localStorage.setItem(STORE, JSON.stringify(data)); }
    catch (e) { try { localStorage.setItem(STORE, JSON.stringify({ ...data, plans: data.plans.map(p => ({ ...p, img: null })) })); } catch (_) {} }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (d && Array.isArray(d.plans) && d.plans.length) {
        S.plans = d.plans; S.cur = Math.min(d.cur || 0, d.plans.length - 1); S.order = d.order || ""; S.unlocked = !!d.unlocked; S.prices = d.prices || {}; S.ruleset = d.ruleset || "si1924"; S.spotD = d.spotD || 0;
      }
    } catch (_) {}
    if (PAY.free) S.unlocked = true;
    if (!S.order) S.order = "GP-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  /* ---------------- Canvas ---------------- */
  const cv = $("#cv"), ctx = cv.getContext("2d"), wrap = $("#canvasWrap");
  let DPR = 1, imgCache = {};
  function view() {
    const p = plan();
    if (!p.view) p.view = { z: 60, tx: 40, ty: 40 };
    return p.view;
  }
  const toScreen = (x, y) => { const v = view(); return [x * v.z + v.tx, y * v.z + v.ty]; };
  const toWorld = (sx, sy) => { const v = view(); return [(sx - v.tx) / v.z, (sy - v.ty) / v.z]; };

  function resize() {
    const r = wrap.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    cv.width = Math.max(10, r.width * DPR); cv.height = Math.max(10, r.height * DPR);
    draw();
  }
  function getImg(p) {
    if (!p.img) return null;
    if (imgCache[p.id]?.src === p.img) return imgCache[p.id].el;
    const el = new Image(); el.onload = draw; el.src = p.img;
    imgCache[p.id] = { src: p.img, el };
    return el;
  }
  function fit() {
    const p = plan(), r = wrap.getBoundingClientRect();
    let bw = 8, bh = 6, ox = 0, oy = 0;
    if (p.img) { bw = p.imgW * p.mpp; bh = p.imgH * p.mpp; }
    else if (p.items.length) {
      const pts = p.items.flatMap(it => it.type === "ceiling" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.a.x, it.a.y], [it.b.x, it.b.y]]);
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      ox = Math.min(...xs) - 1; oy = Math.min(...ys) - 1; bw = Math.max(...xs) - ox + 1; bh = Math.max(...ys) - oy + 1;
    }
    const z = Math.min((r.width - 40) / bw, (r.height - 40) / bh);
    p.view = { z, tx: (r.width - bw * z) / 2 - ox * z, ty: (r.height - bh * z) / 2 - oy * z };
    draw();
  }

  const COLORS = { ceil: "rgba(201,165,92,.12)", ceilLine: "#a7843c", sec: "#2c6fb0", pri: "#c0392b", hanger: "#111", board: "rgba(60,140,90,.55)",
    wall: "#2a2a27", stud: "#2c6fb0", sel: "#e0a526", ok: "#3c8c5a", clash: "#d0402b", trim: "#d08a1a", joint: "#d08a1a" };

  function draw() {
    if (!S.plans.length) return;
    const p = plan(), v = view();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = cv.width / DPR, H = cv.height / DPR;
    ctx.clearRect(0, 0, W, H);
    // grid (1 m)
    ctx.save();
    const step = v.z >= 25 ? 1 : 5;
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    ctx.strokeStyle = "rgba(0,0,0,.05)"; ctx.lineWidth = 1;
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { const [sx] = toScreen(x, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { const [, sy] = toScreen(0, y); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke(); }
    ctx.restore();
    // plan
    const img = getImg(p);
    if (img && img.complete && $("#lyPlan").checked) {
      ctx.globalAlpha = .85;
      const [sx, sy] = toScreen(0, 0);
      ctx.drawImage(img, sx, sy, p.imgW * p.mpp * v.z, p.imgH * p.mpp * v.z);
      ctx.globalAlpha = 1;
    }
    (p.sheets || []).forEach(sh => {
      if (!sh.visible || !$("#lyPlan").checked) return;
      const el = getImg(sh); if (!el || !el.complete) return;
      const f = sheetScale(p, sh), [sx, sy] = toScreen(sh.dx, sh.dy);
      ctx.globalAlpha = sh.opacity ?? .6;
      ctx.drawImage(el, sx, sy, sh.imgW * f * v.z, sh.imgH * f * v.z);
      ctx.globalAlpha = 1;
    });
    p.items.forEach(it => it.type === "ceiling" ? drawCeiling(it) : drawWall(it));
    drawPending();
  }

  function ceilLocalToWorld(it, res, x, y) {
    return res.swap ? [it.x + y / 1000, it.y + x / 1000] : [it.x + x / 1000, it.y + y / 1000];
  }
  function line(ax, ay, bx, by) { const [a, b] = toScreen(ax, ay), [c, d] = toScreen(bx, by); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }

  function drawCeiling(it) {
    const res = S.results[it.id], v = view();
    const [sx, sy] = toScreen(it.x, it.y);
    const isSel = S.sel?.item === it.id;
    ctx.fillStyle = COLORS.ceil; ctx.fillRect(sx, sy, it.w * v.z, it.h * v.z);
    if (res) {
      const L = (x0, y0, x1, y1) => { const a = ceilLocalToWorld(it, res, x0, y0), b = ceilLocalToWorld(it, res, x1, y1); line(a[0], a[1], b[0], b[1]); };
      if ($("#lyBoards").checked) {
        ctx.strokeStyle = COLORS.board; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        res.boards.filter(b => b.layer === res.opts.layers).forEach(b => {
          const a = ceilLocalToWorld(it, res, b.x, b.y), c = ceilLocalToWorld(it, res, b.x + b.w, b.y + b.h);
          const [p, q] = toScreen(Math.min(a[0], c[0]), Math.min(a[1], c[1]));
          ctx.strokeRect(p + 1, q + 1, Math.abs(c[0] - a[0]) * v.z - 2, Math.abs(c[1] - a[1]) * v.z - 2);
        });
      }
      if ($("#lyProfiles").checked) {
        ctx.lineWidth = 1.6; ctx.strokeStyle = COLORS.pri; ctx.setLineDash([8, 4]);
        res.primaries.forEach(y => L(0, y, res.W, y));
        ctx.setLineDash([]); ctx.strokeStyle = COLORS.sec;
        res.secondaries.forEach(s => s.segs.forEach(([a, b]) => L(s.x, a, s.x, b)));
        ctx.strokeStyle = COLORS.trim; ctx.lineWidth = 2;
        res.trims.forEach(t => { L(t.x - 20, t.y - 20, t.x - 20, t.y + t.h + 20); L(t.x + t.w + 20, t.y - 20, t.x + t.w + 20, t.y + t.h + 20); L(t.x - 20, t.y - 20, t.x + t.w + 20, t.y - 20); L(t.x - 20, t.y + t.h + 20, t.x + t.w + 20, t.y + t.h + 20); });
      }
      if ($("#lyHangers").checked) {
        res.hangers.forEach(h => { const [wx, wy] = ceilLocalToWorld(it, res, h.x, h.y); const [p, q] = toScreen(wx, wy); ctx.fillStyle = h.extra ? COLORS.clash : COLORS.hanger; ctx.beginPath(); ctx.moveTo(p - 4, q - 4); ctx.lineTo(p + 4, q + 4); ctx.moveTo(p + 4, q - 4); ctx.lineTo(p - 4, q + 4); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.stroke(); });
      }
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = isSel ? COLORS.sel : COLORS.ceilLine; ctx.lineWidth = isSel ? 3 : 2;
    ctx.strokeRect(sx, sy, it.w * v.z, it.h * v.z);
    // fixtures
    const fr = res ? Object.fromEntries(res.fixtures.map(f => [f.id, f])) : {};
    it.fixtures.forEach(f => {
      const spec = R.fixtures[f.kind] || R.fixtures.custom;
      const st = fr[f.id]?.status || "ok";
      const [p, q] = toScreen(it.x + f.x, it.y + f.y);
      ctx.fillStyle = COLORS[st] || COLORS.ok; ctx.strokeStyle = S.sel?.fix === f.id ? COLORS.sel : "#fff"; ctx.lineWidth = 2;
      ctx.setLineDash(f.ai === "low" ? [3, 2] : []); if (f.ai === "low" && S.sel?.fix !== f.id) ctx.strokeStyle = "#7a5a12";
      if (spec.d && !f.w) {
        const r = Math.max(5, (f.d || spec.d) / 2000 * v.z);
        ctx.beginPath(); ctx.arc(p, q, r, 0, 7); ctx.fill(); ctx.stroke();
      } else {
        const w = Math.max(8, (f.w || spec.w) / 1000 * v.z), h = Math.max(6, (f.h || spec.h) / 1000 * v.z);
        const ww = f.rot ? h : w, hh = f.rot ? w : h;
        ctx.fillRect(p - ww / 2, q - hh / 2, ww, hh); ctx.strokeRect(p - ww / 2, q - hh / 2, ww, hh);
      }
      ctx.setLineDash([]);
    });
    label(it.x + it.w / 2, it.y + 0.05, (it.opts.name || "תקרה") + ` · ${fmt(it.w, 2)}×${fmt(it.h, 2)}`, "top");
  }

  function wallGeom(it) {
    const dx = it.b.x - it.a.x, dy = it.b.y - it.a.y, len = Math.hypot(dx, dy) || 1e-6;
    return { dx, dy, len, ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len };
  }
  function drawWall(it) {
    const g = wallGeom(it), res = S.results[it.id], v = view();
    const thick = ((R.profiles[it.opts.profile]?.width || 70) + 2 * it.opts.layers * it.opts.thickness * (it.opts.sides)) / 1000;
    const isSel = S.sel?.item === it.id;
    const off = it.opts.lining ? thick / 2 : 0;
    const pts = [[-1, 0], [1, 0]].map(() => 0);
    const corner = (t, s) => [it.a.x + g.ux * t + g.nx * (s + off), it.a.y + g.uy * t + g.ny * (s + off)];
    ctx.beginPath();
    [[0, -thick / 2], [g.len, -thick / 2], [g.len, thick / 2], [0, thick / 2]].forEach(([t, s], i) => { const [p, q] = toScreen(...corner(t, s)); i ? ctx.lineTo(p, q) : ctx.moveTo(p, q); });
    ctx.closePath();
    ctx.fillStyle = it.opts.lining ? "rgba(120,110,90,.35)" : "rgba(42,42,39,.25)"; ctx.fill();
    ctx.strokeStyle = isSel ? COLORS.sel : COLORS.wall; ctx.lineWidth = isSel ? 3 : 1.5; ctx.stroke();
    if (res && $("#lyProfiles").checked) {
      ctx.strokeStyle = COLORS.stud; ctx.lineWidth = 2;
      res.studs.forEach(s => {
        const t = s.x / 1000;
        ctx.strokeStyle = s.type === "jamb" ? COLORS.clash : s.type === "cripple" ? "#7aa7d6" : COLORS.stud;
        const a = corner(t, -thick / 2), b = corner(t, thick / 2); line(a[0], a[1], b[0], b[1]);
      });
    }
    it.elements.forEach(e => {
      const spec = R.wallElements[e.kind] || R.wallElements.box;
      const w = (e.w || spec.w) / 1000;
      const sel = S.sel?.el === e.id;
      const et = (R.wallElements[e.kind] || {}).type;
      if (et === "door" || et === "opening") {
        ctx.strokeStyle = sel ? COLORS.sel : (et === "door" ? "#8a5a2b" : "#3a7fb8"); ctx.lineWidth = 5;
        const a = corner(e.pos - w / 2, 0), b = corner(e.pos + w / 2, 0); line(a[0], a[1], b[0], b[1]);
      } else {
        const st = res?.warnings.some(m => m.includes(`${((e.pos * 1000) / 10).toFixed(0)} ס״מ`)) ? "clash" : "ok";
        const [p, q] = toScreen(...corner(e.pos, thick / 2 + 0.06));
        ctx.fillStyle = COLORS[st]; ctx.strokeStyle = sel ? COLORS.sel : "#fff"; ctx.lineWidth = 2;
        ctx.fillRect(p - 5, q - 5, 10, 10); ctx.strokeRect(p - 5, q - 5, 10, 10);
      }
    });
    const [mx, my] = [it.a.x + g.dx / 2 + g.nx * (thick + .15), it.a.y + g.dy / 2 + g.ny * (thick + .15)];
    label(mx, my, `${it.opts.name || (it.opts.lining ? "חיפוי" : "מחיצה")} · ${fmt(g.len, 2)} מ׳`);
  }
  function label(x, y, text, base) {
    const [p, q] = toScreen(x, y);
    ctx.font = "600 12px Assistant, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = base || "middle";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(p - w / 2, q - (base ? 0 : 9), w, 18);
    ctx.fillStyle = "#222"; ctx.fillText(text, p, q + (base ? 3 : 0));
  }
  function drawPending() {
    const pd = S.pending; if (!pd) return;
    ctx.strokeStyle = COLORS.sel; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    if (pd.kind === "rect" && pd.b) {
      const [a, b] = toScreen(pd.a[0], pd.a[1]), [c, d] = toScreen(pd.b[0], pd.b[1]);
      ctx.strokeRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
      label((pd.a[0] + pd.b[0]) / 2, (pd.a[1] + pd.b[1]) / 2, `${fmt(Math.abs(pd.b[0] - pd.a[0]), 2)} × ${fmt(Math.abs(pd.b[1] - pd.a[1]), 2)} מ׳`);
    }
    if ((pd.kind === "line" || pd.kind === "cal") && pd.b) {
      line(pd.a[0], pd.a[1], pd.b[0], pd.b[1]);
      label((pd.a[0] + pd.b[0]) / 2, (pd.a[1] + pd.b[1]) / 2, `${fmt(Math.hypot(pd.b[0] - pd.a[0], pd.b[1] - pd.a[1]), 2)} מ׳`);
    }
    ctx.setLineDash([]);
  }

  /* ---------------- Interaction ---------------- */
  const HELP = {
    select: "לחצו על פריט כדי לערוך אותו. גוררים אביזר או קופסה כדי להזיז. גרירה על רקע מזיזה את התצוגה, וגלגלת מגדילה.",
    calibrate: "קנה מידה: לחצו על תחילת מידה ידועה בתוכנית, ואחר כך על סופה.",
    ceiling: "גררו מלבן על אזור התקרה.",
    wall: "לחצו על נקודת התחלה ואחר כך על נקודת סיום של המחיצה (הקו ננעל ל-0°/90°).",
    lining: "לחצו על תחילת הקיר שמחפים ועל סופו.",
    fixture: "לחצו בתוך תקרה כדי להוסיף את האביזר שבחרתם.",
    element: "לחצו על מחיצה כדי להוסיף דלת, חלון, שקע או מפסק."
  };
  function setTool(t) {
    S.tool = t; S.pending = null;
    $$("#toolbar [data-tool]").forEach(b => b.classList.toggle("is-on", b.dataset.tool === t));
    $("#toolHelp").textContent = HELP[t] || "";
    wrap.style.cursor = t === "select" ? "grab" : "crosshair";
    draw();
  }
  function snapPt(w, from) {
    let [x, y] = w;
    const tol = 12 / view().z;
    // נעילה לנקודות קיימות
    const pts = plan().items.flatMap(it => it.type === "ceiling" ? [[it.x, it.y], [it.x + it.w, it.y], [it.x, it.y + it.h], [it.x + it.w, it.y + it.h]] : [[it.a.x, it.a.y], [it.b.x, it.b.y]]);
    const near = pts.find(p => Math.hypot(p[0] - x, p[1] - y) < tol);
    if (near) return [near[0], near[1]];
    if (from) { if (Math.abs(x - from[0]) < Math.abs(y - from[1])) x = from[0]; else y = from[1]; }
    const g = 0.01; return [Math.round(x / g) * g, Math.round(y / g) * g];
  }
  function hitTest(w) {
    const p = plan(), [x, y] = w, tol = 10 / view().z;
    for (const it of [...p.items].reverse()) {
      if (it.type === "ceiling") {
        const f = it.fixtures.find(f => Math.hypot(it.x + f.x - x, it.y + f.y - y) < Math.max(tol, ((f.d || f.w || R.fixtures[f.kind]?.d || R.fixtures[f.kind]?.w || 100) / 2000)));
        if (f) return { item: it.id, fix: f.id };
      } else {
        const g = wallGeom(it);
        const t = (x - it.a.x) * g.ux + (y - it.a.y) * g.uy, d = Math.abs((x - it.a.x) * g.nx + (y - it.a.y) * g.ny);
        const e = it.elements.find(e => Math.abs(t - e.pos) < Math.max(tol, (e.w || 100) / 2000) && d < 0.3);
        if (e) return { item: it.id, el: e.id };
        if (t > -tol && t < g.len + tol && d < Math.max(tol, 0.12)) return { item: it.id };
      }
    }
    for (const it of [...p.items].reverse()) if (it.type === "ceiling" && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return { item: it.id };
    return null;
  }
  const getItem = id => plan().items.find(i => i.id === id);

  let drag = null;
  const pointers = new Map();
  cv.addEventListener("pointerdown", ev => {
    cv.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view().z }; return; }
    const w = toWorld(ev.offsetX, ev.offsetY);
    const t = S.tool;
    if (t === "select") {
      const h = hitTest(w);
      S.sel = h;
      renderProps();
      if (h && (h.fix || h.el)) drag = { move: h, start: w };
      else if (h && !h.fix && !h.el && getItem(h.item)?.type === "ceiling" && ev.altKey) drag = { moveCeil: h.item, start: w };
      else drag = { pan: true, sx: ev.offsetX, sy: ev.offsetY, tx: view().tx, ty: view().ty };
      draw();
    } else if (t === "ceiling") {
      S.pending = { kind: "rect", a: snapPt(w), b: null }; drag = { rect: true };
    } else if (t === "wall" || t === "lining" || t === "calibrate") {
      const kind = t === "calibrate" ? "cal" : "line";
      if (!S.pending) S.pending = { kind, tool: t, a: t === "calibrate" ? w : snapPt(w), b: null };
      else finishLine(t === "calibrate" ? w : snapPt(w, S.pending.a));
    } else if (t === "fixture") {
      addFixture(w);
    } else if (t === "element") {
      addElement(w);
    }
  });
  cv.addEventListener("pointermove", ev => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    const w = toWorld(ev.offsetX, ev.offsetY);
    if (drag?.pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, drag.z * d / drag.pinch / view().z); return; }
    if (S.pending && !drag?.rect && (S.pending.kind === "line" || S.pending.kind === "cal")) { S.pending.b = S.pending.kind === "cal" ? w : snapPt(w, S.pending.a); draw(); return; }
    if (!drag) return;
    if (drag.pan) { const v = view(); v.tx = drag.tx + ev.offsetX - drag.sx; v.ty = drag.ty + ev.offsetY - drag.sy; draw(); }
    if (drag.rect) { S.pending.b = snapPt(w); draw(); }
    if (drag.move) {
      const it = getItem(drag.move.item);
      if (drag.move.fix) {
        const f = it.fixtures.find(f => f.id === drag.move.fix);
        f.x = clamp(Math.round((w[0] - it.x) * 100) / 100, 0, it.w); f.y = clamp(Math.round((w[1] - it.y) * 100) / 100, 0, it.h);
      } else {
        const g = wallGeom(it), e = it.elements.find(e => e.id === drag.move.el);
        e.pos = clamp(Math.round(((w[0] - it.a.x) * g.ux + (w[1] - it.a.y) * g.uy) * 100) / 100, 0, g.len);
      }
      drag.moved = true;
      computeItem(it); draw();
    }
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (drag?.rect && S.pending?.b) {
      const [a, b] = [S.pending.a, S.pending.b];
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      if (w > 0.3 && h > 0.3) {
        const it = { id: uid(), type: "ceiling", x, y, w: round2(w), h: round2(h), opts: defaultsCeiling(), fixtures: [] };
        plan().items.push(it); S.sel = { item: it.id }; computeItem(it); changed();
      }
      S.pending = null;
    }
    if (drag?.move && drag.moved) changed();
    drag = pointers.size ? drag : null;
    draw();
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  const round2 = v => Math.round(v * 100) / 100;

  function finishLine(b) {
    const pd = S.pending; const a = pd.a; S.pending = null;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (pd.tool === "calibrate") {
      const p = plan();
      const ans = prompt("מה האורך האמיתי של הקו שסימנתם? (במטרים, למשל 4.20)", "");
      const real = parseFloat(String(ans || "").replace(",", "."));
      if (real > 0 && len > 0) {
        rescalePlan(p, real / len);
        computeAll(); fit(); changed();
      }
      setTool("select"); return;
    }
    if (len < 0.2) return;
    const it = { id: uid(), type: "wall", a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, opts: defaultsWall(pd.tool === "lining"), elements: [] };
    plan().items.push(it); S.sel = { item: it.id }; computeItem(it); changed();
  }
  function rescalePlan(p, factor) {
    p.mpp *= factor; p.calibrated = true;
    p.items.forEach(it => {
      if (it.type === "ceiling") { it.x *= factor; it.y *= factor; it.w = round2(it.w * factor); it.h = round2(it.h * factor); it.fixtures.forEach(f => { f.x *= factor; f.y *= factor; }); }
      else { ["a", "b"].forEach(k => { it[k].x *= factor; it[k].y *= factor; }); it.elements.forEach(e => e.pos *= factor); }
    });
  }

  /* ---------------- AI plan detection ---------------- */
  const AI_ERRORS = {
    daily_limit: "הגעתם למכסת הזיהויים היומית. אפשר להמשיך לסמן ידנית, או לנסות שוב מחר.",
    busy: "השרת עמוס כרגע. נסו שוב בעוד דקה.",
    refusal: "לא הצלחנו לנתח את התמונה הזו. נסו עמוד אחר של התוכנית.",
    too_long: "התוכנית מורכבת מדי לזיהוי בבת אחת. נסו לחתוך לאזור קטן יותר.",
    image_too_large: "התמונה גדולה מדי.",
    not_configured: "הזיהוי האוטומטי עוד לא הופעל בשרת.",
    origin: "השרת לא מאשר בקשות מהכתובת הזו."
  };
  function aiBar(html, error) {
    const b = $("#aiBar"); b.hidden = !html; b.innerHTML = html || ""; b.classList.toggle("is-error", !!error);
  }
  // גיליונות נוספים (תאורה / רמקולים / מיזוג / חשמל) מונחים על התוכנית הראשית
  const SHEET_KINDS = { gypsum: "תוכנית גבס / תקרות", lighting: "תוכנית תאורה", speakers: "תוכנית רמקולים", hvac: "תוכנית מיזוג", electrical: "תוכנית חשמל", other: "אחר" };
  function sheetScale(p, sh) { return sh === p.base ? p.mpp : (p.imgW * p.mpp / sh.imgW) * (sh.k || 1); }
  function baseSheet(p) { return { img: p.img, imgW: p.imgW, imgH: p.imgH, dx: 0, dy: 0, k: 1, kind: p.baseKind || "other", id: "base" }; }
  async function aiDetect(sheetId) {
    const p = plan();
    if (!p.img) { flashHelp("הזיהוי האוטומטי עובד על תוכנית שהועלתה (PDF או תמונה)."); return; }
    const sh = (typeof sheetId === "string" && sheetId !== "base") ? (p.sheets || []).find(x => x.id === sheetId) : null;
    const src = sh || baseSheet(p);
    if (!CFG.planAiEndpoint) { aiBar("הזיהוי האוטומטי עוד לא הופעל באתר. בינתיים אפשר לסמן ידנית.", true); return; }
    const btn = $("#aiBtn"); btn.disabled = true; btn.textContent = "🤖 מנתח את התוכנית…";
    aiBar("Claude קורא את התוכנית: מקרא, מידות, תקרות, מחיצות, ספוטים ושקעים. זה לוקח בדרך כלל 30–90 שניות.");
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src.img; });
      const k = Math.min(1, 2400 / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
      const r = await fetch(CFG.planAiEndpoint.replace(/\/$/, "") + "/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: c.toDataURL("image/jpeg", 0.85), width: c.width, height: c.height, sheet: src.kind })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.result) { aiBar(AI_ERRORS[data.error] || "הזיהוי נכשל. נסו שוב, או סמנו ידנית.", true); return; }
      applyAi(p, data.result, sh);
    } catch (e) {
      aiBar("אין חיבור לשרת הזיהוי. בדקו את החיבור ונסו שוב.", true);
    } finally { btn.disabled = false; btn.textContent = "🤖 זיהוי אוטומטי"; }
  }
  function applyAi(p, r, sh) {
    const snapshot = JSON.stringify({ items: p.items, mpp: p.mpp, calibrated: p.calibrated, roomH: p.roomH });
    const src = sh || baseSheet(p);
    const toPx = (x, y) => [x / 1000 * src.imgW, y / 1000 * src.imgH];
    // מה לקחת מכל סוג גיליון: מגיליון תאורה/רמקולים/מיזוג – רק אביזרים (ותקרות אם עוד אין)
    const hasCeil = p.items.some(i => i.type === "ceiling"), hasWall = p.items.some(i => i.type === "wall");
    const kind = src.kind || "other";
    const takeCeil = ["gypsum", "other"].includes(kind) || !hasCeil;
    const takeWall = ["gypsum", "electrical", "other"].includes(kind) || !hasWall;
    let scaleMsg = "";
    if (!sh && r.scale?.found && r.scale.meters > 0 && !p.calibrated) {
      const [a, b] = toPx(r.scale.x1, r.scale.y1), [c, d] = toPx(r.scale.x2, r.scale.y2);
      const dpx = Math.hypot(c - a, d - b);
      if (dpx > 20) { rescalePlan(p, (r.scale.meters / dpx) / p.mpp); scaleMsg = `קנה מידה לפי המידה "${esc(r.scale.label)}" (${fmt(r.scale.meters, 2)} מ׳). כדאי לוודא עם 📏.`; }
    }
    if (!scaleMsg) scaleMsg = p.calibrated ? "קנה המידה הקיים נשמר." : "⚠ לא נמצאה מידה קריאה. כיילו קנה מידה ידנית (📏) לפני שמזמינים חומר.";
    const f0 = sheetScale(p, sh || p.base);
    const toW = (x, y) => { const [px, py] = toPx(x, y); return sh ? [px * f0 + sh.dx, py * f0 + sh.dy] : [px * p.mpp, py * p.mpp]; };
    const added = { ceilings: 0, walls: 0, fixtures: 0, elements: 0, skipped: 0 };
    (takeCeil ? r.ceilings || [] : []).forEach(cg => {
      const [x0, y0] = toW(Math.min(cg.x0, cg.x1), Math.min(cg.y0, cg.y1)), [x1, y1] = toW(Math.max(cg.x0, cg.x1), Math.max(cg.y0, cg.y1));
      if (x1 - x0 < 0.4 || y1 - y0 < 0.4) return;
      const opts = { ...defaultsCeiling(), name: cg.name || "", wet: !!cg.wet };
      if (cg.drop_cm > 0) opts.dropCm = Math.round(cg.drop_cm);
      if (cg.height_cm > 0 && !(cg.drop_cm > 0)) { const d = Math.round(p.roomH * 100 - cg.height_cm); if (d >= 5 && d <= 120) opts.dropCm = d; }
      p.items.push({ id: uid(), type: "ceiling", x: round2(x0), y: round2(y0), w: round2(x1 - x0), h: round2(y1 - y0), opts, fixtures: [], ai: true });
      added.ceilings++;
    });
    (takeWall ? r.partitions || [] : []).forEach(pt => {
      const a = toW(pt.x1, pt.y1), b = toW(pt.x2, pt.y2);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) return;
      const opts = defaultsWall(!!pt.lining);
      if (pt.height_cm > 0) opts.height = Math.round(pt.height_cm * 10);
      p.items.push({ id: uid(), type: "wall", a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, opts, elements: [], ai: true });
      added.walls++;
    });
    (r.fixtures || []).forEach(fx => {
      const [x, y] = toW(fx.x, fx.y);
      const it = p.items.filter(i => i.type === "ceiling").find(i => x >= i.x - 0.05 && x <= i.x + i.w + 0.05 && y >= i.y - 0.05 && y <= i.y + i.h + 0.05);
      if (!it) { added.skipped++; return; }
      const spec = R.fixtures[fx.kind] || R.fixtures.custom;
      // אותו אביזר כבר קיים מגיליון אחר (עד 15 ס״מ) – לא מכפילים
      if (it.fixtures.some(o => o.kind === fx.kind && Math.hypot(it.x + o.x - x, it.y + o.y - y) < 0.15)) { added.dup = (added.dup || 0) + 1; return; }
      const f = { id: uid(), kind: R.fixtures[fx.kind] ? fx.kind : "custom", x: round2(clamp(x - it.x, 0, it.w)), y: round2(clamp(y - it.y, 0, it.h)), kg: spec.kg, ai: fx.confidence };
      if (spec.d) f.d = spec.d; else { f.w = fx.length_mm > 0 ? Math.round(fx.length_mm) : spec.w; f.h = spec.h; }
      it.fixtures.push(f); added.fixtures++;
    });
    const walls = p.items.filter(i => i.type === "wall");
    (r.wall_elements || []).forEach(el => {
      const w = toW(el.x, el.y); let best = null, bd = 0.6;
      walls.forEach(it => {
        const g = wallGeom(it), t = (w[0] - it.a.x) * g.ux + (w[1] - it.a.y) * g.uy, d = Math.abs((w[0] - it.a.x) * g.nx + (w[1] - it.a.y) * g.ny);
        if (t >= 0 && t <= g.len && d < bd) { bd = d; best = { it, t }; }
      });
      if (!best) { added.skipped++; return; }
      if (best.it.elements.some(o => o.kind === el.kind && Math.abs(o.pos - best.t) < 0.15)) { added.dup = (added.dup || 0) + 1; return; }
      const spec = R.wallElements[el.kind] || R.wallElements.box;
      best.it.elements.push({ id: uid(), kind: el.kind, pos: round2(best.t), w: el.width_mm > 0 && ["door", "opening"].includes((R.wallElements[el.kind] || {}).type) ? Math.round(el.width_mm) : spec.w, h: spec.h, y: spec.y, ai: true });
      added.elements++;
    });
    // מחיצה שנוגעת בחדר רטוב – מסומנת כרטובה (חגורת הגבהה, ניצבים כל 40)
    const wetC = p.items.filter(i => i.type === "ceiling" && i.ai && i.opts.wet);
    p.items.filter(i => i.type === "wall" && i.ai).forEach(wl => {
      const mx = (wl.a.x + wl.b.x) / 2, my = (wl.a.y + wl.b.y) / 2;
      if (wetC.some(c => mx >= c.x - 0.15 && mx <= c.x + c.w + 0.15 && my >= c.y - 0.15 && my <= c.y + c.h + 0.15)) wl.opts.wet = true;
    });
    if (r.spot_cutout_mm > 0 && !S.spotD) { S.spotD = Math.round(r.spot_cutout_mm); syncSpot(); }
    S.sel = null; setTool("select"); computeAll(); fit(); changed();
    const notes = (r.notes || []).slice(0, 6).map(n => `<li>${esc(n)}</li>`).join("");
    aiBar(`<div class="gp-aibar__row"><b>🤖 זוהו:</b> ${added.ceilings} תקרות · ${added.walls} מחיצות/חיפויים · ${added.fixtures} אביזרי תקרה · ${added.elements} פתחים ונקודות חשמל${added.skipped ? ` · ${added.skipped} לא שובצו` : ""}${added.dup ? ` · ${added.dup} כפולים מגיליון אחר דולגו` : ""} · מתוך ${esc(SHEET_KINDS[kind] || "")}
      <button type="button" class="gp-del" id="aiUndo">ביטול הזיהוי</button><button type="button" class="gp-del" id="aiClose">סגירה</button></div>
      ${r.summary ? `<div>${esc(r.summary)}</div>` : ""}<div>${scaleMsg}</div>
      <div>חשוב לעבור על התוצאה: אפשר לגרור אביזרים, למחוק ולהוסיף. פריטים עם מסגרת מקווקוות זוהו בביטחון נמוך.</div>${notes ? `<ul>${notes}</ul>` : ""}`);
    $("#aiUndo").onclick = () => { const s0 = JSON.parse(snapshot); p.items = s0.items; p.mpp = s0.mpp; p.calibrated = s0.calibrated; p.roomH = s0.roomH; S.sel = null; computeAll(); fit(); changed(); aiBar(""); };
    $("#aiClose").onclick = () => aiBar("");
    updateScaleInfo();
  }
  $("#aiBtn").onclick = () => aiDetect("base");

  function addFixture(w) {
    const p = plan();
    const it = [...p.items].reverse().find(it => it.type === "ceiling" && w[0] >= it.x && w[0] <= it.x + it.w && w[1] >= it.y && w[1] <= it.y + it.h);
    if (!it) { flashHelp("לחצו בתוך אזור תקרה (סמנו קודם תקרה)."); return; }
    const kind = $("#fixKind").value, spec = R.fixtures[kind];
    if (spec.askD && !S.spotD) {
      const ans = prompt("מה קוטר החיתוך של הספוט הגדול ביותר בפרויקט? (מ״מ, מדף היצרן)", "75");
      const v = parseFloat(ans); if (v > 0) { S.spotD = Math.round(v); syncSpot(); }
    }
    const f = { id: uid(), kind, x: round2(w[0] - it.x), y: round2(w[1] - it.y), kg: spec.kg };
    if (spec.d) f.d = spec.askD && S.spotD ? S.spotD : spec.d; else { f.w = spec.w; f.h = spec.h; }
    if (spec.ask) {   // מידה שחייבת להגיע מהתוכנית / מהלקוח
      const v = parseFloat(prompt(spec.ask + "\n(אם לא מופיע בתוכנית – לשאול את הלקוח)", String(spec.h)));
      if (v > 0) f.h = Math.round(v);
      const len = parseFloat(prompt("אורך (ס״מ)", String(spec.w / 10)));
      if (len > 0) f.w = Math.round(len * 10);
    }
    it.fixtures.push(f); S.sel = { item: it.id, fix: f.id }; computeItem(it); changed();
  }
  function addElement(w) {
    const p = plan(); let best = null, bd = 0.5;
    p.items.filter(i => i.type === "wall").forEach(it => {
      const g = wallGeom(it), t = (w[0] - it.a.x) * g.ux + (w[1] - it.a.y) * g.uy, d = Math.abs((w[0] - it.a.x) * g.nx + (w[1] - it.a.y) * g.ny);
      if (t >= 0 && t <= g.len && d < bd) { bd = d; best = { it, t }; }
    });
    if (!best) { flashHelp("לחצו קרוב למחיצה (סמנו קודם מחיצה)."); return; }
    const kind = $("#elKind").value, spec = R.wallElements[kind];
    const e = { id: uid(), kind, pos: round2(best.t), w: spec.w, h: spec.h, y: spec.y };
    best.it.elements.push(e); S.sel = { item: best.it.id, el: e.id }; computeItem(best.it); changed();
  }
  function flashHelp(t) { const h = $("#toolHelp"); h.textContent = t; h.style.background = "#f6dccf"; setTimeout(() => { h.style.background = ""; h.textContent = HELP[S.tool]; }, 2200); }

  function zoomAt(sx, sy, k) {
    const v = view(), [wx, wy] = toWorld(sx, sy);
    v.z = clamp(v.z * k, 2, 2000); v.tx = sx - wx * v.z; v.ty = sy - wy * v.z; draw();
  }
  cv.addEventListener("wheel", ev => { ev.preventDefault(); zoomAt(ev.offsetX, ev.offsetY, ev.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  $("#zoomIn").onclick = () => zoomAt(cv.width / DPR / 2, cv.height / DPR / 2, 1.3);
  $("#zoomOut").onclick = () => zoomAt(cv.width / DPR / 2, cv.height / DPR / 2, 1 / 1.3);
  $("#zoomFit").onclick = fit;
  $("#delBtn").onclick = deleteSel;
  document.addEventListener("keydown", ev => {
    if (ev.target.closest("input,select,textarea")) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { deleteSel(); ev.preventDefault(); }
    if (ev.key === "Escape") { S.pending = null; setTool("select"); }
  });
  function deleteSel() {
    const s = S.sel; if (!s) return;
    const it = getItem(s.item); if (!it) return;
    if (s.fix) it.fixtures = it.fixtures.filter(f => f.id !== s.fix);
    else if (s.el) it.elements = it.elements.filter(e => e.id !== s.el);
    else { plan().items = plan().items.filter(i => i !== it); delete S.results[it.id]; }
    S.sel = s.fix || s.el ? { item: it.id } : null;
    if (getItem(it.id)) computeItem(it);
    changed();
  }
  $$("#toolbar [data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
  ["#lyProfiles", "#lyBoards", "#lyHangers", "#lyPlan"].forEach(s => $(s).onchange = draw);

  /* ---------------- Compute ---------------- */
  function computeItem(it) {
    try {
      if (it.type === "ceiling") {
        S.results[it.id] = E.ceiling({ w: Math.round(it.w * 1000), h: Math.round(it.h * 1000),
          fixtures: it.fixtures.map(f => ({ ...f, x: f.x * 1000, y: f.y * 1000, w: f.rot ? f.h : f.w, h: f.rot ? f.w : f.h })), opts: { ...it.opts, ruleset: S.ruleset, spotD: S.spotD } });
      } else {
        const g = wallGeom(it);
        S.results[it.id] = E.wall({ L: Math.round(g.len * 1000), elements: it.elements.map(e => ({ ...e, pos: e.pos * 1000 })), opts: { ...it.opts, ruleset: S.ruleset } });
      }
    } catch (e) { console.error(e); delete S.results[it.id]; }
  }
  function computeAll() { S.results = {}; S.plans.forEach(p => p.items.forEach(computeItem)); }

  let tChanged;
  function changed() {
    draw(); renderProps(); renderTabs();
    clearTimeout(tChanged);
    tChanged = setTimeout(() => { renderResults(); save(); }, 120);
  }

  /* ---------------- Properties panel ---------------- */
  const fieldDefs = {
    ceiling: [
      ["name", "שם / חדר", "text"],
      ["w", "אורך (מ׳)", "num", 0.01], ["h", "רוחב (מ׳)", "num", 0.01],
      ["dropCm", "הנמכה (ס״מ)", "num", 1],
      ["profile", "מערכת התקרה", "sel", { F47: "F47 שתי וערב (תלויה)", C60: "C60 שתי וערב (תלויה)", C50: "זקפים C50 בין קירות – עד 1.70 מ׳", C70: "זקפים C70 בין קירות – עד 2.00 מ׳", C100: "זקפים C100 בין קירות – עד 2.40 מ׳" }],
      ["perimeter", "פרט היקפי", "sel", { none: "מסילה רגילה", str: "STR – תקרה מרחפת (אלומיניום)", knife: "ויה ביזונה (סכין) – קו לד נסתר", shadow: "פרופיל ניתוק (צל)", cove: "קרניז לד נסתר" }],
      ["strGap", "STR – גודל הניתוק (מ״מ)", "num", 1],
      ["strThk", "STR – דגם / גובה H", "sel", { "H7": "STR H=7 מ״מ", "H13": "STR H=13 מ״מ", "H20": "STR H=20 מ״מ", "H25": "STR H=25 מ״מ", "1.2": "עובי 1.2", "2.0": "עובי 2.0", "אחר": "אחר – לפי התוכנית" }],
      ["strColor", "STR – גימור", "sel", { "לבן": "לבן", "שחור": "שחור", "אנודייז כסף מט": "אנודייז (כסף מט)", "RAL": "גוון RAL לפי הזמנה" }],
      ["shadowModel", "פרופיל ניתוק – דגם", "sel", { "TAF H13": "TAF H=13", "TAF H25": "TAF H=25", "OM H8": "אומגה OM H=8", "OM H13": "אומגה OM H=13", "OM H25": "אומגה OM H=25", "TAFG 12×12": "TAFG פרופיל ת׳ 12×12 (ג.ק.)", "אחר": "אחר – לפי התוכנית" }],
      ["thickness", "עובי לוח", "sel", { 12.5: "12.5 מ״מ", 15.9: "15.9 מ״מ" }],
      ["layers", "שכבות לוחות", "sel", { 1: "שכבה אחת", 2: "שתי שכבות" }],
      ["boardType", "סוג לוח", "sel", Object.fromEntries(Object.entries(R.board.types).map(([k, v]) => [k, v.name]))],
      ["boardLen", "אורך לוח", "sel", Object.fromEntries(R.board.lengths.map(l => [l, `120×${l / 10}`]))],
      ["dir", "כיוון המשניים", "sel", { auto: "אוטומטי (לאורך הצלע הקצרה)", x: "לאורך הרוחב", y: "לאורך האורך" }],
      ["secondarySpacing", "מרחק משניים (מ״מ, 0 = לפי התקן)", "num", 10],
      ["primarySpacing", "מרחק ראשיים (מ״מ, 0 = 1000)", "num", 10],
      ["finish", "רמת גימור", "sel", Object.fromEntries(Object.entries(R.finish).map(([k, v]) => [k, v.name]))],
      ["wet", "חדר רטוב (אמבטיה / שירותים)", "chk"], ["insulation", "בידוד אקוסטי מעל התקרה", "chk"],
      ["avoidPrimaries", "להתחמק גם עם הראשיים (גופים עמוקים)", "chk"]
    ],
    wall: [
      ["name", "שם", "text"],
      ["height", "גובה (מ״מ)", "num", 10],
      ["profile", "פרופיל", "sel", { C50: "ניצב 50", C70: "ניצב 70", C100: "ניצב 100" }],
      ["layers", "שכבות בכל צד", "sel", { 1: "שכבה אחת", 2: "שתי שכבות" }],
      ["sides", "צדדים מחופים", "sel", { 2: "שני צדדים", 1: "צד אחד" }],
      ["thickness", "עובי לוח", "sel", { 12.5: "12.5 מ״מ", 15.9: "15.9 מ״מ" }],
      ["boardType", "סוג לוח", "sel", Object.fromEntries(Object.entries(R.board.types).map(([k, v]) => [k, v.name]))],
      ["boardLen", "אורך לוח", "sel", Object.fromEntries(R.board.lengths.map(l => [l, `120×${l / 10}`]))],
      ["spacing", "מרחק ניצבים (מ״מ, 0 = לפי התקן)", "num", 10],
      ["finish", "רמת גימור", "sel", Object.fromEntries(Object.entries(R.finish).map(([k, v]) => [k, v.name]))],
      ["wet", "חדר רטוב", "chk"], ["tiles", "חיפוי אריחים", "chk"], ["insulation", "בידוד בחלל המחיצה", "chk"],
      ["skirting", "פנל / ניתוק ברצפה", "sel", { none: "ללא", "PSG-U H50": "פנל שקוע עם ניתוק PSG-U H=50", "PSG-U H70": "פנל שקוע עם ניתוק PSG-U H=70", "PSG-U H100": "פנל שקוע עם ניתוק PSG-U H=100", "BFG H55": "פנל ניתוק BFG H=55", "STR": "STR כפס ניתוק קיר-רצפה" }],
      ["wallEnd", "קצה מחיצה חופשי", "sel", { none: "נגמרת בקיר בשני הצדדים", "edge3": "פרופיל קצה 3 מ״מ", "edge4": "פרופיל קצה 4 מ״מ (מקל סבא)", "corner": "פינת מגן בלבד" }],
      ["plasterJoint", "ניתוק מול טיח בקצוות", "sel", { none: "ללא", "U H10": "פרופיל U ניתוק גבס-טיח H=10", "U H15": "פרופיל U H=15", "U H20": "פרופיל U H=20" }]
    ]
  };
  fieldDefs.lining = fieldDefs.wall.map(f => f[0] === "profile" ? ["profile", "פרופיל", "sel", { F47: "F47 (על זוויתנים)", C60: "C60", C50: "ניצב 50 עצמאי" }] : f).filter(f => f[0] !== "sides" && f[0] !== "insulation");

  function fieldHtml(def, val) {
    const [k, lab, type, extra] = def;
    if (type === "chk") return `<label class="gp-f gp-f--row"><input type="checkbox" data-k="${k}" ${val ? "checked" : ""}><span>${lab}</span></label>`;
    if (type === "sel") return `<label class="gp-f"><span>${lab}</span><select data-k="${k}">${Object.entries(extra).map(([v, t]) => `<option value="${v}" ${String(val) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    return `<label class="gp-f"><span>${lab}</span><input data-k="${k}" type="${type === "num" ? "number" : "text"}" ${type === "num" ? `step="${extra}" min="0" inputmode="decimal"` : ""} value="${esc(val)}"></label>`;
  }

  function renderProps() {
    const el = $("#props");
    if (!S.plans.length) { el.innerHTML = ""; return; }
    const p = plan();
    const s = S.sel, it = s && getItem(s.item);
    if (!it) {
      el.innerHTML = `<h4>${esc(p.name)}</h4><p class="gp-sub">${p.calibrated ? "קנה מידה מכויל ✓" : (p.img ? "⚠ כיילו קנה מידה לפני הסימון (📏)" : "שרטוט על רשת, משבצת = 1 מ׳")}</p>
        <label class="gp-f"><span>שם התוכנית</span><input id="pName" value="${esc(p.name)}"></label>
        <label class="gp-f"><span>גובה החדר עד תקרת הבטון (מ׳)</span><input id="pRoomH" type="number" step="0.01" value="${p.roomH}"></label>
        ${p.img ? `<hr><p class="gp-sub">גיליונות בתוכנית (מניחים תוכנית תאורה / רמקולים / מיזוג על תוכנית הגבס)</p>
        <div class="gp-sheet"><b>ראשי</b><select data-sk="base">${Object.entries(SHEET_KINDS).map(([k, t]) => `<option value="${k}" ${(p.baseKind || "other") === k ? "selected" : ""}>${t}</option>`).join("")}</select><button class="gp-del" data-ai="base">🤖 זיהוי</button></div>
        ${(p.sheets || []).map(sh => `<div class="gp-sheet" data-sh="${sh.id}">
          <label><input type="checkbox" data-sv ${sh.visible ? "checked" : ""}> <b>${esc(sh.name)}</b></label>
          <select data-sk="${sh.id}">${Object.entries(SHEET_KINDS).map(([k, t]) => `<option value="${k}" ${sh.kind === k ? "selected" : ""}>${t}</option>`).join("")}</select>
          <label class="gp-sheet__row">שקיפות <input type="range" min="10" max="100" value="${Math.round((sh.opacity ?? .6) * 100)}" data-so></label>
          <div class="gp-sheet__row gp-2"><label>הזזה X (ס״מ)<input type="number" step="1" value="${Math.round(sh.dx * 100)}" data-sdx></label><label>הזזה Y (ס״מ)<input type="number" step="1" value="${Math.round(sh.dy * 100)}" data-sdy></label></div>
          <label class="gp-sheet__row">קנה מידה (%)<input type="number" step="0.1" value="${((sh.k || 1) * 100).toFixed(1)}" data-sk2></label>
          <div class="gp-sheet__row"><button class="gp-del" data-ai="${sh.id}">🤖 זיהוי מהגיליון</button> · <button class="gp-del" data-sdel>הסרה</button></div>
        </div>`).join("")}
        <label class="pl-btn gp-addsheet">＋ הוספת גיליון (תאורה / רמקולים / מיזוג / חשמל)<input type="file" accept="application/pdf,image/*" id="sheetFile" hidden></label>
        <p class="gp-hint">גיליונות של אותו פרויקט בדרך כלל מונחים בדיוק אחד על השני. אם יש סטייה, מזיזים עם השדות עד שהקירות חופפים.</p>` : ""}
        <hr><p class="gp-sub">פריטים בתוכנית</p>
        <ul class="gp-list">${p.items.map(i => { const r = S.results[i.id]; const bad = r?.warnings.length; return `<li data-id="${i.id}"><span>${i.type === "ceiling" ? "▭" : i.opts.lining ? "▌" : "┃"} ${esc(i.opts.name || (i.type === "ceiling" ? "תקרה" : i.opts.lining ? "חיפוי" : "מחיצה"))}</span><span class="gp-badge ${bad ? "warn" : ""}">${bad ? bad + " הערות" : "תקין"}</span></li>`; }).join("") || "<li>עדיין אין פריטים. בחרו כלי בסרגל.</li>"}</ul>
        <p class="gp-hint">טיפ: התחילו בכיול קנה מידה, סמנו תקרות ומחיצות, והוסיפו ספוטים, רמקולים ושקעים במקום שלהם. הפיזור מתעדכן מיד.</p>`;
      $("#pName").oninput = e => { p.name = e.target.value; renderTabs(); save(); };
      $("#pRoomH").onchange = e => { p.roomH = parseFloat(e.target.value) || 2.7; changed(); };
      $("#sheetFile")?.addEventListener("change", async e => {
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        try {
          const im = await fileToImage(file);
          const guess = /תאור|light/i.test(file.name) ? "lighting" : /רמקול|speak|audio/i.test(file.name) ? "speakers" : /מיזוג|hvac|ac/i.test(file.name) ? "hvac" : /חשמל|elec/i.test(file.name) ? "electrical" : "other";
          (p.sheets = p.sheets || []).push({ id: uid(), name: file.name.replace(/\.[^.]+$/, "").slice(0, 30), kind: guess, ...im, dx: 0, dy: 0, k: 1, opacity: .6, visible: true });
          changed();
        } catch { alert("לא הצלחנו לפתוח את הקובץ."); }
      });
      $$("#props [data-sk]").forEach(sel => sel.onchange = () => { if (sel.dataset.sk === "base") p.baseKind = sel.value; else p.sheets.find(x => x.id === sel.dataset.sk).kind = sel.value; save(); });
      $$("#props [data-ai]").forEach(b => b.onclick = () => aiDetect(b.dataset.ai));
      $$("#props .gp-sheet[data-sh]").forEach(box => {
        const sh = p.sheets.find(x => x.id === box.dataset.sh);
        box.querySelector("[data-sv]").onchange = e => { sh.visible = e.target.checked; draw(); save(); };
        box.querySelector("[data-so]").oninput = e => { sh.opacity = e.target.value / 100; draw(); };
        box.querySelector("[data-so]").onchange = () => save();
        box.querySelector("[data-sdx]").onchange = e => { sh.dx = (parseFloat(e.target.value) || 0) / 100; draw(); save(); };
        box.querySelector("[data-sdy]").onchange = e => { sh.dy = (parseFloat(e.target.value) || 0) / 100; draw(); save(); };
        box.querySelector("[data-sk2]").onchange = e => { sh.k = (parseFloat(e.target.value) || 100) / 100; draw(); save(); };
        box.querySelector("[data-sdel]").onclick = () => { p.sheets = p.sheets.filter(x => x !== sh); changed(); };
      });
      $$("#props .gp-list li[data-id]").forEach(li => li.onclick = () => { S.sel = { item: li.dataset.id }; renderProps(); draw(); });
      return;
    }
    const kind = it.type === "ceiling" ? "ceiling" : it.opts.lining ? "lining" : "wall";
    const res = S.results[it.id];
    let html = `<h4>${kind === "ceiling" ? "תקרת גבס" : kind === "lining" ? "חיפוי קיר" : "מחיצת גבס"}</h4><p class="gp-sub">כל הערכים פתוחים לשינוי. ערך שחורג מהתקן יוחזר לערך התקני עם הערה.</p>`;
    html += fieldDefs[kind].filter(d => (!d[0].startsWith("str") || it.opts.perimeter === "str") && (d[0] !== "shadowModel" || it.opts.perimeter === "shadow")).map(d => fieldHtml(d, d[0] === "w" || d[0] === "h" ? it[d[0]] : it.opts[d[0]])).join("");
    if (res) html += `<p class="gp-hint">${kind === "ceiling" ? `משניים כל ${res.sec} מ״מ (תקן: ${res.stdSec}), ראשיים כל ≤${res.pri}, מתלים כל ${res.hangerSpacing} מ״מ` : `ניצבים כל ≤${res.S} מ״מ (תקן: ${res.stdS}), אורך ניצב ${res.studLen} מ״מ`}</p>`;
    // alternatives
    html += `<hr><p class="gp-sub">השוואת אפשרויות (לחצו לבחירה)</p>` + altTable(it);
    if (it.type === "ceiling") {
      const fr = res ? Object.fromEntries(res.fixtures.map(f => [f.id, f])) : {};
      html += `<hr><p class="gp-sub">אביזרים בתקרה (${it.fixtures.length})</p><ul class="gp-list">${it.fixtures.map(f => `<li data-fix="${f.id}" class="${s.fix === f.id ? "is-sel" : ""}"><span>${R.fixtures[f.kind]?.icon || ""} ${esc(R.fixtures[f.kind]?.name || f.kind)}</span><span class="gp-badge ${fr[f.id]?.status || ""}">${badgeTxt(fr[f.id]?.status)}</span></li>`).join("")}</ul>`;
      const f = s.fix && it.fixtures.find(f => f.id === s.fix);
      if (f) {
        const ff = fr[f.id];
        html += `<div class="gp-2">${fieldHtml(["fx", "מרחק מהשמאל (ס״מ)", "num", 1], Math.round(f.x * 100))}${fieldHtml(["fy", "מרחק מלמעלה (ס״מ)", "num", 1], Math.round(f.y * 100))}</div>`;
        html += f.d ? fieldHtml(["fd", R.fixtures[f.kind]?.askD && !f.dCustom && S.spotD ? `קוטר חור (מ״מ) – לפי הקוטר הכללי` : "קוטר חור (מ״מ)", "num", 1], R.fixtures[f.kind]?.askD && !f.dCustom && S.spotD ? S.spotD : f.d) : `<div class="gp-2">${fieldHtml(["fw", "אורך (מ״מ)", "num", 10], f.w)}${fieldHtml(["fh", "רוחב (מ״מ)", "num", 10], f.h)}</div>${fieldHtml(["frot", "סיבוב 90°", "chk"], f.rot)}`;
        html += fieldHtml(["fkg", "משקל (ק״ג)", "num", 0.1], f.kg);
        if (ff) html += `<p class="gp-hint">${esc(ff.msg)} · תמיכה: ${esc(ff.support)}</p>`;
        html += `<button class="gp-del" data-del>מחיקת האביזר</button>`;
      }
    } else {
      html += `<hr><p class="gp-sub">בקיר (${it.elements.length})</p><ul class="gp-list">${it.elements.map(e => `<li data-el="${e.id}" class="${s.el === e.id ? "is-sel" : ""}"><span>${esc(R.wallElements[e.kind]?.name)}</span><b>${Math.round(e.pos * 100)} ס״מ</b></li>`).join("")}</ul>`;
      const e = s.el && it.elements.find(e => e.id === s.el);
      if (e) {
        html += `${fieldHtml(["epos", "מרכז מתחילת הקיר (ס״מ)", "num", 1], Math.round(e.pos * 100))}<div class="gp-2">${fieldHtml(["ew", "רוחב (מ״מ)", "num", 10], e.w)}${fieldHtml(["eh", "גובה (מ״מ)", "num", 10], e.h)}</div>${fieldHtml(["ey", "גובה מהרצפה (מ״מ)", "num", 10], e.y)}<button class="gp-del" data-del>מחיקה</button>`;
      }
      html += `<hr><button class="gp-del" data-flip>היפוך כיוון הקיר</button>`;
    }
    html += `<hr><button class="gp-del" data-delitem>מחיקת ${kind === "ceiling" ? "התקרה" : "הקיר"}</button> · <button class="gp-del" data-back>חזרה לרשימה</button>`;
    el.innerHTML = html;

    $$("[data-k]", el).forEach(inp => {
      inp.onchange = () => {
        const k = inp.dataset.k;
        let v = inp.type === "checkbox" ? inp.checked : inp.value;
        if (inp.type === "number") v = parseFloat(v) || 0;
        if (["thickness", "layers", "sides", "boardLen"].includes(k)) v = Number(v);
        const f = s.fix && it.fixtures?.find(f => f.id === s.fix), e = s.el && it.elements?.find(e => e.id === s.el);
        if (k === "w" || k === "h") it[k] = Math.max(0.3, v);
        else if (k === "fx") f.x = clamp(v / 100, 0, it.w); else if (k === "fy") f.y = clamp(v / 100, 0, it.h);
        else if (k === "fd") { f.d = v; f.dCustom = true; } else if (k === "fw") f.w = v; else if (k === "fh") f.h = v; else if (k === "fkg") f.kg = v; else if (k === "frot") f.rot = v;
        else if (k === "epos") e.pos = v / 100; else if (k === "ew") e.w = v; else if (k === "eh") e.h = v; else if (k === "ey") e.y = v;
        else it.opts[k] = v;
        computeItem(it); changed();
      };
    });
    $$("[data-fix]", el).forEach(li => li.onclick = () => { S.sel = { item: it.id, fix: li.dataset.fix }; renderProps(); draw(); });
    $$("[data-el]", el).forEach(li => li.onclick = () => { S.sel = { item: it.id, el: li.dataset.el }; renderProps(); draw(); });
    $$("[data-alt]", el).forEach(tr => tr.onclick = () => { Object.assign(it.opts, JSON.parse(tr.dataset.alt)); computeItem(it); changed(); });
    $("[data-del]", el)?.addEventListener("click", deleteSel);
    $("[data-delitem]", el)?.addEventListener("click", () => { S.sel = { item: it.id }; deleteSel(); });
    $("[data-back]", el)?.addEventListener("click", () => { S.sel = null; renderProps(); draw(); });
    $("[data-flip]", el)?.addEventListener("click", () => { const g = wallGeom(it); [it.a, it.b] = [it.b, it.a]; it.elements.forEach(e => e.pos = round2(g.len - e.pos)); computeItem(it); changed(); });
  }
  const badgeTxt = st => ({ ok: "תקין", clash: "פוגע בפרופיל", trim: "חילוף", joint: "על תפר" }[st] || "–");

  function altTable(it) {
    if (it.type === "ceiling") {
      const alts = [["x", "משניים לאורך הרוחב"], ["y", "משניים לאורך האורך"]].map(([dir, name]) => {
        const r = E.ceiling({ w: it.w * 1000, h: it.h * 1000, fixtures: it.fixtures.map(f => ({ ...f, x: f.x * 1000, y: f.y * 1000, w: f.rot ? f.h : f.w, h: f.rot ? f.w : f.h })), opts: { ...it.opts, dir, ruleset: S.ruleset, spotD: S.spotD } });
        const bad = r.fixtures.filter(f => f.status === "clash" || f.status === "joint").length;
        const prof = r.bill.find(b => b.key.startsWith("prof-"))?.qty || 0;
        return { dir, name, r, bad, prof };
      });
      const cur = S.results[it.id];
      return `<table class="gp-alt"><tr><th>אפשרות</th><th>לוחות</th><th>פרופילים</th><th>בעיות</th></tr>${alts.map(a => `<tr data-alt='${JSON.stringify({ dir: a.dir })}' class="${cur && cur.swap === a.r.swap ? "is-on" : ""}"><td>${a.name}</td><td>${a.r.stats.boards}</td><td>${a.prof}</td><td>${a.bad ? `<span class="gp-badge bad">${a.bad}</span>` : "✓"}</td></tr>`).join("")}</table>`;
    }
    const g = wallGeom(it);
    const profs = it.opts.lining ? ["F47", "C60", "C50"] : ["C50", "C70", "C100"];
    const rows = profs.flatMap(pr => [1, 2].map(layers => {
      const r = E.wall({ L: g.len * 1000, elements: it.elements.map(e => ({ ...e, pos: e.pos * 1000 })), opts: { ...it.opts, profile: pr, layers, ruleset: S.ruleset } });
      const mh = it.opts.lining ? null : E.maxHeightFor(layers, R.profiles[pr].width, it.opts.thickness, r.S);
      return { pr, layers, r, ok: !mh || it.opts.height <= mh, mh };
    }));
    return `<table class="gp-alt"><tr><th>פרופיל</th><th>שכבות</th><th>גובה מקס׳</th><th>לוחות</th></tr>${rows.map(a => `<tr data-alt='${JSON.stringify({ profile: a.pr, layers: a.layers })}' class="${it.opts.profile === a.pr && it.opts.layers === a.layers ? "is-on" : ""}"><td>${R.profiles[a.pr].name.split(" (")[0]}</td><td>${a.layers}</td><td>${a.mh ? `<span class="gp-badge ${a.ok ? "" : "bad"}">${a.mh / 10} ס״מ</span>` : "–"}</td><td>${a.r.stats.boards}</td></tr>`).join("")}</table>`;
  }

  /* ---------------- Tabs / plans ---------------- */
  function renderTabs() {
    const t = $("#planTabs");
    t.innerHTML = S.plans.map((p, i) => `<button class="gp-tab ${i === S.cur ? "is-on" : ""}" data-i="${i}">${esc(p.name)} ${PAY.free ? "" : `<small>${planPrice(i)} ₪</small>`}</button>`).join("") +
      (S.plans.length < PAY.maxPlans ? `<button class="gp-tab gp-tab--add" id="addPlan">＋ תוכנית נוספת</button>` : `<span class="gp-hint">מקסימום ${PAY.maxPlans} תוכניות בפרויקט</span>`) +
      (S.plans.length ? `<button class="gp-tab gp-tab--add" id="delPlan" title="מחיקת התוכנית הנוכחית">מחיקת תוכנית</button>` : "");
    $$(".gp-tab[data-i]", t).forEach(b => b.onclick = () => { S.cur = +b.dataset.i; S.sel = null; S.pending = null; showEditor(); });
    $("#addPlan")?.addEventListener("click", () => { $("#startBox").hidden = false; $("#editor").hidden = true; S.adding = true; $("#startBox").scrollIntoView({ behavior: "smooth", block: "center" }); });
    $("#delPlan")?.addEventListener("click", () => {
      if (!confirm(`למחוק את "${plan().name}"?`)) return;
      plan().items.forEach(i => delete S.results[i.id]);
      S.plans.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1);
      if (!S.plans.length) { $("#startBox").hidden = false; $("#editor").hidden = true; $("#results").hidden = true; }
      else showEditor();
      renderTabs(); renderResults(); save();
    });
  }
  const planPrice = i => PAY.prices[Math.min(i, PAY.prices.length - 1)];

  function showEditor() {
    $("#startBox").hidden = true; $("#editor").hidden = false; S.adding = false;
    const needFit = !plan().view;
    renderTabs(); renderProps(); requestAnimationFrame(() => { resize(); if (needFit) fit(); });
    updateScaleInfo();
  }
  function updateScaleInfo() {
    const p = plan(), el = $("#scaleInfo");
    if (!p) return;
    el.textContent = p.img ? (p.calibrated ? `קנה מידה מכויל · ${fmt(p.imgW * p.mpp, 1)}×${fmt(p.imgH * p.mpp, 1)} מ׳` : "⚠ קנה מידה לא מכויל") : "רשת: משבצת = 1 מ׳";
    el.classList.toggle("is-warn", !!p.img && !p.calibrated);
  }

  async function fileToImage(file) {
    const p = {};
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if (!window.pdfjsLib) throw new Error("pdf.js");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let pageNo = 1;
        if (pdf.numPages > 1) {
          const ans = prompt(`ב-PDF יש ${pdf.numPages} עמודים. איזה עמוד לפתוח?`, "1");
          pageNo = clamp(parseInt(ans) || 1, 1, pdf.numPages);
        }
        const page = await pdf.getPage(pageNo);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 2600 / Math.max(vp0.width, vp0.height));
        const vp = page.getViewport({ scale });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: cx, viewport: vp }).promise;
        p.img = c.toDataURL("image/jpeg", 0.82); p.imgW = c.width; p.imgH = c.height;
      } else {
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const k = Math.min(1, 2600 / Math.max(im.width, im.height));
        const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        p.img = c.toDataURL("image/jpeg", 0.85); p.imgW = c.width; p.imgH = c.height;
      }
    return p;
  }
  async function handleFile(file) {
    if (!file) return;
    if (S.plans.length >= PAY.maxPlans && !S.adding) return;
    const p = newPlan(file.name.replace(/\.[^.]+$/, "").slice(0, 30));
    try {
      Object.assign(p, await fileToImage(file));
      // הנחה ראשונית: רוחב התוכנית ≈ 15 מ׳ עד לכיול
      p.mpp = 15 / p.imgW;
    } catch (e) {
      alert("לא הצלחנו לפתוח את הקובץ. נסו PDF אחר, או צילום JPG/PNG של התוכנית."); return;
    }
    S.plans.push(p); S.cur = S.plans.length - 1; S.sel = null;
    showEditor(); setTool("calibrate"); save();
  }
  $("#planFile").onchange = e => { handleFile(e.target.files[0]); e.target.value = ""; };
  const dz = $("#dropZone");
  ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("is-over"); }));
  dz.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));
  $("#noPlanBtn").onclick = () => {
    const p = newPlan(); S.plans.push(p); S.cur = S.plans.length - 1; S.sel = null;
    showEditor(); setTool("ceiling"); save();
  };

  /* ---------------- Results ---------------- */
  function allItems() { return S.plans.flatMap((p, pi) => p.items.map(it => ({ p, pi, it, res: S.results[it.id] }))).filter(x => x.res); }
  function paidCount() { return S.plans.filter(p => p.items.length).length; }

  function renderResults() {
    const items = allItems();
    $("#results").hidden = !items.length;
    document.body.classList.toggle("is-locked", !S.unlocked);
    if (!items.length) return;
    // stats
    const ceilA = items.filter(x => x.it.type === "ceiling").reduce((s, x) => s + x.res.area, 0);
    const wallA = items.filter(x => x.it.type !== "ceiling").reduce((s, x) => s + x.res.area * x.res.opts.sides, 0);
    const boards = items.reduce((s, x) => s + x.res.stats.boards, 0);
    const studs = items.filter(x => x.it.type !== "ceiling").reduce((s, x) => s + x.res.studs.length, 0);
    const fixtures = items.filter(x => x.it.type === "ceiling").reduce((s, x) => s + x.res.fixtures.length, 0);
    $("#stats").innerHTML = [[fmt(ceilA, 1), "מ״ר תקרות"], [fmt(wallA, 1), "מ״ר חיפוי קירות"], [boards, "לוחות גבס"], [studs, "ניצבים במחיצות"], [fixtures, "אביזרים שנבדקו"], [paidCount(), "תוכניות בפרויקט"]]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("");
    // warnings
    const warns = items.flatMap(x => x.res.warnings.map(w => `<p><b>${esc(x.p.name)} · ${esc(itemName(x.it))}:</b> ${esc(w)}</p>`));
    const notes = [...new Set(items.flatMap(x => x.res.notes.filter(n => !n.startsWith("עומס"))))].map(n => `<p class="info">${esc(n)}</p>`);
    const RS = R.rulesets[S.ruleset] || R.rulesets.si1924, BB = R.rulesets.bluebook;
    const seenR = new Set();
    const rnotes = items.flatMap(x => x.res.ruleNotes || []).filter(n => !seenR.has(n.text) && seenR.add(n.text)).map(n =>
      `<p class="rule ${n.conflict ? "conflict" : n.stricter ? "stricter" : ""}"><b>${esc(n.source)}${n.section ? ` (סעיף ${esc(n.section)})` : ""}:</b> ${esc(n.text)}${n.conflict ? ` <b>⚠ סותר את התקן</b>` : n.stricter ? ` <b>מחמיר מהתקן</b>` : ""}<small>${n.si ? (n.conflict ? "בתקן: " : "") + esc(n.si) : ""}${n.verified ? "" : " · ממתין לאימות מול הפרק הרשמי"}</small></p>`).join("");
    const rhead = S.ruleset === "si1924" ? "" : `<p class="rule"><b>מתכננים לפי: ${esc(RS.name)}.</b> ${S.ruleset === "strict" ? "בכל ערך נבחר המחמיר מבין התקן, הספר הכחול ומפרטי היצרן." : "ערכים שהספר הכחול לא קובע נלקחים מת״י 1924."}${BB.complete ? "" : `<small>${esc(BB.statusNote)}</small>`}</p>`;
    $("#warnBox").innerHTML = rhead + rnotes + (warns.length ? warns.join("") : `<p class="ok">✓ לא נמצאו התנגשויות. כל האביזרים והקופסאות נמצאים בין הפרופילים, והחלוקה עומדת בכללי התקן.</p>`) + notes.join("");
    // per item
    $("#itemResults").innerHTML = items.map((x, i) => {
      const svg = x.it.type === "ceiling" ? svgCeiling(x.it, x.res) : svgWall(x.it, x.res);
      const sub = x.it.type === "ceiling"
        ? `${fmt(x.it.w, 2)}×${fmt(x.it.h, 2)} מ׳ · ${x.res.opts.profile} · משניים כל ${x.res.sec} · ראשיים ${x.res.primaries.length} · ${x.res.hangers.length} מתלים · ${x.res.stats.boards} לוחות`
        : `${fmt(x.res.L / 1000, 2)} מ׳ × ${fmt(x.res.H / 1000, 2)} מ׳ · ${R.profiles[x.res.opts.profile].name} · ${x.res.studs.length} ניצבים כל ≤${x.res.S} · ${x.res.stats.boards} לוחות`;
      const lock = !S.unlocked && i > 0;
      return `<div class="gp-panel"><div class="gp-panel__head"><div><h3>${esc(x.p.name)} · ${esc(itemName(x.it))}</h3><p class="gp-sub">${sub}</p></div></div>
        <div class="gp-svg ${lock ? "gp-lockable" : ""}">${svg}</div>${legend(x.it)}
        ${lock ? `<p class="gp-hint">שרטוט מפורט זה נפתח אחרי התשלום. השרטוט הראשון מוצג בחינם.</p>` : ""}</div>`;
    }).join("");
    renderBill();
    renderPay();
    window.GP3D && window.GP3D.render(plan(), S.results, opts3d());
    $("#roomHInfo").textContent = `${fmt(plan().roomH, 2)} מ׳`;
  }
  const itemName = it => it.opts.name || (it.type === "ceiling" ? "תקרה" : it.opts.lining ? "חיפוי קיר" : "מחיצה");
  function legend(it) {
    return it.type === "ceiling"
      ? `<div class="gp-legend"><span><i style="background:${COLORS.sec}"></i>פרופיל משני</span><span><i style="background:${COLORS.pri};height:2px;border-top:2px dashed ${COLORS.pri}"></i>פרופיל ראשי</span><span>✕ מתלה</span><span style="color:${COLORS.clash}">✕ מתלה נוסף</span><span><i style="background:${COLORS.board}"></i>לוחות</span><span>● תקין  <b style="color:${COLORS.trim}">●</b> חילוף/תפר  <b style="color:${COLORS.clash}">●</b> התנגשות</span></div>`
      : `<div class="gp-legend"><span><i style="background:${COLORS.stud}"></i>ניצב</span><span><i style="background:${COLORS.clash}"></i>ניצב מחוזק לפתח</span><span><i style="background:#7aa7d6"></i>ניצב קצר מעל/מתחת לפתח</span><span><i style="background:${COLORS.board}"></i>תפרי לוחות צד א׳</span><span><i style="background:#b07ad6"></i>תפרי לוחות צד ב׳</span></div>`;
  }

  function svgCeiling(it, r) {
    const W = r.W, H = r.H, pad = 420, sc = 1;
    let s = `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" xmlns="http://www.w3.org/2000/svg" font-family="Assistant, sans-serif">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8" stroke="#333" stroke-width="16"/>`;
    r.boards.filter(b => b.layer === r.opts.layers).forEach(b => s += `<rect x="${b.x + 6}" y="${b.y + 6}" width="${b.w - 12}" height="${b.h - 12}" fill="rgba(60,140,90,.06)" stroke="${COLORS.board}" stroke-width="8"/>`);
    r.primaries.forEach(y => s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${COLORS.pri}" stroke-width="12" stroke-dasharray="60 30"/>`);
    r.secondaries.forEach(q => q.segs.forEach(([a, b]) => s += `<line x1="${q.x}" y1="${a}" x2="${q.x}" y2="${b}" stroke="${COLORS.sec}" stroke-width="${q.edge ? 20 : 12}"/>`));
    r.trims.forEach(t => s += `<rect x="${t.x - 20}" y="${t.y - 20}" width="${t.w + 40}" height="${t.h + 40}" fill="none" stroke="${COLORS.trim}" stroke-width="14"/>`);
    r.hangers.forEach(h => s += `<g stroke="${h.extra ? COLORS.clash : "#111"}" stroke-width="10"><line x1="${h.x - 35}" y1="${h.y - 35}" x2="${h.x + 35}" y2="${h.y + 35}"/><line x1="${h.x + 35}" y1="${h.y - 35}" x2="${h.x - 35}" y2="${h.y + 35}"/></g>`);
    r.fixtures.forEach(f => {
      const c = COLORS[f.status] || COLORS.ok;
      s += f.round ? `<circle cx="${f.x}" cy="${f.y}" r="${f.fw / 2}" fill="${c}" stroke="#fff" stroke-width="8"/>` : `<rect x="${f.x - f.fw / 2}" y="${f.y - f.fh / 2}" width="${f.fw}" height="${f.fh}" fill="${c}" stroke="#fff" stroke-width="8"/>`;
    });
    // dims: secondaries along bottom
    const xs = r.secondaries.map(q => q.x);
    xs.slice(1).forEach((x, i) => { const m = (x + xs[i]) / 2; s += `<text x="${m}" y="${H + 150}" font-size="80" text-anchor="middle" fill="${COLORS.sec}">${Math.round(x - xs[i])}</text>`; });
    const ys = [0, ...r.primaries, H];
    ys.slice(1).forEach((y, i) => { const m = (y + ys[i]) / 2; s += `<text x="${-110}" y="${m}" font-size="80" text-anchor="middle" fill="${COLORS.pri}" dominant-baseline="middle">${Math.round(y - ys[i])}</text>`; });
    s += `<text x="${W / 2}" y="${H + 320}" font-size="110" text-anchor="middle" fill="#333">${r.swap ? "אורך" : "רוחב"}: ${fmt(W / 1000, 2)} מ׳ · משניים כל ≤${r.sec} מ״מ</text>`;
    s += `<text x="${W / 2}" y="${-200}" font-size="110" text-anchor="middle" fill="#333">${r.swap ? "רוחב" : "אורך"}: ${fmt(H / 1000, 2)} מ׳ · ראשיים כל ≤${r.pri} · מתלים כל ${r.hangerSpacing} מ״מ</text>`;
    return s + "</svg>";
  }

  function svgWall(it, r) {
    const W = r.L, H = r.H, pad = 380;
    const sides = r.opts.sides;
    let s = `<svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" xmlns="http://www.w3.org/2000/svg" font-family="Assistant, sans-serif"><g transform="translate(0 ${H}) scale(1 -1)">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fffdf8" stroke="#333" stroke-width="14"/>`;
    r.openings.forEach(op => s += `<rect x="${op.x0}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${op.door ? "#efe2d2" : "#dcebf6"}" stroke="#8a6a4a" stroke-width="10"/>`);
    r.studs.forEach(st => {
      const c = st.type === "jamb" ? COLORS.clash : st.type === "cripple" ? "#7aa7d6" : COLORS.stud;
      if (st.type === "cripple" && st.op) {
        if (st.op.y + st.op.h < H) s += `<line x1="${st.x}" y1="${st.op.y + st.op.h}" x2="${st.x}" y2="${H}" stroke="${c}" stroke-width="22"/>`;
        if (st.op.y > 50) s += `<line x1="${st.x}" y1="0" x2="${st.x}" y2="${st.op.y}" stroke="${c}" stroke-width="22"/>`;
      } else s += `<line x1="${st.x}" y1="0" x2="${st.x}" y2="${H}" stroke="${c}" stroke-width="${st.type === "end" || st.type === "jamb" ? 34 : 22}"/>`;
    });
    // board joints – side A (green), side B (purple)
    r.boards.filter(b => b.layer === r.opts.layers).forEach(b => {
      const c = b.side === 0 ? COLORS.board : "rgba(176,122,214,.7)", o = b.side === 0 ? 14 : -14;
      s += `<rect x="${b.x + 10 + o}" y="${b.y + 10}" width="${b.w - 20}" height="${b.h - 20}" fill="none" stroke="${c}" stroke-width="8" stroke-dasharray="${b.side ? "40 20" : "none"}"/>`;
    });
    r.boxes.forEach(b => s += `<rect x="${b.pos - b.w / 2}" y="${b.y - b.h / 2}" width="${b.w}" height="${b.h}" fill="${r.warnings.some(w => w.includes(`${(b.pos / 10).toFixed(0)} ס״מ`)) ? COLORS.clash : "#e0a526"}" stroke="#333" stroke-width="6"/>`);
    s += `</g>`;
    const xs = r.studs.filter(q => q.type !== "cripple").map(q => q.x);
    xs.slice(1).forEach((x, i) => { const m = (x + xs[i]) / 2; s += `<text x="${m}" y="${H + 130}" font-size="75" text-anchor="middle" fill="${COLORS.stud}">${Math.round(x - xs[i])}</text>`; });
    s += `<text x="${W / 2}" y="${H + 290}" font-size="100" text-anchor="middle" fill="#333">אורך ${fmt(W / 1000, 2)} מ׳ · ניצבים ${r.studs.length} · אורך ניצב ${r.studLen} מ״מ${sides === 2 ? " · תפרי הצדדים מוסטים ב-60 ס״מ" : ""}</text>`;
    s += `<text x="${-120}" y="${H / 2}" font-size="90" text-anchor="middle" fill="#333" transform="rotate(-90 ${-120} ${H / 2})">גובה ${fmt(H / 1000, 2)} מ׳</text>`;
    r.boxes.forEach(b => s += `<text x="${b.pos}" y="${H - b.y - 70}" font-size="60" text-anchor="middle" fill="#333">${esc(b.name.split(" ")[0])}</text>`);
    return s + "</svg>";
  }

  function totalBill() {
    const items = allItems();
    const rows = E.mergeBills(items.map(x => x.res.bill));
    const reserve = (parseFloat($("#reserve").value) || 0) / 100;
    return rows.map(r => ({ ...r, qty: r.unit === "יח׳" ? Math.ceil(r.qty * (1 + reserve)) : Math.round(r.qty * (1 + reserve) * 10) / 10 }));
  }
  const ORDER = ["board", "stud", "track", "prof", "doorstud", "cross", "ext", "hanger", "ceilAnchor", "anchor", "bracket", "doorangle", "board1", "board2", "board3", "metal", "seal", "wool", "tape", "compound", "corner", "sealant"];
  const ordKey = k => { const i = ORDER.findIndex(o => k.startsWith(o)); return i < 0 ? 99 : i; };
  function renderBill() {
    const rows = totalBill().sort((a, b) => ordKey(a.key) - ordKey(b.key));
    let sum = 0;
    const body = rows.map(r => {
      const pr = parseFloat(S.prices[r.key]) || 0; const t = pr * r.qty; sum += t;
      return `<tr><td>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</td><td class="q">${fmt(r.qty, r.unit === "יח׳" ? 0 : 1)} ${r.unit}</td><td><input type="number" min="0" step="0.1" data-price="${r.key}" value="${S.prices[r.key] || ""}" placeholder="מחיר ליח׳"></td><td>${t ? fmt(t, 0) + " ₪" : ""}</td></tr>`;
    }).join("");
    $("#billWrap").innerHTML = `<table class="gp-bill gp-lockable"><thead><tr><th>פריט</th><th>כמות</th><th>מחיר (לא חובה)</th><th>סה״כ</th></tr></thead><tbody>${body}</tbody>${sum ? `<tfoot><tr><td colspan="3">הערכת עלות חומר</td><td>${fmt(sum, 0)} ₪</td></tr></tfoot>` : ""}</table>` +
      (S.unlocked ? "" : `<div class="gp-lockmsg"><div>כתב הכמויות המלא נפתח אחרי התשלום<br><a href="#payBox">לתשלום ופתיחה ←</a></div></div>`);
    $$("[data-price]").forEach(inp => inp.onchange = () => { S.prices[inp.dataset.price] = inp.value; save(); renderBill(); });
  }
  $("#reserve").onchange = renderBill;
  $("#copyBill").onclick = () => {
    if (!S.unlocked) { location.hash = "payBox"; return; }
    const txt = "הזמנת חומרי גבס\n" + totalBill().sort((a, b) => ordKey(a.key) - ordKey(b.key)).map(r => `• ${r.name}: ${fmt(r.qty, r.unit === "יח׳" ? 0 : 1)} ${r.unit}`).join("\n");
    navigator.clipboard?.writeText(txt).then(() => { $("#copyBill").textContent = "הועתק ✓"; setTimeout(() => $("#copyBill").textContent = "העתקה לספק", 1800); }, () => prompt("העתיקו:", txt));
  };

  /* ---------------- Payment ---------------- */
  function renderPay() {
    const n = paidCount(), amount = E.pricing(n, PAY.prices, PAY.maxPlans);
    const box = $("#payBox");
    box.classList.toggle("is-paid", S.unlocked);
    if (PAY.free) {
      box.innerHTML = `<div class="gp-pay__text"><p class="kicker">תקופת השקה</p><h3>כרגע הכול בחינם 🎉</h3><p>כל השרטוטים, כתב הכמויות והדוח להדפסה פתוחים. נשמח לשמוע מה חשבתם בוואטסאפ.</p></div>`;
      return;
    }
    if (S.unlocked) {
      box.innerHTML = `<div class="gp-pay__text"><p class="kicker">הדוח פתוח</p><h3>תודה! כל השרטוטים וכתב הכמויות פתוחים.</h3><p>אפשר להדפיס או לשמור כ-PDF, ולהעתיק את רשימת החומרים לספק.</p></div>`;
      return;
    }
    $("#payAmount").textContent = amount;
    $("#orderCode").textContent = S.order;
    $("#paySum").textContent = `${n} ${n === 1 ? "תוכנית" : "תוכניות"} בפרויקט: ` + Array.from({ length: Math.min(n, PAY.maxPlans) }, (_, i) => `${planPrice(i)} ₪`).join(" + ") + ` = ${amount} ₪`;
    const desc = encodeURIComponent(`מתכנן גבס ${S.order}`);
    const methods = [
      ["card", "💳 כרטיס אשראי", PAY.card],
      ["bit", "ביט", PAY.bit],
      ["paybox", "פייבוקס", PAY.paybox],
      ["paypal", "PayPal", PAY.paypal ? PAY.paypal.replace(/\/$/, "") + (/paypal\.me/i.test(PAY.paypal) ? `/${amount}ILS` : "") : ""]
    ];
    $("#payBtns").innerHTML = methods.map(([k, name, url]) => url ? `<a href="${esc(url.replace("{amount}", amount).replace("{order}", desc))}" target="_blank" rel="noopener">${name}</a>` : `<span title="עוד לא הוגדר">${name} (בקרוב)</span>`).join("");
    const wa = CFG.whatsapp || "";
    $("#payWa").href = `https://wa.me/${wa}?text=${encodeURIComponent(`שלום מיכאל, שילמתי ${amount} ₪ עבור ${n} תוכניות במתכנן הגבס.\nקוד הזמנה: ${S.order}\nאשמח לקוד פתיחה.`)}`;
  }
  async function sha256(t) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  $("#unlockForm").onsubmit = async ev => {
    ev.preventDefault();
    const code = $("#unlockCode").value.trim().toUpperCase();
    if (!code) return;
    const h = await sha256(code);
    if ((PAY.unlockHashes || []).includes(h)) { S.unlocked = true; save(); renderResults(); }
    else $("#unlockMsg").textContent = "הקוד לא מתאים. בדקו שהוקלד נכון, או שלחו לנו הודעה בוואטסאפ.";
  };

  /* ---------------- Print report ---------------- */
  $("#printBtn").onclick = () => {
    if (!S.unlocked) { location.hash = "payBox"; return; }
    const items = allItems();
    const bill = totalBill().sort((a, b) => ordKey(a.key) - ordKey(b.key));
    $("#report").innerHTML = `<h1>דוח תכנון גבס · ${esc(CFG.businessName || "")}</h1><p>קוד פרויקט ${S.order} · ${new Date().toLocaleDateString("he-IL")} · לפי ת״י 1924</p>
      <div class="gp-rsec"><h2>כתב כמויות</h2><table><tr><th>פריט</th><th>כמות</th></tr>${bill.map(r => `<tr><td>${esc(r.name)}</td><td>${fmt(r.qty, r.unit === "יח׳" ? 0 : 1)} ${r.unit}</td></tr>`).join("")}</table></div>
      <div class="gp-rsec"><h2>הערות ובדיקות</h2>${$("#warnBox").innerHTML}</div>
      ${items.map(x => `<div class="gp-rsec"><h2>${esc(x.p.name)} · ${esc(itemName(x.it))}</h2>${x.it.type === "ceiling" ? svgCeiling(x.it, x.res) : svgWall(x.it, x.res)}</div>`).join("")}
      <p style="font-size:9pt">החישוב נועד לתכנון ולהזמנת חומר ואינו מחליף תכנון הנדסי והוראות יצרן.</p>`;
    window.print();
  };

  /* ---------------- 3D options ---------------- */
  function opts3d() { return { wall: $("#c3Wall").value, ceil: $("#c3Ceil").value, floor: $("#c3Floor").value, kelvin: +$("#c3Light").value, xray: $("#c3Xray").checked }; }
  ["#c3Wall", "#c3Ceil", "#c3Floor", "#c3Light", "#c3Xray"].forEach(s => $(s).addEventListener("input", () => window.GP3D && window.GP3D.render(plan(), S.results, opts3d())));
  window.addEventListener("gp3d-ready", () => { if (S.plans.length) window.GP3D.render(plan(), S.results, opts3d()); });

  /* ---------------- Init ---------------- */
  function initSelects() {
    const grouped = (obj, label) => {
      const g = {}; Object.entries(obj).forEach(([k, v]) => (g[v.group || "אחר"] = g[v.group || "אחר"] || []).push([k, v]));
      return Object.entries(g).map(([name, list]) => `<optgroup label="${esc(name)}">${list.map(([k, v]) => `<option value="${k}">${label(v)}</option>`).join("")}</optgroup>`).join("");
    };
    $("#fixKind").innerHTML = grouped(R.fixtures, v => `${v.icon} ${v.name}`);
    $("#elKind").innerHTML = grouped(R.wallElements, v => v.name);
    $("#fixKind").onchange = () => setTool("fixture");
    $("#elKind").onchange = () => setTool("element");
  }
  function initBrand() {
    $$("[data-config]").forEach(el => { const v = CFG[el.dataset.config]; if (v) el.textContent = v; });
    if (CFG.whatsapp) $("#waFloat").href = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent("שלום מיכאל, יש לי שאלה על מתכנן הגבס")}`;
  }

  initBrand(); initSelects(); load();
  if (PAY.free) { const ps = $(".gp-price-strip"); if (ps) ps.innerHTML = `<span><b>חינם בתקופת ההשקה</b></span><span>עד ${PAY.maxPlans} תוכניות בפרויקט</span>`; }
  function syncSpot() { $$(".js-spotd").forEach(i => { if (document.activeElement !== i) i.value = S.spotD || ""; }); }
  $$(".js-spotd").forEach(inp => {
    inp.value = S.spotD || "";
    inp.onchange = () => { S.spotD = Math.max(0, Math.round(parseFloat(inp.value) || 0)); syncSpot(); computeAll(); changed(); };
  });
  $$(".js-ruleset").forEach(sel => {
    sel.value = S.ruleset;
    sel.onchange = () => { S.ruleset = sel.value; $$(".js-ruleset").forEach(o => o.value = S.ruleset); computeAll(); changed(); };
  });
  if (new URLSearchParams(location.search).has("demo") && !S.plans.length) {
    const p = newPlan("דירה לדוגמה"); p.roomH = 2.7; S.plans.push(p);
    p.items.push({ id: uid(), type: "ceiling", x: 0, y: 0, w: 5.2, h: 4, opts: { ...defaultsCeiling(), name: "סלון" }, fixtures: [
      { id: uid(), kind: "spot", x: 1, y: 1, kg: .3, d: 75 }, { id: uid(), kind: "spot", x: 2.6, y: 1, kg: .3, d: 75 }, { id: uid(), kind: "spot", x: 4.2, y: 1, kg: .3, d: 75 },
      { id: uid(), kind: "spot", x: 1, y: 3, kg: .3, d: 75 }, { id: uid(), kind: "spot", x: 2.6, y: 3, kg: .3, d: 75 }, { id: uid(), kind: "spot", x: 4.2, y: 3, kg: .3, d: 75 },
      { id: uid(), kind: "speaker", x: 1.6, y: 2, kg: 2.5, d: 210 }, { id: uid(), kind: "speaker", x: 3.6, y: 2, kg: 2.5, d: 210 },
      { id: uid(), kind: "vent", x: 2.6, y: .35, kg: 2, w: 600, h: 150 }, { id: uid(), kind: "detector", x: 2.6, y: 2, kg: .2, d: 100 }] });
    p.items.push({ id: uid(), type: "wall", a: { x: 5.2, y: 0 }, b: { x: 5.2, y: 4 }, opts: { ...defaultsWall(false), name: "מחיצה לחדר שינה" }, elements: [
      { id: uid(), kind: "door", pos: 0.8, w: 900, h: 2100, y: 0 }, { id: uid(), kind: "box", pos: 2.1, w: 70, h: 70, y: 300 }, { id: uid(), kind: "switch", pos: 1.45, w: 70, h: 70, y: 1100 }, { id: uid(), kind: "data", pos: 3.2, w: 70, h: 120, y: 1200 }] });
    p.items.push({ id: uid(), type: "wall", a: { x: 0, y: 4 }, b: { x: 5.2, y: 4 }, opts: { ...defaultsWall(true), name: "חיפוי קיר טלוויזיה" }, elements: [{ id: uid(), kind: "data", pos: 2.6, w: 70, h: 120, y: 1200 }, { id: uid(), kind: "box", pos: 2.3, w: 70, h: 70, y: 300 }] });
  }
  computeAll();
  if (S.plans.length) { showEditor(); setTool("select"); }
  renderTabs(); renderResults();
  new ResizeObserver(resize).observe(wrap);
  // סיכום הפרויקט ליועץ ה-AI (בלי תמונות ובלי פרטים אישיים)
  function contextSummary() {
    const rs = R.rulesets[S.ruleset]?.short || "ת״י 1924";
    const lines = [`כללים: ${rs}. קוטר ספוט מקסימלי: ${S.spotD || "לא צוין"} מ״מ.`];
    S.plans.forEach(p => {
      lines.push(`תוכנית "${p.name}" (גובה חדר ${p.roomH} מ׳):`);
      p.items.forEach(it => {
        const r = S.results[it.id];
        if (it.type === "ceiling") {
          const kinds = {}; it.fixtures.forEach(f => kinds[f.kind] = (kinds[f.kind] || 0) + 1);
          lines.push(`- תקרה ${it.opts.name || ""} ${it.w}×${it.h} מ׳, ${it.opts.profile}, הנמכה ${it.opts.dropCm} ס״מ${it.opts.wet ? ", חדר רטוב" : ""}; אביזרים: ${Object.entries(kinds).map(([k, n]) => `${R.fixtures[k]?.name || k}×${n}`).join(", ") || "אין"}${r ? `; משניים כל ${r.sec} מ״מ, ${r.hangers.length} מתלים, ${r.stats.boards} לוחות` : ""}${r?.warnings.length ? `; אזהרות: ${r.warnings.join(" | ")}` : ""}`);
        } else {
          const len = Math.hypot(it.b.x - it.a.x, it.b.y - it.a.y).toFixed(2);
          lines.push(`- ${it.opts.lining ? "חיפוי" : "מחיצה"} ${it.opts.name || ""} ${len} מ׳ × ${it.opts.height / 1000} מ׳, ${it.opts.profile}, ${it.opts.layers} שכבות${it.opts.wet ? ", חדר רטוב" : ""}; בקיר: ${it.elements.map(e => R.wallElements[e.kind]?.name).join(", ") || "כלום"}${r ? `; ${r.studs.length} ניצבים, ${r.stats.boards} לוחות` : ""}${r?.warnings.length ? `; אזהרות: ${r.warnings.join(" | ")}` : ""}`);
        }
      });
    });
    return lines.join("\n").slice(0, 7800);
  }
  window.GP = { S, computeAll, renderResults, contextSummary };
})();
