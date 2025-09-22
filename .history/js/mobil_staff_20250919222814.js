/* ===========================================================
   STAFF — MOBIL Davranışları (≤1024px)
   - Desktop JS’e dokunmaz; sadece mobil/tablet UX katmanı
   - Tek kolon akışta yukarı kaydırma / sticky üstler ile uyum
   =========================================================== */
(function initMobileStaff(){
  const mq = window.matchMedia('(max-width: 1024px)');

  /* === Mobil sınıfı === */
  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }
  applyMobileClass();
  mq.addEventListener?.('change', applyMobileClass);

  /* === Kaydırma yardımcıları === */
  const scroller = document.querySelector('.container') || document.scrollingElement || document.documentElement;
  function smoothScrollTop(){
    if (!mq.matches) return;
    try { scroller.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { scroller.scrollTop = 0; }
  }

  /* Sekme tıklamalarında başa dön */
  document.querySelectorAll('.tabs .tab[role="tab"]').forEach(tab=>{
    tab.addEventListener('click', ()=> setTimeout(smoothScrollTop, 0));
  });

  /* Personel seçimi sonrası başa dön (delegation; staff.js yeniden render ediyor) */
  const staffList = document.getElementById('staffList');
  staffList?.addEventListener('click', (e)=>{
    const item = e.target.closest('.staff-item');
    if (!item) return;
    setTimeout(smoothScrollTop, 0);
  });

  /* Modallar açıldığında küçük bir kaydırma toparlama (özellikle küçük ekranlarda) */
  ['openModal2','openBizHours','btnAddSmall','btnRemoveSmall'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click', ()=> setTimeout(smoothScrollTop, 120));
  });

  /* Ekran yönü/resize: yapışkan başlık altındaki scroll’u toparla */
  window.addEventListener('orientationchange', ()=> setTimeout(smoothScrollTop, 100));
  window.addEventListener('resize', ()=> { if (mq.matches) setTimeout(smoothScrollTop, 100); }, { passive:true });

  /* Focus görünürlüğü (klavye erişilebilirliği) */
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Tab') document.documentElement.classList.add('show-focus');
  }, { once:true });
})();
