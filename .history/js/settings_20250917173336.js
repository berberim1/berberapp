/* ===========================
   AYARLAR – Firestore Entegre (Full + Debug v9)
   =========================== */

console.log("[settings] settings.js yüklendi (v9)");

import { auth, db, storage } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  ref as sRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* ====== yardımcılar ====== */
const $ = (s, r = document) => r.querySelector(s);
const toast = $("#toast");
function showToast(msg = "Kaydedildi") {
  if (toast) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1600);
  } else {
    console.log("[toast]", msg);
  }
}

/* ====== Giriş kalıcılığı ====== */
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn("[auth] setPersistence:", e?.message || e);
});

/* ===========================
   Bar-menu avatar → BM modal
   =========================== */
(function bindBmModal() {
  const overlay = $("#bmOverlay");
  const modal = $("#bmModal");
  const closeBtn = $("#bmClose");
  const logout = $("#bmLogout");

  document.addEventListener("click", (e) => {
    const avatar = e.target.closest(".rail__bottom .avatar-btn");
    if (avatar) {
      overlay?.classList.add("show");
      modal?.classList.add("show");
    }
  });
  function closeBm() {
    overlay?.classList.remove("show");
    modal?.classList.remove("show");
  }
  overlay?.addEventListener("click", closeBm);
  closeBtn?.addEventListener("click", closeBm);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeBm());
  logout?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch {}
    const ret = encodeURIComponent(location.pathname.replace(/^\//, ""));
    location.href = `admin-register-login.html#login?return_to=${ret}`;
  });
})();

/* ===========================
   İl / İlçe / Mahalle (mock)
   =========================== */
const DATA = {
  İstanbul: {
    Üsküdar: [
      "Bulgurlu",
      "Acıbadem",
      "Altunizade",
      "Çengelköy",
      "Kuzguncuk",
      "Ünalan",
      "İcadiye",
      "Kısıklı",
    ],
    Ümraniye: [
      "Atakent",
      "Atatürk",
      "Aşağıdudullu",
      "Çakmak",
      "Esenevler",
      "İnkılap",
      "İstiklal",
      "Tatlısu",
      "Yamanevler",
    ],
    Kadıköy: ["Moda", "Fikirtepe", "Kozyatağı"],
    Beşiktaş: ["Etiler", "Levent", "Ortaköy"],
  },
  Ankara: { Çankaya: ["Kızılay", "Ayrancı", "Bahçelievler"] },
  İzmir: { Konak: ["Alsancak", "Güzelyalı"] },
};
const city = $("#city"),
  dist = $("#district"),
  hood = $("#hood");

function fillCities() {
  if (!city) return;
  city.length = 0;
  city.add(new Option("Seçiniz", "", true, true));
  Object.keys(DATA).forEach((c) => city.add(new Option(c, c)));
}
function fillDistricts() {
  if (!dist || !hood) return;
  dist.length = 0;
  dist.add(new Option("İlçe seçin", "", true, true));
  dist.disabled = !city.value;
  hood.length = 0;
  hood.add(new Option("Mahalle seçin", "", true, true));
  hood.disabled = true;
  if (!city.value) return;
  Object.keys(DATA[city.value] || {}).forEach((d) =>
    dist.add(new Option(d, d))
  );
}
function fillHoods() {
  if (!hood) return;
  hood.length = 0;
  hood.add(new Option("Mahalle seçin", "", true, true));
  hood.disabled = !dist.value;
  if (!dist.value) return;
  (DATA[city.value]?.[dist.value] || []).forEach((h) =>
    hood.add(new Option(h, h))
  );
}
city?.addEventListener("change", fillDistricts);
dist?.addEventListener("change", fillHoods);
fillCities();

function ensureOption(select, value, label) {
  if (!select || !value) return;
  const exists = [...select.options].some((o) => o.value === value);
  if (!exists) select.add(new Option(label ?? value, value));
  select.value = value;
}

/* ===========================
   Görsel (yerel önizleme + Storage upload)
   =========================== */
function putThumb(listEl, url) {
  if (!listEl) return;
  listEl.innerHTML = "";
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<img src="${url}" alt=""><button class="del">Sil</button>`;
  el.querySelector(".del").addEventListener("click", () => (listEl.innerHTML = ""));
  listEl.appendChild(el);
}
function putLoading(listEl, msg = "Yükleniyor…") {
  if (!listEl) return;
  listEl.innerHTML = "";
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<div class="loading">${msg}</div>`;
  listEl.appendChild(el);
}

/* 🔸 dosya yolu: uploads/{UID}/{kind}_{timestamp}.{ext} */
function storagePath(uid, kind, file) {
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase();
  const ts = Date.now();
  return `uploads/${uid}/${kind}_${ts}.${ext}`;
}

async function uploadImageToStorage(kind, file, uid) {
  const path = storagePath(uid, kind, file);
  const r = sRef(storage, path);
  try {
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await updateDoc(doc(db, "adminOnboarding", uid), {
      [`images.${kind}`]: url,
      updatedAt: serverTimestamp(),
    });
    return url;
  } catch (err) {
    console.error("[storage upload error]", err);
    throw err;
  }
}

function bindUploader(kind) {
  const btn = document.querySelector(`[data-upload="${kind}"]`);
  const input = document.querySelector(`[data-input="${kind}"]`);
  const list = document.getElementById(kind + "Thumbs");
  if (!btn || !input || !list) return;

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;

    // 1) Yükleme placeholder'ı göster
    putLoading(list, "Yükleniyor…");

    try {
      if (!UID) {
        showToast("Giriş gerekli");
        list.innerHTML = "";
        return;
      }

      // 2) Storage'a yükle, Firestore'a URL yaz
      const url = await uploadImageToStorage(kind, f, UID);

      // 3) Başarılı → thumb göster
      putThumb(list, url);
      showToast("Görsel yüklendi");
    } catch (e) {
      console.error("[upload]", e);
      if (e?.code === "storage/unauthorized") {
        showToast("Yetki/CORS hatası: Storage erişimi engellendi");
      } else {
        showToast("Görsel yüklenemedi");
      }
      list.innerHTML = "";
    } finally {
      input.value = null;
    }
  });
}
["cover", "salon", "model"].forEach(bindUploader);

/* ===========================
   Hizmetler UI
   =========================== */
const serviceListEl = document.getElementById("serviceList");
let services = [];

function svcRowTemplate(s, idx) {
  const name = s.name ?? "";
  const min = Number.isFinite(Number(s.min)) ? Number(s.min) : "";
  const price =
    s.price === "" ? "" : Number.isFinite(Number(s.price)) ? Number(s.price) : "";

  return `
    <div class="tr row" data-row="${idx}">
      <div class="td" style="width:36px"><div class="grip" title="Sürükle"></div></div>
      <div class="td">
        <input class="input" value="${name}" data-k="name" data-i="${idx}" placeholder="Hizmet adı" />
      </div>
      <div class="td" style="width:120px">
        <input class="input" inputmode="numeric" pattern="[0-9]*" min="5" step="5"
               value="${min}" data-k="min" data-i="${idx}" placeholder="dk" />
      </div>
      <div class="td" style="width:120px">
        <input class="input" inputmode="numeric" pattern="[0-9]*" min="0" step="1"
               value="${price}" data-k="price" data-i="${idx}" placeholder="Ücret" />
      </div>
      <div class="td ops" style="width:160px">
        <button class="ico-btn" data-up="${idx}" title="Yukarı">
          <svg class="ico" viewBox="0 0 24 24"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
        </button>
        <button class="ico-btn" data-down="${idx}" title="Aşağı">
          <svg class="ico" viewBox="0 0 24 24"><path d="m19 12-7 7-7-7"/><path d="M12 5v14"/></svg>
        </button>
        <button class="ico-btn" data-del="${idx}" title="Sil">
          <svg class="ico" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
}

function renderServices() {
  if (!serviceListEl) return;
  serviceListEl.innerHTML = services.map(svcRowTemplate).join("");
}

serviceListEl?.addEventListener("input", (e) => {
  const t = e.target;
  const k = t.dataset.k,
    i = +t.dataset.i;
  if (!k || Number.isNaN(i)) return;

  if (k === "min") {
    const val = Math.max(5, parseInt(t.value || 0));
    services[i][k] = Number.isFinite(val) ? val : 30;
    t.value = services[i][k]; // invalid/boş değer uyarısını önle
  } else if (k === "price") {
    const raw = t.value.trim();
    if (raw === "") {
      services[i][k] = ""; // boş bırakılabilir
    } else {
      const v = Number(raw);
      services[i][k] = Number.isFinite(v) ? v : 0;
      t.value = services[i][k];
    }
  } else {
    services[i][k] = t.value;
  }
});

serviceListEl?.addEventListener("click", (e) => {
  const up = e.target.closest("[data-up]");
  const down = e.target.closest("[data-down]");
  const del = e.target.closest("[data-del]");
  if (up) {
    const i = +up.dataset.up;
    if (i > 0) {
      [services[i - 1], services[i]] = [services[i], services[i - 1]];
      renderServices();
    }
  }
  if (down) {
    const i = +down.dataset.down;
    if (i < services.length - 1) {
      [services[i + 1], services[i]] = [services[i], services[i + 1]];
      renderServices();
    }
  }
  if (del) {
    const i = +del.dataset.del;
    services.splice(i, 1);
    renderServices();
  }
});

$("#addQuick")?.addEventListener("click", () => {
  services.push({ name: "", min: 30, price: "" });
  renderServices();
});

/* ====== Picker (opsiyonel) ====== */
const pickerEl = $("#picker"),
  openPicker = $("#openPicker"),
  pickedChips = $("#pickedChips"),
  pickerList = $("#pickerList"),
  pickerSearch = $("#pickerSearch"),
  savePicked = $("#savePicked");

const CATALOG = [
  "Erkek Saç Kesimi",
  "Sakal",
  "Saç & sakal",
  "Çocuk saç kesimi",
  "Saç Boyama",
  "Fön",
  "Saç bakımı",
  "Kaş",
  "Ağda",
  "Perma",
  "Brezilya fönü",
];
let tempSelected = new Set();

function renderPicker() {
  const q = (pickerSearch?.value || "").toLowerCase().trim();
  if (pickerList) pickerList.innerHTML = "";
  if (pickedChips) pickedChips.innerHTML = "";

  tempSelected.forEach((n) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `${n} <button class="rm" data-rm="${n}">x</button>`;
    pickedChips?.appendChild(chip);
  });

  CATALOG.filter((n) => n.toLowerCase().includes(q)).forEach((n) => {
    const it = document.createElement("div");
    const sel = tempSelected.has(n);
    it.className = "item";
    it.innerHTML = `<div>${n}</div><button class="${
      sel ? "pick sel" : "pick"
    }" data-toggle="${n}">${sel ? "SEÇİLDİ" : "SEÇ"}</button>`;
    pickerList?.appendChild(it);
  });

  if (savePicked) savePicked.textContent = `SEÇİLENLERİ KAYDET (${tempSelected.size})`;
}

openPicker?.addEventListener("click", () => {
  tempSelected = new Set();
  pickerEl?.classList.add("show");
  renderPicker();
  pickerSearch?.focus();
});
pickerEl?.addEventListener("click", (e) => {
  if (e.target.hasAttribute?.("data-close") || e.target === pickerEl)
    pickerEl?.classList.remove("show");
});
pickerList?.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-toggle]");
  if (!t) return;
  const name = t.dataset.toggle;
  tempSelected.has(name) ? tempSelected.delete(name) : tempSelected.add(name);
  renderPicker();
});
pickedChips?.addEventListener("click", (e) => {
  const rm = e.target.dataset?.rm;
  if (rm) {
    tempSelected.delete(rm);
    renderPicker();
  }
});
savePicked?.addEventListener("click", () => {
  tempSelected.forEach((n) => {
    if (!services.some((s) => (s.name || "").toLowerCase() === n.toLowerCase()))
      services.push({ name: n, min: 30, price: "" });
  });
  renderServices();
  pickerEl?.classList.remove("show");
});

/* ===========================
   FORMLAR
   =========================== */
const bizName = $("#bizName"),
  mapUrl = $("#mapUrl"),
  buildingNo = $("#buildingNo"),
  saveBtn = $("#saveBtn");

/* ===========================
   AUTH + DOC YÜKLEME
   =========================== */
let UID = null;
let lastData = {}; // son okunan belge

/* Firestore → UI eşleme (step5.businessLocation & services) */
function materializeData(d) {
  const step5Loc = d?.step5?.businessLocation || {};
  const step2 = d?.step2 || {};
  const name = d?.business?.name || step2.businessName || "İşletmeniz";

  const cityVal = step5Loc.province || "İstanbul";
  const districtVal = step5Loc.district || "";
  const hoodVal = step5Loc.neighborhood || "";
  const buildingVal = step5Loc.building || "";
  const mapLink = step5Loc.mapUrl || "";

  const fromRoot = Array.isArray(d?.services) ? d.services : [];
  const fromStep7 = (d?.step7?.services || []).map((n) => ({
    name: n,
    min: 30,
    price: "",
  }));
  const merged = [...fromRoot, ...fromStep7];

  const uniq = [];
  const seen = new Set();
  merged.forEach((s) => {
    const nm = (s?.name || s || "").toString().trim();
    if (!nm || seen.has(nm.toLowerCase())) return;
    seen.add(nm.toLowerCase());
    if (typeof s === "string") uniq.push({ name: nm, min: 30, price: "" });
    else
      uniq.push({
        name: s.name || "",
        min: s.min ?? 30,
        price: s.price ?? "",
      });
  });

  return {
    business: {
      name,
      address: {
        city: cityVal,
        district: districtVal,
        hood: hoodVal,
        buildingNo: buildingVal,
        mapUrl: mapLink,
      },
    },
    services: uniq,
  };
}

async function prefillFromDoc(d) {
  lastData = d || {};
  const data = materializeData(lastData);

  if (bizName) bizName.value = data.business.name || "";
  fillCities();
  ensureOption(city, data.business.address.city);
  fillDistricts();
  ensureOption(dist, data.business.address.district);
  fillHoods();
  ensureOption(hood, data.business.address.hood);
  if (buildingNo) buildingNo.value = data.business.address.buildingNo || "";
  if (mapUrl) mapUrl.value = data.business.address.mapUrl || "";

  if (lastData?.images?.cover) putThumb($("#coverThumbs"), lastData.images.cover);
  if (lastData?.images?.salon) putThumb($("#salonThumbs"), lastData.images.salon);
  if (lastData?.images?.model) putThumb($("#modelThumbs"), lastData.images.model);

  services =
    data.services.length
      ? data.services
      : [
          { name: "Erkek Saç Kesimi", min: 30, price: 300 },
          { name: "Sakal", min: 20, price: 150 },
          { name: "Saç & sakal", min: 45, price: 400 },
        ];
  renderServices();

  const bmUserNameEl = $("#bmUserName");
  if (bmUserNameEl) bmUserNameEl.textContent = lastData?.step2?.adminName || "Kullanıcı";

  console.log("[prefill] tamamlandı:", data);
}

/* UI → Firestore (yalnızca ilgili alanlara yaz) */
function buildUpdatesForFirestore() {
  const updates = {};
  if (city?.value) updates["step5.businessLocation.province"] = city.value;
  if (dist?.value) updates["step5.businessLocation.district"] = dist.value;
  if (hood?.value) updates["step5.businessLocation.neighborhood"] = hood.value;
  updates["step5.businessLocation.building"] = (buildingNo?.value || "").trim();
  updates["step5.businessLocation.mapUrl"] = (mapUrl?.value || "").trim();

  const normalized = services
    .map((s) => ({
      name: (s.name || "").trim(),
      min: Number(s.min) || 30,
      price: s.price === "" ? "" : Number(s.price),
    }))
    .filter((s) => s.name !== "");

  updates["step7.services"] = normalized.map((s) => s.name);
  updates["services"] = normalized;

  const bn = (bizName?.value || "").trim();
  if (bn) {
    updates["business.name"] = bn;
    updates["step2.businessName"] = bn;
  }

  updates["updatedAt"] = serverTimestamp();
  return updates;
}

/* Auth → belgeyi getir & doldur */
onAuthStateChanged(auth, async (user) => {
  try {
    console.log("[auth] user:", user?.uid || null);
    if (!user) {
      const ret = encodeURIComponent(location.pathname.replace(/^\//, ""));
      location.href = `admin-register-login.html#login?return_to=${ret}`;
      return;
    }

    UID = user.uid;
    const ref = doc(db, "adminOnboarding", UID);
    console.log("[firestore] path:", `adminOnboarding/${UID}`);

    const snap = await getDoc(ref);
    console.log("[firestore] exists:", snap.exists());

    if (!snap.exists()) {
      console.warn("[firestore] Belge yok.");
      await prefillFromDoc({});
      return;
    }
    await prefillFromDoc(snap.data());
  } catch (e) {
    console.error("[firestore] read error:", e?.code, e?.message || e);
    await prefillFromDoc({});
    alert("Firestore okuma hatası: " + (e?.message || e));
  }
});

/* ===========================
   KAYDET → Firestore update/merge
   =========================== */
const saveBtnEl = saveBtn;
saveBtnEl?.addEventListener("click", async () => {
  if (!UID) {
    showToast("Giriş gerekli");
    return;
  }
  const updates = buildUpdatesForFirestore();

  saveBtnEl.disabled = true;
  const old = saveBtnEl.textContent;
  saveBtnEl.textContent = "Kaydediliyor…";
  console.log("[save] updates:", updates);

  try {
    await updateDoc(doc(db, "adminOnboarding", UID), updates);
    showToast("Kaydedildi");
  } catch (e) {
    console.warn(
      "[save] updateDoc hatası, setDoc(merge) deniyorum:",
      e?.code,
      e?.message || e
    );
    try {
      await setDoc(doc(db, "adminOnboarding", UID), updates, { merge: true });
      showToast("Kaydedildi");
    } catch (err) {
      console.error("[save] setDoc hatası:", err?.code, err?.message || err);
      alert("Kaydedilemedi: " + (err?.message || err));
    }
  } finally {
    saveBtnEl.disabled = false;
    saveBtnEl.textContent = old;
  }
});
