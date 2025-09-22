/* ===========================================================
   STAFF — MOBIL Davranışları (≤1024px)
   - Desktop JS’e dokunmaz; sadece mobil/tablet UX katmanı
   - Tek kolon akışta yukarı/aşağı kaydırma, sticky üstlerle uyum
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
  function getScroller(){
    const el = document.querySelector('.container');
    const docEl = document.scrollingElement || document.documentElement;
    if (!el) return docEl;
    // container scroll etmiyorsa dokümanı kullan
    return (el.scrollHeight > el.clientHeight + 2) ? el : docEl;
  }

  function smoothScrollTop(){
    if (!mq.matches) return;
    const s = getScroller();
    try { s.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { s.scrollTop = 0; }
  }

  function smoothScrollBottom(){
    if (!mq.matches) return;
    const s = getScroller();
    const go = () => {
      const y = Math.max(0, s.scrollHeight - s.clientHeight + 1);
      try { s.scrollTo({ top: y, behavior: 'smooth' }); }
      catch { s.scrollTop = y; }
    };
    // yeniden render sonrası ölçüler otursun
    requestAnimationFrame(()=> requestAnimationFrame(()=> setTimeout(go, 30)));
  }

  /* Sekme tıklamalarında başa dön */
  document.querySelectorAll('.tabs .tab[role="tab"]').forEach(tab=>{
    tab.addEventListener('click', ()=> setTimeout(smoothScrollTop, 0));
  });

  /* Personel seçimi sonrası EN ALTA kaydır */
  const staffList = document.getElementById('staffList');
  staffList?.addEventListener('click', (e)=>{
    const item = e.target.closest('.staff-item');
    if (!item) return;
    // staff.js seçimi yapıp paneli yeniden çizdikten sonra kaydır
    setTimeout(smoothScrollBottom, 60);
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
