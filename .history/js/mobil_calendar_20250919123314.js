/* Mobil davranışları: 2 kolon görünürlük, bottom bar, hamburger menü entegrasyonu */
(function initMobile(){
  const mq = window.matchMedia('(max-width: 900px)');

  function isMobile() {
    return document.documentElement.classList.contains('is-mobile');
  }

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

  /* ---------- Hamburger menü yönetimi ---------- */
  const menuBtn     = document.getElementById('mobMenuBtn');
  const menuPanel   = document.getElementById('mobMenu');
  const itemView    = document.getElementById('mobMenuView');
  const itemStaff   = document.getElementById('mobMenuStaff');

  const viewBtn     = document.getElementById('viewChip');   // gizli ama sayfada
  const viewPop     = document.getElementById('viewPop');
  const staffBtn    = document.getElementById('staffBtn');   // gizli ama sayfada
  const staffPop    = document.getElementById('staffPop');

  function openMenu(){
    if (!menuPanel) return;
    menuBtn?.setAttribute('aria-expanded', 'true');
    menuPanel.setAttribute('aria-hidden', 'false');
  }
  function closeMenu(){
    if (!menuPanel) return;
    menuBtn?.setAttribute('aria-expanded', 'false');
    menuPanel.setAttribute('aria-hidden', 'true');
  }
  function toggleMenu(){
    if (!menuPanel) return;
    const open = menuPanel.getAttribute('aria-hidden') === 'false';
    open ? closeMenu() : openMenu();
  }

  function simulateClick(el){
    if (!el) return;
    el.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));
  }

  function markActive(which){ // 'view' | 'staff' | null
    itemView?.classList.toggle('is-active', which === 'view');
    itemStaff?.classList.toggle('is-active', which === 'staff');
  }

  function closeViewPopover(){
    if (!viewPop) return;
    // farklı projelerde farklı sınıflar olabilir; güvenli kapatma
    viewPop.classList.remove('open','show','visible');
    viewPop.style.display = '';
    viewBtn?.setAttribute('aria-expanded','false');
  }
  function closeStaffPopover(){
    if (!staffPop) return;
    staffPop.classList.remove('open','show','visible');
    staffPop.style.display = '';
    staffPop.setAttribute('aria-modal','false');
  }

  function openView(){
    // Diğerini kapat
    closeStaffPopover();
    // Var olan JS açma mantığını tetikle
    simulateClick(viewBtn);
    markActive('view');
    // Menü açık kalsın
    openMenu();
  }

  function openStaff(){
    closeViewPopover();
    simulateClick(staffBtn);
    markActive('staff');
    openMenu();
  }

  // İlk durum
  applyMobileClass();
  reflowIfNeeded();

  // Eşik değişince sınıfı güncelle + yeniden çiz
  mq.addEventListener?.('change', ()=>{ applyMobileClass(); reflowIfNeeded(); });

  // Ekran döndürme / resize’da da yeniden hesapla
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive: true });

  // Bottom bar (rail) profil tetikleyicisi: karartmasız aç
  document.addEventListener('click', (e)=>{
    if (!isMobile()) return;
    const trigger = e.target.closest('.rail .avatar-btn, .rail [data-role="profile"], #railProfile');
    if(!trigger) return;
    e.preventDefault(); e.stopPropagation();
    const bm = document.getElementById('bmModal');
    bm?.classList.add('show');
    bm?.setAttribute('aria-hidden','false');
    bm?.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus?.();
  }, true);

  // Hamburger menü: sadece mobilde aktif
  if (menuBtn && menuPanel) {
    menuBtn.addEventListener('click', (e)=>{
      if (!isMobile()) return;
      e.preventDefault();
      toggleMenu();
    });

    // Menü itemları
    itemView?.addEventListener('click', (e)=>{
      if (!isMobile()) return;
      e.preventDefault(); e.stopPropagation();
      openView();
    });
    itemStaff?.addEventListener('click', (e)=>{
      if (!isMobile()) return;
      e.preventDefault(); e.stopPropagation();
      openStaff();
    });

    // Menü dışına tıklayınca KAPATMA — istek gereği menü açık kalsın.
    // Yine de kullanıcı butona tekrar basarsa kapanır.
    document.addEventListener('click', (e)=>{
      if (!isMobile()) return;
      const insideMenu = e.target.closest('.mob-menu, .mob-menu-btn');
      if (insideMenu) return;
      // menü açık ama kullanıcı özellikle kapatmak isterse butona basacak;
      // burada otomatik kapatmıyoruz.
    }, true);
  }

  // Sayfa ilk yüklenince menüyü kapalı ve işaretleri nötr yap
  markActive(null);
  closeMenu();
})();
