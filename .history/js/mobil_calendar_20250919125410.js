/* Mobil davranışları: 2 kolon görünürlük, bottom bar, boyut değişimlerine uyum + hamburger menü entegrasyonu */
(function initMobile(){
  const mq = window.matchMedia('(max-width: 900px)');

  function isMobile(){ return mq.matches; }

  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', isMobile());
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

  /* ---------- Hamburger menü: kurulum ---------- */
  function ensureMobileHamburger(){
    // Zaten varsa tekrar kurma
    if (document.getElementById('mobMenuBtn')) return;

    // Topbar içine buton + menü bloğunu en sola yerleştir
    const topbarInner = document.querySelector('.topbar-inner');
    if (!topbarInner) return;

    // Sol bloğu oluştur
    const wrap = document.createElement('div');
    wrap.className = 'mob-menu-wrap';
    wrap.setAttribute('role','group');

    const btn = document.createElement('button');
    btn.id = 'mobMenuBtn';
    btn.className = 'mob-menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup','true');
    btn.setAttribute('aria-expanded','false');
    btn.title = 'Menü';

    const menu = document.createElement('div');
    menu.id = 'mobMenu';
    menu.className = 'mob-menu';
    menu.setAttribute('role','menu');
    menu.setAttribute('aria-hidden','true');

    // Menü elemanları
    const itemView = document.createElement('button');
    itemView.id = 'mobMenuView';
    itemView.className = 'mob-menu-item';
    itemView.setAttribute('role','menuitem');
    itemView.innerHTML = `<span class="mm-ic mm-ic-view" aria-hidden="true"></span> Görünüm <span class="mm-check" aria-hidden="true">✓</span>`;

    const itemStaff = document.createElement('button');
    itemStaff.id = 'mobMenuStaff';
    itemStaff.className = 'mob-menu-item';
    itemStaff.setAttribute('role','menuitem');
    itemStaff.innerHTML = `<span class="mm-ic mm-ic-staff" aria-hidden="true"></span> Personel <span class="mm-check" aria-hidden="true">✓</span>`;

    menu.appendChild(itemView);
    menu.appendChild(itemStaff);
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    // En sola ekle (ilk çocuk olarak)
    topbarInner.insertBefore(wrap, topbarInner.firstChild);

    // Olaylar
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      const open = menu.getAttribute('aria-hidden') === 'false';
      setMenuOpen(!open);
    });

    // Menü açık/kapalı durumu
    function setMenuOpen(open){
      if(open){
        menu.setAttribute('aria-hidden','false');
        btn.setAttribute('aria-expanded','true');
        // Menü pozisyonu: butona göre hizala (küçük ekran varyasyonları için güvence)
        const r = btn.getBoundingClientRect();
        menu.style.left = '0px';
        menu.style.top  = 'calc(100% + 8px)';
      }else{
        menu.setAttribute('aria-hidden','true');
        btn.setAttribute('aria-expanded','false');
      }
    }

    // Dışarı tıklayınca menüyü KAPATMA (isteğe göre kapatılabilir) — 
    // Menü açık kalmalı, sadece toggle ile kapatalım.
    // Yine de çok dışarıda bir tıklama ile kapatmak istersen alttaki yorumu aç:
    /*
    document.addEventListener('mousedown', (e)=>{
      if(!isMobile()) return;
      if(menu.getAttribute('aria-hidden') === 'true') return;
      const inside = e.target.closest('#mobMenu') || e.target.closest('#mobMenuBtn');
      if(!inside) setMenuOpen(false);
    });
    */

    // Yardımcılar: aktif işaretle
    function setActive(which){ // 'view' | 'staff'
      itemView.classList.toggle('active', which === 'view');
      itemStaff.classList.toggle('active', which === 'staff');
    }

    // Modalları kapat/aç kontrolü
    function closeViewModal(){
      const viewPop = document.getElementById('viewPop');
      if(viewPop){
        // Kendi toggle davranışın varsa karışmayalım; görünür ise gizle
        viewPop.style.display = 'none';
      }
    }
    function openViewModal(){
      // En güvenlisi: orijinal düğmeye tıklama simülasyonu
      const viewChip = document.getElementById('viewChip');
      const viewPop = document.getElementById('viewPop');
      // Önce personel modalı kapat
      closeStaffModal();
      // Önce görünüm panelini görünür yapmayı deneyelim
      if(viewPop){
        viewPop.style.display = '';
        viewPop.setAttribute('aria-hidden','false');
      }
      // Handler tetiklemek için chip’e click simüle et
      if(viewChip){
        viewChip.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      }
    }

    function closeStaffModal(){
      const staffPop = document.getElementById('staffPop');
      if(staffPop){
        staffPop.style.display = 'none';
        staffPop.setAttribute('aria-hidden','true');
      }
    }
    function openStaffModal(){
      // Önce görünüm modalını kapat
      closeViewModal();
      const staffBtn = document.getElementById('staffBtn');
      const staffPop = document.getElementById('staffPop');
      if(staffPop){
        staffPop.style.display = '';
        staffPop.setAttribute('aria-hidden','false');
      }
      if(staffBtn){
        staffBtn.dispatchEvent(new MouseEvent('click', {bubbles:true}));
      }
    }

    // Menü item clickleri: menü açık kalsın, ilgili modal açılsın/diğeri kapansın
    itemView.addEventListener('click', (e)=>{
      e.preventDefault();
      if(!isMobile()) return;
      setActive('view');
      openViewModal();
      // menü açık kalsın: setMenuOpen(true);
    });

    itemStaff.addEventListener('click', (e)=>{
      e.preventDefault();
      if(!isMobile()) return;
      setActive('staff');
      openStaffModal();
      // menü açık kalsın: setMenuOpen(true);
    });

    // İlk durum: menü kapalı, hiçbir item aktif değil
    setMenuOpen(false);
    setActive(null);
  }

  /* ---------- İlk durum & dinleyiciler ---------- */
  applyMobileClass();
  if (isMobile()) ensureMobileHamburger();
  reflowIfNeeded();

  // Eşik değişince sınıfı güncelle + yeniden çiz + hamburger var mı kontrol et
  mq.addEventListener?.('change', ()=>{
    applyMobileClass();
    if (isMobile()) {
      ensureMobileHamburger();
    }
    reflowIfNeeded();
  });

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

  /* ---------- Ufak güvence: mobilde arama kutusunu kısaltma (CSS ile uyumlu) ---------- */
  (function ensureSmallSearch(){
    if(!isMobile()) return;
    const search = document.querySelector('.topbar .search input');
    if(search){
      search.setAttribute('inputmode','search');
      search.setAttribute('autocomplete','off');
      search.setAttribute('enterkeyhint','search');
    }
  })();
})();
