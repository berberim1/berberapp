// js/calendar.mobile.js
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const mqMobile = window.matchMedia('(max-width: 768px)');

  /* --- 1) Topbar & personel şeridi ölçülerini CSS değişkenine yaz --- */
  function setVars() {
    const tb    = $('.topbar');
    const staff = $('#staffRow');
    const th = (tb?.offsetHeight || 56);
    const sh = (staff?.offsetHeight || 44);
    document.documentElement.style.setProperty('--topbar-h', th + 'px');
    document.documentElement.style.setProperty('--staff-h', sh + 'px');
  }
  ['load','resize','orientationchange'].forEach(ev =>
    window.addEventListener(ev, setVars, { passive:true })
  );
  // görünüm değişince de ölç
  document.addEventListener('click', (e)=>{
    if (e.target.closest('.view-item') || e.target.closest('#viewChip')) setVars();
  });

  /* --- 2) Üst barda mini profil butonu: SADECE mobilde --- */
  function syncTopAvatar() {
    const host = $('.topbar-inner');
    const exists = $('#topProfileBtn');

    if (mqMobile.matches) {
      if (!exists && host) {
        const btn = document.createElement('button');
        btn.className = 'avatar-mini';
        btn.id = 'topProfileBtn';
        btn.type = 'button';
        btn.textContent = 'A';
        host.appendChild(btn);
      }
    } else {
      // Masaüstüne geçildi → varsa kaldır
      exists?.remove();
    }
  }
  window.addEventListener('load', syncTopAvatar, { passive:true });
  mqMobile.addEventListener?.('change', syncTopAvatar);
  window.addEventListener('resize', syncTopAvatar, { passive:true });

  /* --- 3) Profil (A) → Business Modal toggle --- */
  (function bindBusinessModal() {
    const overlay = $('#bmOverlay');
    const modal   = $('#bmModal');
    const close   = $('#bmClose');
    const openBM  = ()=>{ overlay?.classList.add('show'); modal?.classList.add('show'); };
    const closeBM = ()=>{ overlay?.classList.remove('show'); modal?.classList.remove('show'); };

    // Buton dinamik eklendiği için delegasyon
    document.addEventListener('click', (e) => {
      if (e.target.closest('#topProfileBtn')) openBM();
    });
    overlay?.addEventListener('click', closeBM);
    close?.addEventListener('click', closeBM);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeBM());
  })();

  /* --- 4) Bildirim paneli: dışarı tıkla / ESC ile kapat --- */
  (function bindNotifySoftClose(){
    const panel = $('#notify');
    const close = () => panel?.classList.remove('open');

    // Açmayı başka yerde yapıyoruz; burada sadece yumuşak kapanış
    document.addEventListener('click', (e) => {
      if (!panel?.classList.contains('open')) return;
      const within = e.target.closest('#notify') || e.target.closest('#bellBtn');
      if (!within) close();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  })();

  /* --- 5) Swipe ile gün/hafta geçişi (soldan sağa=geri, sağdan sola=ileri) --- */
  const prevBtn = $('#prevDay');
  const nextBtn = $('#nextDay');

  function bindSwipe(el) {
    if (!el) return;
    let x0=0, y0=0, tracking=false, t0=0;

    el.addEventListener('touchstart', (e)=>{
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; tracking = true; t0 = Date.now();
    }, { passive:true });

    el.addEventListener('touchend', (e)=>{
      if (!tracking) return; tracking = false;
      const t  = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      const dt = Date.now() - t0;
      // hızlı, yatay ağırlıklı ve yeterli mesafe
      if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) && dt < 600) {
        (dx < 0 ? nextBtn : prevBtn)?.click();
      }
    }, { passive:true });
  }
  bindSwipe($('#dayView'));
  bindSwipe($('#weekView'));

  /* --- 6) iOS momentum scroll ayarı (mobilde dikey scroll .grid üzerinde) --- */
  (function tuneScrolling(){
    ['.calendar .grid', '#weekView', '.week'].forEach(sel=>{
      $$(sel).forEach(el => { el.style.webkitOverflowScrolling = 'touch'; });
    });
  })();

  /* ilk ölçüm */
  setVars();
})();
