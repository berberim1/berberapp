/* ===========================================================
   MOBİL CHECKOUT Davranışları (≤ 900px)
   Masaüstüne dokunmaz; sadece mobil düzen/flow
   =========================================================== */
(function initMobileCheckout(){
  const mq = window.matchMedia('(max-width: 900px)');

  /** body’ye is-mobile sınıfı uygula */
  function applyMobileClass() {
    document.documentElement.classList.toggle('is-mobile', mq.matches);
  }

  /** Görünümü yeniden çiz (gerekirse) */
  function reflowIfNeeded(){
    try {
      // Satış görünümü mü açık?
      const saleView = document.getElementById('saleView');
      const isSaleActive = saleView && saleView.style.display !== 'none';
      if(isSaleActive && typeof window.renderSale === 'function'){
        window.renderSale();
      }

      // Ödeme görünümü mü açık?
      const payView = document.getElementById('paymentView');
      const isPayActive = payView && payView.style.display !== 'none';
      if(isPayActive && typeof window.renderPayment === 'function'){
        window.renderPayment();
      }

      // İşlemler görünümü mü açık?
      const txView = document.getElementById('txsView');
      const isTxActive = txView && txView.style.display !== 'none';
      if(isTxActive && typeof window.renderTxs === 'function'){
        window.renderTxs();
      }
    } catch(_) { /* sessiz geç */ }
  }

  // İlk çalıştırma
  applyMobileClass();
  reflowIfNeeded();

  // Eşik değişiminde
  mq.addEventListener?.('change', ()=>{
    applyMobileClass();
    reflowIfNeeded();
  });

  // Ekran döndürme / resize
  window.addEventListener('orientationchange', reflowIfNeeded);
  window.addEventListener('resize', reflowIfNeeded, { passive:true });

  /* ================================================
     Mobilde bazı UI dokunuşları
  ================================================= */

  // Sekme geçişleri (YENİ SATIŞ / İŞLEMLER)
  document.querySelectorAll('.top-tabs .tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.top-tabs .tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');

      const view = tab.dataset.view;
      document.getElementById('saleView').style.display = (view==='sale') ? '' : 'none';
      document.getElementById('txsView').style.display  = (view==='txs')  ? '' : 'none';
      document.getElementById('paymentView').style.display = 'none';
      document.getElementById('completeView').style.display = 'none';
    });
  });

  // Sol menüde nav (Hizmetler / Özel Tutar)
  document.querySelectorAll('.left-nav .nav-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.left-nav .nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.left-col .section').forEach(sec=>sec.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.dataset.target;
      document.getElementById(target)?.classList.add('active');
    });
  });

  // Ödeme ekranına geç
  document.getElementById('goPayment')?.addEventListener('click', ()=>{
    document.getElementById('saleView').style.display = 'none';
    document.getElementById('paymentView').style.display = '';
  });

  // Ödeme ekranından geri dön
  document.getElementById('backFromPayment')?.addEventListener('click', ()=>{
    document.getElementById('paymentView').style.display = 'none';
    document.getElementById('saleView').style.display = '';
  });

  // Ödeme onayı → Tamamlandı
  document.getElementById('confirmPay')?.addEventListener('click', ()=>{
    document.getElementById('paymentView').style.display = 'none';
    document.getElementById('completeView').style.display = '';
  });

})();
