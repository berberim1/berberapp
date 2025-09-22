/* Mobil davranışları: 2 kolon görünürlük, bottom bar, boyut değişimlerine uyum */
(function initMobile(){
  const mq = window.matchMedia('(max-width: 900px)');

  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }

  // Aktif görünümü yeniden çiz (gün mü hafta mı açık ise)
  function reflowIfNeeded(){
    try {
      const dayEl = document.getElementById('dayView');
      const isDayActive = dayEl && !dayEl.hidden;
      if (isDayActive && typeof window.renderDay === 'function') {
        window.renderDay();
      } else if (typeof window.renderWeek === 'function') {
        window.renderWeek();
      }
    } catch (_) { /* sessizce geç */ }
  }

  // İlk durum
  applyMobileClass();
  reflowIfNeeded();

  // Eşik değişince sınıfı güncelle + yeniden çiz
  mq.addEventListener?.('change', ()=>{ applyMobileClass(); reflowIfNeeded(); });

  // Ekran döndürme / resize’da da yeniden hesapla
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive: true });

})();
