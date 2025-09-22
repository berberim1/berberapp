/* ===========================================================
   MOBIL STATS & REPORTS Davranışları (≤ 1024px)
   Masaüstüne dokunmaz; sadece mobil/tablet flow
   =========================================================== */
(function initMobileStatsReports(){
  const mq = window.matchMedia('(max-width: 1024px)');

  /* === Mobil sınıfı === */
  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }
  applyMobileClass();
  mq.addEventListener?.('change', applyMobileClass);

  /* === Kaydırma yardımcıları === */
  const wrap = document.querySelector('.wrap');
  function smoothScrollTop(){
    if (!mq.matches) return;
    const scroller = wrap || document.scrollingElement || document.documentElement;
    try { scroller.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { scroller.scrollTop = 0; }
  }

  /* Hash sekme değişiminde başa dön */
  window.addEventListener('hashchange', smoothScrollTop);

  /* Üst sekme tıklamalarında da başa dön + alt görünümleri sıfırla */
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      const to = tab.getAttribute('data-tab');
      if (to === 'appointments') showAppView('main');
      if (to === 'revenue')      showRevView('main');
      smoothScrollTop();
    });
  });

  /* Ay seçici değişimlerinde de yukarı dön (opsiyonel kalite) */
  document.getElementById('monthOk')?.addEventListener('click', ()=>{
    // stats-and-reports.js reloadAll tetikliyor; biz sadece UX için başa dönelim
    setTimeout(smoothScrollTop, 120);
  });
  document.getElementById('prevBtn')?.addEventListener('click', ()=> setTimeout(smoothScrollTop, 0));
  document.getElementById('nextBtn')?.addEventListener('click', ()=> setTimeout(smoothScrollTop, 0));

  /* ==================================================
     RANDEVULAR alt görünümleri (app-main / summary / list)
     ================================================== */
  const appMain    = document.getElementById('app-main');
  const appSummary = document.getElementById('app-summary');
  const appList    = document.getElementById('app-list');

  function showAppView(which){
    if (appMain)    appMain.hidden    = (which !== 'main');
    if (appSummary) appSummary.hidden = (which !== 'summary');
    if (appList)    appList.hidden    = (which !== 'list');
    smoothScrollTop();
  }

  /* Aside kısayolları */
  document.querySelectorAll('#appointments .right .row[data-goto]').forEach(row=>{
    row.addEventListener('click', ()=>{
      const to = row.getAttribute('data-goto');
      if (to === 'app-summary') showAppView('summary');
      if (to === 'app-list')    showAppView('list');
    });
  });

  /* Geri butonları */
  document.getElementById('back-from-summary')?.addEventListener('click', ()=>showAppView('main'));
  document.getElementById('back-from-list')?.addEventListener('click', ()=>showAppView('main'));

  /* ==================================================
     GELİR alt görünümleri (rev-main / rev-services)
     ================================================== */
  const revMain     = document.getElementById('rev-main');
  const revServices = document.getElementById('rev-services');

  function showRevView(which){
    if (revMain)     revMain.hidden     = (which !== 'main');
    if (revServices) revServices.hidden = (which !== 'services');
    smoothScrollTop();
  }

  document.getElementById('go-sales-by-services')?.addEventListener('click', ()=>showRevView('services'));
  document.getElementById('back-from-rev-services')?.addEventListener('click', ()=>showRevView('main'));

  /* ==================================================
     İlk açılış: hash varsa başa dön (mobil his)
     ================================================== */
  if (location.hash) smoothScrollTop();

  /* Ekran yönü/resize: yapışkan başlık altındaki scroll’u toparla */
  window.addEventListener('orientationchange', ()=> setTimeout(smoothScrollTop, 100));
  window.addEventListener('resize', ()=> { if (mq.matches) setTimeout(smoothScrollTop, 100); }, { passive:true });
})();
