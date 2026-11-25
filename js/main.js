(function () {
  "use strict";
  const C = typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : {};
  const works = typeof WORKS !== "undefined" ? WORKS : [];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Fill config values ---------- */
  $$("[data-config]").forEach(el => {
    const v = C[el.dataset.config];
    if (v !== undefined && v !== "") el.textContent = v;
  });
  if (C.businessName) document.title = C.businessName + " | עבודות גבס ותקרות";

  const waBase = "https://wa.me/" + (C.whatsapp || "");
  const waHello = waBase + "?text=" + encodeURIComponent("שלום, אשמח לקבל הצעת מחיר לעבודת גבס");
  $("#waLink").href = waHello;
  $("#waFloat").href = waHello;
  $("#phoneLink").href = "tel:" + (C.phone || "").replace(/[^\d+]/g, "");
  if (C.email) { $("#emailItem").hidden = false; $("#emailLink").href = "mailto:" + C.email; }
  $("#year").textContent = new Date().getFullYear();

  const social = $("#social");
  [["instagram", "Instagram"], ["facebook", "Facebook"]].forEach(([k, label]) => {
    if (C[k]) {
      const a = document.createElement("a");
      a.href = C[k]; a.target = "_blank"; a.rel = "noopener"; a.textContent = label;
      social.appendChild(a);
    }
  });

  /* ---------- Header & mobile nav ---------- */
  const header = $(".header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = $("#navToggle"), nav = $("#nav");
  const setMenu = open => {
    nav.classList.toggle("is-open", open);
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  $$("a", nav).forEach(a => a.addEventListener("click", () => setMenu(false)));

  /* ---------- Gallery ---------- */
  const grid = $("#galleryGrid"), filters = $("#filters");
  const cats = ["הכל", ...new Set(works.map(w => w.category).filter(Boolean))];
  let visible = works;

  cats.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "filter" + (i === 0 ? " is-active" : "");
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => {
      $$(".filter", filters).forEach(f => f.classList.remove("is-active"));
      b.classList.add("is-active");
      render(c === "הכל" ? works : works.filter(w => w.category === c));
    });
    filters.appendChild(b);
  });

  function render(list) {
    visible = list;
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = '<p class="gallery__empty">עבודות חדשות יעלו בקרוב.</p>';
      return;
    }
    list.forEach((w, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "work reveal";
      btn.setAttribute("aria-label", w.title || "עבודה");
      const img = document.createElement("img");
      img.src = w.image; img.alt = w.title || ""; img.loading = "lazy";
      btn.appendChild(img);
      if (w.category) {
        const t = document.createElement("span");
        t.className = "work__tag"; t.textContent = w.category; btn.appendChild(t);
      }
      const cap = document.createElement("span");
      cap.className = "work__cap";
      const s = document.createElement("strong"); s.textContent = w.title || "";
      cap.appendChild(s);
      if (w.location) { const l = document.createElement("span"); l.textContent = w.location; cap.appendChild(l); }
      btn.appendChild(cap);
      btn.addEventListener("click", () => openLb(i));
      grid.appendChild(btn);
      observe(btn);
    });
  }

  /* ---------- Lightbox ---------- */
  const lb = $("#lightbox"), lbImg = $("#lbImg"), lbCap = $("#lbCap");
  let idx = 0;
  function showLb() {
    const w = visible[idx];
    lbImg.src = w.image; lbImg.alt = w.title || "";
    lbCap.textContent = [w.title, w.location].filter(Boolean).join(" · ");
  }
  function openLb(i) { idx = i; showLb(); lb.hidden = false; document.body.style.overflow = "hidden"; $("#lbClose").focus(); }
  function closeLb() { lb.hidden = true; document.body.style.overflow = ""; }
  const step = d => { idx = (idx + d + visible.length) % visible.length; showLb(); };
  $("#lbClose").addEventListener("click", closeLb);
  $("#lbNext").addEventListener("click", () => step(1));
  $("#lbPrev").addEventListener("click", () => step(-1));
  lb.addEventListener("click", e => { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", e => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") step(1);
    if (e.key === "ArrowRight") step(-1);
  });

  /* ---------- Reveal on scroll ---------- */
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      }), { threshold: .12 })
    : null;
  function observe(el) { io ? io.observe(el) : el.classList.add("is-visible"); }
  $$(".card, .steps li, .about__text, .about__visual, .contact__info, .form, .section__head").forEach(el => {
    el.classList.add("reveal"); observe(el);
  });

  render(works);

  /* ---------- Contact form → WhatsApp ---------- */
  const form = $("#contactForm"), note = $("#formNote");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    let ok = true;
    ["name", "phone"].forEach(n => {
      const f = form.elements[n];
      const bad = !String(d[n] || "").trim() || (n === "phone" && String(d[n]).replace(/\D/g, "").length < 9);
      f.classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    if (!ok) {
      note.textContent = "נא למלא שם ומספר טלפון תקין.";
      note.classList.add("is-error");
      return;
    }
    note.classList.remove("is-error");
    note.textContent = "פותח וואטסאפ…";
    const msg = [
      "שלום, הגעתי דרך האתר ואשמח להצעת מחיר.",
      "שם: " + d.name,
      "טלפון: " + d.phone,
      d.city ? "עיר: " + d.city : "",
      "סוג עבודה: " + d.service,
      d.message ? "פרטים: " + d.message : ""
    ].filter(Boolean).join("\n");
    window.open(waBase + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
    form.reset();
    setTimeout(() => { note.textContent = "תודה! נחזור אליך בהקדם."; }, 800);
  });
})();
