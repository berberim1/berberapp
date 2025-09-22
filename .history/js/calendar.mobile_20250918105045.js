// js/calendar.mobile.js (tam güncel)
// - Topbar/staff ölçülerini CSS değişkenlerine yazar
// - Mobilde avatar butonu ekler (A)
// - Bildirim yumuşak kapanış
// - Swipe ile gün/hafta ileri-geri
// - iOS momentum scroll
// - ⬅️ Takvim ilk açılışta ve her görünüm/değişimde EN SOLDAN başlar

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const mqMobile = window.matchMedia('(max-width: 768px)');

  /* -----------------------------
   * 1) CSS değişkenlerini ayarla
   * ----------------------------- */
  function setVars() {
    const tb    = $('.topbar');
    const staff = $('#staffRow');
    const th = (tb?.offsetHeight || 56);
    const sh = (staff?.offsetHeight || 44);
    document.documentElement.style.setProperty('--topbar-h', th + 'px');
    document.documentElement.style.setProperty('--staff-h', sh + 'px');
  }

  // Topbar boyu değişirse otomatik ölç
  const ro = new ResizeObserver(() => setVars());
  window.addEventListener('load', () => {
    const tb = $('.topbar');
    if (tb) ro.observe(tb);
    setVars();
    snapCalendarToStart(); // ilk yüklemede en soldan başla
  }, { passive: true });

  ['resize','orientationchange'].forEach(ev =>
    window.addEventListener(ev, () => { setVars(); snapCalendarToStart(); }, { passive:true })
  );

  // Görünüm menüsü aç/kapa ve seçim sonrası yeniden ölç
  document.addEventListener('click', (e)=>{
    if (e.target.closest('.view-item') || e.target.closest('#viewChip')) {
      // görünüm değişince DOM yeniden kurulur → soldan başlat
      setVars();
      snapCalendarNextFrame();
    }
  });

  /* -------------------------------------
   * 2) Üst barda mini profil (yalnız mobil)
   * ------------------------------------- */
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
      exists?.remove();
    }
  }
  window.addEventListener('load', syncTopAvatar, { passive:true });
  mqMobile.addEventListener?.('change', syncTopAvatar);
  window.addEventListener('resize', syncTopAvatar, { passive:true });

  /* ------------------------------------
   * 3) Profil (A) → Business Modal toggle
   * ------------------------------------ */
  (function bindBusinessModal() {
    const overlay = $('#bmOverlay');
    const modal   = $('#bmModal');
    const close   = $('#bmClose');
    const openBM  = ()=>{ overlay?.classList.add('show'); modal?.classList.add('show'); };
    const closeBM = ()=>{ overlay?.classList.remove('show'); modal?.classList.remove('show'); };

    document.addEventListener('click', (e) => {
      if (e.target.closest('#topProfileBtn')) openBM();
    });
    overlay?.addEventListener('click', closeBM);
    close?.addEventListener('click', closeBM);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && closeBM());
  })();

  /* -----------------------------------------
   * 4) Bildirim paneli: dışarı tıkla / ESC kapat
   * ----------------------------------------- */
  (function bindNotifySoftClose(){
    const panel = $('#notify');
    const close = () => panel?.classList.remove('open');

    document.addEventListener('click', (e) => {
      if (!panel?.classList.contains('open')) return;
      const within = e.target.closest('#notify') || e.target.closest('#bellBtn');
      if (!within) close();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  })();

  /* ------------------------------------------------
   * 5) Swipe ile gün/hafta ileri-geri (grid üzerinde)
   * ------------------------------------------------ */
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
      const isHorzFast = Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) && dt < 600;
      if (isHorzFast) {
        (dx < 0 ? nextBtn : prevBtn)?.click();
        // tarih değişince soldan başla
        snapCalendarNextFrame();
      }
    }, { passive:true });
  }
  bindSwipe($('#dayView'));
  bindSwipe($('#weekView'));

  /* ---------------------------------------------------------
   * 6) iOS momentum scroll (dikey scroll .grid üzerinde olacak)
   * --------------------------------------------------------- */
  (function tuneScrolling(){
    ['.calendar .grid', '#weekView', '.week'].forEach(sel=>{
      $$(sel).forEach(el => { el.style.webkitOverflowScrolling = 'touch'; });
    });
  })();

  /* -------------------------------------------------
   * 7) Her değişimde takvimi EN SOLDAN başlat garantisi
   * ------------------------------------------------- */

  // Takvimi soldan başlat (iki rAF ile garanti)
  function snapCalendarToStart(){
    const calEl = $('.calendar');
    if (!calEl) return;
    requestAnimationFrame(() => {
      calEl.scrollLeft = 0;
      requestAnimationFrame(() => { calEl.scrollLeft = 0; });
    });
  }
  // Sonraki frame'de başlat (render sonrası)
  function snapCalendarNextFrame(){ requestAnimationFrame(snapCalendarToStart); }

  // Tarih değişim butonları
  ['#prevDay', '#nextDay', '#todayBtn'].forEach(sel=>{
    const btn = $(sel);
    btn?.addEventListener('click', () => snapCalendarNextFrame());
  });

  // Mini takvimde gün seçilince
  document.addEventListener('click', (e)=>{
    if (e.target.closest('#miniCal .cell')) snapCalendarNextFrame();
  });

  // "Personel ve Kaynaklar → Uygula" sonrası (kolon sayısı değişebilir)
  document.addEventListener('click', (e)=>{
    if (e.target?.id === 'applyStaff') snapCalendarNextFrame();
  });

  // Görünüm değişince (Gün ↔ Hafta)
  document.addEventListener('click', (e)=>{
    if (e.target.closest('.view-item')) snapCalendarNextFrame();
  });

  // Grid yeniden oluşturulduğunda MutationObserver ile yakala
  const mo = new MutationObserver(() => snapCalendarNextFrame());
  window.addEventListener('load', () => {
    const day = $('#dayView'); const week = $('#weekView');
    if (day) mo.observe(day, { childList:true, subtree:true });
    if (week) mo.observe(week, { childList:true, subtree:true });
  }, { passive:true });

  // ilk ölçüm (fallback)
  setVars();
})();
