import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, doc, collection, serverTimestamp, updateDoc, arrayUnion, arrayRemove, query, orderBy, limit, increment, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PROVINCES } from "./gabon.js";
import { getDoc, setDoc, addDoc, getDocs, deleteDoc, initStatus } from "./offline.js";

// ---- config Firebase : réutilise firebase-config.js existant ----
let cfg;
try { const m = await import("./firebase-config.js"); cfg = Object.values(m).find(v => v && v.apiKey) || (m.default && m.default.apiKey ? m.default : null); } catch (e) {}
if (!cfg && !getApps().length) { try { const t = await (await fetch("firebase-config.js")).text(); const r = t.match(/\{[^{}]*apiKey[^{}]*\}/); if (r) cfg = new Function("return " + r[0])(); } catch (e) {} }
const app = getApps()[0] || initializeApp(cfg || window.firebaseConfig);
const auth = getAuth(app);
let db; try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch (e) { db = getFirestore(app); }

// ---- Cloudinary (photos du forum) : renseigner le cloud name et le preset « unsigned » ----
const CLOUD = { name: "zbof0xbh", preset: "neoferme_forum" };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STAFF = ["admin", "ministere", "technicien"];
let U = null, UN = "", NOM = "", UP = "", UPF = {}, ROLE = "eleveur", EX = [], SA = [], view = "home", cur = null, mode = "login", map;
const A = window.A = {};
window.$ = $;

const SEC = {
  "Élevage": {
    "Avicole": [["type", "Type", ["Poulets de chair", "Pondeuses", "Mixte", "Pintades"]], ["batiments", "Nb de bâtiments", "number"], ["souche", "Souche / race"]],
    "Porcin": [["stade", "Production", ["Naisseur", "Engraisseur", "Naisseur-engraisseur"]], ["truies", "Nb de truies", "number"]],
    "Bovin": [["type", "Type", ["Viande", "Lait", "Mixte"]], ["race", "Race"], ["paturage", "Pâturage (ha)", "number"]],
    "Ovin-Caprin": [["espece", "Espèce", ["Moutons", "Chèvres", "Les deux"]], ["race", "Race"]],
    "Pisciculture": [["espece", "Espèce", ["Tilapia", "Silure", "Carpe"]], ["bassins", "Nb d'étangs/bassins", "number"], ["eau", "Surface en eau (m²)", "number"]],
    "Apiculture": [["type", "Type de ruche", ["Kenyane", "Langstroth", "Traditionnelle"]]],
    "Cuniculture-Aulacodes": [["espece", "Espèce", ["Lapins", "Aulacodes"]], ["cages", "Nb de cages", "number"]]
  },
  "Agriculture": {
    "Maraîchage": [["cultures", "Cultures (tomate, piment, gombo…)"], ["irrigation", "Irrigation", ["Pluviale", "Arrosage", "Goutte-à-goutte"]]],
    "Vivrier": [["cultures", "Cultures", ["Manioc", "Banane plantain", "Igname", "Taro", "Maïs", "Arachide", "Mixte"]], ["saison", "Saison", ["Grande saison", "Petite saison"]]],
    "Fruitier": [["cultures", "Cultures", ["Ananas", "Agrumes", "Papaye", "Avocat", "Mangue", "Safou"]], ["arbres", "Nb d'arbres", "number"]],
    "Cultures de rente": [["cultures", "Cultures", ["Cacao", "Café", "Palmier à huile", "Hévéa", "Canne à sucre"]], ["age", "Âge des plantations (ans)", "number"]]
  }
};
const fld = ([k, l, t]) => Array.isArray(t)
  ? `<label>${l}<select class="d" data-k="${k}">${t.map(o => `<option>${o}</option>`).join("")}</select></label>`
  : `<label>${l}<input class="d" data-k="${k}" type="${t || "text"}"></label>`;
const num = v => +v || 0;
const mort = e => { const m = SA.filter(s => s.exploId === e.id).reduce((a, s) => a + num(s.morts), 0); return e.effectif ? m / e.effectif * 100 : 0; };
const status = e => mort(e) > 5 ? "#d9534f" : "#2e9d5b";
const isStaff = () => STAFF.includes(ROLE);

// ---- données ----
async function load() {
  try { EX = (await getDocs(collection(db, "exploitations"))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { EX = []; }
  await pullForum();
  if (!U) { SA = []; return; }
  try { SA = (await getDocs(collection(db, "saisies"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(s => isStaff() || s.uid === U.uid); } catch (e) { SA = []; }
}
onAuthStateChanged(auth, async u => {
  U = u; ROLE = "eleveur"; UN = ""; UP = ""; UPF = {};
  if (u) { try { const d = await getDoc(doc(db, "users", u.uid)); ROLE = d.exists() ? (d.data().role || "eleveur") : "eleveur"; UPF = d.exists() ? d.data() : {}; UN = UPF.nom || ""; UP = UPF.photo || ""; } catch (e) {} }
  NOM = UN;
  await load(); track(); watchVis();
  if (u) { if (view === "login") view = "home"; if (location.hash.startsWith("#lot=")) { view = "fiche"; cur = location.hash.slice(5); } }
  else if (!["home", "forum", "membre", "how", "about"].includes(view)) view = "home";
  render();
});

// ---- navigation ----
const canForum = () => !!U && ["admin", "eleveur", "agriculteur"].includes(ROLE);
const PUB = [["home", "🏠", "Accueil"], ["forum", "💬", "Forum"], ["how", "❓", "Aide"], ["about", "ℹ️", "À propos"], ["login", "🔑", "Connexion"]];
const TABS = [["home", "🏠", "Accueil"], ["saisie", "✍️", "Saisie"], ["fermes", "🌾", "Exploitations"], ["national", "📊", "National"], ["trace", "🔎", "Traçabilité"], ["forum", "💬", "Forum"]];
const tabs = () => TABS;
A.go = (v, id) => { if (!U && !["home", "forum", "membre", "how", "about", "login"].includes(v)) v = "login"; view = v; cur = id || null; $("#drawer").classList.remove("open"); window.scrollTo(0, 0); render(); };
A.menu = () => {
  const top = U ? [["home", "🏠", "Accueil"], ["profil", "👤", "Mon profil"], ["forum", "💬", "Forum"], ["notif", "🔔", "Notifications"], ["fermes", "🌾", "Exploitations"], ["saisie", "✍️", "Saisie"], ["national", "📊", "National"], ["trace", "🔎", "Traçabilité"]]
    : [["home", "🏠", "Accueil"], ["forum", "💬", "Forum"], ["login", "🔑", "Connexion"]];
  if (isStaff()) top.push(["admin", "🛠️", "Administration"]);
  if (ROLE === "admin") top.push(["trk", "📡", "Tracking"]);
  const bot = [["how", "❓", "Comment ça marche"], ["about", "ℹ️", "À propos de"]], li = i => `<a onclick="${i[0] === "trk" ? "A.trk()" : `A.go('${i[0]}')`}">${i[1]} ${i[2]}${nbHtml(i[0], "nbi")}${i[0] === "trk" ? `<i class="bd nbt">${newVis() || ""}</i>` : ""}</a>`;
  $("#drawer").innerHTML = `<div class="dp">${U ? `<div class="me" onclick="A.go('profil')">${avatarH()}<b>${esc(UN || "Mon profil")}</b><small>${esc(U.email)}<br>Rôle : ${esc(ROLE)}</small></div>` : "<b>Neoferme</b><br><small>Visiteur</small>"}<hr>${top.map(li).join("")}<div class="sp"></div><hr>${bot.map(li).join("")}${U ? '<a onclick="A.out()">🚪 Déconnexion</a>' : ""}</div><div class="dbg" onclick="A.menu()"></div>`;
  $("#drawer").classList.toggle("open");
};
A.user = () => A.go(U ? "profil" : "login");
A.out = () => { signOut(auth); $("#drawer").classList.remove("open"); };

function render() {
  $("#nav").innerHTML = navH();
  if (view === "notif" && U) { NEWA = unreadAlerts().map(e => e.id); markA(); }
  updBell(); setAvatar(); updBadges();
  $("#adm").style.display = U && isStaff() ? "flex" : "none";
  document.body.classList.remove("fsmap");
  if (map) { map.remove(); map = null; }
  const main = $("#main");
  if (!U && !["home", "forum", "membre", "how", "about"].includes(view)) view = "login";
  if (!U && view === "login") { main.innerHTML = loginV(); return; }
  main.innerHTML = ({ home: homeV, saisie: saisieV, fermes: fermesV, national: nationalV, trace: traceV, notif: notifV, how: howV, about: aboutV, admin: adminV, fiche: ficheV, nouveau: nouveauV, forum: forumV, profil: profilV, membre: membreV }[view] || homeV)();
  if (view === "home" || view === "national") initMap();
  if (view === "nouveau") { A.sect(); A.pre(); }
  if (view === "forum") A.fload();
  if (view === "profil") A.ppre();
  if (view === "membre") A.mload();
}

// ---- connexion ----
const loginV = () => `<div class="card login"><h2>Neoferme</h2><p class="mut">De la ferme à l'assiette · ${mode === "login" ? "connexion" : "créer un compte"}</p>
${mode === "reg" ? `<label>Nom complet<input id="nom"></label><label>Je suis<select id="role"><option value="eleveur">Éleveur</option><option value="agriculteur">Agriculteur</option></select></label>` : ""}
<label>E-mail<input id="em" type="email"></label><label>Mot de passe<span class="pw-wrap"><input id="pw" type="password"><button type="button" class="pw-eye" onclick="A.eye(this)" aria-label="Afficher le mot de passe">👁️</button></span></label>
<button class="b g" onclick="A.auth()">${mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
<button class="b n" onclick="mode='${mode === "login" ? "reg" : "login"}';A.go('login')">${mode === "login" ? "Créer un compte" : "Retour à la connexion"}</button>
<a class="lk" onclick="A.reset()">Mot de passe oublié ?</a><a class="lk" onclick="A.go('home')">← Retour à l'accueil</a><p id="msg" class="err"></p><p class="mut cr">Une réalisation PC-INFORMATIQUE · 11<sup>e</sup> application du studio</p></div>`;
window.mode = "login";
Object.defineProperty(window, "mode", { get: () => mode, set: v => mode = v });
A.auth = async () => {
  const e = $("#em").value.trim(), p = $("#pw").value;
  try {
    if (mode === "login") await signInWithEmailAndPassword(auth, e, p);
    else {
      const c = await createUserWithEmailAndPassword(auth, e, p);
      await setDoc(doc(db, "users", c.user.uid), { email: e, nom: $("#nom").value, role: $("#role").value, created: serverTimestamp() });
      ROLE = $("#role").value; sendEmailVerification(c.user);
    }
  } catch (x) { $("#msg").textContent = x.code || x.message; }
};
A.reset = async () => { const e = $("#em").value.trim(); if (!e) return $("#msg").textContent = "Saisissez votre e-mail"; await sendPasswordResetEmail(auth, e); $("#msg").textContent = "E-mail de réinitialisation envoyé."; };

// ---- accueil : carte au premier plan ----
const alerts = () => EX.filter(e => mort(e) > 5);
// ---- badges de non-lus ----
let NEWA = [];
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage[k]); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage[k] = JSON.stringify(v); } catch (e) {} };
const unreadAlerts = () => { const s = lsGet("nfSA", []); return U ? alerts().filter(e => !s.includes(e.id)) : []; };
const markA = () => lsSet("nfSA", alerts().map(e => e.id));
const fSeen = () => { let v = +lsGet("nfFs", 0); if (!v) { v = Date.now(); lsSet("nfFs", v); } return v; };
const ms = p => p.created && p.created.toMillis ? p.created.toMillis() : 0;
const vis = p => (!p.hidden || (U && (p.uid === U.uid || isStaff()))) && !myHidden().includes(p.id);
const unreadForum = () => { const s = fSeen(); return FP.filter(p => vis(p) && !(U && p.uid === U.uid) && ms(p) > s).length; };
const nbHtml = (id, cls) => { const n = id === "forum" ? unreadForum() : id === "notif" && U ? unreadAlerts().length + unreadForum() + newVis() : 0; return n ? `<i class="${cls}">${n > 99 ? "99+" : n}</i>` : ""; };
const navTabs = () => { const t = [...tabs()]; if (U && isStaff() && !t.some(x => x[0] === "admin")) t.push(["admin", "🛠️", "Admin"]); if (U && ROLE === "admin") t.push(["trk", "📡", "Tracking"]); return t; };
const navH = () => (U ? navTabs() : PUB).map(t => { const k = t[0] === "trk", on = k ? (view === "admin" && atab === "track") : t[0] === "admin" ? (view === "admin" && atab !== "track") : view === t[0]; return `<a class="${on ? "on" : ""}" onclick="${k ? "A.trk()" : `A.go('${t[0]}')`}"><span>${t[1]}</span>${t[2]}${k ? (newVis() ? `<i class="nb">${newVis()}</i>` : "") : nbHtml(t[0], "nb")}</a>`; }).join("");
const updBell = () => { const n = U ? unreadAlerts().length + unreadForum() + newVis() : 0, b = $("#badge"); if (!b) return; b.textContent = n > 99 ? "99+" : n; b.style.display = n ? "flex" : "none"; };
A.fseen = () => { lsSet("nfFs", Date.now()); const n = $("#nav"); if (n) n.innerHTML = navH(); updBell(); };
async function pullForum() { try { FP = (await getDocs(query(collection(db, "forum"), orderBy("created", "desc"), limit(60)))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { FP = []; } }
setInterval(async () => { if (document.visibilityState !== "visible" || view === "forum") return; await pullForum(); const n = $("#nav"); if (n) n.innerHTML = navH(); updBell(); }, 60000);

const tile = (ic, n, l, go) => `<div class="tile" onclick="A.go('${go}')"><span>${ic}</span><b>${n}</b><small>${l}</small></div>`;
const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let F = { q: "", sec: "", cat: "", prov: "", ville: "", st: "" }, ML, MK = {};
const match = e => (!F.sec || e.secteur === F.sec) && (!F.cat || e.categorie === F.cat) && (!F.prov || e.province === F.prov) && (!F.ville || e.ville === F.ville)
  && (F.st !== "alerte" || mort(e) > 5) && (F.st !== "normal" || mort(e) <= 5)
  && (!F.q || norm([e.nom, e.categorie, e.secteur, e.province, e.ville, e.quartier, e.village].join(" ")).includes(norm(F.q)));
const nF = () => ["sec", "cat", "prov", "ville", "st"].filter(k => F[k]).length;
const opts = (a, v, all) => `<option value="">${all}</option>` + a.map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
const catList = () => F.sec ? Object.keys(SEC[F.sec]) : Object.values(SEC).flatMap(Object.keys);
const villeList = () => F.prov ? Object.keys(PROVINCES[F.prov].villes) : Object.values(PROVINCES).flatMap(p => Object.keys(p.villes));
function tilesV() {
  const fl0 = EX.filter(match);
  if (!U) { const n = k => new Set(fl0.map(e => e[k])).size; return tile("🌾", fl0.length, "Exploitations", "home") + tile("🐔", fl0.reduce((a, e) => a + num(e.effectif), 0), "Effectif total", "home") + tile("🗺️", n("province"), "Provinces couvertes", "home") + tile("🏷️", n("categorie"), "Catégories", "home") + tile("🔑", "→", "Se connecter", "login") + tile("➕", "+", "Inscrire mon exploitation", "login"); }
  const fl = fl0, mine = isStaff() ? fl : fl.filter(e => e.uid === U.uid);
  const eff = mine.reduce((a, e) => a + num(e.effectif), 0), mm = mine.length ? (mine.reduce((a, e) => a + mort(e), 0) / mine.length).toFixed(1) : "0.0";
  return tile("🌾", mine.length, isStaff() ? "Exploitations" : "Mes exploitations", "fermes") + tile("🐔", eff, "Effectif total", "fermes") + tile("📉", mm + " %", "Mortalité moyenne", "national")
    + tile("🚨", mine.filter(e => mort(e) > 5).length, "Alertes actives", "notif") + tile("✍️", SA.length, "Saisies", "saisie") + tile("➕", "+", "Ajouter une exploitation", "nouveau");
}
function homeV() {
  return `<div class="srch"><div class="sbar"><span>🔍</span><input id="fq" value="${esc(F.q)}" placeholder="Rechercher : nom, ville, quartier, culture…" oninput="A.filt()"><button onclick="A.fp()">⚙️<i id="fb"></i></button></div>
<div id="fpn" class="fpn${nF() ? " open" : ""}"><label>Secteur<select id="fs" onchange="A.filt('sec')">${opts(Object.keys(SEC), F.sec, "Tous les secteurs")}</select></label>
<label>Catégorie<select id="fc" onchange="A.filt()">${opts(catList(), F.cat, "Toutes les catégories")}</select></label>
<label>Province<select id="fp" onchange="A.filt('prov')">${opts(Object.keys(PROVINCES), F.prov, "Toutes les provinces")}</select></label>
<label>Ville<select id="fv" onchange="A.filt()">${opts(villeList(), F.ville, "Toutes les villes")}</select></label>
${U ? `<label>État<select id="ft" onchange="A.filt()"><option value="">Tous</option><option value="normal" ${F.st === "normal" ? "selected" : ""}>Normal</option><option value="alerte" ${F.st === "alerte" ? "selected" : ""}>En alerte (mortalité élevée)</option></select></label>` : ""}
<button class="b n" onclick="A.freset()">Réinitialiser</button></div></div>
<div id="map" class="map"></div><div id="rs"></div><div class="tiles" id="tl">${tilesV()}</div>${U ? "" : `<p class="mut cr">ℹ️ Des statistiques de visite (pays, ville, heure) sont enregistrées. <a onclick="A.go('about')">En savoir plus</a></p>`}`;
}
A.fp = () => $("#fpn").classList.toggle("open");
A.freset = () => { F = { q: "", sec: "", cat: "", prov: "", ville: "", st: "" }; render(); };
A.filt = k => {
  F.q = $("#fq").value; F.sec = $("#fs").value; F.cat = k === "sec" ? "" : $("#fc").value; F.prov = $("#fp").value; F.ville = k === "prov" ? "" : $("#fv").value; F.st = $("#ft") ? $("#ft").value : "";
  $("#fc").innerHTML = opts(catList(), F.cat, "Toutes les catégories"); $("#fv").innerHTML = opts(villeList(), F.ville, "Toutes les villes");
  refreshHome();
};
A.focus = id => { const m = MK[id]; if (m && map) { $("#map").scrollIntoView({ behavior: "smooth" }); map.setView(m.getLatLng(), 13); m.openPopup(); } };
const pos = e => U && (isStaff() || e.uid === U.uid) ? [e.lat, e.lng] : [+e.lat.toFixed(2), +e.lng.toFixed(2)];
const mkr = e => L.circleMarker(pos(e), { radius: 8, color: "#fff", weight: 2, fillColor: status(e), fillOpacity: .95 })
  .bindPopup(`<b>${esc(e.nom)}</b> ${dem(e)}<br>${esc(e.categorie)} · ${esc(e.ville)}<br><a href="#" onclick="A.go('fiche','${e.id}');return false">${U ? "Voir la fiche" : "Se connecter pour voir la fiche"}</a>`);
function refreshHome() {
  const fl = EX.filter(match), on = F.q || nF(), pts = fl.filter(e => e.lat);
  if (map && ML) {
    ML.clearLayers(); MK = {}; pts.forEach(e => MK[e.id] = mkr(e).addTo(ML));
    if (on && pts.length) map.fitBounds(pts.map(e => [e.lat, e.lng]), { maxZoom: 11, padding: [30, 30] }); else if (!on) map.setView([-0.8, 11.6], 6);
  }
  $("#tl").innerHTML = tilesV(); $("#fb").textContent = nF() || "";
  $("#rs").innerHTML = on ? `<div class="card"><b>${fl.length} résultat(s)</b>${fl.slice(0, 8).map(e => `<div class="row" onclick="A.focus('${e.id}')"><b>${esc(e.nom)} ${dem(e)}</b><small>${esc(e.categorie)} · ${esc(e.ville)} (${esc(e.province)})${U ? " · " + mort(e).toFixed(1) + " %" : ""}</small></div>`).join("")}${fl.length > 8 ? `<p class="mut">+ ${fl.length - 8} autres : affinez la recherche</p>` : ""}${fl.length ? "" : "<p class='mut'>Aucun résultat.</p>"}</div>` : "";
}
function initMap() {
  if (!window.L || !$("#map")) return;
  map = L.map("map", { minZoom: 5, maxBounds: [[-4.8, 8], [2.9, 15]] }).setView([-0.8, 11.6], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { crossOrigin: true, attribution: "© OpenStreetMap" }).addTo(map);
  ML = L.layerGroup().addTo(map);
  new (L.Control.extend({ onAdd() { const b = L.DomUtil.create("a", "fsb"); b.href = "#"; b.title = "Plein écran"; b.textContent = "⛶"; L.DomEvent.disableClickPropagation(b); L.DomEvent.on(b, "click", ev => { L.DomEvent.preventDefault(ev); A.fs(); }); return b; } }))({ position: "topleft" }).addTo(map);
  if (view === "home") refreshHome(); else EX.filter(e => e.lat).forEach(e => mkr(e).addTo(ML));
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => L.marker([p.coords.latitude, p.coords.longitude]).addTo(map).bindPopup("📍 Vous êtes ici"), () => {});
}

// ---- exploitations ----
const fermesV = () => { const l = isStaff() ? EX : EX.filter(e => e.uid === U.uid);
  return `<div class="card"><h3>${isStaff() ? "Toutes les exploitations" : "Mes exploitations"}</h3><button class="b g" onclick="A.go('nouveau')">➕ Ajouter une exploitation</button>
${l.map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${esc(e.nom)} ${dem(e)}</b><small>${esc(e.secteur)} · ${esc(e.categorie)} · ${esc(e.ville)} (${esc(e.province)})</small></div>`).join("") || "<p class='mut'>Aucune exploitation enregistrée.</p>"}</div>`; };
// ---- formulaires enrichis ----
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const FEX = [["nom", "Nom"], ["prenom", "Prénom(s)"], ["sexe", "Sexe", ["Homme", "Femme"]], ["naissance", "Date de naissance", "date"], ["nationalite", "Nationalité"],
  ["profil", "Profil", ["Éleveur", "Agriculteur", "Agro-éleveur (mixte)", "Pisciculteur", "Apiculteur", "Transformateur", "Exploitant forestier", "Autre"]],
  ["niveau", "Niveau d'études", ["Aucun", "Primaire", "Secondaire", "Technique / professionnel", "Supérieur"]], ["experience", "Années d'expérience", "number"],
  ["tel", "Téléphone", "tel"], ["whatsapp", "WhatsApp", "tel"], ["email", "E-mail", "email"],
  ["rprov", "Province de résidence", Object.keys(PROVINCES)], ["rville", "Ville / commune de résidence"], ["rquartier", "Quartier / village de résidence"], ["adresse", "Adresse / point de repère"],
  ["bio", "Biographie / parcours", "textarea"]];
const FZO = [["type", "Type de zone", ["Zone de culture", "Zone d'élevage", "Forêt vierge (primaire)", "Forêt secondaire", "Zone urbaine / périurbaine", "Concession forestière", "Zone humide / mangrove", "Savane / prairie", "Zone mixte"]],
  ["foncier", "Statut foncier", ["Propriété privée / titre foncier", "Terre coutumière / familiale", "Location / bail", "Concession", "Domaine de l'État", "Autre"]],
  ["organisation", "Organisation", ["Exploitant indépendant", "Coopérative", "GIE / groupement", "Association", "Entreprise", "Concession forestière"]],
  ["coop", "Nom de la coopérative / du groupement / de la concession"], ["membres", "Nombre de membres / employés", "number"],
  ["acces", "Accès à l'exploitation", ["Route bitumée", "Piste", "Fleuve / pirogue", "Accès difficile"]], ["dist", "Distance au marché le plus proche (km)", "number"], ["certif", "Labels / certifications"]];
const FCL = [["climat", "Climat local", ["Équatorial humide", "Équatorial de transition", "Tropical de savane", "Littoral océanique"]],
  ["saison", "Saison en cours", ["Grande saison des pluies", "Grande saison sèche", "Petite saison des pluies", "Petite saison sèche"]],
  ["pluvio", "Pluviométrie annuelle (mm)", "number"], ["temp", "Température moyenne (°C)", "number"],
  ["sol", "Type de sol", ["Argileux", "Sableux", "Limoneux", "Latéritique", "Hydromorphe", "Autre"]],
  ["eau", "Source d'eau principale", ["Pluie", "Rivière / fleuve", "Forage / puits", "Réseau SEEG", "Étang / bassin"]],
  ["risques", "Risques climatiques / sanitaires observés", "textarea"]];
const FCH = [["debut", "Début du cycle", MOIS], ["fin", "Fin du cycle", MOIS], ["duree", "Durée d'un cycle (mois)", "number"], ["cycles", "Nombre de cycles par an", "number"],
  ["mensuel", "Chronologie mensuelle (activités mois par mois)", "textarea"], ["trimestriel", "Chronologie trimestrielle (T1 à T4)", "textarea"], ["annuel", "Chronologie annuelle (plan de l'année)", "textarea"]];
const fx = g => ([k, l, t]) => Array.isArray(t)
  ? `<label>${l}<select class="x" data-g="${g}" data-k="${k}"><option value="">— Choisir —</option>${t.map(o => `<option>${o}</option>`).join("")}</select></label>`
  : t === "textarea" ? `<label>${l}<textarea class="x" data-g="${g}" data-k="${k}"></textarea></label>`
  : `<label>${l}<input class="x" data-g="${g}" data-k="${k}" type="${t || "text"}"></label>`;
const blk = (title, g, f) => `<div class="blk"><h4>${title}</h4>${f.map(fx(g)).join("")}</div>`;
const sub = (title, arr, obj, skip = []) => { const r = arr.filter(f => obj && obj[f[0]] && !skip.includes(f[0])); return r.length ? `<div class="blk"><h4>${title}</h4>${r.map(f => `<div class="kv"><small>${esc(f[1])}</small><b>${esc(obj[f[0]])}</b></div>`).join("")}</div>` : ""; };
function nouveauV() {
  return `<div class="card"><h3>Nouvelle exploitation</h3>
${blk("👤 Identité de l'exploitant", "exploitant", FEX)}
<div class="blk"><h4>🏡 Exploitation</h4><label>Nom de l'exploitation<input id="xn"></label>
<label>Secteur<select id="sec" onchange="A.sect()">${Object.keys(SEC).map(s => `<option>${s}</option>`).join("")}</select></label>
<label>Catégorie<select id="cat" onchange="A.cat()"></select></label><div id="dyn"></div>
<label id="effl">Effectif (têtes)<input id="effectif" type="number"></label>
<label>Surface / emprise (ha)<input id="surface" type="number" step="0.01"></label>
<label>Production annuelle estimée (kg)<input id="prod" type="number"></label></div>
${blk("🌳 Zone, foncier et organisation", "zone", FZO)}
<div class="blk"><h4>📍 Localisation</h4><label>Province<select id="prov" onchange="A.prov()">${Object.keys(PROVINCES).map(p => `<option>${p}</option>`).join("")}</select></label>
<label>Ville / commune<select id="ville" onchange="A.ville()"></select></label>
<label>Quartier<input id="quartier" list="ql" placeholder="Choisir ou saisir"></label><datalist id="ql"></datalist>
<label>Village / lieu-dit<input id="village" placeholder="Saisie libre"></label>
<label>Position GPS<div class="gps"><input id="lat" placeholder="Latitude"><input id="lng" placeholder="Longitude"></div></label>
<button class="b n" onclick="A.gps()">📍 Utiliser ma position</button></div>
${blk("🌦️ Climat local et saison", "climat", FCL)}
${blk("🗓️ Chronologie du système de culture / d'élevage", "chrono", FCH)}
<button class="b g" onclick="A.save()">Enregistrer</button><p id="msg" class="err"></p></div>`;
}
A.sect = () => { $("#cat").innerHTML = Object.keys(SEC[$("#sec").value]).map(c => `<option>${c}</option>`).join(""); $("#effl").style.display = $("#sec").value === "Élevage" ? "" : "none"; A.cat(); A.prov(); };
A.cat = () => { $("#dyn").innerHTML = SEC[$("#sec").value][$("#cat").value].map(fld).join(""); };
A.prov = () => { $("#ville").innerHTML = Object.keys(PROVINCES[$("#prov").value].villes).map(v => `<option>${v}</option>`).join(""); A.ville(); };
A.ville = () => { const v = PROVINCES[$("#prov").value].villes[$("#ville").value]; $("#ql").innerHTML = v.q.map(q => `<option value="${q}">`).join(""); };
A.gps = () => navigator.geolocation.getCurrentPosition(p => { $("#lat").value = p.coords.latitude.toFixed(5); $("#lng").value = p.coords.longitude.toFixed(5); }, () => $("#msg").textContent = "GPS indisponible");
A.save = async () => {
  const nom = $("#xn").value.trim(); if (!nom) return $("#msg").textContent = "Nom requis";
  const v = PROVINCES[$("#prov").value].villes[$("#ville").value], details = {};
  document.querySelectorAll(".d").forEach(i => details[i.dataset.k] = i.value);
  const gx = { exploitant: {}, zone: {}, climat: {}, chrono: {} };
  document.querySelectorAll(".x").forEach(i => { if (i.value) gx[i.dataset.g][i.dataset.k] = i.value; });
  const e = { uid: U.uid, nom, secteur: $("#sec").value, categorie: $("#cat").value, details, effectif: num($("#effectif").value), surface: num($("#surface").value), production: num($("#prod").value),
    province: $("#prov").value, ville: $("#ville").value, quartier: $("#quartier").value, village: $("#village").value, lat: parseFloat($("#lat").value) || v.lat, lng: parseFloat($("#lng").value) || v.lng, ...gx, created: serverTimestamp() };
  try { await addDoc(collection(db, "exploitations"), e); await load(); A.go("fermes"); } catch (x) { $("#msg").textContent = x.code || x.message; }
};
function ficheV() {
  const e = EX.find(x => x.id === cur); if (!e) return fermesV();
  const url = location.origin + location.pathname + "#lot=" + e.id;
  return `<div class="card" id="print"><h3>${esc(e.nom)} ${dem(e)}</h3><p>${esc(e.secteur)} · ${esc(e.categorie)}</p>
<p>📍 ${esc([e.village, e.quartier, e.ville, e.province].filter(Boolean).join(", "))}<br>GPS : ${e.lat?.toFixed?.(4)}, ${e.lng?.toFixed?.(4)}</p>
<p>Effectif : ${e.effectif || "–"} · Surface : ${e.surface || 0} ha · Production : ${e.production || 0} kg/an · Mortalité : ${mort(e).toFixed(1)} %</p>
${Object.keys(e.details || {}).length ? `<div class="blk"><h4>Détails de production</h4>${Object.entries(e.details).map(([k, v]) => `<div class="kv"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>` : ""}${sub("👤 Exploitant", FEX, e.exploitant, isStaff() || e.uid === U.uid ? [] : ["tel", "whatsapp", "email", "adresse", "naissance"])}${sub("🌳 Zone et organisation", FZO, e.zone)}${sub("🌦️ Climat local", FCL, e.climat)}${sub("🗓️ Chronologie", FCH, e.chrono)}<p class="mut">Code traçabilité : <b>${e.id}</b></p>
<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(url)}"></div>
<div class="card noprint"><button class="b n" onclick="A.go('membre','${e.profilId || e.uid}')">👤 Profil du propriétaire</button><button class="b g" onclick="print()">🖨️ Imprimer / PDF</button>${e.uid === U.uid || ROLE === "admin" ? `<button class="b r" onclick="A.del('${e.id}')">Supprimer</button>` : ""}</div>`;
}
A.del = async id => { if (confirm("Supprimer cette exploitation ?")) { await deleteDoc(doc(db, "exploitations", id)); await load(); A.go("fermes"); } };

// ---- saisie ----
const saisieV = () => { const l = EX.filter(e => e.uid === U.uid && !e.demo);
  return `<div class="card"><h3>Saisie du jour</h3>${l.length ? `<label>Exploitation<select id="sx">${l.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join("")}</select></label>
<label>Date<input id="sd" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Morts / pertes<input id="sm" type="number" value="0"></label>
<label>Aliment / intrants (kg)<input id="sa" type="number" value="0"></label><label>Vaccins / traitements<input id="sv"></label><button class="b g" onclick="A.saisie()">Enregistrer</button><p id="msg" class="err"></p>`
    : `<p class="mut">Ajoutez d'abord une exploitation.</p><button class="b g" onclick="A.go('nouveau')">➕ Ajouter</button>`}</div>`; };
A.saisie = async () => { try { await addDoc(collection(db, "saisies"), { uid: U.uid, exploId: $("#sx").value, date: $("#sd").value, morts: num($("#sm").value), aliment: num($("#sa").value), vaccin: $("#sv").value, created: serverTimestamp() }); await load(); A.go("home"); } catch (x) { $("#msg").textContent = x.code; } };

// ---- national / notifs / divers ----
const byProv = () => { const o = {}; EX.forEach(e => (o[e.province] ||= []).push(e)); return o; };
const nationalV = () => `<div id="map" class="map"></div><div class="card"><h3>Mortalité moyenne par province (%)</h3>${Object.entries(byProv()).map(([p, l]) => { const m = l.reduce((a, e) => a + mort(e), 0) / l.length; return `<div class="bar"><span>${esc(p)}</span><i style="width:${Math.min(m * 10, 100)}%"></i><b>${m.toFixed(1)}</b></div>`; }).join("") || "<p class='mut'>Pas encore de données.</p>"}</div>`;
const notifV = () => { const nf = unreadForum(), al = alerts();
  return (isStaff() ? visNotif() : "") + `<div class="card"><h3>🔔 Notifications</h3>${nf ? `<div class="row" onclick="A.go('forum')"><b>💬 ${nf} nouvelle(s) publication(s) dans le forum</b><small>Toucher pour lire</small></div>` : ""}${al.map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${NEWA.includes(e.id) ? "🆕 " : ""}${esc(e.nom)}</b><small>Mortalité ${mort(e).toFixed(1)} % (> 5 %) · ${esc(e.ville)}</small></div>`).join("")}${!nf && !al.length ? "<p class='mut'>Aucune notification.</p>" : ""}</div>`; };
const traceV = () => `<div class="card"><h3>🔎 Traçabilité</h3><label>Code de l'exploitation / lot<input id="tc"></label><button class="b g" onclick="A.go('fiche',$('#tc').value.trim())">Rechercher</button></div>`;
const howV = () => `<div class="card"><h3>❓ Comment ça marche</h3><p>1. <b>Inscrivez</b> votre exploitation (élevage ou agriculture).<br>2. <b>Saisie</b> quotidienne : pertes, intrants, vaccins.<br>3. <b>Alertes</b> automatiques si mortalité anormale.<br>4. <b>National</b> : suivi cartographique et statistiques.<br>5. <b>Traçabilité</b> : QR code par exploitation.</p></div>`;
const REAL = [["PC-INFORMATIQUE (ce site)","https://pcinformatique28-cloud.github.io/pc-informatique-site/","Sites, applications & PWA sur mesure"],["AMBI241","https://ambi2412026-debug.github.io/ambi241","Annuaire des bars, restos et boîtes de nuit"],["MAGERANTE","https://magerante241-boop.github.io/magerante/","Caisse et inventaire pour bars, snacks et clubs"],["MALAGA","https://malagagabon-dot.github.io/malaga-gabon/","Location immobilière à Libreville"],["Gabon Sport Connect","https://gabon-sport-connect.web.app","Clubs, fédérations et athlètes"],["LE WORK","https://lework63-2b761.web.app","Clients et techniciens validés"],["BIJOU","https://bijouesno1-bit.github.io/bijou/","Billetterie en ligne sécurisée"],["TROC MAISON","https://trocmaison106-rgb.github.io/troc-maison/","Petites annonces de troc"],["ANEG","https://pcinformatique28-cloud.github.io/aneg-gabon/","Annuaire national des églises"],["LAV","https://gabonlave-spec.github.io/lavegabon/","Laveurs et laveuses au Gabon"]];
const aboutV = () => `<div class="card"><h3>🌱 Neoferme</h3><p><b>De la ferme à l'assiette</b><br>Application de suivi des exploitations agricoles et d'élevage du Gabon : inscription des fermes, saisies quotidiennes, alertes, carte nationale et traçabilité. Version 1.2.</p><span class="chip">11<sup>e</sup> réalisation du studio PC-INFORMATIQUE</span></div>
<div class="card"><h3>👤 Créateur technique</h3><p><b>KOZANGUE ESSONO PATRICK BERTIN</b><br>Informaticien développeur · Fondateur de PC-INFORMATIQUE</p></div>
<div class="card"><h3>🏢 Le studio PC-INFORMATIQUE</h3><p>Studio de développement basé à Libreville, Gabon, spécialisé dans la création de sites, d'applications et de PWA sur mesure pour les entreprises et les particuliers gabonais.</p><a class="lk" href="https://pcinformatique28-cloud.github.io/pc-informatique-site/" target="_blank" rel="noopener">Visiter le site du studio</a></div>
<div class="card"><h3>📁 Nos réalisations</h3>${REAL.map((r, i) => `<a class="row" href="${r[1]}" target="_blank" rel="noopener"><b>${i + 1}. ${r[0]}</b><small>${r[2]}</small></a>`).join("")}<div class="row"><b>11. Neoferme</b><small>Suivi des fermes et traçabilité agricole · vous êtes ici</small></div></div>
<div class="card"><h3>📞 Contact</h3><a class="row" href="mailto:pcinformatique28@gmail.com"><b>✉️ pcinformatique28@gmail.com</b></a><a class="row" href="tel:+24160141924"><b>📞 +241 60 14 19 24</b></a><a class="row" href="https://wa.me/24160141924" target="_blank" rel="noopener"><b>💬 WhatsApp</b></a></div>
<div class="card"><h3>⚖️ Mentions légales</h3><p class="mut"><b>Éditeur :</b> PC-INFORMATIQUE, studio de développement, Libreville, Gabon.<br><b>Données :</b> les informations saisies servent uniquement au fonctionnement de l'application et au suivi des exploitations. Elles sont hébergées via Firebase (Authentification, Firestore).<br><b>Statistiques de visite :</b> à chaque session, le pays et la ville approximatifs (déduits de l'adresse IP via le service ipwho.is, l'adresse IP n'étant pas conservée), le type d'appareil, la page et l'heure sont enregistrés pour des statistiques et la sécurité. Ces données ne sont consultables que par les administrateurs.</p></div>`;

// ---- administration : synthèses et exports ----
function group(k) { const o = {}; EX.forEach(e => { const g = o[k(e)] ||= { n: 0, eff: 0, surf: 0, prod: 0 }; g.n++; g.eff += num(e.effectif); g.surf += num(e.surface); g.prod += num(e.production); }); return o; }
const tbl = (t, o) => { const r = Object.entries(o), s = f => r.reduce((a, [, g]) => a + g[f], 0);
  return `<h4>${t}</h4><table><tr><th>${t.split(" ").pop()}</th><th>Expl.</th><th>Effectif</th><th>Surf. ha</th><th>Prod. kg</th></tr>${r.map(([k, g]) => `<tr><td>${esc(k)}</td><td>${g.n}</td><td>${g.eff}</td><td>${g.surf.toFixed(1)}</td><td>${g.prod}</td></tr>`).join("")}<tr class="tot"><td>TOTAL</td><td>${s("n")}</td><td>${s("eff")}</td><td>${s("surf").toFixed(1)}</td><td>${s("prod")}</td></tr></table>`; };
function synthV() {
  return `<div class="card noprint"><h3>🛠️ Administration</h3><button class="b g" onclick="print()">🖨️ Imprimer / enregistrer en PDF</button><button class="b n" onclick="A.csv()">📄 Export CSV (Excel)</button><p class="mut">Pour un PDF : Imprimer → « Enregistrer au format PDF ».</p></div>${demoCard()}
<div class="card" id="print"><h3>Neoferme — Synthèse nationale (${new Date().toLocaleDateString("fr-FR")})</h3>${tbl("Synthèse par catégorie", group(e => e.secteur + " / " + e.categorie))}${tbl("Synthèse par province", group(e => e.province))}
<h4>Fiches individuelles</h4><table><tr><th>Nom</th><th>Catégorie</th><th>Lieu</th><th>Eff.</th><th>Mort. %</th><th class="noprint">Action</th></tr>${EX.map(e => `<tr onclick="A.go('fiche','${e.id}')"><td>${esc(e.nom)} ${dem(e)}</td><td>${esc(e.categorie)}</td><td>${esc(e.ville)}</td><td>${e.effectif || ""}</td><td>${mort(e).toFixed(1)}</td><td class="noprint"><button class="mini" onclick="event.stopPropagation();A.adel('${e.id}')">🗑️</button></td></tr>`).join("")}</table></div>`;
}
A.csv = () => { const h = ["id", "nom", "secteur", "categorie", "province", "ville", "quartier", "village", "lat", "lng", "effectif", "surface_ha", "production_kg", "mortalite_%"];
  const r = EX.map(e => [e.id, e.nom, e.secteur, e.categorie, e.province, e.ville, e.quartier, e.village, e.lat, e.lng, e.effectif, e.surface, e.production, mort(e).toFixed(1)].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + h.join(";") + "\n" + r.join("\n")], { type: "text/csv" })); a.download = "neoferme-exploitations.csv"; a.click(); };

// ---- forum ----
const day = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");
let FP = [], FIMG = [], FOPEN = {}, FCM = {}, FQ = 10;
const myHidden = () => { try { return JSON.parse(localStorage.nfHid || "[]"); } catch (e) { return []; } };
const ago = t => (t && t.toDate ? t.toDate() : new Date()).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const who = () => UN || (U.email || "membre").split("@")[0];
const okImg = u => typeof u === "string" && u.startsWith("https://res.cloudinary.com/");
const needBox = () => !U
  ? `<div class="card"><h3>💬 Forum Neoferme</h3><p>🔒 La lecture est ouverte à tous. <b>Inscrivez-vous</b> pour publier, commenter et aimer les publications.</p><button class="b g" onclick="mode='reg';A.go('login')">Créer un compte</button><button class="b n" onclick="mode='login';A.go('login')">Se connecter</button></div>`
  : `<div class="card"><h3>💬 Forum Neoferme</h3><p>La lecture est ouverte à tous. Seuls les éleveurs, agriculteurs et l'administrateur peuvent publier.</p></div>`;
const composer = () => `<div class="card"><h3>💬 Forum Neoferme</h3>
<textarea id="fxt" placeholder="Partagez une question, une astuce, une photo…" maxlength="2000"></textarea>
<div id="fxh" class="thumbs"></div>
<input id="fxf" type="file" accept="image/*" multiple hidden onchange="A.fpick(this)">
<button class="b n" onclick="$('#fxf').click()">📷 Ajouter des photos</button>
<label class="chk"><input type="checkbox" id="fxm"> Publier masqué (visible par moi et l'administration)</label>
<p class="mut" id="fxq"></p>
<button class="b g" onclick="A.fpost()">Publier</button><p id="msg" class="err"></p></div>`;
const forumV = () => (canForum() ? composer() : needBox()) + `<div id="flist"><p class="mut cr">Chargement…</p></div>`;
A.need = () => { if (!U) { if (confirm("Inscrivez-vous pour participer au forum. Créer un compte maintenant ?")) { mode = "reg"; A.go("login"); } } else alert("Seuls les éleveurs, agriculteurs et l'administrateur peuvent participer."); };
async function quota() {
  try { const d = await getDoc(doc(db, "uploads", U.uid + "_" + day())); FQ = 10 - (d.exists() ? d.data().n || 0 : 0); } catch (e) { FQ = 10; }
  const q = $("#fxq"); if (q) q.textContent = `📷 Photos restantes aujourd'hui : ${Math.max(FQ, 0)} / 10`;
}
A.fload = async () => { FIMG = []; FOPEN = {}; if (canForum()) await quota(); await floadPosts(); A.fseen(); };
const thumbs = () => { const h = $("#fxh"); if (h) h.innerHTML = FIMG.map((f, i) => `<div class="th"><img src="${URL.createObjectURL(f)}"><b onclick="A.frm(${i})">✕</b></div>`).join(""); };
A.fpick = inp => {
  const room = Math.max(FQ - FIMG.length, 0), f = [...inp.files].filter(x => x.type.startsWith("image/"));
  if (f.length > room) $("#msg").textContent = "Limite de 10 photos par jour : seules " + room + " photo(s) ajoutée(s).";
  FIMG.push(...f.slice(0, room)); inp.value = ""; thumbs();
};
A.frm = i => { FIMG.splice(i, 1); thumbs(); };
const shrink = f => new Promise(res => {
  const im = new Image(), u = URL.createObjectURL(f);
  im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => res(b || f), "image/jpeg", .82); };
  im.onerror = () => res(f); im.src = u;
});
const upl = async f => {
  const fd = new FormData(); fd.append("file", await shrink(f)); fd.append("upload_preset", CLOUD.preset);
  const j = await (await fetch(`https://api.cloudinary.com/v1_1/${CLOUD.name}/image/upload`, { method: "POST", body: fd })).json();
  if (!j.secure_url) throw new Error((j.error && j.error.message) || "Échec de l'envoi Cloudinary");
  return j.secure_url;
};
A.fpost = async () => {
  const t = $("#fxt").value.trim(), m = $("#msg");
  if (!t && !FIMG.length) return m.textContent = "Écrivez un message ou ajoutez une photo.";
  if (FIMG.length) {
    if (CLOUD.name.startsWith("VOTRE")) return m.textContent = "Cloudinary n'est pas encore configuré dans app.js.";
    await quota(); if (FIMG.length > FQ) return m.textContent = "Limite de 10 photos par jour atteinte.";
  }
  m.textContent = "Publication en cours…";
  try {
    const images = []; for (const f of FIMG) images.push(await upl(f));
    await addDoc(collection(db, "forum"), { uid: U.uid, nom: who(), photo: UP || "", role: ROLE, texte: t, images, hidden: $("#fxm").checked, likes: [], nc: 0, created: serverTimestamp() });
    if (images.length) await setDoc(doc(db, "uploads", U.uid + "_" + day()), { uid: U.uid, n: (10 - FQ) + images.length });
    FIMG = []; $("#fxt").value = ""; $("#fxm").checked = false; thumbs(); m.textContent = ""; await quota(); await floadPosts();
  } catch (x) { m.textContent = x.code || x.message; }
};
async function floadPosts() {
  try { FP = (await getDocs(query(collection(db, "forum"), orderBy("created", "desc"), limit(60)))).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch (e) { FP = []; const l = $("#flist"); if (l) l.innerHTML = `<p class="err cr">${esc(e.code || e.message)}</p>`; return; }
  drawPosts();
}
const postH = p => {
  const mine = !!U && p.uid === U.uid, can = canForum() && (mine || ROLE === "admin"), lk = p.likes || [], liked = !!U && lk.includes(U.uid), im = (p.images || []).filter(okImg);
  return `<div class="card post${p.hidden ? " hid" : ""}"><div class="ph"><div class="pw" onclick="A.go('membre','${esc(p.uid)}')">${avs(p.photo, p.nom)}<div class="pi"><b>${esc(p.nom || "Membre")}</b><small>${esc(p.role || "")} · ${ago(p.created)}${p.hidden ? " · 🙈 masqué" : ""}</small></div></div></div>
${p.texte ? `<p class="pt">${esc(p.texte)}</p>` : ""}${im.length ? `<div class="pg">${im.map(u => `<img loading="lazy" alt="" src="${esc(u)}" onclick="window.open(this.src)">`).join("")}</div>` : ""}
<div class="pa"><button onclick="A.flike('${p.id}')">${liked ? "❤️" : "🤍"} ${lk.length}</button><button onclick="A.fcm('${p.id}')">💬 ${p.nc || 0}</button>
${mine ? `<button onclick="A.fhide('${p.id}')">${p.hidden ? "👁️ Afficher" : "🙈 Masquer"}</button>` : ""}
${can ? `<button onclick="A.fdel('${p.id}')">🗑️ Supprimer</button>` : ""}<button onclick="A.fme('${p.id}')">🚫 Retirer pour moi</button></div><div id="cm-${p.id}"></div></div>`;
};
function drawPosts() {
  const l = FP.filter(vis), box = $("#flist");
  if (!box) return;
  box.innerHTML = l.map(postH).join("") || `<p class="mut cr">Aucune publication pour le moment. Soyez le premier !</p>`;
  Object.keys(FOPEN).forEach(id => { const c = $("#cm-" + id); if (c) c.innerHTML = cmH(id); });
}
A.flike = async id => {
  if (!canForum()) return A.need();
  const p = FP.find(x => x.id === id), l = (p.likes || []).includes(U.uid);
  try { await updateDoc(doc(db, "forum", id), { likes: l ? arrayRemove(U.uid) : arrayUnion(U.uid) }); p.likes = l ? p.likes.filter(x => x !== U.uid) : [...(p.likes || []), U.uid]; drawPosts(); } catch (e) { alert(e.code || e.message); }
};
A.fhide = async id => { const p = FP.find(x => x.id === id); try { await updateDoc(doc(db, "forum", id), { hidden: !p.hidden }); p.hidden = !p.hidden; drawPosts(); } catch (e) { alert(e.code || e.message); } };
A.fdel = async id => { if (!confirm("Supprimer cette publication pour tout le monde ?")) return; try { await deleteDoc(doc(db, "forum", id)); FP = FP.filter(x => x.id !== id); drawPosts(); } catch (e) { alert(e.code || e.message); } };
A.fme = id => { try { localStorage.nfHid = JSON.stringify([...myHidden(), id]); } catch (e) {} drawPosts(); };
const cmH = id => `${(FCM[id] || []).map(c => `<div class="cm"><div class="pw" onclick="A.go('membre','${esc(c.uid)}')">${avs(c.photo, c.nom)}<div class="pi"><b>${esc(c.nom)}</b><small>${ago(c.created)}</small></div></div><p>${esc(c.texte)}</p>${canForum() && (c.uid === U.uid || ROLE === "admin") ? `<a onclick="A.fcd('${id}','${c.id}')">Supprimer</a>` : ""}</div>`).join("") || '<p class="mut cr">Aucun commentaire.</p>'}
${canForum() ? `<div class="cmf"><input id="ci-${id}" placeholder="Votre commentaire…" maxlength="500"><button class="b g" onclick="A.fcs('${id}')">Envoyer</button></div>` : `<button class="b n" onclick="A.need()">🔒 Inscrivez-vous pour commenter</button>`}`;
async function cmLoad(id) { try { FCM[id] = (await getDocs(query(collection(db, "forum", id, "comments"), orderBy("created", "asc")))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { FCM[id] = []; } }
A.fcm = async id => {
  if (FOPEN[id]) { delete FOPEN[id]; $("#cm-" + id).innerHTML = ""; return; }
  FOPEN[id] = 1; await cmLoad(id); $("#cm-" + id).innerHTML = cmH(id);
};
A.fcs = async id => {
  if (!canForum()) return A.need();
  const t = $("#ci-" + id).value.trim(); if (!t) return;
  try {
    await addDoc(collection(db, "forum", id, "comments"), { uid: U.uid, nom: who(), photo: UP || "", texte: t, created: serverTimestamp() });
    await updateDoc(doc(db, "forum", id), { nc: increment(1) });
    const p = FP.find(x => x.id === id); if (p) p.nc = (p.nc || 0) + 1;
    await cmLoad(id); drawPosts();
  } catch (e) { alert(e.code || e.message); }
};
A.fcd = async (id, cid) => {
  try { await deleteDoc(doc(db, "forum", id, "comments", cid)); await updateDoc(doc(db, "forum", id), { nc: increment(-1) }); const p = FP.find(x => x.id === id); if (p) p.nc = Math.max((p.nc || 1) - 1, 0); await cmLoad(id); drawPosts(); } catch (e) { alert(e.code || e.message); }
};

A.fs = () => {
  const m = $("#map"); if (!m || !map) return;
  const on = m.classList.toggle("mapfs"); document.body.classList.toggle("fsmap", on);
  const b = m.querySelector(".fsb"); if (b) { b.textContent = on ? "✕" : "⛶"; b.title = on ? "Quitter le plein écran" : "Plein écran"; }
  setTimeout(() => map.invalidateSize(), 60);
};
A.pre = () => { const s = (k, v) => { const i = document.querySelector('.x[data-g="exploitant"][data-k="' + k + '"]'); if (i && v) i.value = v; }; s("email", U.email); s("nom", UN); };

// ---- profil membre ----
const PRF = [["nom", "Nom complet"], ["tel", "Téléphone", "tel"], ["whatsapp", "WhatsApp", "tel"], ["prov", "Province", Object.keys(PROVINCES)], ["ville", "Ville / village"],
  ["profil", "Profil", ["Éleveur", "Agriculteur", "Agro-éleveur (mixte)", "Pisciculteur", "Apiculteur", "Transformateur", "Autre"]], ["bio", "Biographie", "textarea"]];
const initial = n => esc(((n || (U && U.email) || "M").trim()[0] || "M").toUpperCase());
const avatarH = () => okImg(UP) ? `<img class="av" src="${esc(UP)}" alt="Photo de profil">` : `<span class="av">${initial(UN)}</span>`;
const avs = (u, n) => okImg(u) ? `<img class="av s" loading="lazy" src="${esc(u)}" alt="">` : `<span class="av s">${initial(n)}</span>`;
const setAvatar = () => { const b = $("#usr"); if (b) b.innerHTML = U && okImg(UP) ? `<img src="${esc(UP)}" alt="Profil">` : "👤"; };
const profilV = () => `<div class="card"><h3>👤 Mon profil</h3>
<div class="pav" onclick="$('#pfile').click()">${avatarH()}<span class="cam">📷</span></div>
<input id="pfile" type="file" accept="image/*" hidden onchange="A.pphoto(this)">
<button class="b n" onclick="$('#pfile').click()">📷 ${okImg(UP) ? "Changer" : "Ajouter"} ma photo</button>${okImg(UP) ? `<button class="b n" onclick="A.prm()">🗑️ Retirer ma photo</button>` : ""}
<p class="mut">${esc(U.email)} · Rôle : <b>${esc(ROLE)}</b></p><p id="pmsg" class="err"></p></div>
${blk("Mes informations", "prof", PRF)}
<button class="b g" onclick="A.psave()">Enregistrer mon profil</button><p id="msg" class="err"></p>
<div class="card" id="gal"><p class="mut cr">Chargement de la galerie…</p></div>`;
A.ppre = () => { document.querySelectorAll('.x[data-g="prof"]').forEach(i => { i.value = UPF[i.dataset.k] || ""; }); A.gload(); };
const sq = (f, n = 400) => new Promise(res => {
  const im = new Image(), u = URL.createObjectURL(f);
  im.onload = () => { const s = Math.min(im.width, im.height), c = document.createElement("canvas"); c.width = c.height = n; c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, n, n); URL.revokeObjectURL(u); c.toBlob(b => res(b), "image/jpeg", .85); };
  im.onerror = () => res(null); im.src = u;
});
A.pphoto = async inp => {
  const f = inp.files[0], m = $("#pmsg"); inp.value = ""; if (!f || !f.type.startsWith("image/")) return;
  if (CLOUD.name.startsWith("VOTRE")) { m.textContent = "Cloudinary n'est pas configuré."; return; }
  m.textContent = "Envoi de la photo…";
  try {
    const b = await sq(f); if (!b) throw new Error("Image illisible");
    const fd = new FormData(); fd.append("file", b); fd.append("upload_preset", CLOUD.preset);
    const j = await (await fetch(`https://api.cloudinary.com/v1_1/${CLOUD.name}/image/upload`, { method: "POST", body: fd })).json();
    if (!j.secure_url) throw new Error((j.error && j.error.message) || "Échec de l'envoi");
    await setDoc(doc(db, "users", U.uid), { photo: j.secure_url }, { merge: true });
    UP = j.secure_url; UPF.photo = UP; await syncPub(); setAvatar(); const p = $(".pav"); if (p) p.innerHTML = avatarH() + '<span class="cam">📷</span>'; m.textContent = "✅ Photo mise à jour.";
  } catch (x) { m.textContent = x.code || x.message; }
};
A.prm = async () => { try { await setDoc(doc(db, "users", U.uid), { photo: "" }, { merge: true }); UP = ""; UPF.photo = ""; await syncPub(); render(); } catch (x) { $("#pmsg").textContent = x.code || x.message; } };
A.psave = async () => {
  const o = {}, m = $("#msg"); document.querySelectorAll('.x[data-g="prof"]').forEach(i => { o[i.dataset.k] = i.value.trim(); });
  try { await setDoc(doc(db, "users", U.uid), o, { merge: true }); UPF = { ...UPF, ...o }; UN = o.nom || ""; await syncPub({ bio: o.bio || "", prov: o.prov || "", ville: o.ville || "", profil: o.profil || "" }); m.style.color = "#1a7f37"; m.textContent = "✅ Profil enregistré."; }
  catch (x) { m.style.color = ""; m.textContent = x.code || x.message; }
};

// ---- données démo (fictives) : 1 exploitation par catégorie ----
const dx = (nom, prenom, sexe, nais, prof, niv, exp, n, rprov, rville, rq, adr, bio) => ({ nom, prenom, sexe, naissance: nais, nationalite: "Gabonaise", profil: prof, niveau: niv, experience: String(exp),
  tel: "+241 06 00 00 " + n, whatsapp: "+241 06 00 00 " + n, email: (prenom + "." + nom.split(" ")[0]).toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "") + "@example.org", rprov, rville, rquartier: rq, adresse: adr, bio });
const dz = (type, foncier, org, coop, membres, acces, dist, certif) => ({ type, foncier, organisation: org, coop, membres: String(membres), acces, dist: String(dist), certif });
const dc = (climat, pluvio, temp, sol, eau, risques) => ({ climat, saison: "Petite saison des pluies", pluvio: String(pluvio), temp: String(temp), sol, eau, risques });
const dh = (debut, fin, duree, cycles, mensuel, trimestriel, annuel) => ({ debut, fin, duree: String(duree), cycles: String(cycles), mensuel, trimestriel, annuel });
const DEMO = [
  { id: "d01", nom: "Ferme Avicole Les Cocotiers", sec: "Élevage", cat: "Avicole", prov: "Estuaire", ville: "Libreville", q: "PK12", vil: "", eff: 4500, surf: 1.2, prod: 9000, morts: [40, 55, 38], aliment: 420,
    det: { type: "Poulets de chair", batiments: "4", souche: "Cobb 500" },
    ex: dx("ONDO MINTSA", "Clarisse", "Femme", "1984-03-12", "Éleveur", "Technique / professionnel", 11, "01", "Estuaire", "Libreville", "PK12", "Route de Ntoum, PK12", "Éleveuse de poulets de chair depuis onze ans, Clarisse approvisionne les marchés et restaurants de Libreville toutes les six semaines."),
    zone: dz("Zone d'élevage", "Propriété privée / titre foncier", "Exploitant indépendant", "", 6, "Route bitumée", 12, "Agrément sanitaire départemental"),
    clim: dc("Équatorial humide", 2800, 26, "Latéritique", "Réseau SEEG", "Chaleur en saison sèche, maladie de Newcastle"),
    chr: dh("Janvier", "Décembre", 2, 6, "Mois 1 : mise en place des poussins et démarrage. Mois 2 : croissance, vaccination et vente.", "T1 et T3 : deux bandes. T2 et T4 : vide sanitaire et réparations.", "6 bandes par an, rotation des bâtiments, bilan financier en décembre.") },
  { id: "d02", nom: "Porcherie Bel Avenir", sec: "Élevage", cat: "Porcin", prov: "Estuaire", ville: "Ntoum", q: "", vil: "Ayol", eff: 320, surf: 2.5, prod: 18000, morts: [9, 7, 6], aliment: 380,
    det: { stade: "Naisseur-engraisseur", truies: "24" },
    ex: dx("MOUSSAVOU", "Brice", "Homme", "1979-08-25", "Éleveur", "Secondaire", 14, "02", "Estuaire", "Ntoum", "Centre", "Village Ayol, après le pont", "Brice a repris l'élevage familial en 2012 et l'a doublé grâce à des truies de race améliorée."),
    zone: dz("Zone d'élevage", "Terre coutumière / familiale", "GIE / groupement", "GIE Porc Estuaire", 14, "Piste", 35, ""),
    clim: dc("Équatorial humide", 2500, 27, "Argileux", "Forage / puits", "Peste porcine africaine à surveiller"),
    chr: dh("Janvier", "Décembre", 6, 2, "Saillies et mises bas étalées, sevrage à 28 jours, engraissement de 5 mois.", "T1 : mises bas. T2 : engraissement. T3 : ventes. T4 : renouvellement.", "2 cycles par an, vente principale avant les fêtes de fin d'année.") },
  { id: "d03", nom: "Ranch Savane du Haut-Ogooué", sec: "Élevage", cat: "Bovin", prov: "Haut-Ogooué", ville: "Franceville", q: "Potos", vil: "", eff: 180, surf: 120, prod: 24000, morts: [1, 0, 1], aliment: 300,
    det: { type: "Mixte", race: "N'Dama", paturage: "95" },
    ex: dx("NZAMBA", "Ghislain", "Homme", "1971-11-02", "Éleveur", "Supérieur", 22, "03", "Haut-Ogooué", "Franceville", "Potos", "Route de Léconi", "Ancien technicien agricole, Ghislain élève des N'Dama résistants et valorise le lait localement."),
    zone: dz("Savane / prairie", "Concession", "Entreprise", "", 9, "Piste", 18, "Suivi vétérinaire annuel"),
    clim: dc("Équatorial de transition", 1900, 24, "Sableux", "Rivière / fleuve", "Manque d'eau en saison sèche"),
    chr: dh("Mars", "Février", 12, 1, "Vaccinations en mars et septembre, déparasitage chaque trimestre.", "T1 : vaccination. T2 : sélection. T3 : vente de bouvillons. T4 : mises bas.", "Un cycle annuel, vente de 30 têtes et renouvellement du troupeau.") },
  { id: "d04", nom: "Bergerie du Plateau", sec: "Élevage", cat: "Ovin-Caprin", prov: "Ogooué-Lolo", ville: "Koulamoutou", q: "", vil: "Mandji", eff: 140, surf: 6, prod: 2800, morts: [3, 2, 1], aliment: 120,
    det: { espece: "Les deux", race: "Chèvre naine d'Afrique" },
    ex: dx("OBAME", "Sylvie", "Femme", "1990-05-19", "Éleveur", "Secondaire", 7, "04", "Ogooué-Lolo", "Koulamoutou", "Centre", "Quartier Mandji", "Sylvie élève chèvres et moutons pour les fêtes et les cérémonies coutumières de la région."),
    zone: dz("Zone mixte", "Terre coutumière / familiale", "Coopérative", "Coopérative Petits Ruminants Lolo", 22, "Piste", 8, ""),
    clim: dc("Équatorial humide", 1800, 25, "Hydromorphe", "Rivière / fleuve", "Parasitisme en saison des pluies"),
    chr: dh("Janvier", "Décembre", 6, 2, "Déparasitage mensuel, pesées trimestrielles.", "T2 et T4 : pics de vente avant les fêtes.", "Deux périodes de mises bas, vente de 60 animaux par an.") },
  { id: "d05", nom: "Piscicole du Fleuve", sec: "Élevage", cat: "Pisciculture", prov: "Moyen-Ogooué", ville: "Lambaréné", q: "", vil: "Adouma", eff: 12000, surf: 1.8, prod: 6500, morts: [150, 90, 110], aliment: 650,
    det: { espece: "Tilapia", bassins: "12", eau: "2400" },
    ex: dx("MAVOUNGOU", "Prisca", "Femme", "1982-01-30", "Pisciculteur", "Technique / professionnel", 9, "05", "Moyen-Ogooué", "Lambaréné", "Adouma", "Route de la Station", "Formée à la pisciculture à Lambaréné, Prisca produit du tilapia frais pour la ville et les restaurants."),
    zone: dz("Zone humide / mangrove", "Location / bail", "Association", "Association des Pisciculteurs de l'Ogooué", 31, "Fleuve / pirogue", 5, "Charte de bonnes pratiques"),
    clim: dc("Équatorial humide", 2000, 26, "Hydromorphe", "Étang / bassin", "Crues du fleuve en saison des pluies"),
    chr: dh("Février", "Août", 6, 2, "Empoissonnement, nourrissage deux fois par jour, contrôle de l'eau chaque semaine.", "T1 et T3 : mise en charge. T2 et T4 : pêche et vente.", "Deux récoltes par an, curage des bassins en saison sèche.") },
  { id: "d06", nom: "Rucher des Trois Frontières", sec: "Élevage", cat: "Apiculture", prov: "Woleu-Ntem", ville: "Oyem", q: "", vil: "Ndjolé-Nord", eff: 60, surf: 3, prod: 900, morts: [1, 1, 0], aliment: 20,
    det: { type: "Kenyane" },
    ex: dx("NDONG EYENE", "Serge", "Homme", "1976-09-08", "Apiculteur", "Primaire", 13, "06", "Woleu-Ntem", "Oyem", "Centre", "Quartier Akoakam", "Serge récolte un miel de forêt et de savane, vendu au marché d'Oyem et dans toute la province."),
    zone: dz("Forêt secondaire", "Terre coutumière / familiale", "Coopérative", "Coopérative Apicole du Woleu", 17, "Piste", 14, "Miel certifié local"),
    clim: dc("Équatorial humide", 1700, 25, "Latéritique", "Pluie", "Feux de brousse en saison sèche"),
    chr: dh("Juin", "Septembre", 3, 2, "Visite des ruches toutes les trois semaines.", "T2 et T3 : miellées principales.", "Deux récoltes, extension de 10 ruches par an.") },
  { id: "d07", nom: "Aulacodes de la Ngounié", sec: "Élevage", cat: "Cuniculture-Aulacodes", prov: "Ngounié", ville: "Mouila", q: "", vil: "Mbadi", eff: 85, surf: 0.4, prod: 700, morts: [2, 1, 3], aliment: 90,
    det: { espece: "Aulacodes", cages: "40" },
    ex: dx("BIVIGOU", "Raïssa", "Femme", "1993-12-04", "Éleveur", "Supérieur", 5, "07", "Ngounié", "Mouila", "Mbadi", "Route de Fougamou", "Raïssa élève des aulacodes, une viande de brousse durable, pour restaurateurs et particuliers de Mouila."),
    zone: dz("Zone d'élevage", "Propriété privée / titre foncier", "Exploitant indépendant", "", 3, "Route bitumée", 6, ""),
    clim: dc("Équatorial humide", 1900, 25, "Argileux", "Réseau SEEG", "Stress thermique en saison sèche"),
    chr: dh("Janvier", "Décembre", 8, 1, "Reproduction continue, pesées mensuelles.", "T2 et T4 : ventes aux restaurateurs.", "Objectif de 150 reproducteurs d'ici deux ans.") },
  { id: "d08", nom: "Jardins Maraîchers du Port", sec: "Agriculture", cat: "Maraîchage", prov: "Ogooué-Maritime", ville: "Port-Gentil", q: "", vil: "Cap Lopez", eff: 0, surf: 2.2, prod: 14000, morts: [0, 0], aliment: 35,
    det: { cultures: "Tomate, piment, gombo, aubergine", irrigation: "Goutte-à-goutte" },
    ex: dx("MOUKETOU", "Fabrice", "Homme", "1987-06-16", "Agriculteur", "Technique / professionnel", 8, "08", "Ogooué-Maritime", "Port-Gentil", "Cap Lopez", "Zone maraîchère de Cap Lopez", "Fabrice fournit en légumes frais les marchés de Port-Gentil, longtemps approvisionnés par bateau."),
    zone: dz("Zone urbaine / périurbaine", "Location / bail", "GIE / groupement", "GIE Maraîchers de Cap Lopez", 12, "Route bitumée", 4, "Production sans pesticide de synthèse"),
    clim: dc("Littoral océanique", 2200, 27, "Sableux", "Forage / puits", "Salinité de l'eau et vents marins"),
    chr: dh("Janvier", "Décembre", 3, 4, "Pépinière, repiquage, récolte et vente chaque semaine.", "Une rotation de légumes par trimestre.", "Quatre rotations, rotation avec engrais verts.") },
  { id: "d09", nom: "Champs Vivriers de Tchibanga", sec: "Agriculture", cat: "Vivrier", prov: "Nyanga", ville: "Tchibanga", q: "", vil: "Moukoro", eff: 0, surf: 8, prod: 32000, morts: [0, 0], aliment: 0,
    det: { cultures: "Mixte", saison: "Grande saison" },
    ex: dx("IKAPI", "Léa", "Femme", "1969-04-27", "Agriculteur", "Primaire", 30, "09", "Nyanga", "Tchibanga", "Moukoro", "Route de Moabi", "Léa cultive manioc, banane plantain et arachide et approvisionne le marché de Tchibanga."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "Coopérative", "Coopérative des Femmes Agricultrices de la Nyanga", 48, "Piste", 11, ""),
    clim: dc("Équatorial de transition", 1600, 25, "Argileux", "Pluie", "Irrégularité des pluies"),
    chr: dh("Septembre", "Juin", 9, 1, "Défrichage, plantation, sarclage et récolte étalée.", "T4 : plantation. T1 et T2 : sarclage. T3 : récolte.", "Un cycle principal, jachère de 2 ans sur les parcelles les plus anciennes.") },
  { id: "d10", nom: "Vergers de l'Ivindo", sec: "Agriculture", cat: "Fruitier", prov: "Ogooué-Ivindo", ville: "Makokou", q: "", vil: "Ndzoumou", eff: 0, surf: 5, prod: 21000, morts: [0, 0], aliment: 0,
    det: { cultures: "Ananas", arbres: "600" },
    ex: dx("NGUEMA MBA", "Hervé", "Homme", "1981-10-11", "Agriculteur", "Secondaire", 12, "10", "Ogooué-Ivindo", "Makokou", "Ndzoumou", "Route de Booué", "Hervé cultive ananas, papayes et avocats, avec une petite unité de séchage de fruits."),
    zone: dz("Zone de culture", "Propriété privée / titre foncier", "Exploitant indépendant", "", 8, "Piste", 25, "En conversion biologique"),
    clim: dc("Équatorial humide", 1800, 25, "Latéritique", "Rivière / fleuve", "Enclavement en saison des pluies"),
    chr: dh("Mars", "Février", 12, 1, "Taille, fertilisation organique, récolte d'ananas en saison sèche.", "T3 : récolte principale d'ananas.", "Plantation de 100 arbres fruitiers par an.") },
  { id: "d11", nom: "Cacaoyère Familiale de Bitam", sec: "Agriculture", cat: "Cultures de rente", prov: "Woleu-Ntem", ville: "Bitam", q: "", vil: "Nkoumadjap", eff: 0, surf: 15, prod: 6000, morts: [0, 0], aliment: 0,
    det: { cultures: "Cacao", age: "12" },
    ex: dx("KOUMBA", "Ornella", "Femme", "1988-02-21", "Agriculteur", "Supérieur", 10, "11", "Woleu-Ntem", "Bitam", "Nkoumadjap", "Route de la frontière", "Ornella gère la cacaoyère familiale et vend en fèves séchées à une coopérative de Bitam."),
    zone: dz("Forêt secondaire", "Terre coutumière / familiale", "Coopérative", "Coopérative Cacao du Woleu-Ntem", 64, "Route bitumée", 9, "Cacao équitable"),
    clim: dc("Équatorial humide", 1800, 25, "Latéritique", "Pluie", "Pourriture brune des cabosses"),
    chr: dh("Octobre", "Septembre", 12, 1, "Taille, régulation de l'ombrage, récolte des cabosses toutes les deux semaines.", "T4 et T1 : grande récolte. T3 : petite récolte.", "Replantation de 1 ha par an, séchage et fermentation sur place.") }
];
const dem = e => e.demo ? '<span class="demo">DÉMO</span>' : "";
A.demoOn = async () => {
  if (ROLE !== "admin") return; if (!confirm("Ajouter " + DEMO.length + " exploitations démo avec leurs profils ?")) return;
  const m = $("#dmsg"); let n = 0;
  try {
    for (const [i, d] of DEMO.entries()) {
      const v = PROVINCES[d.prov].villes[d.ville], lat = +(v.lat + ((i * 7) % 11 - 5) * .004).toFixed(5), lng = +(v.lng + ((i * 5) % 11 - 5) * .004).toFixed(5);
      m.textContent = "Création " + (i + 1) + " / " + DEMO.length + "…";
      await setDoc(doc(db, "profils", "demo_" + d.id), { demo: true, uid: "demo_" + d.id, nom: d.ex.prenom + " " + d.ex.nom, photo: "", profil: d.ex.profil, prov: d.ex.rprov, ville: d.ex.rville, bio: d.ex.bio, photos: [], updated: serverTimestamp() });
      await setDoc(doc(db, "exploitations", "demo-" + d.id), { uid: U.uid, demo: true, profilId: "demo_" + d.id, nom: d.nom, secteur: d.sec, categorie: d.cat, details: d.det, effectif: d.eff, surface: d.surf, production: d.prod,
        province: d.prov, ville: d.ville, quartier: d.q, village: d.vil, lat, lng, exploitant: d.ex, zone: d.zone, climat: d.clim, chrono: d.chr, created: serverTimestamp() });
      for (const [j, mo] of d.morts.entries()) await setDoc(doc(db, "saisies", "demo-" + d.id + "-" + (j + 1)), { uid: U.uid, demo: true, exploId: "demo-" + d.id, date: new Date(Date.now() - (j + 1) * 864e5).toISOString().slice(0, 10), morts: mo, aliment: d.aliment, vaccin: j === 0 ? "Vaccination de routine" : "", created: serverTimestamp() });
      n++;
    }
    await load(); render(); $("#dmsg").textContent = "✅ " + n + " exploitations démo ajoutées.";
  } catch (x) { m.textContent = "Erreur : " + (x.code || x.message) + " (règles Firestore à mettre à jour ?)"; }
};
A.demoOff = async () => {
  if (ROLE !== "admin") return; if (!confirm("Supprimer toutes les données démo (exploitations, saisies, profils) ?")) return;
  const m = $("#dmsg"); m.textContent = "Suppression…";
  try {
    for (const d of DEMO) {
      for (let j = 1; j <= 3; j++) { try { await deleteDoc(doc(db, "saisies", "demo-" + d.id + "-" + j)); } catch (e) {} }
      await deleteDoc(doc(db, "exploitations", "demo-" + d.id)); await deleteDoc(doc(db, "profils", "demo_" + d.id));
    }
    await load(); render(); $("#dmsg").textContent = "🗑️ Données démo supprimées.";
  } catch (x) { m.textContent = "Erreur : " + (x.code || x.message); }
};
A.adel = async id => { if (ROLE !== "admin" || !confirm("Supprimer cette exploitation ?")) return; try { await deleteDoc(doc(db, "exploitations", id)); await load(); render(); } catch (x) { alert(x.code || x.message); } };
const demoCard = () => { const n = EX.filter(e => e.demo).length;
  return `<div class="card noprint"><h3>🧪 Données démo</h3><p class="mut">${n ? n + " exploitation(s) démo actuellement actives." : "Aucune donnée démo active."}</p>
<button class="b g" onclick="A.demoOn()">${n ? "🔄 Réactiver / compléter les " : "🧪 Activer les "}${DEMO.length} exploitations démo</button><button class="b r" onclick="A.demoOff()">🗑️ Supprimer toutes les démos</button><p id="dmsg" class="mut"></p></div>`; };
// ---- galerie personnelle + profil public ----
let GAL = [], REPI = 0;
const syncPub = (extra = {}) => setDoc(doc(db, "profils", U.uid), { uid: U.uid, nom: UN || who(), photo: UP, ...extra, updated: serverTimestamp() }, { merge: true });
A.lb = u => { if (!okImg(u)) return; const d = document.createElement("div"); d.id = "lb"; d.innerHTML = `<button onclick="this.parentNode.remove()">✕</button><img src="${esc(u)}" alt="">`; d.onclick = ev => { if (ev.target === d) d.remove(); }; document.body.appendChild(d); };
A.gload = async () => { try { const d = await getDoc(doc(db, "profils", U.uid)); GAL = d.exists() ? (d.data().photos || []) : []; } catch (e) { GAL = []; } gdraw(); };
function gdraw(msg = "") {
  const g = $("#gal"); if (!g) return; const room = 20 - GAL.length;
  g.innerHTML = `<h3>🖼️ Ma galerie (${GAL.length}/20)</h3><p class="mut">Visible par tout le monde sur votre profil public.</p>
<input id="gaf" type="file" accept="image/*" multiple hidden onchange="A.gadd(this)"><input id="grf" type="file" accept="image/*" hidden onchange="A.grep(this)">
${room > 0 ? `<button class="b n" onclick="$('#gaf').click()">➕ Ajouter des photos (${room} restante${room > 1 ? "s" : ""})</button>` : `<p class="mut">Galerie pleine : remplacez ou supprimez une photo.</p>`}
<p id="gmsg" class="err">${esc(msg)}</p>
<div class="gg">${GAL.map((p, i) => `<div class="gi"><img loading="lazy" src="${esc(p.u)}" alt="" onclick="A.lb(this.src)"><div class="ga"><button title="Définir comme photo de profil" onclick="A.gpp(${i})">⭐</button><button title="Remplacer" onclick="A.grs(${i})">🔄</button><button title="Supprimer" onclick="A.gdel(${i})">🗑️</button></div></div>`).join("")}</div>`;
}
A.gadd = async inp => {
  const f = [...inp.files].filter(x => x.type.startsWith("image/")).slice(0, 20 - GAL.length), m = $("#gmsg"); inp.value = ""; if (!f.length) return;
  if (CLOUD.name.startsWith("VOTRE")) { m.textContent = "Cloudinary n'est pas configuré."; return; }
  const add = []; let err = "";
  try { for (let i = 0; i < f.length; i++) { m.textContent = "Envoi " + (i + 1) + " / " + f.length + "…"; add.push({ u: await upl(f[i]), t: Date.now() }); } } catch (x) { err = x.code || x.message; }
  try { if (add.length) { GAL = [...GAL, ...add]; await syncPub({ photos: GAL }); } } catch (x) { err = x.code || x.message; }
  gdraw(err || "✅ " + add.length + " photo(s) ajoutée(s).");
};
A.grs = i => { REPI = i; $("#grf").click(); };
A.grep = async inp => {
  const f = inp.files[0], m = $("#gmsg"); inp.value = ""; if (!f) return;
  try { m.textContent = "Remplacement…"; GAL[REPI] = { u: await upl(f), t: Date.now() }; await syncPub({ photos: GAL }); gdraw("✅ Photo remplacée."); } catch (x) { gdraw(x.code || x.message); }
};
A.gpp = async i => {
  try { UP = GAL[i].u; await setDoc(doc(db, "users", U.uid), { photo: UP }, { merge: true }); UPF.photo = UP; await syncPub({ photos: GAL }); setAvatar(); const p = $(".pav"); if (p) p.innerHTML = avatarH() + '<span class="cam">📷</span>'; gdraw("⭐ Photo de profil mise à jour."); }
  catch (x) { gdraw(x.code || x.message); }
};
A.gdel = async i => { if (!confirm("Supprimer cette photo de la galerie ?")) return; try { GAL.splice(i, 1); await syncPub({ photos: GAL }); gdraw("🗑️ Photo supprimée."); } catch (x) { gdraw(x.code || x.message); } };
const membreV = () => `<div id="mb"><div class="card"><p class="mut cr">Chargement…</p></div></div>`;
A.mload = async () => {
  let p = null; try { const d = await getDoc(doc(db, "profils", cur)); p = d.exists() ? d.data() : null; } catch (e) {}
  const b = $("#mb"); if (!b) return;
  if (!p) { b.innerHTML = `<div class="card"><h3>👤 Profil</h3><p class="mut">Ce membre n'a pas encore complété son profil public.</p></div>`; return; }
  const ph = (p.photos || []).filter(x => okImg(x.u)), ex = EX.filter(e => e.uid === cur || e.profilId === cur);
  b.innerHTML = `<div class="card"><div class="pav">${okImg(p.photo) ? `<img class="av" src="${esc(p.photo)}" alt="" onclick="A.lb(this.src)">` : `<span class="av">${initial(p.nom)}</span>`}</div><h3>${esc(p.nom || "Membre")} ${dem(p)}</h3>
<p class="mut">${esc([p.profil, p.ville, p.prov].filter(Boolean).join(" · "))}</p>${p.bio ? `<p>${esc(p.bio)}</p>` : ""}</div>
${ex.length ? `<div class="card"><h3>🌾 Exploitations</h3>${ex.map(e => `<div class="row"${U ? ` onclick="A.go('fiche','${e.id}')"` : ""}><b>${esc(e.nom)} ${dem(e)}</b><small>${esc(e.categorie)} · ${esc(e.ville)}</small></div>`).join("")}</div>` : ""}
<div class="card"><h3>🖼️ Galerie (${ph.length})</h3>${ph.length ? `<div class="gg">${ph.map(x => `<div class="gi"><img loading="lazy" src="${esc(x.u)}" alt="" onclick="A.lb(this.src)"></div>`).join("")}</div>` : `<p class="mut">Aucune photo pour le moment.</p>`}</div>`;
};

// ---- boutons éphémères : Comment ça marche + Installer ----
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const EPH = { how: ["❓ Comment ça marche", "A.go('how')"], ins: ["📲 Installer l'application", "A.inst()"] };
let EPH_ON = false;
const ephSeen = id => { try { return sessionStorage["eph" + id]; } catch (e) { return ""; } };
function ephAdd(id) {
  if (!EPH_ON || ephSeen(id) || $("#ep-" + id)) return;
  if (id === "ins" && (standalone() || (!window.DIP && !/iphone|ipad|ipod/i.test(navigator.userAgent)))) return;
  let box = $("#eph"); if (!box) { box = document.createElement("div"); box.id = "eph"; document.body.appendChild(box); }
  const p = document.createElement("div"); p.className = "ep"; p.id = "ep-" + id;
  p.innerHTML = `<button onclick="${EPH[id][1]};A.epx('${id}')">${EPH[id][0]}</button><b onclick="A.epx('${id}')" aria-label="Fermer">✕</b>`;
  box.appendChild(p); setTimeout(() => A.epx(id, 1), 14000);
}
A.epx = (id, auto) => { const p = $("#ep-" + id); if (p) p.remove(); if (!auto) try { sessionStorage["eph" + id] = "1"; } catch (e) {} };
A.inst = async () => { const e = window.DIP; if (e) { e.prompt(); try { await e.userChoice; } catch (x) {} window.DIP = null; } else alert("Pour installer : dans Safari, touchez Partager puis « Sur l'écran d'accueil »."); };
window.ephInstall = () => ephAdd("ins");
window.addEventListener("appinstalled", () => A.epx("ins", 1));
setTimeout(() => { EPH_ON = true; ephAdd("how"); ephAdd("ins"); }, document.getElementById("splash") ? 9200 : 1800);


// ---- tracking des connexions (admin) ----
let atab = "synth", VIS = [], TF = { t: "", q: "" }, PREV = 0, SEEN = 0, unsub = null;
const dev = () => { const u = navigator.userAgent; return (/Tablet|iPad/i.test(u) ? "Tablette" : /Mobi|Android|iPhone/i.test(u) ? "Mobile" : "Ordinateur") + " · " + (/Edg/.test(u) ? "Edge" : /OPR|Opera/.test(u) ? "Opera" : /Chrome/.test(u) ? "Chrome" : /Firefox/.test(u) ? "Firefox" : /Safari/.test(u) ? "Safari" : "Autre"); };
async function track() {
  try {
    if (!navigator.onLine) return; const key = "nf_t_" + (U ? U.uid : "v"); if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1");
    let vid = localStorage.getItem("nf_vid"); if (!vid) { vid = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2); localStorage.setItem("nf_vid", vid); }
    let g = {}; try { const c = new AbortController(); setTimeout(() => c.abort(), 4000); g = await (await fetch("https://ipwho.is/", { signal: c.signal })).json(); } catch (e) {}
    const L = (x, n = 60) => String(x || "").slice(0, n), d = { type: U ? ROLE : "visiteur", nom: L(U ? NOM || "Membre" : "Visiteur"), pays: L(g.country || "Inconnu"), ville: L(g.city || "Inconnue"), region: L(g.region), appareil: L(dev()), page: L(view, 20), vid: L(vid, 40), ts: Date.now() };
    if (U) d.uid = U.uid;
    await addDoc(collection(db, "visites"), d);
  } catch (e) {}
}
const adminV = () => `<div class="card noprint tabs"><button class="${atab === "synth" ? "on" : ""}" onclick="A.atab('synth')">📊 Synthèses</button><button class="${atab === "track" ? "on" : ""}" onclick="A.atab('track')">📡 Tracking<i id="bt" class="bd">${newVis() || ""}</i></button></div>` + (atab === "track" ? trackV() : synthV());
A.atab = async t => { atab = t; if (t === "track") { PREV = SEEN; if (!unsub) await loadVis(); markSeen(); } render(); };
async function loadVis() { try { VIS = (await getDocs(query(collection(db, "visites"), orderBy("ts", "desc"), limit(300)))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { VIS = []; } }
const visF = () => VIS.filter(v => (!TF.t || v.type === TF.t) && (!TF.q || norm([v.nom, v.pays, v.ville, v.region, v.page, v.appareil].join(" ")).includes(norm(TF.q))));
const topN = (l, k) => { const o = {}; l.forEach(v => { const x = v[k] || "Inconnu"; o[x] = (o[x] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x, n]) => `${esc(x)} (${n})`).join(", ") || "–"; };
const statsV = () => { const l = visF(); return `<p><b>${l.length}</b> session(s) · <b>${new Set(l.map(v => v.vid)).size}</b> appareil(s) unique(s) · <b>${l.filter(v => v.type !== "visiteur").length}</b> membre(s) · <b>${l.filter(v => v.type === "visiteur").length}</b> visiteur(s)<br>Pays : ${topN(l, "pays")}<br>Villes : ${topN(l, "ville")}</p>`; };
const rowsV = () => visF().map(v => `<tr class="${v.ts > PREV && v.uid !== U?.uid ? "nw" : ""}"><td>${new Date(v.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td><td>${v.ts > PREV && v.uid !== U?.uid ? "🆕 " : ""}${esc(v.nom)}</td><td>${esc(v.type)}</td><td>${esc(v.pays)}</td><td>${esc(v.ville)}</td><td>${esc(v.appareil)}</td></tr>`).join("") || '<tr><td colspan="6">Aucune donnée</td></tr>';
function trackV() {
  const types = [...new Set(VIS.map(v => v.type))];
  return `<div class="card noprint"><h3>📡 Tracking des connexions</h3><button class="b n" onclick="A.atab('track')">🔄 Actualiser</button><button class="b g" onclick="print()">🖨️ Imprimer / PDF</button><button class="b n" onclick="A.vcsv()">📄 Export CSV</button>
<label>Type<select id="tt1" onchange="A.tf()"><option value="">Tous</option>${types.map(t => `<option ${t === TF.t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
<label>Recherche (nom, pays, ville…)<input id="tq" value="${esc(TF.q)}" oninput="A.tf()"></label><p class="mut">300 dernières sessions. Données approximatives (pays/ville déduits de l'adresse IP).</p></div>
<div class="card" id="print"><h3>Tracking des connexions — ${new Date().toLocaleDateString("fr-FR")}</h3><div id="tk">${statsV()}</div><div class="scr"><table><tr><th>Heure</th><th>Nom</th><th>Type</th><th>Pays</th><th>Ville</th><th>Appareil</th></tr><tbody id="tt">${rowsV()}</tbody></table></div></div>`;
}
A.tf = () => { TF.t = $("#tt1").value; TF.q = $("#tq").value; $("#tk").innerHTML = statsV(); $("#tt").innerHTML = rowsV(); };
A.vcsv = () => { const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`, r = visF().map(v => [new Date(v.ts).toLocaleString("fr-FR"), v.nom, v.type, v.pays, v.region, v.ville, v.appareil, v.page].map(q).join(";"));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + ["date", "nom", "type", "pays", "region", "ville", "appareil", "page"].join(";") + "\n" + r.join("\n")], { type: "text/csv" })); a.download = "neoferme-tracking.csv"; a.click(); };

const newVis = () => U && isStaff() ? VIS.filter(v => v.ts > SEEN && v.uid !== U.uid).length : 0;
function markSeen() { SEEN = VIS.reduce((m, v) => Math.max(m, v.ts || 0), SEEN); try { localStorage.nf_seen = SEEN; } catch (e) {} updBadges(); }
function updBadges() { const n = newVis(), t = $("#bt"); if (t) t.textContent = n || ""; document.querySelectorAll(".nbt").forEach(x => x.textContent = n || ""); updBell(); const nv = $("#nav"); if (nv && U) nv.innerHTML = navH(); }
function watchVis() {
  if (unsub) { unsub(); unsub = null; } VIS = [];
  if (!U || !isStaff()) return;
  try { if (!localStorage.nf_seen) localStorage.nf_seen = Date.now(); SEEN = +localStorage.nf_seen || 0; } catch (e) {}
  unsub = onSnapshot(query(collection(db, "visites"), orderBy("ts", "desc"), limit(300)), snap => {
    VIS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (view === "admin" && atab === "track" && $("#tt")) { markSeen(); $("#tk").innerHTML = statsV(); $("#tt").innerHTML = rowsV(); }
    else { updBadges(); if (view === "notif") render(); }
  }, () => {});
}
const visNotif = () => { const l = VIS.filter(v => v.ts > SEEN && v.uid !== U.uid); if (!l.length) return "";
  return `<div class="card"><h3>📡 Nouvelles connexions <span class="bd">${l.length || ""}</span></h3>${l.slice(0, 10).map(v => `<div class="row"><b>${esc(v.nom)} · ${esc(v.type)}</b><small>${esc(v.ville)}, ${esc(v.pays)} · ${new Date(v.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></div>`).join("") || "<p class='mut'>Aucune nouvelle connexion.</p>"}<button class="b n" onclick="A.go('admin');A.atab('track')">Ouvrir le tracking</button>${l.length ? '<button class="b g" onclick="A.seen()">✔️ Marquer comme vu</button>' : ""}</div>`; };
A.seen = () => { markSeen(); render(); };
A.trk = () => { A.go("admin"); A.atab("track"); };

initStatus(db);
window.addEventListener("online", async () => { try { await load(); if (["home", "fermes", "national", "trace", "notif"].includes(view)) render(); } catch (e) {} });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

/* Oeil afficher/masquer mot de passe */
A.eye = (b) => { const i = b.previousElementSibling, s = i.type === "password"; i.type = s ? "text" : "password"; b.textContent = s ? "🙈" : "👁️"; b.setAttribute("aria-label", s ? "Masquer le mot de passe" : "Afficher le mot de passe"); };
(() => { const st = document.createElement("style"); st.textContent = ".pw-wrap{position:relative;display:block}.pw-wrap input{padding-right:52px!important;width:100%;box-sizing:border-box}.pw-eye{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:22px;line-height:1;padding:6px;cursor:pointer;width:auto;margin:0;box-shadow:none}"; document.head.appendChild(st); })();

/* Menu : croix de fermeture + déconnexion toujours visibles */
(() => {
  const st = document.createElement("style");
  st.textContent = ".dp{position:relative}.dp-x{position:sticky;top:0;display:block;margin:0 0 4px auto;width:40px;height:40px;border:0;border-radius:50%;background:#0b1f4d;color:#fff;font-size:20px;line-height:1;z-index:3}.dp-out{position:sticky;bottom:0;display:block;width:100%;margin-top:14px;padding:14px;border:0;border-radius:12px;background:#c62828;color:#fff;font-size:1rem;font-weight:700;z-index:3;box-shadow:0 -8px 10px #fff}";
  document.head.appendChild(st);
  const m = A.menu;
  A.menu = function () {
    const r = m.apply(this, arguments);
    const d = document.getElementById("drawer");
    if (d && !d.dataset.cl) { d.dataset.cl = "1"; d.addEventListener("click", e => { if (e.target === d) d.classList.remove("open"); }); }
    const dp = document.querySelector("#drawer .dp");
    if (dp && !dp.querySelector(".dp-x")) {
      dp.insertAdjacentHTML("afterbegin", '<button type="button" class="dp-x" aria-label="Fermer le menu" onclick="document.getElementById(\'drawer\').classList.remove(\'open\')">✕</button>');
      if (dp.querySelector(".me")) dp.insertAdjacentHTML("beforeend", '<button type="button" class="dp-out" onclick="A.out()">🚪 Se déconnecter</button>');
    }
    return r;
  };
})();

/* Nouvelles catégories de cultures */
Object.assign(SEC["Agriculture"], {
  "Oignons & Aromates": [["cultures", "Cultures", ["Oignon", "Échalote", "Ail", "Poireau", "Ciboulette", "Persil", "Mixte"]], ["variete", "Variété", ["Violet de Galmi", "Red Creole", "Texas Grano", "Locale", "Autre"]], ["irrigation", "Irrigation", ["Pluviale", "Arrosage", "Goutte-à-goutte"]], ["cycle", "Durée du cycle (jours)", "number"]],
  "Tomates & Piments": [["cultures", "Cultures", ["Tomate", "Piment", "Poivron", "Aubergine", "Gombo", "Concombre", "Mixte"]], ["variete", "Variété", ["Roma", "Rio Grande", "Cœur de bœuf", "Piment oiseau", "Habanero", "Locale", "Autre"]], ["abri", "Mode de culture", ["Plein champ", "Sous tunnel / serre", "Hors-sol"]], ["irrigation", "Irrigation", ["Pluviale", "Arrosage", "Goutte-à-goutte"]]],
  "Bananeraies": [["cultures", "Cultures", ["Banane plantain", "Banane douce", "Mixte"]], ["pieds", "Nb de pieds", "number"], ["age", "Âge des plantations (ans)", "number"], ["associe", "Culture associée", ["Aucune", "Manioc", "Arachide", "Taro", "Maïs"]]],
  "Ananeraies": [["cultures", "Variété", ["Cayenne lisse", "Pain de sucre", "MD2", "Locale"]], ["pieds", "Nb de plants", "number"], ["age", "Âge des plantations (mois)", "number"], ["irrigation", "Irrigation", ["Pluviale", "Arrosage", "Goutte-à-goutte"]]]
});

/* Accueil : tuiles agricole / élevage + statistiques cultures */
(() => {
  const fr = n => (+n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const sm = (a, k) => a.reduce((s, e) => s + num(e[k]), 0);
  const tl = (ic, n, l, js) => `<div class="tile" onclick="${js}"><span>${ic}</span><b>${n}</b><small>${l}</small></div>`;
  A.fsec = s => { F.sec = F.sec === s ? "" : s; F.cat = ""; A.go(U ? "fermes" : "home"); };
  tilesV = function () {
    const fl0 = EX.filter(match), ag = fl0.filter(e => e.secteur === "Agriculture"), el = fl0.filter(e => e.secteur === "Élevage");
    if (!U) {
      const n = k => new Set(fl0.map(e => e[k])).size;
      return tl("🌾", ag.length, "Exploitations agricoles", "A.fsec('Agriculture')") + tl("🐔", el.length, "Fermes d'élevage", "A.fsec('Élevage')") + tl("🐄", fr(sm(el, "effectif")), "Effectif animal total", "A.go('home')") + tl("🌱", fr(sm(ag, "surface")), "Surface cultivée (ha)", "A.go('home')") + tl("🗺️", n("province"), "Provinces couvertes", "A.go('home')") + tl("🏷️", n("categorie"), "Catégories", "A.go('home')") + tl("🔑", "→", "Se connecter", "A.go('login')") + tl("➕", "+", "Inscrire mon exploitation", "A.go('login')");
    }
    const mine = isStaff() ? fl0 : fl0.filter(e => e.uid === U.uid), mA = mine.filter(e => e.secteur === "Agriculture"), mE = mine.filter(e => e.secteur === "Élevage");
    const mm = mE.length ? (mE.reduce((a, e) => a + mort(e), 0) / mE.length).toFixed(1) : "0.0", ha = sm(mA, "surface"), kg = sm(mA, "production");
    return tl("🌾", mA.length, isStaff() ? "Exploitations agricoles" : "Mes exploitations agricoles", "A.fsec('Agriculture')") + tl("🐔", mE.length, isStaff() ? "Fermes d'élevage" : "Mes fermes d'élevage", "A.fsec('Élevage')") + tl("🐄", fr(sm(mE, "effectif")), "Effectif animal total", "A.go('fermes')") + tl("📉", mm + " %", "Mortalité moyenne (élevage)", "A.go('national')") + tl("🌱", fr(ha), "Surface cultivée (ha)", "A.go('fermes')") + tl("📦", fr(kg / 1000), "Production agricole (t/an)", "A.go('national')") + tl("⚖️", ha ? fr(kg / 1000 / ha) : "0", "Rendement moyen (t/ha)", "A.go('national')")
      + tl("🚨", mine.filter(e => mort(e) > 5).length, "Alertes actives", "A.go('notif')") + tl("✍️", SA.length, "Saisies", "A.go('saisie')") + tl("➕", "+", "Ajouter une exploitation", "A.go('nouveau')");
  };
  const r0 = render;
  render = function () {
    const x = r0.apply(this, arguments);
    try {
      const e = view === "fiche" ? EX.find(z => z.id === cur) : null;
      if (e && e.secteur === "Agriculture" && num(e.surface) && !document.getElementById("stat-agri")) {
        const kv = (k, v) => `<div class="kv"><small>${k}</small><b>${v}</b></div>`, t = num(e.production) / 1000, d = e.details || {}, np = num(d.pieds || d.arbres), s = num(e.surface);
        const html = `<div class="blk" id="stat-agri"><h4>📊 Statistiques de production</h4>${kv("Production annuelle", fr(t) + " t")}${kv("Rendement", fr(t / s) + " t/ha")}${np ? kv("Densité", fr(np / s) + " pieds/ha") + kv("Production par pied", fr(num(e.production) / np) + " kg") : ""}${kv("Surface cultivée", fr(s) + " ha")}</div>`;
        const p = [...document.querySelectorAll("#print p")].find(q => /Mortalité :/.test(q.textContent));
        if (p) p.insertAdjacentHTML("afterend", html);
      }
    } catch (_) {}
    return x;
  };
})();

/* Démo : 8 exploitations de cultures */
DEMO.push(
  { id: "d12", nom: "Oignonnière du Plateau Batéké", sec: "Agriculture", cat: "Oignons & Aromates", prov: "Haut-Ogooué", ville: "Léconi", q: "", vil: "Kessa", eff: 0, surf: 1.5, prod: 18000, morts: [0, 0], aliment: 60,
    det: { cultures: "Oignon", variete: "Violet de Galmi", irrigation: "Arrosage", cycle: "110" },
    ex: dx("MBOUMBA", "Rodrigue", "Homme", "1980-02-19", "Agriculteur", "Technique / professionnel", 10, "12", "Haut-Ogooué", "Léconi", "", "Village Kessa, route de Léconi", "Rodrigue cultive l'oignon sur les sols sableux du plateau Batéké depuis dix ans et vend sa récolte séchée aux marchés de Franceville et de Moanda."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "GIE / groupement", "GIE Oignons du Plateau", 9, "Piste", 38, "Culture en planches surélevées"),
    clim: dc("Tropical de savane", 1700, 25, "Sableux", "Rivière / cours d'eau", "Sols pauvres et manque d'eau en saison sèche"),
    chr: dh("Mai", "Octobre", 4, 2, "Pépinière de cinq semaines, repiquage, récolte puis séchage de trois semaines.", "Deux cycles : petite saison sèche et grande saison sèche.", "Séchage à l'ombre pour la conservation, vente groupée par le GIE.") },
  { id: "d13", nom: "Tomates sous Serre de Ntoum", sec: "Agriculture", cat: "Tomates & Piments", prov: "Estuaire", ville: "Ntoum", q: "", vil: "Mvoum", eff: 0, surf: 1.2, prod: 30000, morts: [0, 0], aliment: 90,
    det: { cultures: "Tomate", variete: "Roma", abri: "Sous tunnel / serre", irrigation: "Goutte-à-goutte" },
    ex: dx("NDONG ESSONO", "Carine", "Femme", "1991-07-08", "Agriculteur", "Supérieur", 6, "13", "Estuaire", "Ntoum", "", "Village Mvoum, route de Ntoum", "Ingénieure agronome de formation, Carine produit des tomates sous tunnel pour les supermarchés et restaurants de Libreville toute l'année."),
    zone: dz("Zone de culture", "Propriété privée / titre foncier", "Exploitant indépendant", "", 6, "Route bitumée", 35, "Bonnes pratiques agricoles"),
    clim: dc("Équatorial humide", 2400, 27, "Latéritique", "Forage / puits", "Flétrissement bactérien et forte humidité"),
    chr: dh("Janvier", "Décembre", 5, 2, "Pépinière de quatre semaines, plantation sous tunnel, tuteurage, récoltes étalées sur trois mois.", "Deux cultures par an, la plus productive en saison sèche.", "Rotation avec le concombre pour limiter les maladies du sol.") },
  { id: "d14", nom: "Piments de Koulamoutou", sec: "Agriculture", cat: "Tomates & Piments", prov: "Ogooué-Lolo", ville: "Koulamoutou", q: "", vil: "Bemba", eff: 0, surf: 0.8, prod: 4800, morts: [0, 0], aliment: 25,
    det: { cultures: "Piment", variete: "Piment oiseau", abri: "Plein champ", irrigation: "Pluviale" },
    ex: dx("MOUELE", "Jean-Pierre", "Homme", "1975-11-23", "Agriculteur", "Secondaire", 15, "14", "Ogooué-Lolo", "Koulamoutou", "", "Village Bemba, après le pont", "Jean-Pierre produit du piment frais et séché qu'il vend sur les marchés de Koulamoutou et envoie par camion vers Libreville."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "Coopérative", "Coopérative des Producteurs de Piment", 15, "Piste", 14, ""),
    clim: dc("Équatorial humide", 1900, 26, "Latéritique", "Eau de pluie", "Pluies abondantes et pourriture des fruits"),
    chr: dh("Février", "Novembre", 5, 2, "Pépinière, repiquage, récoltes échelonnées sur deux mois, séchage au soleil.", "Deux plantations : début de grande saison des pluies et petite saison.", "Le piment séché se conserve et se vend toute l'année.") },
  { id: "d15", nom: "Bananeraie Plantain de Fougamou", sec: "Agriculture", cat: "Bananeraies", prov: "Ngounié", ville: "Fougamou", q: "", vil: "Doubou", eff: 0, surf: 6, prod: 36000, morts: [0, 0], aliment: 40,
    det: { cultures: "Banane plantain", pieds: "7200", age: "4", associe: "Manioc" },
    ex: dx("MAGANGA", "Sidonie", "Femme", "1968-09-14", "Agriculteur", "Primaire", 28, "15", "Ngounié", "Fougamou", "", "Village Doubou", "Sidonie entretient une grande bananeraie plantain associée au manioc et fournit les marchés de Mouila et de Lambaréné."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "Coopérative", "Coopérative des Planteurs de Fougamou", 28, "Piste", 22, ""),
    clim: dc("Équatorial humide", 2100, 26, "Latéritique", "Eau de pluie", "Vents violents et charançon du bananier"),
    chr: dh("Janvier", "Décembre", 12, 1, "Plantation de rejets, entretien, récolte des régimes tout au long de l'année.", "Plantation en début de grande saison des pluies.", "Rejets sélectionnés, renouvellement d'un cinquième de la parcelle chaque année.") },
  { id: "d16", nom: "Ananeraie de Ndjolé", sec: "Agriculture", cat: "Ananeraies", prov: "Moyen-Ogooué", ville: "Ndjolé", q: "", vil: "Mbéga", eff: 0, surf: 3, prod: 60000, morts: [0, 0], aliment: 50,
    det: { cultures: "Cayenne lisse", pieds: "90000", age: "18", irrigation: "Pluviale" },
    ex: dx("BOUSSOUGOU", "Aimé", "Homme", "1983-04-05", "Agriculteur", "Secondaire", 11, "16", "Moyen-Ogooué", "Ndjolé", "", "Village Mbéga, route de Lambaréné", "Aimé produit de l'ananas Cayenne lisse destiné aux marchés de Lambaréné et de Libreville, sur d'anciennes parcelles de savane."),
    zone: dz("Zone de culture", "Propriété privée / titre foncier", "Exploitant indépendant", "", 11, "Route bitumée", 45, ""),
    clim: dc("Équatorial humide", 1900, 26, "Sableux", "Eau de pluie", "Cochenilles et floraison irrégulière"),
    chr: dh("Mars", "Février", 18, 1, "Plantation des rejets, entretien, induction florale, récolte étalée sur deux mois.", "Plantation en début de saison des pluies.", "Cycle de dix-huit mois, parcelles décalées pour récolter chaque saison.") },
  { id: "d17", nom: "Verger de Papayes de Booué", sec: "Agriculture", cat: "Fruitier", prov: "Ogooué-Ivindo", ville: "Booué", q: "", vil: "", eff: 0, surf: 2, prod: 54000, morts: [0, 0], aliment: 30,
    det: { cultures: "Papaye", arbres: "3600" },
    ex: dx("NGUEMA OBAME", "Léonce", "Homme", "1978-12-01", "Agriculteur", "Secondaire", 13, "17", "Ogooué-Ivindo", "Booué", "", "Quartier de la gare, Booué", "Léonce cultive la papaye et vend ses fruits aux voyageurs et aux commerçants de l'axe Booué-Libreville."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "Exploitant indépendant", "", 13, "Piste", 6, ""),
    clim: dc("Équatorial humide", 1700, 26, "Latéritique", "Eau de pluie", "Virus de la papaye et vent"),
    chr: dh("Janvier", "Décembre", 12, 1, "Plantation, entretien, récolte continue à partir du neuvième mois.", "Plantation en début de saison des pluies.", "Renouvellement des plants tous les trois ans.") },
  { id: "d18", nom: "Jardins Hors-Sol d'Angondjé", sec: "Agriculture", cat: "Tomates & Piments", prov: "Estuaire", ville: "Akanda", q: "Angondjé", vil: "", eff: 0, surf: 0.6, prod: 9000, morts: [0, 0], aliment: 45,
    det: { cultures: "Mixte", variete: "Locale", abri: "Hors-sol", irrigation: "Goutte-à-goutte" },
    ex: dx("ELLA ENGONE", "Estelle", "Femme", "1989-10-27", "Agriculteur", "Technique / professionnel", 7, "18", "Estuaire", "Akanda", "Angondjé", "Zone maraîchère d'Angondjé", "Estelle cultive poivrons, aubergines et piments en sacs hors-sol sur un terrain périurbain et livre des paniers à des familles de Libreville."),
    zone: dz("Zone urbaine / périurbaine", "Location / bail", "Exploitant indépendant", "", 7, "Route bitumée", 8, "Production sans pesticide de synthèse"),
    clim: dc("Équatorial humide", 2500, 27, "Latéritique", "Réseau SEEG", "Coût de l'eau et ravageurs"),
    chr: dh("Janvier", "Décembre", 3, 4, "Semis en pépinière, repiquage en sacs, récolte et livraison hebdomadaire.", "Quatre cycles par an.", "Substrat renouvelé à chaque cycle avec du compost.") },
  { id: "d19", nom: "Bananes Douces de Banio", sec: "Agriculture", cat: "Bananeraies", prov: "Nyanga", ville: "Mayumba", q: "", vil: "Banio", eff: 0, surf: 4, prod: 28000, morts: [0, 0], aliment: 35,
    det: { cultures: "Banane douce", pieds: "4800", age: "3", associe: "Aucune" },
    ex: dx("MOMBO", "Gisèle", "Femme", "1972-05-30", "Agriculteur", "Primaire", 20, "19", "Nyanga", "Mayumba", "", "Village Banio, bord de lagune", "Gisèle produit des bananes douces pour les marchés de Mayumba et de Tchibanga et pour un groupement de femmes qui fabrique des chips."),
    zone: dz("Zone de culture", "Terre coutumière / familiale", "GIE / groupement", "GIE Femmes de Banio", 20, "Piste", 18, ""),
    clim: dc("Littoral océanique", 2300, 26, "Sableux", "Eau de pluie", "Embruns salés et sols sableux pauvres"),
    chr: dh("Janvier", "Décembre", 10, 1, "Plantation de rejets, entretien, récolte des régimes toute l'année.", "Plantation en début de saison des pluies.", "Paillage avec les feuilles sèches pour garder l'humidité du sol.") }
);

/* Couleurs tuiles + menu latéral, trait jaune mobile sous l'onglet ouvert */
(() => {
  const tc = ["#1f9d55", "#2f6db5", "#e8731a", "#8e44ad", "#c0392b", "#138d90", "#a67c00", "#c2185b", "#3949ab", "#6d4c41"];
  const mc = ["#1f9d55", "#2f6db5", "#8e44ad", "#e8731a", "#138d90", "#c2185b", "#3949ab", "#a67c00", "#c0392b", "#00796b", "#5d4037", "#455a64"];
  let css = ".tiles .tile{background-color:var(--c,#2f6db5)!important;background-image:linear-gradient(145deg,rgba(255,255,255,.2),rgba(0,0,0,.12))!important;border:0!important;box-shadow:0 4px 10px rgba(0,0,0,.18)!important}.tiles .tile span,.tiles .tile b,.tiles .tile small{color:#fff!important}.tiles .tile:active{filter:brightness(.92)}";
  tc.forEach((c, i) => { css += `.tiles .tile:nth-child(${tc.length}n+${i + 1}){--c:${c}}`; });
  css += ".dp>a{background-color:var(--c,#2f6db5)!important;background-image:linear-gradient(145deg,rgba(255,255,255,.2),rgba(0,0,0,.1))!important;color:#fff!important;border:0!important;border-radius:12px!important;box-shadow:0 2px 6px rgba(0,0,0,.15)}.dp>a *{color:#fff!important}.dp>a:active{filter:brightness(.92)}";
  mc.forEach((c, i) => { css += `.dp>a:nth-of-type(${mc.length}n+${i + 1}){--c:${c}}`; });
  css += "#nav-bar{position:absolute;bottom:2px;height:4px;width:36px;border-radius:4px;background:#f5c518;pointer-events:none;z-index:5;transition:left .35s cubic-bezier(.4,0,.2,1),width .35s cubic-bezier(.4,0,.2,1),opacity .2s}";
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const bar = document.createElement("i"); bar.id = "nav-bar";
  let lastL = null, lastW = null;
  const alias = { fiche: "fermes", nouveau: "fermes" };
  const tabOf = nav => {
    const kids = [...nav.children].filter(k => k !== bar), v = alias[view] || view;
    let t = kids.find(k => (k.getAttribute("onclick") || "").includes(`'${v}'`));
    if (!t) t = kids.find(k => /(^|\s)(on|act|active|sel|cur|current)(\s|$)/.test(k.className));
    if (!t) { const col = kids.map(k => getComputedStyle(k).color), u = kids.filter((k, i) => col.filter(c => c === col[i]).length === 1); if (u.length === 1) t = u[0]; }
    return t;
  };
  const place = () => {
    const nav = document.getElementById("nav"); if (!nav) return;
    if (getComputedStyle(nav).position === "static") nav.style.position = "relative";
    if (bar.parentNode !== nav) {
      if (lastL !== null) { bar.style.left = lastL + "px"; bar.style.width = lastW + "px"; }
      nav.appendChild(bar); void bar.offsetWidth;
    }
    const t = tabOf(nav);
    if (!t) { bar.style.opacity = "0"; return; }
    const nr = nav.getBoundingClientRect(), tr = t.getBoundingClientRect(), w = Math.min(36, tr.width * .6);
    lastL = tr.left - nr.left + nav.scrollLeft + (tr.width - w) / 2; lastW = w;
    bar.style.opacity = "1"; bar.style.left = lastL + "px"; bar.style.width = w + "px";
  };
  const r1 = render;
  render = function () { const x = r1.apply(this, arguments); place(); setTimeout(place, 60); return x; };
  const nav0 = document.getElementById("nav");
  if (nav0) new MutationObserver(() => requestAnimationFrame(place)).observe(nav0, { childList: true });
  addEventListener("resize", place); addEventListener("load", place); setTimeout(place, 500);
})();

/* Démo : ne crée que les exploitations manquantes (les règles interdisent de modifier les saisies existantes) */
A.demoOn = async () => {
  if (ROLE !== "admin") return;
  const m = $("#dmsg"), todo = DEMO.filter(d => !EX.some(e => e.id === "demo-" + d.id));
  if (!todo.length) { m.textContent = "✅ Toutes les exploitations démo sont déjà présentes."; return; }
  if (!confirm("Ajouter " + todo.length + " nouvelle(s) exploitation(s) démo avec leurs profils ?")) return;
  let n = 0;
  try {
    for (const d of todo) {
      const i = DEMO.indexOf(d), v = PROVINCES[d.prov].villes[d.ville], lat = +(v.lat + ((i * 7) % 11 - 5) * .004).toFixed(5), lng = +(v.lng + ((i * 5) % 11 - 5) * .004).toFixed(5);
      m.textContent = "Création " + (n + 1) + " / " + todo.length + " : " + d.nom + "…";
      await setDoc(doc(db, "profils", "demo_" + d.id), { demo: true, uid: "demo_" + d.id, nom: d.ex.prenom + " " + d.ex.nom, photo: "", profil: d.ex.profil, prov: d.ex.rprov, ville: d.ex.rville, bio: d.ex.bio, photos: [], updated: serverTimestamp() });
      await setDoc(doc(db, "exploitations", "demo-" + d.id), { uid: U.uid, demo: true, profilId: "demo_" + d.id, nom: d.nom, secteur: d.sec, categorie: d.cat, details: d.det, effectif: d.eff, surface: d.surf, production: d.prod,
        province: d.prov, ville: d.ville, quartier: d.q, village: d.vil, lat, lng, exploitant: d.ex, zone: d.zone, climat: d.clim, chrono: d.chr, created: serverTimestamp() });
      for (const [j, mo] of d.morts.entries()) { try { await setDoc(doc(db, "saisies", "demo-" + d.id + "-" + (j + 1)), { uid: U.uid, demo: true, exploId: "demo-" + d.id, date: new Date(Date.now() - (j + 1) * 864e5).toISOString().slice(0, 10), morts: mo, aliment: d.aliment, vaccin: "", created: serverTimestamp() }); } catch (e) {} }
      n++;
    }
    await load(); render(); const m2 = $("#dmsg"); if (m2) m2.textContent = "✅ " + n + " exploitation(s) démo ajoutée(s).";
  } catch (x) { m.textContent = "Erreur sur « " + (todo[n] ? todo[n].nom : "?") + " » : " + (x.code || x.message); }
};
