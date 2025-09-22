/* =============================
🧠 calendar.mobile.js (rev)
============================= */
(() => {
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const mqMobile = window.matchMedia('(max-width: 768px)');


/* 1) Topbar yüksekliği ölç → CSS değişkenine yaz */
function setVars(){
const tb = $('.topbar');
const th = tb?.offsetHeight || 56;
document.documentElement.style.setProperty('--topbar-h', th + 'px');
}
const ro = new ResizeObserver(() => setVars());
window.addEventListener('load', () => {
const tb = $('.topbar'); if (tb) ro.observe(tb);
setVars();
}, { passive:true });
window.addEventListener('orientationchange', setVars, { passive:true });


/* 2) Üst barda küçük avatar (yalnızca mobilde) */
function syncTopAvatar(){
const host = $('.topbar-inner');
const exists = $('#topProfileBtn');
if (mqMobile.matches){
if (!exists && host){
const btn = document.createElement('button');
btn.className = 'avatar-mini';
btn.id = 'topProfileBtn';
btn.type = 'button';
btn.textContent = 'A';
host.appendChild(btn);
}
} else {
exists?.remove();
}
}
window.addEventListener('load', syncTopAvatar, { passive:true });
mqMobile.addEventListener?.('change', syncTopAvatar);
window.addEventListener('resize', syncTopAvatar, { passive:true });


/* 3) Profil (A) → Business Modal toggle */
(function bindBusinessModal(){
const overlay = $('#bmOverlay');
const modal = $('#bmModal');
const close = $('#bmClose');
const openBM = () => { overlay?.classList.add('show'); modal?.classList.add('show'); };
const closeBM = () => { overlay?.classList.remove('show'); modal?.classList.remove('show'); };


document.addEventListener('click', (e) => { if (e.target.closest('#topProfileBtn')) openBM(); });
overlay?.addEventListener('click', closeBM);
close?.addEventListener('click', closeBM);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeBM());
})();