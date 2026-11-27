/* PWA: registers the service worker and shows an "install app" button. */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (standalone) { document.documentElement.classList.add("is-app"); return; }
  var deferred = null, btn = null;
  function makeBtn() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "pwaInstall";
    btn.textContent = "📲 התקנת האפליקציה";
    btn.setAttribute("style", "position:fixed;bottom:16px;left:16px;z-index:9998;background:#c9a55c;color:#111;border:0;border-radius:24px;padding:10px 16px;font:600 15px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer");
    btn.addEventListener("click", function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; btn.remove(); btn = null; });
      } else {
        alert("להתקנה באייפון: לחצו על כפתור השיתוף ⬆️ ובחרו \"הוסף למסך הבית\".");
      }
    });
    document.body.appendChild(btn);
    return btn;
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; makeBtn(); });
  window.addEventListener("appinstalled", function () { if (btn) btn.remove(); btn = null; });
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios) window.addEventListener("load", makeBtn);
})();
