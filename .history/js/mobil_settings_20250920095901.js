// js/mobil_settings.js
(() => {
  const BP = 1024;                  // mobil/tablet breakpoint
  const MOBILE_CLASS = 'rail--mobile';
  const RAIL_SELECTOR = 'nav.rail';
  const MOUNT_ID = 'bar-menu';      // settings.html'deki mount noktası
  let railEl = null;
  let resizeTid = null;

  /* -------------------- BAR-MENU MOUNT -------------------- */
  async function mountBarMenu() {
    if (document.querySelector(`${RAIL_SELECTOR}`)) return; // zaten var
    try {
      const res = await fetch('bar-menu.html', { cache: 'no-store' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // <style id="bar-menu-css"> tek sefer ekle
      const style = doc.querySelector('#bar-menu-css');
      if (style && !document.getElementById('bar-menu-css')) {
        document.head.appendChild(style.cloneNode(true));
      }
      // nav.rail
      const nav = doc.querySelector(RAIL_SELECTOR);
      if (nav) document.getElementById(MOUNT_ID)?.appendChild(nav.cloneNode(true));

      // (opsiyonel) side/business overlay gibi ek parçalar
      const sbOverlay = doc.querySelector('#sbOverlay');
      if (sbOverlay && !document.getElementById('sbOverlay')) {
        document.body.appendChild(sbOverlay.cloneNode(true));
      }
    } catch (e) {
      console.warn('[mobil_settings] bar-menu mount hatası:', e);
    }
  }

  /* -------------------- YARDIMCILAR -------------------- */
  const isMobile = () => window.innerWidth <= BP;
  const getRail  = () => document.querySelector(RAIL_SELECTOR);

  function setContentBottomPadding(px) {
    const root = document.documentElement;
    root.style.setProperty('--rail-height', `${px}px`);

    // Öncelik: <main.page> → .container → body
    const el = document.querySelector('main.page') ||
               document.querySelector('.container') ||
               document.body;
    // env(safe-area-inset-bottom) ile çentikli iPhone’lar emniyette
    el.style.paddingBottom = `calc(${px}px + env(safe-area-inset-bottom, 0px))`;
  }
  function clearContentBottomPadding() {
    const root = document.documentElement;
    root.style.removeProperty('--rail-height');
    const el = document.querySelector('main.page') ||
               document.querySelector('.container') ||
               document.body;
    el.style.removeProperty('padding-bottom');
  }

  function applyMobileMode() {
    railEl = getRail();
    if (!railEl) return;
    document.documentElement.classList.add(MOBILE_CLASS);
    document.body.classList.add(MOBILE_CLASS);

    railEl.setAttribute('data-rail-orientation', 'horizontal');
    // Ölçülmüş yüksekliği kullan (CSS 56–60px arası olabilir)
    // Ölçüm 0 dönerse güvenli bir varsayılan kullan.
    requestAnimationFrame(() => {
      const h = Math.max(56, Math.round(railEl.getBoundingClientRect().height) || 60);
      setContentBottomPadding(h);
    });
  }
  function applyDesktopMode() {
    railEl = getRail();
    if (!railEl) return;
    document.documentElement.classList.remove(MOBILE_CLASS);
    document.body.classList.remove(MOBILE_CLASS);

    railEl.setAttribute('data-rail-orientation', 'vertical');
    clearContentBottomPadding();
  }
  function syncMode() {
    railEl = getRail();
    if (!railEl) return;
    isMobile() ? applyMobileMode() : applyDesktopMode();
  }

  /* -------------------- GÖZLEMCİ + OLAYLAR -------------------- */
  // nav.rail sonradan geldiği için gözlemle
  const obs = new MutationObserver(() => {
    const el = getRail();
    if (el && el !== railEl) {
      railEl = el;
      syncMode();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTid);
    resizeTid = setTimeout(syncMode, 100);
  }, { passive: true });

  document.addEventListener('DOMContentLoaded', async () => {
    await mountBarMenu();
    syncMode();
  });

  // İlk çalıştırma
  mountBarMenu().then(syncMode);
})();
