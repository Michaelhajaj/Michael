(function () {
  "use strict";
  const C = typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- Site basics ---------- */
  $$("[data-config]").forEach(n => { const v = C[n.dataset.config]; if (v !== undefined && v !== "") n.textContent = v; });
  const wa = "https://wa.me/" + (C.whatsapp || "");
  $$(".js-wa").forEach(a => a.href = wa + "?text=" + encodeURIComponent("שלום, אשמח לייעוץ לגבי תקרת גבס"));
  $$(".js-phone").forEach(a => a.href = "tel:" + (C.phone || "").replace(/[^\d+]/g, ""));
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Labels ---------- */
  const ROOM = { living: "סלון", bedroom: "חדר שינה", kitchen: "מטבח", bath: "אמבטיה / שירותים", office: "משרד / כיתה", business: "עסק / חנות" };
  const STYLE = { floating: "תקרה צפה", stepped: "תקרה מדורגת", flat: "הנמכה חלקה", cove: "קרניז תאורה נסתרת", fineline: "תקרה אקוסטית פיין ליין" };
  const LIGHT = { spots: "ספוטים שקועים", panels: "פאנלים 60×60", track: "מסילה מגנטית" };
  const TEMP = { warm: "חם 3000K", neutral: "ניטרלי 4000K", cool: "קר 6000K" };
  const GLOW = { warm: "#ffc46e", neutral: "#fff0cc", cool: "#dceaff" };

  /* ---------- Form state ---------- */
  const form = $("#plForm");
  const num = (n, d) => { const v = parseFloat(String(form.elements[n].value).replace(",", ".")); return isFinite(v) ? v : d; };
  const radio = n => (form.querySelector(`input[name="${n}"]:checked`) || {}).value;
  function readState() {
    const L = clamp(num("roomLength", 5), 1, 30), W = clamp(num("width", 4), 1, 30);
    const H = clamp(num("height", 270), 200, 600) / 100;
    const style = radio("style");
    let drop = clamp(num("drop", 15), 5, 120) / 100;
    return {
      L, W, H, drop, style,
      room: radio("room"), light: style === "fineline" ? "panels" : radio("light"), temp: radio("temp"),
      count: Math.round(clamp(num("count", 0), 0, 80)),
      led: form.elements.led.checked || style === "cove",
      notes: form.elements.notes.value.trim()
    };
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = (v, d = 2) => Number(v).toFixed(d);

  /* ---------- Suggestions ---------- */
  let countTouched = false;
  const suggest = s => {
    const area = s.L * s.W;
    if (s.light === "panels" || s.style === "fineline") return Math.max(1, Math.round(area / 4.5));
    return Math.max(2, Math.round(area / 1.8));
  };
  function refreshHints() {
    const s = readState();
    const finalH = s.H - s.drop;
    const hn = $("#heightNote");
    hn.textContent = `גובה סופי לאחר ההנמכה: ${fmt(finalH)} מ׳` + (finalH < 2.4 ? " – גובה נמוך יחסית, כדאי להתייעץ על ההנמכה." : "");
    hn.classList.toggle("is-warn", finalH < 2.4);
    const sug = suggest(s);
    if (!countTouched) form.elements.count.value = sug;
    $("#countHint").textContent = `המלצה לחדר בגודל ${fmt(s.L * s.W, 1)} מ״ר: כ־${sug} גופי תאורה.`;
  }
  form.addEventListener("input", e => { if (e.target.name === "count") countTouched = true; refreshHints(); });
  form.addEventListener("change", refreshHints);
  $$(".pl-step-btn").forEach(b => b.addEventListener("click", () => {
    const i = form.elements.count; countTouched = true;
    i.value = clamp((parseInt(i.value, 10) || 0) + Number(b.dataset.step), 0, 80); refreshHints();
  }));
  refreshHints();

  /* ---------- Photo ---------- */
  let photoData = null;
  const photoInput = $("#photo"), preview = $("#photoPreview"), box = $("#uploadBox"), clearBtn = $("#photoClear");
  photoInput.addEventListener("change", () => {
    const f = photoInput.files && photoInput.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      photoData = c.toDataURL("image/jpeg", 0.86);
      preview.src = photoData; preview.hidden = false; box.classList.add("has-photo"); clearBtn.hidden = false;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });
  clearBtn.addEventListener("click", () => {
    photoData = null; photoInput.value = ""; preview.hidden = true; preview.removeAttribute("src");
    box.classList.remove("has-photo"); clearBtn.hidden = true;
  });

  /* ---------- Geometry ---------- */
  // Plan coordinates: u along length (0..L), v along width (0..W)
  function zones(s) {
    const inset = Math.min(0.35, s.W / 5, s.L / 5);
    const band = Math.min(0.6, s.W / 4, s.L / 4);
    return { inset, band };
  }
  function gridPositions(u0, v0, w, h, n) {
    if (n <= 0) return [];
    const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * w / h))));
    const rows = Math.ceil(n / cols);
    const out = [];
    for (let r = 0; r < rows; r++) {
      const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
      for (let c = 0; c < inRow; c++) {
        out.push({ u: u0 + (c + 0.5) * w / inRow, v: v0 + (r + 0.5) * h / rows, row: r, col: c });
      }
    }
    return out;
  }
  function ringPositions(u0, v0, w, h, n) {
    const P = 2 * (w + h), out = [];
    for (let i = 0; i < n; i++) {
      let d = (i + 0.5) * P / n;
      if (d < w) out.push({ u: u0 + d, v: v0 });
      else if ((d -= w) < h) out.push({ u: u0 + w, v: v0 + d });
      else if ((d -= h) < w) out.push({ u: u0 + w - d, v: v0 + h });
      else { d -= w; out.push({ u: u0, v: v0 + h - d }); }
    }
    return out;
  }
  function lights(s) {
    const { inset, band } = zones(s);
    const n = s.count;
    if (s.style === "fineline" || s.light === "panels") {
      // snap panels to a 60cm grid
      const g = gridPositions(0, 0, s.L, s.W, n);
      return g.map(p => ({ ...p, u: clamp(Math.floor(p.u / 0.6) * 0.6 + 0.3, 0.3, s.L - 0.3), v: clamp(Math.floor(p.v / 0.6) * 0.6 + 0.3, 0.3, s.W - 0.3) }));
    }
    if (s.style === "stepped") return ringPositions(band / 2, band / 2, s.L - band, s.W - band, n);
    if (s.style === "floating") return gridPositions(inset + 0.45, inset + 0.45, s.L - 2 * inset - 0.9, s.W - 2 * inset - 0.9, n);
    return gridPositions(0.5, 0.5, s.L - 1, s.W - 1, n);
  }
  function ledMeters(s) {
    const { inset, band } = zones(s);
    if (!s.led) return 0;
    if (s.style === "floating") return 2 * (s.L - 2 * inset + s.W - 2 * inset);
    if (s.style === "stepped") return 2 * (s.L - 2 * band + s.W - 2 * band);
    return 2 * (s.L + s.W);
  }

  /* ---------- SVG helpers ---------- */
  function svgEl(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs = {}) {
    const t = svgEl("text", { x, y, ...attrs }, parent); t.textContent = str; return t;
  }

  /* ---------- 3D visualization ---------- */
  function render3D(s) {
    const VW = 1200, VH = 800;
    const svg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": "הדמיה של התקרה" });
    const defs = svgEl("defs", {}, svg);
    const glow = GLOW[s.temp];
    defs.innerHTML = `
      <linearGradient id="gFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d7468"/><stop offset="1" stop-color="#4c453d"/></linearGradient>
      <linearGradient id="gWallL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc8bc"/><stop offset="1" stop-color="#e6e0d5"/></linearGradient>
      <linearGradient id="gWallR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#c7c0b3"/><stop offset="1" stop-color="#e2dcd0"/></linearGradient>
      <linearGradient id="gBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece7dd"/><stop offset="1" stop-color="#dcd5c8"/></linearGradient>
      <radialGradient id="gSpot"><stop offset="0" stop-color="${glow}" stop-opacity=".85"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
      <radialGradient id="gPool"><stop offset="0" stop-color="${glow}" stop-opacity=".35"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
      <filter id="fBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="fBlurS"><feGaussianBlur stdDeviation="4"/></filter>`;
    const W = s.W, L = s.L, H = s.H, yd = H - s.drop;
    const D = 0.55 * L + 1.2, yc = 1.5;
    const f = 0.99 * Math.min((VW / 2) * D / (W / 2), (VH / 2) * D / Math.max(H - yc, yc));
    const cx = VW / 2, cy = VH / 2 + (H - 2 * yc) * f / D / 2;
    const P = (x, y, z) => [cx + f * x / (z + D), cy - f * (y - yc) / (z + D)];
    const poly = (pts, attrs) => svgEl("polygon", { points: pts.map(p => P(...p).map(n => n.toFixed(1)).join(",")).join(" "), ...attrs }, svg);
    const X = v => v - W / 2; // plan v (width) -> x
    const hw = W / 2;

    svgEl("rect", { width: VW, height: VH, fill: "#0c0c0b" }, svg);
    // floor, walls
    poly([[-hw, 0, 0], [hw, 0, 0], [hw, 0, L], [-hw, 0, L]], { fill: "url(#gFloor)" });
    // floor planks
    for (let x = -hw + 0.2; x < hw; x += 0.2) { const a = P(x, 0, 0), b = P(x, 0, L); svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#000", "stroke-opacity": ".08" }, svg); }
    poly([[-hw, 0, 0], [-hw, 0, L], [-hw, H, L], [-hw, H, 0]], { fill: "url(#gWallL)" });
    poly([[hw, 0, 0], [hw, 0, L], [hw, H, L], [hw, H, 0]], { fill: "url(#gWallR)" });
    poly([[-hw, 0, L], [hw, 0, L], [hw, H, L], [-hw, H, L]], { fill: "url(#gBack)" });
    // skirting
    poly([[-hw, 0, 0], [-hw, 0, L], [-hw, 0.08, L], [-hw, 0.08, 0]], { fill: "#bdb5a8" });
    poly([[hw, 0, 0], [hw, 0, L], [hw, 0.08, L], [hw, 0.08, 0]], { fill: "#b5ad9f" });
    poly([[-hw, 0, L], [hw, 0, L], [hw, 0.08, L], [-hw, 0.08, L]], { fill: "#c3bbae" });
    // window on left wall for context
    const wz0 = L * 0.35, wz1 = Math.min(L * 0.35 + 1.4, L - 0.4), wy0 = 0.9, wy1 = Math.min(2.2, yd - 0.15);
    if (wy1 > wy0 + 0.4) {
      poly([[-hw, wy0, wz0], [-hw, wy0, wz1], [-hw, wy1, wz1], [-hw, wy1, wz0]], { fill: "#9fb3c2" });
      poly([[-hw, wy0, wz0], [-hw, wy0, wz1], [-hw, wy1, wz1], [-hw, wy1, wz0]], { fill: "none", stroke: "#5d636a", "stroke-width": 3 });
    }

    const ceilFill = "#f4f1ea", ceilShade = "#e2ddd3", slabFill = s.led ? "#e9e3d6" : "#d8d2c6";
    const { inset, band } = zones(s);
    const glowPoly = (pts, op = 0.85) => poly(pts, { fill: glow, opacity: op, filter: "url(#fBlur)" });

    if (s.style === "floating") {
      poly([[-hw, H, 0], [hw, H, 0], [hw, H, L], [-hw, H, L]], { fill: slabFill });
      const a = -hw + inset, b = hw - inset, z0 = inset, z1 = L - inset, t = 0.1;
      if (s.led) {
        const e = 0.3;
        glowPoly([[a - e, H, z0 - e], [b + e, H, z0 - e], [b + e, H, z1 + e], [a - e, H, z1 + e]]);
      } else {
        poly([[a - .05, H, z0 - .05], [b + .05, H, z0 - .05], [b + .05, H, z1 + .05], [a - .05, H, z1 + .05]], { fill: "#bfb8ab" });
      }
      poly([[a, yd, z0], [a, yd + t, z0], [a, yd + t, z1], [a, yd, z1]], { fill: ceilShade });
      poly([[b, yd, z0], [b, yd + t, z0], [b, yd + t, z1], [b, yd, z1]], { fill: ceilShade });
      poly([[a, yd, z0], [b, yd, z0], [b, yd + t, z0], [a, yd + t, z0]], { fill: "#d6d0c4" });
      poly([[a, yd, z0], [b, yd, z0], [b, yd, z1], [a, yd, z1]], { fill: ceilFill });
      if (s.led) {
        [[[a, yd + t, z0], [a, yd + t, z1]], [[b, yd + t, z0], [b, yd + t, z1]], [[a, yd + t, z1], [b, yd + t, z1]]].forEach(([p, q]) => {
          const A = P(...p), B = P(...q);
          svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: glow, "stroke-width": 3, filter: "url(#fBlurS)" }, svg);
        });
      }
    } else if (s.style === "stepped") {
      poly([[-hw, H, 0], [hw, H, 0], [hw, H, L], [-hw, H, L]], { fill: slabFill });
      const a = -hw + band, b = hw - band, z0 = band, z1 = L - band;
      if (s.led) glowPoly([[a, H, z0], [b, H, z0], [b, H, z1], [a, H, z1]], 0.55);
      // inner faces visible from camera
      poly([[a, yd, z1], [b, yd, z1], [b, H, z1], [a, H, z1]], { fill: ceilShade });
      poly([[a, yd, z0], [a, H, z0], [a, H, z1], [a, yd, z1]], { fill: "#e8e3d9" });
      poly([[b, yd, z0], [b, H, z0], [b, H, z1], [b, yd, z1]], { fill: "#e4dfd4" });
      if (s.led) [[[a, yd, z0], [a, yd, z1]], [[b, yd, z0], [b, yd, z1]], [[a, yd, z1], [b, yd, z1]]].forEach(([p, q]) => {
        const A = P(...p), B = P(...q);
        svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: glow, "stroke-width": 4, filter: "url(#fBlurS)" }, svg);
      });
      // band bottoms
      poly([[-hw, yd, 0], [hw, yd, 0], [hw, yd, z0], [-hw, yd, z0]], { fill: ceilFill });
      poly([[-hw, yd, z1], [hw, yd, z1], [hw, yd, L], [-hw, yd, L]], { fill: ceilFill });
      poly([[-hw, yd, z0], [a, yd, z0], [a, yd, z1], [-hw, yd, z1]], { fill: ceilFill });
      poly([[b, yd, z0], [hw, yd, z0], [hw, yd, z1], [b, yd, z1]], { fill: ceilFill });
      // wall strip between band and slab is hidden; draw wall/ceiling joint
    } else if (s.style === "cove") {
      poly([[-hw, H, 0], [hw, H, 0], [hw, H, L], [-hw, H, L]], { fill: "#ece7dd" });
      const e = 0.55, cy0 = H - 0.28, d = 0.16;
      glowPoly([[-hw, H, 0], [-hw + e, H, 0], [-hw + e, H, L], [-hw, H, L]], 0.75);
      glowPoly([[hw - e, H, 0], [hw, H, 0], [hw, H, L], [hw - e, H, L]], 0.75);
      glowPoly([[-hw, H, L - e], [hw, H, L - e], [hw, H, L], [-hw, H, L]], 0.75);
      [[-1], [1]].forEach(([sg]) => {
        const xw = sg * hw, xi = sg * (hw - d);
        poly([[xw, cy0, 0], [xi, cy0, 0], [xi, cy0, L - d], [xw, cy0, L]], { fill: "#d9d3c7" });
        poly([[xi, cy0, 0], [xi, cy0 + 0.1, 0], [xi, cy0 + 0.1, L - d], [xi, cy0, L - d]], { fill: "#ebe6dc" });
      });
      poly([[-hw, cy0, L], [hw, cy0, L], [hw - d, cy0, L - d], [-hw + d, cy0, L - d]], { fill: "#d9d3c7" });
      poly([[-hw + d, cy0, L - d], [hw - d, cy0, L - d], [hw - d, cy0 + 0.1, L - d], [-hw + d, cy0 + 0.1, L - d]], { fill: "#e6e0d5" });
    } else {
      // flat & fineline – whole ceiling at yd
      poly([[-hw, yd, 0], [hw, yd, 0], [hw, yd, L], [-hw, yd, L]], { fill: s.style === "fineline" ? "#e4e0d8" : ceilFill });
      if (s.style === "fineline") {
        const line = (p, q) => { const A = P(...p), B = P(...q); svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#1d1d1b", "stroke-width": 1.4 }, svg); };
        for (let v = 0.6; v < W; v += 0.6) line([X(v), yd, 0], [X(v), yd, L]);
        for (let u = 0.6; u < L; u += 0.6) line([-hw, yd, u], [hw, yd, u]);
        const e = [[-hw, yd, 0], [-hw, yd, L], [hw, yd, L], [hw, yd, 0]];
        poly(e, { fill: "none", stroke: "#1d1d1b", "stroke-width": 3 });
      }
      if (s.led) {
        // shadow-gap LED along walls
        [[[-hw, yd, 0], [-hw, yd, L]], [[hw, yd, 0], [hw, yd, L]], [[-hw, yd, L], [hw, yd, L]]].forEach(([p, q]) => {
          const A = P(...p), B = P(...q);
          svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: glow, "stroke-width": 10, opacity: .7, filter: "url(#fBlurS)" }, svg);
        });
        glowPoly([[-hw, yd - 0.05, 0], [-hw, yd - 0.05, L], [-hw, yd - 0.6, L], [-hw, yd - 0.6, 0]], 0.25);
        glowPoly([[hw, yd - 0.05, 0], [hw, yd - 0.05, L], [hw, yd - 0.6, L], [hw, yd - 0.6, 0]], 0.25);
      }
    }

    // lights
    const L2 = lights(s);
    const surf = p => {
      if (s.style === "cove") return H;
      if (s.style === "floating") return (p.u > inset && p.u < L - inset && p.v > inset && p.v < W - inset) ? yd : H;
      return yd;
    };
    const sorted = [...L2].sort((a, b) => b.u - a.u);
    // floor light pools
    sorted.forEach(p => {
      const c = P(X(p.v), 0, p.u), r = 0.9 * f / (p.u + D);
      svgEl("ellipse", { cx: c[0], cy: c[1], rx: r, ry: r * 0.35, fill: "url(#gPool)" }, svg);
    });
    if (s.light === "track" && s.style !== "fineline") {
      const byRow = {};
      L2.forEach(p => { (byRow[p.row] = byRow[p.row] || []).push(p); });
      Object.values(byRow).forEach(row => {
        if (row.length < 1) return;
        const y = surf(row[0]), v = row[0].v;
        const A = P(X(v), y, Math.max(0.2, Math.min(...row.map(p => p.u)) - 0.5)), B = P(X(v), y, Math.min(L - 0.2, Math.max(...row.map(p => p.u)) + 0.5));
        svgEl("line", { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: "#1b1b1a", "stroke-width": Math.max(2, 0.04 * f / (row[0].u + D)) }, svg);
      });
    }
    sorted.forEach(p => {
      const y = surf(p), x = X(p.v), c = P(x, y, p.u);
      const k = f / (p.u + D);
      if (s.style === "fineline" || s.light === "panels") {
        const h = 0.29;
        svgEl("circle", { cx: c[0], cy: c[1], r: 0.9 * k, fill: "url(#gSpot)" }, svg);
        poly([[x - h, y - 0.002, p.u - h], [x + h, y - 0.002, p.u - h], [x + h, y - 0.002, p.u + h], [x - h, y - 0.002, p.u + h]], { fill: "#ffffff", stroke: s.style === "fineline" ? "#1d1d1b" : "#cfc8bb", "stroke-width": 1.5 });
      } else {
        const A = P(x, y, p.u - 0.05), B = P(x, y, p.u + 0.05);
        const ry = Math.max(1.2, Math.abs(A[1] - B[1]) / 2), rx = Math.max(2.5, 0.05 * k);
        svgEl("ellipse", { cx: c[0], cy: c[1] + ry * 2, rx: rx * 5, ry: rx * 3, fill: "url(#gSpot)", opacity: .8 }, svg);
        if (s.light === "track") svgEl("rect", { x: c[0] - rx * .9, y: c[1] - ry, width: rx * 1.8, height: Math.max(3, rx * 1.4), fill: "#1b1b1a" }, svg);
        svgEl("ellipse", { cx: c[0], cy: c[1] + (s.light === "track" ? rx : 0), rx, ry: Math.max(ry, rx * .45), fill: "#fffaf0", stroke: "#b8b1a4", "stroke-width": .8 }, svg);
      }
    });

    // clip everything to the room opening
    const clip = svgEl("clipPath", { id: "roomClip" }, defs);
    const o1 = P(-hw, H, 0), o2 = P(hw, 0, 0);
    svgEl("rect", { x: o1[0], y: o1[1], width: o2[0] - o1[0], height: o2[1] - o1[1] }, clip);
    const room = svgEl("g", { "clip-path": "url(#roomClip)" });
    [...svg.childNodes].slice(2).forEach(n => room.appendChild(n));
    svg.appendChild(room);
    const cap = svgEl("g", { direction: "rtl", "font-family": "Assistant, Arial, sans-serif" }, svg);
    svgEl("rect", { x: VW - 330, y: VH - 62, width: 310, height: 42, fill: "#0c0c0b", opacity: .72 }, cap);
    text(cap, VW - 36, VH - 34, `${STYLE[s.style]} · ${ROOM[s.room]}`, { fill: "#e8dcc0", "font-size": 17, "text-anchor": "start" });
    return svg;
  }

  /* ---------- Architectural plan ---------- */
  function renderPlan(s) {
    const VW = 1400, VH = 990;
    const svg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, xmlns: NS, direction: "rtl", "font-family": "Assistant, Arial, sans-serif", role: "img", "aria-label": "תוכנית תקרה וחתך" });
    const defs = svgEl("defs", {}, svg);
    defs.innerHTML = `
      <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#888" stroke-width="1"/></pattern>
      <pattern id="hatchLight" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#d6cfc2" stroke-width="1"/></pattern>`;
    const INK = "#1a1a18", GOLD = "#b8913f", GRAY = "#8b867c";
    svgEl("rect", { width: VW, height: VH, fill: "#fff" }, svg);
    svgEl("rect", { x: 16, y: 16, width: VW - 32, height: VH - 32, fill: "none", stroke: INK, "stroke-width": 2 }, svg);

    // header
    text(svg, VW - 50, 70, "תוכנית תקרה – מבט מלמטה", { "font-size": 30, fill: INK, "text-anchor": "start", "font-weight": 600 });
    text(svg, VW - 50, 100, `${STYLE[s.style]} · ${ROOM[s.room]} · קנ״מ להמחשה`, { "font-size": 17, fill: GRAY, "text-anchor": "start" });
    text(svg, 1340, 150, "חתך א–א", { "font-size": 24, fill: INK, "text-anchor": "start", "font-weight": 600 });

    // --- PLAN ---
    const region = { x: 140, y: 150, w: 680, h: 540 };
    const sc = Math.min(region.w / s.L, region.h / s.W);
    const pw = s.L * sc, ph = s.W * sc;
    const ox = region.x + (region.w - pw) / 2, oy = region.y + (region.h - ph) / 2;
    const U = u => ox + u * sc, V = v => oy + v * sc;
    const { inset, band } = zones(s);
    const g = svgEl("g", {}, svg);
    const wallT = Math.max(6, 0.15 * sc);
    svgEl("rect", { x: ox - wallT, y: oy - wallT, width: pw + 2 * wallT, height: ph + 2 * wallT, fill: "url(#hatch)", stroke: INK, "stroke-width": 1.5 }, g);
    svgEl("rect", { x: ox, y: oy, width: pw, height: ph, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, g);

    const ledPath = (u0, v0, w, h) => svgEl("rect", { x: U(u0), y: V(v0), width: w * sc, height: h * sc, fill: "none", stroke: GOLD, "stroke-width": 2.5, "stroke-dasharray": "10 6" }, g);
    if (s.style === "floating") {
      svgEl("rect", { x: U(inset), y: V(inset), width: (s.L - 2 * inset) * sc, height: (s.W - 2 * inset) * sc, fill: "#faf8f3", stroke: INK, "stroke-width": 2 }, g);
      if (s.led) ledPath(inset - 0.06, inset - 0.06, s.L - 2 * inset + 0.12, s.W - 2 * inset + 0.12);
    } else if (s.style === "stepped") {
      svgEl("path", { d: `M${U(0)},${V(0)}h${pw}v${ph}h${-pw}z M${U(band)},${V(band)}v${(s.W - 2 * band) * sc}h${(s.L - 2 * band) * sc}v${-(s.W - 2 * band) * sc}z`, fill: "url(#hatchLight)", "fill-rule": "evenodd" }, g);
      svgEl("rect", { x: U(band), y: V(band), width: (s.L - 2 * band) * sc, height: (s.W - 2 * band) * sc, fill: "none", stroke: INK, "stroke-width": 2 }, g);
      if (s.led) ledPath(band + 0.06, band + 0.06, s.L - 2 * band - 0.12, s.W - 2 * band - 0.12);
    } else if (s.style === "cove") {
      const d = 0.16;
      svgEl("path", { d: `M${U(0)},${V(0)}h${pw}v${ph}h${-pw}z M${U(d)},${V(d)}v${(s.W - 2 * d) * sc}h${(s.L - 2 * d) * sc}v${-(s.W - 2 * d) * sc}z`, fill: "#e9e4da", "fill-rule": "evenodd", stroke: INK, "stroke-width": 1.2 }, g);
      ledPath(0.08, 0.08, s.L - 0.16, s.W - 0.16);
    } else {
      if (s.style === "fineline") {
        for (let u = 0.6; u < s.L - 0.01; u += 0.6) svgEl("line", { x1: U(u), y1: V(0), x2: U(u), y2: V(s.W), stroke: "#555", "stroke-width": .8 }, g);
        for (let v = 0.6; v < s.W - 0.01; v += 0.6) svgEl("line", { x1: U(0), y1: V(v), x2: U(s.L), y2: V(v), stroke: "#555", "stroke-width": .8 }, g);
      }
      if (s.led) ledPath(0.05, 0.05, s.L - 0.1, s.W - 0.1);
    }

    // lights
    const L2 = lights(s);
    if (s.light === "track" && s.style !== "fineline") {
      const byRow = {};
      L2.forEach(p => { (byRow[p.row] = byRow[p.row] || []).push(p); });
      Object.values(byRow).forEach(row => {
        const v = row[0].v, u0 = Math.max(0.2, Math.min(...row.map(p => p.u)) - 0.5), u1 = Math.min(s.L - 0.2, Math.max(...row.map(p => p.u)) + 0.5);
        svgEl("line", { x1: U(u0), y1: V(v), x2: U(u1), y2: V(v), stroke: INK, "stroke-width": 4 }, g);
      });
    }
    L2.forEach(p => {
      const x = U(p.u), y = V(p.v);
      if (s.style === "fineline" || s.light === "panels") {
        const h = 0.3 * sc;
        svgEl("rect", { x: x - h, y: y - h, width: 2 * h, height: 2 * h, fill: "#fff6d9", stroke: INK, "stroke-width": 1.4 }, g);
        svgEl("path", { d: `M${x - h},${y - h}L${x + h},${y + h}M${x + h},${y - h}L${x - h},${y + h}`, stroke: INK, "stroke-width": .8 }, g);
      } else if (s.light === "track") {
        svgEl("rect", { x: x - 6, y: y - 6, width: 12, height: 12, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, g);
      } else {
        svgEl("circle", { cx: x, cy: y, r: 7, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, g);
        svgEl("path", { d: `M${x - 10},${y}h20M${x},${y - 10}v20`, stroke: INK, "stroke-width": 1 }, g);
      }
    });

    // dimension helper (horizontal / vertical)
    function dimH(x1, x2, y, label, off = 0) {
      const gg = svgEl("g", { stroke: INK, "stroke-width": 1 }, svg);
      svgEl("line", { x1, y1: y, x2, y2: y }, gg);
      [x1, x2].forEach(x => { svgEl("line", { x1: x, y1: y - 8 - off, x2: x, y2: y + 8 }, gg); svgEl("line", { x1: x - 5, y1: y + 5, x2: x + 5, y2: y - 5, "stroke-width": 2 }, gg); });
      text(svg, (x1 + x2) / 2, y - 8, label, { "font-size": 16, fill: INK, "text-anchor": "middle", direction: "ltr" });
    }
    function dimV(y1, y2, x, label) {
      const gg = svgEl("g", { stroke: INK, "stroke-width": 1 }, svg);
      svgEl("line", { x1: x, y1, x2: x, y2 }, gg);
      [y1, y2].forEach(y => { svgEl("line", { x1: x - 8, y1: y, x2: x + 8, y2: y }, gg); svgEl("line", { x1: x - 5, y1: y + 5, x2: x + 5, y2: y - 5, "stroke-width": 2 }, gg); });
      const t = text(svg, x - 10, (y1 + y2) / 2, label, { "font-size": 16, fill: INK, "text-anchor": "middle", direction: "ltr" });
      t.setAttribute("transform", `rotate(-90 ${x - 10} ${(y1 + y2) / 2})`);
    }
    dimH(U(0), U(s.L), oy + ph + wallT + 40, fmt(s.L));
    dimV(V(0), V(s.W), ox - wallT - 34, fmt(s.W));
    if (s.style === "floating") dimH(U(0), U(inset), oy - wallT - 22, fmt(inset));
    if (s.style === "stepped") dimH(U(0), U(band), oy - wallT - 22, fmt(band));
    // light spacing
    const row0 = L2.filter(p => p.row === 0).sort((a, b) => a.u - b.u);
    if (row0.length >= 2 && s.style !== "stepped") {
      const y = V(row0[0].v) - 22;
      dimH(U(row0[0].u), U(row0[1].u), y, fmt(row0[1].u - row0[0].u));
    }
    // section marker A–A along length
    const ay = V(s.W / 2);
    [[U(0) - wallT - 100, "א"], [U(s.L) + wallT + 30, "א"]].forEach(([x, l]) => {
      svgEl("line", { x1: x, y1: ay, x2: x + 40, y2: ay, stroke: GOLD, "stroke-width": 2.5 }, svg);
      svgEl("circle", { cx: x + (l && x < ox ? 0 : 40), cy: ay, r: 13, fill: "#fff", stroke: GOLD, "stroke-width": 2 }, svg);
      text(svg, x + (x < ox ? 0 : 40), ay + 6, l, { "font-size": 16, fill: GOLD, "text-anchor": "middle" });
    });
    svgEl("line", { x1: U(0), y1: ay, x2: U(s.L), y2: ay, stroke: GOLD, "stroke-width": 1, "stroke-dasharray": "14 5 3 5", opacity: .7 }, svg);

    // --- SECTION A–A ---
    const sr = { x: 990, y: 170, w: 350, h: 260 };
    const ss = Math.min(sr.w / s.L, (sr.h - 60) / (s.H + 0.25));
    const sx0 = sr.x + (sr.w - s.L * ss) / 2, floorY = sr.y + sr.h;
    const SX = u => sx0 + u * ss, SY = y => floorY - y * ss;
    const slabT = 0.2;
    const sg = svgEl("g", {}, svg);
    svgEl("rect", { x: SX(-0.15), y: SY(s.H + slabT), width: (s.L + 0.3) * ss, height: slabT * ss, fill: "url(#hatch)", stroke: INK }, sg);
    svgEl("rect", { x: SX(-0.15), y: SY(s.H), width: 0.15 * ss, height: s.H * ss, fill: "url(#hatch)", stroke: INK }, sg);
    svgEl("rect", { x: SX(s.L), y: SY(s.H), width: 0.15 * ss, height: s.H * ss, fill: "url(#hatch)", stroke: INK }, sg);
    svgEl("line", { x1: SX(-0.15), y1: floorY, x2: SX(s.L + 0.15), y2: floorY, stroke: INK, "stroke-width": 2 }, sg);
    const yd = s.H - s.drop, bt = Math.max(2.5, 0.0125 * ss * 2);
    const board = (u0, u1, y) => svgEl("rect", { x: SX(u0), y: SY(y), width: (u1 - u0) * ss, height: bt, fill: INK }, sg);
    const hang = (u, y) => svgEl("line", { x1: SX(u), y1: SY(s.H), x2: SX(u), y2: SY(y), stroke: GRAY, "stroke-width": 1, "stroke-dasharray": "3 3" }, sg);
    const led = (u, y) => svgEl("circle", { cx: SX(u), cy: SY(y), r: 4, fill: GOLD }, sg);
    if (s.style === "floating") {
      board(inset, s.L - inset, yd);
      svgEl("rect", { x: SX(inset), y: SY(yd + 0.1), width: 2, height: 0.1 * ss, fill: INK }, sg);
      svgEl("rect", { x: SX(s.L - inset) - 2, y: SY(yd + 0.1), width: 2, height: 0.1 * ss, fill: INK }, sg);
      for (let u = inset + 0.6; u < s.L - inset; u += 1.2) hang(u, yd);
      if (s.led) { led(inset - 0.05, yd + 0.08); led(s.L - inset + 0.05, yd + 0.08); }
    } else if (s.style === "stepped") {
      board(0, band, yd); board(s.L - band, s.L, yd);
      svgEl("rect", { x: SX(band), y: SY(s.H), width: 2, height: s.drop * ss, fill: INK }, sg);
      svgEl("rect", { x: SX(s.L - band) - 2, y: SY(s.H), width: 2, height: s.drop * ss, fill: INK }, sg);
      hang(band / 2, yd); hang(s.L - band / 2, yd);
      if (s.led) { led(band + 0.06, yd + 0.04); led(s.L - band - 0.06, yd + 0.04); }
    } else if (s.style === "cove") {
      const cy0 = s.H - 0.28;
      [[0, 0.16], [s.L - 0.16, s.L]].forEach(([a, b]) => { board(a, b, cy0); });
      svgEl("rect", { x: SX(0.16), y: SY(cy0 + 0.1), width: 2, height: 0.1 * ss, fill: INK }, sg);
      svgEl("rect", { x: SX(s.L - 0.16) - 2, y: SY(cy0 + 0.1), width: 2, height: 0.1 * ss, fill: INK }, sg);
      led(0.08, cy0 + 0.05); led(s.L - 0.08, cy0 + 0.05);
    } else {
      board(0, s.L, yd);
      for (let u = 0.6; u < s.L; u += 1.2) hang(u, yd);
      if (s.led) { led(0.05, yd + 0.04); led(s.L - 0.05, yd + 0.04); }
    }
    // lights in section
    L2.filter(p => Math.abs(p.v - (L2[0] ? L2[0].v : 0)) < 0.01).forEach(p => {
      const y = s.style === "cove" ? s.H : (s.style === "floating" && (p.u < inset || p.u > s.L - inset)) ? s.H : yd;
      svgEl("rect", { x: SX(p.u) - 5, y: SY(y) - 2, width: 10, height: 6, fill: "#fff", stroke: INK }, sg);
    });
    // height annotations (left of section)
    const hx = sr.x - 4;
    function hDim(y1, y2, label, x) {
      svgEl("line", { x1: x, y1: SY(y1), x2: x, y2: SY(y2), stroke: INK }, svg);
      [y1, y2].forEach(y => svgEl("line", { x1: x - 6, y1: SY(y), x2: x + 6, y2: SY(y), stroke: INK }, svg));
      const my = (SY(y1) + SY(y2)) / 2;
      const t = text(svg, x - 8, my, label, { "font-size": 14, fill: INK, "text-anchor": "middle", direction: "ltr" });
      t.setAttribute("transform", `rotate(-90 ${x - 8} ${my})`);
    }
    const finalH = s.style === "cove" ? s.H : yd;
    hDim(0, s.H, fmt(s.H), SX(-0.15) - 50);
    hDim(0, finalH, fmt(finalH), SX(-0.15) - 20);
    text(svg, sr.x + sr.w, floorY + 34, "±0.00 פני ריצוף", { "font-size": 14, fill: GRAY, "text-anchor": "start" });
    dimH(SX(0), SX(s.L), floorY + 64, fmt(s.L));

    // --- Legend ---
    const lx = VW - 60, ly0 = 520;
    text(svg, lx, ly0, "מקרא", { "font-size": 20, fill: INK, "text-anchor": "start", "font-weight": 600 });
    const items = [];
    if (s.style === "fineline" || s.light === "panels") items.push(["panel", "פאנל תאורה 60×60"]);
    else if (s.light === "track") items.push(["track", "מסילה מגנטית + גוף תאורה"]);
    else items.push(["spot", "ספוט שקוע"]);
    if (s.led) items.push(["led", "פס לד נסתר"]);
    if (s.style === "floating") items.push(["board", "משטח גבס צף"]);
    if (s.style === "stepped") items.push(["hatch", "מסגרת גבס מונמכת"]);
    if (s.style === "cove") items.push(["cove", "קרניז גבס לתאורה עקיפה"]);
    if (s.style === "fineline") items.push(["grid", "גריד פיין ליין 60×60"]);
    items.push(["axis", "קו חתך א–א"]);
    items.forEach(([k, label], i) => {
      const y = ly0 + 36 + i * 32, ix = lx - 22;
      if (k === "spot") { svgEl("circle", { cx: ix, cy: y - 5, r: 7, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, svg); svgEl("path", { d: `M${ix - 10},${y - 5}h20M${ix},${y - 15}v20`, stroke: INK }, svg); }
      if (k === "panel") { svgEl("rect", { x: ix - 10, y: y - 15, width: 20, height: 20, fill: "#fff6d9", stroke: INK }, svg); }
      if (k === "track") { svgEl("line", { x1: ix - 14, y1: y - 5, x2: ix + 14, y2: y - 5, stroke: INK, "stroke-width": 4 }, svg); svgEl("rect", { x: ix - 5, y: y - 10, width: 10, height: 10, fill: "#fff", stroke: INK }, svg); }
      if (k === "led") svgEl("line", { x1: ix - 14, y1: y - 5, x2: ix + 14, y2: y - 5, stroke: GOLD, "stroke-width": 3, "stroke-dasharray": "8 4" }, svg);
      if (k === "board") svgEl("rect", { x: ix - 14, y: y - 14, width: 28, height: 18, fill: "#faf8f3", stroke: INK, "stroke-width": 2 }, svg);
      if (k === "hatch") svgEl("rect", { x: ix - 14, y: y - 14, width: 28, height: 18, fill: "url(#hatchLight)", stroke: INK }, svg);
      if (k === "cove") svgEl("rect", { x: ix - 14, y: y - 14, width: 28, height: 18, fill: "#e9e4da", stroke: INK }, svg);
      if (k === "grid") { svgEl("rect", { x: ix - 14, y: y - 14, width: 28, height: 18, fill: "none", stroke: "#555" }, svg); svgEl("line", { x1: ix, y1: y - 14, x2: ix, y2: y + 4, stroke: "#555" }, svg); }
      if (k === "axis") svgEl("line", { x1: ix - 14, y1: y - 5, x2: ix + 14, y2: y - 5, stroke: GOLD, "stroke-width": 1.5, "stroke-dasharray": "8 3 2 3" }, svg);
      text(svg, lx - 50, y, label, { "font-size": 16, fill: INK, "text-anchor": "start" });
    });
    // notes
    const notes = [
      s.room === "bath" ? "לוחות גבס ירוקים עמידי לחות" : "לוחות גבס 12.5 מ״מ",
      "פרופילי פלדה מגולוונת ותליות לתקרה",
      "ביצוע על פי תקן 1924 ותקן 5103",
      "כל המידות במטרים ונמדדות באתר"
    ];
    const nx = VW - 60, ny0 = 690;
    text(svg, nx, ny0, "הערות", { "font-size": 20, fill: INK, "text-anchor": "start", "font-weight": 600 });
    notes.forEach((n, i) => text(svg, nx, ny0 + 32 + i * 25, "• " + n, { "font-size": 14, fill: INK, "text-anchor": "start" }));

    // --- Title block ---
    const ty = 830;
    svgEl("line", { x1: 16, y1: ty, x2: VW - 16, y2: ty, stroke: INK, "stroke-width": 2 }, svg);
    [470, 900].forEach(x => svgEl("line", { x1: x, y1: ty, x2: x, y2: VH - 16, stroke: INK }, svg));
    text(svg, VW - 50, ty + 52, C.brand || "MICHAEL HAJAJ", { "font-size": 30, fill: INK, "text-anchor": "end", direction: "ltr", "font-family": "Cormorant Garamond, Georgia, serif", "letter-spacing": 4 });
    text(svg, VW - 50, ty + 84, (C.brandSub || "עבודות גבס") + " · " + (C.phone || ""), { "font-size": 16, fill: GRAY, "text-anchor": "start" });
    text(svg, VW - 50, ty + 112, C.area || "", { "font-size": 14, fill: GRAY, "text-anchor": "start" });
    const area = s.L * s.W;
    const info = [
      `חדר: ${ROOM[s.room]}  ·  ${fmt(s.L)} × ${fmt(s.W)} מ׳  ·  ${fmt(area, 1)} מ״ר`,
      `גובה קיים ${fmt(s.H)} מ׳  ·  גובה סופי ${fmt(s.style === "cove" ? s.H : s.H - s.drop)} מ׳`,
      `תאורה: ${s.count} × ${LIGHT[s.light]}` + (s.led ? `  ·  לד ${fmt(ledMeters(s), 1)} מ׳ (${TEMP[s.temp]})` : "")
    ];
    info.forEach((t, i) => text(svg, 870, ty + 44 + i * 30, t, { "font-size": 16, fill: INK, "text-anchor": "start" }));
    const d = new Date();
    text(svg, 440, ty + 44, "תאריך: " + d.toLocaleDateString("he-IL"), { "font-size": 16, fill: INK, "text-anchor": "start" });
    text(svg, 440, ty + 76, "שרטוט להמחשה בלבד –", { "font-size": 15, fill: GRAY, "text-anchor": "start" });
    text(svg, 440, ty + 100, "אינו מהווה תוכנית ביצוע", { "font-size": 15, fill: GRAY, "text-anchor": "start" });
    return svg;
  }

  /* ---------- Stats ---------- */
  function renderStats(s) {
    const area = s.L * s.W;
    const rows = [
      [fmt(area, 1), "מ״ר שטח תקרה"],
      [fmt(2 * (s.L + s.W), 1), "מ׳ היקף"],
      [fmt(s.style === "cove" ? s.H : s.H - s.drop), "מ׳ גובה סופי"],
      [String(s.count), "גופי תאורה"],
    ];
    if (s.led) rows.push([fmt(ledMeters(s), 1), "מ׳ פס לד"]);
    const el = $("#stats"); el.innerHTML = "";
    rows.forEach(([v, l]) => { const d = document.createElement("div"); d.innerHTML = `<strong></strong><span></span>`; d.querySelector("strong").textContent = v; d.querySelector("span").textContent = l; el.appendChild(d); });
  }

  /* ---------- Paid AI visualization (Grow + Cloudflare Worker) ---------- */
  const API = (C.aiEndpoint || "").replace(/\/+$/, "");
  const PRICE = C.aiPrice || 5;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    clear: k => { try { localStorage.setItem(k, ""); } catch (e) {} },
  };
  const params = s => ({ style: s.style, room: s.room, light: s.light, temp: s.temp, count: s.count, led: s.led, drop: Math.round(s.drop * 100), height: Math.round(s.H * 100) });
  function saveForm() {
    const data = {};
    [...form.elements].forEach(el => {
      if (!el.name) return;
      if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
      else if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.type !== "file") data[el.name] = el.value;
    });
    return data;
  }
  function loadForm(data) {
    Object.entries(data || {}).forEach(([k, v]) => {
      form.querySelectorAll(`[name="${k}"]`).forEach(el => {
        if (el.type === "radio") el.checked = el.value === v;
        else if (el.type === "checkbox") el.checked = !!v;
        else el.value = v;
      });
    });
    countTouched = true;
  }
  function setPhoto(data) {
    photoData = data; preview.src = data; preview.hidden = false; box.classList.add("has-photo"); clearBtn.hidden = false;
  }
  function showAiImage(img) {
    const viz = $("#viz"), compare = $("#compare");
    viz.innerHTML = ""; const im = new Image(); im.src = img; im.alt = "הדמיית AI של התקרה"; viz.appendChild(im);
    $("#vizBadge").textContent = "הדמיית AI על התמונה שלכם";
    compare.hidden = false; compare.innerHTML = "";
    if (photoData) {
      compare.innerHTML = `<figure><img alt="לפני"><figcaption>לפני – התמונה שלכם</figcaption></figure>`;
      compare.querySelector("img").src = photoData;
    }
    const fig = document.createElement("figure"); fig.appendChild(render3D(lastState));
    const fc = document.createElement("figcaption"); fc.textContent = "הדמיה סכמטית לפי המידות"; fig.appendChild(fc);
    compare.appendChild(fig);
    const dl = document.createElement("a"); dl.className = "pl-btn pl-ai__dl"; dl.href = img; dl.download = "ceiling-ai-michael-hajaj.png"; dl.textContent = "הורדת ההדמיה";
    viz.after(dl);
    $("#aiCard").hidden = true;
  }
  const aiMsg = (t, err) => { const m = $("#aiMsg"); m.textContent = t; m.classList.toggle("is-error", !!err); };

  async function startCheckout() {
    if (!photoData) { aiMsg("כדי ליצור הדמיה על התמונה, העלו קודם תמונה של החדר (שלב 01).", true); return; }
    const name = $("#aiName").value.trim(), phone = $("#aiPhone").value.replace(/\D/g, "");
    if (name.length < 2) { aiMsg("נא למלא שם מלא.", true); $("#aiName").focus(); return; }
    if (!/^0\d{8,9}$/.test(phone)) { aiMsg("נא למלא מספר טלפון תקין.", true); $("#aiPhone").focus(); return; }
    const btn = $("#aiPay"); btn.disabled = true; aiMsg("מעבירים לעמוד התשלום המאובטח…");
    try {
      const r = await fetch(API + "/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photoData, params: params(lastState || readState()), name, phone })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url || !j.id) throw new Error(j.error || "checkout");
      store.set("pl_job", j.id);
      store.set("pl_form", JSON.stringify(saveForm()));
      store.set("pl_photo", photoData);
      window.location.href = j.url;
    } catch (e) {
      btn.disabled = false;
      aiMsg("לא הצלחנו לפתוח את עמוד התשלום. נסו שוב בעוד רגע, או שלחו לנו הודעה בוואטסאפ.", true);
    }
  }

  async function pollResult(id) {
    const viz = $("#viz");
    const loading = t => { viz.innerHTML = `<div class="pl-viz__loading"><i></i><span></span></div>`; viz.querySelector("span").textContent = t; };
    loading("ממתינים לאישור התשלום…");
    $("#result").scrollIntoView({ behavior: "smooth" });
    const started = Date.now();
    while (Date.now() - started < 4 * 60 * 1000) {
      let j = {};
      try { const r = await fetch(API + "/result?job=" + encodeURIComponent(id)); j = await r.json(); } catch (e) {}
      if (j.state === "done" && j.image) { showAiImage(j.image); store.clear("pl_job"); store.clear("pl_photo"); return; }
      if (j.state === "failed") break;
      if (j.state === "missing") {
        viz.innerHTML = ""; viz.appendChild(render3D(lastState)); $("#aiCard").hidden = false;
        aiMsg("לא מצאנו את ההזמנה. אם חויבתם, שלחו לנו הודעה ונטפל בזה.", true); return;
      }
      loading(j.state === "generating" ? "התשלום התקבל. מייצרים את ההדמיה על התמונה שלכם… (עד דקה)" : "ממתינים לאישור התשלום…");
      await new Promise(res => setTimeout(res, 4000));
    }
    viz.innerHTML = ""; viz.appendChild(render3D(lastState));
    $("#aiCard").hidden = false;
    aiMsg("משהו השתבש ביצירת ההדמיה. שלחו לנו הודעה בוואטסאפ ונטפל בזה, כולל החזר התשלום אם צריך.", true);
  }

  /* ---------- Generate ---------- */
  let lastPlan = null, lastState = null;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const s = readState();
    lastState = s;
    const result = $("#result"), viz = $("#viz"), badge = $("#vizBadge"), compare = $("#compare");
    result.hidden = false;
    renderStats(s);
    const plan = renderPlan(s);
    $("#plan").innerHTML = ""; $("#plan").appendChild(plan); lastPlan = plan;
    compare.hidden = true; compare.innerHTML = "";
    $$(".pl-ai__dl").forEach(n => n.parentNode.removeChild(n));
    viz.innerHTML = ""; viz.appendChild(render3D(s)); badge.textContent = "הדמיה סכמטית לפי המידות";
    if (photoData && !API) {
      compare.hidden = false;
      compare.innerHTML = `<figure><img alt="התמונה שלכם"><figcaption>התמונה שלכם – צרפו אותה לפנייה</figcaption></figure>`;
      compare.querySelector("img").src = photoData;
    }
    if (API) { $("#aiCard").hidden = false; $("#aiNoPhoto").hidden = !!photoData; }
    if (!e.detail || !e.detail.silent) result.scrollIntoView({ behavior: "smooth" });

    // WhatsApp summary
    const msg = [
      "שלום מיכאל, תכננתי תקרה באתר ואשמח להצעת מחיר:",
      `חדר: ${ROOM[s.room]} · ${fmt(s.L)}×${fmt(s.W)} מ׳ (${fmt(s.L * s.W, 1)} מ״ר)`,
      `גובה קיים: ${fmt(s.H)} מ׳ · הנמכה: ${Math.round(s.drop * 100)} ס״מ`,
      `סגנון: ${STYLE[s.style]}`,
      `תאורה: ${s.count} × ${LIGHT[s.light]}` + (s.led ? ` + פס לד ${fmt(ledMeters(s), 1)} מ׳ (${TEMP[s.temp]})` : ""),
      s.notes ? "הערות: " + s.notes : "",
      photoData ? "(אצרף תמונה של החדר)" : ""
    ].filter(Boolean).join("\n");
    $("#sendWa").href = wa + "?text=" + encodeURIComponent(msg);
  });

  $("#again").addEventListener("click", () => form.scrollIntoView({ behavior: "smooth" }));

  /* ---------- AI card wiring & return from payment ---------- */
  $$(".js-price").forEach(n => n.textContent = PRICE);
  $("#aiPay").addEventListener("click", startCheckout);
  $("#aiToPhoto").addEventListener("click", () => box.scrollIntoView({ behavior: "smooth", block: "center" }));
  const qs = new URLSearchParams(location.search);
  const jobId = qs.get("job");
  if (API && jobId && /^[\w-]{10,64}$/.test(jobId)) {
    try { loadForm(JSON.parse(store.get("pl_form") || "{}")); } catch (e) {}
    const ph = store.get("pl_photo"); if (ph) setPhoto(ph);
    refreshHints();
    form.dispatchEvent(new CustomEvent("submit", { cancelable: true, detail: { silent: true } }));
    history.replaceState(null, "", location.pathname);
    if (qs.get("cancel")) {
      aiMsg("התשלום בוטל. אפשר לנסות שוב מתי שתרצו.", true);
      $("#result").scrollIntoView({ behavior: "smooth" });
    } else {
      $("#aiCard").hidden = true;
      pollResult(jobId);
    }
  }

  /* ---------- Download / print ---------- */
  $("#dlPlan").addEventListener("click", () => {
    if (!lastPlan) return;
    const xml = new XMLSerializer().serializeToString(lastPlan);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 2800; c.height = 1980;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "ceiling-plan-michael-hajaj.png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  });
  $("#printPlan").addEventListener("click", () => window.print());
})();
