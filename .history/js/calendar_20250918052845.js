/* Gün + Hafta görünümü (v2.1)
   Firestore: adminOnboarding/{uid}
   - Owner adı: owner.name > step2.adminName > step2.ownerName > "Ben"
   - Personel: root staff[] ∪ step8.staff[] (owner hariç) → uniq
   - Çalışma saatleri: step6.workingHours (işletme geneli)
                       + (root staff[].workingHours || step8.staff[].workingHours)
   - bookings: businessId == UID
*/

import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc, getDoc,
  collection, query, where, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* =============== helpers =============== */
const DAY_TR = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const DAY_TR_SHORT = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const fmtTR  = new Intl.DateTimeFormat("tr-TR",{weekday:"short", day:"2-digit", month:"short"});
const dShort = new Intl.DateTimeFormat("tr-TR",{day:"2-digit", month:"short"});
const monthTR = (d)=> d.toLocaleString("tr-TR",{month:"long",year:"numeric"});
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const pad = (n)=>String(n).padStart(2,"0");

function cellH(){ const v=getComputedStyle(document.documentElement).getPropertyValue('--cellH')||""; const n=parseFloat(v); return Number.isFinite(n)&&n>0?n:64; }
function px(n){ const dpr=window.devicePixelRatio||1; return Math.round(n*dpr)/dpr; }
function floatToHM(f){ const h=Math.floor(f||0); const m=Math.round(((f||0)-h)*60); return `${pad(h)}:${pad(m)}`; }
function timeStrToFloat(s){ const [h,m]=String(s||"").split(":").map(Number); return (h||0)+((m||0)/60); }
function initials(n){ return (n||"?").split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("").toUpperCase(); }
function uniqueNames(names){ const seen=new Set(); const out=[]; for(const raw of names){ const name=(raw||"").trim(); if(!name) continue; const key=name.toLowerCase(); if(seen.has(key)) continue; seen.add(key); out.push(name); } return out; }

/* =============== state =============== */
let current=new Date();         // referans gün
let view="day";                 // "day" | "week"
let OWNER="Ben";
let STAFF=[];                   // [OWNER, ...çalışanlar]
let WORKING_HOURS={};           // işletme geneli
let STAFF_HOURS={};             // kişi bazlı saatler
let selectedStaff=[];           // filtre

/* RANDEVULAR */
let BOOKINGS=[]; let unsubBookings=null; let ADMIN_UID="";

/* =============== AUTH =============== */
onAuthStateChanged(auth, async (user)=>{
  if(!user){ location.replace("admin-register-login.html#login"); return; }
  ADMIN_UID=user.uid;
  await loadFromFirestore(user.uid);
  injectBookingStyles();
  boot();
  watchBookingsForCurrent();
});

/* =============== yardımcılar (owner algıla/tekilleştir) =============== */
function isOwnerRecord(s, ownerName){
  const role=(s?.role||s?.position||"").toLowerCase();
  const nm=(s?.name||"").trim().toLowerCase();
  const o=(ownerName||"").trim().toLowerCase();
  return role==="sahip"||role==="owner"||role==="admin"||nm===o;
}
function canonicalName(name, ownerName){
  const t=String(name||"").trim().toLowerCase();
  if(!t) return "";
  if(t==="admin"||t==="owner"||t==="sahip"||t===String(ownerName||"").trim().toLowerCase()){
    return ownerName;
  }
  return String(name||"").trim();
}

/* =============== LOAD DATA (güncellendi) =============== */
async function loadFromFirestore(uid){
  const snap=await getDoc(doc(db,"adminOnboarding",uid));
  if(!snap.exists()){ console.warn("adminOnboarding yok"); return; }

  const data=snap.data()||{};
  const s2=data.step2||{};
  const s6=data.step6||{};
  const s8=data.step8||{};

  // --- Owner adı (öncelik owner.name)
  OWNER = (data.owner?.name || s2.adminName || s2.ownerName || "Ben").trim();

  // --- İşletme çalışma saatleri
  WORKING_HOURS = (data.workingHours || s6.workingHours || {});

  // --- Personel kaynakları (root staff ∪ step8.staff)
  const rootStaff = Array.isArray(data.staff) ? data.staff : [];
  const step8Staff = Array.isArray(s8.staff) ? s8.staff : [];
  const combined = [...rootStaff, ...step8Staff];

  const staffArr = combined
    .filter(x => !isOwnerRecord(x, OWNER))
    .map(x => (typeof x?.name==="string" ? x.name.trim() : ""))
    .filter(Boolean);

  STAFF = uniqueNames([OWNER, ...staffArr]);
  if(STAFF.length===0) STAFF=[OWNER];
  selectedStaff=[...STAFF];

  // --- Personel bazlı saatler (her iki kaynaktan)
  STAFF_HOURS={};
  const collectHours=(arr)=>{
    (arr||[]).forEach(s=>{
      const nm=canonicalName(s?.name, OWNER);
      if(!nm) return;
      const h = s?.workingHours || s?.weeklyHours || s?.hours || {};
      if(h && typeof h==="object") STAFF_HOURS[nm]=h;
    });
  };
  collectHours(rootStaff);
  collectHours(step8Staff);

  // Üst seviye alternatif haritalar (varsa)
  const applyTopMap=(mapObj)=>{
    if(!mapObj||typeof mapObj!=="object") return;
    Object.keys(mapObj).forEach(k=>{
      const nm=canonicalName(k, OWNER); if(!nm) return;
      if(!STAFF.some(n=>n.toLowerCase()===nm.toLowerCase())){ STAFF.push(nm); selectedStaff.push(nm); }
      const h=mapObj[k]; if(h&&typeof h==="object") STAFF_HOURS[nm]=h;
    });
  };
  applyTopMap(data.staff_hours||data.staffHours);
  applyTopMap(s8.staff_hours||s8.staffHours);

  // seçim menüsünü yeniden kur
  buildStaffPopover();
}

/* =============== HOURS HELPERS =============== */
function hoursFor(name, d=current){
  const dayTR = DAY_TR[d.getDay()];
  const biz = WORKING_HOURS?.[dayTR] || {};
  const per = STAFF_HOURS?.[name]?.[dayTR] || {};
  const row = (typeof per.open==="boolean" || per.from || per.to) ? per : biz;

  let open=false;
  if(row.open===false) open=false;
  else if(row.open===true) open=true;
  else open=!!row.from && !!row.to;

  const start = row.from ? timeStrToFloat(row.from) : (biz.from ? timeStrToFloat(biz.from) : 9);
  const end   = row.to   ? timeStrToFloat(row.to)   : (biz.to   ? timeStrToFloat(biz.to)   : 20);

  return { open, start, end };
}

/* sabit günlük pencere 08:00–24:00 */
const VSTART=8, VEND=24;

function addOff(container, fromH, toH){
  const CH=cellH();
  const s=Math.max(fromH,VSTART);
  const e=Math.min(toH,VEND);
  if(e<=s) return;
  const band=document.createElement("div");
  band.className="offband";
  band.style.top=px((s-VSTART)*CH)+"px";
  band.style.height=px((e-s)*CH)+"px";
  container.appendChild(band);
}

/* =============== BOOKING yardımcıları =============== */
function injectBookingStyles(){
  if(document.getElementById("bk-style")) return;
  const css=`
    .staff-col{position:relative}
    .booking{position:absolute;left:6px;right:6px;background:#0ea5e9;color:#fff;border-radius:10px;padding:6px 8px;
             box-shadow:0 8px 18px rgba(0,0,0,.18);font-weight:800;font-size:14px;line-height:1.2}
    .booking .b-time{font-size:12px;font-weight:700;opacity:.95}
    .wk-chip{display:inline-block;margin:4px 4px 0 0;background:#0ea5e9;color:#fff;border-radius:999px;
             padding:6px 10px;font-weight:800;font-size:12px;box-shadow:0 6px 12px rgba(0,0,0,.15)}
  `;
  const el=document.createElement("style"); el.id="bk-style"; el.textContent=css; document.head.appendChild(el);
}
function dayStart(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0); }
function dayEnd(d){   return new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 0,0,0,0); }
function weekStart(d){ const s=new Date(d); s.setDate(s.getDate()-s.getDay()); return dayStart(s); }
function weekEnd(d){   const s=weekStart(d); const e=new Date(s); e.setDate(e.getDate()+7); return e; }
function fmtHM(date){ return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function bookingStaffName(b){ const raw=b.staffName||b.staff||b.assignedTo||OWNER; return canonicalName(raw, OWNER)||OWNER; }

/* canlı dinleme */
function watchBookingsForCurrent(){
  if(!ADMIN_UID) return;
  unsubBookings?.();

  const rangeStart=(view==="day")?dayStart(current):weekStart(current);
  const rangeEnd  =(view==="day")?dayEnd(current)  :weekEnd(current);

  const q=query(
    collection(db,"bookings"),
    where("businessId","==",ADMIN_UID),
    where("startAt",">=",Timestamp.fromDate(rangeStart)),
    where("startAt","<", Timestamp.fromDate(rangeEnd)),
    orderBy("startAt","asc")
  );
  unsubBookings = onSnapshot(q,(qs)=>{
    BOOKINGS = qs.docs.map(d=>({id:d.id, ...d.data()}));
    (view==="day") ? renderDay() : renderWeek();
  },(err)=>console.error("[bookings] watch error:",err));
}

/* =============== RENDER (DAY) =============== */
function renderDay(){
  $("#dayView").hidden=false; $("#weekView").hidden=true;

  $("#dateLabel").textContent=fmtTR.format(current);
  $("#dateRange").textContent="";

  const row=$("#staffRow"), grid=$("#dayGrid");
  row.innerHTML=""; grid.innerHTML="";

  const timeHead=document.createElement("div"); timeHead.className="time-head"; row.appendChild(timeHead);

  const CH=cellH(); const HOURS=VEND-VSTART; const colH=px(HOURS*CH)+"px";
  document.documentElement.style.setProperty("--calH", colH);

  const timeCol=document.createElement("div");
  timeCol.id="timeCol"; timeCol.className="time-col"; timeCol.style.height=colH;
  for(let h=VSTART; h<VEND; h++){
    const t=document.createElement("div");
    t.className="time-cell"; t.textContent=`${pad(h)}:00`; t.style.height=px(CH)+"px"; timeCol.appendChild(t);
  }
  grid.appendChild(timeCol);

  selectedStaff.forEach(name=>{
    const {open,start,end}=hoursFor(name,current);

    const h=document.createElement("div");
    h.className="staff-head"; h.dataset.head=name;
    h.innerHTML=`<div class="avatar">${initials(name)}</div>
                 <div class="meta"><div class="name">${name}</div>
                 <div class="sub">${ open ? `${floatToHM(start)}–${floatToHM(end)}` : "Kapalı" }</div></div>`;
    row.appendChild(h);

    const c=document.createElement("div");
    c.className="staff-col"; c.dataset.staff=name; c.style.height=colH;

    for(let hh=VSTART; hh<VEND; hh++){
      const cell=document.createElement("div");
      cell.className="hour-cell"; cell.style.height=px(CH)+"px"; c.appendChild(cell);
    }

    if(open){ addOff(c, VSTART, start); addOff(c, end, VEND); }
    else{ c.classList.add("closed"); const full=document.createElement("div"); full.className="offband"; full.style.top="0"; full.style.height=colH; c.appendChild(full); }

    grid.appendChild(c);
  });

  const vis=Math.max(2, selectedStaff.length);
  row.style.gridTemplateColumns  = `var(--timeW) repeat(${vis}, 1fr)`;
  grid.style.gridTemplateColumns = `var(--timeW) repeat(${vis}, 1fr)`;

  drawDayBookings();
}
function drawDayBookings(){
  const CH=cellH();
  const sDay=dayStart(current), eDay=dayEnd(current);

  BOOKINGS
    .filter(b=>{ const d=b.startAt instanceof Timestamp ? b.startAt.toDate() : new Date(b.startAt); return d>=sDay && d<eDay; })
    .forEach(b=>{
      const start=b.startAt.toDate();
      const end=b.endAt?.toDate?.() || new Date(start.getTime() + (b.totalMin||30)*60000);

      const stf=bookingStaffName(b);
      const col=$(`.staff-col[data-staff="${CSS.escape(stf)}"]`);
      if(!col) return;

      const sh=start.getHours()+start.getMinutes()/60;
      const eh=end.getHours()+end.getMinutes()/60;
      const top=(Math.max(sh,VSTART)-VSTART)*CH;
      const h=Math.max(14, (Math.min(eh,VEND)-Math.max(sh,VSTART))*CH - 6);

      const el=document.createElement("div");
      el.className="booking";
      const label=(b.items||[]).map(i=>i.name).join(", ") || "Randevu";
      el.innerHTML=`<div>${label}</div><div class="b-time">${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}</div>`;
      el.style.top=px(top)+"px"; el.style.height=px(h)+"px";
      col.appendChild(el);
    });
}

/* =============== RENDER (WEEK) =============== */
function startOfWeek(d){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate()-x.getDay()); return x; }
function endOfWeek(d){ const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); return e; }

function renderWeek(){
  $("#dayView").hidden=true; $("#weekView").hidden=false;

  const s=startOfWeek(current), e=endOfWeek(current);
  $("#dateLabel").textContent=`${dShort.format(s)} – ${dShort.format(e)}`;
  $("#dateRange").textContent="";

  const head=$("#wkHead"), grid=$("#wkGrid");
  head.innerHTML=""; grid.innerHTML="";

  const left=document.createElement("div");
  left.className="left"; left.textContent=""; head.appendChild(left);

  for(let i=0;i<7;i++){
    const d=new Date(s); d.setDate(s.getDate()+i);
    const btn=document.createElement("button");
    btn.className="wk-day-btn";
    btn.innerHTML=`<div class="date">${DAY_TR_SHORT[d.getDay()]} ${pad(d.getDate())}</div><div class="sub"> </div>`;
    btn.addEventListener("click",()=>{ current=new Date(d); setView("day"); });
    const day=document.createElement("div"); day.className="wk-day"; day.appendChild(btn); head.appendChild(day);
  }

  selectedStaff.forEach(name=>{
    const staffCell=document.createElement("div");
    staffCell.className="wk-staff";
    staffCell.innerHTML=`<div class="avatar">${initials(name)}</div><div>${name}</div>`;
    staffCell.dataset.staff=name; grid.appendChild(staffCell);

    for(let i=0;i<7;i++){
      const d=new Date(s); d.setDate(s.getDate()+i);
      const col=document.createElement("div"); col.className="wk-col";
      const inner=document.createElement("div"); inner.className="wk-col-inner";
      inner.dataset.staff=name; inner.dataset.date=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

      const {open}=hoursFor(name,d); if(!open){ inner.classList.add("closed"); }
      col.appendChild(inner); grid.appendChild(col);
    }
  });

  const wkView=$("#weekView");
  const headH=$("#wkHead").getBoundingClientRect().height||0;
  const rowH=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wkRowH'))||220;
  const visibleRows=2;
  wkView.style.maxHeight=px(headH+visibleRows*rowH+24)+"px";
  wkView.style.overflowY=(selectedStaff.length>visibleRows)?"auto":"visible";

  drawWeekBookings();
}
function drawWeekBookings(){
  const ws=weekStart(current), we=weekEnd(current);
  const cellMap={}; $$(".wk-col-inner").forEach(el=>{ cellMap[`${el.dataset.staff}__${el.dataset.date}`]=el; });

  BOOKINGS
    .filter(b=>{ const d=b.startAt.toDate(); return d>=ws && d<we; })
    .forEach(b=>{
      const start=b.startAt.toDate();
      const stf=bookingStaffName(b);
      const key=`${stf}__${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
      const cell=cellMap[key]; if(!cell) return;

      const label=(b.items||[]).map(i=>i.name).join(", ") || "Randevu";
      const chip=document.createElement("span"); chip.className="wk-chip";
      chip.textContent=`${fmtHM(start)} • ${label}`; cell.appendChild(chip);
    });
}

/* =============== VIEW SWITCH =============== */
function setView(next){
  view=next;
  $("#currentView").textContent=(view==="day"?"Gün":"Hafta");
  if(view==="day") renderDay(); else renderWeek();
  watchBookingsForCurrent();
}
(function bindViewSelect(){
  const chip=$("#viewChip"), pop=$("#viewPop");
  chip?.addEventListener("click",()=> pop.classList.toggle("open"));
  document.addEventListener("mousedown",(e)=>{ if(pop?.classList.contains("open") && !pop.contains(e.target) && !chip.contains(e.target)) pop.classList.remove("open"); });
  $$(".view-item").forEach(btn=>{
    btn.addEventListener("click",()=>{
      $$(".view-item").forEach(i=>i.classList.remove("selected"));
      btn.classList.add("selected");
      const v = btn.dataset.view==="Hafta" ? "week" : "day";
      setView(v); pop.classList.remove("open");
    });
  });
})();

/* =============== PERSONEL & KAYNAKLAR =============== */
function buildStaffPopover(){
  const wrap=$("#staffChkWrap"), btn=$("#staffBtn"), pop=$("#staffPop");
  if(!wrap||!btn||!pop) return;

  wrap.innerHTML=`
    <label class="chk"><input type="checkbox" id="allChk" checked><span>Tümünü seç</span></label>
    <div id="staffChkList"></div>
  `;
  const list=$("#staffChkList"); list.innerHTML="";
  STAFF.forEach(n=>{
    const id="st_"+n.replace(/\s+/g,"_");
    const row=document.createElement("label");
    row.className="chk";
    row.innerHTML=`<input type="checkbox" id="${id}" class="staffChk" data-name="${n}" ${selectedStaff.includes(n)?"checked":""}>
                   <span>${n}</span><span class="dot"></span>`;
    list.appendChild(row);
  });

  const all=$("#allChk");
  const boxes=()=>$$(".staffChk");
  const syncAll=()=>{ all.checked = boxes().every(b=>b.checked); };
  syncAll();

  all.addEventListener("change",()=>{ boxes().forEach(b=> b.checked=all.checked); });

  if(!btn.dataset.bound){
    btn.dataset.bound="1";
    btn.addEventListener("click",()=> pop.classList.toggle("open"));
    document.addEventListener("mousedown",(e)=>{ if(pop.classList.contains("open") && !pop.contains(e.target) && !btn.contains(e.target)) pop.classList.remove("open"); });
  }

  $("#applyStaff")?.addEventListener("click",()=>{
    const sel=boxes().filter(b=>b.checked).map(b=>b.dataset.name);
    selectedStaff = sel.length ? sel : [...STAFF];
    pop.classList.remove("open");
    (view==="day") ? renderDay() : renderWeek();
    watchBookingsForCurrent();
  });

  list.addEventListener("change", syncAll);
}

/* =============== DATE NAV =============== */
$("#prevDay")?.addEventListener("click",()=>{
  current.setDate(current.getDate() + (view==="week" ? -7 : -1));
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});
$("#nextDay")?.addEventListener("click",()=>{
  current.setDate(current.getDate() + (view==="week" ? 7 : 1));
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});

/* =============== TODAY =============== */
$("#todayBtn")?.addEventListener("click", ()=>{
  const now=new Date();
  current=new Date(now.getFullYear(), now.getMonth(), now.getDate());
  (view==="day") ? renderDay() : renderWeek();
  watchBookingsForCurrent();
});

/* =============== MINI CAL =============== */
const popCal=$("#calendarPopover");
const dateWrap=$("#dateLabelWrap");
let calCursor=new Date(current.getFullYear(), current.getMonth(), 1);
dateWrap?.addEventListener("click",()=>{
  const open=popCal.classList.toggle("open");
  dateWrap.setAttribute("aria-expanded", open);
  if(open){ calCursor=new Date(current.getFullYear(), current.getMonth(), 1); drawMini(calCursor); }
});
document.addEventListener("mousedown",(e)=>{ if(popCal?.classList.contains("open") && !popCal.contains(e.target) && !dateWrap.contains(e.target)){ popCal.classList.remove("open"); dateWrap.setAttribute("aria-expanded","false"); }});
$("#calPrev")?.addEventListener("click",(e)=>{ e.stopPropagation(); calCursor.setMonth(calCursor.getMonth()-1); drawMini(calCursor); });
$("#calNext")?.addEventListener("click",(e)=>{ e.stopPropagation(); calCursor.setMonth(calCursor.getMonth()+1); drawMini(calCursor); });

function drawMini(ref){
  const mini=$("#miniCal"); if(!mini) return;
  mini.innerHTML="";
  $("#calMonthLabel").textContent=monthTR(ref);
  const y=ref.getFullYear(), m=ref.getMonth();
  const start=new Date(y,m,1), end=new Date(y,m+1,0);
  const lead=start.getDay(), total=lead+end.getDate(), cells=Math.ceil(total/7)*7;
  const today=new Date(); today.setHours(0,0,0,0);

  for(let i=0;i<cells;i++){
    const day=i-lead+1; const cell=document.createElement("div"); cell.className="cell";
    if(day>0 && day<=end.getDate()){
      const d=new Date(y,m,day); const eq=d.toDateString()===current.toDateString();
      cell.textContent=day;
      if(today.toDateString()===d.toDateString()) cell.classList.add("today");
      if(eq) cell.classList.add("selected");
      cell.addEventListener("click",()=>{
        current=new Date(y,m,day);
        (view==="day") ? renderDay() : renderWeek();
        popCal.classList.remove("open"); dateWrap.setAttribute("aria-expanded","false");
        watchBookingsForCurrent();
      });
    }else cell.style.visibility="hidden";
    mini.appendChild(cell);
  }
}

/* =============== NOTIFY & LOGOUT =============== */
const notify=$("#notify"), backdrop=$("#backdrop");
$("#bellBtn")?.addEventListener("click",()=>{ notify.classList.add("open"); backdrop.classList.add("show"); });
$("#notifyClose")?.addEventListener("click",()=>{ notify.classList.remove("open"); backdrop.classList.remove("show"); });

$("#bmLogout")?.addEventListener("click", async ()=>{ try{ await signOut(auth);}catch{} location.href="index.html"; });

/* =============== BOOT =============== */
function boot(){
  current=new Date();
  setView("day");
  drawMini(new Date(current.getFullYear(), current.getMonth(), 1));
}
["resize","orientationchange"].forEach(ev=>{
  window.addEventListener(ev, ()=>{ (view==="day") ? renderDay() : renderWeek(); }, {passive:true});
});
