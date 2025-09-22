/* Mobil davranışları: 2 kolon görünürlük, bottom bar, boyut değişimlerine uyum + mobil avatar */
(() => {
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

  // Alt barda profil avatarını (baş harf) garanti et
  function ensureProfileAvatar(){
    if (!document.documentElement.classList.contains('is-mobile')) return;

    const btn =
      document.querySelector('.rail .avatar-btn') ||
      document.querySelector('.rail [data-role="profile"]') ||
      document.getElementById('railProfile');

    if (!btn) return;

    let circle = btn.querySelector('.avatar-circle');
    if (!circle) {
      circle = document.createElement('div');
      circle.className = 'avatar-circle';
      btn.innerHTML = '';
      btn.appendChild(circle);
    }

    // Baş harfi bmModal içindeki e-mailden türet (yoksa dataset/email attribute deneyebilir)
    const mailEl = document.getElementById('bmMail');
    const mailTxt = (mailEl?.textContent || mailEl?.innerText || btn.dataset.email || '').trim();
    const initial = (mailTxt.match(/[a-zA-Z0-9]/)?.[0] || '•').toUpperCase();
    circle.textContent = initial;
  }

  // bmMail değişirse avatarı güncelle (modal doldurulduğunda)
  const mailObs = new MutationObserver(ensureProfileAvatar);
  document.addEventListener('DOMContentLoaded', () => {
    const mail = document.getElementById('bmMail');
    if (mail) mailObs.observe(mail, { childList: true, characterData: true, subtree: true });
    ensureProfileAvatar();
  });

  // rail-mount asenkron yüklendiği için orayı da izle
  const railMount = document.getElementById('rail-mount');
  if (railMount) {
    const railObs = new MutationObserver(ensureProfileAvatar);
    railObs.observe(railMount, { childList: true, subtree: true });
  }

  // İlk durum
  applyMobileClass();
  reflowIfNeeded();

  // Eşik değişince sınıfı güncelle + yeniden çiz + avatar güncelle
  mq.addEventListener?.('change', () => {
    applyMobileClass();
    reflowIfNeeded();
    ensureProfileAvatar();
  });

  // Ekran döndürme / resize’da da yeniden hesapla
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive: true });

  // Bottom bar (rail) profil tetikleyicisi: karartmasız aç
  document.addEventListener('click', (e)=>{
    if (!document.documentElement.classList.contains('is-mobile')) return;
    const trigger = e.target.closest('.rail .avatar-btn, .rail [data-role="profile"], #railProfile');
    if(!trigger) return;
    e.preventDefault(); e.stopPropagation();
    const bm = document.getElementById('bmModal');
    bm?.classList.add('show');
    bm?.setAttribute('aria-hidden','false');
    bm?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus?.();
  }, true);
})();
