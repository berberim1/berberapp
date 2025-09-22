// js/firebase.js  (v4.2 — explicit Storage bucket + App Check debug-only + küçük loglar)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

import {
  getStorage,
  connectStorageEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js";

/* ========= Firebase config =========
   Not: storageBucket konsol ile aynı domain (firebasestorage.app).
   Yine de aşağıda getStorage(...) ile explicit bucket geçiyoruz. */
const firebaseConfig = {
  apiKey: "AIzaSyBLzbyeKVCvKGtXlOOJI_Ki1dQeIFiiVNo",
  authDomain: "my-barber-system.firebaseapp.com",
  projectId: "my-barber-system",
  storageBucket: "my-barber-system.firebasestorage.app",
  messagingSenderId: "1042627764617",
  appId: "1:1042627764617:web:9dfb36d8f2a0443e1a4158",
  measurementId: "G-HBBNK2J38R",
};

/* ========= App init ========= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* —— Bazı gstatic modülleri window.process arıyor —— */
if (typeof window !== "undefined" && !window.process) {
  window.process = { env: {} };
}

/* ========= App Check =========
   Localhost’ta debug token; prod’da reCAPTCHA v3 site key.
   (Debug token değeri konsola yazılır; Console > App Check > Manage debug tokens'a ekleyebilirsin.) */
const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocalhost) {
  // SAKIN prod’da bırakma: sadece yerel geliştirme için.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.log("[app-check] Debug token modu açık (localhost). Konsolda token görünecek.");
}
const { initializeAppCheck, ReCaptchaV3Provider } =
  await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-check.js");

// Console > App Check > Apps (Web) kısmındaki reCAPTCHA v3 site key
const APP_CHECK_SITE_KEY = "6LeOxMgrAAAAANHG5q2IiflzNs-VCHBjzRIvSmPN";

export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

/* --- Auth --- */
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) =>
  console.warn("[auth] setPersistence:", e?.message || e)
);
auth.useDeviceLanguage?.();

/* --- Firestore --- */
const params = new URLSearchParams(location.search);
const firestoreOptions = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
};
if (params.get("forceLP") === "1") {
  firestoreOptions.experimentalForceLongPolling = true;
}
export const db = initializeFirestore(app, firestoreOptions);

/* --- Storage ---
   ÖNEMLİ: SDK’nın yanlış endpoint tahmin etmemesi için explicit bucket veriyoruz. */
export const storage = getStorage(app, "gs://my-barber-system.firebasestorage.app");

/* ========= Functions ========= */
export const functions = getFunctions(app, "europe-west3");

/* ========= Emulators (opsiyonel) ========= */
const useEmulators = params.get("emu") === "1";
if (useEmulators) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    console.log("[firebase] Emulators enabled");
  } catch (e) {
    console.warn("[firebase] Emulator connect error:", e);
  }
}

/* ========= Yardımcılar ========= */
export function awaitUser(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const to = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, timeoutMs);

    import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js")
      .then(({ onAuthStateChanged }) => {
        onAuthStateChanged(
          auth,
          (u) => { if (!settled) { settled = true; clearTimeout(to); resolve(u); } },
          () => { if (!settled) { settled = true; clearTimeout(to); resolve(null); } }
        );
      })
      .catch(() => {
        if (!settled) { settled = true; clearTimeout(to); resolve(null); }
      });
  });
}

/* ========= Exports ========= */
export { serverTimestamp };
