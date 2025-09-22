/* Mobil davranışları: 2 kolon görünürlük, bottom bar, boyut değişimlerine uyum */
(function initMobile(){
  const mq = window.matchMedia('(max-width: 900px)');

  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }

  // Mevcut render fonksiyonları desktop/mobil için zaten 2 kolon hesaplıyor.
  // Burada sadece sınıfı yönetiyoruz ve yeniden çizim tetikliyoruz.
  function reflowIfNeeded(){
    if (typeof window.renderDay === 'function' && typeof window.renderWeek === 'function') {
      // Aktif görünümü yeniden çiz
      const dayView = document.getElementById('dayView');
      if (dayView && !dayView.hidden) {
        window.renderDay();
      } else if (typeof window.renderWeek === 'function') {
        window.renderWeek();
      }
    }
  }

  applyMobileClass();
  mq.addEventListener?.('change', ()=>{ applyMobileClass(); reflowIfNeeded(); });

  // Ekran döndürme / boyut değişiminde tekrar hesapla
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive: true });

  // Bottom bar’daki profil simgesi (rail) modalını açsın (overlay yok)
  document.addEventListener('click', (e)=>{
    if (!document.documentElement.classList.contains('is-mobile')) return;
    const trigger = e.target.closest('.rail .avatar-btn, .rail [data-role="profile"], #railProfile');
    if(!trigger) return;
    e.preventDefault(); e.stopPropagation();
    const bm = document.getElementById('bmModal');
    bm?.classList.add('show');
    bm?.setAttribute('aria-hidden','false');
  }, true);
})();
