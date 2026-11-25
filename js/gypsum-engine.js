/* ==========================================================
   מנוע חישוב גבס – פיזור פרופילים, לוחות, ברגים וכתב כמויות
   כל המידות במילימטרים.
   ========================================================== */
(function (root) {
  const R = (typeof module !== "undefined" && module.exports) ? require("./gypsum-rules.js") : root.GYPSUM_RULES;

  const r1 = n => Math.round(n);

  /* ---------- מערכת כללים פעילה ---------- */
  const BASE = R;
  const rsCache = {};
  function rulesFor(id) {
    if (!id || id === "si1924" || !BASE.rulesets) return BASE;
    if (rsCache[id]) return rsCache[id];
    const out = JSON.parse(JSON.stringify(BASE));
    (BASE.rulesets.bluebook.overrides || []).forEach(ov => {
      const keys = ov.path.split("."), last = keys.pop();
      const obj = keys.reduce((o, k) => o[k], out);
      const cur = obj[last];
      obj[last] = id === "bluebook" ? ov.value : (ov.kind === "min" ? Math.max(cur, ov.value) : Math.min(cur, ov.value));
    });
    return (rsCache[id] = out);
  }
  function ruleNotes(id, topics) {
    if (!id || id === "si1924" || !BASE.rulesets) return [];
    const bb = BASE.rulesets.bluebook;
    const cl = bb.clauses.filter(c => topics.includes(c.topic)).map(c => ({ ...c, source: bb.short }));
    const ov = (bb.overrides || []).filter(o => topics.includes(o.path.split(".")[0] === "ceiling" ? "ceiling" : o.path.split(".")[0] === "lining" ? "lining" : "partition"))
      .map(o => ({ topic: o.path, section: o.section, text: o.label, si: o.si, conflict: true, verified: o.verified !== false, source: bb.short }));
    return [...cl, ...ov];
  }
  const ceil = Math.ceil;
  const uniq = arr => [...new Set(arr.map(v => Math.round(v)))].sort((a, b) => a - b);

  /* ---------- כלי עזר ---------- */

  // פיזור קווים בין 0 ל-L: מרחק מקסימלי S, עם קווים מחייבים (forced) ומניעת התנגשות במרווחים (blocked)
  function layLines(L, S, forced, blocked, minGap = 60, even = false) {
    const must = uniq([0, L, ...forced.filter(v => v > 0 && v < L)]);
    const lines = [], conflicts = [];
    const hit = x => blocked.find(b => x > b.a && x < b.b);
    for (let i = 0; i < must.length - 1; i++) {
      let p = must[i], end = must[i + 1];
      lines.push(p);
      let guard = 0;
      while (end - p > S && guard++ < 500) {
        let next = even ? p + (end - p) / Math.ceil((end - p) / S) : p + S;
        const b = hit(next);
        if (b) {
          const a = Math.floor(b.a) - 1, z = Math.ceil(b.b) + 1;
          if (a - p >= minGap) next = a;                    // לפני המכשול
          else if (z - p <= S && z < end) next = z;         // אחרי המכשול
          else { conflicts.push({ x: next, item: b.ref }); } // אין ברירה
        }
        // אם הצעד הבא ישאיר שארית קטנה מדי לפני קו מחייב – לא משנים, תקין
        lines.push(r1(next));
        p = next;
      }
    }
    lines.push(L);
    const out = uniq(lines);
    out.forEach(x => { const b = hit(x); if (b && !conflicts.find(c => Math.abs(c.x - x) < 1)) conflicts.push({ x, item: b.ref }); });
    return { lines: out, conflicts };
  }

  // אריזה חד-ממדית (FFD) של חתיכות לאורכי מלאי
  function pack1D(pieces, stock) {
    const len = Math.max(...stock);
    const bars = [];
    const parts = [];
    pieces.forEach(p => { let l = p; while (l > len) { parts.push(len); l -= len; } if (l > 0) parts.push(l); });
    parts.sort((a, b) => b - a).forEach(p => {
      const bar = bars.find(b => b.left >= p);
      if (bar) bar.left -= p; else bars.push({ left: len - p, stock: len });
    });
    const joins = pieces.reduce((s, p) => s + Math.max(0, ceil(p / len) - 1), 0);
    return { count: bars.length, stock: len, joins, totalLen: pieces.reduce((s, p) => s + p, 0) };
  }

  // אריזת לוחות (גיליוטינה פשוטה, FFD). piece = {l: אורך לאורך הלוח, w: רוחב}
  function packBoards(pieces, boardL, boardW = R.board.width) {
    let offcuts = [], boards = 0;
    const parts = [];
    pieces.forEach(p => { let l = p.l; while (l > boardL) { parts.push({ l: boardL, w: p.w }); l -= boardL; } if (l > 5) parts.push({ l, w: p.w }); });
    parts.sort((a, b) => (b.l * b.w) - (a.l * a.w)).forEach(p => {
      let i = offcuts.findIndex(o => o.l >= p.l && o.w >= p.w);
      let o;
      if (i < 0) { boards++; o = { l: boardL, w: boardW }; } else { o = offcuts.splice(i, 1)[0]; }
      const a = { l: o.l - p.l, w: o.w }, b = { l: p.l, w: o.w - p.w };
      [a, b].forEach(x => { if (x.l >= 200 && x.w >= 100) offcuts.push(x); });
      offcuts.sort((x, y) => x.l * x.w - y.l * y.w);
    });
    const area = parts.reduce((s, p) => s + p.l * p.w, 0) / 1e6;
    return { boards, area, used: boards * boardL * boardW / 1e6 };
  }

  function pickStock(lengths, need) {
    const s = [...lengths].sort((a, b) => a - b);
    return s.find(l => l >= need) || null;
  }

  function maxHeightFor(layers, profileW, thk, spacing) {
    const t = R.partition.maxHeight[layers >= 2 ? 2 : 1]?.[profileW]?.[thk >= 15 ? 15.9 : 12.5];
    if (!t) return null;
    return spacing <= 305 ? t[0] : spacing <= 406 ? t[1] : t[2];
  }

  /* ---------- כתב כמויות ---------- */
  function Bill() { this.rows = {}; }
  Bill.prototype.add = function (key, name, unit, qty, note) {
    if (!qty) return;
    const r = this.rows[key] || (this.rows[key] = { key, name, unit, qty: 0, note: note || "" });
    r.qty += qty;
  };
  Bill.prototype.list = function () {
    return Object.values(this.rows).map(r => ({ ...r, qty: r.unit === "ק״ג" || r.unit === "מ״ר" || r.unit === "מ׳" ? Math.ceil(r.qty * 10) / 10 : Math.ceil(r.qty) }));
  };
  function mergeBills(lists) {
    const b = new Bill();
    lists.forEach(l => l.forEach(r => b.add(r.key, r.name, r.unit, r.qty, r.note)));
    return b.list();
  }

  function boardKey(type, thk, len) { return `board-${type}-${thk}-${len}`; }
  function boardName(type, thk, len) { return `${R.board.types[type].name} ${thk} מ״מ, 120×${len / 10}`; }
  function screwKey(layer, thk) { return thk >= 15 ? (layer === 1 ? "board2" : "board3") : (layer === 1 ? "board1" : "board2"); }

  /* =========================================================
     תקרה – שתי וערב בשני מישורים (ראשי + משני)
     input: { w, h (מ״מ), fixtures:[{kind,x,y,d|w,h,kg}], opts }
     opts: { thickness, layers, boardType, wet, boardLen, dir:'auto'|'x'|'y',
             profile:'F47'|'C60', secondarySpacing, primarySpacing, hangerSpacing,
             dropCm, insulation, finish, avoidPrimaries }
     ========================================================= */
  function ceiling(input) {
    const o = Object.assign({ thickness: 12.5, layers: 1, boardType: "regular", wet: false, boardLen: 2600, dir: "auto",
      profile: "F47", dropCm: 15, insulation: false, finish: "basic", avoidPrimaries: true }, input.opts || {});
    if (o.wet && o.boardType === "regular") o.boardType = "water";
    if (o.wet && o.boardType === "fire") o.boardType = "firewater";
    const R = rulesFor(o.ruleset);
    const warnings = [], notes = [];
    // מערכת מקומית: משניים = קווים אנכיים (מפוזרים לאורך X, באורך H). ברירת מחדל: משניים לאורך הצלע הקצרה
    let W = input.w, H = input.h, swap = false;
    if (o.dir === "auto" ? W < H : o.dir === "y") swap = true;
    const T = swap ? (p => ({ x: p.y, y: p.x })) : (p => p);
    if (swap) [W, H] = [H, W];
    const fx = (input.fixtures || []).map(f => {
      const spec = R.fixtures[f.kind] || R.fixtures.custom;
      const round = !!(f.d || (spec.d && !f.w));
      let fw = round ? (f.d || spec.d) : (f.w || spec.w), fh = round ? (f.d || spec.d) : (f.h || spec.h);
      if (swap && !round) [fw, fh] = [fh, fw];
      const p = T({ x: f.x, y: f.y });
      return { ...f, round, x: p.x, y: p.y, fw, fh, kg: f.kg ?? spec.kg, name: spec.name };
    });

    const C = R.ceiling;
    const stdSec = o.wet ? C.secondaryWet : Math.min(C.secondary[o.thickness]?.perp || 500, C.secondary[o.thickness]?.perp || 500);
    const sec = Math.min(o.secondarySpacing || stdSec, 2000);
    if (o.secondarySpacing && o.secondarySpacing > stdSec) warnings.push(`מרחק משניים ${o.secondarySpacing} מ״מ גדול מהמותר בתקן (${stdSec} מ״מ) – הוחזר לערך התקני.`);
    const S = Math.min(sec, stdSec);
    const P = Math.min(o.primarySpacing || C.primaryMax, C.primaryMax);
    const clr = C.fixtureClearance;

    // חורים שגדולים מהמרווח – דורשים חילוף (קיטוע פרופיל ומסגרת)
    const trimmed = [], avoid = [];
    fx.forEach(f => {
      if (f.fw + 2 * clr >= S - 40) trimmed.push(f); else avoid.push(f);
    });
    const blockedX = avoid.map(f => ({ a: f.x - f.fw / 2 - clr, b: f.x + f.fw / 2 + clr, ref: f }));
    const secRes = layLines(W, S, [], blockedX);
    // ראשיים – מעל המשניים, מפוזרים לאורך Y
    const blockedY = o.avoidPrimaries ? fx.map(f => ({ a: f.y - f.fh / 2 - clr, b: f.y + f.fh / 2 + clr, ref: f })) : [];
    const firstP = Math.min(C.hangerFromWall, P / 2);
    const priRes = layLines(H - 2 * firstP, P, [], blockedY.map(b => ({ a: b.a - firstP, b: b.b - firstP, ref: b.ref })), 60, true);
    const primaries = priRes.lines.map(v => v + firstP);

    // עומס למתלה ומרחק מתלים
    const boardKg = (R.board.kgPerM2[o.thickness] || 9) * o.layers;
    const kgM2 = boardKg + C.frameKgM2 + (o.insulation ? 2 : 0) + 1;
    let hs = Math.min(o.hangerSpacing || C.hangerMax, C.hangerMax);
    const primGap = primaries.length > 1 ? Math.max(...primaries.slice(1).map((v, i) => v - primaries[i])) : H;
    while (hs > 300 && (hs / 1000) * (Math.min(primGap, P) / 1000) * kgM2 * 9.81 > C.hangerLoadN) hs -= 50;
    const loadN = (hs / 1000) * (Math.min(primGap, P) / 1000) * kgM2 * 9.81;
    const firstH = Math.min(C.hangerFromWall, hs / 2);
    const hangers = [];
    primaries.forEach(y => {
      const n = Math.max(1, ceil((W - 2 * firstH) / hs));
      for (let i = 0; i <= n; i++) hangers.push({ x: r1(firstH + (W - 2 * firstH) * i / n), y });
    });

    // אביזרים: סטטוס ותמיכה
    const fixtures = fx.map(f => {
      let status = "ok", msg = "בין הפרופילים";
      if (trimmed.includes(f)) { status = "trim"; msg = "פתח גדול – קיטוע משני + מסגרת חילוף"; }
      else if (secRes.conflicts.find(c => c.item === f)) { status = "clash"; msg = "פוגע בפרופיל – יש להזיז את האביזר"; }
      let support = "לוח";
      if (f.kg > C.fixtureOnFrameKg) { support = "מתלה נפרד לתקרה המבנית"; }
      else if (f.kg > C.fixtureOnBoardKg) { support = "חיזוק לשלד"; }
      return { ...f, status, msg, support };
    });
    // מתלים נוספים לאביזרים כבדים ולחילופים
    fixtures.forEach(f => { if (f.support.startsWith("מתלה")) hangers.push({ x: r1(f.x), y: r1(f.y), extra: true }); });
    trimmed.forEach(f => { hangers.push({ x: r1(f.x - f.fw / 2 - 100), y: r1(f.y), extra: true }); hangers.push({ x: r1(f.x + f.fw / 2 + 100), y: r1(f.y), extra: true }); });

    // משניים: קטעים (קטיעה בפתחי חילוף)
    const secondaries = secRes.lines.map(x => {
      const cuts = trimmed.filter(f => x > f.x - f.fw / 2 - 5 && x < f.x + f.fw / 2 + 5).map(f => [f.y - f.fh / 2, f.y + f.fh / 2]);
      let segs = [[0, H]];
      cuts.forEach(([a, b]) => { segs = segs.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(q => q[1] - q[0] > 20)); });
      return { x, segs, edge: x === 0 || x === W };
    });
    // מסגרות חילוף: משני נוסף בשני צדי הפתח + גשרים
    const trims = trimmed.map(f => ({ x: f.x - f.fw / 2, y: f.y - f.fh / 2, w: f.fw, h: f.fh, kind: f.kind }));
    const trimLen = trimmed.reduce((s, f) => s + 2 * (f.fh + 2 * P / 2) + 2 * (f.fw + 200), 0);

    // לוחות: ניצבים למשניים – אורך לאורך X, שורות ברוחב 1200 לאורך Y
    const BW = R.board.width, BL = o.boardLen;
    function rowsFor(oy) {
      const ys = [0]; let y = oy > 0 ? oy : BW;
      while (y < H) { ys.push(y); y += BW; }
      ys.push(H);
      return ys;
    }
    const jc = C.jointClearance;
    function score(oy) {
      const ys = rowsFor(oy);
      let s = 0;
      fx.forEach(f => ys.forEach(y => { if (y > 0 && y < H && Math.abs(f.y - y) < f.fh / 2 + jc) s += 10; }));
      const rws = ys.slice(1).map((v, i) => v - ys[i]);
      if (Math.min(...rws) < 300 && rws.length > 1) s += 3;
      return s;
    }
    let best = 0, bestS = Infinity;
    for (let oy = 0; oy < BW; oy += 25) { if (oy > 0 && oy < 300) continue; const s = score(oy); if (s < bestS) { bestS = s; best = oy; } }
    const ys = rowsFor(best);
    const secX = secRes.lines;
    const boards = [], pieces = [];
    let prevJ = [];
    for (let layer = 1; layer <= o.layers; layer++) {
      const layerShift = layer === 2 ? BW / 2 : 0;
      const yy = layer === 1 ? ys : rowsFor(((best + layerShift) % BW) || BW);
      for (let r = 0; r < yy.length - 1; r++) {
        const y0 = yy[r], rh = yy[r + 1] - y0;
        let x = 0, first = true; const joints = [];
        while (x < W - 1) {
          let lim = x + (first && (r + layer) % 2 === 1 ? BL / 2 : BL);
          let end;
          if (lim >= W) end = W;
          else {
            const cand = secX.filter(v => v > x + 200 && v <= lim);
            end = cand.length ? cand[cand.length - 1] : Math.min(W, x + BL);
            if (prevJ.includes(end) && cand.length > 1) end = cand[cand.length - 2];
            const hitFix = fx.find(f => Math.abs(f.x - end) < f.fw / 2 + jc && Math.abs(f.y - (y0 + rh / 2)) < rh / 2 + f.fh / 2);
            if (hitFix && cand.length > 1) { const alt = cand.slice().reverse().find(v => v !== end && Math.abs(hitFix.x - v) >= hitFix.fw / 2 + jc); if (alt) end = alt; }
          }
          boards.push({ x, y: y0, w: end - x, h: rh, layer });
          pieces.push({ l: end - x, w: rh });
          if (end < W) joints.push(end);
          x = end; first = false;
        }
        prevJ = joints;
      }
    }
    // בדיקת חורים על תפרים
    fixtures.forEach(f => {
      if (f.status !== "ok") return;
      const onJoint = boards.some(b => b.layer === o.layers && ((Math.abs(b.y - f.y) < f.fh / 2 + 10 && b.y > 0) || (Math.abs(b.x - f.x) < f.fw / 2 + 10 && b.x > 0)) &&
        f.x > b.x - f.fw && f.x < b.x + b.w + f.fw && f.y > b.y - f.fh && f.y < b.y + b.h + f.fh);
      if (onJoint) { f.status = "joint"; f.msg = "נופל על תפר לוחות – מומלץ להזיז 5–10 ס״מ"; }
    });

    const pack = packBoards(pieces, BL);
    const area = W * H / 1e6;
    const prof = R.profiles[o.profile] || R.profiles.F47;
    const profStock = prof.lengths;
    const secPieces = secondaries.flatMap(s => s.edge ? [] : s.segs.map(([a, b]) => b - a));
    const priPieces = primaries.map(() => W);
    const pSec = pack1D(secPieces, profStock), pPri = pack1D(priPieces, profStock);
    const pTrim = pack1D(trimLen > 0 ? [trimLen] : [], profStock);
    const perim = 2 * (W + H);
    const pPer = pack1D([perim], R.profiles[prof.track].lengths);
    const crosses = secondaries.filter(s => !s.edge).length * primaries.length;
    const screwsPerLayer = secondaries.reduce((s, q) => s + q.segs.reduce((a, [p, e]) => a + ceil((e - p) / C.screwMax) + 1, 0), 0) +
      ys.length * secondaries.length; // תוספת לתפרים

    // אזהרות כלליות
    if (W > C.expansionJoint || H > C.expansionJoint) warnings.push("התקרה ארוכה מ-12 מ׳ – נדרש מישק התפשטות (סעיף 5.10.1).");
    secRes.conflicts.forEach(c => { if (c.item) warnings.push(`${c.item.name} במיקום ${(c.item.x / 10).toFixed(0)} ס״מ – לא ניתן להתחמק מהפרופיל, יש להזיז את האביזר.`); });
    if (o.wet) notes.push("חדר רטוב: לוחות עמידי מים, מרחק משניים ≤406 מ״מ, ללא מחסום אדים, איחוי במרק על בסיס גבס (לא גיר).");
    if (o.dropCm < 8) warnings.push("הנמכה של פחות מ-8 ס״מ – אין מספיק מקום לשתי וערב + ספוטים. שקלו פרופיל ישיר (F47 עם מתלה ישיר).");
    const deepFix = fx.filter(f => ["downlight", "speaker"].includes(f.kind));
    if (deepFix.length && o.dropCm < 12) warnings.push("גופי תאורה / רמקולים דורשים בדרך כלל עומק של 10–12 ס״מ לפחות – בדקו בדף היצרן.");
    notes.push(`עומס משוער למתלה: ${Math.round(loadN)} ניוטון (מותר עד ${C.hangerLoadN}).`);

    // כתב כמויות
    const bill = new Bill();
    bill.add(boardKey(o.boardType, o.thickness, BL), boardName(o.boardType, o.thickness, BL), "יח׳", pack.boards);
    bill.add("prof-" + o.profile, prof.name + ` – ${pSec.stock / 1000} מ׳`, "יח׳", pSec.count + pPri.count + pTrim.count, "משניים + ראשיים + חילופים");
    bill.add("track-" + prof.track, R.profiles[prof.track].name + " – 3 מ׳", "יח׳", pPer.count);
    bill.add("cross-" + o.profile, `מחבר שתי וערב (צלב) ${o.profile}`, "יח׳", crosses + trimmed.length * 4);
    bill.add("ext-" + o.profile, `מאריך ${o.profile}`, "יח׳", pSec.joins + pPri.joins);
    bill.add("hanger", "מתלה (נוניוס / מוט הברגה 6 מ״מ / לוחית תלייה)", "יח׳", hangers.length);
    bill.add("ceilAnchor", R.screws.ceilAnchor, "יח׳", hangers.length);
    bill.add("anchor", R.screws.anchor, "יח׳", ceil(perim / C.perimeterFix) + 4, "לפרופיל ההיקפי");
    for (let l = 1; l <= o.layers; l++) bill.add(screwKey(l, o.thickness), R.screws[screwKey(l, o.thickness)], "יח׳", screwsPerLayer * 1.1);
    bill.add("metal", R.screws.metal, "יח׳", trimmed.length * 12 + (pSec.joins + pPri.joins) * 4);
    addFinish(bill, area, boards.filter(b => b.layer === o.layers), o.finish, o.wet);
    if (o.insulation) bill.add("wool", "צמר סלעים / זכוכית 50 מ״מ", "מ״ר", area * 1.05);

    return {
      ruleNotes: ruleNotes(o.ruleset, ["ceiling", "board", "general"]),
      kind: "ceiling", W, H, swap, sec: S, stdSec, pri: P, hangerSpacing: hs, loadN,
      secondaries, primaries, hangers, boards, fixtures, trims, rows: ys, opts: o, area,
      warnings, notes, bill: bill.list(),
      stats: { area, secondaries: secondaries.length, primaries: primaries.length, hangers: hangers.length, boards: pack.boards, waste: pack.used ? Math.max(0, 1 - pack.area / pack.used) : 0 }
    };
  }

  function addFinish(bill, area, faceBoards, finish, wet) {
    const f = R.finish[finish] || R.finish.basic;
    // אורך תפרים
    let joint = 0;
    faceBoards.forEach(b => { joint += (b.x > 0 ? b.h : 0) + (b.y > 0 ? b.w : 0); });
    bill.add("tape", "סרט רשת / נייר לתפרים", "מ׳", joint / 1000 * 1.1);
    bill.add(wet ? "compound-gyp" : "compound", wet ? "מרק על בסיס גבס (לחדר רטוב)" : "מרק / שפכטל מוכן", "ק״ג", area * f.kg + joint / 1000 * 0.25);
  }

  /* =========================================================
     מחיצה / חיפוי
     input: { L, opts, elements:[{kind,pos(מרכז),w,h,y}] }
     opts: { height(מ״מ), profile:'C50'|'C70'|'C100'|'F47'|'C60', layers, sides(1|2),
             thickness, boardType, wet, tiles, insulation, boardLen, spacing, finish, lining }
     ========================================================= */
  function wall(input) {
    const o = Object.assign({ height: 2700, profile: "C70", layers: 1, sides: 2, thickness: 12.5, boardType: "regular",
      wet: false, tiles: false, insulation: true, boardLen: 3000, spacing: 0, finish: "basic", lining: false }, input.opts || {});
    if (o.lining) o.sides = 1;
    const R = rulesFor(o.ruleset);
    if (o.wet && o.boardType === "regular") o.boardType = "water";
    if (o.wet && o.boardType === "fire") o.boardType = "firewater";
    const L = r1(input.L), Hh = r1(o.height);
    const warnings = [], notes = [];
    const P = R.partition, BW = R.board.width;
    const strict = o.wet || o.tiles;
    const stdS = o.lining ? (strict ? R.lining.profileSpacingWet : R.lining.profileSpacing) : (strict ? P.studSpacingWet : P.studSpacing);
    let S = o.spacing ? Math.min(o.spacing, stdS) : stdS;
    if (o.spacing && o.spacing > stdS) warnings.push(`מרחק ניצבים ${o.spacing} מ״מ חורג מהתקן (${stdS} מ״מ) – הוחזר לערך התקני.`);
    if (o.layers === 1 && o.thickness < P.minSingleLayerThickness) warnings.push("במחיצה חד-שכבתית עובי לוח מינימלי 12.7 מ״מ (סעיף 3.4.1).");
    const prof = R.profiles[o.profile] || R.profiles.C70;

    // בדיקת גובה (טבלה 1)
    if (!o.lining) {
      const mh = maxHeightFor(o.layers, prof.width, o.thickness, S);
      if (mh && Hh > mh) {
        const better = ["C50", "C70", "C100"].find(k => (maxHeightFor(o.layers, R.profiles[k].width, o.thickness, S) || 0) >= Hh);
        warnings.push(`גובה ${Hh / 10} ס״מ חורג מהמקסימום לפרופיל ${prof.width} (${mh / 10} ס״מ, טבלה 1).` + (better ? ` מומלץ ${R.profiles[better].name}.` : " נדרש תכנון סטטי ייחודי."));
      }
    }
    const studLen = Hh - P.studShorter;
    const stock = pickStock(prof.lengths, studLen);
    if (!stock) warnings.push(`אין ניצב באורך ${studLen} מ״מ במלאי – הזקף חייב להיות יחידה אחת ללא חיבור (3.3.1.1). יש להזמין אורך מיוחד.`);

    const els = (input.elements || []).map(e => {
      const spec = R.wallElements[e.kind] || R.wallElements.box;
      return { ...e, w: e.w || spec.w, h: e.h || spec.h, y: e.y ?? spec.y, name: spec.name };
    });
    const openings = els.filter(e => e.kind === "door" || e.kind === "window").map(e => ({ ...e, x0: r1(e.pos - e.w / 2), x1: r1(e.pos + e.w / 2) }));
    const boxes = els.filter(e => !(e.kind === "door" || e.kind === "window"));
    const inOpening = x => openings.find(op => x > op.x0 + 1 && x < op.x1 - 1);

    // חיפוש היסט לוחות שממזער התנגשויות
    const jambs = openings.flatMap(op => [op.x0, op.x1]);
    const boxBlock = boxes.map(b => ({ a: b.pos - b.w / 2 - R.boxClearance, b: b.pos + b.w / 2 + R.boxClearance, ref: b }));
    const half = BW / 2;
    function jointsFor(off, shift) { const j = []; for (let x = ((off + shift) % BW); x < L; x += BW) if (x > 0) j.push(x); return j; }
    function layoutJoints(off) {
      const sets = [];
      for (let s = 0; s < o.sides; s++) for (let l = 0; l < o.layers; l++) sets.push({ side: s, layer: l + 1, j: jointsFor(off, ((s + l) % 2) * half) });
      return sets;
    }
    function cost(off) {
      let c = 0;
      const all = layoutJoints(off).flatMap(s => s.j);
      all.forEach(x => {
        if (boxBlock.some(b => x > b.a && x < b.b)) c += 10;
        jambs.forEach(jx => { const d = Math.abs(x - jx); if (d > 1 && d < P.jointFromOpening) c += 4; if (d <= 1) c += 4; });
      });
      const first = ((off % BW) || BW);
      if (first < 300 && L > 600) c += 2;
      const last = (L - first) % BW; if (last > 0 && last < 300) c += 2;
      return c;
    }
    let off = 0, bc = Infinity;
    for (let t = 0; t < BW; t += 10) { const c = cost(t); if (c < bc - 0.01) { bc = c; off = t; } }
    const jointSets = layoutJoints(off);
    // ניצבים: מחייבים = קצוות, תפרים, צדי פתחים
    const forcedJ = uniq(jointSets.flatMap(s => s.j)).filter(x => !inOpening(x));
    const forced = uniq([...forcedJ, ...jambs]);
    const { lines, conflicts } = layLines(L, S, forced, boxBlock);
    const studs = lines.map(x => {
      const op = inOpening(x);
      let type = "regular";
      if (x === 0 || x === L) type = "end";
      if (jambs.some(j => Math.abs(j - x) < 1)) type = "jamb";
      if (op) type = op.kind === "door" ? "cripple" : "cripple";
      return { x, type, op };
    });
    // ניצבי עזר מעל/מתחת לפתחים לפי מרחק
    openings.forEach(op => {
      const inside = studs.filter(s => s.x > op.x0 && s.x < op.x1);
      if (!inside.length && op.x1 - op.x0 > S) {
        for (let x = op.x0 + S; x < op.x1 - 50; x += S) studs.push({ x: r1(x), type: "cripple", op });
      }
    });
    studs.sort((a, b) => a.x - b.x);
    conflicts.forEach(c => { if (c.item) warnings.push(`${c.item.name} במרחק ${(c.item.pos / 10).toFixed(0)} ס״מ – נופל על ניצב מחייב (קצה/פתח). הזיזו את הקופסה ב-5–10 ס״מ.`); });
    boxes.forEach(b => {
      const j = jointSets.find(s => s.j.some(x => x > b.pos - b.w / 2 - 10 && x < b.pos + b.w / 2 + 10));
      if (j) warnings.push(`${b.name} ב-${(b.pos / 10).toFixed(0)} ס״מ – נופל על תפר לוחות בצד ${j.side + 1}.`);
    });

    // לוחות לכל צד ושכבה
    const BL = o.boardLen;
    const boards = [], pieces = [];
    jointSets.forEach(set => {
      const xs = uniq([0, ...set.j, L]);
      for (let i = 0; i < xs.length - 1; i++) {
        const x0 = xs[i], x1 = xs[i + 1], w = x1 - x0;
        const full = openings.filter(op => op.x0 <= x0 + 1 && op.x1 >= x1 - 1);
        const segs = [];
        if (!full.length) segs.push([P.boardGapFloor, Hh]);
        else {
          const op = full[0];
          if (op.y > P.boardGapFloor + 50) segs.push([P.boardGapFloor, op.y]);
          if (op.y + op.h < Hh - 50) segs.push([op.y + op.h, Hh]);
        }
        segs.forEach(([y0, y1]) => {
          // שבירת גובה מעל אורך הלוח – החלפת כיוון בעמודות סמוכות לפיזור תפרים אופקיים
          let y = y0; const flip = i % 2 === 1;
          const hs = [];
          let rem = y1 - y0;
          while (rem > BL) { hs.push(BL); rem -= BL; }
          hs.push(rem);
          if (flip && hs.length > 1) hs.reverse();
          hs.forEach(h => { boards.push({ side: set.side, layer: set.layer, x: x0, y, w, h }); pieces.push({ l: h, w }); y += h; });
        });
      }
    });
    if (Hh - P.boardGapFloor > BL) notes.push(`גובה הקיר גדול מאורך הלוח (${BL / 10} ס״מ) – תפרים אופקיים מדורגים בין עמודות.`);
    const pack = packBoards(pieces, BL);

    // פרופילים
    const fullStuds = studs.filter(s => s.type !== "cripple");
    const crippleLens = studs.filter(s => s.type === "cripple").flatMap(s => {
      const op = s.op, out = [];
      if (op.y + op.h < Hh) out.push(Hh - (op.y + op.h) - 20);
      if (op.y > 100) out.push(op.y - 20);
      return out;
    });
    const studPack = pack1D([...fullStuds.map(() => studLen), ...crippleLens.filter(v => v > 50)], stock ? [stock] : prof.lengths);
    const trackW = prof.track || "U70";
    const bottom = L - openings.filter(op => op.kind === "door").reduce((s, op) => s + op.w, 0);
    const headers = openings.reduce((s, op) => s + (op.w + 300) * (op.kind === "window" ? 2 : 1), 0);
    const trackPack = pack1D([bottom, L, ...(headers ? [headers] : [])].filter(v => v > 0), R.profiles[trackW]?.lengths || [3000]);
    const area = L * Hh / 1e6 - openings.reduce((s, op) => s + op.w * op.h, 0) / 1e6;

    const bill = new Bill();
    bill.add(boardKey(o.boardType, o.thickness, BL), boardName(o.boardType, o.thickness, BL), "יח׳", pack.boards);
    bill.add("stud-" + o.profile + "-" + (stock || "x"), `${prof.name} – ${(stock || Math.max(...prof.lengths)) / 1000} מ׳`, "יח׳", studPack.count);
    bill.add("track-" + trackW, (R.profiles[trackW]?.name || "מסילה") + " – 3 מ׳", "יח׳", trackPack.count);
    const fixS = strict ? P.trackFixWet : P.trackFix;
    bill.add("anchor", R.screws.anchor, "יח׳", (ceil(bottom / fixS) + 1) + (ceil(L / fixS) + 1) + 2 * (ceil(Hh / P.endStudFix) + 1));
    bill.add("seal", "פס איטום והפרדה (סרט ספוג)", "מ׳", (2 * L + 2 * Hh) / 1000 * 1.05);
    bill.add("metal", R.screws.metal, "יח׳", studs.length * 4 + openings.length * 8);
    // ברגי לוחות: שולי לוח 250, אמצע 300
    for (let s = 0; s < o.sides; s++) for (let l = 1; l <= o.layers; l++) {
      const bs = boards.filter(b => b.side === s && b.layer === l);
      let n = 0;
      bs.forEach(b => {
        const st = studs.filter(q => q.x >= b.x - 1 && q.x <= b.x + b.w + 1);
        st.forEach(q => { const edge = Math.abs(q.x - b.x) < 2 || Math.abs(q.x - (b.x + b.w)) < 2; n += ceil(b.h / (edge ? P.screwEdge : P.screwMid)) + 1; });
      });
      bill.add(screwKey(l, o.thickness), R.screws[screwKey(l, o.thickness)], "יח׳", n * 1.1);
    }
    openings.filter(op => op.kind === "door").forEach(() => {
      bill.add("doorstud", `ניצב מחוזק לדלת (1.25 מ״מ, או ניצב עם מילוי עץ)`, "יח׳", 2);
      bill.add("doorangle", "זוויתן חיזוק 1.5 מ״מ לעיגון ניצבי דלת", "יח׳", 4);
    });
    if (openings.some(op => op.kind === "door")) notes.push("דלתות: ניצבי צד מפרופיל 1.25 מ״מ או מילוי עץ לכל הגובה, מעוגנים בזוויתני 1.5 מ״מ (סעיף 3.5). תפרי לוחות ≥15 ס״מ מפינות הפתח – לוח בצורת ר׳.");
    const faces = boards.filter(b => b.layer === o.layers);
    addFinish(bill, area * o.sides, faces, o.finish, o.wet);
    bill.add("corner", "פינת מגן קשיחה (לפינות חוץ ופתחים)", "מ׳", openings.reduce((s, op) => s + (2 * op.h + op.w) * o.sides, 0) / 1000);
    if (o.insulation && !o.lining) bill.add("wool", `צמר סלעים / זכוכית ${prof.width >= 70 ? 50 : 40} מ״מ`, "מ״ר", area * 1.05);
    if (o.wet) {
      notes.push("חדר רטוב: ניצבים כל ≤406 מ״מ, עיגון מסילות כל ≤300 מ״מ, פס איטום רציף, חגורת הגבהה, אטימת מרווח תחתון.");
      bill.add("sealant", "חומר איטום לתחתית הלוחות (סיליקון / פוליאוריטן)", "שפופרת", ceil(L / 4000) * o.sides);
    }
    if (o.tiles) notes.push(`חיפוי אריחים: משקל ≤30 ק״ג/מ״ר, ועד ${P.tileMaxKgPerM[o.layers >= 2 ? 2 : 1]} ק״ג למטר אורך מחיצה (3.9.3).`);
    if (L > P.expansionJoint) warnings.push("מחיצה ארוכה מ-12 מ׳ – נדרש מישק התפשטות (3.8.1).");
    if (o.lining) notes.push(`חיפוי: פרופילים כל ≤${stdS} מ״מ, זוויתנים לקיר כל ≤100 ס״מ, עיגון כל ≤${strict ? 300 : 600} מ״מ.`);
    if (o.lining) bill.add("bracket", "זוויתן / מתלה ישיר לקיר", "יח׳", studs.length * (ceil(Hh / R.lining.bracketSpacing) + 1));

    return {
      ruleNotes: ruleNotes(o.ruleset, [o.lining ? "lining" : "partition", "board", "general"]),
      kind: o.lining ? "lining" : "wall", L, H: Hh, S, stdS, studs, openings, boxes, boards, jointSets, offset: off,
      opts: o, area, studLen, stock, warnings, notes, bill: bill.list(),
      stats: { area, studs: studs.length, boards: pack.boards, waste: pack.used ? Math.max(0, 1 - pack.area / pack.used) : 0 }
    };
  }

  /* ---------- תמחור ---------- */
  function pricing(n, prices = [35, 30, 25], max = 10) {
    const k = Math.min(n, max);
    let total = 0;
    for (let i = 0; i < k; i++) total += prices[Math.min(i, prices.length - 1)];
    return total;
  }

  const API = { rulesFor, ruleNotes, ceiling, wall, mergeBills, pricing, layLines, pack1D, packBoards, maxHeightFor };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.GypsumEngine = API;
})(this);
