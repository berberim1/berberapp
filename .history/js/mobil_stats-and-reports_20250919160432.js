/* ===========================================================
   MOBIL STATS & REPORTS Davranışları (≤ 1024px)
   Masaüstüne dokunmaz; sadece mobil/tablet flow
   =========================================================== */
(function initMobileStatsReports(){
  const mq = window.matchMedia('(max-width: 1024px)');

  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }
  applyMobileClass();
  mq.addEventListener?.('change', applyMobileClass);

  /* Yukarı kaydır yardımcı */
  function smoothScrollTop(){
    if (!mq.matches) return;
    const scroller = document.querySelector('.wrap') || document.scrollingElement || document.documentElement;
    try { scroller.scrollTo({ top: 0, behavior: 'smooth' }); } catch { scroller.scrollTop = 0; }
  }
  /* Hash ile sekme değiştiğinde mobilde başa dön */
  window.addEventListener('hashchange', smoothScrollTop);

  /* =======================
     Randevular alt görünümleri
     (app-main / app-summary / app-list)
  ======================== */
  const appMain = document.getElementById('app-main');
  const appSummary = document.getElementById('app-summary');
  const appList = document.getElementById('app-list');

  function showAppView(which){
    if (appMain)   appMain.hidden   = (which !== 'main');
    if (appSummary)appSummary.hidden= (which !== 'summary');
    if (appList)   appList.hidden   = (which !== 'list');
    smoothScrollTop();
  }

  /* Aside kısayolları */
  document.querySelectorAll('#appointments .right .row[data-goto]')
    .forEach(row=>{
      row.addEventListener('click', ()=>{
        const to = row.getAttribute('data-goto');
        if (to === 'app-summary') showAppView('summary');
        if (to === 'app-list')    showAppView('list');
      });
    });

  /* Geri butonları */
  document.getElementById('back-from-summary')?.addEventListener('click', ()=>showAppView('main'));
  document.getElementById('back-from-list')?.addEventListener('click', ()=>showAppView('main'));

  /* =======================
     Gelir alt görünümleri
     (rev-main / rev-services)
  ======================== */
  const revMain = document.getElementById('rev-main');
  const revServices = document.getElementById('rev-services');

  function showRevView(which){
    if (revMain)     revMain.hidden     = (which !== 'main');
    if (revServices) revServices.hidden = (which !== 'services');
    smoothScrollTop();
  }

  document.getElementById('go-sales-by-services')?.addEventListener('click', ()=>showRevView('services'));
  document.getElementById('back-from-rev-services')?.addEventListener('click', ()=>showRevView('main'));
})();
