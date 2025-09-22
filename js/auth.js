// js/auth.js  (v2 — single source of truth: ./firebase.js)

// --- Projenin tek Firebase giriş noktası ---
import { auth, db } from "./firebase.js";

// Sadece gerekli SDK fonksiyonlarını al (init yok!)
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/* ================= helpers ================= */
const $ = (sel, root = document) => root.querySelector(sel);

const _setModalState = (open) => {
  const overlay = $("#authModal");
  if (!overlay) return;
  if (overlay.hasAttribute("aria-hidden")) {
    overlay.setAttribute("aria-hidden", open ? "false" : "true");
  } else {
    overlay.classList.toggle("active", open);
  }
  document.body.classList.toggle("no-scroll", open);
};
const openModal  = () => _setModalState(true);
const closeModal = () => _setModalState(false);

const showToast = (msg = "İşlem başarılı") => {
  const bubble = $("#toast");
  if (bubble) {
    bubble.textContent = msg;
    bubble.classList.add("show");
    setTimeout(() => bubble.classList.remove("show"), 2200);
    return;
  }
  const wrap = document.getElementById("toastWrap");
  if (wrap) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = '<span class="dot"></span>' + msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(6px)"; }, 2200);
    setTimeout(() => wrap.removeChild(t), 2600);
  }
};

const mapError = (code) => {
  switch (code) {
    case "auth/email-already-in-use":    return "Bu e-posta zaten kayıtlı.";
    case "auth/invalid-email":           return "Geçerli bir e-posta girin.";
    case "auth/weak-password":           return "Şifre en az 6 karakter olmalı.";
    case "auth/user-not-found":
    case "auth/wrong-password":          return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests":       return "Çok fazla deneme. Bir süre sonra tekrar deneyin.";
    case "auth/popup-closed-by-user":    return "Pencere kapatıldı. Tekrar deneyin.";
    case "auth/cancelled-popup-request": return "Önceki pencere kapatıldı.";
    case "auth/popup-blocked":           return "Tarayıcı açılır pencereyi engelledi.";
    default:                             return "İşlem sırasında bir hata oluştu.";
  }
};

/* ================ UI helpers ================ */
const switchToProfileLinks = () => {
  document.querySelectorAll(".open-auth").forEach((el) => {
    if (el.tagName === "A") {
      el.classList.remove("open-auth");
      el.classList.add("to-profile");
      el.setAttribute("href", "user-profile.html");
      const span = el.querySelector(".auth-text");
      if (span) span.textContent = "Profilim"; else el.textContent = "Profilim";
      const clone = el.cloneNode(true);
      el.replaceWith(clone);
      return;
    }
    const a = document.createElement("a");
    a.href = "user-profile.html";
    a.className = el.className.split(" ").filter(c => c && c !== "open-auth").join(" ").trim();
    a.classList.add("to-profile");
    a.innerHTML = el.innerHTML;
    const span = a.querySelector(".auth-text");
    if (span) span.textContent = "Profilim"; else a.textContent = "Profilim";
    el.replaceWith(a);
  });
};

const switchToAuthButtons = () => {
  document.querySelectorAll(".to-profile").forEach((el) => {
    if (el.tagName === "A") {
      el.classList.remove("to-profile");
      el.classList.add("open-auth");
      el.setAttribute("href", "#");
      const span = el.querySelector(".auth-text");
      if (span) span.textContent = "Giriş / Kayıt"; else el.textContent = "Giriş / Kayıt";
      const clone = el.cloneNode(true);
      clone.addEventListener("click", (e) => { e.preventDefault(); openModal(); }, { once: true });
      el.replaceWith(clone);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = el.className.split(" ").filter(c => c && c !== "to-profile").join(" ").trim();
    btn.classList.add("open-auth");
    btn.innerHTML = el.innerHTML;
    const span = btn.querySelector(".auth-text");
    if (span) span.textContent = "Giriş / Kayıt"; else btn.textContent = "Giriş / Kayıt";
    btn.addEventListener("click", openModal);
    el.replaceWith(btn);
  });
};

const setAuthLabels = (text) => {
  document.querySelectorAll(".auth-text").forEach((el) => (el.textContent = text));
  document.querySelectorAll(".open-auth").forEach((el) => { if (!el.querySelector(".auth-text")) el.textContent = text; });
  document.querySelectorAll(".to-profile").forEach((el) => { if (!el.querySelector(".auth-text")) el.textContent = text; });
};

/* ================ tab switch ================ */
document.querySelectorAll(".auth-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.toggle("active", f.dataset.form === tab));
  });
});

/* ================ forms ================ */
const loginForm  = $("#loginForm");
const signupForm = $("#signupForm");
const loginErr   = $("#loginError");
const signupErr  = $("#signupError");

// Kayıt
signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  signupErr.textContent = "";

  const email = e.target.email.value.trim();
  const pass  = e.target.password.value;
  const conf  = e.target.confirm.value;

  if (!email || !pass || !conf) { signupErr.textContent = "Lütfen tüm alanları doldurun."; return; }
  if (pass !== conf)            { signupErr.textContent = "Şifreler eşleşmiyor."; return; }

  const btn = signupForm.querySelector(".auth-btn");
  btn.disabled = true;

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, "users", user.uid), {
      email,
      displayName: user.displayName || null,
      createdAt: serverTimestamp(),
      provider: "password",
    }, { merge: true });

    e.target.reset();
    closeModal();
    showToast("Giriş yapıldı");
    switchToProfileLinks();
    setAuthLabels("Profilim");
  } catch (err) {
    signupErr.textContent = mapError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

// Giriş
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErr.textContent = "";

  const email = e.target.email.value.trim();
  const pass  = e.target.password.value;
  if (!email || !pass) { loginErr.textContent = "E-posta ve şifre zorunludur."; return; }

  const btn = loginForm.querySelector(".auth-btn");
  btn.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    e.target.reset();
    closeModal();
    showToast("Giriş yapıldı");
    switchToProfileLinks();
    setAuthLabels("Profilim");
  } catch (err) {
    loginErr.textContent = mapError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

/* ============== Google ile Giriş ============== */
const googleBtn = document.querySelector("#googleSignIn") || document.querySelector("#authModal .social.google");
if (googleBtn) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    try {
      await signInWithPopup(auth, provider);
      closeModal();
      showToast("Giriş yapıldı");
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
        try {
          await signInWithRedirect(auth, provider);
        } catch (e2) {
          showToast(mapError(e2.code));
          console.error("Google redirect error:", e2);
        }
      } else {
        showToast(mapError(err.code));
        console.error("Google sign-in error:", err);
      }
    } finally {
      googleBtn.disabled = false;
    }
  });

  // Redirect dönüşünde sonucu yakala
  getRedirectResult(auth)
    .then((res) => { if (res?.user) { closeModal(); showToast("Giriş yapıldı"); } })
    .catch((err) => console.error("getRedirectResult:", err));
}

/* ============== Oturum Dinleyici ============== */
let firstAuthCheck = true;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await setDoc(doc(db, "users", user.uid), {
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        provider: user.providerData?.[0]?.providerId || "password",
        lastLoginAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("users doc merge error:", e);
    }

    switchToProfileLinks();
    setAuthLabels("Profilim");
    closeModal();
    if (!firstAuthCheck) {
      // ekstra toast yok; gerçek işlemlerde zaten gösterildi
    }
  } else {
    switchToAuthButtons();
    setAuthLabels("Giriş / Kayıt");
  }
  firstAuthCheck = false;
});

/* ============== Global Çıkış ============== */
window.appSignOut = async () => {
  try {
    await signOut(auth);
    showToast("Çıkış yapıldı");
  } catch (e) {
    console.error(e);
  }
};
