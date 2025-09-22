<script>
(function loadRail(){
  const mount = document.getElementById('rail-mount');
  if(!mount) return;

  const CANDIDATES = [
    'bar-menu.html','/bar-menu.html',
    'partials/bar-menu.html','/partials/bar-menu.html',
    '../bar-menu.html'
  ];

  function ensureRailStyles(){
    const has = document.querySelector('[data-rail-style]') ||
      Array.from(document.styleSheets).some(ss=>{ try{
        return Array.from(ss.cssRules||[]).some(r=>String(r.cssText).includes('.rail__btn'));
      }catch{ return false; }});
    if(has) return;

    const css = `
      .rail{position:fixed; inset:0 auto 0 0; width:72px; background:#151619; color:#b9bec7;
        display:flex; flex-direction:column; align-items:center; justify-content:space-between;
        z-index:1000; border-right:1px solid #2a2d34; padding:12px 0;}
      .rail__list{list-style:none; margin:0; padding:0; width:100%; flex:1; display:flex; flex-direction:column;
        justify-content:space-evenly; align-items:center}
      .rail__item{width:100%; display:flex; justify-content:center}
      .rail__btn{width:44px; height:44px; display:grid; place-items:center; border-radius:12px;
        color:#b9bec7; text-decoration:none; position:relative}
      .rail__btn:hover{background:#1d1f24; color:#fff}
      .rail__btn[aria-current="page"]{background:rgba(124,108,255,.12); color:#fff;
        box-shadow:inset 0 0 0 1px rgba(124,108,255,.35)}
      .main{ padding-left:72px; } /* masaüstü sol boşluk */
    `;
    const style = document.createElement('style');
    style.dataset.railStyle = '1';
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function tryFetch(url){
    try{
      const r = await fetch(url, { credentials:'same-origin' });
      if(!r.ok) throw new Error('HTTP '+r.status);
      const html = await r.text();
      mount.innerHTML = html;
      mount.removeAttribute('aria-hidden');

      ensureRailStyles();

      // Aktif sayfayı işaretle
      const page = (location.pathname.split('/').pop() || '').toLowerCase();
      mount.querySelectorAll('.rail__btn, .rail a, nav a').forEach(a=>{
        const href = (a.getAttribute('href')||'').split(/[?#]/)[0].toLowerCase();
        if (href && page && href.endsWith(page)) a.setAttribute('aria-current','page');
      });

      // Rail → Bildirim aç (opsiyonel)
      mount.querySelectorAll('#railBell, [data-open="notify"]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          e.preventDefault();
          document.getElementById('notify')?.classList.add('open');
        });
      });

      // Rail → Profil modalı aç (karartmasız)
      mount.querySelectorAll('#bmOpen, #topProfileBtn, [data-open="bm"], .avatar-btn, #railProfile, [data-role="profile"]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          e.preventDefault();
          const bm = document.getElementById('bmModal');
          bm?.classList.add('show');
          bm?.setAttribute('aria-hidden','false');
        });
      });

      return true;
    }catch(e){ console.warn('[rail] yüklenemedi:', url, e); return false; }
  }

  (async ()=>{
    let ok = false;
    for(const u of CANDIDATES){ ok = await tryFetch(u); if(ok) break; }
    if(!ok){
      // basit fallback
      mount.innerHTML = `
        <nav class="rail"><ul class="rail__list">
          <li class="rail__item"><a class="rail__btn" href="calendar.html" title="Takvim">📅</a></li>
          <li class="rail__item"><a class="rail__btn" href="staff.html" title="Personel">👥</a></li>
          <li class="rail__item"><a class="rail__btn" href="services.html" title="Hizmetler">💈</a></li>
          <li class="rail__item"><a class="rail__btn" href="reports.html" title="Raporlar">📊</a></li>
          <li class="rail__item"><button class="rail__btn avatar-btn" type="button" id="railProfile" title="Profil">👤</button></li>
        </ul></nav>`;
      mount.removeAttribute('aria-hidden');
      ensureRailStyles();
    }
  })();
})();
</script>
