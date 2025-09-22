/* =========================================================
   İSTATİSTİKLER & RAPORLAR – Firebase Auth + Firestore
   - İndeks gerektirmeyen sorgu (orderBy client-side)
   - Tüm sayfa TR/TL ve canlı veriyle dolar
   ========================================================= */
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ---------- Yardımcılar ---------- */
const money = (n) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })
    .format(Number(n || 0));

const aylar = ["OCA","ŞUB","MAR","NİS","MAY","HAZ","TEM","AĞU","EYL","EKİ","KAS","ARA"];
const ayAbbrDisp = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const ayFullTR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

const pad2 = (n)=> String(n).padStart(2,"0");
const yyyymm = (y,m0)=> `${y}-${pad2(m0+1)}`;
const minuteFromMeta = (meta)=>{
  const m = String(meta||"").match(/(\d+)\s*dk/i);
  return m ? Number(m[1]) : 0;
};
const fmtMinutes = (mins)=>{
  const h = Math.floor(mins/60), m = mins%60;
  return `${h}s ${m}dk`;
};
const degrade = (ctx, rgba)=>{
  const g = ctx.createLinearGradient(0,0,0,180);
  g.addColorStop(0, rgba); g.addColorStop(1, "rgba(0,0,0,0)");
  return g;
};

/* ---------- Global ---------- */
let UID = null;
let SELECTED = { year: new Date().getFullYear(), month: new Date().getMonth() };
const charts = { appointmentsChart:null, appChart2:null, revenueChart:null, revenueChartPage:null };

/* =========================================================
   AUTH
   ========================================================= */
setPersistence(auth, browserLocalPersistence).catch(()=>{});
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    const ret = encodeURIComponent("stats-and-reports.html");
    location.href = `admin-register-login.html#login?return_to=${ret}`;
    return;
  }
  UID = user.uid;
  syncMonthBtn();
  await reloadAll();

  // Profil/Çıkış
  const overlay = document.getElementById("bmOverlay");
  const modal   = document.getElementById("bmModal");
  const avatar  = document.querySelector(".rail__bottom .avatar-btn");
  const closeBtn= document.getElementById("bmClose");
  const logout  = document.getElementById("bmLogout");
  const openBm = ()=>{ overlay.classList.add("show"); modal.classList.add("show"); };
  const closeBm= ()=>{ overlay.classList.remove("show"); modal.classList.remove("show"); };
  avatar?.addEventListener("click", openBm);
  overlay?.addEventListener("click", closeBm);
  closeBtn?.addEventListener("click", closeBm);
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeBm(); });
  logout?.addEventListener("click", async ()=>{
    try{ await signOut(auth);}catch{}
    location.href = `admin-register-login.html#login?return_to=${encodeURIComponent("stats-and-reports.html")}`;
  });
});

/* =========================================================
   Firestore – Sorgular
   (orderBy çıkartıldı → indeks gerekmez; client-side sort)
   ========================================================= */
async function getSalesByMonth(year, month0){
  const mk = yyyymm(year, month0);          // "2025-09"
  const col = collection(db, "adminOnboarding", UID, "sales");
  const snap = await getDocs(query(col, where("monthKey","==", mk)));
  const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  // Tarihe göre yeni → eski
  list.sort((a,b)=>{
    const da = new Date(a.createdAt?.toDate?.() || a.createdAtLocalISO || 0).getTime();
    const db_ = new Date(b.createdAt?.toDate?.() || b.createdAtLocalISO || 0).getTime();
    return db_ - da;
  });
  return list;
}

async function getYearMonthlyTotals(year){
  // 12 çağrıyı paralel çalıştır
  const promises = Array.from({length:12},(_,m)=> getSalesByMonth(year, m));
  const months = await Promise.all(promises);
  const totals = months.map(sales => sales.reduce((s,r)=> s + Number(r.total||0), 0));
  const counts = months.map(sales => sales.length);
  return { totals, counts };
}

/* =========================================================
   Hesaplamalar
   ========================================================= */
function summarizeMonth(sales){
  const totalRevenue = sales.reduce((s,r)=> s + Number(r.total||0), 0);
  const totalAppointments = sales.length;
  const serviceMap = new Map(); // title → {count, amount, minutes}
  const staffMap   = new Map(); // staff → {count, amount, minutes}
  let totalMinutes = 0;

  sales.forEach(s=>{
    const items = Array.isArray(s.items) ? s.items : [];
    items.forEach(it=>{
      const title = (it.title||"—").toString();
      const price = Number(it.price||0);
      const minutes = minuteFromMeta(it.meta);
      totalMinutes += minutes;

      if(!serviceMap.has(title)) serviceMap.set(title,{count:0, amount:0, minutes:0});
      const sv = serviceMap.get(title); sv.count++; sv.amount+=price; sv.minutes+=minutes;

      const staff = (it.staff||"—").toString() || "—";
      if(!staffMap.has(staff)) staffMap.set(staff,{count:0, amount:0, minutes:0});
      const sm = staffMap.get(staff); sm.count++; sm.amount+=price; sm.minutes+=minutes;
    });
  });

  return { totalRevenue, totalAppointments, totalMinutes, serviceMap, staffMap };
}

/* =========================================================
   Grafikler (Chart.js)
   ========================================================= */
function buildAppointmentsChart(canvasId, counts){
  const el = document.getElementById(canvasId); if(!el) return;
  const ctx = el.getContext("2d");
  const grad = degrade(ctx, "rgba(34,197,94,.22)");

  const now = new Date();
  const mNow = (now.getFullYear()===SELECTED.year) ? now.getMonth() : 11;
  const real = counts.map((v,i)=> i<=mNow ? v : null);
  const forecast = new Array(12).fill(null);
  const avg = (()=>{ const arr=counts.filter(v=>v>0); return arr.length? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; })();
  for(let i=mNow+1;i<12;i++) forecast[i]=avg;

  const cfg = {
    type:"line",
    data:{
      labels:aylar,
      datasets:[
        { label:"Randevu", data:real, spanGaps:true, borderColor:"#22c55e", backgroundColor:grad, fill:true, pointRadius:3, tension:.35 },
        { label:"Tahmin", data:forecast, spanGaps:true, borderColor:"#22c55e", backgroundColor:"rgba(34,197,94,.12)", fill:true, borderDash:[6,6], pointRadius:0, tension:.35 }
      ]
    },
    options:{
      maintainAspectRatio:true,
      plugins:{ legend:{display:false}, tooltip:{ mode:"index", intersect:false, callbacks:{ label:(c)=> `${c.dataset.label}: ${Math.round(c.parsed.y)}` } } },
      scales:{ x:{ grid:{display:false}, ticks:{color:"#9aa3b2"} }, y:{ grid:{color:"#eef1f5"}, ticks:{stepSize:1, callback:(v)=>Number.isInteger(v)?v:""}, beginAtZero:true } }
    }
  };

  if(charts[canvasId]){ charts[canvasId].data=cfg.data; charts[canvasId].options=cfg.options; charts[canvasId].update(); }
  else { charts[canvasId] = new Chart(ctx, cfg); }
}

function buildRevenueChart(canvasId, totals){
  const el = document.getElementById(canvasId); if(!el) return;
  const ctx = el.getContext("2d");
  const grad = degrade(ctx, "rgba(59,130,246,.22)");

  const now = new Date();
  const mNow = (now.getFullYear()===SELECTED.year) ? now.getMonth() : 11;
  const real = totals.map((v,i)=> i<=mNow ? v : null);
  const forecast = new Array(12).fill(null);
  const avg = (()=>{ const arr=totals.filter(v=>v>0); return arr.length? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; })();
  for(let i=mNow+1;i<12;i++) forecast[i]=avg;

  const cfg = {
    type:"line",
    data:{
      labels:aylar,
      datasets:[
        { label:"Gerçek", data:real, spanGaps:true, borderColor:"#3b82f6", backgroundColor:grad, fill:true, pointRadius:3, tension:.35 },
        { label:"Tahmin", data:forecast, spanGaps:true, borderColor:"#3b82f6", backgroundColor:"rgba(59,130,246,.12)", fill:true, borderDash:[6,6], pointRadius:0, tension:.35 }
      ]
    },
    options:{
      maintainAspectRatio:true,
      interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ title:(it)=> aylar[it[0].dataIndex], label:(c)=> c.parsed.y==null?null:`${c.dataset.label}: ${money(c.parsed.y)}` } } },
      scales:{ x:{ grid:{display:false}, ticks:{color:"#9aa3b2"} }, y:{ grid:{color:"#eef1f5"}, ticks:{display:false}, beginAtZero:true } }
    }
  };

  if(charts[canvasId]){ charts[canvasId].data=cfg.data; charts[canvasId].options=cfg.options; charts[canvasId].update(); }
  else { charts[canvasId] = new Chart(ctx, cfg); }
}

/* =========================================================
   UI – Sekmeler & Ay seçici
   ========================================================= */
const tabLinks = [...document.querySelectorAll('.tabs .tab[data-tab]')];
function setTab(name){
  ["dashboard","appointments","revenue","staff"].forEach(id=>{
    const sec = document.getElementById(id);
    if(sec) sec.hidden = (id!==name);
  });
  tabLinks.forEach(a=> a.setAttribute("aria-selected", a.dataset.tab===name));
  if((location.hash||"")!=="#"+name) history.replaceState(null,"","#"+name);
}
window.addEventListener("hashchange", ()=>{
  const n = (location.hash||"#dashboard").slice(1);
  setTab(["dashboard","appointments","revenue","staff"].includes(n)?n:"dashboard");
});
setTab((location.hash||"#dashboard").slice(1));

const monthBtn   = document.getElementById("monthBtn");
const prevBtn    = document.getElementById("prevBtn");
const nextBtn    = document.getElementById("nextBtn");
const overlay    = document.getElementById("monthOverlay");
const yearPrev   = document.getElementById("yearPrev");
const yearNext   = document.getElementById("yearNext");
const monthTitle = document.getElementById("monthTitle");
const monthGrid  = document.getElementById("monthGrid");
const monthOk    = document.getElementById("monthOk");
const monthClear = document.getElementById("monthClear");

function syncMonthBtn(){ monthBtn.innerHTML = `<b>${ayAbbrDisp[SELECTED.month]} ${SELECTED.year}</b>`; }
function renderMonthGrid(y=SELECTED.year, active=SELECTED.month){
  monthTitle.textContent = y;
  monthGrid.innerHTML = "";
  ayFullTR.forEach((label,i)=>{
    const d = document.createElement("div");
    d.className = "m-month"+(i===active?" active":"");
    d.textContent = label;
    d.addEventListener("click",()=>{ renderMonthGrid(y,i); monthGrid.dataset.selected=i; });
    monthGrid.appendChild(d);
  });
  monthGrid.dataset.year = y;
  monthGrid.dataset.selected = active;
}
function openMonth(){ renderMonthGrid(); overlay.hidden=false; }
function closeMonth(){ overlay.hidden=true; }

monthBtn.addEventListener("click", openMonth);
overlay.addEventListener("click", (e)=>{ if(e.target===overlay) closeMonth(); });
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && !overlay.hidden) closeMonth(); });
yearPrev.addEventListener("click", ()=>{ renderMonthGrid( (Number(monthGrid.dataset.year)||SELECTED.year)-1, Number(monthGrid.dataset.selected)||0 ); });
yearNext.addEventListener("click", ()=>{ renderMonthGrid( (Number(monthGrid.dataset.year)||SELECTED.year)+1, Number(monthGrid.dataset.selected)||0 ); });
monthClear.addEventListener("click", ()=>{ const now=new Date(); renderMonthGrid(now.getFullYear(), now.getMonth()); });
monthOk.addEventListener("click", async ()=>{
  SELECTED.year  = Number(monthGrid.dataset.year) || SELECTED.year;
  SELECTED.month = Number(monthGrid.dataset.selected) || SELECTED.month;
  syncMonthBtn(); closeMonth(); await reloadAll();
});
function shiftMonth(delta){
  let y=SELECTED.year, m=SELECTED.month+delta;
  if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
  SELECTED={year:y, month:m}; syncMonthBtn(); reloadAll();
}
prevBtn.addEventListener("click", ()=>shiftMonth(-1));
nextBtn.addEventListener("click", ()=>shiftMonth(1));

/* =========================================================
   İçerik Geçişleri (Appointments & Revenue alt sayfaları)
   ========================================================= */
// Appointments → aside’daki linkler
document.querySelectorAll('#appointments aside .row[data-goto]').forEach(row=>{
  row.addEventListener('click', ()=>{
    const target = row.dataset.goto; // "app-summary" | "app-list"
    showAppointmentsSub(target);
  });
});
document.getElementById('back-from-summary')?.addEventListener('click', ()=>showAppointmentsSub('app-main'));
document.getElementById('back-from-list')?.addEventListener('click', ()=>showAppointmentsSub('app-main'));

function showAppointmentsSub(id){
  ['app-main','app-summary','app-list'].forEach(secId=>{
    const el = document.getElementById(secId);
    if(el) el.hidden = (secId!==id);
  });
  // grafikleri yeniden boyutlandır (mobil döndürme/alt görünüm)
  triggerChartsResize();
}

// Revenue → "Hizmete göre satışlar"
document.getElementById('go-sales-by-services')?.addEventListener('click', ()=>{
  showRevenueSub('rev-services');
});
document.getElementById('back-from-rev-services')?.addEventListener('click', ()=>{
  showRevenueSub('rev-main');
});
function showRevenueSub(id){
  ['rev-main','rev-services'].forEach(secId=>{
    const el = document.getElementById(secId);
    if(el) el.hidden = (secId!==id);
  });
  triggerChartsResize();
}

/* =========================================================
   DOM’a veri basma
   ========================================================= */
function fillDashboardKPIs(sum){
  // #dashboard içindeki 3 KPI kutusu (Randevu, Rezerve süre, Tamamlanan)
  const kpis = document.querySelectorAll('#dashboard .kpis .kpi span');
  if(kpis.length>=3){
    kpis[0].textContent = String(sum.totalAppointments);     // Randevu
    kpis[1].textContent = fmtMinutes(sum.totalMinutes);      // Rezerve süre
    kpis[2].textContent = String(sum.totalAppointments);     // Tamamlanan (şimdilik = toplam)
  }
}

function fillDashboardSide(sum){
  // Sağ "Randevular" kutusu
  const rRows = document.querySelectorAll("#dashboard aside .mini:nth-of-type(1) .row b");
  if(rRows.length>=3){
    rRows[0].textContent = String(sum.totalAppointments); // Tamamlanan
    rRows[1].textContent = "0"; // Gel(e)meyen
    rRows[2].textContent = "0"; // İptal
  }
  // Sağ "Gelir" kutusu (hizmetler, bahşiş, ürünler, üyelikler, toplam)
  const gRows = document.querySelectorAll("#dashboard aside .mini:nth-of-type(2) .row b");
  if(gRows.length>=5){
    gRows[0].textContent = money(sum.totalRevenue); // Hizmetler
    gRows[1].textContent = money(0);                // Bahşiş (veri yoksa 0)
    gRows[2].textContent = money(0);                // Ürünler
    gRows[3].textContent = money(0);                // Üyelikler
    gRows[4].textContent = money(sum.totalRevenue); // Toplam
  }
}

function fillAppointmentsTables(serviceMap, totalAppointments){
  // Özet tablo (durum) – tabloyu baştan yaz
  const wrap = document.querySelector("#appointments #app-main .table tbody");
  if(wrap){
    wrap.innerHTML = `
      <tr><td><span class="dot d-gray"></span>Tamamlanmamış</td><td>0</td><td>%0</td><td>${money(0)}</td></tr>
      <tr><td><span class="dot d-green"></span>Tamamlanan</td><td>${totalAppointments}</td><td>%100</td><td>${money([...serviceMap.values()].reduce((s,v)=>s+v.amount,0))}</td></tr>
      <tr><td><span class="dot d-yellow"></span>Gel(e)meyen</td><td>0</td><td>%0</td><td>${money(0)}</td></tr>
      <tr><td><span class="dot d-red"></span>İptal</td><td>0</td><td>%0</td><td>${money(0)}</td></tr>
    `;
  }
  // İlk 10 hizmet
  const topBody = document.querySelectorAll("#appointments #app-main .table tbody")[1];
  if(topBody){
    topBody.innerHTML = "";
    [...serviceMap.entries()]
      .sort((a,b)=> b[1].amount - a[1].amount)
      .slice(0,10)
      .forEach(([name,v])=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${name}</td><td>${v.count}</td><td>${money(v.amount)}</td>`;
        topBody.appendChild(tr);
      });
  }
}

function fillRevenueTop(totalRevenue, totalAppointments){
  const boxes = document.querySelectorAll("#revenue .panel .card-body .mini");
  if(boxes.length>=2){
    boxes[0].querySelector("div:nth-child(2)").textContent = money(totalRevenue);
    boxes[1].querySelector("div:nth-child(2)").textContent = String(totalAppointments);
  }
}

function fillRevenueServicesTable(sales){
  const tbody = document.querySelector("#rev-services table tbody");
  if(!tbody) return;
  tbody.innerHTML = "";
  let net=0, toplam=0;

  for(const s of sales){
    const d = new Date(s.createdAtLocalISO || s.createdAt?.toDate?.() || Date.now());
    const dStr = d.toLocaleDateString("tr-TR",{ day:"2-digit", month:"short" });
    const tStr = d.toLocaleTimeString("tr-TR",{ hour:"2-digit", minute:"2-digit" });
    for(const it of (s.items||[])){
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><b>—</b></td>
        <td>${dStr} ${tStr}</td>
        <td>${(s.receiptNo||s.id||"").toString().toUpperCase()}</td>
        <td>Walk-in</td>
        <td>${String(minuteFromMeta(it.meta)).padStart(2,"0")}:00</td>
        <td>${money(it.price)}</td>
        <td>${money(0)}</td>
        <td>${money(0)}</td>
        <td>${money(Number(s.discount||0))}</td>
        <td>${money(0)}</td>
        <td>${money(0)}</td>
        <td>${money(s.total)}</td>
        <td>Ödendi</td>`;
      tbody.appendChild(row);
      net += Number(it.price||0);
      toplam += Number(s.total||0);
    }
  }
  const sumRow = document.createElement("tr");
  sumRow.innerHTML = `
    <td></td><td><b>Toplam</b></td><td></td><td></td><td></td>
    <td><b>${money(net)}</b></td>
    <td><b>${money(0)}</b></td>
    <td><b>${money(0)}</b></td>
    <td><b>${money(0)}</b></td>
    <td><b>${money(0)}</b></td>
    <td><b>${money(0)}</b></td>
    <td><b>${money(toplam)}</b></td>
    <td></td>`;
  tbody.appendChild(sumRow);

  // Kategori özeti
  const catBody = document.querySelectorAll("#rev-services .table tbody")[1];
  if(catBody){
    catBody.innerHTML = `<tr><td>—</td><td>${sales.length}</td><td>${money(net)}</td><td>${money(0)}</td><td>${money(0)}</td><td>${money(0)}</td><td>${money(toplam)}</td></tr>`;
  }
}

function fillStaffTables(staffMap){
  // Gelire göre ilk 10
  const t1 = document.querySelector("#staff .panel:nth-of-type(1) tbody");
  if(t1){
    t1.innerHTML = "";
    [...staffMap.entries()].sort((a,b)=> b[1].amount - a[1].amount).slice(0,10).forEach(([name,v])=>{
      const initials = (name||"—").trim()[0]?.toUpperCase() || "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="display:flex;align-items:center;gap:10px;"><span class="avatar">${initials}</span> ${name}</td>
        <td>${v.count}</td>
        <td>${money(v.amount)}</td>
        <td>${money(0)}</td>
        <td>${money(0)}</td>
        <td>${money(0)}</td>
        <td>${money(0)}</td>
        <td><b>${money(v.amount)}</b></td>`;
      t1.appendChild(tr);
    });
  }

  // Komisyon tablosu (örnek 0)
  const t2 = document.querySelector("#staff .panel:nth-of-type(2) tbody");
  if(t2){
    t2.innerHTML = "";
    [...staffMap.entries()].forEach(([name,v])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${name}</td><td>${v.count}</td><td>${money(v.amount)}</td><td>${money(0)}</td>`;
      t2.appendChild(tr);
    });
  }

  // Doluluk
  const t3 = document.querySelector("#staff .panel:nth-of-type(3) tbody");
  if(t3){
    t3.innerHTML = "";
    const workMinutes = 72*60; // görsel oran için örnek
    [...staffMap.entries()].forEach(([name,v])=>{
      const initials = (name||"—").trim()[0]?.toUpperCase() || "-";
      const ratio = workMinutes ? Math.round((v.minutes/workMinutes)*100) : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="display:flex;align-items:center;gap:10px;"><span class="avatar">${initials}</span> ${name}</td>
        <td style="min-width:220px;"><div class="bar"><i style="width:${ratio}%;"></i></div><div class="muted">%${ratio}</div></td>
        <td>${fmtMinutes(v.minutes)}</td>
        <td>72s 0dk</td>`;
      t3.appendChild(tr);
    });
  }
}

/* =========================================================
   Yeniden yükleme – Seçilen aya göre her şeyi güncelle
   ========================================================= */
async function reloadAll(){
  if(!UID) return;
  try{
    // 1) Yıl toplamları → grafikler
    const year = await getYearMonthlyTotals(SELECTED.year);
    buildAppointmentsChart("appointmentsChart", year.counts);
    buildAppointmentsChart("appChart2",         year.counts);
    buildRevenueChart("revenueChart",           year.totals);
    buildRevenueChart("revenueChartPage",       year.totals);

    // 2) Ay verileri → tablolar & küçük kutular
    const sales = await getSalesByMonth(SELECTED.year, SELECTED.month);
    const sum   = summarizeMonth(sales);

    fillDashboardKPIs(sum);
    fillDashboardSide(sum);
    fillAppointmentsTables(sum.serviceMap, sum.totalAppointments);
    fillRevenueTop(sum.totalRevenue, sum.totalAppointments);
    fillRevenueServicesTable(sales);
    fillStaffTables(sum.staffMap);

    // mobil dosyanın çağırabileceği reflow için
    triggerChartsResize();
  }catch(err){
    console.error("Raporları yüklerken hata:", err);
  }
}

/* =========================================================
   Dışa açılan yardımcılar (mobil betik çağırabilir)
   ========================================================= */
function triggerChartsResize(){
  // Chart.js instance’ları yeniden boyutlandır
  Object.values(charts).forEach(ch => {
    try { ch?.resize?.(); } catch(_) {}
  });
}
// Mobil uyumluluk betiği çağırabilsin
window.__sr__reflow = triggerChartsResize;

// (Gerekirse dışarıdan çağrılabilsin)
window.__sr__reload = reloadAll;
