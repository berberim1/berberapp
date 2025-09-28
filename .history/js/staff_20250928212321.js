/* eslint-disable no-console */
/*
  [staff] v41.0 — owner (admin) first + robust selection + services render
  - Business hours: defaultHours (0..6 → {open:boolean, ranges:[{startMin,endMin}]})
  - UI hours: mon..sun → {enabled, start, end}
  - Staff: businesses/{businessId}/staff/{id}
      { name, role, position, phoneE164, active, showInCalendar, services: [id], hoursOverride: {0..6} }
  - Admin (owner) UI'da da listelenir (id: "__owner__"). Yoksa subcollection'da oluşturulur (upsert).
*/

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot,
  collection, addDoc, writeBatch, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ------------------------- Helpers + rail ------------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const pad = (n)=>String(n).padStart(2,"0");

async function upsert(ref, data){
  try{ await updateDoc(ref, data); }
  catch{ await setDoc(ref, data, { merge:true }); }
}

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
const EMPTY_DAY = { enabled:false, start:'10:00', end:'19:00' };

function* quarterSteps(){ for(let h=0;h<24;h++){ for(let m=0;m<60;m+=15){ yield `${pad(h)}:${pad(m)}`; } } }
const timeLabel = (t)=>t;
const toMin = (t)=>{ const [h,m]=String(t||'0:0').split(':').map(Number); return (h||0)*60+(m||0); };
function diffLabel(a,b){
  const [ah,am]=a.split(':').map(Number), [bh,bm]=b.split(':').map(Number);
  const mins=(bh*60+bm)-(ah*60+am); if(mins<=0) return '-';
  const h=Math.floor(mins/60), m=mins%60;
  return h?(m?`${h}sa ${m}dk`:`${h}sa`):`${m}dk`;
}

/* ------------------------- Canonical conversions: defaultHours ↔ UI ------------------------- */
const IDX_TO_KEY = {0:"sun",1:"mon",2:"tue",3:"wed",4:"thu",5:"fri",6:"sat"};
const KEY_TO_IDX = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};

function m2t(x){ const h = Math.floor((x||0)/60), m = (x||0)%60; return `${pad(h)}:${pad(m)}`; }
function t2m(t){ const [h=0,m=0] = String(t||"").split(":").map(n=>+n||0); return h*60+m; }

// defaultHours (0..6) -> UI {mon..sun}
function defaultHoursToUI(defaultHoursObj){
  const ui = {};
  Object.keys(KEY_TO_IDX).forEach(k=>{ ui[k] = { ...EMPTY_DAY }; });
  if (!defaultHoursObj || typeof defaultHoursObj !== "object") return ui;
  for (const k in defaultHoursObj){
    const dayData = defaultHoursObj[k];
    const idx = Number.isNaN(Number(k)) ? KEY_TO_IDX[k] : Number(k);
    const uiKey = IDX_TO_KEY[idx];
    if (!uiKey || !dayData) continue;
    if (!dayData.open || !Array.isArray(dayData.ranges) || !dayData.ranges.length){
      ui[uiKey] = { enabled:false, start:'10:00', end:'19:00' };
    } else {
      const r = dayData.ranges[0]; // UI tek aralık gösteriyor
      ui[uiKey] = { enabled:true, start: m2t(r.startMin), end: m2t(r.endMin) };
    }
  }
  return ui;
}

// UI {mon..sun} -> defaultHours (0..6) tek aralık
function uiToDefaultHours(ui){
  const out = {};
  Object.keys(KEY_TO_IDX).forEach((k) => {
    const idx = KEY_TO_IDX[k];
    const d = ui?.[k] || {};
    if (!d.enabled) out[idx] = { open:false, ranges:[] };
    else {
      const s = t2m(d.start || "10:00");
      const e = t2m(d.end   || "19:00");
      out[idx] = (e<=s) ? { open:false, ranges:[] } : { open:true, ranges:[{ startMin:s, endMin:e }] };
    }
  });
  return out;
}

// merge(defaultHours, hoursOverride) → effective defaultHours
function mergeEffective(defaultWeek, override){
  const out = JSON.parse(JSON.stringify(defaultWeek || {}));
  if (override && typeof override === "object"){
    Object.keys(override).forEach(k=>{
      const idx = Number(k);
      const o = override[k];
      if (!o) return;
      out[idx] = {
        open: (typeof o.open === "boolean") ? o.open : (out[idx]?.open ?? false),
        ranges: Array.isArray(o.ranges) ? o.ranges : (out[idx]?.ranges || [])
      };
    });
  }
  return out;
}

// staff UI hours (mon..sun) → hoursOverride (yalnız farklar)
function computeHoursOverride(defaultWeek, staffUi){
  const staffAsDefault = uiToDefaultHours(staffUi);
  const out = {};
  for (let i=0;i<=6;i++){
    const base = defaultWeek?.[i] || { open:false, ranges:[] };
    const mine = staffAsDefault?.[i] || { open:false, ranges:[] };
    if (JSON.stringify(base) !== JSON.stringify(mine)){
      out[i] = mine;
    }
  }
  return Object.keys(out).length ? out : null;
}

/* ------------------------- Phone helper ------------------------- */
function toE164TR(raw=""){
  const s = String(raw).trim();
  if (!s) return null;
  const already = s.replace(/\s+/g,"");
  if (/^\+90\d{10}$/.test(already)) return already;
  let digits = s.replace(/\D/g,"");
  if (digits.startsWith("90") && digits.length >= 12) digits = digits.slice(2);
  while (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `+90${digits}`;
}

/* ------------------------- State ------------------------- */
let UID = null;
let BUSINESS_ID = null;
let OWNER_UID = null;
let OWNER_NAME = "Admin";
const OWNER_DOC_ID = "__owner__";

let AO_REF = null;   // mirror (optional)
let BIZ_REF = null;  // canonical

let defaultWeek = {};           // businesses.defaultHours (0..6)
let bizHours = {};              // UI normalized {mon..sun}
let lastDefaultWeekJSON = null;

let servicesAll = [];
let serviceCategories = [];
let srvQuery = "";
let srvCat = "";
let srvTempAssigned = new Set();

let staffDocs = []; // [{id, data}]
let staff = [];     // UI model: {id, name, isOwner, role, phoneE164, hours(UI), services:Set, raw:{}}
let currentId = null;
let activeTab = 'services';

const AUTO_CLAMP = true;

/* ------------------------- Normalizers for UI // legacy-safe ------------------------- */
function normalizeDay(src){
  if (!src) return { ...EMPTY_DAY };
  const enabled =
    ('closed' in src) ? !src.closed :
    (typeof src.open === 'boolean') ? !!src.open :
    (src.enabled != null) ? !!src.enabled : true;
  const start = src.start || src.from || src.begin || src.startTime || src.open || '10:00';
  const end   = src.end   || src.to   || src.finish || src.endTime   || src.close || '19:00';
  return { enabled, start, end };
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
function denormalizeHours(model){ // TR keys for AO mirror
  const out={};
  DAYS.forEach(d=>{
    const m=model?.[d.key] || EMPTY_DAY;
    out[d.tr] = m.enabled ? { open:true, from:m.start, to:m.end } : { open:false };
  });
  return out;
}

/* ------------------------- Staff list rendering + selection ------------------------- */
function getDisplayName(s){ return s?.isOwner ? `${s.name} (Admin)` : (s?.name || '—'); }

function ensureSelection(){
  // Geçerli currentId varsa ve listede ise bırak
  if (currentId && staff.some(s=>s.id===currentId)) return;
  // Yoksa ilk elemanı (admin en üstte) seç
  if (staff[0]) currentId = staff[0].id;
}

function injectOwnerRowIfMissing(){
  // staffDocs içinde owner zaten varsa tekrar eklemeyelim
  const hasOwnerDoc = staffDocs.some(rec=>{
    const d = rec.data || {};
    return rec.id===OWNER_DOC_ID || rec.id===OWNER_UID || d.uid===OWNER_UID || (String(d.position||'').toLowerCase()==='sahip');
  });
  if (hasOwnerDoc) return;

  // owner için etkin saatler: işyeri varsayılanı
  const eff = defaultWeek || {};
  staffDocs.unshift({
    id: OWNER_DOC_ID,
    data: {
      uid: OWNER_UID,
      name: OWNER_NAME || "Admin",
      position: "Sahip",
      role: "Sahip",
      active: true,
      showInCalendar: true,
      hoursOverride: null, // defaultWeek kullan
      services: []
    }
  });
}

function rebuildStaffFromDocsPreserveSelection(){
  const keepId = currentId;

  // Admin satırını en üste garanti et
  injectOwnerRowIfMissing();

  // Map → UI modeli
  staff = staffDocs.map(rec=>{
    const data = rec.data || {};
    const myOverride = data.hoursOverride || null;
    const eff = mergeEffective(defaultWeek, myOverride);
    const norm = defaultHoursToUI(eff);

    const isOwner =
      rec.id === OWNER_DOC_ID ||
      rec.id === OWNER_UID ||
      (!!data.uid && OWNER_UID && data.uid === OWNER_UID) ||
      String(data.position||'').toLowerCase()==='sahip';

    return {
      id: rec.id,
      name: data.name || "Çalışan",
      isOwner,
      role: data.position || data.role || (isOwner ? 'Sahip' : 'Personel'),
      phoneE164: data.phoneE164 || null,
      hours: norm,
      services: new Set(Array.isArray(data.services) ? data.services : []),
      raw: data
    };
  });

  // Sıra: Önce admin, sonra ada göre
  staff.sort((a,b)=>{
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return (a.name||'').localeCompare(b.name||'', 'tr');
  });

  currentId = staff.some(s=>s.id===keepId) ? keepId : (staff[0]?.id || null);
  renderStaffList();
  renderTabs(); // içeride ensureSelection() çağrılıyor
}

function renderStaffList(){
  const ul = $('#staffList'); if(!ul) return;
  ul.innerHTML='';

  staff.forEach(s=>{
    const li=document.createElement('li');
    li.className='staff-item'; li.dataset.id=s.id;
    if(s.id===currentId) li.setAttribute('aria-current','true');
    const initial = (s.name?.[0] || '?').toUpperCase();
    const subRole = s.isOwner ? 'Sahip (Admin)' : (s.role || 'Personel');
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
  ul.scrollTop = 0;
}

function bindTabs(){
  $$('.tab').forEach(tb=>{
    tb.addEventListener('click',()=>{ activeTab=tb.dataset.tab; renderTabs(); });
  });
}
function currentStaff(){ return staff.find(s => s.id === currentId); }
function renderTabs(){
  ensureSelection();
  $$('.tab').forEach(tb=>tb.setAttribute('aria-selected', tb.dataset.tab===activeTab));
  $('#tab-services').hidden = activeTab!=='services';
  $('#tab-hours').hidden    = activeTab!=='hours';
  if(activeTab==='hours') renderStaffHoursView(); else renderServicesTab();
}

/* ------------------------- Services helpers ------------------------- */
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
  const dur = s?.min ?? s?.minutes ?? s?.duration ?? s?.time;
  return {
    id,
    name: s?.name || s?.title || `Hizmet ${idx+1}`,
    category: s?.category || s?.cat || "Genel",
    price: readNumberLike(s?.price ?? s?.amount),
    duration: readDurationMinutes(dur),
    active: (s?.active === undefined ? true : !!s?.active),
  };
}
function extractServicesFromBusiness(biz){
  const raw = Array.isArray(biz?.services) ? biz.services
            : (Array.isArray(biz?.catalog?.services) ? biz.catalog.services : []);
  return Array.isArray(raw) ? raw.map((s,i)=>normalizeService(s,i)) : [];
}
function extractServicesFromAO(root){
  const candidates = [root?.services, root?.step7?.services, root?.catalog?.services, root?.catalog].filter(Boolean);
  let rawList = [];
  for (const c of candidates){
    if (Array.isArray(c)) { rawList = c; break; }
    if (c && Array.isArray(c.services)) { rawList = c.services; break; }
  }
  return Array.isArray(rawList) ? rawList.map((s,i)=>normalizeService(s,i)) : [];
}

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
function formatPriceTry(v){ if (!Number.isFinite(v) || v<=0) return ''; return `₺${v.toFixed(0)}`; }
function formatDuration(v){ if (!Number.isFinite(v) || v<=0) return ''; return `${v} dk`; }

function renderServicesTab(){
  ensureSelection();
  const wrap = $('#tab-services'); if(!wrap) return;

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

  catEl?.addEventListener('change', ()=>{ srvCat = catEl.value || ''; renderServicesTab(); });

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
  cancelEl?.addEventListener('click', ()=>{ snapshotAssignedToTemp(); renderServicesTab(); });
}

async function saveServiceAssignments(){
  const who = currentStaff(); if (!who) return;
  const assigned = Array.from(srvTempAssigned);

  try{
    await upsert(doc(BIZ_REF, "staff", who.id), {
      // owner için de aynı path (id: "__owner__") yazılır; yoksa oluşur
      name: who.name,
      position: who.role,
      services: assigned,
      active: true,
      showInCalendar: true,
      updatedAt: serverTimestamp()
    });

    who.services = new Set(assigned);
    $('#srvAssignedCount') && ($('#srvAssignedCount').textContent = String(srvTempAssigned.size));

    // (Optional) AO mirror quick update
    try {
      const step8 = staff.map(s=>({
        name: s.name,
        role: s.role || "Personel",
        position: s.role || "Personel",
        hours: denormalizeHours(s.hours),
        services: Array.from(s.services || [])
      }));
      const topMap = {}; step8.forEach(x=>{ topMap[x.name]=x.hours; });
      await upsert(AO_REF, {
        "step8.staff": step8,
        "step8.staff_hours": topMap,
        "staff_hours": topMap,
        updatedAt: serverTimestamp()
      });
    } catch(e) { /* mirror best-effort */ }

    alert("Hizmet atamaları kaydedildi.");
  }catch(e2){
    alert("Kaydedilemedi: " + (e2?.message || e2));
  }
}

/* ------------------------- Business bounds helpers for modal ------------------------- */
function disableOptionsBefore(selectEl, minTime){
  const min = toMin(minTime);
  Array.from(selectEl.options).forEach(o=>{ o.disabled = toMin(o.value) < min; });
}
function disableOptionsAfter(selectEl, maxTime){
  const max = toMin(maxTime);
  Array.from(selectEl.options).forEach(o=>{ o.disabled = toMin(o.value) > max; });
}
function moveEndAfterStart(endSel, startVal){
  const smin = toMin(startVal);
  for (const o of Array.from(endSel.options)){
    if (toMin(o.value) > smin){ endSel.value = o.value; return true; }
  }
  return false;
}
function moveStartBeforeMax(startSel, maxTime){
  const max = toMin(maxTime);
  for (let i = startSel.options.length - 1; i >= 0; i--){
    const o = startSel.options[i];
    if (toMin(o.value) < max){ startSel.value = o.value; return true; }
  }
  return false;
}
function enforceBusinessBoundsForRow(row){
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
  disableOptionsAfter(endSel, bh.end);

  if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
  if (toMin(endSel.value)   > toMin(bh.end))   endSel.value   = bh.end;

  if (toMin(endSel.value) <= toMin(startSel.value)){
    if (!moveEndAfterStart(endSel, startSel.value)) {
      moveStartBeforeMax(startSel, bh.end);
      moveEndAfterStart(endSel, startSel.value);
    }
  }

  startSel.addEventListener('change', ()=>{
    if (toMin(startSel.value) < toMin(bh.start)) startSel.value = bh.start;
    if (toMin(startSel.value) >= toMin(bh.end))  moveStartBeforeMax(startSel, bh.end);
    if (toMin(endSel.value) <= toMin(startSel.value)) moveEndAfterStart(endSel, startSel.value);
  });
  endSel.addEventListener('change', ()=>{
    if (toMin(endSel.value) > toMin(bh.end)) endSel.value = bh.end;
    if (toMin(endSel.value) <= toMin(startSel.value)) moveEndAfterStart(endSel, startSel.value);
  });
}

/* ------------------------- UI: Çalışan saatleri ------------------------- */
function getCurrentStaff(){ return staff.find(s=>s.id===currentId); }
function renderStaffHoursView(){
  ensureSelection();
  const wrap = $('#tab-hours'); if(!wrap) return;
  const who = getCurrentStaff();
  wrap.innerHTML='';

  if (!who){ wrap.innerHTML='<div class="muted">Önce bir personel seçin.</div>'; return; }

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

    const startSel=buildSelect(st.start||'10:00');
    const endSel  =buildSelect(st.end  ||'19:00');
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener('change',()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    staffGrid.appendChild(row);

    enforceBusinessBoundsForRow(row);
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
      else if (en){
        if (toMin(s.value) < toMin(bh.start)) s.value = bh.start;
        if (toMin(e.value) > toMin(bh.end))   e.value = bh.end;
      }
    }
    if (en && toMin(s.value) >= toMin(e.value)){
      if (!moveEndAfterStart(e, s.value)) ok = false;
    }
    updated[key] = { enabled: en, start: s.value, end: e.value };
  });

  if (!ok) { alert("Çalışan için: Bitiş saati başlangıçtan sonra olmalı."); return; }

  try{
    const override = computeHoursOverride(defaultWeek, updated);
    await upsert(doc(BIZ_REF, "staff", who.id), {
      hoursOverride: override ?? null,
      name: who.name,
      position: who.role,
      active: true, showInCalendar: true,
      updatedAt: serverTimestamp()
    });

    who.hours = updated;

    // (Optional) AO mirror refresh
    try {
      const step8 = staff.map(s=>({
        name: s.name,
        role: s.role || "Personel",
        position: s.role || "Personel",
        hours: denormalizeHours(s.hours),
        services: Array.from(s.services || [])
      }));
      const topMap = {}; step8.forEach(x=>{ topMap[x.name]=x.hours; });
      await upsert(AO_REF, {
        "step8.staff": step8,
        "step8.staff_hours": topMap,
        "staff_hours": topMap,
        updatedAt: serverTimestamp()
      });
    } catch(e) {}

  }catch(e2){
    alert("Kaydedilemedi: " + (e2?.message || e2));
    return;
  }

  staffModal.style.display='none';
  renderStaffHoursView();
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
const asPhone = $('#asPhone');

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
    const b = bizHours?.[d.key] || EMPTY_DAY;
    def[d.key] = { enabled: !!b.enabled, start: b.start, end: b.end };
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

    const startSel=buildSelect(st.start||'10:00');
    const endSel  =buildSelect(st.end  ||'19:00');
    const setEnabled=en=>{ startSel.disabled=endSel.disabled=!en; };
    setEnabled(st.enabled); toggle.addEventListener('change',()=>setEnabled(toggle.checked));

    row.appendChild(name); row.appendChild(toggleWrap); row.appendChild(startSel); row.appendChild(endSel);
    asHoursGrid.appendChild(row);

    enforceBusinessBoundsForRow(row);
  });
}
function openAddModal(){
  if(asName) asName.value = '';
  if(asPos)  asPos.value  = 'Berber';
  if(asDesc) asDesc.value = '';
  if(asPhone) asPhone.value = '';
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
      disableOptionsAfter(e,   bh.end);
      if (toMin(e.value) <= toMin(s.value)) moveEndAfterStart(e, s.value);
    }else{
      t.checked=false; s.disabled=true; e.disabled=true;
    }
  });
});

addSave?.addEventListener('click', async ()=>{
  const name = (asName?.value || '').trim();
  let pos  = (asPos?.value  || 'Personel').trim();
  const phoneE164 = toE164TR((asPhone?.value || '').trim());

  if(!name){ alert('Lütfen isim girin.'); return; }
  if (['sahip','owner','admin'].includes((pos||'').toLowerCase())) { pos = 'Berber'; }

  let ok = true;
  const newHours = {};
  asHoursGrid.querySelectorAll('.mrow').forEach(r=>{
    const key=r.dataset.key; const bh = bizHours?.[key];
    const t=r.querySelector('.switch'); const [s,e]=r.querySelectorAll('select.sel');
    let en = t.checked;

    if (bh){
      if (!bh.enabled){ en = false; }
      else if (en){
        if (toMin(s.value) < toMin(bh.start)) s.value = bh.start;
        if (toMin(e.value) > toMin(bh.end))   e.value = bh.end;
      }
    }
    if (en && toMin(s.value) >= toMin(e.value)){
      if (!moveEndAfterStart(e, s.value)) ok = false;
    }
    newHours[key] = { enabled: en, start: s.value, end: e.value };
  });

  if(!ok){ alert('Bitiş saati başlangıçtan sonra olmalı.'); return; }

  const override = computeHoursOverride(defaultWeek, newHours);

  try{
    await addDoc(collection(BIZ_REF, "staff"), {
      name, role: pos, position: pos,
      phoneE164: phoneE164 || null,
      active: true, showInCalendar: true,
      services: [],
      hoursOverride: override ?? null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
  }catch(e2){
    alert("Kaydedilemedi: " + (e2?.message || e2));
    return;
  }

  closeAddModal();
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
    const isOwner = !!s.isOwner;
    const li = document.createElement('li');
    const id = `del-${s.id}`;
    li.className = 'del-item';
    li.innerHTML = `
      <label for="${id}" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" class="del-check" id="${id}" data-doc="${s.id}" ${isOwner ? 'disabled' : ''}>
        <span class="avatar small">${(s.name?.[0]||'?').toUpperCase()}</span>
        <span>${getDisplayName(s)}</span>
        <span class="muted" style="margin-left:auto">${isOwner ? 'Sahip (Admin)' : (s.role || 'Personel')}</span>
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

  const ids = selected.map(c => c.dataset.doc);
  try{
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(BIZ_REF, "staff", id)));
    await batch.commit();
  }catch(e2){
    alert("Silinemedi: " + (e2?.message || e2));
    return;
  }

  closeDelModal();
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

/* ------------------------- CLAMP: dükkan saati değişince tüm personel ------------------------- */
function clampHoursModelToBiz(model, bh){
  const summary = [];
  const out = JSON.parse(JSON.stringify(model || {}));

  DAYS.forEach(d=>{
    const m = out[d.key] || { ...EMPTY_DAY };
    const b = bh?.[d.key] || { enabled:false, start:'10:00', end:'19:00' };

    if (!b.enabled){
      if (m.enabled){
        summary.push(`${d.tr}: dükkan kapalı → personel kapatıldı`);
        m.enabled = false;
      }
      out[d.key] = m;
      return;
    }

    if (!m.enabled){
      out[d.key] = m;
      return;
    }

    let oldStart = m.start, oldEnd = m.end;
    if (toMin(m.start) < toMin(b.start)) m.start = b.start;
    if (toMin(m.end)   > toMin(b.end))   m.end   = b.end;
    if (toMin(m.end) <= toMin(m.start)){
      m.start = b.start;
      m.end   = b.end;
    }

    if (oldStart !== m.start || oldEnd !== m.end){
      const parts = [];
      if (oldStart !== m.start) parts.push(`başlangıç ${oldStart}→${m.start}`);
      if (oldEnd   !== m.end)   parts.push(`bitiş ${oldEnd}→${m.end}`);
      summary.push(`${d.tr}: ${parts.join(', ')}`);
    }
    out[d.key] = m;
  });

  return { model: out, summary };
}

async function clampAllStaffToBusinessHours(newBH){
  const batch = writeBatch(db);
  let anyChange = false;
  const messages = [];

  staff.forEach(s=>{
    const { model: clamped, summary } = clampHoursModelToBiz(s.hours, newBH);
    if (summary.length){
      anyChange = true;
      messages.push(`- ${s.name}: ${summary.join(' • ')}`);
    }
    const override = computeHoursOverride(defaultWeek, clamped);
    batch.set(doc(BIZ_REF,"staff",s.id), { hoursOverride: override ?? null, updatedAt: serverTimestamp() }, { merge:true });
  });

  if (!anyChange){
    await batch.commit().catch(()=>{});
    return;
  }

  try{
    await batch.commit();
  }catch(e){ console.warn("[clamp] yazılamadı:", e?.message||e); }

  alert(
    "Dükkan saatlerindeki değişiklik nedeniyle bazı personel vardiyaları otomatik güncellendi:\n\n" +
    messages.join("\n") +
    "\n\nNot: Personel saatleri hiçbir zaman dükkan saatlerinin dışına taşamaz."
  );
}

/* ------------------------- AUTH → resolve businessId + load + realtime ------------------------- */
setPersistence(auth, browserLocalPersistence).catch(()=>{});

onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.href='admin-register-login.html#login?return_to=staff.html'; return; }
  UID = user.uid;

  // businessId resolve: roles → AO.businessId → UID
  AO_REF  = doc(db,"adminOnboarding",UID);
  let bid = null;
  try{
    const roleSnap = await getDoc(doc(db,"roles",UID));
    if (roleSnap.exists()) bid = roleSnap.data()?.businessId || null;
  }catch{}
  if (!bid){
    try{ const ao = await getDoc(AO_REF); if (ao.exists()) bid = ao.data()?.businessId || null; }catch{}
  }
  BUSINESS_ID = bid || UID;

  BIZ_REF = doc(db,"businesses",BUSINESS_ID);

  try{
    const [bizSnap, aoSnap] = await Promise.all([getDoc(BIZ_REF), getDoc(AO_REF)]);
    const biz = bizSnap.exists() ? bizSnap.data() : {};
    const root = aoSnap.exists() ? aoSnap.data() : {};

    OWNER_UID  = biz?.ownerUid || UID;
    OWNER_NAME = (biz?.owner?.name || root?.owner?.name || root?.step2?.adminName || "Admin").trim();

    // services
    servicesAll = extractServicesFromBusiness(biz);
    if (servicesAll.length === 0) servicesAll = extractServicesFromAO(root);
    buildCategoryOptions();

    // defaultHours → UI
    defaultWeek = biz?.defaultHours || {};
    bizHours = defaultHoursToUI(defaultWeek);
    lastDefaultWeekJSON = JSON.stringify(defaultWeek||{});

    // realtime: business (defaultHours + services)
    onSnapshot(BIZ_REF, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      // services
      const newServices = extractServicesFromBusiness(data);
      if (JSON.stringify(newServices) !== JSON.stringify(servicesAll)){
        servicesAll = newServices;
        if (activeTab==='services') renderServicesTab();
      }
      // defaultHours
      const def = data.defaultHours || {};
      const j = JSON.stringify(def||{});
      if (j !== lastDefaultWeekJSON){
        lastDefaultWeekJSON = j;
        defaultWeek = def;
        const newBH = defaultHoursToUI(defaultWeek);
        if (AUTO_CLAMP){
          bizHours = newBH;
          clampAllStaffToBusinessHours(newBH);
        } else {
          bizHours = newBH;
          rebuildStaffFromDocsPreserveSelection();
        }
      }
    });

    // realtime: staff subcollection
    onSnapshot(collection(BIZ_REF,"staff"), (qs) => {
      staffDocs = [];
      qs.forEach(d=> staffDocs.push({ id:d.id, data:d.data() || {} }));
      rebuildStaffFromDocsPreserveSelection();
    });

    // UI
    mountRail();
    bindTabs();
    bindServicesEvents();
    rebuildStaffFromDocsPreserveSelection(); // admin injection + first select

  }catch(e){
    console.warn("[auth load] hata:", e?.message || e);
    // Varsayılan boş UI
    servicesAll = [];
    defaultWeek = {};
    bizHours   = defaultHoursToUI(defaultWeek);
    staffDocs = [];
    staff = [];
    mountRail(); bindTabs(); bindServicesEvents(); renderStaffList(); renderTabs();
  }
});
// staff.js — renderStaffList() FONKSİYONUNU bununla değiştir
function renderStaffList(){
  const ul = $('#staffList');           // Tek listeyi kullanıyoruz
  const ownerUl = $('#ownerList');      // Varsa görünmez yapacağız
  if (!ul) return;

  // ownerList varsa boşaltıp gizle (tek liste kullanacağız)
  if (ownerUl){
    ownerUl.innerHTML = '';
    ownerUl.style.display = 'none';
  }

  ul.innerHTML = '';

  // NOT: rebuildStaffFromDocsPreserveSelection() zaten admini en üste gelecek şekilde sort ediyor
  staff.forEach(s => {
    const li = document.createElement('li');
    li.className = 'staff-item';
    li.dataset.id = s.id;
    if (s.id === currentId) li.setAttribute('aria-current','true');

    const initial = (s.name?.[0] || '?').toUpperCase();
    const subRole = s.isOwner ? 'Sahip (Admin)' : (s.role || 'Personel');

    li.innerHTML = `
      <div class="avatar">${initial}</div>
      <div>
        <div>${getDisplayName(s)}</div>
        <div class="role">${subRole}</div>
      </div>
    `;

    li.addEventListener('click', () => {
      currentId = s.id;
      $('#panelTitle').textContent = getDisplayName(s);
      $('#staffName').textContent  = getDisplayName(s);
      $('#srvStaffName') && ($('#srvStaffName').textContent = getDisplayName(s));
      snapshotAssignedToTemp();
      renderTabs();
      renderStaffList();
    });

    ul.appendChild(li);
  });

  ul.scrollTop = 0;
}
