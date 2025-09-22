// js/auth.js  (type="module" ile çağrılır)

// --- Firebase SDK (modüler) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-functions.js";

// --- 1) Proje ayarların ---
const firebaseConfig = {
  apiKey: "AIzaSyBLzbyeKVCvKGtXlOOJI_Ki1dQeIFiiVNo",
  authDomain: "my-barber-system.firebaseapp.com",
  projectId: "my-barber-system",
  storageBucket: "my-barber-system.appspot.com",
  messagingSenderId: "1042627764617",
  appId: "1:1042627764617:web:9dfb36d8f2a0443e1a4158",
  measurementId: "G-HBBNK2J38R",
};

// --- 2) Init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
getFunctions(app); // Şimdilik kullanılmıyor ama dursun

// --- 3) Yardımcılar ---
const $ = (sel, root = document) => root.querySelector(sel);

const _setModalState = (open) => {
  const overlay = $("#authModal");
  if (!overlay) return;
  // .active (index) ve aria-hidden (örnek sayfa) ikisini de destekle
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
  // index.html'deki toast (#toast) veya örnek sayfadaki toast sisteminden biri olabilir
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
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(6px)'; }, 2200);
    setTimeout(()=> wrap.removeChild(t), 2600);
  }
};

const mapError = (code) => {
  switch (code) {
    case "auth/email-already-in-use":   return "Bu e-posta zaten kayıtlı.";
    case "auth/invalid-email":          return "Geçerli bir e-posta girin.";
    case "auth/weak-password":          return "Şifre en az 6 karakter olmalı.";
    case "auth/user-not-found":
    case "auth/wrong-password":         return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests":      return "Çok fazla deneme. Bir süre sonra tekrar deneyin.";
    case "auth/popup-closed-by-user":   return "Pencere kapatıldı. Tekrar deneyin.";
    case "auth/cancelled-popup-request":return "Önceki pencere kapatıldı.";
    case "auth/popup-blocked":          return "Tarayıcı açılır pencereyi engelledi.";
    default:                            return "İşlem sırasında bir hata oluştu.";
  }
};

// ---------- PROFIL BUTONU DÖNÜŞÜMÜ ----------
const switchToProfileLinks = () => {
  document.querySelectorAll(".open-auth").forEach((el) => {
    if (el.tagName === "A") {
      el.classList.remove("open-auth");
      el.classList.add("to-profile");
      el.setAttribute("href", "user-profile.html");
      const span = el.querySelector(".auth-text");
      if (span) span.textContent = "Profilim"; else el.textContent = "Profilim";
      const clone = el.cloneNode(true); // eski click handlerları temizle
      el.replaceWith(clone);
      return;
    }
    // buton ise <a>’ya çevir
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
      clone.addEventListener("click", (e)=>{ e.preventDefault(); openModal(); }, { once:true });
      el.replaceWith(clone);
      return;
    }
    // güvence: butona çevir
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

// Etiketleri topluca güncelle
const setAuthLabels = (text) => {
  document.querySelectorAll(".auth-text").forEach((el) => (el.textContent = text));
  document.querySelectorAll(".open-auth").forEach((el) => { if (!el.querySelector(".auth-text")) el.textContent = text; });
  document.querySelectorAll(".to-profile").forEach((el) => { if (!el.querySelector(".auth-text")) el.textContent = text; });
};

// ---------- Sekmeler ----------
document.querySelectorAll(".auth-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.toggle("active", f.dataset.form === tab));
  });
});

// ---------- Formlar ----------
const loginForm  = $("#loginForm");
const signupForm = $("#signupForm");
const loginErr   = $("#loginError");
const signupErr  = $("#signupError");

// Kayıt (email/şifre)
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
    showToast("Giriş yapıldı");  // sadece gerçek işlem sonrası

    switchToProfileLinks();
    setAuthLabels("Profilim");

  } catch (err) {
    signupErr.textContent = mapError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

// Giriş (email/şifre)
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
    showToast("Giriş yapıldı");  // sadece gerçek işlem sonrası

    switchToProfileLinks();
    setAuthLabels("Profilim");

  } catch (err) {
    loginErr.textContent = mapError(err.code);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Google ile Giriş ----------
const googleBtn = document.querySelector("#googleSignIn, #authModal .social.google");
if (googleBtn) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    try {
      await signInWithPopup(auth, provider);
      closeModal();
      showToast("Giriş yapıldı"); // popup akışında anında göster
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
        try {
          await signInWithRedirect(auth, provider);
          // redirect dönüşünde aşağıda toast göstereceğiz
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

  // Redirect dönüşünde (Safari/mobil) sonucu yakala ve bir kere toast göster
  getRedirectResult(auth).then((res) => {
    if (res?.user) {
      closeModal();
      showToast("Giriş yapıldı");
    }
  }).catch((err) => {
    console.error("getRedirectResult:", err);
  });
}

// ---------- Oturum Dinleyici ----------
// İlk tetikleme sessiz olsun (yenilemede toast çıkmasın)
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

    // ilk yüklemede toast gösterme
    if (!firstAuthCheck) {
      // burada ekstra toast göstermiyoruz; gerçek girişlerde zaten yukarıda gösterildi
    }
  } else {
    switchToAuthButtons();
    setAuthLabels("Giriş / Kayıt");
    if (!firstAuthCheck) {
      // gerçek çıkış işleminden sonra zaten aşağıdaki appSignOut toast'ı var
    }
  }

  firstAuthCheck = false;
});

// Global çıkış
window.appSignOut = async () => {
  try {
    await signOut(auth);
    showToast("Çıkış yapıldı");
  } catch (e) {
    console.error(e);
  }
};
