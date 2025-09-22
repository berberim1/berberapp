// js/mobil_settings.js
(() => {
  const BP = 1024;                         // mobil/tablet breakpoint
  const RAIL_SEL = 'nav.rail';
  const MOUNT_ID = 'bar-menu';             // settings.html'deki mount noktası
  const MOBILE_CLASS = 'rail--mobile';

  let railEl = null;
  let resizeTid = null;

  /* -------------------- Yardımcılar -------------------- */
  const isMobile = () => window.innerWidth <= BP;
  const getRail  = () => document.querySelector(RAIL_SEL);
  const curFile  = () => (location.pathname.split('/').pop() || 'index.html');

  function setContentBottomPadding(px){
    // CSS değişkeni (mobil_settings.css bunu okuyor)
    document.documentElement.style.setProperty('--rail-height', `${px}px`);
    // İçerik altına güvenli boşluk
    const el = document.querySelector('main.page')
           || document.querySelector('.container')
           || document.body;
    el.style.paddingBottom = `calc(${px}px + env(safe-area-inset-bottom, 0px))`;
  }
  function clearContentBottomPadding(){
    document.documentElement.style.removeProperty('--rail-height');
    const el = document.querySelector('main.page')
           || document.querySelector('.container')
           || document.body;
    el.style.removeProperty('padding-bottom');
  }

  function markActiveLink(nav){
    const me = curFile();
    nav.querySelectorAll('.rail__btn[href], a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      // hem "settings.html" hem "/.../settings.html" eşleşsin
      const isMe = href === me || href.endsWith('/' + me);
      if (isMe) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function applyMobileMode(){
    railEl = getRail(); if (!railEl) return;
    document.documentElement.classList.add(MOBILE_CLASS);
    document.body.classList.add(MOBILE_CLASS);

    railEl.setAttribute('data-rail-orientation', 'horizontal');
    railEl.classList.add('is-mobile-rail');              // CSS için sinyal
    // Masaüstüde olabilecek ekstra kısımları gizle (safety)
    railEl.querySelector('.rail__bottom')?.setAttribute('hidden','');
    railEl.querySelector('.rail__top')?.setAttribute('hidden','');

    // Yükseklik ölç → alt boşluk ver
    requestAnimationFrame(() => {
      const h = Math.max(56, Math.round(railEl.getBoundingClientRect().height) || 60);
      setContentBottomPadding(h);
    });
  }

  function applyDesktopMode(){
    railEl = getRail(); if (!railEl) return;
    document.documentElement.classList.remove(MOBILE_CLASS);
    document.body.classList.remove(MOBILE_CLASS);

    railEl.setAttribute('data-rail-orientation', 'vertical');
    railEl.classList.remove('is-mobile-rail');
    railEl.querySelector('[hidden]')?.removeAttribute('hidden');
    clearContentBottomPadding();
  }

  function syncMode(){
    railEl = getRail(); if (!railEl) return;
    markActiveLink(railEl);
    if (isMobile()) applyMobileMode();
    else applyDesktopMode();
  }

  /* -------------------- BAR-MENU MOUNT -------------------- */
  async function mountBarMenu(){
    if (document.querySelector(RAIL_SEL)) return; // zaten var
    try{
      const res  = await fetch('bar-menu.html', { cache: 'no-store' });
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      // <style id="bar-menu-css"> — tek sefer ekle
      const style = doc.querySelector('#bar-menu-css');
      if (style && !document.getElementById('bar-menu-css')){
        document.head.appendChild(style.cloneNode(true));
      }

      // nav.rail — mount noktasına ekle
      const nav = doc.querySelector(RAIL_SEL);
      if (nav){
        const host = document.getElementById(MOUNT_ID) || document.body;
        host.appendChild(nav.cloneNode(true));
      }

      // (opsiyonel) overlay vb. ek parçalar
      const sbOverlay = doc.querySelector('#sbOverlay');
      if (sbOverlay && !document.getElementById('sbOverlay')){
        document.body.appendChild(sbOverlay.cloneNode(true));
      }
    }catch(e){
      console.warn('[mobil_settings] bar-menu mount hatası:', e);
    }
  }

  /* -------------------- Observer + Olaylar -------------------- */
  // rail sonradan geldiğinde mobil/desktop modunu uygula
  const obs = new MutationObserver(() => {
    const el = getRail();
    if (el && el !== railEl){
      railEl = el;
      syncMode();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTid);
    resizeTid = setTimeout(syncMode, 120);
  }, { passive:true });

  window.addEventListener('orientationchange', () => {
    // ölçümler yerine otursun
    setTimeout(syncMode, 180);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await mountBarMenu();
    syncMode();
  });

  // Sayfa erken yüklenirse
  mountBarMenu().then(syncMode);
})();
