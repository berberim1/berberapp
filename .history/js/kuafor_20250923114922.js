/* Kuaför listing – sadece backend'deki 'public/published' olanlar
   NOT: Kategori alanı olmayan eski kayıtlar için client-side filtre uygulanır.
*/

import { db } from "./firebase.js";
import {
  collection, query, where, orderBy, limit, getDocs, startAfter
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const $ = (s,r=document)=>r.querySelector(s);
const listWrap = $('#listWrap');          // <section id="listWrap" class="listwrap"></section> olmalı
const recWrap  = $('#recWrap');           // önerilenler bölümü için <section id="recWrap">…
const recTrack = $('#recTrack');
const recVP    = $('#recViewport');
const recPrev  = $('#recPrev');
const recNext  = $('#recNext');
const pag      = $('#pagination');

let pageSize = 12;
let cursor   = null;
let hasMore  = true;

let filters  = { city:"", district:"", hood:"" };
let sortKey  = "recommended"; // recommended|updatedAt
let currentPage = 1;

/* -------- yardımcılar -------- */
function tl(v){ return '₺' + Number(v||0).toLocaleString('tr-TR') + (Number(v)>=1?'+':''); }
function esc(s=""){ return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

function serviceChips(services=[]) {
  const arr = services.slice(0, 2).map(s=>({
    name: (s?.name||"").toString(),
    price: s?.price ?? "",
    min: s?.min ?? ""
  }));
  if (!arr.length) return '';
  return arr.map(s=>(`<div class="line">
      <span>${esc(s.name)}</span>
      <span class="fee">${s.price!==""?`${tl(s.price)} • `:""}${s.min?`${s.min}dk`:""}</span>
      <a class="book" href="#">Randevu al</a>
    </div>`)).join('');
}

function toAddress(d={}) {
  const p = d?.step5?.businessLocation || {};
  const line = [p.neighborhood, p.district, (p.province || d?.business?.address?.city)]
    .filter(Boolean).join(', ');
  return line || 'Adres bilgisi yok';
}

function coverUrl(d={}) {
  return d?.images?.cover || d?.images?.salon || d?.images?.model || 'img/placeholder-wide.jpg';
}

function isKuaforDoc(d={}) {
  // Tercih: business.category == "kuafor"
  if (d?.business?.category && String(d.business.category).toLowerCase() === "kuafor") return true;
  // Alternatif: etiketlerden yakala
  const tags = (d?.tags || []).map(t=>String(t).toLowerCase());
  if (tags.includes("kuafor") || tags.includes("berber") || tags.includes("barber")) return true;
  // Eski veriler için: business.name içinde anahtar kelime kontrol (son çare, gevşek)
  const nm = (d?.business?.name || d?.step2?.businessName || "").toLowerCase();
  if (/(kuaf|berber|barber)/.test(nm)) return true;
  return false;
}

function isPublic(d={}) {
  return d?.business?.published === true ||
         d?.business?.visibility === "public" ||
         d?.visibility === "public" ||
         d?.isPublic === true;
}

function matchLocation(d={}) {
  const loc = d?.step5?.businessLocation || {};
  if (filters.city && loc.province !== filters.city) return false;
  if (filters.district && loc.district !== filters.district) return false;
  if (filters.hood && loc.neighborhood !== filters.hood) return false;
  return true;
}

/* -------- kart render -------- */
function renderCard(id, d){
  const name = d?.business?.name || d?.step2?.businessName || 'İşletme';
  const addr = toAddress(d);
  const img  = coverUrl(d);
  const services = Array.isArray(d?.services)? d.services : [];
  const featured = d?.business?.featured === true;

  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="row">
      <div class="thumb">
        <a href="business.html?biz=${encodeURIComponent(id)}">
          <img src="${esc(img)}" alt="${esc(name)}">
        </a>
      </div>
      <div class="meta">
        <div class="topline">${featured?'<span class="tag">Önerilen</span>':''}</div>
        <div class="name">${esc(name)}</div>
        <div class="addr">${esc(addr)}</div>
        <div class="svc">
          ${serviceChips(services)}
        </div>
      </div>
    </div>`;
  // Randevu al butonları → detay
  el.querySelectorAll('.book').forEach(b=>{
    b.addEventListener('click',(e)=>{ e.preventDefault(); location.href = `business.html?biz=${encodeURIComponent(id)}`; });
  });
  return el;
}

/* -------- Firestore yardımcıları (fallback'li) -------- */
async function runQueryWithFallback(baseQ, opts={}) {
  // Öncelik: updatedAt ile sırala (index gerekir)
  try {
    const q1 = cursor ? query(baseQ, startAfter(cursor)) : baseQ;
    return await getDocs(q1);
  } catch (e) {
    console.warn("[fetch] updatedAt sorgusu hata/fallback -> __name__", e?.message||e);
    // Yedek: __name__ order (index istemez)
    const base2 = query(
      collection(db,"adminOnboarding"),
      where("business.published","==", true),
      orderBy("__name__"), // alfabetik id
      limit(pageSize)
    );
    const q2 = cursor ? query(base2, startAfter(cursor)) : base2;
    return await getDocs(q2);
  }
}

/* -------- Sayfalı liste -------- */
async function fetchPage(reset=false){
  if (!listWrap) { console.warn("[ui] #listWrap bulunamadı"); return; }

  if (reset) { listWrap.innerHTML=''; cursor=null; hasMore=true; currentPage=1; }

  // Ana sorgu: yalnızca "published"
  let base = query(
    collection(db, "adminOnboarding"),
    where("business.published","==", true),
    orderBy("updatedAt","desc"),
    limit(pageSize)
  );

  const snap = await runQueryWithFallback(base);

  if (snap.empty) { hasMore = false; updatePagination(); return; }

  let added = 0;
  snap.forEach(docSnap=>{
    const d = docSnap.data();
    if (!isPublic(d)) return;
    if (!isKuaforDoc(d)) return;       // kategori alanı olmasa da kuaför değilse at
    if (!matchLocation(d)) return;

    listWrap.appendChild(renderCard(docSnap.id, d));
    added++;
  });

  cursor = snap.docs[snap.docs.length-1];
  if (snap.size < pageSize) hasMore = false;
  if (reset) updatePagination(true);

  // Filtre çok dar ise bir sonraki partiyi otomatik çek
  if (added === 0 && hasMore) await fetchPage(false);
}

/* -------- Önerilenler (featured) – 12 adet -------- */
async function fetchFeatured(){
  if (!recWrap || !recTrack) return;

  try {
    const snap = await getDocs(query(
      collection(db,"adminOnboarding"),
      where("business.published","==", true),
      // Kategori şartı eklemiyoruz; aşağıda client-side filtre ile kuaför süzülüyor
      where("business.featured","==", true),
      orderBy("updatedAt","desc"),
      limit(12)
    ));

    if (snap.empty) { recWrap.hidden = true; return; }

    snap.forEach(docSnap=>{
      const d = docSnap.data();
      if (!isPublic(d) || !isKuaforDoc(d)) return;
      const img = coverUrl(d);
      const name = d?.business?.name || 'İşletme';
      const addr = toAddress(d);
      const a = document.createElement('a');
      a.className = 'rec-card';
      a.href = `business.html?biz=${encodeURIComponent(docSnap.id)}`;
      a.innerHTML = `<div class="rec-thumb"><img src="${esc(img)}" alt="${esc(name)}"></div>
                     <div class="rec-meta"><div style="font-weight:800">${esc(name)}</div><div class="hint">${esc(addr)}</div></div>`;
      recTrack.appendChild(a);
    });
    recWrap.hidden = recTrack.children.length === 0;
  } catch (e) {
    console.warn("[featured] hata:", e?.message||e);
    recWrap.hidden = true;
  }
}

/* -------- Pagination UI -------- */
function updatePagination(show=true){
  if (!pag) return;
  if (!show) { pag.hidden = true; return; }
  pag.hidden = false;
  const prev = pag.querySelector('[data-nav="prev"]');
  const next = pag.querySelector('[data-nav="next"]');
  pag.querySelector('[data-page="1"]')?.classList.add('active');
  prev?.toggleAttribute('disabled', currentPage<=1);
  next?.toggleAttribute('disabled', !hasMore);
  pag.onclick = async (e)=>{
    const t = e.target.closest('.page'); if (!t) return;
    if (t.dataset.nav === 'prev' && currentPage>1) {
      await fetchPage(true);
    }
    if (t.dataset.nav === 'next' && hasMore) {
      currentPage++;
      await fetchPage(false);
    }
    const b1 = pag.querySelector('[data-page="1"]');
    b1 && b1.classList.toggle('active', currentPage===1);
    prev?.toggleAttribute('disabled', currentPage<=1);
    next?.toggleAttribute('disabled', !hasMore);
    window.scrollTo({top:0,behavior:'smooth'});
  };
}

/* ---- UI: mini nav, sort, filter modal ---- */
(function miniNav(){
  const mini=$('#miniNav');
  const sentinel=document.querySelector('[data-sentinel]');
  if(!mini||!sentinel) return;
  const io=new IntersectionObserver((entries)=>entries.forEach(e=>{
    if(e.isIntersecting){ mini.classList.remove('show'); mini.setAttribute('aria-hidden','true'); }
    else{ mini.classList.add('show'); mini.setAttribute('aria-hidden','false'); }
  }),{rootMargin:'-80px 0px 0px 0px',threshold:0.01});
  io.observe(sentinel);
})();

(function bindDropdown(){
  const dd = $('#sortDD'); if(!dd) return;
  const btn= dd.querySelector('.btn');
  const panel = dd.querySelector('.drop-panel');
  btn.addEventListener('click',()=>dd.classList.toggle('open'));
  document.addEventListener('click',(e)=>{ if(!dd.contains(e.target)) dd.classList.remove('open'); });
  panel.querySelectorAll('.drop-row').forEach(r=>r.addEventListener('click', async ()=>{
    panel.querySelectorAll('.drop-row').forEach(x=>x.classList.remove('active'));
    r.classList.add('active');
    const label=r.querySelector('span').textContent.trim();
    $('#sortBtn').textContent='Sırala: '+label+' ▾';
    sortKey = r.dataset.sort || 'recommended';
    // Şimdilik updatedAt/featured zaten orderBy(updatedAt). Gelişmiş sıralama backend gerektirir.
    await fetchPage(true);
  }));
})();

(function filterModal(){
  const overlay = $('#filterModal');
  const openBtn = $('#openFilter');
  const closeBtn = overlay?.querySelector('[data-close="filter"]');
  if(!overlay||!openBtn) return;

  function open(){ overlay.classList.add('active'); document.body.classList.add('no-scroll'); }
  function close(){ overlay.classList.remove('active'); document.body.classList.remove('no-scroll'); }

  openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') close(); });

  const citySel = $('#citySel');
  const distSel = $('#districtSel');
  const neighSel = $('#neighSel');

  function fillSelect(sel, arr, placeholder){
    sel.innerHTML = '';
    const opt0=document.createElement('option');
    opt0.value=''; opt0.textContent=placeholder;
    sel.appendChild(opt0);
    arr.forEach(v=>{
      const o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o);
    });
  }

  // Şehirleri Firestore’dan türet (ilk 200) – kategori şartı olmadan; client-side süzüyoruz
  (async function loadCities(){
    try{
      const snap = await getDocs(query(collection(db,"adminOnboarding"), where("business.published","==", true), limit(200)));
      const set = new Set();
      snap.forEach(d=>{
        if (!isKuaforDoc(d.data())) return;
        const c = d.get("step5.businessLocation.province") || d.get("business.address.city");
        if(c) set.add(c);
      });
      fillSelect(citySel, Array.from(set).sort((a,b)=>a.localeCompare(b,'tr')), 'Şehir seç');
    }catch(e){ console.warn("[filters/cities]", e?.message||e); }
  })();

  citySel?.addEventListener('change', async ()=>{
    const city = citySel.value;
    if(!city){
      distSel.disabled=true; neighSel.disabled=true;
      fillSelect(distSel, [], 'Önce şehir seçin'); fillSelect(neighSel, [], 'Önce ilçe seçin'); return;
    }
    try{
      const snap = await getDocs(query(
        collection(db,"adminOnboarding"),
        where("business.published","==", true),
        where("step5.businessLocation.province","==", city),
        limit(200)
      ));
      const set = new Set();
      snap.forEach(d=>{ if(!isKuaforDoc(d.data())) return; const v=d.get("step5.businessLocation.district"); if(v) set.add(v); });
      fillSelect(distSel, Array.from(set).sort((a,b)=>a.localeCompare(b,'tr')), 'İlçe seç');
      distSel.disabled=false; neighSel.disabled=true; fillSelect(neighSel, [], 'Önce ilçe seçin');
    }catch(e){ console.warn("[filters/districts]", e?.message||e); }
  });

  distSel?.addEventListener('change', async ()=>{
    const city=citySel.value, dist=distSel.value;
    if(!city || !dist){ neighSel.disabled=true; fillSelect(neighSel, [], 'Önce ilçe seçin'); return; }
    try{
      const snap = await getDocs(query(
        collection(db,"adminOnboarding"),
        where("business.published","==", true),
        where("step5.businessLocation.province","==", city),
        where("step5.businessLocation.district","==", dist),
        limit(200)
      ));
      const set = new Set();
      snap.forEach(d=>{ if(!isKuaforDoc(d.data())) return; const v=d.get("step5.businessLocation.neighborhood"); if(v) set.add(v); });
      fillSelect(neighSel, Array.from(set).sort((a,b)=>a.localeCompare(b,'tr')), 'Mahalle seç');
      neighSel.disabled=false;
    }catch(e){ console.warn("[filters/hoods]", e?.message||e); }
  });

  // Temizle / Uygula
  $('#clearFilters')?.addEventListener('click', async ()=>{
    citySel.value=''; distSel.value=''; neighSel.value='';
    distSel.disabled=true; neighSel.disabled=true;
    fillSelect(distSel, [], 'Önce şehir seçin');
    fillSelect(neighSel, [], 'Önce ilçe seçin');
    filters = { city:"", district:"", hood:"" };
    const b=$('#openFilter .badge'); if(b) b.remove();
    await fetchPage(true);
  });

  $('#applyFilters')?.addEventListener('click', async ()=>{
    filters.city    = citySel.value || "";
    filters.district= distSel.value || "";
    filters.hood    = neighSel.value || "";
    // UI rozeti
    const summary = [filters.city, filters.district, filters.hood].filter(Boolean).join(' / ');
    let badge = $('#openFilter .badge');
    if(summary){
      if(!badge){ badge=document.createElement('span'); badge.className='badge'; $('#openFilter').appendChild(badge); }
      badge.textContent = summary.length>28 ? (summary.slice(0,27)+'…') : summary;
    }else{
      if(badge) badge.remove();
    }
    overlay.classList.remove('active'); document.body.classList.remove('no-scroll');
    await fetchPage(true);
  });
})();

/* ---- Arama (ad içinde client-side filtre) ---- */
(function searchBind(){
  const q1 = $('#qSearch'), q2 = $('#miniQ');
  function apply(){
    const val = (q1?.value || q2?.value || '').toLowerCase().trim();
    listWrap?.querySelectorAll('.card').forEach(card=>{
      const t = card.querySelector('.name')?.textContent?.toLowerCase() || '';
      card.style.display = t.includes(val) ? '' : 'none';
    });
  }
  q1 && q1.addEventListener('input', apply);
  q2 && q2.addEventListener('input', apply);
})();

/* ---- Carousel okları ve autoplay ---- */
(function recCarousel(){
  if(!recVP) return;
  const step=300; let timer=null;
  function go(dir=1){ recVP.scrollBy({left: dir*step, behavior:'smooth'}); }
  recPrev?.addEventListener('click', ()=>go(-1));
  recNext?.addEventListener('click', ()=>go(1));
  recVP.addEventListener('wheel', (e)=>{
    if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
      e.preventDefault(); recVP.scrollBy({left: e.deltaY, behavior:'smooth'});
    }
  }, {passive:false});
  function start(){ timer=setInterval(()=>go(1), 2800); }
  function stop(){ clearInterval(timer); timer=null; }
  recVP.addEventListener('mouseenter', stop);
  recVP.addEventListener('mouseleave', start);
  start();
})();

/* ---- Başlat ---- */
await fetchFeatured();
await fetchPage(true);
