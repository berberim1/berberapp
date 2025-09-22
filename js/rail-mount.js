// js/rail-mount.js
import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

const $ = (s, r = document) => r.querySelector(s);

// Aktif sayfa vurgusu (sol rail)
(() => {
  const file = (location.pathname.split("/").pop() || "calendar.html").toLowerCase();
  document.querySelectorAll(".rail__btn").forEach(a => {
    const hrefFile = (a.getAttribute("href") || "").split("/").pop().toLowerCase();
    if (hrefFile === file) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
})();

// SB modal açık/kapalı (avatar)
(() => {
  const openBtn = $("#openProfile");
  const overlay = $("#sbOverlay");          // rail içindeki sb- overlay
  const closeBtn = $("#sbClose");

  openBtn?.addEventListener("click", () => {
    overlay?.classList.add("show");
    document.body.style.overflow = "hidden";
  });

  closeBtn?.addEventListener("click", () => {
    overlay?.classList.remove("show");
    document.body.style.overflow = "";
  });

  // dışına tıklayınca kapat
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("show");
      document.body.style.overflow = "";
    }
  });
})();

// ÇIKIŞ YAP — sbLogout (rail modal) + eski bmLogout (varsa) için bağla
function bindLogout(el) {
  el?.addEventListener("click", async () => {
    try {
      el.disabled = true;
      el.textContent = "Çıkış yapılıyor…";
      await signOut(auth);
    } catch (err) {
      console.error("signOut error:", err);
    } finally {
      // başarı/başarısızlık fark etmeksizin login sayfasına götür
      location.href = "index.html";
    }
  });
}
bindLogout(document.getElementById("sbLogout"));
bindLogout(document.getElementById("bmLogout")); // geriye dönük uyumluluk
