import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDocs, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

await new Promise(r => { const t = setInterval(() => { try { getApp(); clearInterval(t); r(); } catch (e) {} }, 300); });
const auth = getAuth(), db = getFirestore(), COL = "alertes_maladie";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ADMIN_EMAIL = "pcinformatique28@gmail.com";
let U = null, ROLE = "", NAME = "", ALL = [], PEND = 0, unsubs = [], pubL = [], mineL = [], admL = [], PH = [], PH0 = 0, TF = { id: "", files: [], n0: 0 }, CUR = "", ZI = { id: "", i: 0 };
const CACHE = {};
const staff = () => !!U && ((U.email === ADMIN_EMAIL && U.emailVerified) || ROLE === "admin");
const SEC = {
  agriculture: { ico: "🌾", nom: "Agriculture", cible: "Culture concernée", ex: "Manioc, banane plantain, tomate, cacao…", tr: "Vent, pluie, insectes, outils, semences, sol contaminé…", cond: "arracher et détruire les plants atteints, ne pas composter, ne pas déplacer plants/semences, nettoyer les outils, prévenir le service agricole." },
  elevage: { ico: "🐔", nom: "Élevage", cible: "Espèce / catégorie d'animaux", ex: "Poulets, porcs, bovins, ovins, caprins…", tr: "Contact direct, aliment, eau, personnes, véhicules, oiseaux sauvages…", cond: "isoler les animaux malades, limiter déplacements et ventes, désinfecter, ne pas consommer ni vendre animaux morts/malades, appeler le service vétérinaire." },
  distribution: { ico: "🚚", nom: "Distribution", cible: "Produit / lot concerné", ex: "Viande, œufs, lait, poisson, légumes (n° de lot, fournisseur)…", tr: "Origine du lot, stockage, transport, contamination croisée…", cond: "suspendre la vente du lot, le stocker à l'écart, tracer fournisseurs et clients, informer les autorités sanitaires." }
};
const GRAV = { faible: ["Faible", "#f9a825"], moyenne: ["Moyenne", "#ef6c00"], elevee: ["Élevée", "#d32f2f"], critique: ["Critique", "#7f0000"] };
const RANK = { faible: 1, moyenne: 2, elevee: 3, critique: 4 };
const ST = { en_attente: "⏳ En attente de validation par l'administration", publiee: "Publiée", close: "Clôturée", rejetee: "❌ Refusée par l'administration" };
const TR = { disponible: ["✅ Traitement disponible", "#2e7d32"], recherche: ["🔬 Traitement en cours de recherche", "#ef6c00"] };
const trs = a => TR[a.traitStatut === "disponible" ? "disponible" : "recherche"];
const tsec = t => t?.seconds || 0;
const ts = a => a.publishedAt?.seconds || a.created?.seconds || 0;
const fmt = t => t?.seconds ? new Date(t.seconds * 1000).toLocaleDateString("fr-FR") : "";

const SEEN = (() => { try { return JSON.parse(localStorage.getItem("alseen") || "{}"); } catch (e) { return {}; } })();
const mark = k => { if (!SEEN[k]) { SEEN[k] = 1; try { localStorage.setItem("alseen", JSON.stringify(SEEN)); } catch (e) {} } };
function unseen() {
  if (staff()) return PEND;
  let n = ALL.filter(a => a.status === "publiee" && a.uid !== U?.uid && !SEEN["p:" + a.id]).length;
  if (U) ALL.filter(a => a.uid === U.uid).forEach(a => {
    if (a.traitEnvoye && !SEEN["t:" + a.id + ":" + tsec(a.traitAt)]) n++;
    if (a.status === "rejetee" && !SEEN["r:" + a.id + ":" + tsec(a.decisionAt)]) n++;
  });
  return n;
}
function badge() {
  let b = $("#albadge");
  if (!b) {
    const bell = document.querySelector('header button[onclick*="notif"]'); if (!bell) return 0;
    bell.style.position = "relative"; bell.insertAdjacentHTML("beforeend", '<i id="albadge" onclick="event.stopPropagation();AL.list()"></i>'); b = $("#albadge");
  }
  const n = unseen(); b.textContent = n > 99 ? "99+" : (n || ""); b.classList.toggle("on", n > 0); return n;
}

const st = document.createElement("style");
st.textContent = `#alb{display:none;position:sticky;top:46px;z-index:900;background:#c62828;color:#fff;height:32px;overflow:hidden;align-items:center;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 2px 6px #0004}#alb.on{display:flex}
#alb .lb{flex:none;background:#7f0000;padding:0 10px;height:100%;display:flex;align-items:center;z-index:2;animation:alp 1s infinite alternate}#alb .tk{flex:1;overflow:hidden;white-space:nowrap}
#alb .tt{display:inline-block;padding-left:100%;animation:alm 30s linear infinite}#alb:active .tt{animation-play-state:paused}#alb .it{padding:0 6px}#alb em{font-style:normal;opacity:.6;padding:0 8px}
@keyframes alm{to{transform:translateX(-100%)}}@keyframes alp{to{background:#b71c1c}}@keyframes alpb{to{transform:scale(1.15)}}
#albadge{display:none;position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:#e53935;color:#fff;font:700 11px/18px sans-serif;font-style:normal;text-align:center;box-shadow:0 0 0 2px #0b1f4d;z-index:5;animation:alpb 1.2s infinite alternate}#albadge.on{display:block}#badge:not(:empty)~#albadge{right:auto;left:-4px}
#alo{display:none;position:fixed;inset:0;z-index:3000;background:#0008}#alo.on{display:block}#alp{position:absolute;inset:0;background:#fff;overflow:auto}
.alh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;background:#b71c1c;color:#fff;padding:10px 12px}.alh button{width:38px;height:38px;border:0;border-radius:50%;background:#fff;color:#b71c1c;font-size:18px;font-weight:700}
.alc0{padding:14px 14px 90px}.alc0 h2{margin:8px 0}.mt{color:#556;font-size:13px}.gb{display:inline-block;color:#fff;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;margin:2px 6px 2px 0}
.alc{display:flex;align-items:center;gap:12px;min-height:84px;border:1px solid #e3e6ee;border-radius:12px;padding:10px;margin:10px 0;box-shadow:0 1px 4px #0002}.alm{flex:1;min-width:0}.alm small{display:block;margin:2px 0 4px}
.alt{width:64px;height:64px;border-radius:10px;object-fit:cover;flex:none}.ph0{display:flex;align-items:center;justify-content:center;background:#f5f7fb;font-size:30px}
.alb2{border-radius:12px;background:#f5f7fb;padding:4px 12px 8px;margin:10px 0}.alb2 h4{margin:8px 0 2px}.alb2 p{margin:4px 0}.alb2.red{background:#ffebee;border:1px solid #ef9a9a}.alb2.ok{background:#e8f5e9}
.trb{border-radius:12px;color:#fff;font-weight:700;padding:10px 12px;margin:10px 0;text-align:center}
.alchips{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.alchips button{width:100%;height:46px;margin:0;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #c62828;background:#fff;color:#c62828;border-radius:23px;font-weight:700;font-size:15px}.alchips button.on{background:#c62828;color:#fff}
.alf{display:block;margin:10px 0;font-weight:700;font-size:14px}.alf small{display:block;font-weight:400;color:#667}.alf input,.alf select,.alf textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccd;border-radius:10px;font:inherit;margin-top:4px}
.alx2{display:block;width:100%;border:0;border-radius:12px;padding:13px;margin:8px 0;font-weight:700;font-size:15px;background:#0b1f4d;color:#fff;text-align:center;text-decoration:none;box-sizing:border-box}.alx2.r{background:#c62828}.alx2.g{background:#2e7d32}.alx2.o{background:#ef6c00}.alx2.k{background:#777}
.phg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}.pht{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#eee}.pht img{width:100%;height:100%;object-fit:cover;display:block}.pht b{position:absolute;top:4px;right:4px;width:26px;height:26px;border-radius:50%;background:#c62828;color:#fff;text-align:center;line-height:26px}
.tfi{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #cfd8dc;border-radius:10px;padding:8px 10px;margin:6px 0;font-weight:400}.tfi b{margin-left:auto;color:#c62828;padding:4px 8px}
#alz{display:none;position:fixed;inset:0;z-index:4000;background:#000e;align-items:center;justify-content:center}#alz.on{display:flex}#alz img{max-width:100%;max-height:85%}#alz button{position:absolute;border:0;background:#fff;color:#000;border-radius:50%;width:44px;height:44px;font-size:22px}#alz .zx{top:12px;right:12px}#alz .zp{left:8px;top:50%}#alz .zn{right:8px;top:50%}#alzc{position:absolute;bottom:14px;color:#fff;font-weight:700}
#drawer .dp a,#drawer .dp .dp-out{display:flex!important;align-items:center;justify-content:center;text-align:center;height:48px!important;padding-top:0!important;padding-bottom:0!important;box-sizing:border-box}
#drawer .dp .dp-out{position:static!important;box-shadow:none!important;margin-top:10px}#drawer .dp a.al-t{background:linear-gradient(135deg,#e53935,#b71c1c)!important;color:#fff!important}#drawer .dp .me{padding:0 44px;box-sizing:border-box}
.alq{background:#fff;color:#c62828;border-radius:12px;padding:1px 9px;font-size:13px;margin-left:8px}`;
document.head.appendChild(st);
document.body.insertAdjacentHTML("beforeend", '<div id="alo"><div id="alp"></div></div><div id="alz"><button class="zx" onclick="AL.zx()">✕</button><button class="zp" onclick="AL.zn(-1)">‹</button><img id="alzi"><button class="zn" onclick="AL.zn(1)">›</button><div id="alzc"></div></div>');

const fileData = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const shrink = (src, max, q) => new Promise((res, rej) => {
  const im = new Image(); im.onerror = rej;
  im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); let o = c.toDataURL("image/jpeg", q); for (let z = q - .1; o.length > 420000 && z > .25; z -= .1) o = c.toDataURL("image/jpeg", z); res(o); };
  im.src = src;
});

function band() {
  const mn = $("#main"); if (!mn) return;
  let b = $("#alb"); if (!b) { b = document.createElement("div"); b.id = "alb"; mn.before(b); b.onclick = () => AL.list(); }
  const L = ALL.filter(a => a.status === "publiee").sort((x, y) => (RANK[y.gravite] || 0) - (RANK[x.gravite] || 0) || ts(y) - ts(x));
  if (!L.length) { b.classList.remove("on"); return; }
  b.innerHTML = `<div class="lb">🚨 ALERTE</div><div class="tk"><div class="tt">${L.map(a => `<span class="it" onclick="event.stopPropagation();AL.v('${a.id}')">${SEC[a.secteur]?.ico || "🚨"} ${esc(a.titre)} (${(GRAV[a.gravite] || [""])[0]}) — ${esc(a.zone || "")} — ${trs(a)[0]}</span>`).join("<em>●</em>")}</div></div>`;
  b.classList.add("on"); b.querySelector(".tt").style.animationDuration = Math.max(20, L.length * 15) + "s";
}
function merge() { const m = new Map(); [...pubL, ...mineL, ...admL].forEach(a => m.set(a.id, a)); ALL = [...m.values()]; PEND = staff() ? ALL.filter(a => a.status === "en_attente").length : 0; band(); badge(); }
const snap = (q, set) => onSnapshot(q, s => { set(s.docs.map(d => ({ id: d.id, ...d.data() }))); merge(); }, e => console.warn("alertes", e.code));
function sub() {
  unsubs.forEach(f => f()); unsubs = []; pubL = []; mineL = []; admL = [];
  const c = collection(db, COL);
  if (staff()) unsubs.push(snap(c, l => admL = l));
  else { unsubs.push(snap(query(c, where("status", "==", "publiee")), l => pubL = l)); if (U) unsubs.push(snap(query(c, where("uid", "==", U.uid)), l => mineL = l)); }
  merge();
}
onAuthStateChanged(auth, async u => {
  U = u; ROLE = ""; NAME = "";
  if (u) { try { const d = await getDoc(doc(db, "users", u.uid)); if (d.exists()) { ROLE = d.data().role || ""; NAME = d.data().nom || ""; } } catch (e) {} }
  sub();
});

const sheet = (body, title) => { $("#alp").innerHTML = `<div class="alh"><button onclick="AL.x()">✕</button><b>${title}</b></div><div class="alc0">${body}</div>`; $("#alo").classList.add("on"); $("#alp").scrollTop = 0; $("#drawer")?.classList.remove("open"); };
const x = () => $("#alo").classList.remove("on");

function list(f) {
  f = f || "all"; const s = staff(), sr = (a, b) => (RANK[b.gravite] || 0) - (RANK[a.gravite] || 0) || ts(b) - ts(a);
  ALL.filter(a => a.status === "publiee").forEach(a => mark("p:" + a.id)); badge();
  const card = a => { const g = GRAV[a.gravite] || GRAV.moyenne, tr = trs(a); return `<div class="alc" style="border-left:6px solid ${g[1]}" onclick="AL.v('${a.id}')">${a.thumb ? `<img class="alt" src="${a.thumb}">` : `<div class="alt ph0">${SEC[a.secteur]?.ico || "🚨"}</div>`}<div class="alm"><b>${esc(a.titre)}</b><small>${SEC[a.secteur]?.nom || ""} · ${esc(a.cible || "")} · 📍 ${esc(a.zone || "")}</small><span class="gb" style="background:${g[1]}">${g[0]}</span>${a.status !== "publiee" ? `<span class="gb" style="background:${a.status === "rejetee" ? "#c62828" : "#ef6c00"}">${ST[a.status] || ""}</span>` : `<span class="gb" style="background:${tr[1]}">${tr[0]}</span>`}</div></div>`; };
  const pub = ALL.filter(a => a.status === "publiee" && (f === "all" || a.secteur === f)).sort(sr);
  const pend = s ? ALL.filter(a => a.status === "en_attente") : [], clo = s ? ALL.filter(a => ["close", "rejetee"].includes(a.status)) : [];
  const mine = !s && U ? ALL.filter(a => a.uid === U.uid && a.status !== "publiee") : [];
  const chip = (k, l) => `<button class="${f === k ? "on" : ""}" onclick="AL.list('${k}')">${l}</button>`;
  sheet(`<div class="alchips">${chip("all", "🚨 Tous")}${Object.entries(SEC).map(([k, v]) => chip(k, v.ico + " " + v.nom)).join("")}</div>
  <button class="alx2 r" onclick="AL.f()">➕ Signaler une maladie</button>
  ${pend.length ? `<h3>⏳ À valider (${pend.length})</h3>${pend.map(card).join("")}` : ""}
  ${mine.length ? `<h3>Mes signalements</h3>${mine.map(card).join("")}` : ""}
  <h3>🚨 Alertes en cours (${pub.length})</h3>${pub.map(card).join("") || "<p class='mt'>Aucune alerte en cours.</p>"}
  ${clo.length ? `<h3>Archives</h3>${clo.map(card).join("")}` : ""}`, "🚨 Alertes maladie");
}

function view(id) {
  const a = ALL.find(z => z.id === id); if (!a) return; CUR = id;
  const g = GRAV[a.gravite] || GRAV.moyenne, s = SEC[a.secteur] || SEC.elevage, adm = staff(), own = !!U && a.uid === U.uid, tr = trs(a);
  if (a.status === "publiee") mark("p:" + id);
  if (own) { if (a.traitEnvoye) mark("t:" + id + ":" + tsec(a.traitAt)); if (a.status === "rejetee") mark("r:" + id + ":" + tsec(a.decisionAt)); }
  badge();
  const blk = (t, v, c) => v ? `<div class="alb2 ${c || ""}"><h4>${t}</h4><p>${esc(v).replace(/\n/g, "<br>")}</p></div>` : "";
  const ban = a.status === "en_attente" ? `<div class="alb2" style="background:#fff3e0;border:1px solid #ffb74d"><h4>⏳ En attente de validation par l'administration</h4><p>Ce signalement n'est pas encore visible du public.</p></div>` : a.status === "rejetee" ? `<div class="alb2 red"><h4>❌ Signalement refusé par l'administration</h4><p>Motif : ${esc(a.motifRefus || "non précisé")}</p></div>` : "";
  const mod = own && !adm && ["en_attente", "rejetee"].includes(a.status) ? `<button class="alx2 o" onclick="AL.f('${id}')">✏️ Corriger et renvoyer à l'administration</button>` : "";
  const lien = /^https?:\/\//i.test(a.traitLien || "") ? `<p><a href="${esc(a.traitLien)}" target="_blank" rel="noopener">🔗 Document officiel en ligne</a></p>` : "";
  const trd = a.traitEnvoye && (adm || own || (a.traitPublic && a.status === "publiee")) ? `<div class="alb2 ok"><h4>📁 Dossier de traitement officiel</h4>${a.traitNote ? `<p>${esc(a.traitNote).replace(/\n/g, "<br>")}</p>` : ""}${lien}<div id="al_trf">${a.traitN ? "⏳ Chargement des fichiers…" : ""}</div></div>` : "";
  const tp = adm ? `<div class="alb2" style="background:#e3f2fd;border:1px solid #90caf9"><h4>💊 Traitement immédiat (admin)</h4>
  <label class="alf">Annonce sur la bande rouge<select id="al_ts"><option value="recherche">🔬 Traitement en cours de recherche</option><option value="disponible">✅ Traitement disponible</option></select></label>
  <label class="alf">Note / protocole pour l'auteur<textarea id="al_tn" rows="3" placeholder="Produit, dosage, mesures immédiates…"></textarea></label>
  <label class="alf">Lien officiel (facultatif)<input id="al_tl" placeholder="https://…"></label>
  <div id="al_tfl"></div>
  <input type="file" id="al_tf" accept="application/pdf,image/*" multiple style="display:none" onchange="AL.ta(this)">
  <button class="alx2 k" onclick="document.getElementById('al_tf').click()">📎 Joindre PDF ou images (max 5)</button>
  <label class="alf"><input type="checkbox" id="al_tpub" style="width:auto"> Visible aussi par le public</label>
  <button class="alx2 g" onclick="AL.ts('${id}')">📨 Envoyer à l'auteur et mettre à jour</button></div>` : "";
  const acts = adm ? `<hr>${a.status !== "publiee" ? `<button class="alx2 g" onclick="AL.set('${id}','publiee')">🚨 Publier en urgence</button>` : `<button class="alx2 k" onclick="AL.set('${id}','close')">✅ Clôturer l'alerte</button>`}${a.status === "en_attente" ? `<button class="alx2 o" onclick="AL.rej('${id}')">❌ Refuser (avec motif)</button>` : ""}<button class="alx2" onclick="AL.f('${id}')">✏️ Compléter / modifier la fiche</button><button class="alx2 k" onclick="AL.del('${id}')">🗑️ Supprimer</button>` : "";
  sheet(`${ban}<span class="gb" style="background:${g[1]}">Gravité : ${g[0]}</span>${a.status === "close" ? `<span class="gb" style="background:#555">${ST.close}</span>` : ""}
  <h2>${s.ico} ${esc(a.titre)}</h2><p class="mt">${s.nom} · ${esc(a.cible || "")} · 📍 ${esc(a.zone || "")}${a.dateApparition ? " · depuis le " + esc(a.dateApparition) : ""}${a.nbCas ? " · " + a.nbCas + " cas" : ""}</p>
  ${a.status === "publiee" || adm || own ? `<div class="trb" style="background:${tr[1]}">${tr[0]}</div>` : ""}
  <div id="al_gal">${a.nPhotos ? '<p class="mt">⏳ Chargement des photos…</p>' : ""}</div>
  ${blk("⚠️ Signes et symptômes", a.symptomes)}${blk("🦠 Transmission / propagation", a.transmission)}
  ${a.remede ? blk("💊 Remède / traitement", a.remede, "ok") : `<div class="alb2"><h4>💊 Remède / traitement</h4><p>Aucun remède ou traitement spécifique confirmé à ce jour.</p></div>`}
  ${trd}${blk("🛡️ Prévention", a.prevention)}${blk("📋 Conduite officielle à tenir", a.conduite, "red")}${blk("☎️ Contacts officiels", a.contactsOff)}
  <p class="mt">Signalé par ${esc(a.auteur || "—")}${a.publishedAt ? " · publié le " + fmt(a.publishedAt) : ""}</p>
  <p class="mt">ℹ️ Information préventive. En cas de doute, contactez les services officiels compétents (vétérinaires, agricoles ou sanitaires).</p>
  ${a.status === "publiee" ? `<button class="alx2" onclick="AL.sh('${id}')">📤 Partager l'alerte</button>` : ""}${mod}<button class="alx2 k" onclick="AL.list()">← Retour aux alertes</button>${tp}${acts}`, "Alerte maladie");
  loadX(id);
}

async function loadX(id) {
  const a = ALL.find(z => z.id === id); if (!a) return;
  const adm = staff(), own = !!U && a.uid === U.uid;
  if (adm) {
    TF = { id, files: [], n0: 0 };
    const f = (k, v) => { const e = $("#al_" + k); if (e) e.value = v; };
    f("ts", a.traitStatut === "disponible" ? "disponible" : "recherche"); f("tn", a.traitNote || ""); f("tl", a.traitLien || "");
    const c = $("#al_tpub"); if (c) c.checked = !!a.traitPublic;
  }
  if (a.nPhotos) try {
    const s = await getDocs(collection(db, COL, id, "photos"));
    CACHE[id] = s.docs.map(d => d.data()).sort((p, q) => p.i - q.i).map(p => p.data);
    const g = $("#al_gal"); if (g && CUR === id) g.innerHTML = `<div class="phg">${CACHE[id].map((p, i) => `<div class="pht" onclick="AL.z('${id}',${i})"><img src="${p}"></div>`).join("")}</div>`;
  } catch (e) { const g = $("#al_gal"); if (g) g.innerHTML = ""; }
  if (a.traitN && (adm || own || (a.traitPublic && a.status === "publiee"))) try {
    const s = await getDocs(collection(db, COL, id, "traitement"));
    const L = s.docs.map(d => ({ k: d.id, ...d.data() })).sort((p, q) => p.k.localeCompare(q.k));
    if (adm && CUR === id) { TF = { id, files: L.map(f => ({ nom: f.nom, type: f.type, size: f.size, data: f.data })), n0: L.length }; tfRender(); }
    const z = $("#al_trf"); if (z && CUR === id) z.innerHTML = L.map(f => f.type.startsWith("image/") ? `<p><b>🖼️ ${esc(f.nom)}</b><br><img src="${f.data}" style="max-width:100%;border-radius:10px"><a class="alx2 g" href="${f.data}" download="${esc(f.nom)}">⬇️ Télécharger</a></p>` : `<a class="alx2 g" href="${f.data}" download="${esc(f.nom)}">📄 ${esc(f.nom)} (${Math.round((f.size || 0) / 1024)} Ko)</a>`).join("");
  } catch (e) { console.warn("traitement", e.code); const z = $("#al_trf"); if (z) z.innerHTML = ""; }
}

function tfRender() { const z = $("#al_tfl"); if (z) z.innerHTML = TF.files.map((f, i) => `<div class="tfi">${f.type.startsWith("image/") ? "🖼️" : "📄"} ${esc(f.nom)} <small>${Math.round((f.size || 0) / 1024)} Ko</small><b onclick="AL.td(${i})">✕</b></div>`).join(""); }
async function tfAdd(inp) {
  const fl = [...inp.files]; inp.value = "";
  for (const f of fl) {
    if (TF.files.length >= 5) { alert("Maximum 5 fichiers."); break; }
    try {
      if (f.type === "application/pdf") { if (f.size > 600 * 1024) { alert(f.name + " : PDF trop lourd (max 600 Ko). Compressez-le ou utilisez le champ « lien »."); continue; } TF.files.push({ nom: f.name, type: f.type, size: f.size, data: await fileData(f) }); }
      else if (f.type.startsWith("image/")) { const d = await shrink(await fileData(f), 1400, .75); TF.files.push({ nom: f.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", size: Math.round(d.length * .75), data: d }); }
      else alert(f.name + " : seuls les PDF et les images sont acceptés.");
    } catch (e) { alert("Fichier illisible : " + f.name); }
    tfRender();
  }
}
async function trSave(id) {
  const v = k => ($("#al_" + k)?.value || "").trim(), lien = v("tl"), stt = v("ts") === "disponible" ? "disponible" : "recherche";
  if (lien && !/^https?:\/\//i.test(lien)) { alert("Le lien doit commencer par http:// ou https://"); return; }
  if (stt === "disponible" && !v("tn") && !TF.files.length && !lien) { alert("Statut « disponible » : ajoutez une note, un fichier ou un lien."); return; }
  try {
    for (let i = 0; i < TF.files.length; i++) { const f = TF.files[i]; await setDoc(doc(db, COL, id, "traitement", "t" + i), { nom: f.nom, type: f.type, size: f.size, data: f.data, created: serverTimestamp() }); }
    for (let i = TF.files.length; i < TF.n0; i++) await deleteDoc(doc(db, COL, id, "traitement", "t" + i));
    TF.n0 = TF.files.length;
    const envoi = !!(v("tn") || TF.files.length || lien);
    await updateDoc(doc(db, COL, id), { traitStatut: stt, traitNote: v("tn"), traitLien: lien, traitN: TF.files.length, traitPublic: !!$("#al_tpub")?.checked, traitEnvoye: envoi, ...(envoi ? { traitAt: serverTimestamp() } : {}), updated: serverTimestamp() });
    alert(envoi ? "📨 Dossier de traitement envoyé à l'auteur." : "Statut mis à jour."); setTimeout(() => view(id), 600);
  } catch (e) { alert("Erreur : " + (e.code || e.message)); }
}

function phRender() { const g = $("#al_ph"); if (!g) return; g.innerHTML = PH.map((p, i) => `<div class="pht"><img src="${p}"><b onclick="AL.pd(${i})">✕</b></div>`).join(""); const n = $("#al_phn"); if (n) n.textContent = PH.length + "/10"; }
async function phAdd(inp) {
  const fl = [...inp.files], room = 10 - PH.length; inp.value = "";
  if (fl.length > room) alert(room > 0 ? "Maximum 10 photos : seules " + room + " photo(s) seront ajoutées." : "Maximum 10 photos atteint.");
  for (const f of fl.slice(0, Math.max(room, 0))) { if (!f.type.startsWith("image/")) continue; try { PH.push(await shrink(await fileData(f), 900, .7)); } catch (e) {} phRender(); }
}
async function loadPh(id) { try { const s = await getDocs(collection(db, COL, id, "photos")); PH = s.docs.map(d => d.data()).sort((p, q) => p.i - q.i).map(p => p.data); PH0 = PH.length; phRender(); } catch (e) {} }
async function savePh(id) {
  for (let i = 0; i < PH.length; i++) await setDoc(doc(db, COL, id, "photos", "p" + i), { i, data: PH[i], created: serverTimestamp() });
  for (let i = PH.length; i < PH0; i++) await deleteDoc(doc(db, COL, id, "photos", "p" + i));
  PH0 = PH.length;
}

function form(id) {
  if (!U) { x(); if (window.A?.go) A.go("login"); else alert("Connectez-vous pour signaler une maladie."); return; }
  const a = id ? (ALL.find(z => z.id === id) || {}) : {}, adm = staff(); PH = []; PH0 = 0;
  const s = a.secteur || ({ eleveur: "elevage", agriculteur: "agriculture", distributeur: "distribution" }[ROLE] || "elevage"), S = SEC[s];
  const opt = (o, v) => Object.entries(o).map(([k, z]) => `<option value="${k}"${k === v ? " selected" : ""}>${Array.isArray(z) ? z[0] : z.ico + " " + z.nom}</option>`).join("");
  sheet(`<label class="alf">Secteur<select id="al_secteur" onchange="AL.sc()">${opt(SEC, s)}</select></label>
  <label class="alf">Nom de la maladie (ou « Maladie inconnue »)<input id="al_titre" value="${esc(a.titre || "")}"></label>
  <label class="alf"><span id="al_cl">${S.cible}</span><input id="al_cible" value="${esc(a.cible || "")}" placeholder="${S.ex}"></label>
  <label class="alf">Zone / localité touchée<input id="al_zone" value="${esc(a.zone || "")}" placeholder="Province, commune, village…"></label>
  <label class="alf">Date d'apparition<input type="date" id="al_date" value="${esc(a.dateApparition || new Date().toISOString().slice(0, 10))}"></label>
  <label class="alf">Nombre de cas / animaux / parcelles atteints<input type="number" min="0" id="al_nb" value="${a.nbCas || ""}"></label>
  <label class="alf">Gravité estimée<select id="al_gravite">${opt(GRAV, a.gravite || "moyenne")}</select></label>
  <label class="alf">Signes et symptômes observés<textarea id="al_sympt" rows="5" placeholder="Décrivez précisément ce que vous voyez : aspect, comportement, mortalité, évolution…">${esc(a.symptomes || "")}</textarea></label>
  <div class="alf">Photos des cas <span id="al_phn" class="mt">0/10</span><small>10 photos maximum, compressées automatiquement.</small><div id="al_ph" class="phg"></div>
  <input type="file" id="al_pf" accept="image/*" multiple style="display:none" onchange="AL.pa(this)"><button type="button" class="alx2 k" onclick="document.getElementById('al_pf').click()">📷 Ajouter des photos</button></div>
  <label class="alf">Transmission / propagation observée<textarea id="al_trans" rows="2">${esc(a.transmission || "")}</textarea><small id="al_trh">${S.tr}</small></label>
  <label class="alf">Votre téléphone (pour être rappelé)<input id="al_contact" value="${esc(a.contact || "")}"></label>
  ${adm ? `<hr><h3>Fiche officielle (admin)</h3>
  <label class="alf">Remède / traitement (si existant)<textarea id="al_remede" rows="3">${esc(a.remede || "")}</textarea></label>
  <label class="alf">Prévention<textarea id="al_prev" rows="3">${esc(a.prevention || "")}</textarea></label>
  <label class="alf">Conduite officielle à tenir<textarea id="al_conduite" rows="4" placeholder="À valider avec les autorités : ${S.cond}">${esc(a.conduite || "")}</textarea></label>
  <label class="alf">Contacts officiels (service, téléphone)<textarea id="al_coff" rows="2">${esc(a.contactsOff || "")}</textarea></label>
  <label class="alf"><input type="checkbox" id="al_urg" style="width:auto" ${a.status === "publiee" ? "checked disabled" : "checked"}> 🚨 Publier en urgence (bande rouge visible par tous)</label>` : `<p class="mt">Votre signalement sera vérifié par l'administration avant publication.</p>`}
  <p id="al_msg" style="color:#c62828;font-weight:700"></p>
  <button id="al_sv" class="alx2 r" onclick="AL.save('${id || ""}')">${adm ? "Enregistrer" : "Envoyer le signalement"}</button><button class="alx2 k" onclick="AL.list()">Annuler</button>`, id ? "Modifier l'alerte" : "Signaler une maladie");
  if (id && a.nPhotos) loadPh(id);
}
function sc() {
  const S = SEC[$("#al_secteur").value]; $("#al_cl").textContent = S.cible; $("#al_cible").placeholder = S.ex; $("#al_trh").textContent = S.tr;
  const c = $("#al_conduite"); if (c) c.placeholder = "À valider avec les autorités : " + S.cond;
}
async function save(id) {
  const g = k => ($("#al_" + k)?.value || "").trim(), msg = $("#al_msg"), adm = staff(), btn = $("#al_sv");
  const d = { secteur: g("secteur"), titre: g("titre"), cible: g("cible"), zone: g("zone"), dateApparition: g("date"), nbCas: Number(g("nb")) || 0, gravite: g("gravite"), symptomes: g("sympt"), transmission: g("trans"), contact: g("contact") };
  if (d.titre.length < 3 || !d.zone || d.symptomes.length < 15) { msg.textContent = "Renseignez le nom, la zone et les symptômes (15 caractères minimum)."; return; }
  if (adm) Object.assign(d, { remede: g("remede"), prevention: g("prev"), conduite: g("conduite"), contactsOff: g("coff") });
  const urg = adm && $("#al_urg")?.checked; if (btn) { btn.disabled = true; btn.textContent = "⏳ Envoi en cours…"; }
  try {
    d.nPhotos = PH.length; d.thumb = PH.length ? await shrink(PH[0], 160, .5) : "";
    let rid = id;
    if (id) await updateDoc(doc(db, COL, id), { ...d, updated: serverTimestamp(), ...(!adm ? { status: "en_attente", motifRefus: "" } : {}), ...(urg && ALL.find(z => z.id === id)?.status !== "publiee" ? { status: "publiee", publishedAt: serverTimestamp() } : {}) });
    else { const r = await addDoc(collection(db, COL), { ...d, uid: U.uid, auteur: NAME || (U.email || "").split("@")[0], role: ROLE, status: urg ? "publiee" : "en_attente", created: serverTimestamp(), ...(urg ? { publishedAt: serverTimestamp() } : {}) }); rid = r.id; }
    try { await savePh(rid); } catch (e) { alert("Alerte enregistrée, mais photos non envoyées : " + (e.code || e.message)); }
    alert(urg ? "🚨 Alerte publiée." : adm ? "✅ Enregistré." : "✅ Signalement envoyé. Il est en attente de validation par l'administration."); setTimeout(() => list(), 400);
  } catch (e) { msg.textContent = "Erreur : " + (e.code || e.message); if (btn) { btn.disabled = false; btn.textContent = adm ? "Enregistrer" : "Envoyer le signalement"; } }
}
async function setSt(id, status) { try { await updateDoc(doc(db, COL, id), { status, updated: serverTimestamp(), ...(status === "publiee" ? { publishedAt: serverTimestamp(), motifRefus: "" } : {}) }); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function rej(id) { const m = (prompt("Motif du refus (communiqué à l'auteur) :") || "").trim(); if (m.length < 5) { alert("Indiquez un motif (5 caractères minimum)."); return; } try { await updateDoc(doc(db, COL, id), { status: "rejetee", motifRefus: m, decisionAt: serverTimestamp(), updated: serverTimestamp() }); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function del(id) { if (!confirm("Supprimer définitivement cette alerte ?")) return; try { await deleteDoc(doc(db, COL, id)); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function share(id) {
  const a = ALL.find(z => z.id === id); if (!a) return;
  const t = `🚨 Alerte maladie Neoferme : ${a.titre} (${a.cible || ""}, ${a.zone || ""})\nSymptômes : ${a.symptomes}\n${trs(a)[0]}\n${a.conduite ? "Conduite à tenir : " + a.conduite + "\n" : ""}${location.origin}${location.pathname}`;
  try { if (navigator.share) await navigator.share({ title: "Alerte maladie", text: t }); else { await navigator.clipboard.writeText(t); alert("Texte copié."); } } catch (e) {}
}
function zshow() { const L = CACHE[ZI.id] || []; $("#alzi").src = L[ZI.i] || ""; $("#alzc").textContent = (ZI.i + 1) + " / " + L.length; }
function zoom(id, i) { ZI = { id, i }; zshow(); $("#alz").classList.add("on"); }
function zn(d) { const L = CACHE[ZI.id] || []; if (!L.length) return; ZI.i = (ZI.i + d + L.length) % L.length; zshow(); }
window.AL = { list, v: view, f: form, sc, save, set: setSt, rej, del, sh: share, x, pa: phAdd, pd: i => { PH.splice(i, 1); phRender(); }, ta: tfAdd, td: i => { TF.files.splice(i, 1); tfRender(); }, ts: trSave, z: zoom, zn, zx: () => $("#alz").classList.remove("on") };

if (window.A?.menu) {
  const m = A.menu;
  A.menu = function () {
    const r = m.apply(this, arguments), dp = document.querySelector("#drawer .dp");
    if (dp && !dp.querySelector(".al-t")) {
      const n = unseen(), h = `<a class="al-t" onclick="AL.list()">🚨 Alertes maladie${n ? `<b class="alq">${staff() ? n + " à valider" : n}</b>` : ""}</a>`;
      const L = [...dp.querySelectorAll("a")], tg = dp.querySelector(".dp-out") || L.find(x => /D[ée]connexion/.test(x.textContent)) || L.find(x => /Connexion/.test(x.textContent)); if (tg) tg.insertAdjacentHTML("beforebegin", h); else dp.insertAdjacentHTML("beforeend", h);
    }
    return r;
  };
}
band(); badge();
