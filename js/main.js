(function () {
  "use strict";
  const C = typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : {};
  const WORKS_LIST = (typeof WORKS !== "undefined" ? WORKS : []).map(w => ({
    ...w, images: w.images && w.images.length ? w.images : (w.image ? [w.image] : [])
  })).filter(w => w.images.length);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- Config values ---------- */
  $$("[data-config]").forEach(n => {
    const v = C[n.dataset.config];
    if (v !== undefined && v !== "") n.textContent = v;
  });
  if (C.brand) document.title = C.brand + " | " + (C.brandSub || "עבודות גבס") + " · " + (C.area || "");
  if (C.heroImage) $(".hero__img").style.backgroundImage = 'url("' + C.heroImage + '")';
  if (C.contactImage || C.heroImage) $(".contact__media").style.backgroundImage = 'url("' + (C.contactImage || C.heroImage) + '")';

  const wa = "https://wa.me/" + (C.whatsapp || "");
  const waHello = wa + "?text=" + encodeURIComponent("שלום, הגעתי דרך האתר ואשמח לשמוע פרטים על עבודת גבס");
  $$(".js-wa").forEach(a => a.href = waHello);
  $$(".js-phone").forEach(a => a.href = "tel:" + (C.phone || "").replace(/[^\d+]/g, ""));
  $$(".js-mail").forEach(a => { if (C.email) a.href = "mailto:" + C.email; else a.remove(); });
  $("#year").textContent = new Date().getFullYear();
  $("#sinceYear").textContent = new Date().getFullYear() - (Number(C.yearsExperience) || 0);

  const social = $("#social");
  [["instagram", "Instagram"], ["facebook", "Facebook"]].forEach(([k, label]) => {
    if (!C[k]) return;
    const a = el("a", null, label); a.href = C[k]; a.target = "_blank"; a.rel = "noopener";
    social.appendChild(a);
  });

  /* ---------- Loader ---------- */
  const done = () => document.body.classList.remove("is-loading");
  window.addEventListener("load", () => setTimeout(done, 700));
  setTimeout(done, 3000);

  /* ---------- Header ---------- */
  const header = $(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 60);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menu ---------- */
  const menu = $("#menu"), menuBtn = $("#menuBtn"), menuLabel = $(".menu-btn__label");
  function setMenu(open) {
    if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add("is-open")); }
    else { menu.classList.remove("is-open"); setTimeout(() => { if (!menu.classList.contains("is-open")) menu.hidden = true; }, 800); }
    document.body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuLabel.textContent = open ? "סגירה" : "תפריט";
  }
  menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
  $$("a", menu).forEach(a => a.addEventListener("click", () => setMenu(false)));

  /* ---------- Reveal ---------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      }), { threshold: .15, rootMargin: "0px 0px -40px 0px" })
    : null;
  const observe = n => io ? io.observe(n) : n.classList.add("is-visible");

  /* ---------- Featured ---------- */
  const feat = WORKS_LIST[0];
  if (feat) {
    $("#featuredImg").src = feat.images[feat.images.length - 1];
    $("#featuredImg").alt = feat.title || "";
    $("#featuredTitle").textContent = feat.title || "";
    $("#featuredDesc").textContent = feat.text || "";
    $("#featuredLoc").textContent = [feat.category, feat.location].filter(Boolean).join("  ·  ");
    $(".featured__media").addEventListener("click", () => openLb([feat], 0, feat.images.length - 1));
    $(".featured__media").style.cursor = "zoom-in";
  } else {
    $("#featured").remove();
  }

  /* ---------- Collection ---------- */
  const mosaic = $("#mosaic"), filters = $("#filters");
  const cats = ["הכל", ...new Set(WORKS_LIST.map(w => w.category).filter(Boolean))];
  if (cats.length > 2) {
    cats.forEach((c, i) => {
      const b = el("button", "filter" + (i ? "" : " is-active"), c);
      b.type = "button";
      b.addEventListener("click", () => {
        $$(".filter", filters).forEach(f => f.classList.remove("is-active"));
        b.classList.add("is-active");
        render(c === "הכל" ? WORKS_LIST : WORKS_LIST.filter(w => w.category === c));
      });
      filters.appendChild(b);
    });
  }

  /* Editorial rhythm: rows of [wide+normal], [3 normal], [normal+wide], [3 normal]… */
  function layout(n) {
    const rows = [["wide", ""], ["", "", ""], ["", "wide"], ["", "", ""]];
    const out = [];
    let r = 0;
    while (out.length < n) {
      const left = n - out.length;
      let row = rows[r % rows.length];
      const two = r % 2 ? ["", "wide"] : ["wide", ""];
      if (left === 1) row = ["full"];
      else if (left === 2 || left === 4) row = two;
      else if (left === 3) row = ["", "", ""];
      out.push(...row); r++;
    }
    return out.slice(0, n);
  }

  function render(list) {
    mosaic.innerHTML = "";
    if (!list.length) { mosaic.appendChild(el("p", "mosaic__empty", "עבודות חדשות יעלו בקרוב.")); return; }
    const sizes = layout(list.length);
    list.forEach((w, i) => {
      const p = el("button", "piece reveal" + (sizes[i] ? " piece--" + sizes[i] : ""));
      p.type = "button";
      p.setAttribute("aria-label", (w.title || "עבודה") + (w.images.length > 1 ? " – " + w.images.length + " תמונות" : ""));
      const frame = el("span", "piece__frame");
      const img = el("img"); img.src = w.images[0]; img.alt = w.title || ""; img.loading = "lazy";
      frame.appendChild(img);
      if (w.images.length > 1) frame.appendChild(el("span", "piece__count", "1 / " + w.images.length));
      const cap = el("span", "piece__cap");
      cap.appendChild(el("strong", null, w.title || ""));
      cap.appendChild(el("span", null, w.location || w.category || ""));
      p.append(frame, cap);
      p.style.transitionDelay = (i % 3) * 0.12 + "s";
      p.addEventListener("click", () => openLb(list, i));
      mosaic.appendChild(p);
      observe(p);
    });
  }
  render(WORKS_LIST);

  /* ---------- Before / After ---------- */
  const baWorks = WORKS_LIST.filter(w => w.before);
  if (baWorks.length) {
    $("#beforeAfter").hidden = false;
    const baList = $("#baList");
    baWorks.forEach(w => {
      const item = el("figure", "ba__item reveal");
      const stage = el("div", "ba__stage");
      const after = el("img", "ba__after"); after.src = w.images[0]; after.alt = (w.title || "") + " – אחרי"; after.loading = "lazy";
      const beforeWrap = el("div", "ba__before");
      const before = el("img"); before.src = w.before; before.alt = (w.title || "") + " – לפני"; before.loading = "lazy";
      beforeWrap.appendChild(before);
      const tagB = el("span", "ba__tag ba__tag--before", "לפני");
      const tagA = el("span", "ba__tag ba__tag--after", "אחרי");
      const handle = el("span", "ba__handle"); handle.innerHTML = "<i>‹ ›</i>";
      const range = el("input", "ba__range");
      Object.assign(range, { type: "range", min: 0, max: 100, value: 50 });
      range.setAttribute("aria-label", "השוואת לפני ואחרי");
      const set = v => stage.style.setProperty("--pos", v + "%");
      range.addEventListener("input", () => set(range.value));
      set(50);
      stage.append(after, beforeWrap, tagB, tagA, handle, range);
      const cap = el("figcaption", "ba__cap");
      cap.appendChild(el("strong", null, w.title || ""));
      cap.appendChild(el("span", null, w.location || ""));
      item.append(stage, cap);
      baList.appendChild(item);
    });
  }

  /* ---------- Lightbox ---------- */
  const lb = $("#lightbox"), lbImg = $("#lbImg"), lbCap = $("#lbCap"), lbCount = $("#lbCount");
  let slides = [], cur = 0, lastFocus = null;
  function openLb(list, workIndex, imgOffset = 0) {
    slides = [];
    let start = 0;
    list.forEach((w, wi) => {
      if (wi === workIndex) start = slides.length;
      w.images.forEach((src, k) => slides.push({ src, title: w.title, location: w.location, k: k + 1, n: w.images.length }));
    });
    cur = start + imgOffset; lastFocus = document.activeElement;
    show(); lb.hidden = false; document.body.classList.add("lb-open"); $("#lbClose").focus();
  }
  function show() {
    const s = slides[cur];
    lbImg.src = s.src; lbImg.alt = s.title || "";
    lbImg.style.animation = "none"; void lbImg.offsetWidth; lbImg.style.animation = "";
    lbCap.textContent = [s.title, s.location].filter(Boolean).join(" · ");
    lbCount.textContent = s.n > 1 ? s.k + " / " + s.n : "";
    const multi = slides.length > 1;
    $("#lbPrev").hidden = !multi; $("#lbNext").hidden = !multi;
  }
  function closeLb() { lb.hidden = true; document.body.classList.remove("lb-open"); if (lastFocus) lastFocus.focus(); }
  const step = d => { cur = (cur + d + slides.length) % slides.length; show(); };
  $("#lbClose").addEventListener("click", closeLb);
  $("#lbNext").addEventListener("click", () => step(1));
  $("#lbPrev").addEventListener("click", () => step(-1));
  lb.addEventListener("click", e => { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false);
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") step(1);
    if (e.key === "ArrowRight") step(-1);
  });
  let tx = null;
  lb.addEventListener("touchstart", e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50 && slides.length > 1) step(dx < 0 ? -1 : 1);
  });

  $$(".reveal, .reveal-img").forEach(observe);

  /* ---------- Contact form → WhatsApp ---------- */
  const form = $("#contactForm"), note = $("#formNote");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    let ok = true;
    ["name", "phone"].forEach(n => {
      const f = form.elements[n], v = String(d[n] || "").trim();
      const bad = !v || (n === "phone" && v.replace(/\D/g, "").length < 9);
      f.classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    if (!ok) { note.textContent = "נא למלא שם ומספר טלפון תקין."; note.classList.add("is-error"); return; }
    note.classList.remove("is-error");
    const msg = [
      "שלום, הגעתי דרך האתר ואשמח לפגישת ייעוץ.",
      "שם: " + d.name,
      "טלפון: " + d.phone,
      d.city ? "עיר: " + d.city : "",
      "סוג עבודה: " + d.service,
      d.message ? "פרטים: " + d.message : ""
    ].filter(Boolean).join("\n");
    window.open(wa + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
    form.reset();
    note.textContent = "תודה! הפנייה נפתחה בוואטסאפ – נחזור אליכם בהקדם.";
  });
})();
