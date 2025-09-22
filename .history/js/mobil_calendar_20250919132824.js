<!-- Mobil davranışları: 2 kolon görünürlük, bottom bar, boyut değişimlerine uyum -->
<script>
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

  // ---- MOBİL MENÜ KONTROLÜ (Profil modalı açıkken gizle) ----
  function closeMobMenu(){
    const btn  = document.getElementById('mobMenuBtn');
    const menu = document.getElementById('mobMenu');
    if (btn)  btn.setAttribute('aria-expanded','false');
    if (menu){
      menu.setAttribute('aria-hidden','true');
      menu.classList.remove('open');
    }
  }
  function setMobMenuVisible(show){
    const wrap = document.querySelector('.mob-menu-wrap');
    if (!wrap) return;
    wrap.style.display = show ? '' : 'none';
  }
  function isBmOpen(){
    const bm = document.getElementById('bmModal');
    return !!bm && bm.classList.contains('show') && bm.getAttribute('aria-hidden') !== 'true';
  }

  // İlk durum
  applyMobileClass();
  reflowIfNeeded();

  // Eşik değişince sınıfı güncelle + yeniden çiz
  mq.addEventListener?.('change', ()=>{ applyMobileClass(); reflowIfNeeded(); });

  // Ekran döndürme / resize’da da yeniden hesapla
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive: true });

  // Profil modalı durumunu izleyip mobil menüyü otomatik gizle/göster
  (function watchBm(){
    const bm = document.getElementById('bmModal');
    if (!bm) return;
    const obs = new MutationObserver(()=> {
      if (isBmOpen()) { closeMobMenu(); setMobMenuVisible(false); }
      else            { setMobMenuVisible(true); }
    });
    obs.observe(bm, { attributes:true, attributeFilter:['class','aria-hidden'] });
    // İlk tetik
    if (isBmOpen()) { closeMobMenu(); setMobMenuVisible(false); }
  })();

  // Bottom bar (rail) profil tetikleyicisi: karartmasız aç + menüyü kapat
  document.addEventListener('click', (e)=>{
    if (!document.documentElement.classList.contains('is-mobile')) return;

    // Profil açma tetikleyicileri
    const trigger = e.target.closest('.rail .avatar-btn, .rail [data-role="profile"], #railProfile');
    if(trigger){
      e.preventDefault(); e.stopPropagation();
      closeMobMenu(); setMobMenuVisible(false);

      const bm = document.getElementById('bmModal');
      bm?.classList.add('show');
      bm?.setAttribute('aria-hidden','false');
      bm?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus?.();
      return;
    }

    // Profil modalı açıkken mob menünün açılmasını engelle
    if (isBmOpen() && (e.target.closest('#mobMenuBtn') || e.target.closest('#mobMenu'))) {
      e.preventDefault(); e.stopPropagation();
      closeMobMenu(); setMobMenuVisible(false);
    }
  }, true);
})();
</script>
