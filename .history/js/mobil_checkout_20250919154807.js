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
      if (isSaleActive && typeof window.renderSale === 'function') {
        window.renderSale();
      }

      // Ödeme görünümü mü açık?
      const payView = document.getElementById('paymentView');
      const isPayActive = payView && payView.style.display !== 'none';
      if (isPayActive && typeof window.renderPayment === 'function') {
        window.renderPayment();
      }

      // İşlemler görünümü mü açık?
      const txView = document.getElementById('txsView');
      const isTxActive = txView && txView.style.display !== 'none';
      if (isTxActive && typeof window.renderTxs === 'function') {
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
      document.getElementById('saleView').style.display     = (view==='sale') ? '' : 'none';
      document.getElementById('txsView').style.display      = (view==='txs')  ? '' : 'none';
      document.getElementById('paymentView').style.display  = 'none';
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

  /* =======================================================
     YENİ: Mobilde sepete kalem eklenince aşağıya kaydır
     (Ödemeye Geç alanı görülsün)
  ======================================================= */

  // Hangi scroller? (önce .content, sonra doküman)
  function getScroller(){
    const cand = document.querySelector('.content');
    if (cand && cand.scrollHeight > cand.clientHeight + 8) return cand;
    return document.scrollingElement || document.documentElement || document.body;
  }

  function scrollPayArea(){
    if (!mq.matches) return;                         // sadece mobil
    const saleView = document.getElementById('saleView');
    if (!saleView || saleView.style.display === 'none') return; // sadece satış görünümündeyken

    // Öncelik: Ödeme aksiyonlarının olduğu alan
    const actions = document.querySelector('.actions');
    if (actions) {
      // DOM yerleşsin → sonra aşağıya al
      requestAnimationFrame(()=>{
        actions.scrollIntoView({ behavior:'smooth', block:'end' });
        // bazı tarayıcılarda biraz daha aşağı it
        setTimeout(()=>{
          const sc = getScroller();
          try { sc.scrollBy({ top: 120, behavior:'smooth' }); } catch {}
        }, 140);
      });
      return;
    }

    // Fallback: scroller’ın en dibine
    const scroller = getScroller();
    const to = scroller.scrollHeight;
    setTimeout(()=>{
      try {
        if (scroller === window || scroller === document.body) {
          window.scrollTo({ top: to, behavior:'smooth' });
        } else {
          scroller.scrollTo({ top: to, behavior:'smooth' });
        }
      } catch {}
    }, 60);
  }

  // 1) addToCart tanımlıysa güvenli wrap — DOM’a eklendikten sonra kaydır
  if (typeof window.addToCart === 'function') {
    const _origAddToCart = window.addToCart;
    window.addToCart = function(...args){
      const res = _origAddToCart.apply(this, args);
      if (mq.matches) {
        // iki raf sonra (DOM çizilsin)
        requestAnimationFrame(()=>requestAnimationFrame(scrollPayArea));
      }
      return res;
    };
  }

  // 2) Sepet DOM’unu izle: .cart-row eklendiğinde tetikle (ekstra güvence)
  const cartEl = document.getElementById('cart');
  if (cartEl) {
    const mo = new MutationObserver((mutations)=>{
      if (!mq.matches) return;
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList?.contains('cart-row') && !n.classList.contains('readonly-row')) {
            scrollPayArea();
            return;
          }
        }
      }
    });
    mo.observe(cartEl, { childList:true, subtree:true });
  }

  // 3) Hizmet listesi tıklaması & Özel Tutar eklemesi — ek güvence
  document.getElementById('svcList')?.addEventListener('click', ()=>{
    setTimeout(scrollPayArea, 90);
  }, true);

  document.getElementById('addCustom')?.addEventListener('click', ()=>{
    setTimeout(scrollPayArea, 90);
  });

})();
