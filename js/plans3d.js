/* הדמיית תלת-ממד – three.js */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const host = document.getElementById("view3d");
let renderer, scene, camera, controls, root, lastKey = "", texCache = {};

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
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
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
  const key = JSON.stringify([p.id, p.items, p.roomH, p.mpp, o]);
  if (key === lastKey) return;
  const firstFrame = !lastKey || !lastKey.startsWith(JSON.stringify([p.id]).slice(0, -1));
  lastKey = key;
  if (root) scene.remove(root);
  root = new THREE.Group(); scene.add(root);
  const H = p.roomH || 2.7;
  const wallMat = new THREE.MeshStandardMaterial({ color: o.wall, roughness: .9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: o.ceil, roughness: .85, transparent: o.xray, opacity: o.xray ? .18 : 1 });
  const lightCol = kelvin(o.kelvin);

  // bounds
  const pts = p.items.flatMap(it => it.type === "ceiling" ? [[it.x, it.y], [it.x + it.w, it.y + it.h]] : [[it.a.x, it.a.y], [it.b.x, it.b.y]]);
  const minX = Math.min(...pts.map(q => q[0])), maxX = Math.max(...pts.map(q => q[0]));
  const minY = Math.min(...pts.map(q => q[1])), maxY = Math.max(...pts.map(q => q[1]));
  const cx = (minX + maxX) / 2, cz = (minY + maxY) / 2, span = Math.max(maxX - minX, maxY - minY, 3);

  // floor (with plan texture)
  const tex = planTexture(p);
  let floor;
  if (tex && p.imgW) {
    const fw = p.imgW * p.mpp, fh = p.imgH * p.mpp;
    floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), new THREE.MeshStandardMaterial({ map: tex, color: o.floor, roughness: 1 }));
    floor.position.set(fw / 2, 0, fh / 2);
  } else {
    floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 4, span + 4), new THREE.MeshStandardMaterial({ color: o.floor, roughness: .95 }));
    floor.position.set(cx, 0, cz);
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);

  root.add(new THREE.HemisphereLight(0xffffff, 0x5a5243, 1.1));
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
      const slab = new THREE.Mesh(new THREE.BoxGeometry(it.w, 0.0125 * it.opts.layers, it.h), ceilMat);
      slab.position.set(it.x + it.w / 2, y, it.y + it.h / 2); root.add(slab);
      // bulkhead edge (סינר)
      const edgeMat = new THREE.MeshStandardMaterial({ color: o.ceil, roughness: .85 });
      [[it.w, 0.02, it.x + it.w / 2, it.y], [it.w, 0.02, it.x + it.w / 2, it.y + it.h]].forEach(([w, d, x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, drop, d), edgeMat); m.position.set(x, H - drop / 2, z); root.add(m); });
      [[it.x], [it.x + it.w]].forEach(([x]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, drop, it.h), edgeMat); m.position.set(x, H - drop / 2, it.y + it.h / 2); root.add(m); });
      it.fixtures.forEach(f => {
        const X = it.x + f.x, Z = it.y + f.y;
        const isLight = ["spot", "downlight", "linear", "magnetic"].includes(f.kind);
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
      const ops = it.elements.filter(e => e.kind === "door" || e.kind === "window").map(e => ({ x0: e.pos - e.w / 2000, x1: e.pos + e.w / 2000, y0: (e.y || 0) / 1000, y1: ((e.y || 0) + e.h) / 1000 })).sort((a, b) => a.x0 - b.x0);
      const box = (x0, x1, y0, y1) => { if (x1 - x0 < .005 || y1 - y0 < .005) return; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, t), wallMat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.castShadow = m.receiveShadow = true; grp.add(m); };
      let x = 0;
      ops.forEach(op => { box(x, op.x0, 0, h); box(op.x0, op.x1, 0, op.y0); box(op.x0, op.x1, op.y1, h); x = op.x1; });
      box(x, len, 0, h);
      // door leaf / window glass
      ops.forEach((op, i) => {
        const el = it.elements.filter(e => e.kind === "door" || e.kind === "window").sort((a, b) => a.pos - b.pos)[i];
        const isDoor = el.kind === "door";
        const m = new THREE.Mesh(new THREE.BoxGeometry(op.x1 - op.x0 - .02, op.y1 - op.y0 - .01, isDoor ? .04 : .01),
          new THREE.MeshStandardMaterial({ color: isDoor ? 0x8a6a4a : 0x9cc9e8, transparent: !isDoor, opacity: isDoor ? 1 : .35, roughness: .6 }));
        m.position.set((op.x0 + op.x1) / 2, (op.y0 + op.y1) / 2, 0); grp.add(m);
      });
      // boxes on face
      it.elements.filter(e => !(e.kind === "door" || e.kind === "window")).forEach(e => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(.08, e.kind === "data" ? .12 : .08, .01), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 }));
        m.position.set(e.pos, (e.y || 300) / 1000, t / 2 + .005); grp.add(m);
      });
      if (o.xray && res) {
        res.studs.forEach(s => { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s.x / 1000, 0, t / 2 + .006), new THREE.Vector3(s.x / 1000, h, t / 2 + .006)]); grp.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: s.type === "jamb" ? 0xff5a45 : 0x4aa3ff }))); });
      }
      root.add(grp);
    }
  });

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

window.GP3D = { render };
window.dispatchEvent(new Event("gp3d-ready"));
