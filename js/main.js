/* ===============================
   Ana Script – Hero, Navbar, Scroll, Carousel, İlçeler + Auth Modal
=================================*/
document.addEventListener("DOMContentLoaded", () => {
  /* -------------------------------
     HERO Başlığı – Harf Harf Animasyon
  --------------------------------*/
  const heroTitle = document.getElementById("changingText");
  const phrases = ["Kendin Ol", "Cesur Ol", "Renkli Ol", "Kendine Güven", "Özgür Ol", "Fark Yarat"];
  let phraseIndex = 1;

  function buildSpans(text) {
    if (!heroTitle) return;
    heroTitle.innerHTML = "";
    [...text].forEach((ch, i) => {
      const span = document.createElement("span");
      span.textContent = ch === " " ? "\u00A0" : ch;
      span.style.animationDelay = `${i * 0.05}s`;
      heroTitle.appendChild(span);
    });
  }
  function cycleText() {
    if (!heroTitle) return;
    heroTitle.classList.add("fade-out");
    setTimeout(() => {
      heroTitle.classList.remove("fade-out");
      buildSpans(phrases[phraseIndex]);
      phraseIndex = (phraseIndex + 1) % phrases.length;
    }, 300);
  }
  if (heroTitle) {
    buildSpans(phrases[0]);
    setInterval(cycleText, 2500);
  }

  /* -------------------------------
     Navbar Görünür/Gizlenir
  --------------------------------*/
  const navbar = document.getElementById("mainNavbar");
  window.addEventListener("scroll", () => {
    if (!navbar) return;
    const trigger = window.innerHeight * 0.6;
    navbar.classList.toggle("visible", window.scrollY > trigger);
  }, { passive: true });

  /* -------------------------------
     IntersectionObserver – Fade-in
  --------------------------------*/
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  document.querySelectorAll(".categories, .promo-card").forEach(el => observer.observe(el));

  /* -------------------------------
     Logo → Sayfa Başına Git
  --------------------------------*/
  document.querySelectorAll("#logoBtn, .hero-logo").forEach((el) => {
    el.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* -------------------------------
     Carousel – Yatay Kaydırma Butonları
  --------------------------------*/
  function scrollContainer(id, dir) {
    const box = document.getElementById(id);
    if (box) {
      box.scrollBy({ left: dir * box.offsetWidth * 0.7, behavior: "smooth" });
    }
  }
  window.scrollRecommended = (dir) => scrollContainer("recommendedContainer", dir);
  window.scrollArticles = (dir) => scrollContainer("articleContainer", dir);

  /* -------------------------------
     Fare Tekerleği → Yatay Scroll
  --------------------------------*/
  function wheelToHorizontal(container) {
    container.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollBy({ left: e.deltaY, behavior: "auto" });
      }
    }, { passive: false });
  }
  ["recommendedContainer", "articleContainer"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) wheelToHorizontal(el);
  });

  /* -------------------------------
     İstanbul İlçeleri – Akordeon
  --------------------------------*/
  document.querySelectorAll('.district-item').forEach(item => {
    const btn = item.querySelector('.district-toggle');
    const panel = item.querySelector('.district-panel');

    if (panel) panel.setAttribute('data-open', 'false');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      const column = item.parentElement;

      column.querySelectorAll('.district-toggle[aria-expanded="true"]').forEach(b => {
        if (b !== btn) {
          b.setAttribute('aria-expanded','false');
          const p = b.parentElement.querySelector('.district-panel');
          if (p) p.setAttribute('data-open','false');
        }
      });

      btn.setAttribute('aria-expanded', String(!open));
      if (panel) panel.setAttribute('data-open', String(!open));

      if (!open && panel && !panel.querySelector('.district-actions')) {
        const actions = document.createElement("div");
        actions.className = "district-actions";
        actions.innerHTML = `
          <a href="kuafor.html">Kuaförler</a>
          <a href="guzellik-salonu.html">Güzellik Salonları</a>
        `;
        panel.appendChild(actions);
      }
    });
  });

  /* ===============================
     AUTH MODAL – Aç/Kapat (form submit burada değil!)
  ================================*/
  const overlay = document.getElementById("authModal");
  const openers = document.querySelectorAll(".open-auth");
  const closeBtn = overlay ? overlay.querySelector(".modal-close") : null;

  function openModal() {
    if (!overlay) return;
    overlay.classList.add("active");
    document.body.classList.add("no-scroll");
  }
  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }

  openers.forEach(b => b.addEventListener("click", openModal));
  closeBtn && closeBtn.addEventListener("click", closeModal);
  overlay && overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // Sekme başlıklarının görsel geçişini parent'ta bırakıyoruz (opsiyonel)
  function setupAuthTabs() {
    const tabButtons = document.querySelectorAll(".auth-tab");
    const forms = document.querySelectorAll(".auth-form");
    if (!tabButtons.length || !forms.length) return;
    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;
        tabButtons.forEach(b => b.classList.toggle("active", b === btn));
        forms.forEach(f => f.classList.toggle("active", f.dataset.form === target));
      });
    });
  }
  setupAuthTabs();
});
