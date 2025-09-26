// ================== Yardımcılar ==================
const TL = (v) =>
  "₺" + Number(v).toLocaleString("tr-TR") + (Number(v) >= 1 ? "+" : "");
const showOv = (id) => document.getElementById(id)?.classList.add("show");
const closeOv = (id) => document.getElementById(id)?.classList.remove("show");

function showToast(msg) {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = '<span class="dot"></span>' + msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
  }, 2200);
  setTimeout(() => wrap.removeChild(t), 2600);
}

// ================== Slider ==================
(function () {
  const slides = [...document.querySelectorAll("[data-slide]")];
  const dots = [...document.querySelectorAll(".dotbar .dot")];
  const btn = document.getElementById("nextSlide");
  if (!slides.length || !btn) return;
  let i = 0;
  function show(n) {
    slides.forEach((im, k) => (im.style.display = k === n ? "block" : "none"));
    dots.forEach((d, k) => d.classList.toggle("active", k === n));
  }
  btn.addEventListener("click", () => {
    i = (i + 1) % slides.length;
    show(i);
  });
  show(0);
})();

// ================== Top Info Bar (scroll) ==================
(function () {
  const bar = document.getElementById("topInfoBar");
  const topbar = document.getElementById("mainTopbar");
  const sentinel = document.querySelector("[data-gallery-sentinel]");
  if (!bar || !sentinel || !topbar) return;
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          bar.classList.remove("show");
          bar.setAttribute("aria-hidden", "true");
          topbar.classList.remove("hide");
        } else {
          bar.classList.add("show");
          bar.setAttribute("aria-hidden", "false");
          topbar.classList.add("hide");
        }
      }),
    { rootMargin: "-80px 0px 0px 0px", threshold: 0.01 }
  );
  io.observe(sentinel);
})();

// ================== Haftalık saatler toggle ==================
(function () {
  const toggle = document.getElementById("toggleWeek");
  const block = document.getElementById("weekBlock");
  const tText = document.getElementById("toggleText");
  if (!toggle || !block || !tText) return;
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    const open = block.classList.toggle("show");
    block.setAttribute("aria-hidden", String(!open));
    tText.textContent = open ? "Gizle" : "Tüm haftayı göster";
  });
})();

// ================== Veri Modeli ==================
const SERVICES = [
  { name: "Erkek Saç Kesimi", price: 800, duration: 40 },
  { name: "Sakal Tıraşı", price: 500, duration: 30 },
  { name: "Saç & Sakal Paket", price: 1200, duration: 60 },
  { name: "Traş", price: 350, duration: 30 },
  { name: "Sakal düzeltme", price: 300, duration: 30 },
  { name: "Çocuk kesimi", price: 450, duration: 30 },
  { name: "Kadın kesimi", price: 900, duration: 30 },
  { name: "Şampuan & saç derisi masajı & krem", price: 300, duration: 25 },
  { name: "Fade + Sakal", price: 950, duration: 45 },
];

let cart = [];
let selectedDate = new Date(2025, 7, 27); // 27 Ağu 2025
let selectedTime = "08:00";

// ================== Zaman yardımcıları ==================
const pad = (n) => n.toString().padStart(2, "0");
const toTimeStr = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
function generateTimes(startHour = 8, endHour = 23, stepMin = 15) {
  const times = [];
  for (let m = startHour * 60; m <= endHour * 60 - stepMin; m += stepMin)
    times.push(toTimeStr(m));
  return times;
}
function isToday(d) {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

// ================== Saat Slotları ==================
const timeSlotWrap = document.getElementById("timeSlotWrap");
function renderTimeSlots() {
  const allTimes = generateTimes(8, 23, 15);
  if (!timeSlotWrap) return;
  timeSlotWrap.innerHTML = "";
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  allTimes.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (t === selectedTime ? " active" : "");
    b.textContent = t;
    if (isToday(selectedDate)) {
      const [hh, mm] = t.split(":").map(Number);
      const m = hh * 60 + mm;
      if (m <= nowMin) b.disabled = true;
    }
    b.onclick = () => {
      if (b.disabled) return;
      selectedTime = t;
      timeSlotWrap
        .querySelectorAll(".slot")
        .forEach((s) => s.classList.remove("active"));
      b.classList.add("active");
    };
    timeSlotWrap.appendChild(b);
  });
  const first = timeSlotWrap.querySelector(".slot:not([disabled])");
  if (first) first.focus();
}

// ================== Sepet ==================
function renderCart() {
  const box = document.getElementById("cartBox");
  const totalEl = document.getElementById("cartTotal");
  if (!box || !totalEl) return;
  if (cart.length === 0) {
    box.innerHTML = '<div class="muted">Sepet boş. Bir hizmet seçin.</div>';
    totalEl.textContent = "₺0";
    return;
  }
  box.innerHTML = cart
    .map(
      (it) => `
    <div class="cart-row">
      <div><strong>${it.name}</strong><div class="small">${
        it.duration
      }dk</div></div>
      <div>${TL(it.price)}</div>
    </div>
  `
    )
    .join("");
  totalEl.textContent = TL(cart.reduce((s, i) => s + Number(i.price), 0));
}

// ================== Tüm Hizmetler Modalı ==================
const svcList = document.getElementById("svcList");
function renderServiceList(filter = "") {
  if (!svcList) return;
  svcList.innerHTML = SERVICES.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  )
    .map(
      (s) => `
      <div class="svc-item">
        <div><div>${s.name}</div><div class="meta">${s.duration}dk</div></div>
        <div style="font-weight:800">${TL(s.price)}</div>
        <button class="btn-mini" data-add="${s.name}">Ekle</button>
      </div>
    `
    )
    .join("");
  svcList.querySelectorAll("[data-add]").forEach((btn) => {
    btn.onclick = () => {
      const nm = btn.getAttribute("data-add");
      const svc = SERVICES.find((x) => x.name === nm);
      cart.push({ ...svc });
      closeOv("svcOv");
      showOv("bookOv");
      renderCart();
      showToast(`‘${nm}’ sepete eklendi`);
    };
  });
}
renderServiceList();
document
  .getElementById("svcSearch")
  ?.addEventListener("input", (e) => renderServiceList(e.target.value));
document
  .getElementById("openAllServices")
  ?.addEventListener("click", () => showOv("svcOv"));

// ================== Tarih Modalı ==================
const months = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const bookDateLabel = document.getElementById("bookDateLabel");
const timeDateLabel = document.getElementById("timeDateLabel");
function fmtDate(d) {
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function updateDateLabels() {
  if (bookDateLabel) bookDateLabel.textContent = fmtDate(selectedDate);
  if (timeDateLabel) timeDateLabel.textContent = fmtDate(selectedDate);
}
updateDateLabels();

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const MIN_Y = TODAY.getFullYear(),
  MIN_M = TODAY.getMonth();
const MAX_Y = TODAY.getFullYear(),
  MAX_M = 11;

const monthSel = document.getElementById("monthSel");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");
const weekHead = document.getElementById("weekHead");
const daysGrid = document.getElementById("daysGrid");
const monthSummary = document.getElementById("monthSummary");

// Select'i sadece bulunduğumuz aydan Aralık’a kadar doldur
if (monthSel) {
  monthSel.innerHTML = months
    .map((nm, i) =>
      i >= MIN_M && i <= MAX_M ? `<option value="${i}">${nm}</option>` : ""
    )
    .join("");
}

function renderWeekHead() {
  if (!weekHead) return;
  weekHead.innerHTML = weekdays
    .map((w) => `<div class="wday">${w}</div>`)
    .join("");
}
function isPastDate(y, m, d) {
  const cand = new Date(y, m, d);
  cand.setHours(0, 0, 0, 0);
  return cand < TODAY;
}
function clampYM(y, m) {
  if (y < MIN_Y || (y === MIN_Y && m < MIN_M)) return { y: MIN_Y, m: MIN_M };
  if (y > MAX_Y || (y === MAX_Y && m > MAX_M)) return { y: MAX_Y, m: MAX_M };
  return { y, m };
}
function updateNavState() {
  const y = selectedDate.getFullYear(),
    m = selectedDate.getMonth();
  if (prevBtn) prevBtn.disabled = y === MIN_Y && m === MIN_M;
  if (nextBtn) nextBtn.disabled = y === MAX_Y && m === MAX_M;
}

function renderDays() {
  if (!monthSel || !daysGrid) return;
  renderWeekHead();

  let y = selectedDate.getFullYear();
  let m = Number(monthSel.value ?? selectedDate.getMonth());
  ({ y, m } = clampYM(y, m));
  if (m < MIN_M) m = MIN_M;
  if (m > MAX_M) m = MAX_M;

  selectedDate = new Date(y, m, Math.max(1, selectedDate.getDate()));
  monthSel.value = String(m);
  if (monthSummary) monthSummary.textContent = `${months[m]} ${y}`;
  daysGrid.innerHTML = "";

  const first = new Date(y, m, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Pzt=0
  const dim = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    daysGrid.insertAdjacentHTML("beforeend", '<div class="dcell blank"></div>');
  }

  const ty = TODAY.getFullYear(),
    tm = TODAY.getMonth(),
    td = TODAY.getDate();

  for (let d = 1; d <= dim; d++) {
    const disabled = isPastDate(y, m, d);
    const isSel =
      d === selectedDate.getDate() &&
      m === selectedDate.getMonth() &&
      y === selectedDate.getFullYear();
    const isTod = y === ty && m === tm && d === td;

    const cell = document.createElement("div");
    cell.className = [
      "dcell",
      disabled ? "disabled" : "",
      isSel ? "active" : "",
      isTod ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    cell.textContent = d;

    if (!disabled) {
      cell.onclick = () => {
        selectedDate = new Date(y, m, d);
        updateDateLabels();
        closeOv("dateOv");
        renderTimeSlots();
      };
    }
    daysGrid.appendChild(cell);
  }

  const _trig = document.querySelector("#dateOv .month-trigger");
  if (_trig) _trig.textContent = months[m];

  updateNavState();
}

if (monthSel) {
  monthSel.onchange = () => {
    selectedDate = new Date(
      selectedDate.getFullYear(),
      Number(monthSel.value),
      1
    );
    renderDays();
  };
}

// ‹ / › butonları (sağlamlaştırılmış)
(function fixMonthNav() {
  if (!prevBtn || !nextBtn || !monthSel) return;
  const setMonthAndRender = (m) => {
    if (m < MIN_M) m = MIN_M;
    if (m > MAX_M) m = MAX_M;
    monthSel.value = String(m);
    const trig = document.querySelector("#dateOv .month-trigger");
    if (trig) trig.textContent = months[m];
    renderDays();
  };
  prevBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMonthAndRender(Number(monthSel.value || MIN_M) - 1);
    },
    { capture: true }
  );
  nextBtn.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMonthAndRender(Number(monthSel.value || MIN_M) + 1);
    },
    { capture: true }
  );
})();

// Tarih modalı açılışı
bookDateLabel?.addEventListener("click", () => {
  if (!monthSel) return;
  const startM = Math.max(selectedDate.getMonth(), MIN_M);
  monthSel.value = String(startM);
  selectedDate = new Date(selectedDate.getFullYear(), startM, 1);
  renderDays();
  showOv("dateOv");
});

// ================== Akış: Randevu, Saat, Ekle ==================
function openBookingWith(service) {
  if (service) cart = [service];
  renderCart();
  updateDateLabels();
  const chosen = document.getElementById("chosenTime");
  if (chosen) chosen.textContent = selectedTime ? "• " + selectedTime : "";
  showOv("bookOv");
}

document.querySelectorAll(".open-book").forEach((b) => {
  b.addEventListener("click", () => {
    const svc = {
      name: b.dataset.name,
      price: Number(b.dataset.price || 0),
      duration: Number(b.dataset.duration || 0),
    };
    openBookingWith(svc);
  });
});

document
  .getElementById("btnOpenBook")
  ?.addEventListener("click", () => openBookingWith());
document.getElementById("stickyBook")?.addEventListener("click", (e) => {
  e.preventDefault();
  openBookingWith();
});
document
  .getElementById("openAdd")
  ?.addEventListener("click", () => showOv("svcOv"));

// Saat modalı tetikleyiciler
const openTime = () => {
  renderTimeSlots();
  updateDateLabels();
  showOv("timeOv");
};
document.getElementById("openTime")?.addEventListener("click", openTime);
document.getElementById("timeDone")?.addEventListener("click", () => {
  closeOv("timeOv");
  const chosen = document.getElementById("chosenTime");
  if (chosen) chosen.textContent = "• " + selectedTime;
});

// ================== Review & Onay ==================
function openReview() {
  const rev = document.getElementById("reviewBody");
  const totalEl = document.getElementById("reviewTotal");
  if (!rev || !totalEl) return;

  const total = cart.reduce((s, i) => s + Number(i.price), 0);
  const totalMin = cart.reduce((m, i) => m + i.duration, 0);

  rev.innerHTML = `
    <div style="text-align:center;font-weight:800">${fmtDate(selectedDate)}<br>
      <span class="muted" style="font-weight:700">${selectedTime} • ${totalMin}dk toplam</span><br>
      <span class="small">MJ&amp;C Studio</span>
    </div>
    <div class="sumbox" style="margin-top:16px">
      ${cart
        .map(
          (i) => `
        <div style="display:flex;justify-content:space-between;font-weight:700;padding:8px 0">
          <span>${i.name}<br><span class="small">${i.duration}dk</span></span>
          <span>${TL(i.price)}</span>
        </div>`
        )
        .join("")}
      <div class="sumrow">
        <span style="font-weight:700">Toplam:</span>
        <span style="font-weight:800">${TL(total)}</span>
      </div>
    </div>
  `;
  totalEl.textContent = TL(total);
  showOv("reviewOv");
}

document.getElementById("goReview")?.addEventListener("click", openReview);

// Onay akışı
// Onay akışı
document.getElementById('confirmBook')?.addEventListener('click', finish);

// finish zaten qOv kapatmayı dener; açık olmayınca sorun yok:
const finish = () => {
  closeOv('qOv'); // açık değilse no-op
  closeOv('reviewOv');
  const doneInfo = document.getElementById('doneInfo');
  if (doneInfo) doneInfo.textContent = `${fmtDate(selectedDate)} • ${selectedTime}`;
  showOv('doneOv');
};

// (Eski satırları SİL)
// document.getElementById('confirmBook')?.addEventListener('click', () => showOv('qOv'));
// document.getElementById('qYes')?.addEventListener('click', finish);
// document.getElementById('qNo')?.addEventListener('click', finish);


// ================== Auth Modal (UI) ==================
(function () {
  const overlay = document.getElementById("authModal");
  if (!overlay) return;

  document.querySelectorAll(".open-auth").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      overlay.classList.add("active");
    });
  });

  overlay.querySelector(".modal-close")?.addEventListener("click", () => {
    overlay.classList.remove("active");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.classList.remove("active");
  });

  // Sekme geçişleri
  const tabs = document.querySelectorAll(".auth-tab");
  const forms = document.querySelectorAll(".auth-form");
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabs.forEach((b) => b.classList.toggle("active", b === btn));
      forms.forEach((f) =>
        f.classList.toggle("active", f.dataset.form === tab)
      );
    });
  });
})();

// ================== Ay Dropdown (custom) ==================
(function customMonthDropdown() {
  const box = document.querySelector("#dateOv .date-selects");
  const select = document.getElementById("monthSel");
  if (!box || !select) return;

  // Tetik butonu
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "month-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.textContent = months[Number(select.value || MIN_M)] || "Ay";

  // Menü
  const menu = document.createElement("div");
  menu.className = "month-menu";
  menu.setAttribute("role", "listbox");

  // Öğeleri doldur (bulunduğumuz ay → Aralık)
  function fillMenu() {
    menu.innerHTML = "";
    months.forEach((nm, i) => {
      if (i < MIN_M || i > MAX_M) return;
      const it = document.createElement("div");
      it.className =
        "month-item" + (String(i) === String(select.value) ? " active" : "");
      it.textContent = nm;
      it.setAttribute("role", "option");
      it.dataset.val = i;
      it.addEventListener("click", () => {
        select.value = String(i);
        trigger.textContent = nm;
        menu.classList.remove("show");
        trigger.setAttribute("aria-expanded", "false");
        renderDays();
      });
      menu.appendChild(it);
    });
  }

  // Başlangıç: bulunduğumuz ayın altına düşme
  select.value = String(Math.max(Number(select.value || MIN_M), MIN_M));
  trigger.textContent = months[Number(select.value)];

  // Etkileşim
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fillMenu();
    menu.classList.toggle("show");
    trigger.setAttribute(
      "aria-expanded",
      menu.classList.contains("show") ? "true" : "false"
    );
  });

  // Dışarı tıkla/Escape kapanışı
  document.addEventListener("click", () => menu.classList.remove("show"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.classList.remove("show");
  });

  // Select değişirse (oklar/select)
  select.addEventListener("change", () => {
    trigger.textContent = months[Number(select.value || MIN_M)];
    [...menu.querySelectorAll(".month-item")].forEach((el) =>
      el.classList.toggle("active", el.dataset.val === String(select.value))
    );
  });

  // Yerleştira
  box.appendChild(trigger);
  box.appendChild(menu);
})();
