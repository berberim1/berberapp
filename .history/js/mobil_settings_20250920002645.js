/* ===========================================================
   SETTINGS — MOBİL Davranışları (≤768px)
   - Desktop JS’e (settings.js) dokunmaz; sadece mobil UX katmanı
   - Alt rail (nav.rail) entegrasyonu ve güvenli boşluk
   - Klavye/odak kaydırma iyileştirmeleri
   =========================================================== */
(function initMobileSettings(){
  const mq = window.matchMedia('(max-width: 768px)');

  /* === Mobil sınıfı === */
  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }
  applyMobileClass();
  mq.addEventListener?.('change', applyMobileClass);

  /* === Üst bar yüksekliğini CSS değişkenine yaz === */
  function setTopbarVar() {
    const tb = document.querySelector('.topbar__inner') || document.querySelector('.topbar');
    const h = tb ? Math.round(tb.getBoundingClientRect().height) : 56;
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }
  setTopbarVar();

  /* === Rail (alt menü) aktiflik & alt boşluk === */
  function activateRail(){
    const rail = document.querySelector('nav.rail');
    if(!rail) return;

    // aktiflik
    (rail.querySelectorAll('[aria-current="page"]')||[]).forEach(el=> el.removeAttribute('aria-current'));
    const link = rail.querySelector('[data-route="settings"], a[href*="settings"]');
    if (link) link.setAttribute('aria-current','page');

    // alt boşluk (safe area + rail yüksekliği)
    setBottomPaddingForRail();
  }

  function setBottomPaddingForRail(){
    if(!mq.matches) {
      document.documentElement.style.setProperty('--rail-mobile-h','0px');
      const page = document.querySelector('.page');
      page?.style.removeProperty('padding-bottom');
      return;
    }
    const rail = document.querySelector('nav.rail');
    const h = rail ? Math.ceil(rail.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--rail-mobile-h', h+'px');

    // settings.css mobilde zaten alt boşluk bırakıyor; rail varsa biraz artır
    const page = document.querySelector('.page');
    if (page && h > 0) {
      page.style.paddingBottom = `max(${h + 16}px, 14px + env(safe-area-inset-bottom))`;
    }
  }

  // bar-menu (nav.rail) async mount edildiği için gözlemle
  const bmTarget = document.getElementById('bar-menu') || document.body;
  const railObserver = new MutationObserver(()=> activateRail());
  railObserver.observe(bmTarget, { childList:true, subtree:true });
  // ilk deneme
  activateRail();

  /* === Pencere/cihaz olayları === */
  function onResizeLike(){ if(mq.matches){ setTopbarVar(); setBottomPaddingForRail(); } }
  window.addEventListener('resize', onResizeLike, { passive:true });
  window.addEventListener('orientationchange', ()=> setTimeout(onResizeLike, 100), { passive:true });

  /* === Odak (klavye açılınca alan görünür kalsın) === */
  document.addEventListener('focusin', (e)=>{
    if(!mq.matches) return;
    const el = e.target;
    const isField =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el.getAttribute?.('contenteditable') === 'true';
    if(!isField) return;
    try { el.scrollIntoView({ block:'center', behavior:'smooth' }); } catch {}
  });

  /* === Picker açıldığında üstte hizala (küçük ekranlar) === */
  document.getElementById('openPicker')?.addEventListener('click', ()=>{
    if(!mq.matches) return;
    setTimeout(()=>{
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch { document.documentElement.scrollTop = 0; }
    }, 0);
  });

  /* === BizHours (ayarlar sayfasındaki yeni saatler) mobil kolaylıkları ===
     - Satırın boş yerine dokununca ana switch'i togglela
     - Switch kapalıysa satıra .off sınıfı ekle (görsel ipucu) */
  document.addEventListener('click', (e)=>{
    if(!mq.matches) return;
    const row = e.target.closest?.('.bizhours .bh-row');
    if(!row) return;

    // input/select/btn üzerine tıklanmadıysa satırı togglela
    const interacted = e.target.closest('input,select,button,label,[data-no-toggle]');
    if(interacted) return;

    const sw = row.querySelector('.bh-switch');
    if(sw){
      sw.checked = !sw.checked;
      row.classList.toggle('off', !sw.checked);
    }
  });

  // Switch’lerin kendi değişimi de .off sınıfını güncellesin
  document.addEventListener('change', (e)=>{
    if(!mq.matches) return;
    const sw = e.target.closest?.('.bizhours .bh-switch');
    if(!sw) return;
    const row = sw.closest('.bh-row');
    row?.classList.toggle('off', !sw.checked);
  });

  /* === Focus görünürlüğü (klavye erişilebilirliği) === */
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Tab') document.documentElement.classList.add('show-focus');
  }, { once:true });

  /* === Toast göründüğünde üstbar ölçüsünü tazele (kamera/klavye kaymaları için) === */
  const toast = document.getElementById('toast');
  const toastObs = toast ? new MutationObserver(()=>{
    if(!mq.matches) return;
    if(toast.classList.contains('show')) setTopbarVar();
  }) : null;
  toastObs?.observe(toast, { attributes:true, attributeFilter:['class'] });

  /* === Temizlik === */
  window.addEventListener('unload', ()=>{
    railObserver.disconnect();
    toastObs?.disconnect?.();
  });
})();
