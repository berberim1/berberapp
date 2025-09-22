/* =========================================================
   CHECKOUT (Kasa) – Firebase Auth + Firestore Entegrasyon v4
   - step8.staff canlı takip + dinamik personel menüsü
   - İŞLEMLER: Satış/fiş özeti görünümleri (sol/sağ tıkla fiş aç)
   ========================================================= */

import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ---------- Yardımcılar ---------- */
const $ = (s, r = document) => r.querySelector(s);
function money(n) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(
    Number.isFinite(n) ? n : 0
  );
}

/* ---------- Auth kalıcılığı ---------- */
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] setPersistence:", e?.message || e)
);

/* ---------- Global durum ---------- */
let UID = null;
let BUSINESS_NAME = "İşletmeniz";
let staffList = [];       // {name, phone, initials, color, position}
let stopStaffSub = null;  // onSnapshot unsubscribe
let txData = [];          // İşlemler (satışlar)

/* “Liste” → “fiş” dönüşünde grubu hatırlamak için */
let lastTxGroupTitle = null;
let lastTxGroupArr = [];

/* ===========================
   AUTH → Prefill + satışlar + personel aboneliği
   =========================== */
onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      const ret = encodeURIComponent("checkout.html");
      location.href = `admin-register-login.html#login?return_to=${ret}`;
      return;
    }
    UID = user.uid;

    await hydrateFromFirestore(); // işletme adı, hizmetler, personel ilk yük
    subscribeStaff();             // personel canlı takibi
    await loadSales();            // geçmiş satışlar

    // Logout (Switch Business modalından)
    $("#bmLogout")?.addEventListener("click", async () => {
      try { await signOut(auth); } catch {}
      location.href = "admin-register-login.html#login?return_to=checkout.html";
    });
  } catch (e) {
    console.error("[checkout] init error:", e?.message || e);
  }
});

/* İlk verileri oku ve UI'ı hazırla */
async function hydrateFromFirestore() {
  try {
    const ref = doc(db, "adminOnboarding", UID);
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};

    BUSINESS_NAME = d?.business?.name || d?.step2?.businessName || "İşletmeniz";

    updateStaffFromDoc(d); // personel

    // Hizmetleri birleştir (root.services + step7.services)
    const fromRoot = Array.isArray(d?.services) ? d.services : [];
    const fromStep7 = Array.isArray(d?.step7?.services)
      ? d.step7.services.map((n) => ({ name: n, min: 30, price: "" }))
      : [];
    const merged = [...fromRoot, ...fromStep7];

    const uniq = [];
    const seen = new Set();
    merged.forEach((s) => {
      const nm = (s?.name || s || "").toString().trim();
      if (!nm || seen.has(nm.toLowerCase())) return;
      seen.add(nm.toLowerCase());
      if (typeof s === "string") uniq.push({ name: nm, min: 30, price: "" });
      else uniq.push({ name: s.name || "", min: s.min ?? 30, price: s.price ?? "" });
    });

    if (uniq.length) {
      services.length = 0; // fallback temizle
      uniq.forEach((s) =>
        services.push({
          title: s.name,
          meta: s.min ? `${s.min}dk` : "",
          price: Number(s.price) || 0,
        })
      );
      renderServices(services);
    }
  } catch (e) {
    console.warn("[checkout] hydrateFromFirestore:", e?.message || e);
  }
}

/* Personel canlı dinleme (step8.staff) */
function subscribeStaff() {
  try {
    if (stopStaffSub) { stopStaffSub(); stopStaffSub = null; }
    const ref = doc(db, "adminOnboarding", UID);
    stopStaffSub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const before = JSON.stringify(staffList);
        updateStaffFromDoc(d);
        const after = JSON.stringify(staffList);
        if (before !== after && modal.style.display === "flex") rebuildStaffMenu();
      },
      (err) => console.warn("[staff] onSnapshot error:", err?.message || err)
    );
  } catch (e) {
    console.warn("[staff] subscribeStaff:", e?.message || e);
  }
}

/* Personel listesini doc'tan çıkar ve normalize et */
function updateStaffFromDoc(d) {
  const arr = Array.isArray(d?.step8?.staff) ? d.step8.staff : [];
  staffList = arr
    .map((s) => ({
      name: (s?.name || "").toString().trim(),
      phone: s?.phone || "",
      initials: s?.initials || ((s?.name || "").toString().trim()[0] || "").toUpperCase(),
      color: s?.color || "#CBD5E1",
      position: s?.position || "",
    }))
    .filter((s) => s.name);
}

/* Firestore’dan satışlar (adminOnboarding/{UID}/sales) */
async function loadSales() {
  try {
    const col = collection(db, "adminOnboarding", UID, "sales");
    const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
    txData = snap.docs.map((d) => {
      const x = d.data();
      const created =
        x.createdAt?.toDate?.() ||
        (x.createdAtLocalISO ? new Date(x.createdAtLocalISO) : new Date());
      const items = (x.items || []).map((it) => ({
        title: it.title,
        meta: it.meta,
        price: Number(it.price) || 0,
      }));
      const subtotal =
        Number(x.subtotal) ||
        items.reduce((s, it) => s + (Number(it.price) || 0), 0);
      const discount = Number(x.discount) || 0;
      const total = Number(x.total) || Math.max(subtotal - discount, 0);

      return {
        /* kimlikler */
        docId: d.id,
        receiptNo: x.receiptNo || d.id.slice(0, 6).toUpperCase(),
        id: x.receiptNo || d.id, // mevcut kodla uyumluluk
        /* özet */
        date: created.toISOString(),
        method: x.paymentMethod || "Nakit",
        items,
        subtotal,
        discount,
        total,
      };
    });

    if ($(".top-tabs .tab.active")?.dataset.view === "txs") buildTxUI();
  } catch (e) {
    console.warn("[checkout] loadSales:", e?.message || e);
  }
}

/* =========================================================
   Mevcut UI kodlarınız (eklemelerle)
   ========================================================= */

/* ---------- Hizmet verisi (FALLBACK) ---------- */
const services = [
  { title: "Saç kesimi", meta: "30dk", price: 40 },
  { title: "Sakal", meta: "15dk", price: 20 },
  { title: "Saç+Sakal", meta: "45dk", price: 50 },
  { title: "Çocuk saç kesimi", meta: "30dk", price: 30 },
  { title: "Sakal bakım", meta: "15dk", price: 20 },
  { title: "Saç yıkama", meta: "10dk", price: 10 },
  { title: "Şekillendirme", meta: "30dk", price: 20 },
];
const rowColors = ["#22c55e", "#f59e0b", "#ef4444", "#10b981"];

/* ---------- Hizmetleri doldur ---------- */
const svcList = document.getElementById("svcList");
function renderServices(list) {
  if (!svcList) return;
  svcList.innerHTML = "";
  list.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "svc-row";
    row.style.setProperty("--row-stripe", rowColors[i % rowColors.length]);
    row.innerHTML = `<div>
        <div class="svc-title">${it.title}</div>
        <div class="meta">${it.meta || ""}</div>
      </div>
      <div class="svc-price">${money(Number(it.price) || 0)}</div>`;
    row.onclick = () => addToCart(it.title, Number(it.price) || 0, it.meta || "");
    svcList.appendChild(row);
  });
}
renderServices(services);
document.getElementById("svcSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderServices(services.filter((s) => s.title.toLowerCase().includes(q)));
});

/* ---------- Sol sekmeler ---------- */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
    document.getElementById(btn.dataset.target).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

/* ---------- Özel Tutar tuş takımı ---------- */
const keypadNumbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "x"];
const pad = document.getElementById("pad");
keypadNumbers.forEach((n) => {
  const b = document.createElement("button");
  b.textContent = n;
  b.onclick = () => {
    const input = document.getElementById("caAmount");
    if (n === "x") { input.value = (input.value || "").slice(0, -1) || "0"; return; }
    if (input.value === "0" && n !== ".") input.value = "";
    if (n === "." && input.value.includes(".")) return;
    input.value += n;
  };
  pad.appendChild(b);
});
document.getElementById("addCustom").onclick = () => {
  const amt = parseFloat(document.getElementById("caAmount").value || "0") || 0;
  const desc = document.getElementById("caDesc").value.trim() || "Özel Tutar";
  if (amt > 0) {
    addToCart(desc, amt, "");
    document.getElementById("caAmount").value = "0";
    document.getElementById("caDesc").value = "";
  }
};

/* ---------- Sepet & toplamlar ---------- */
const cart = document.getElementById("cart");
let cartItems = [];
function addToCart(title, price, meta) {
  const id = "id-" + Math.random().toString(36).slice(2, 9);
  const defaultStaff = staffList[0]?.name || "";
  const item = { id, title, meta, price, staff: defaultStaff };
  cartItems.push(item);

  const row = document.createElement("div");
  row.className = "cart-row";
  row.dataset.id = id;
  row.innerHTML = `<div>
      <div class="title">${title}${
        meta ? ` <span style="color:var(--muted);font-size:12px">(${meta})</span>` : ""
      }</div>
      <div class="note">
        <span class="staff-chip"><span class="av"></span><span class="staff-name">${
          item.staff || "Personel yok"
        }</span></span>
        <button class="change-btn">Değiştir</button>
      </div>
    </div>
    <div style="text-align:right;font-weight:900" class="price">${money(item.price)}</div>`;
  row.querySelector(".change-btn").onclick = () => openModal(id);
  cart.insertBefore(row, cart.querySelector(".sums"));
  recalc();
}
function removeItem(id) {
  cartItems = cartItems.filter((i) => i.id !== id);
  const row = document.querySelector(`.cart-row[data-id="${id}"]`);
  if (row) row.remove();
  recalc();
}
function recalc() {
  const subtotal = cartItems.reduce((s, i) => s + i.price, 0);
  const discount = Number(document.getElementById("discountInput").value) || 0;
  const total = Math.max(subtotal - discount, 0);
  document.getElementById("subtotal").textContent = money(subtotal);
  document.getElementById("total").textContent = money(total);
}
document.getElementById("discountInput").addEventListener("input", recalc);
document.getElementById("clearCart").onclick = () => {
  cartItems = [];
  document.querySelectorAll(".cart-row").forEach((r) => r.remove());
  recalc();
};

/* ---------- Düzenle Modal ---------- */
const modal = document.getElementById("modal");
const priceInput = document.getElementById("priceInput");
const staffLbl = document.getElementById("staffLbl");
const staffBtnDD = document.getElementById("staffBtn");
const staffMenu = document.getElementById("staffMenu");
const closeModalBtn = document.getElementById("closeModal");
const cancelBtn = document.getElementById("cancelBtn");
const saveBtn = document.getElementById("saveBtn");
const removeBtn = document.getElementById("removeBtn");
let editingId = null;

function openModal(id) {
  const item = cartItems.find((i) => i.id === id);
  if (!item) return;
  editingId = id;
  $("#mItemTitle").textContent = `${item.title}${item.meta ? ` (${item.meta})` : ""}`;
  $("#mItemBase").textContent = money(item.price);
  priceInput.value = item.price.toFixed(2);
  staffLbl.textContent = item.staff || "Personel atama yok";
  rebuildStaffMenu(); // menüyü her açılışta güncelle
  modal.style.display = "flex";
}
function closeModal() { modal.style.display = "none"; editingId = null; }
closeModalBtn.onclick = closeModal; cancelBtn.onclick = closeModal;
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

staffBtnDD.addEventListener("click", () => {
  staffMenu.style.display = staffMenu.style.display === "block" ? "none" : "block";
});
function rebuildStaffMenu() {
  staffMenu.innerHTML = "";
  staffList.forEach((p) => {
    const opt = document.createElement("div");
    opt.className = "opt";
    opt.dataset.staff = p.name;
    opt.innerHTML = `<span class="av" style="background:${p.color || "#CBD5E1"}"></span> ${p.name}`;
    opt.addEventListener("click", () => {
      staffLbl.textContent = p.name;
      staffMenu.style.display = "none";
    });
    staffMenu.appendChild(opt);
  });
  const none = document.createElement("div");
  none.className = "opt";
  none.dataset.staff = "";
  none.innerHTML = `<span class="av"></span> Personel atama yok`;
  none.addEventListener("click", () => {
    staffLbl.textContent = "Personel atama yok";
    staffMenu.style.display = "none";
  });
  staffMenu.appendChild(none);
}

saveBtn.addEventListener("click", () => {
  if (!editingId) return;
  const item = cartItems.find((i) => i.id === editingId);
  item.price = Math.max(0, parseFloat(priceInput.value || "0") || 0);
  item.staff = staffLbl.textContent === "Personel atama yok" ? "" : staffLbl.textContent;
  const row = document.querySelector(`.cart-row[data-id="${editingId}"]`);
  if (row) {
    row.querySelector(".price").textContent = money(item.price);
    row.querySelector(".staff-name").textContent = item.staff || "Personel yok";
  }
  recalc(); closeModal();
});
removeBtn.addEventListener("click", () => { if (!editingId) return; removeItem(editingId); closeModal(); });

/* ---------- Üst tabs ---------- */
const saleView = document.getElementById("saleView");
const txsView = document.getElementById("txsView");
document.querySelectorAll(".top-tabs .tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".top-tabs .tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    if (t.dataset.view === "sale") showSection("sale");
    else { showSection("txs"); buildTxUI(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

/* ---------- Ödeme akışı ---------- */
const paymentView = document.getElementById("paymentView");
const completeView = document.getElementById("completeView");
const goPaymentBtn = document.getElementById("goPayment");
const backFromPayment = document.getElementById("backFromPayment");
const pmCards = document.querySelectorAll(".pm-card");
let paymentMethod = "Nakit";

goPaymentBtn.addEventListener("click", () => {
  if (cartItems.length === 0) return;
  renderPaymentCart();
  showSection("payment");
});
backFromPayment.addEventListener("click", () => showSection("sale"));

pmCards.forEach((c) => {
  c.addEventListener("click", () => {
    pmCards.forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    paymentMethod = c.dataset.method;
  });
});

document.getElementById("trashOnPayment").addEventListener("click", () => {
  cartItems = [];
  document.querySelectorAll(".cart-row").forEach((r) => r.remove());
  recalc();
  renderPaymentCart();
});

/* === Firestore'a satış kaydet === */
document.getElementById("confirmPay").addEventListener("click", async () => {
  if (cartItems.length === 0) return;

  try {
    const saved = await persistSale(); // Firestore
    renderReceipt(saved.receiptNo, saved.total, saved.paymentMethod);

    txData.unshift({
      docId: saved.id,
      receiptNo: saved.receiptNo,
      id: saved.receiptNo, // uyumluluk
      date: new Date().toISOString(),
      method: saved.paymentMethod,
      items: saved.items.map((it) => ({ title: it.title, meta: it.meta, price: it.price })),
      subtotal: saved.subtotal,
      discount: saved.discount,
      total: saved.total,
    });

    showSection("complete");

    cartItems = [];
    document.querySelectorAll(".cart-row").forEach((r) => r.remove());
    recalc();
  } catch (e) {
    alert("Satış kaydedilemedi: " + (e?.message || e));
  }
});

/* Satışı Firestore'a yazar (adminOnboarding/{UID}/sales) */
function genReceiptNo() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
async function persistSale() {
  const subtotal = cartItems.reduce((s, i) => s + i.price, 0);
  const discount = Number(document.getElementById("discountInput").value) || 0;
  const total = Math.max(subtotal - discount, 0);

  const items = cartItems.map(({ title, meta, price, staff }) => ({ title, meta, price, staff }));
  const now = new Date();
  const payload = {
    adminId: UID,
    businessName: BUSINESS_NAME,
    items,
    subtotal,
    discount,
    total,
    paymentMethod,
    status: "paid",
    createdAt: serverTimestamp(),
    createdAtLocalISO: now.toISOString(),
    receiptNo: genReceiptNo(),
    dateKey: now.toISOString().slice(0, 10), // YYYY-MM-DD
    monthKey: now.toISOString().slice(0, 7), // YYYY-MM
  };

  const col = collection(db, "adminOnboarding", UID, "sales");
  const ref = await addDoc(col, payload);
  return { id: ref.id, ...payload };
}

/* ---- Ödeme özetleri ---- */
function renderPaymentCart() {
  const wrap = document.getElementById("payCart");
  wrap.querySelectorAll(".readonly-row").forEach((n) => n.remove());
  const sums = wrap.querySelector(".sums");
  const subtotal = cartItems.reduce((s, i) => s + i.price, 0);
  const discount = Number(document.getElementById("discountInput").value) || 0;
  document.getElementById("pSubtotal").textContent = money(subtotal);
  document.getElementById("pDiscount").textContent = money(discount);
  document.getElementById("pTotal").textContent = money(Math.max(subtotal - discount, 0));
  cartItems.forEach((it) => {
    const row = document.createElement("div");
    row.className = "cart-row readonly-row";
    row.innerHTML = `<div>
        <div class="title">${it.title}${
          it.meta ? ` <span style="color:var(--muted);font-size:12px">(${it.meta})</span>` : ""
        }</div>
        <div class="note"><span class="staff-chip"><span class="av"></span><span>${
          it.staff || "Personel yok"
        }</span></span></div>
      </div>
      <div style="text-align:right;font-weight:900">${money(it.price)}</div>`;
    wrap.insertBefore(row, sums);
  });
}

/* ---- Makbuz (tamamlandı ekranı) ---- */
function renderReceipt(receiptNoOverride = null, totalOverride = null, methodOverride = null) {
  const sub = cartItems.reduce((s, i) => s + i.price, 0);
  const dis = Number(document.getElementById("discountInput").value) || 0;
  const tot = totalOverride ?? Math.max(sub - dis, 0);

  document.getElementById("changeInfo").textContent = `₺0,00 para üstü / ${money(tot)}`;

  const id = receiptNoOverride || Math.random().toString(36).slice(2, 8).toUpperCase();
  document.getElementById("rcptId").textContent = `Fiş · No ${id}`;
  document.getElementById("rcptDate").textContent = new Date().toLocaleDateString("tr-TR", {
    year: "numeric", month: "short", day: "numeric",
  });

  const list = document.getElementById("rcptItems");
  list.innerHTML = "";
  cartItems.forEach((it) => {
    const line = document.createElement("div");
    line.className = "rc-line";
    line.innerHTML = `<span>${it.title} ${
      it.meta ? `<span class="rc-sub">(${it.meta})</span>` : ""
    }</span><span>${money(it.price)}</span>`;
    list.appendChild(line);
  });

  document.getElementById("rcSub").textContent = money(sub);
  document.getElementById("rcDis").textContent = money(dis);
  document.getElementById("rcTot").textContent = money(tot);
  const pm = methodOverride || paymentMethod;
  document.getElementById("rcPaidLine").textContent = `Ödendi - ${pm} · ${new Date().toLocaleString("tr-TR")}`;
  document.getElementById("rcPaidAmt").textContent = money(tot);
  document.getElementById("rcTotalPaid").textContent = money(tot);
}

/* ---- Ekran geçişleri ---- */
function showSection(which) {
  saleView.style.display = which === "sale" ? "block" : "none";
  txsView.style.display = which === "txs" ? "block" : "none";
  paymentView.style.display = which === "payment" ? "block" : "none";
  completeView.style.display = which === "complete" ? "block" : "none";
  if (which === "sale") {
    document.querySelector('.top-tabs .tab[data-view="sale"]').classList.add("active");
    document.querySelector('.top-tabs .tab[data-view="txs"]').classList.remove("active");
  }
}

/* ===========================
   İŞLEMLER: Firestore verisi + UI
   =========================== */
let txMode = "days";

function buildTxUI() {
  const tabs = document.querySelectorAll(".tx-tab");
  tabs.forEach((tb) => (tb.onclick = () => {
    tabs.forEach((x) => x.classList.remove("active"));
    tb.classList.add("active");
    txMode = tb.dataset.mode;
    renderTx();
  }));
  renderTx();
  document.getElementById("txSearch").oninput = renderTx;
}

function renderTx() {
  const q = (document.getElementById("txSearch").value || "").toLowerCase();
  const groupsEl = document.getElementById("txGroups"); groupsEl.innerHTML = "";
  const listEl = document.getElementById("txList"); listEl.innerHTML = "";

  const data = txData.filter((x) => x.id.toLowerCase().includes(q));

  // Gün veya Ay kırılımı
  const map = new Map();
  data.forEach((x) => {
    const d = new Date(x.date);
    const key = txMode === "months"
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(x);
  });

  // Sol sütun: Grup listesi
  [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).forEach(([key, arr]) => {
    const total = arr.reduce((s, r) => s + r.total, 0);
    const box = document.createElement("div");
    box.className = "tx-group";
    const label = (txMode === "months")
      ? new Date(key + "-01").toLocaleDateString("tr-TR", { year: "numeric", month: "long" })
      : new Date(key).toLocaleDateString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit" });
    box.innerHTML = `<div class="g-head">${label}</div>`;

    // Her satış için satır (sol) → “Özeti göster”
    arr.forEach((r) => {
      const row = document.createElement("div");
      row.className = "tx-row";
      row.innerHTML = `
        <div>
          <div>${r.method}</div>
          <div class="sub">${money(r.total)}</div>
        </div>
        <div class="sub tx-link">Özeti göster ›</div>`;
      row.onclick = () => showTxSummary(r);       // ← tek tıkla fiş aç
      box.appendChild(row);
    });

    const totalRow = document.createElement("div");
    totalRow.className = "tx-row";
    totalRow.innerHTML = `<div><strong>Toplam</strong></div><div><strong>${money(total)}</strong></div>`;
    box.appendChild(totalRow);
    groupsEl.appendChild(box);
  });

  // Sağ sütun: Varsayılan olarak seçili ilk grubun listesi
  const firstEntry = [...map.entries()][0];
  if (firstEntry) {
    const human = txMode === "months"
      ? new Date(firstEntry[0] + "-01").toLocaleDateString("tr-TR", { year: "numeric", month: "long" })
      : new Date(firstEntry[0]).toLocaleDateString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit" });
    focusList(human, firstEntry[1]);
  }
}

/* Sağ sütunda bir grubun “liste görünümü” */
function focusList(title, arr) {
  lastTxGroupTitle = title;
  lastTxGroupArr = arr;

  const listEl = document.getElementById("txList");
  listEl.innerHTML = "";

  const head = document.createElement("div");
  head.className = "tx-list-head";
  head.textContent = title;
  listEl.appendChild(head);

  arr.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((x) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tx-item-btn";
    btn.innerHTML = `
      <div class="left">
        <span class="badge">ÖDENDİ</span>
        <div class="titlebox">
          <div class="title">${x.items[0]?.title?.split?.("(")[0] || "Satış"}</div>
          <div class="rc-sub">${new Date(x.date).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · Fiş ${x.receiptNo}</div>
        </div>
      </div>
      <div class="amt">${money(x.total)}</div>`;
    btn.onclick = () => showTxSummary(x); // ← fiş görünümü
    listEl.appendChild(btn);
  });
}

/* Sağ sütunda “fiş/sipariş özeti” görünümü */
function showTxSummary(sale) {
  const listEl = document.getElementById("txList");
  listEl.innerHTML = "";

  // Geri butonu
  const back = document.createElement("button");
  back.type = "button";
  back.className = "tx-back";
  back.textContent = "‹ Listeye dön";
  back.onclick = () => focusList(lastTxGroupTitle || "", lastTxGroupArr || []);
  listEl.appendChild(back);

  // Fiş kartı (tamamlandı ekranındaki tasarımla uyumlu)
  const card = document.createElement("div");
  card.className = "receipt tx-receipt";
  const dateStr = new Date(sale.date).toLocaleDateString("tr-TR", {
    year: "numeric", month: "short", day: "numeric",
  });

  card.innerHTML = `
    <span class="pill">ÖDENDİ</span>
    <div class="rc-header">
      <div style="font-weight:900">Fiş · No ${sale.receiptNo}</div>
      <div class="rc-sub">${dateStr}</div>
    </div>
    <div class="rc-sub" style="margin-bottom:8px">
      ${BUSINESS_NAME}<br>123 Cadde, Şehir
    </div>
    <div id="txRcptItems"></div>
    <div class="rc-line"><span class="rc-sub">Ara toplam</span><span class="rc-sub">${money(sale.subtotal)}</span></div>
    <div class="rc-line"><span class="rc-sub">İndirim</span><span class="rc-sub">${money(sale.discount)}</span></div>
    <div class="rc-line"><span class="rc-sub">Bahşiş tutarı</span><span class="rc-sub">₺0,00</span></div>
    <div class="rc-line" style="font-weight:900"><span>Toplam</span><span class="rc-total">${money(sale.total)}</span></div>
    <div class="rc-line"><span class="rc-sub">Ödendi - ${sale.method}</span><span class="rc-sub">${money(sale.total)}</span></div>
    <div class="rc-line" style="border-bottom:0"><span class="rc-sub">Ödenen Toplam</span><span class="rc-sub">${money(sale.total)}</span></div>
  `;

  listEl.appendChild(card);

  // Kalemleri doldur
  const itemsWrap = card.querySelector("#txRcptItems");
  sale.items.forEach((it) => {
    const line = document.createElement("div");
    line.className = "rc-line";
    line.innerHTML = `<span>${it.title} ${
      it.meta ? `<span class="rc-sub">(${it.meta})</span>` : ""
    }</span><span>${money(it.price)}</span>`;
    itemsWrap.appendChild(line);
  });
}

/* ilk ekranda "Satış" */
showSection("sale");

/* ===== bar-menu import (güvenli) ===== */
(async () => {
  try {
    const res = await fetch("bar-menu.html", { cache: "no-store" });
    const html = await res.text();
    const docx = new DOMParser().parseFromString(html, "text/html");

    const style = docx.querySelector("#bar-menu-css");
    if (style && !document.getElementById("bar-menu-css")) {
      document.head.appendChild(style.cloneNode(true));
    }
    const nav = docx.querySelector("nav.rail");
    if (nav) document.getElementById("bar-menu").appendChild(nav.cloneNode(true));

    const current = location.pathname.split("/").pop() || "checkout.html";
    document.querySelectorAll("nav.rail .rail__btn").forEach((a) => {
      if (a.getAttribute("href") === current) a.setAttribute("aria-current", "page");
    });

    const profileBtn =
      document.querySelector("nav.rail #openProfile") ||
      document.querySelector("nav.rail .rail__bottom .avatar-btn");
    if (profileBtn && !profileBtn.dataset.bmBound) {
      profileBtn.dataset.bmBound = "1";
      profileBtn.addEventListener("click", (e) => { e.preventDefault(); openBm(); });
    }
  } catch (e) {
    console.warn("Bar menu yüklenemedi:", e);
  }
})();

/* ===== Switch Business (liste + arama + seçim) ===== */
const bmOverlay = document.getElementById("bmOverlay");
const bmModal = document.getElementById("bmModal");
const bmClose = document.getElementById("bmClose");
const bmList = document.getElementById("bmList");
const bmQuery = document.getElementById("bmQuery");

const BUSINESSES = [{ id: 1, name: BUSINESS_NAME, meta: "", using: true }];

function openBm() { bmOverlay.classList.add("show"); bmModal.classList.add("show"); renderBmList(bmQuery.value || ""); }
function closeBm() { bmOverlay.classList.remove("show"); bmModal.classList.remove("show"); }
bmClose?.addEventListener("click", closeBm);
bmOverlay?.addEventListener("click", closeBm);
bmQuery?.addEventListener("input", (e) => renderBmList(e.target.value));

function renderBmList(q) {
  bmList.innerHTML = "";
  BUSINESSES.filter((b) => b.name.toLowerCase().includes(q.toLowerCase())).forEach((b) => {
    const btn = document.createElement("button");
    btn.className = "bm-item";
    btn.type = "button";
    if (b.using) btn.setAttribute("aria-current", "true");
    btn.innerHTML = `<div class="left">
        <span class="bm-dot" aria-hidden="true"></span>
        <div><div style="font-weight:700">${b.name}</div>${b.meta ? `<div class="bm-meta">${b.meta}</div>` : ""}</div>
      </div>
      <div class="bm-status">• Currently using</div>`;
    btn.addEventListener("click", () => {
      BUSINESSES.forEach((x) => (x.using = false));
      b.using = true;
      renderBmList(bmQuery.value || "");
    });
    bmList.appendChild(btn);
  });
}
