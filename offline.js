import * as FS from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let pending = 0, el = null, okT = null, flashT = null, flash = "";
const upd = () => {
  if (!el) return;
  const set = (bg, t) => { el.style.background = bg; el.textContent = t; el.style.display = "block"; };
  if (flash) set("#c62828", flash);
  else if (!navigator.onLine) set("#b26a00", "📴 Hors ligne" + (pending ? " · " + pending + " en attente" : ""));
  else if (pending) set("#1565c0", "🔄 Synchronisation…");
  else if (okT) set("#2e9d5b", "✅ Synchronisé");
  else el.style.display = "none";
};
const done = w => { pending = Math.max(0, pending - 1); if (w && !pending && navigator.onLine) { clearTimeout(okT); okT = setTimeout(() => { okT = null; upd(); }, 2000); } upd(); };
const bad = () => { flash = "⚠️ Une saisie a été refusée par le serveur"; clearTimeout(flashT); flashT = setTimeout(() => { flash = ""; upd(); }, 6000); };

export function initStatus(db) {
  el = document.createElement("div");
  el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:52px;z-index:1400;padding:4px 12px;border-radius:14px;font:600 12px system-ui,sans-serif;color:#fff;display:none;pointer-events:none;box-shadow:0 2px 8px #0004";
  document.body.appendChild(el);
  addEventListener("online", upd); addEventListener("offline", upd);
  pending++; FS.waitForPendingWrites(db).catch(() => {}).finally(() => done(false));
  upd();
}

// Écriture : part dans la file locale Firestore, n'attend pas le serveur hors réseau
export const wr = p => {
  pending++; upd();
  p.then(() => done(true), e => { console.warn("sync", e && e.code); done(false); bad(); });
  return Promise.race([p, new Promise(r => setTimeout(r, navigator.onLine ? 2500 : 0))]);
};
export const addDoc = (c, d) => { const r = FS.doc(c); return wr(FS.setDoc(r, d)).then(() => r); };
export const setDoc = (...a) => wr(FS.setDoc(...a));
export const updateDoc = (...a) => wr(FS.updateDoc(...a));
export const deleteDoc = (...a) => wr(FS.deleteDoc(...a));

// Lecture : serveur si possible, sinon cache local
const slow = p => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("slow")), 6000); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
export const getDocs = q => navigator.onLine ? slow(FS.getDocs(q)).catch(() => FS.getDocsFromCache(q)) : FS.getDocsFromCache(q);
export const getDoc = r => navigator.onLine ? slow(FS.getDoc(r)).catch(() => FS.getDocFromCache(r)) : FS.getDocFromCache(r);
