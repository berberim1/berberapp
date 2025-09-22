/* eslint-disable no-console */
console.log("[staff] v22 — Owner adı + (Admin) etiketi, step6 default saatler, step8 staff yükleme");

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc, updateDoc, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ------------------------- Helpers + rail ------------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const pad = (n)=>String(n).padStart(2,"0");

async function mountRail(){
  try{
    const res = await fetch('bar-menu.html',{cache:'no-store'});
    const html = await res.text();
    const docu = new DOMParser().parseFromString(html,'text/html');
    const nav = docu.querySelector('nav.rail');
    const style = docu.querySelector('#bar-menu-css') || docu.querySelector('style');
    style && !$('#bar-menu-css') && document.head.appendChild(style.cloneNode(true));
    if(nav){
      $('#rail-mount')?.appendChild(nav.cloneNode(true));
      document.body.classList.add('has-rail');
      const current = (location.pathname.split('/').pop() || 'staff.html');
      $$('nav.rail .rail__btn').forEach(a => { if ((a.getAttribute('href')||"").endsWith(current)) a.setAttribute('aria-current','page'); });
      const profileBtn = $('nav.rail #openProfile') || $('nav.rail .rail__bottom .avatar-btn');
      profileBtn?.addEventListener('click', (e)=>{ e.preventDefault(); openBm(); });
    }
  }catch(e){ console.warn('bar-menu yüklenemedi', e); }
}

/* ------------------------- Dates & labels ------------------------- */
const DAYS = [
  { key:'sun', tr:'Pazar' },
  { key:'mon', tr:'Pazartesi' },
  { key:'tue', tr:'Salı' },
  { key:'wed', tr:'Çarşamba' },
  { key:'thu', tr:'Perşembe' },
  { key:'fri', tr:'Cuma' },
  { key:'sat', tr:'Cumartesi' },
];
const EMPTY_DAY = { enabled:false, start:'09:00', end:'18:00' };

function* quarterSteps(){ for(let h=0;h<24;h++){ for(let m=0;m<60;m+=15){ yield `${pad(h)}:${pad(m)}`; } } }
/* TR 24s */
const timeLabel = (t)=>t;

function diffLabel(a,b){
  const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number);
  const mins=(bh*60+bm)-(ah*60+am); if(mins<=0) return '-';
  const h=Math.floor(mins/60), m=mins%60;
  return h?(m?`${h}sa ${m}dk`:`${h}sa`):`${m}dk`;
}
const toMin = (t)=>{ const [h,m]=t.split(':').map(Number); return h*60+m; };

/* ------------------------- State ------------------------- */
let UID = null;
let ADMIN_NAME = "Admin";            // kayıtlı sahip adı
let staffRaw = [];
let staff = [];   // {id,name,isOwner,role,rawIndex,hours,services:Set<string>}
let bizHours = null; // {sun..sat}
let currentId = null;
let activeTab = 'services';

/* Hizmetler */
let servicesAll = []; // normalized
let serviceCategories = []; // string[]
let srvQuery = "";
let srvCat = "";
let srvTempAssigned = new Set();

/* ---- üst seviye personel-saat haritası ---- */
let topStaffHoursMap = {}; // { "Ad Soyad": { Pazartesi:{open:true,from:"09:00",to:"18:00"}, ... } }

/* ------------------------- Firestore mappers ------------------------- */
function normalizeDay(src){
  if (!src) return { ...EMPTY_DAY };
  const en = 'open' in src ? !!src.open : !!src.enabled;
  const st = src.from || src.start || '09:00';
  const ed = src.to   || src.end   || '18:00';
  return { enabled: en, start: st, end: ed };
}
function toFirestoreDay(model){
  return model.enabled ? { open:true, from:model.start, to:model.end } : { open:false };
}
function normalizeHours(src){
  const out = {};
  DAYS.forEach(d=>{
    const tr = src?.[d.tr];
    const en = src?.[d.key];
    out[d.key] = normalizeDay(tr || en);
  });
  return out;
}
function denormalizeHours(model){
  const out={};
  DAYS.forEach(d=>{ const m=model?.[d.key] || EMPTY_DAY; out[d.tr] = toFirestoreDay(m); });
  return out;
}
function makeId(name, phone, idx){
  const slug = (name||'personel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'personel';
  const tail = (phone||'').replace(/\D/g,'').slice(-4) || String(idx);
  return `${slug}-${tail}`;
}

/* --- saat kaynağını esnekçe okuyan yardımcılar + default --- */
function normalizeAnyHours(src){
  const raw = src?.workingHours || src?.weeklyHours || src?.hours || src?.staff_hours || src || {};
  return normalizeHours(raw);
}
function normalizeWithFallbackToBiz(src, biz){
  const n = normalizeAnyHours(src);
  // Çalışma saatleri boşsa (her gün kapalı veya hiç alan yoksa) dükkan saatlerini kopyala
  const hasAnyOpen = DAYS.some(d => (n?.[d.key]?.enabled));
  return hasAnyOpen ? n : (biz ? JSON.parse(JSON.stringify(biz)) : n);
}

function buildTopStaffHoursMapFromStaffRaw(arr){
  const map = {};
  (arr || []).forEach(s=>{
    const name = (s?.name || '').trim();
    if(!name) return;
    const norm = normalizeAnyHours(s);
    map[name] = denormalizeHours(norm); // TR gün anahtarları
  });
  return map;
}
function findStaffByNameCI(list, name){
  const key = (name||'').trim().toLowerCase();
  return list.find(x => (x.name||'').trim().toLowerCase() === key) || null;
}

/* ------------------------- Time helpers (iş kısıtları) ------------------------- */
function disableOptionsBefore(selectEl, minTime){
  const min = toMin(minTime);
  Array.from(selectEl.options).forEach(o=>{ o.disabled = toMin(o.value) < min; });
}
function moveEndAfterStart(endSel, startVal){
  const smin = toMin(startVal);
  for (const o of Array.from(endSel.options)){
    if (toMin(o.value) > smin){ endSel.value = o.value; return true; }
  }
  return false;
}
function enforceBusinessStartForRow(row){
  const dayKey = row.dataset.key;
  const bh = bizHours?.[dayKey];
  const toggle = row.querySelector('.switch');
  const [startSel, endSel] = row.querySelectorAll('select.sel');

  if (!bh) return;

  if (!bh.enabled){
    toggle.checked = false; toggle.disabled = true;
    startSel.disabled = true; endSel.disabled = true;
    toggle.title = "Dükkan bu gün kapalı";
    return;
  }

  disableOptionsBefore(startSel, bh.start);
  if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
  if (toMin(endSel.value) <= toMin(startSel.value)){
    if (!moveEndAfterStart(endSel, startSel.value)){ endSel.value = startSel.value; }
  }
  startSel.addEventListener('change', ()=>{
    if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
    if (toMin(endSel.value) <= toMin(startSel.value)) moveEndAfterStart(endSel, startSel.value);
  });
}

/* ------------------------- Hizmet mappers ------------------------- */
function readNumberLike(x){
  if (x == null) return 0;
  if (typeof x === 'number') return x;
  const n = parseFloat(String(x).replace(/[^\d.,-]/g,'').replace(',','.'));
  return Number.isFinite(n) ? n : 0;
}
function readDurationMinutes(x){
  if (x == null) return 0;
  if (typeof x === 'number') return x;
  const s = String(x).trim();
  if (/^\d+:\d+$/.test(s)){
    const [h,m]=s.split(':').map(n=>parseInt(n,10));
    return (h*60)+(m||0);
  }
  const m = parseInt(s.replace(/[^\d]/g,''),10);
  return Number.isFinite(m) ? m : 0;
}
function slugifyId(name, idx){
  const base = (name||'hizmet').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'hizmet';
  return `${base}-${idx}`;
}
function normalizeService(s, idx){
  const id = s?.id || s?.slug || slugifyId(s?.name || s?.title || 'hizmet', idx);
  return {
    id,
    name: s?.name || s?.title || `Hizmet ${idx+1}`,
    category: s?.category || s?.cat || "Genel",
    price: readNumberLike(s?.price ?? s?.amount),
    duration: readDurationMinutes(s?.duration ?? s?.minutes ?? s?.time),
    active: (s?.active === undefined ? true : !!s?.active),
  };
}
function extractServicesFromRoot(root){
  const candidates = [
    root?.services,
    root?.step7?.services,
    root?.step7?.catalog,
    root?.catalog?.services,
    root?.catalog,
  ].filter(Boolean);

  let rawList = [];
  for (const c of candidates){
    if (Array.isArray(c)) { rawList = c; break; }
    if (c && Array.isArray(c.services)) { rawList = c.services; break; }
  }

  if ((!rawList || rawList.length===0) && Array.isArray(window?.APP_SERVICES)){
    rawList = window.APP_SERVICES;
  }

  const normalized = Array.isArray(rawList) ? rawList.map((s,i)=>normalizeService(s,i)) : [];
  return normalized;
}

/* ------------------------- UI: staff list + tabs ------------------------- */
function getDisplayName(s){ return s?.isOwner ? `${s.name} (Admin)` : (s?.name || '—'); }

function renderStaffList(){
  const ul = $('#staffList'); if(!ul) return;
  ul.innerHTML='';
  staff.forEach(s=>{
    const li=document.createElement('li');
    li.className='staff-item'; li.dataset.id=s.id;
    if(s.id===currentId) li.setAttribute('aria-current','true');
    const initial = (s.name?.[0] || '?').toUpperCase();
    const subRole = s.isOwner ? 'Sahip (Admin)' : (s.role || s.position || 'Personel');
    li.innerHTML = `<div class="avatar">${initial}</div>
                    <div><div>${getDisplayName(s)}</div><div class="role">${subRole}</div></div>`;
    li.addEventListener('click',()=>{
      currentId=s.id;
      $('#panelTitle').textContent=getDisplayName(s);
      $('#staffName').textContent=getDisplayName(s);
      $('#srvStaffName') && ($('#srvStaffName').textContent = getDisplayName(s));
      snapshotAssignedToTemp();
      renderTabs(); renderStaffList();
    });
    ul.appendChild(li);
  });
}
function bindTabs(){
  $$('.tab').forEach(tb=>{
    tb.addEventListener('click',()=>{ activeTab=tb.dataset.tab; renderTabs(); });
  });
}
function renderTabs(){
  $$('.tab').forEach(tb=>tb.setAttribute('aria-selected', tb.dataset.tab===activeTab));
  $('#tab-services').hidden = activeTab!=='services';
  $('#tab-hours').hidden    = activeTab!=='hours';
  if(activeTab==='hours') renderStaffHoursView(); else renderServicesTab();
}

/* ------------------------- UI: Hizmet Atama ------------------------- */
function formatPriceTry(v){ if (!Number.isFinite(v)) return ''; return `₺${v.toFixed(0)}`; }
function formatDuration(v){ if (!Number.isFinite(v) || v<=0) return ''; return `${v} dk`; }
function buildCategoryOptions(){
  const sel = $('#srvCatFilter'); if(!sel) return;
  const seen = new Set();
  serviceCategories = [];
  servicesAll.forEach(s=>{
    const c = s.category || 'Genel';
    if (!seen.has(c)){ seen.add(c); serviceCategories.push(c); }
  });
  sel.innerHTML = `<option value="">Tüm Kategoriler</option>` + serviceCategories.map(c=>`<option value="${c}">${c}</option>`).join('');
  sel.value = srvCat || '';
}
function currentStaff(){ return staff.find(s => s.id === currentId); }
function snapshotAssignedToTemp(){
  const who = currentStaff(); srvTempAssigned = new Set(who?.services || []);
  $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));
  $('#srvStaffName') && ($('#srvStaffName').textContent = getDisplayName(who));
}
function filterServices(list){
  return list.filter(s=>{
    if (srvCat && (s.category || 'Genel') !== srvCat) return false;
    if (srvQuery){
      const q = srvQuery.toLowerCase();
      if (!((s.name||'').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q))) return false;
    }
    return true;
  });
}
function renderServicesTab(){
  const wrap = $('#tab-services'); if(!wrap) return;

  if(!currentId && staff[0]) currentId = staff[0].id;
  const who = currentStaff();
  if (!who){ wrap.innerHTML = `<div class="muted">Önce bir personel seçin.</div>`; return; }

  $('#srvStaffName') && ($('#srvStaffName').textContent = getDisplayName(who));

  buildCategoryOptions();

  const listEl = $('#srvList');
  const emptyEl = $('#srvEmpty');

  if (!servicesAll || servicesAll.length===0){
    if (emptyEl) emptyEl.style.display = 'block';
    if (listEl) listEl.innerHTML = '';
    return;
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
  }

  if (!(who.services instanceof Set)){
    who.services = new Set(Array.isArray(who.services) ? who.services : []);
  }
  snapshotAssignedToTemp();

  const filtered = filterServices(servicesAll);
  listEl.innerHTML = '';

  filtered.forEach(s=>{
    const li = document.createElement('li');
    li.className = 'svc-item';
    li.dataset.id = s.id;

    const checked = srvTempAssigned.has(s.id) ? 'checked' : '';
    const disabledCls = s.active ? '' : ' style="opacity:.6"';
    const priceTxt = formatPriceTry(s.price);
    const durTxt = formatDuration(s.duration);
    const meta = [durTxt, priceTxt].filter(Boolean).join(' • ');
    const cat = s.category || 'Genel';

    li.innerHTML = `
      <label${disabledCls} style="display:flex; align-items:center; gap:10px; width:100%; cursor:pointer;">
        <input type="checkbox" class="srv-check" data-id="${s.id}" ${checked}>
        <div style="flex:1 1 auto">
          <div style="font-weight:600">${s.name}</div>
          <div class="muted" style="font-size:12px">${meta || '—'}</div>
        </div>
        <span class="chip">${cat}</span>
      </label>
    `;

    listEl.appendChild(li);
  });

  $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));
}

/* Event bindings for Services Tab */
function bindServicesEvents(){
  const listEl = $('#srvList');
  const searchEl = $('#srvSearch');
  const catEl = $('#srvCatFilter');
  const selectAllEl = $('#srvSelectAll');
  const clearEl = $('#srvClear');
  const saveEls = [$('#srvSave'), $('#srvSaveBottom')];
  const cancelEl = $('#srvCancel');

  listEl?.addEventListener('change', (e)=>{
    const t = e.target;
    if (t?.classList.contains('srv-check')){
      const id = t.dataset.id;
      if (t.checked) srvTempAssigned.add(id); else srvTempAssigned.delete(id);
      $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));
    }
  });

  let searchDeb;
  searchEl?.addEventListener('input', ()=>{
    clearTimeout(searchDeb);
    searchDeb = setTimeout(()=>{ srvQuery = (searchEl.value||'').trim(); renderServicesTab(); }, 120);
  });

  catEl?.addEventListener('change', ()=>{
    srvCat = catEl.value || '';
    renderServicesTab();
  });

  selectAllEl?.addEventListener('change', ()=>{
    const visible = Array.from($('#srvList').querySelectorAll('.srv-check'));
    if (selectAllEl.checked){
      visible.forEach(cb=>srvTempAssigned.add(cb.dataset.id));
      visible.forEach(cb=>cb.checked = true);
    }else{
      visible.forEach(cb=>srvTempAssigned.delete(cb.dataset.id));
      visible.forEach(cb=>cb.checked = false);
    }
    $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));
  });

  clearEl?.addEventListener('click', ()=>{
    $('#srvList').querySelectorAll('.srv-check').forEach(cb=>{ cb.checked=false; srvTempAssigned.delete(cb.dataset.id); });
    $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));
    if (selectAllEl) selectAllEl.checked = false;
  });

  saveEls.forEach(btn=>btn?.addEventListener('click', saveServiceAssignments));
  cancelEl?.addEventListener('click', ()=>{
    snapshotAssignedToTemp();
    renderServicesTab();
  });
}

async function saveServiceAssignments(){
  const who = currentStaff(); if (!who) return;
  const arr = [...staffRaw];
  const idx = who.rawIndex;

  const assigned = Array.from(srvTempAssigned);
  who.services = new Set(assigned);

  if (idx >= 0){
    arr[idx] = { ...(arr[idx]||{}), name: arr[idx]?.name || who.name, role: arr[idx]?.role || who.role, hours: denormalizeHours(who.hours), position: arr[idx]?.position || who.role, services: assigned };
  }else{
    arr.push({ name: who.name || ADMIN_NAME, role: who.role || "Sahip", position: who.role || "Sahip", hours: denormalizeHours(who.hours), services: assigned });
    who.rawIndex = arr.length - 1;
  }

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(arr);

  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": arr,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
    staffRaw = arr;
    alert("Hizmet atamaları kaydedildi.");
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": arr,
        "step8.staff_hours": mapForTop,
        "staff_hours": mapForTop,
        updatedAt: serverTimestamp()
      }, { merge:true });
      staffRaw = arr;
      alert("Hizmet atamaları kaydedildi.");
    }catch(e2){
      alert("Kaydedilemedi: " + (e2?.message || e2));
    }
  }
}

/* ------------------------- UI: Çalışan saatleri ------------------------- */
function getCurrentStaff(){ return staff.find(s=>s.id===currentId); }
function renderStaffHoursView(){
  if(!currentId && staff[0]) currentId = staff[0].id;
  const wrap = $('#tab-hours'); if(!wrap) return;
  const who = getCurrentStaff();
  wrap.innerHTML='';

  const model = who?.hours || {};
  const box = document.createElement('div'); box.className='hours';
  DAYS.forEach(d=>{
    const st=model[d.key] || EMPTY_DAY;
    const row=document.createElement('div'); row.className='row'+(st.enabled?'':' off');
    row.innerHTML = `
      <div class="day">${d.tr}</div>
      <div class="range">${st.enabled ? `${timeLabel(st.start)} – ${timeLabel(st.end)}` : '<span class="muted">Çalışmıyor</span>'}</div>
      <div style="text-align:right"><span class="chip">${st.enabled ? diffLabel(st.start, st.end) : '-'}</span></div>`;
    box.appendChild(row);
  });
  const go=document.createElement('div'); go.className='go-shifts';
  go.innerHTML='<button class="btn" id="openModal2">Vardiyaları Düzenle</button>';
  wrap.appendChild(box); wrap.appendChild(go);
  setTimeout(()=>$('#openModal2')?.addEventListener('click',openStaffModal),0);

  $('#panelTitle').textContent = getDisplayName(who);
  $('#staffName').textContent  = getDisplayName(who);
}

/* ------------------------- MODAL: Personel saatleri ------------------------- */
const staffModal = $('#modal');
const staffGrid  = $('#editGrid');

function buildSelect(v){
  const sel=document.createElement('select'); sel.className='sel';
  for(const t of quarterSteps()){ const o=document.createElement('option'); o.value=t; o.textContent=timeLabel(t); sel.appendChild(o); }
  sel.value=v; return sel;
}
function renderStaffModal(){
  const who = getCurrentStaff(); if(!who) return;
  const model = who.hours || {};
  staffGrid.innerHTML='';
  DAYS.forEach(d=>{
    const st=model[d.key] || EMPTY_DAY;
    const row=document.createElement('div'); row.className='mrow'; row.dataset.key=d.key;

    const name=document.createElement('div'); name.textContent=d.tr; name.style.fontWeight='600';

    const toggleWrap=document.createElement('div');
    const toggle=document.createElement('input'); toggle.type='checkbox'; toggle.className='switch'; toggle.checked=!!st.enabled;
    toggleWrap.appendChild(toggle);

    const startSel=buildSelect(st.start||'09:00');
    const endSel  =buildSelect(st.end  ||'18:00');
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener('change',()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    staffGrid.appendChild(row);

    enforceBusinessStartForRow(row);
  });
  $('#staffName').textContent = getDisplayName(who);
}
function openStaffModal(){ renderStaffModal(); staffModal.style.display='flex'; }
$('#closeModal')?.addEventListener('click',()=>{ staffModal.style.display='none'; });
$('#cancelModal')?.addEventListener('click',()=>{ staffModal.style.display='none'; });

$('#saveModal')?.addEventListener('click', async ()=>{
  const who = getCurrentStaff(); if(!who) return;

  let ok = true;
  const updated = {};
  staffGrid.querySelectorAll('.mrow').forEach(r=>{
    const key = r.dataset.key;
    const bh = bizHours?.[key];
    const toggle = r.querySelector('.switch');
    const [s,e] = r.querySelectorAll('select.sel');

    let en = toggle.checked;

    if (bh){
      if (!bh.enabled){ en = false; }
      else if (en && toMin(s.value) < toMin(bh.start)){ s.value = bh.start; }
    }
    if (en && toMin(s.value) >= toMin(e.value)){
      if (!moveEndAfterStart(e, s.value)) ok = false;
    }
    updated[key] = { enabled: en, start: s.value, end: e.value };
  });

  if (!ok) { alert("Çalışan için: Bitiş saati başlangıçtan sonra olmalı."); return; }

  // State & Firestore
  const arr = [...staffRaw];
  const payload = denormalizeHours(updated);
  who.hours = updated;

  try{
    if (who.rawIndex >= 0) {
      const at = arr[who.rawIndex] || {};
      arr[who.rawIndex] = { ...at, name: at.name || who.name, role: at.role || who.role, hours: payload, position: at.position || who.role, services: Array.from(who.services || []) };
    } else {
      arr.push({ name: who.name || ADMIN_NAME, role: who.role || "Sahip", position: who.role || "Sahip", hours: payload, services: Array.from(who.services || []) });
      who.rawIndex = arr.length - 1;
    }
    staffRaw = arr;

    const mapForTop = buildTopStaffHoursMapFromStaffRaw(arr);

    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": arr,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": staffRaw,
        "step8.staff_hours": buildTopStaffHoursMapFromStaffRaw(staffRaw),
        "staff_hours": buildTopStaffHoursMapFromStaffRaw(staffRaw),
        updatedAt: serverTimestamp()
      }, { merge:true });
    }catch(e2){
      alert("Kaydedilemedi: " + (e2?.message || e2));
    }
  }

  staffModal.style.display='none';
  renderStaffHoursView();
});

/* ------------------------- DÜKKAN SAATLERİ ------------------------- */
const bizModal = $('#bizModal');
const bizGrid  = $('#bizGrid');

function renderBizModal(){
  const model = bizHours || {};
  bizGrid.innerHTML='';
  DAYS.forEach(d=>{
    const st=model[d.key] || EMPTY_DAY;
    const row=document.createElement('div'); row.className='mrow'; row.dataset.key=d.key;

    const name=document.createElement('div'); name.textContent=d.tr; name.style.fontWeight='600';

    const toggleWrap=document.createElement('div');
    const toggle=document.createElement('input'); toggle.type='checkbox'; toggle.className='switch'; toggle.checked=!!st.enabled;
    toggleWrap.appendChild(toggle);

    const startSel=buildSelect(st.start||'09:00');
    const endSel  =buildSelect(st.end  ||'18:00');
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener('change',()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    bizGrid.appendChild(row);
  });
}
function openBizModal(){ renderBizModal(); bizModal.style.display='flex'; }
$('#openBizHours')?.addEventListener('click', openBizModal);
$('#bizClose') ?.addEventListener('click',()=>{ bizModal.style.display='none'; });
$('#bizCancel')?.addEventListener('click',()=>{ bizModal.style.display='none'; });

$('#bizSave')?.addEventListener('click', async ()=>{
  let ok = true;
  bizGrid.querySelectorAll('.mrow').forEach(r=>{
    const en = r.querySelector('.switch').checked;
    const [s,e] = r.querySelectorAll('select.sel');
    if (en && toMin(s.value) >= toMin(e.value)) ok = false;
  });
  if (!ok) { alert("Dükkan için: Bitiş saati başlangıçtan sonra olmalı."); return; }

  const updated = {};
  bizGrid.querySelectorAll('.mrow').forEach(r=>{
    const key=r.dataset.key; const en=r.querySelector('.switch').checked;
    const [startSel,endSel]=r.querySelectorAll('select.sel');
    updated[key]={ enabled:en, start:startSel.value, end:endSel.value };
  });

  bizHours = updated;
  bizModal.style.display='none';

  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step6.workingHours": denormalizeHours(updated),
      updatedAt: serverTimestamp(),
    });
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step6.workingHours": denormalizeHours(updated),
        updatedAt: serverTimestamp(),
      }, { merge:true });
    }catch(e2){
      alert("Kaydedilemedi: " + (e2?.message || e2));
    }
  }
});

/* ------------------------- ADD STAFF ------------------------- */
const addModal = $('#addStaffModal');
const btnAddSmall = $('#btnAddSmall');
const addClose = $('#addStaffClose');
const addCancel = $('#addStaffCancel');
const addSave = $('#addStaffSave');
const asHoursGrid = $('#asHoursGrid');
const asAllOffBtn = $('#asAllOff');
const asAllStdBtn = $('#asAllStd');
const asName = $('#asName');
const asPos = $('#asPos');
const asDesc = $('#asDesc');

/* OWNER seçeneğini rolden kaldır (UI + güvenlik) */
function removeOwnerOptionFromRoleSelect(sel){
  if (!sel) return;
  Array.from(sel.options || []).forEach(o=>{
    const t = (o.value || o.textContent || '').trim().toLowerCase();
    if (t === 'sahip' || t === 'owner' || t === 'admin') {
      sel.removeChild(o);
    }
  });
}
removeOwnerOptionFromRoleSelect(asPos);

function defaultNewHours(){
  const def = {};
  DAYS.forEach(d=>{
    const b = bizHours?.[d.key];
    if (b){
      def[d.key] = { enabled: !!b.enabled, start: b.start || '09:00', end: b.end || '18:00' };
    }else{
      def[d.key] = { enabled: d.key!=='sun', start:'09:00', end:'18:00' };
    }
  });
  return def;
}
function renderAddHoursGrid(model = defaultNewHours()){
  asHoursGrid.innerHTML = '';
  DAYS.forEach(d=>{
    const st = model[d.key] || EMPTY_DAY;
    const row = document.createElement('div'); row.className = 'mrow'; row.dataset.key = d.key;

    const name=document.createElement('div'); name.textContent=d.tr; name.style.fontWeight='600';

    const toggleWrap=document.createElement('div');
    const toggle=document.createElement('input'); toggle.type='checkbox'; toggle.className='switch'; toggle.checked=!!st.enabled;
    toggleWrap.appendChild(toggle);

    const startSel=buildSelect(st.start||'09:00');
    const endSel  =buildSelect(st.end  ||'18:00');
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener('change',()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    asHoursGrid.appendChild(row);

    enforceBusinessStartForRow(row);
  });
}
function openAddModal(){
  if(asName) asName.value = '';
  if(asPos)  asPos.value  = 'Berber';
  if(asDesc) asDesc.value = '';
  removeOwnerOptionFromRoleSelect(asPos);
  renderAddHoursGrid();
  addModal.style.display='flex';
}
function closeAddModal(){ addModal.style.display='none'; }

btnAddSmall?.addEventListener('click', openAddModal);
addClose?.addEventListener('click', closeAddModal);
addCancel?.addEventListener('click', closeAddModal);

asAllOffBtn?.addEventListener('click', ()=>{
  asHoursGrid.querySelectorAll('.mrow').forEach(r=>{
    const t=r.querySelector('.switch'); const [s,e]=r.querySelectorAll('select.sel');
    t.checked=false; s.disabled=true; e.disabled=true;
  });
});
asAllStdBtn?.addEventListener('click', ()=>{
  asHoursGrid.querySelectorAll('.mrow').forEach(r=>{
    const key=r.dataset.key;
    const t=r.querySelector('.switch'); const [s,e]=r.querySelectorAll('select.sel');
    const bh = bizHours?.[key];
    if (bh && bh.enabled){
      t.checked=true; s.disabled=false; e.disabled=false;
      s.value=bh.start; e.value=bh.end;
      disableOptionsBefore(s, bh.start);
      if (toMin(e.value) <= toMin(s.value)) moveEndAfterStart(e, s.value);
    }else{
      t.checked=false; s.disabled=true; e.disabled=true;
    }
  });
});

addSave?.addEventListener('click', async ()=>{
  const name = (asName?.value || '').trim();
  let pos  = (asPos?.value  || 'Personel').trim();

  if(!name){ alert('Lütfen isim girin.'); return; }
  if (['sahip','owner','admin'].includes(pos.toLowerCase())) { pos = 'Berber'; }

  let ok = true;
  const newHours = {};
  asHoursGrid.querySelectorAll('.mrow').forEach(r=>{
    const key=r.dataset.key; const bh = bizHours?.[key];
    const t=r.querySelector('.switch'); const [s,e]=r.querySelectorAll('select.sel');
    let en = t.checked;

    if (bh){
      if (!bh.enabled){ en = false; }
      else if (en && toMin(s.value) < toMin(bh.start)){ s.value = bh.start; }
    }
    if (en && toMin(s.value) >= toMin(e.value)){
      if (!moveEndAfterStart(e, s.value)) ok = false;
    }
    newHours[key] = { enabled: en, start: s.value, end: e.value };
  });

  if(!ok){ alert('Bitiş saati başlangıçtan sonra olmalı.'); return; }

  const servicesInit = [];

  const payload = { name, role: pos, position: pos, hours: denormalizeHours(newHours), services: servicesInit };

  const nextRaw = [...staffRaw, payload];
  const newRawIndex = nextRaw.length - 1;
  staffRaw = nextRaw;

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(nextRaw);

  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": nextRaw,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": nextRaw,
        "step8.staff_hours": mapForTop,
        "staff_hours": mapForTop,
        updatedAt: serverTimestamp()
      }, { merge:true });
    }catch(e2){
      alert("Kaydedilemedi: " + (e2?.message || e2));
      return;
    }
  }

  const newStaff = { id: makeId(name, "", newRawIndex), name, isOwner:false, role: pos, position: pos, rawIndex: newRawIndex, hours: newHours, services: new Set(servicesInit) };
  staff.push(newStaff);
  currentId = newStaff.id;
  closeAddModal();
  renderStaffList();
  renderTabs();
  alert('Personel eklendi.');
});

/* ------------------------- DELETE STAFF (çoklu seçim) ------------------------- */
const delModal = $('#delStaffModal');
const btnRemoveSmall = $('#btnRemoveSmall');
const delList = $('#delStaffList');
const delClose = $('#delStaffClose');
const delCancel = $('#delStaffCancel');
const delConfirm = $('#delStaffConfirm');
const delSelectAll = $('#delSelectAll');

function updateDelConfirm(){ const any = delList?.querySelector('.del-check:not(:disabled):checked'); if (delConfirm) delConfirm.disabled = !any; }
function buildDelList(){
  if(!delList) return;
  delList.innerHTML = '';
  let deletableCount = 0;

  staff.forEach(s=>{
    if (s.rawIndex < 0) return;
    const isOwner = !!s.isOwner || ((s.role || s.position || '').toLowerCase() === 'sahip');
    const li = document.createElement('li');
    const id = `del-${s.id}`;
    li.className = 'del-item';
    li.innerHTML = `
      <label for="${id}" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" class="del-check" id="${id}" data-raw="${s.rawIndex}" ${isOwner ? 'disabled' : ''}>
        <span class="avatar small">${(s.name?.[0]||'?').toUpperCase()}</span>
        <span>${getDisplayName(s)}</span>
        <span class="muted" style="margin-left:auto">${isOwner ? 'Sahip (Admin)' : (s.role || s.position || 'Personel')}</span>
      </label>
    `;
    delList.appendChild(li);
    if(!isOwner) deletableCount++;
  });

  if (delSelectAll) delSelectAll.checked = false;
  updateDelConfirm();

  if (deletableCount === 0){
    const none = document.createElement('div');
    none.className='muted';
    none.style.marginTop='8px';
    none.textContent = 'Silinebilir personel bulunamadı.';
    delList.appendChild(none);
  }
}
function openDelModal(){ buildDelList(); delModal.style.display='flex'; }
function closeDelModal(){ delModal.style.display='none'; }

btnRemoveSmall?.addEventListener('click', openDelModal);
delClose?.addEventListener('click', closeDelModal);
delCancel?.addEventListener('click', closeDelModal);

delList?.addEventListener('change', (e)=>{ if(e.target?.classList.contains('del-check')) updateDelConfirm(); });
delSelectAll?.addEventListener('change', ()=>{
  const checks = delList.querySelectorAll('.del-check:not(:disabled)');
  checks.forEach(c => c.checked = delSelectAll.checked);
  updateDelConfirm();
});

delConfirm?.addEventListener('click', async ()=>{
  const selected = Array.from(delList.querySelectorAll('.del-check:checked'));
  if (selected.length === 0){ alert('Silmek için personel seçin.'); return; }

  const toDelete = new Set(selected.map(c => parseInt(c.dataset.raw)));
  const filtered = staffRaw.filter((_, idx) => !toDelete.has(idx));

  const mapForTop = buildTopStaffHoursMapFromStaffRaw(filtered);

  try{
    await updateDoc(doc(db,"adminOnboarding",UID), {
      "step8.staff": filtered,
      "step8.staff_hours": mapForTop,
      "staff_hours": mapForTop,
      updatedAt: serverTimestamp()
    });
  }catch(e){
    try{
      await setDoc(doc(db,"adminOnboarding",UID), {
        "step8.staff": filtered,
        "step8.staff_hours": mapForTop,
        "staff_hours": mapForTop,
        updatedAt: serverTimestamp()
      }, { merge:true });
    }catch(e2){
      alert("Silinemedi: " + (e2?.message || e2));
      return;
    }
  }

  staffRaw = filtered;
  let rebuilt = staffRaw.map((s,idx)=>({
    id: makeId(s.name, s.phone, idx),
    name: s.name || `Çalışan ${idx+1}`,
    isOwner: false,
    role: s.role || (s.position ? s.position : "Personel"),
    position: s.position || "",
    phone: s.phone || "",
    rawIndex: idx,
    hours: normalizeWithFallbackToBiz(s, bizHours),
    services: new Set(Array.isArray(s.services) ? s.services : (Array.isArray(s.assignedServices) ? s.assignedServices : [])),
  }));

  if (!rebuilt.some(s => s.isOwner)){
    rebuilt.unshift({ id: makeId(ADMIN_NAME, "", "0"), name: ADMIN_NAME, isOwner:true, role: "Sahip", rawIndex: -1, hours: bizHours || normalizeHours({}), services: new Set() });
  }

  const prevId = currentId;
  staff = rebuilt;
  if (!staff.some(s=>s.id===prevId)) currentId = staff[0]?.id || null;

  closeDelModal();
  renderStaffList();
  renderTabs();
  alert('Seçilen personel(ler) silindi.');
});

/* ------------------------- Business/Profile modal ------------------------- */
const bmOverlay = $('#bmOverlay');
const bmModal   = $('#bmModal');
const bmClose   = $('#bmClose');
const bmLogout  = $('#bmLogout');
function openBm(){ bmOverlay?.classList.add('show'); bmModal?.classList.add('show'); }
function closeBm(){ bmOverlay?.classList.remove('show'); bmModal?.classList.remove('show'); }
bmOverlay?.addEventListener('click',closeBm);
bmClose?.addEventListener('click',closeBm);
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeBm(); });
bmLogout?.addEventListener('click', async ()=>{ try{ await signOut(auth); }catch{} location.href='admin-register-login.html#login?return_to=staff.html'; });

/* ------------------------- AUTH → Firestore load ------------------------- */
setPersistence(auth, browserLocalPersistence).catch(()=>{});
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href='admin-register-login.html#login?return_to=staff.html'; return; }
  UID = user.uid;

  try{
    const rootRef = doc(db,"adminOnboarding",UID);
    const rootSnap = await getDoc(rootRef);
    let root = null;
    if(rootSnap.exists()) root = rootSnap.data();

    // Hizmetler
    servicesAll = extractServicesFromRoot(root || {});
    buildCategoryOptions();

    if(!rootSnap.exists()){
  ADMIN_NAME = "Admin";
  bizHours   = normalizeHours({}); // hepsi kapalı değil; EMPTY_DAY kullanıyor
  staffRaw   = [];
  staff = [{
    id: "admin",
    name: ADMIN_NAME,
    isOwner: true,
    role: "Sahip",
    rawIndex: -1,
    hours: bizHours,
    services: new Set()
  }];
  topStaffHoursMap = {};
  mountRail(); bindTabs(); bindServicesEvents(); renderStaffList(); renderTabs();
  return;
}


    // Admin adı
    ADMIN_NAME = (root?.step2?.adminName || root?.owner?.name || "Admin").trim();


    // Dükkan saatleri (kayıttan)
    bizHours = normalizeHours(root?.step6?.workingHours);

    // Staff (raw) — 8. adım
    staffRaw = Array.isArray(root?.step8?.staff) ? root.step8.staff : [];

    // Staff (UI obj) — saatler boşsa dükkan saatlerini varsayılan al
    staff = staffRaw.map((s,idx)=>({
      id: makeId(s.name, s.phone, idx),
      name: s.name || `Çalışan ${idx+1}`,
      isOwner: false,
      role: s.role || (s.position ? s.position : "Personel"),
      position: s.position || "",
      phone: s.phone || "",
      rawIndex: idx,
      hours: normalizeWithFallbackToBiz(s, bizHours),
      services: new Set(Array.isArray(s.services) ? s.services
                   : (Array.isArray(s.assignedServices) ? s.assignedServices : [])),
    }));

    // Owner’ı listeye ekle (adı görünsün, rol "Sahip (Admin)")
    if (!staff.some(s => (s.name||'').toLowerCase()===ADMIN_NAME.toLowerCase())){
      staff.unshift({
        id: makeId(ADMIN_NAME, "", "0"),
        name: ADMIN_NAME,
        isOwner: true,
        role: "Sahip",
        rawIndex: -1,
        hours: bizHours || normalizeHours({}),  // owner default: dükkan saatleri
        services: new Set()
      });
    }

    // Üst seviye staff_hours haritası (varsa) ile override
    topStaffHoursMap = root?.step8?.staff_hours || root?.step8?.staffHours
                    || root?.staff_hours       || root?.staffHours
                    || {};
    Object.entries(topStaffHoursMap).forEach(([name, hoursObj])=>{
      const who = findStaffByNameCI(staff, name);
      if(!who) return;
      const norm = normalizeHours(hoursObj);
      // sadece override et; yoksa bizHours zaten atanmış olacak
      if (norm) who.hours = norm;
    });

    currentId = staff[0]?.id || null;

    mountRail(); bindTabs(); bindServicesEvents(); renderStaffList(); renderTabs();
  }catch(e){
    console.warn("[auth load] hata:", e?.message || e);
    servicesAll = [];
    staffRaw = [];
    ADMIN_NAME = "Admin";
    bizHours = normalizeHours({});
    staff = [{ id:"admin", name:ADMIN_NAME, isOwner:true, role:"Sahip", rawIndex:-1, hours: bizHours, services:new Set() }];
    topStaffHoursMap = {};
    mountRail(); bindTabs(); bindServicesEvents(); renderStaffList(); renderTabs();
  }
});
