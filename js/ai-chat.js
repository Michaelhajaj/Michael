/* ==========================================================
   יועץ הגבס AI – צ'אט קטן בכל עמודי האתר
   שולח את השיחה לשרת (planAiEndpoint + "/chat"), ובמתכנן – גם סיכום של התוכנית.
   ========================================================== */
(function () {
  const CFG = (typeof SITE_CONFIG !== "undefined" ? SITE_CONFIG : window.SITE_CONFIG) || {};
  const EP = (CFG.planAiEndpoint || "").replace(/\/$/, "");
  const KEY = "gp-chat-v1";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let msgs = [];
  try { msgs = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (_) {}
  const store = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (_) {} };

  const css = `
  .aic-btn{position:fixed;left:24px;bottom:92px;z-index:55;display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:28px;border:1px solid #c9a55c;background:#121211;color:#e2c88f;font:600 14px Assistant,system-ui,sans-serif;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .aic-btn:hover{background:#c9a55c;color:#121211}
  .aic-panel{position:fixed;left:16px;bottom:16px;z-index:70;width:min(400px,calc(100vw - 32px));height:min(600px,calc(100vh - 32px));display:flex;flex-direction:column;background:#faf8f3;color:#161613;border:1px solid #c9a55c;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.35);font:400 15px/1.6 Assistant,system-ui,sans-serif;direction:rtl;overflow:hidden}
  .aic-panel[hidden]{display:none}
  .aic-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#121211;color:#f4f0e8}
  .aic-head b{font:400 18px "Frank Ruhl Libre",serif;flex:1}.aic-head small{color:#c9a55c;font-size:12px;display:block}
  .aic-x{background:none;border:0;color:#f4f0e8;font-size:22px;cursor:pointer;line-height:1}
  .aic-log{flex:1;overflow-y:auto;padding:14px;display:grid;gap:10px;align-content:start}
  .aic-m{padding:10px 12px;border-radius:12px;max-width:90%;white-space:normal;word-wrap:break-word}
  .aic-m.u{justify-self:start;background:#121211;color:#f4f0e8;border-bottom-right-radius:3px}
  .aic-m.a{justify-self:end;background:#fff;border:1px solid rgba(0,0,0,.1);border-bottom-left-radius:3px}
  .aic-m.e{justify-self:center;background:#f6dccf;font-size:13.5px}
  .aic-m ul{margin:4px 0;padding-inline-start:18px}.aic-m p{margin:0 0 6px}.aic-m p:last-child{margin:0}
  .aic-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}
  .aic-chips button{border:1px solid #c9a55c;background:#fff;border-radius:16px;padding:5px 10px;font:inherit;font-size:13px;cursor:pointer;color:#161613}
  .aic-foot{border-top:1px solid rgba(0,0,0,.1);padding:10px;display:grid;gap:6px;background:#fff}
  .aic-row{display:flex;gap:8px;align-items:flex-end}
  .aic-row textarea{flex:1;resize:none;border:1px solid rgba(0,0,0,.2);border-radius:10px;padding:9px;font:inherit;max-height:120px;min-height:42px}
  .aic-row button{background:#c9a55c;border:0;border-radius:10px;padding:10px 14px;font:600 14px inherit;cursor:pointer;color:#121211}
  .aic-row button:disabled{opacity:.5;cursor:progress}
  .aic-opt{font-size:12.5px;color:#7d786d;display:flex;gap:6px;align-items:center}
  .aic-dots::after{content:"…";animation:aicd 1.2s infinite}@keyframes aicd{0%{content:"."}33%{content:".."}66%{content:"..."}}
  @media (max-width:560px){.aic-btn{bottom:88px;left:16px;padding:10px 14px}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const inPlanner = () => !!(window.GP && window.GP.contextSummary && window.GP.S && window.GP.S.plans.length);
  const CHIPS = [
    "איזו תקרה מתאימה לאמבטיה?",
    "מה ההבדל בין F47 ל-C60?",
    "איך מתכננים פס מיזוג בתקרה?",
    "לתאר את הפרויקט שלי"
  ];
  const TEMPLATE = "הפרויקט שלי:\nסוג החדר / המבנה: \nמידות (אורך × רוחב × גובה): \nמה בונים (תקרה / מחיצה / חיפוי / נישה): \nמה יהיה בתקרה (ספוטים, רמקולים, מיזוג, פסי לד): \nהבעיה / השאלה: ";

  const btn = document.createElement("button");
  btn.className = "aic-btn"; btn.type = "button"; btn.innerHTML = "💬 יועץ גבס AI";
  const panel = document.createElement("div");
  panel.className = "aic-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "יועץ גבס AI");
  panel.innerHTML = `<div class="aic-head"><div style="flex:1"><b>יועץ הגבס</b><small>מבוסס AI · לפי ת״י 1924 והוראות היצרנים</small></div><button class="aic-x" aria-label="סגירה">×</button></div>
    <div class="aic-log" aria-live="polite"></div>
    <div class="aic-chips"></div>
    <div class="aic-foot">
      <div class="aic-row"><textarea rows="1" placeholder="שאלו כל שאלה על גבס, או תארו את הפרויקט…"></textarea><button type="button">שליחה</button></div>
      <label class="aic-opt" hidden><input type="checkbox" checked> לצרף את התוכנית שלי מהמתכנן (מידות, אביזרים, אזהרות)</label>
      <div class="aic-opt">ה-AI יכול לטעות. בעבודה בפועל – לפי התקן, הוראות היצרן ומהנדס כשצריך.</div>
    </div>`;
  document.body.append(btn, panel);
  const log = panel.querySelector(".aic-log"), ta = panel.querySelector("textarea"), send = panel.querySelector(".aic-row button");
  const chips = panel.querySelector(".aic-chips"), share = panel.querySelector(".aic-opt[hidden]");

  function fmt(t) {
    // markdown בסיסי: **מודגש**, רשימות "- ", שורות
    const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let out = "", list = false;
    lines.forEach(l => {
      const m = /^\s*[-•*]\s+(.*)/.exec(l);
      if (m) { if (!list) { out += "<ul>"; list = true; } out += `<li>${m[1]}</li>`; return; }
      if (list) { out += "</ul>"; list = false; }
      if (l.trim()) out += `<p>${l.replace(/^#+\s*/, "")}</p>`;
    });
    return out + (list ? "</ul>" : "");
  }
  function render() {
    log.innerHTML = (msgs.length ? "" : `<div class="aic-m a"><p>שלום! אני יועץ הגבס של ${esc(CFG.ownerName || "מיכאל")} 👋</p><p>אפשר לשאול על תקרות, מחיצות, פרופילים, ניצבים, חדרים רטובים, ספוטים ומיזוג, או לתאר את הפרויקט ואעזור לתכנן.</p></div>`) +
      msgs.map(m => `<div class="aic-m ${m.role === "user" ? "u" : m.role === "error" ? "e" : "a"}">${m.role === "user" ? esc(m.content).replace(/\n/g, "<br>") : fmt(m.content)}</div>`).join("");
    chips.innerHTML = msgs.length ? "" : CHIPS.map(c => `<button type="button">${c}</button>`).join("");
    chips.querySelectorAll("button").forEach(b => b.onclick = () => {
      if (b.textContent === "לתאר את הפרויקט שלי") { ta.value = TEMPLATE; ta.focus(); autosize(); } else ask(b.textContent);
    });
    share.hidden = !inPlanner();
    log.scrollTop = log.scrollHeight;
  }
  const autosize = () => { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; };
  const ERR = {
    daily_limit: "הגעתם למכסת השאלות היומית. אפשר לפנות אלינו בוואטסאפ.",
    busy: "השרת עמוס כרגע. נסו שוב בעוד דקה.",
    not_configured: "היועץ עוד לא הופעל באתר.",
    message_too_long: "ההודעה ארוכה מדי – נסו לקצר.",
    refusal: "לא אוכל לענות על זה. נסו לנסח אחרת."
  };
  async function ask(text) {
    text = (text || "").trim(); if (!text || send.disabled) return;
    if (!EP) { msgs.push({ role: "user", content: text }, { role: "error", content: ERR.not_configured }); render(); return; }
    msgs.push({ role: "user", content: text }); ta.value = ""; autosize(); render();
    const wait = document.createElement("div"); wait.className = "aic-m a"; wait.innerHTML = '<span class="aic-dots">חושב</span>'; log.appendChild(wait); log.scrollTop = log.scrollHeight;
    send.disabled = true;
    try {
      const history = msgs.filter(m => m.role === "user" || m.role === "assistant").slice(-20);
      const body = { messages: history };
      if (inPlanner() && share.querySelector("input").checked) body.context = window.GP.contextSummary();
      const r = await fetch(EP + "/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.reply) msgs.push({ role: "error", content: ERR[d.error] || "משהו השתבש. נסו שוב." });
      else msgs.push({ role: "assistant", content: d.reply + (d.truncated ? "\n(התשובה נקטעה – אפשר לבקש המשך)" : "") });
    } catch (_) {
      msgs.push({ role: "error", content: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." });
    } finally {
      // שגיאה לא נשלחת לשרת; אם הייתה – מסירים את שאלת המשתמש מההיסטוריה כדי שיוכל לשאול שוב
      if (msgs.at(-1)?.role === "error") { const e = msgs.pop(); msgs.pop(); msgs.push(e); }
      send.disabled = false; store(); render();
    }
  }
  btn.onclick = () => { panel.hidden = false; btn.hidden = true; render(); setTimeout(() => ta.focus(), 50); };
  panel.querySelector(".aic-x").onclick = () => { panel.hidden = true; btn.hidden = false; };
  send.onclick = () => ask(ta.value);
  ta.addEventListener("input", autosize);
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value); } });
  window.AIChat = { open: () => btn.onclick(), ask };
})();
