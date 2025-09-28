// js/rail.js
(function fastRail(){
  const mount = document.getElementById('rail-mount');
  if(!mount) return;

  const KEY = 'rail-cache-v3';
  const CANDIDATES = [
    'bar-menu.html','/bar-menu.html',
    'partials/bar-menu.html','/partials/bar-menu.html',
    '../bar-menu.html'
  ];

  function ensureRailStyles(){
    if (document.getElementById('rail-style')) return;
    const style = document.createElement('style');
    style.id = 'rail-style';
    style.textContent = `
      .rail{position:fixed; inset:0 auto 0 0; width:72px; background:#151619; color:#b9bec7;
        display:flex; flex-direction:column; align-items:center; justify-content:space-between;
        z-index:1000; border-right:1px solid #2a2d34; padding:12px 0}
      .rail__list{list-style:none; margin:0; padding:0; width:100%; flex:1; display:flex; flex-direction:column; justify-content:space-evenly; align-items:center}
      .rail__item{width:100%; display:flex; justify-content:center}
      .rail__btn{width:44px; height:44px; display:grid; place-items:center; border-radius:12px; color:#b9bec7; text-decoration:none; position:relative}
      .rail__btn:hover{background:#1d1f24; color:#fff}
      .rail__btn[aria-current="page"]{background:rgba(124,108,255,.12); color:#fff; box-shadow:inset 0 0 0 1px rgba(124,108,255,.35)}
      .main{ padding-left:72px; }
    `;
    document.head.appendChild(style);
  }

  function wire(html){
    mount.innerHTML = html;
    mount.removeAttribute('aria-hidden');
    ensureRailStyles();

    // aktif sayfayı işaretle
    const page = location.pathname.split(/[\\/]/).pop();
    const links = mount.querySelectorAll('.rail__btn, .rail a, nav a');
    let found = false;
    links.forEach(a=>{
      const href = (a.getAttribute('href')||'').split(/[?#]/)[0];
      if(href === page) { a.setAttribute('aria-current','page'); found = true; }
    });
    if(!found){
      const key = page.replace(/\.html?$/,'');
      mount.querySelector(`[data-page="${key}"]`)?.setAttribute('aria-current','page');
    }

    // Rail → Profil
    mount.querySelectorAll('#bmOpen, #topProfileBtn, [data-open="bm"], .avatar-btn, #railProfile, [data-role="profile"]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const bm = document.getElementById('bmModal');
        bm?.classList.add('show');
        bm?.setAttribute('aria-hidden','false');
      });
    });
    // Rail → Bildirim
    mount.querySelectorAll('#railBell, [data-open="notify"]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        document.getElementById('notify')?.classList.add('open');
      });
    });
  }

  // 0) stil & varsa cache’ten anında boya
  ensureRailStyles();
  try { const c = sessionStorage.getItem(KEY); if(c){ wire(c); } } catch {}

  // 1) adayları paralel dene; ilk geleni kullan
  const fetches = CANDIDATES.map(u =>
    fetch(u,{credentials:'same-origin'}).then(r=>{ if(!r.ok) throw 0; return r.text(); })
      .then(html => ({html, url:u}))
  );

  (Promise.any ? Promise.any(fetches) : Promise.race(fetches))
    .then(({html})=>{
      if(sessionStorage.getItem(KEY)!==html){ wire(html); try{ sessionStorage.setItem(KEY, html); }catch{} }
    })
    .catch(()=>{
      // 2) fallback skeleton
      if(!mount.innerHTML){
        wire(`
          <div class="rail">
            <ul class="rail__list">
              <li class="rail__item"><a class="rail__btn" href="calendar.html" title="Takvim">📅</a></li>
              <li class="rail__item"><a class="rail__btn" href="staff.html" title="Personel">👤</a></li>
              <li class="rail__item"><button class="rail__btn avatar-btn" type="button" id="railProfile" title="Profil">👤</button></li>
            </ul>
          </div>
        `);
      }
    });
})();
