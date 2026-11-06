import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

await new Promise(r => { const t = setInterval(() => { try { getApp(); clearInterval(t); r(); } catch (e) {} }, 300); });
const auth = getAuth(), db = getFirestore(), COL = "alertes_maladie";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ADMIN_EMAIL = "pcinformatique28@gmail.com";
let U = null, ROLE = "", NAME = "", ALL = [], PEND = 0, unsubs = [], pubL = [], mineL = [], admL = [];
const staff = () => !!U && ((U.email === ADMIN_EMAIL && U.emailVerified) || ROLE === "admin");
const SEC = {
  agriculture: { ico: "🌾", nom: "Agriculture", cible: "Culture concernée", ex: "Manioc, banane plantain, tomate, cacao…", tr: "Vent, pluie, insectes, outils, semences, sol contaminé…", cond: "arracher et détruire les plants atteints, ne pas composter, ne pas déplacer plants/semences, nettoyer les outils, prévenir le service agricole." },
  elevage: { ico: "🐔", nom: "Élevage", cible: "Espèce / catégorie d'animaux", ex: "Poulets, porcs, bovins, ovins, caprins…", tr: "Contact direct, aliment, eau, personnes, véhicules, oiseaux sauvages…", cond: "isoler les animaux malades, limiter déplacements et ventes, désinfecter, ne pas consommer ni vendre animaux morts/malades, appeler le service vétérinaire." },
  distribution: { ico: "🚚", nom: "Distribution", cible: "Produit / lot concerné", ex: "Viande, œufs, lait, poisson, légumes (n° de lot, fournisseur)…", tr: "Origine du lot, stockage, transport, contamination croisée…", cond: "suspendre la vente du lot, le stocker à l'écart, tracer fournisseurs et clients, informer les autorités sanitaires." }
};
const GRAV = { faible: ["Faible", "#f9a825"], moyenne: ["Moyenne", "#ef6c00"], elevee: ["Élevée", "#d32f2f"], critique: ["Critique", "#7f0000"] };
const RANK = { faible: 1, moyenne: 2, elevee: 3, critique: 4 };
const ST = { en_attente: "⏳ En attente de validation par l'administration", publiee: "Publiée", close: "Clôturée", rejetee: "❌ Refusée par l'administration" };
const ts = a => a.publishedAt?.seconds || a.created?.seconds || 0;
const REJ = () => U ? ALL.filter(a => a.uid === U.uid && a.status === "rejetee").length : 0;
const fmt = t => t?.seconds ? new Date(t.seconds * 1000).toLocaleDateString("fr-FR") : "";

const st = document.createElement("style");
st.textContent = `#alb{display:none;position:sticky;top:46px;z-index:900;background:#c62828;color:#fff;height:32px;overflow:hidden;align-items:center;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 2px 6px #0004}#alb.on{display:flex}
#alb .lb{flex:none;background:#7f0000;padding:0 10px;height:100%;display:flex;align-items:center;z-index:2;animation:alp 1s infinite alternate}#alb .tk{flex:1;overflow:hidden;white-space:nowrap}
#alb .tt{display:inline-block;padding-left:100%;animation:alm 30s linear infinite}#alb:active .tt{animation-play-state:paused}#alb .it{padding:0 6px}#alb em{font-style:normal;opacity:.6;padding:0 8px}
@keyframes alm{to{transform:translateX(-100%)}}@keyframes alp{to{background:#b71c1c}}
#alo{display:none;position:fixed;inset:0;z-index:3000;background:#0008}#alo.on{display:block}#alp{position:absolute;inset:0;background:#fff;overflow:auto}
.alh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;background:#b71c1c;color:#fff;padding:10px 12px}.alh button{width:38px;height:38px;border:0;border-radius:50%;background:#fff;color:#b71c1c;font-size:18px;font-weight:700}
.alc0{padding:14px 14px 90px}.alc0 h2{margin:8px 0}.mt{color:#556;font-size:13px}.gb{display:inline-block;color:#fff;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:700;margin-right:6px}
.alc{border:1px solid #e3e6ee;border-radius:12px;padding:12px;margin:10px 0;box-shadow:0 1px 4px #0002}.alb2{border-radius:12px;background:#f5f7fb;padding:4px 12px 8px;margin:10px 0}.alb2 h4{margin:8px 0 2px}.alb2 p{margin:4px 0}.alb2.red{background:#ffebee;border:1px solid #ef9a9a}.alb2.ok{background:#e8f5e9}
.alchips button{border:1px solid #c62828;background:#fff;color:#c62828;border-radius:20px;padding:6px 12px;margin:0 6px 6px 0;font-weight:700}.alchips button.on{background:#c62828;color:#fff}
.alf{display:block;margin:10px 0;font-weight:700;font-size:14px}.alf small{display:block;font-weight:400;color:#667}.alf input,.alf select,.alf textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccd;border-radius:10px;font:inherit;margin-top:4px}
.alx2{display:block;width:100%;border:0;border-radius:12px;padding:13px;margin:8px 0;font-weight:700;font-size:15px;background:#0b1f4d;color:#fff}.alx2.r{background:#c62828}.alx2.g{background:#2e7d32}.alx2.o{background:#ef6c00}.alx2.k{background:#777}`;
document.head.appendChild(st);
document.body.insertAdjacentHTML("beforeend", '<div id="alo"><div id="alp"></div></div>');

function band() {
  const mn = $("#main"); if (!mn) return;
  let b = $("#alb"); if (!b) { b = document.createElement("div"); b.id = "alb"; mn.before(b); b.onclick = () => AL.list(); }
  const L = ALL.filter(a => a.status === "publiee").sort((x, y) => (RANK[y.gravite] || 0) - (RANK[x.gravite] || 0) || ts(y) - ts(x));
  if (!L.length) { b.classList.remove("on"); return; }
  b.innerHTML = `<div class="lb">🚨 ALERTE</div><div class="tk"><div class="tt">${L.map(a => `<span class="it" onclick="event.stopPropagation();AL.v('${a.id}')">${SEC[a.secteur]?.ico || "🚨"} ${esc(a.titre)} (${(GRAV[a.gravite] || [""])[0]}) — ${esc(a.zone || "")}</span>`).join("<em>●</em>")}</div></div>`;
  b.classList.add("on"); b.querySelector(".tt").style.animationDuration = Math.max(18, L.length * 12) + "s";
}
function merge() { const m = new Map(); [...pubL, ...mineL, ...admL].forEach(a => m.set(a.id, a)); ALL = [...m.values()]; PEND = staff() ? ALL.filter(a => a.status === "en_attente").length : 0; band(); }
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
  f = f || "all"; const s = staff();
  const card = a => { const g = GRAV[a.gravite] || GRAV.moyenne; return `<div class="alc" style="border-left:6px solid ${g[1]}" onclick="AL.v('${a.id}')"><b>${SEC[a.secteur]?.ico || "🚨"} ${esc(a.titre)}</b><br><small>${SEC[a.secteur]?.nom || ""} · ${esc(a.cible || "")} · 📍 ${esc(a.zone || "")}</small><br><span class="gb" style="background:${g[1]}">${g[0]}</span>${a.status !== "publiee" ? `<span class="gb" style="background:${a.status === "rejetee" ? "#c62828" : "#ef6c00"}">${ST[a.status] || ""}</span>` : ""}</div>`; };
  const srt = (a, b) => (RANK[b.gravite] || 0) - (RANK[a.gravite] || 0) || ts(b) - ts(a);
  const pub = ALL.filter(a => a.status === "publiee" && (f === "all" || a.secteur === f)).sort(srt);
  const pend = s ? ALL.filter(a => a.status === "en_attente") : [], clo = s ? ALL.filter(a => ["close", "rejetee"].includes(a.status)) : [];
  const mine = !s && U ? ALL.filter(a => a.uid === U.uid && a.status !== "publiee") : [];
  const chip = (k, l) => `<button class="${f === k ? "on" : ""}" onclick="AL.list('${k}')">${l}</button>`;
  sheet(`<div class="alchips">${chip("all", "Tous")}${Object.entries(SEC).map(([k, v]) => chip(k, v.ico + " " + v.nom)).join("")}</div>
  <button class="alx2 r" onclick="AL.f()">➕ Signaler une maladie</button>
  ${s && pend.length ? `<h3>⏳ À valider (${pend.length})</h3>${pend.map(card).join("")}` : ""}
  <h3>🚨 Alertes en cours (${pub.length})</h3>${pub.map(card).join("") || "<p class='mt'>Aucune alerte en cours.</p>"}
  ${mine.length ? `<h3>Mes signalements</h3>${mine.map(card).join("")}` : ""}
  ${clo.length ? `<h3>Archives</h3>${clo.map(card).join("")}` : ""}`, "🚨 Alertes maladie");
}

function view(id) {
  const a = ALL.find(z => z.id === id); if (!a) return;
  const g = GRAV[a.gravite] || GRAV.moyenne, s = SEC[a.secteur] || SEC.elevage, adm = staff();
  const blk = (t, v, c) => v ? `<div class="alb2 ${c || ""}"><h4>${t}</h4><p>${esc(v).replace(/\n/g, "<br>")}</p></div>` : "";
  const own = !!U && a.uid === U.uid;
  const ban = a.status === "en_attente" ? `<div class="alb2" style="background:#fff3e0;border:1px solid #ffb74d"><h4>⏳ En attente de validation par l'administration</h4><p>Ce signalement n'est pas encore visible du public.</p></div>` : a.status === "rejetee" ? `<div class="alb2 red"><h4>❌ Signalement refusé par l'administration</h4><p>Motif : ${esc(a.motifRefus || "non précisé")}</p></div>` : "";
  const mod = own && !adm && ["en_attente", "rejetee"].includes(a.status) ? `<button class="alx2 o" onclick="AL.f('${id}')">✏️ Corriger et renvoyer à l'administration</button>` : "";
  const acts = adm ? `<hr>${a.status !== "publiee" ? `<button class="alx2 g" onclick="AL.set('${id}','publiee')">🚨 Publier en urgence</button>` : `<button class="alx2 k" onclick="AL.set('${id}','close')">✅ Clôturer l'alerte</button>`}${a.status === "en_attente" ? `<button class="alx2 o" onclick="AL.rej('${id}')">❌ Refuser (avec motif)</button>` : ""}<button class="alx2" onclick="AL.f('${id}')">✏️ Compléter / modifier la fiche</button><button class="alx2 k" onclick="AL.del('${id}')">🗑️ Supprimer</button>` : "";
  sheet(`<span class="gb" style="background:${g[1]}">Gravité : ${g[0]}</span>${a.status !== "publiee" ? `<span class="gb" style="background:#555">${ST[a.status] || ""}</span>` : ""}
  ${ban}<h2>${s.ico} ${esc(a.titre)}</h2><p class="mt">${s.nom} · ${esc(a.cible || "")} · 📍 ${esc(a.zone || "")}${a.dateApparition ? " · depuis le " + esc(a.dateApparition) : ""}${a.nbCas ? " · " + a.nbCas + " cas" : ""}</p>
  ${blk("⚠️ Signes et symptômes", a.symptomes)}${blk("🦠 Transmission / propagation", a.transmission)}
  ${a.remede ? blk("💊 Remède / traitement", a.remede, "ok") : `<div class="alb2"><h4>💊 Remède / traitement</h4><p>Aucun remède ou traitement spécifique confirmé à ce jour.</p></div>`}
  ${blk("🛡️ Prévention", a.prevention)}${blk("📋 Conduite officielle à tenir", a.conduite, "red")}${blk("☎️ Contacts officiels", a.contactsOff)}
  <p class="mt">Signalé par ${esc(a.auteur || "—")}${a.publishedAt ? " · publié le " + fmt(a.publishedAt) : ""}</p>
  <p class="mt">ℹ️ Information préventive. En cas de doute, contactez les services officiels compétents (vétérinaires, agricoles ou sanitaires).</p>
  ${a.status === "publiee" ? `<button class="alx2" onclick="AL.sh('${id}')">📤 Partager l'alerte</button>` : ""}${mod}<button class="alx2 k" onclick="AL.list()">← Retour aux alertes</button>${acts}`, "Alerte maladie");
}

function form(id) {
  if (!U) { x(); if (window.A?.go) A.go("login"); else alert("Connectez-vous pour signaler une maladie."); return; }
  const a = id ? (ALL.find(z => z.id === id) || {}) : {}, adm = staff();
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
  <label class="alf">Transmission / propagation observée<textarea id="al_trans" rows="2">${esc(a.transmission || "")}</textarea><small id="al_trh">${S.tr}</small></label>
  <label class="alf">Votre téléphone (pour être rappelé)<input id="al_contact" value="${esc(a.contact || "")}"></label>
  ${adm ? `<hr><h3>Fiche officielle (admin)</h3>
  <label class="alf">Remède / traitement (si existant)<textarea id="al_remede" rows="3">${esc(a.remede || "")}</textarea></label>
  <label class="alf">Prévention<textarea id="al_prev" rows="3">${esc(a.prevention || "")}</textarea></label>
  <label class="alf">Conduite officielle à tenir<textarea id="al_conduite" rows="4" placeholder="À valider avec les autorités : ${S.cond}">${esc(a.conduite || "")}</textarea></label>
  <label class="alf">Contacts officiels (service, téléphone)<textarea id="al_coff" rows="2">${esc(a.contactsOff || "")}</textarea></label>
  <label class="alf"><input type="checkbox" id="al_urg" style="width:auto" ${a.status === "publiee" ? "checked disabled" : "checked"}> 🚨 Publier en urgence (bande rouge visible par tous)</label>` : `<p class="mt">Votre signalement sera vérifié par l'administration avant publication.</p>`}
  <p id="al_msg" style="color:#c62828;font-weight:700"></p>
  <button class="alx2 r" onclick="AL.save('${id || ""}')">${adm ? "Enregistrer" : "Envoyer le signalement"}</button><button class="alx2 k" onclick="AL.list()">Annuler</button>`, id ? "Modifier l'alerte" : "Signaler une maladie");
}
function sc() {
  const S = SEC[$("#al_secteur").value]; $("#al_cl").textContent = S.cible; $("#al_cible").placeholder = S.ex; $("#al_trh").textContent = S.tr;
  const c = $("#al_conduite"); if (c) c.placeholder = "À valider avec les autorités : " + S.cond;
}
async function save(id) {
  const g = k => ($("#al_" + k)?.value || "").trim(), msg = $("#al_msg"), adm = staff();
  const d = { secteur: g("secteur"), titre: g("titre"), cible: g("cible"), zone: g("zone"), dateApparition: g("date"), nbCas: Number(g("nb")) || 0, gravite: g("gravite"), symptomes: g("sympt"), transmission: g("trans"), contact: g("contact") };
  if (d.titre.length < 3 || !d.zone || d.symptomes.length < 15) { msg.textContent = "Renseignez le nom, la zone et les symptômes (15 caractères minimum)."; return; }
  if (adm) Object.assign(d, { remede: g("remede"), prevention: g("prev"), conduite: g("conduite"), contactsOff: g("coff") });
  const urg = adm && $("#al_urg")?.checked;
  try {
    if (id) await updateDoc(doc(db, COL, id), { ...d, updated: serverTimestamp(), ...(!adm ? { status: "en_attente", motifRefus: "" } : {}), ...(urg && ALL.find(z => z.id === id)?.status !== "publiee" ? { status: "publiee", publishedAt: serverTimestamp() } : {}) });
    else await addDoc(collection(db, COL), { ...d, uid: U.uid, auteur: NAME || (U.email || "").split("@")[0], role: ROLE, status: urg ? "publiee" : "en_attente", created: serverTimestamp(), ...(urg ? { publishedAt: serverTimestamp() } : {}) });
    alert(urg ? "🚨 Alerte publiée." : adm ? "✅ Enregistré." : "✅ Signalement envoyé. Il est en attente de validation par l'administration."); setTimeout(() => list(), 400);
  } catch (e) { msg.textContent = "Erreur : " + (e.code || e.message); }
}
async function setSt(id, status) { try { await updateDoc(doc(db, COL, id), { status, updated: serverTimestamp(), ...(status === "publiee" ? { publishedAt: serverTimestamp(), motifRefus: "" } : {}) }); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function rej(id) { const m = (prompt("Motif du refus (communiqué à l'auteur) :") || "").trim(); if (m.length < 5) { alert("Indiquez un motif (5 caractères minimum)."); return; } try { await updateDoc(doc(db, COL, id), { status: "rejetee", motifRefus: m, decisionAt: serverTimestamp(), updated: serverTimestamp() }); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function del(id) { if (!confirm("Supprimer définitivement cette alerte ?")) return; try { await deleteDoc(doc(db, COL, id)); setTimeout(() => list(), 400); } catch (e) { alert("Erreur : " + (e.code || e.message)); } }
async function share(id) {
  const a = ALL.find(z => z.id === id); if (!a) return;
  const t = `🚨 Alerte maladie Neoferme : ${a.titre} (${a.cible || ""}, ${a.zone || ""})\nSymptômes : ${a.symptomes}\n${a.conduite ? "Conduite à tenir : " + a.conduite : ""}\n${location.origin}${location.pathname}`;
  try { if (navigator.share) await navigator.share({ title: "Alerte maladie", text: t }); else { await navigator.clipboard.writeText(t); alert("Texte copié."); } } catch (e) {}
}
window.AL = { list, v: view, f: form, sc, save, set: setSt, rej, del, sh: share, x };

if (window.A?.menu) {
  const m = A.menu;
  A.menu = function () {
    const r = m.apply(this, arguments), dp = document.querySelector("#drawer .dp");
    if (dp && !dp.querySelector(".al-l")) {
      const css = "background:linear-gradient(135deg,#e53935,#b71c1c);color:#fff;border-radius:14px;padding:14px 16px;margin:10px 0;box-shadow:0 3px 8px #0003";
      const h = `<a class="al-l" style="${css}" onclick="AL.list()">🚨 Alertes maladie${PEND ? ` (${PEND} à valider)` : ""}${REJ() ? ` (${REJ()} refusée${REJ() > 1 ? "s" : ""})` : ""}</a><a style="${css}" onclick="AL.f()">➕ Signaler une maladie</a>`;
      const hr = dp.querySelector("hr"); if (hr) hr.insertAdjacentHTML("afterend", h); else dp.insertAdjacentHTML("beforeend", h);
    }
    return r;
  };
}
band();
