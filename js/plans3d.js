/* הדמיית תלת-ממד – three.js */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const host = document.getElementById("view3d");
let renderer, scene, camera, controls, root, lastKey = "", texCache = {}, viewMode = "orbit", lastArgs = null;
function rerender() { if (lastArgs) render(...lastArgs); }

function kelvin(k) { return k <= 3000 ? 0xffd2a1 : k <= 4000 ? 0xfff1e0 : 0xe8f0ff; }

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1b19);
  camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  host.innerHTML = "";
  host.appendChild(renderer.domElement);
  new ResizeObserver(size).observe(host);
  size();
  setupWalk();
  let last = performance.now();
  (function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, ((t || performance.now()) - last) / 1000); last = t || performance.now();
    if (walk.on) { stepWalk(dt); drawMap(); } else controls.update();
    renderer.render(scene, camera);
  })();
}
function size() {
  const r = host.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}

function planTexture(p) {
  if (!p.img) return null;
  if (texCache[p.id]?.src === p.img) return texCache[p.id].tex;
  const tex = new THREE.TextureLoader().load(p.img);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache[p.id] = { src: p.img, tex };
  return tex;
}

function render(p, results, o) {
  if (!p || !p.items.length) return;
  if (!renderer) init();
  lastArgs = [p, results, o];
  const key = JSON.stringify([p.id, p.items, p.roomH, p.mpp, o, viewMode]);
  if (key === lastKey) return;
  const firstFrame = !lastKey || !lastKey.startsWith(JSON.stringify([p.id]).slice(0, -1));
  lastKey = key;
  if (root) scene.remove(root);
  root = new THREE.Group(); scene.add(root);
  const H = p.roomH || 2.7;
  const wallMat = new THREE.MeshStandardMaterial({ color: o.wall, roughness: .9 });
  const seeThrough = o.xray || viewMode === "top";
  const ceilMat = new THREE.MeshStandardMaterial({ color: o.ceil, roughness: .85, transparent: seeThrough, opacity: o.xray ? .18 : viewMode === "top" ? .35 : 1, depthWrite: !seeThrough,
    emissive: new THREE.Color(o.ceil).multiplyScalar(0.22) });
  const lightCol = kelvin(o.kelvin);

  // bounds
  const pts = p.items.flatMap(it => it.type === "ceiling" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.a.x, it.a.y], [it.b.x, it.b.y]]);
  const minX = Math.min(...pts.map(q => q[0])), maxX = Math.max(...pts.map(q => q[0]));
  const minY = Math.min(...pts.map(q => q[1])), maxY = Math.max(...pts.map(q => q[1]));
  const cx = (minX + maxX) / 2, cz = (minY + maxY) / 2, span = Math.max(maxX - minX, maxY - minY, 3);

  // floor (with plan texture)
  const tex = planTexture(p);
  let floor;
  if (tex && p.imgW && viewMode !== "walk") {
    const fw = p.imgW * p.mpp, fh = p.imgH * p.mpp;
    floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 1 }));
    floor.position.set(fw / 2, 0, fh / 2);
  } else {
    floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 4, span + 4), new THREE.MeshStandardMaterial({ color: o.floor, roughness: .95 }));
    floor.position.set(cx, 0, cz);
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  root.add(new THREE.HemisphereLight(0xffffff, 0x5a5243, 1.1));
  root.add(new THREE.AmbientLight(lightCol, 0.55));   // אור מוחזר מהרצפה והקירות – כדי שהתקרה לא תיראה שחורה מלמטה
  const sun = new THREE.DirectionalLight(0xffffff, .5); sun.position.set(cx + span, H * 3, cz + span); root.add(sun);

  let pointCount = 0;
  p.items.forEach(it => {
    const res = results[it.id];
    if (it.type === "ceiling") {
      const drop = (it.opts.dropCm || 15) / 100, y = H - drop;
      // קירות החדר הקיימים (תצוגת "בית בובות" – רואים מבפנים)
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const inner = new THREE.MeshStandardMaterial({ color: o.wall, roughness: .92, side: THREE.BackSide });
      const room = new THREE.Mesh(new THREE.BoxGeometry(it.w, H, it.h), [inner, inner, hidden, hidden, inner, inner]);
      room.position.set(it.x + it.w / 2, H / 2, it.y + it.h / 2); room.receiveShadow = true; root.add(room);
      const skirt = new THREE.MeshStandardMaterial({ color: 0x5e5850, roughness: .6 });
      [[it.w, 0.012, it.x + it.w / 2, it.y + 0.006], [it.w, 0.012, it.x + it.w / 2, it.y + it.h - 0.006], [0.012, it.h, it.x + 0.006, it.y + it.h / 2], [0.012, it.h, it.x + it.w - 0.006, it.y + it.h / 2]]
        .forEach(([w, d, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), skirt); m.position.set(x, 0.04, z); root.add(m); });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.0125 * it.opts.layers, it.h), ceilMat);
      slab.position.set(it.x + it.w / 2, y, it.y + it.h / 2); root.add(slab);
      // bulkhead edge (סינר)
      const edgeMat = new THREE.MeshStandardMaterial({ color: o.ceil, roughness: .85 });
      [[it.w, 0.02, it.x + it.w / 2, it.y], [it.w, 0.02, it.x + it.w / 2, it.y + it.h]].forEach(([w, d, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, drop, d), edgeMat); m.position.set(x, H - drop / 2, z); root.add(m); });
      [[it.x], [it.x + it.w]].forEach(([x]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, drop, it.h), edgeMat); m.position.set(x, H - drop / 2, it.y + it.h / 2); root.add(m); });
      it.fixtures.forEach(f => {
        const X = it.x + f.x, Z = it.y + f.y;
        const isLight = !!(window.GYPSUM_RULES?.fixtures[f.kind]?.light);
        const col = isLight ? lightCol : f.kind === "speaker" ? 0x2a2a2a : 0xdddddd;
        const mat = new THREE.MeshStandardMaterial({ color: col, emissive: isLight ? lightCol : 0x000000, emissiveIntensity: isLight ? 2.2 : 0 });
        let m;
        if (f.d) { m = new THREE.Mesh(new THREE.CylinderGeometry(f.d / 2000, f.d / 2000, 0.01, 28), mat); }
        else { const w = (f.rot ? f.h : f.w) / 1000, h = (f.rot ? f.w : f.h) / 1000; m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, h), mat); }
        m.position.set(X, y - 0.01, Z); root.add(m);
        if (isLight && pointCount < 10) {
          const L = new THREE.SpotLight(lightCol, 14, H * 2.4, Math.PI / 3, .7, 1.4);
          L.position.set(X, y - .03, Z); L.target.position.set(X, 0, Z);
          root.add(L); root.add(L.target); pointCount++;
        }
      });
      if (o.xray && res) {
        const g = new THREE.Group();
        const map = (lx, ly) => res.swap ? [it.x + ly / 1000, it.y + lx / 1000] : [it.x + lx / 1000, it.y + ly / 1000];
        const add = (a, b, color, yy) => {
          const [x1, z1] = map(...a), [x2, z2] = map(...b);
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, yy, z1), new THREE.Vector3(x2, yy, z2)]);
          g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
        };
        res.secondaries.forEach(s => s.segs.forEach(([a, b]) => add([s.x, a], [s.x, b], 0x4aa3ff, y + .02)));
        res.primaries.forEach(yy => add([0, yy], [res.W, yy], 0xff5a45, y + .05));
        res.hangers.forEach(h => { const [x, z] = map(h.x, h.y); const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y + .05, z), new THREE.Vector3(x, H, z)]); g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff }))); });
        root.add(g);
      }
    } else {
      const dx = it.b.x - it.a.x, dz = it.b.y - it.a.y, len = Math.hypot(dx, dz);
      const prof = { C50: .05, C70: .07, C100: .1, F47: .047, C60: .06 }[it.opts.profile] || .07;
      const t = prof + it.opts.layers * (it.opts.thickness / 1000) * (it.opts.lining ? 1 : it.opts.sides) + (it.opts.lining ? .02 : 0);
      const h = Math.min((it.opts.height || H * 1000) / 1000, H);
      const ang = Math.atan2(dz, dx);
      const nx = -dz / len, nz = dx / len, off = it.opts.lining ? t / 2 : 0;
      const grp = new THREE.Group();
      grp.position.set(it.a.x + nx * off, 0, it.a.y + nz * off); grp.rotation.y = -ang;
      // wall with openings: build from segments
      const ops = it.elements.filter(e => ["door", "opening"].includes(window.GYPSUM_RULES?.wallElements[e.kind]?.type)).map(e => ({ x0: e.pos - e.w / 2000, x1: e.pos + e.w / 2000, y0: (e.y || 0) / 1000, y1: ((e.y || 0) + e.h) / 1000 })).sort((a, b) => a.x0 - b.x0);
      const box = (x0, x1, y0, y1) => { if (x1 - x0 < .005 || y1 - y0 < .005) return; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), wallMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.castShadow = m.receiveShadow = true; grp.add(m); };
      let x = 0;
      ops.forEach(op => { box(x, op.x0, 0, h); box(op.x0, op.x1, 0, op.y0); box(op.x0, op.x1, op.y1, h); x = op.x1; });
      box(x, len, 0, h);
      // door leaf / window glass
      ops.forEach((op, i) => {
        const el = it.elements.filter(e => ["door", "opening"].includes(window.GYPSUM_RULES?.wallElements[e.kind]?.type)).sort((a, b) => a.pos - b.pos)[i];
        const isDoor = window.GYPSUM_RULES?.wallElements[el.kind]?.type === "door";
        const m = new THREE.Mesh(new THREE.BoxGeometry(op.x1 - op.x0 - .02, op.y1 - op.y0 - .01, isDoor ? .04 : .01),
          new THREE.MeshStandardMaterial({ color: isDoor ? 0x8a6a4a : 0x9cc9e8, transparent: !isDoor, opacity: isDoor ? 1 : .35, roughness: .6 }));
        m.position.set((op.x0 + op.x1) / 2, (op.y0 + op.y1) / 2, 0); grp.add(m);
      });
      // boxes on face
      it.elements.filter(e => !["door", "opening"].includes(window.GYPSUM_RULES?.wallElements[e.kind]?.type)).forEach(e => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(.08, e.kind === "data" ? .12 : .08, .01), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 }));
        m.position.set(e.pos, (e.y || 300) / 1000, t / 2 + .005); grp.add(m);
      });
      if (o.xray && res) {
        res.studs.forEach(s => { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.x / 1000, 0, t / 2 + .006), new THREE.Vector3(s.x / 1000, h, t / 2 + .006)]); grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: s.type === "jamb" ? 0xff5a45 : 0x4aa3ff }))); });
      }
      root.add(grp);
    }
  });

  // נתוני הליכה: גבולות הבית וקירות (עם פתחי דלתות) לחסימה
  walk.bounds = { minX: minX - 0.3, maxX: maxX + 0.3, minZ: minY - 0.3, maxZ: maxY + 0.3 };
  walk.walls = p.items.filter(it => it.type !== "ceiling").map(it => {
    const dx = it.b.x - it.a.x, dz = it.b.y - it.a.y, len = Math.hypot(dx, dz) || 1;
    return { ax: it.a.x, az: it.a.y, ux: dx / len, uz: dz / len, len,
      doors: it.elements.filter(e => window.GYPSUM_RULES?.wallElements[e.kind]?.type === "door").map(e => [e.pos - e.w / 2000, e.pos + e.w / 2000]) };
  });
  walk.rooms = p.items.filter(it => it.type === "ceiling").map(it => ({ x: it.x, z: it.y, w: it.w, h: it.h, name: it.opts.name || "", ceilY: H - (it.opts.dropCm || 15) / 100 }));
  walk.H = H;
  if (walk.on && !walk.placed) placeWalker();
  if (firstFrame) {
    const big = p.items.filter(i => i.type === "ceiling").sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (big) { // מבט מתוך החדר הגדול, מפינה
      camera.position.set(big.x + big.w * .1, 1.6, big.y + big.h * .9);
      controls.target.set(big.x + big.w * .7, 1.5, big.y + big.h * .3);
    } else {
      camera.position.set(cx - span * .55, H * 1.05, cz + span * .95);
      controls.target.set(cx, H * .45, cz);
    }
  }
}

/* ---------- מצב טיול בבית (גובה עיניים) ---------- */
const walk = { on: false, placed: false, yaw: 0, pitch: 0, keys: {}, btn: {}, walls: [], rooms: [], bounds: null, H: 2.7 };
const EYE = 1.6, SPEED = 1.4, R = 0.25;
function placeWalker() {
  const big = [...walk.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (big) { camera.position.set(big.x + big.w * 0.2, EYE, big.z + big.h * 0.8); walk.yaw = Math.atan2(-(big.w * 0.5), -(-big.h * 0.5)); }
  else if (walk.bounds) camera.position.set((walk.bounds.minX + walk.bounds.maxX) / 2, EYE, (walk.bounds.minZ + walk.bounds.maxZ) / 2);
  walk.pitch = 0.15; walk.placed = true; applyLook();
}
function applyLook() { camera.rotation.order = "YXZ"; camera.rotation.set(walk.pitch, walk.yaw, 0); }
function blocked(x, z) {
  const b = walk.bounds; if (b && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return true;
  return walk.walls.some(w => {
    const t = (x - w.ax) * w.ux + (z - w.az) * w.uz;
    if (t < -R || t > w.len + R) return false;
    const d = Math.abs((x - w.ax) * -w.uz + (z - w.az) * w.ux);
    if (d > R) return false;
    return !w.doors.some(([a, c]) => t > a + 0.1 && t < c - 0.1);   // דרך הדלת עוברים
  });
}
function stepWalk(dt) {
  const k = walk.keys, bt = walk.btn;
  const f = (k.ArrowUp || k.KeyW || bt.f ? 1 : 0) - (k.ArrowDown || k.KeyS || bt.b ? 1 : 0);
  const s = (k.KeyD || bt.r ? 1 : 0) - (k.KeyA || bt.l ? 1 : 0);
  const turn = (k.ArrowLeft || bt.tl ? 1 : 0) - (k.ArrowRight || bt.tr ? 1 : 0);
  if (turn) { walk.yaw += turn * 1.6 * dt; applyLook(); }
  if (f || s) {
    const sin = Math.sin(walk.yaw), cos = Math.cos(walk.yaw);
    const vx = (-sin * f + cos * s) * SPEED * dt, vz = (-cos * f - sin * s) * SPEED * dt;
    const p = camera.position;
    if (!blocked(p.x + vx, p.z)) p.x += vx;
    if (!blocked(p.x, p.z + vz)) p.z += vz;
  }
}
function setWalk(on) {
  walk.on = on;
  viewMode = on ? "walk" : "orbit";
  camera.fov = 50; camera.updateProjectionMatrix();
  rerender();
  const mm = host.querySelector(".w3-map"); if (mm) mm.hidden = !on;
  controls.enabled = !on;
  const ui = host.querySelector(".w3-ui");
  if (ui) ui.hidden = !on;
  const tg = host.querySelector(".w3-toggle");
  if (tg) tg.textContent = on ? "🔭 מבט מבחוץ" : "🚶 טיול בבית";
  if (on) { walk.placed = false; placeWalker(); }
  else { camera.rotation.set(0, 0, 0); controls.update(); }
}
function setupWalk() {
  const css = document.createElement("style");
  css.textContent = `.w3-bar{position:absolute;top:10px;right:10px;left:10px;display:flex;gap:8px;flex-wrap:wrap;z-index:3;pointer-events:none}
  .w3-bar button,.w3-ui button{pointer-events:auto;background:rgba(18,18,17,.82);color:#f4f0e8;border:1px solid #c9a55c;border-radius:20px;padding:8px 14px;font:600 14px Assistant,system-ui,sans-serif;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
  .w3-ui{position:absolute;inset:auto 10px 10px 10px;display:flex;justify-content:space-between;align-items:flex-end;z-index:3;pointer-events:none}
  .w3-ui[hidden]{display:none}
  .w3-pad{direction:ltr;display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,52px);gap:6px}
  .w3-pad button{padding:0;font-size:20px;border-radius:12px}
  .w3-hint{pointer-events:none;color:#f4f0e8;background:rgba(18,18,17,.6);border-radius:10px;padding:6px 10px;font:400 12.5px Assistant,system-ui,sans-serif;max-width:46%}
  .gp-3d:fullscreen{height:100vh}
  .w3-map{position:absolute;top:56px;left:10px;width:180px;height:180px;z-index:3;background:rgba(250,248,243,.92);border:1px solid #c9a55c;border-radius:12px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25)}
  .w3-map[hidden]{display:none}
  @media (max-width:560px){.w3-map{width:130px;height:130px}}`;
  document.head.appendChild(css);
  host.style.position = "relative";
  const bar = document.createElement("div"); bar.className = "w3-bar";
  bar.innerHTML = `<button type="button" class="w3-toggle">🚶 טיול בבית</button><button type="button" class="w3-top">🗺 מבט על (תוכנית)</button><button type="button" class="w3-up">👆 להסתכל על התקרה</button><button type="button" class="w3-fs">⛶ מסך מלא</button>`;
  const ui = document.createElement("div"); ui.className = "w3-ui"; ui.hidden = true;
  ui.innerHTML = `<div class="w3-hint">גוררים על המסך כדי להסתכל · כפתורים כדי ללכת · במחשב: חצים / WASD</div>
    <div class="w3-pad"><button data-b="tl" aria-label="פנייה שמאלה">↶</button><button data-b="f" aria-label="קדימה">▲</button><button data-b="tr" aria-label="פנייה ימינה">↷</button>
    <button data-b="l" aria-label="צעד שמאלה">◀</button><button data-b="b" aria-label="אחורה">▼</button><button data-b="r" aria-label="צעד ימינה">▶</button></div>`;
  const map = document.createElement("canvas"); map.className = "w3-map"; map.width = 360; map.height = 360; map.hidden = true;
  map.title = "לחצו על חדר כדי לעבור אליו";
  host.append(bar, ui, map);
  bar.querySelector(".w3-top").onclick = () => topView();
  map.addEventListener("click", e => {
    const r = map.getBoundingClientRect(), mx = (e.clientX - r.left) * map.width / r.width, my = (e.clientY - r.top) * map.height / r.height;
    const T = mapTransform(); if (!T) return;
    const wx = (mx - T.ox) / T.k + T.minX, wz = (my - T.oy) / T.k + T.minZ;
    const room = walk.rooms.find(q => wx >= q.x && wx <= q.x + q.w && wz >= q.z && wz <= q.z + q.h);
    if (room) goRoom(room); else if (!blocked(wx, wz)) { camera.position.set(wx, EYE, wz); }
  });
  bar.querySelector(".w3-toggle").onclick = () => {
    if (!walk.on && viewMode === "top") { viewMode = "orbit"; camera.fov = 50; camera.updateProjectionMatrix(); rerender(); }
    setWalk(!walk.on);
  };
  bar.querySelector(".w3-up").onclick = () => { if (!walk.on) setWalk(true); walk.pitch = walk.pitch > 0.6 ? 0.1 : 0.95; applyLook(); };
  bar.querySelector(".w3-fs").onclick = () => { const d = document; (d.fullscreenElement ? d.exitFullscreen() : host.requestFullscreen?.())?.catch?.(() => {}); };
  ui.querySelectorAll("[data-b]").forEach(b => {
    const k = b.dataset.b;
    const on = e => { e.preventDefault(); walk.btn[k] = true; }, off = () => { walk.btn[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });
  // מבט בגרירה
  const el = renderer.domElement; let drag = null;
  el.addEventListener("pointerdown", e => { if (walk.on) { drag = { x: e.clientX, y: e.clientY, yaw: walk.yaw, pitch: walk.pitch }; el.setPointerCapture(e.pointerId); } });
  el.addEventListener("pointermove", e => {
    if (!drag || !walk.on) return;
    walk.yaw = drag.yaw + (e.clientX - drag.x) * 0.005;
    walk.pitch = Math.max(-1.2, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.005));
    applyLook();
  });
  el.addEventListener("pointerup", () => drag = null);
  el.style.touchAction = "none";
  window.addEventListener("keydown", e => { if (!walk.on || e.target.closest("input,textarea,select")) return; walk.keys[e.code] = true; if (e.code.startsWith("Arrow")) e.preventDefault(); });
  window.addEventListener("keyup", e => { walk.keys[e.code] = false; });
}

/* ---------- מבט על ומפה קטנה ---------- */
function topView() {
  if (walk.on) setWalk(false);
  viewMode = "top"; rerender();
  const b = walk.bounds; if (!b) return;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, s = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  camera.fov = 8; camera.updateProjectionMatrix();          // זווית צרה ממרחק = כמעט בלי פרספקטיבה, התקרה יושבת על הקווים
  const dist = (s * 0.62) / Math.tan((camera.fov / 2) * Math.PI / 180);
  camera.position.set(cx, dist, cz + 0.001); controls.target.set(cx, 0, cz); controls.update();
}
function mapTransform() {
  const b = walk.bounds; if (!b) return null;
  const W = 360, pad = 18, k = Math.min((W - 2 * pad) / (b.maxX - b.minX), (W - 2 * pad) / (b.maxZ - b.minZ));
  return { k, minX: b.minX, minZ: b.minZ, ox: (W - (b.maxX - b.minX) * k) / 2, oy: (W - (b.maxZ - b.minZ) * k) / 2 };
}
function goRoom(q) {
  // נכנסים מקצה החדר ומסתכלים לאורכו – רואים את כל החדר ואת התקרה
  if (q.w >= q.h) { camera.position.set(q.x + Math.min(0.6, q.w * 0.15), EYE, q.z + q.h / 2); walk.yaw = -Math.PI / 2; }
  else { camera.position.set(q.x + q.w / 2, EYE, q.z + q.h - Math.min(0.6, q.h * 0.15)); walk.yaw = 0; }
  walk.pitch = 0.3; applyLook();
}
function drawMap() {
  const map = host.querySelector(".w3-map"); const T = mapTransform(); if (!map || map.hidden || !T) return;
  const c = map.getContext("2d"), X = x => T.ox + (x - T.minX) * T.k, Z = z => T.oy + (z - T.minZ) * T.k;
  c.clearRect(0, 0, 360, 360);
  const p = camera.position;
  walk.rooms.forEach(q => {
    const inside = p.x >= q.x && p.x <= q.x + q.w && p.z >= q.z && p.z <= q.z + q.h;
    c.fillStyle = inside ? "rgba(201,165,92,.45)" : "rgba(120,110,95,.18)"; c.strokeStyle = "#8a7a5a"; c.lineWidth = 2;
    c.fillRect(X(q.x), Z(q.z), q.w * T.k, q.h * T.k); c.strokeRect(X(q.x), Z(q.z), q.w * T.k, q.h * T.k);
    c.fillStyle = "#222"; c.font = "600 22px Assistant, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(q.name || "חדר", X(q.x + q.w / 2), Z(q.z + q.h / 2));
  });
  walk.walls.forEach(w => {
    c.strokeStyle = "#222"; c.lineWidth = 6;
    const segs = []; let t0 = 0;
    [...w.doors].sort((a, b) => a[0] - b[0]).forEach(([a, b]) => { segs.push([t0, a]); t0 = b; }); segs.push([t0, w.len]);
    segs.forEach(([a, b]) => { if (b <= a) return; c.beginPath(); c.moveTo(X(w.ax + w.ux * a), Z(w.az + w.uz * a)); c.lineTo(X(w.ax + w.ux * b), Z(w.az + w.uz * b)); c.stroke(); });
  });
  // אני + כיוון המבט
  const px = X(p.x), pz = Z(p.z), dx = -Math.sin(walk.yaw), dz = -Math.cos(walk.yaw), a = 0.55, L = 46;
  c.fillStyle = "rgba(44,111,176,.25)"; c.beginPath(); c.moveTo(px, pz);
  c.lineTo(px + L * (dx * Math.cos(a) - dz * Math.sin(a)), pz + L * (dz * Math.cos(a) + dx * Math.sin(a)));
  c.lineTo(px + L * (dx * Math.cos(-a) - dz * Math.sin(-a)), pz + L * (dz * Math.cos(-a) + dx * Math.sin(-a))); c.closePath(); c.fill();
  c.fillStyle = "#2c6fb0"; c.beginPath(); c.arc(px, pz, 9, 0, 7); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
}

window.GP3D = { render, topView, setWalk: on => setWalk(on), teleport: (x, z, yaw) => { camera.position.set(x, EYE, z); walk.yaw = yaw; applyLook(); }, walkState: () => ({ on: walk.on, x: camera.position.x, z: camera.position.z, pitch: walk.pitch }) };
window.dispatchEvent(new Event("gp3d-ready"));
