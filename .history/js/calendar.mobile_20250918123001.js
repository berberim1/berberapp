// js/calendar.mobile.js (rev)
// - Topbar/staff ölçülerini CSS değişkenlerine yazar
// - Mobilde avatar butonu ekler (A) ve global modal yönetimi ile açar
// - Bildirim yumuşak kapanış (global closeAllModals ile uyumlu)
// - Swipe ile gün/hafta ileri-geri
// - iOS momentum scroll
// - ⬅️ Takvim her görünüm/değişimde EN SOLDAN başlar
// - 📏 Hafta görünümü ekrandaki boş alanı doldurur (2 satır görünür, fazlası dikey kaydırılır)
// - 📆 Tarih popover’ı açıldığında tüm modalları kapatır ve en üstte görünür

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const mqMobile = window.matchMedia('(max-width: 768px)');

  /* ---------------------------------
   * yardımcılar
   * --------------------------------- */
  const nextFrame = (fn)=> requestAnimationFrame(fn);

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

  // Hafta görünümünü mevcut ekrana göre uzat
  function sizeWeek() {
    const wk = $('#weekView');
    const head = $('#wkHead');
    if (!wk) return;

    const styles  = getComputedStyle(document.documentElement);
    const topbarH = parseFloat(styles.getPropertyValue('--topbar-h')) || 56;
    const railH   = parseFloat(styles.getPropertyValue('--rail-h'))   || 64;
    const rowH    = parseFloat(styles.getPropertyValue('--wkRowH'))   || 150;
    const vh      = window.visualViewport?.height || window.innerHeight;

    const headH   = head ? (head.getBoundingClientRect().height || 0) : 0;
    const margins = 20; // .week { margin:10px } üst+alt ≈ 20px

    // ekranda kullanılabilir yükseklik
    const available = vh - topbarH - railH - margins;

    // en az 2 personel satırı + head görünsün
    const minForTwoRows = headH + 2*rowH + 16;

    const finalH = Math.max(minForTwoRows, available);

    wk.style.height    = finalH + 'px';
    wk.style.maxHeight = finalH + 'px';
    wk.style.overflowY = 'auto';
  }

  // Topbar boyu değişirse otomatik ölç
  const ro = new ResizeObserver(() => { setVars(); sizeWeek(); });
  window.addEventListener('load', () => {
    const tb = $('.topbar');
    if (tb) ro.observe(tb);
    setVars();
    sizeWeek();
    snapCalendarToStart(); // ilk yüklemede en soldan başla
  }, { passive: true });

  ['resize','orientationchange'].forEach(ev =>
    window.addEventListener(ev, () => { setVars(); sizeWeek(); snapCalendarToStart(); }, { passive:true })
  );

  // Görünüm menüsü aç/kapa ve seçim sonrası yeniden ölç
  document.addEventListener('click', (e)=>{
    if (e.target.closest('.view-item') || e.target.closest('#viewChip')) {
      setVars();
      nextFrame(() => { sizeWeek(); snapCalendarToStart(); }); // görünüm değişince soldan ve uzun
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
   * 3) Profil (A) → Business Modal (global)
   * ------------------------------------ */
  (function bindBusinessModal() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#topProfileBtn')) {
        // Tüm açık modalları kapatıp Business modalı üstte aç
        window.closeAllModals?.();
        window.openModal?.({
          id: 'bmModal',
          overlayId: 'bmOverlay',
          panelClassOpen: 'show',
          ariaTargetId: 'bmModal'
        });
      }
    });

    // Modal içindeki X veya overlay tıklanınca kapanış, ESC globalde de çalışır
    $('#bmClose')?.addEventListener('click', () => window.closeAllModals?.());
    $('#bmOverlay')?.addEventListener('click', () => window.closeAllModals?.());
  })();

  /* --------------------------------------------------------
   * 3.5) Tarih popover’ı (mini takvim) her şeyin üstünde olsun
   *      - calendar.js’teki handler ile çakışmaması için capture kullanıyoruz
   * -------------------------------------------------------- */
  (function forceDatePopoverOnTop(){
    const pop  = $('#calendarPopover');
    const wrap = $('#dateLabelWrap');

    function openDate() {
      // diğer tüm modalları kapat
      window.closeAllModals?.();
      pop?.classList.add('open');
      wrap?.setAttribute('aria-expanded', 'true');
      // en üst katmanda garanti (notify, staff-row vs. üstünde)
      if (pop) pop.style.zIndex = '2000';
    }
    function closeDate() {
      pop?.classList.remove('open');
      wrap?.setAttribute('aria-expanded', 'false');
    }

    // başlığa tıklayınca bizim aç/kapa çalışsın (capture ile önce biz yakalarız)
    document.addEventListener('click', (e) => {
      const hit = e.target.closest('#dateLabelWrap');
      if (!hit) return;
      e.stopImmediatePropagation();
      if (!pop) return;
      if (pop.classList.contains('open')) closeDate(); else openDate();
      // görünüm değişti gibi davranıp soldan başla
      nextFrame(() => { sizeWeek(); snapCalendarToStart(); });
    }, true);

    // dışarı tıkla kapat
    document.addEventListener('mousedown', (e) => {
      if (!pop?.classList.contains('open')) return;
      if (e.target.closest('#calendarPopover') || e.target.closest('#dateLabelWrap')) return;
      closeDate();
    });

    // ESC ile kapat
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDate(); });
  })();

  /* -----------------------------------------
   * 4) Bildirim paneli: dışarı tıkla / ESC kapat
   *    (calendar.js'le uyumlu: openModal/closeAllModals)
   * ----------------------------------------- */
  (function bindNotifySoftClose(){
    const panel = $('#notify');
    const close = () => window.closeAllModals?.();

    // Dışarı tıkla
    document.addEventListener('click', (e) => {
      if (!panel?.classList.contains('open')) return;
      const within = e.target.closest('#notify') || e.target.closest('#bellBtn');
      if (!within) close();
    });
    // ESC (globalde de var, burada ek bir garanti)
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
        nextFrame(() => { sizeWeek(); snapCalendarToStart(); });
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
  function snapCalendarNextFrame(){ nextFrame(snapCalendarToStart); }

  // Tarih değişim butonları
  ['#prevDay', '#nextDay', '#todayBtn'].forEach(sel=>{
    const btn = $(sel);
    btn?.addEventListener('click', () => { snapCalendarNextFrame(); nextFrame(sizeWeek); });
  });

  // Mini takvimde gün seçilince
  document.addEventListener('click', (e)=>{
    if (e.target.closest('#miniCal .cell')) { snapCalendarNextFrame(); nextFrame(sizeWeek); }
  });

  // "Personel ve Kaynaklar → Uygula" sonrası (kolon sayısı değişebilir)
  document.addEventListener('click', (e)=>{
    if (e.target?.id === 'applyStaff') { snapCalendarNextFrame(); nextFrame(sizeWeek); }
  });

  // Görünüm değişince (Gün ↔ Hafta)
  document.addEventListener('click', (e)=>{
    if (e.target.closest('.view-item')) { snapCalendarNextFrame(); nextFrame(sizeWeek); }
  });

  // Grid yeniden oluşturulduğunda MutationObserver ile yakala
  const mo = new MutationObserver(() => { snapCalendarNextFrame(); sizeWeek(); });
  window.addEventListener('load', () => {
    const day = $('#dayView'); const week = $('#weekView');
    if (day) mo.observe(day, { childList:true, subtree:true });
    if (week) mo.observe(week, { childList:true, subtree:true });
  }, { passive:true });

  // ilk ölçüm (fallback)
  setVars();
  sizeWeek();
})();
