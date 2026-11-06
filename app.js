import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, deleteDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove, query, orderBy, limit, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PROVINCES } from "./gabon.js";

// ---- config Firebase : réutilise firebase-config.js existant ----
let cfg;
try { const m = await import("./firebase-config.js"); cfg = Object.values(m).find(v => v && v.apiKey) || (m.default && m.default.apiKey ? m.default : null); } catch (e) {}
if (!cfg && !getApps().length) { try { const t = await (await fetch("firebase-config.js")).text(); const r = t.match(/\{[^{}]*apiKey[^{}]*\}/); if (r) cfg = new Function("return " + r[0])(); } catch (e) {} }
const app = getApps()[0] || initializeApp(cfg || window.firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);

// ---- Cloudinary (photos du forum) : renseigner le cloud name et le preset « unsigned » ----
const CLOUD = { name: "zbof0xbh", preset: "neoferme_forum" };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STAFF = ["admin", "ministere", "technicien"];
let U = null, UN = "", UP = "", UPF = {}, ROLE = "eleveur", EX = [], SA = [], view = "home", cur = null, mode = "login", map;
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
  await load();
  if (u) { if (view === "login") view = "home"; if (location.hash.startsWith("#lot=")) { view = "fiche"; cur = location.hash.slice(5); } }
  else if (!["home", "forum", "how", "about"].includes(view)) view = "home";
  render();
});

// ---- navigation ----
const canForum = () => !!U && ["admin", "eleveur", "agriculteur"].includes(ROLE);
const PUB = [["home", "🏠", "Accueil"], ["forum", "💬", "Forum"], ["how", "❓", "Aide"], ["about", "ℹ️", "À propos"], ["login", "🔑", "Connexion"]];
const TABS = [["home", "🏠", "Accueil"], ["saisie", "✍️", "Saisie"], ["fermes", "🌾", "Exploitations"], ["national", "📊", "National"], ["trace", "🔎", "Traçabilité"], ["forum", "💬", "Forum"]];
const tabs = () => TABS;
A.go = (v, id) => { if (!U && !["home", "forum", "how", "about", "login"].includes(v)) v = "login"; view = v; cur = id || null; $("#drawer").classList.remove("open"); window.scrollTo(0, 0); render(); };
A.menu = () => {
  const items = U ? [...tabs(), ["notif", "🔔", "Notifications"], ["profil", "👤", "Mon profil"], ["how", "❓", "Comment ça marche"], ["about", "ℹ️", "À propos de"]] : [["home", "🏠", "Accueil"], ["forum", "💬", "Forum"], ["how", "❓", "Comment ça marche"], ["about", "ℹ️", "À propos de"], ["login", "🔑", "Connexion"]];
  if (isStaff()) items.splice(tabs().length, 0, ["admin", "🛠️", "Administration"]);
  $("#drawer").innerHTML = `<div class="dp">${U ? `<div class="me" onclick="A.go('profil')">${avatarH()}<b>${esc(UN || "Mon profil")}</b><small>${esc(U.email)}<br>Rôle : ${esc(ROLE)}</small></div>` : "<b>Neoferme</b><br><small>Visiteur</small>"}<hr>${items.map(i => `<a onclick="A.go('${i[0]}')">${i[1]} ${i[2]}${nbHtml(i[0], "nbi")}</a>`).join("")}${U ? '<a onclick="A.out()">🚪 Déconnexion</a>' : ""}</div><div class="dbg" onclick="A.menu()"></div>`;
  $("#drawer").classList.toggle("open");
};
A.user = () => A.go(U ? "profil" : "login");
A.out = () => { signOut(auth); $("#drawer").classList.remove("open"); };

function render() {
  $("#nav").innerHTML = navH();
  if (view === "notif" && U) { NEWA = unreadAlerts().map(e => e.id); markA(); }
  updBell(); setAvatar();
  $("#adm").style.display = U && isStaff() ? "flex" : "none";
  document.body.classList.remove("fsmap");
  if (map) { map.remove(); map = null; }
  const main = $("#main");
  if (!U && !["home", "forum", "how", "about"].includes(view)) view = "login";
  if (!U && view === "login") { main.innerHTML = loginV(); return; }
  main.innerHTML = ({ home: homeV, saisie: saisieV, fermes: fermesV, national: nationalV, trace: traceV, notif: notifV, how: howV, about: aboutV, admin: adminV, fiche: ficheV, nouveau: nouveauV, forum: forumV, profil: profilV }[view] || homeV)();
  if (view === "home" || view === "national") initMap();
  if (view === "nouveau") { A.sect(); A.pre(); }
  if (view === "forum") A.fload();
  if (view === "profil") A.ppre();
}

// ---- connexion ----
const loginV = () => `<div class="card login"><h2>Neoferme</h2><p class="mut">De la ferme à l'assiette · ${mode === "login" ? "connexion" : "créer un compte"}</p>
${mode === "reg" ? `<label>Nom complet<input id="nom"></label><label>Je suis<select id="role"><option value="eleveur">Éleveur</option><option value="agriculteur">Agriculteur</option></select></label>` : ""}
<label>E-mail<input id="em" type="email"></label><label>Mot de passe<input id="pw" type="password"></label>
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
const nbHtml = (id, cls) => { const n = id === "forum" ? unreadForum() : id === "notif" && U ? unreadAlerts().length + unreadForum() : 0; return n ? `<i class="${cls}">${n > 99 ? "99+" : n}</i>` : ""; };
const navH = () => (U ? tabs() : PUB).map(t => `<a class="${view === t[0] ? "on" : ""}" onclick="A.go('${t[0]}')"><span>${t[1]}</span>${t[2]}${nbHtml(t[0], "nb")}</a>`).join("");
const updBell = () => { const n = U ? unreadAlerts().length + unreadForum() : 0, b = $("#badge"); if (!b) return; b.textContent = n > 99 ? "99+" : n; b.style.display = n ? "flex" : "none"; };
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
<div id="map" class="map"></div><div id="rs"></div><div class="tiles" id="tl">${tilesV()}</div>`;
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
  .bindPopup(`<b>${esc(e.nom)}</b><br>${esc(e.categorie)} · ${esc(e.ville)}<br><a href="#" onclick="A.go('fiche','${e.id}');return false">${U ? "Voir la fiche" : "Se connecter pour voir la fiche"}</a>`);
function refreshHome() {
  const fl = EX.filter(match), on = F.q || nF(), pts = fl.filter(e => e.lat);
  if (map && ML) {
    ML.clearLayers(); MK = {}; pts.forEach(e => MK[e.id] = mkr(e).addTo(ML));
    if (on && pts.length) map.fitBounds(pts.map(e => [e.lat, e.lng]), { maxZoom: 11, padding: [30, 30] }); else if (!on) map.setView([-0.8, 11.6], 6);
  }
  $("#tl").innerHTML = tilesV(); $("#fb").textContent = nF() || "";
  $("#rs").innerHTML = on ? `<div class="card"><b>${fl.length} résultat(s)</b>${fl.slice(0, 8).map(e => `<div class="row" onclick="A.focus('${e.id}')"><b>${esc(e.nom)}</b><small>${esc(e.categorie)} · ${esc(e.ville)} (${esc(e.province)})${U ? " · " + mort(e).toFixed(1) + " %" : ""}</small></div>`).join("")}${fl.length > 8 ? `<p class="mut">+ ${fl.length - 8} autres : affinez la recherche</p>` : ""}${fl.length ? "" : "<p class='mut'>Aucun résultat.</p>"}</div>` : "";
}
function initMap() {
  if (!window.L || !$("#map")) return;
  map = L.map("map", { minZoom: 5, maxBounds: [[-4.8, 8], [2.9, 15]] }).setView([-0.8, 11.6], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
  ML = L.layerGroup().addTo(map);
  new (L.Control.extend({ onAdd() { const b = L.DomUtil.create("a", "fsb"); b.href = "#"; b.title = "Plein écran"; b.textContent = "⛶"; L.DomEvent.disableClickPropagation(b); L.DomEvent.on(b, "click", ev => { L.DomEvent.preventDefault(ev); A.fs(); }); return b; } }))({ position: "topleft" }).addTo(map);
  if (view === "home") refreshHome(); else EX.filter(e => e.lat).forEach(e => mkr(e).addTo(ML));
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => L.marker([p.coords.latitude, p.coords.longitude]).addTo(map).bindPopup("📍 Vous êtes ici"), () => {});
}

// ---- exploitations ----
const fermesV = () => { const l = isStaff() ? EX : EX.filter(e => e.uid === U.uid);
  return `<div class="card"><h3>${isStaff() ? "Toutes les exploitations" : "Mes exploitations"}</h3><button class="b g" onclick="A.go('nouveau')">➕ Ajouter une exploitation</button>
${l.map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${esc(e.nom)}</b><small>${esc(e.secteur)} · ${esc(e.categorie)} · ${esc(e.ville)} (${esc(e.province)})</small></div>`).join("") || "<p class='mut'>Aucune exploitation enregistrée.</p>"}</div>`; };
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
  return `<div class="card" id="print"><h3>${esc(e.nom)}</h3><p>${esc(e.secteur)} · ${esc(e.categorie)}</p>
<p>📍 ${esc([e.village, e.quartier, e.ville, e.province].filter(Boolean).join(", "))}<br>GPS : ${e.lat?.toFixed?.(4)}, ${e.lng?.toFixed?.(4)}</p>
<p>Effectif : ${e.effectif || "–"} · Surface : ${e.surface || 0} ha · Production : ${e.production || 0} kg/an · Mortalité : ${mort(e).toFixed(1)} %</p>
${Object.keys(e.details || {}).length ? `<div class="blk"><h4>Détails de production</h4>${Object.entries(e.details).map(([k, v]) => `<div class="kv"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>` : ""}${sub("👤 Exploitant", FEX, e.exploitant, isStaff() || e.uid === U.uid ? [] : ["tel", "whatsapp", "email", "adresse", "naissance"])}${sub("🌳 Zone et organisation", FZO, e.zone)}${sub("🌦️ Climat local", FCL, e.climat)}${sub("🗓️ Chronologie", FCH, e.chrono)}<p class="mut">Code traçabilité : <b>${e.id}</b></p>
<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(url)}"></div>
<div class="card noprint"><button class="b g" onclick="print()">🖨️ Imprimer / PDF</button>${e.uid === U.uid || ROLE === "admin" ? `<button class="b r" onclick="A.del('${e.id}')">Supprimer</button>` : ""}</div>`;
}
A.del = async id => { if (confirm("Supprimer cette exploitation ?")) { await deleteDoc(doc(db, "exploitations", id)); await load(); A.go("fermes"); } };

// ---- saisie ----
const saisieV = () => { const l = EX.filter(e => e.uid === U.uid);
  return `<div class="card"><h3>Saisie du jour</h3>${l.length ? `<label>Exploitation<select id="sx">${l.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join("")}</select></label>
<label>Date<input id="sd" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Morts / pertes<input id="sm" type="number" value="0"></label>
<label>Aliment / intrants (kg)<input id="sa" type="number" value="0"></label><label>Vaccins / traitements<input id="sv"></label><button class="b g" onclick="A.saisie()">Enregistrer</button><p id="msg" class="err"></p>`
    : `<p class="mut">Ajoutez d'abord une exploitation.</p><button class="b g" onclick="A.go('nouveau')">➕ Ajouter</button>`}</div>`; };
A.saisie = async () => { try { await addDoc(collection(db, "saisies"), { uid: U.uid, exploId: $("#sx").value, date: $("#sd").value, morts: num($("#sm").value), aliment: num($("#sa").value), vaccin: $("#sv").value, created: serverTimestamp() }); await load(); A.go("home"); } catch (x) { $("#msg").textContent = x.code; } };

// ---- national / notifs / divers ----
const byProv = () => { const o = {}; EX.forEach(e => (o[e.province] ||= []).push(e)); return o; };
const nationalV = () => `<div id="map" class="map"></div><div class="card"><h3>Mortalité moyenne par province (%)</h3>${Object.entries(byProv()).map(([p, l]) => { const m = l.reduce((a, e) => a + mort(e), 0) / l.length; return `<div class="bar"><span>${esc(p)}</span><i style="width:${Math.min(m * 10, 100)}%"></i><b>${m.toFixed(1)}</b></div>`; }).join("") || "<p class='mut'>Pas encore de données.</p>"}</div>`;
const notifV = () => { const nf = unreadForum(), al = alerts();
  return `<div class="card"><h3>🔔 Notifications</h3>${nf ? `<div class="row" onclick="A.go('forum')"><b>💬 ${nf} nouvelle(s) publication(s) dans le forum</b><small>Toucher pour lire</small></div>` : ""}${al.map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${NEWA.includes(e.id) ? "🆕 " : ""}${esc(e.nom)}</b><small>Mortalité ${mort(e).toFixed(1)} % (> 5 %) · ${esc(e.ville)}</small></div>`).join("")}${!nf && !al.length ? "<p class='mut'>Aucune notification.</p>" : ""}</div>`; };
const traceV = () => `<div class="card"><h3>🔎 Traçabilité</h3><label>Code de l'exploitation / lot<input id="tc"></label><button class="b g" onclick="A.go('fiche',$('#tc').value.trim())">Rechercher</button></div>`;
const howV = () => `<div class="card"><h3>❓ Comment ça marche</h3><p>1. <b>Inscrivez</b> votre exploitation (élevage ou agriculture).<br>2. <b>Saisie</b> quotidienne : pertes, intrants, vaccins.<br>3. <b>Alertes</b> automatiques si mortalité anormale.<br>4. <b>National</b> : suivi cartographique et statistiques.<br>5. <b>Traçabilité</b> : QR code par exploitation.</p></div>`;
const REAL = [["PC-INFORMATIQUE (ce site)","https://pcinformatique28-cloud.github.io/pc-informatique-site/","Sites, applications & PWA sur mesure"],["AMBI241","https://ambi2412026-debug.github.io/ambi241","Annuaire des bars, restos et boîtes de nuit"],["MAGERANTE","https://magerante241-boop.github.io/magerante/","Caisse et inventaire pour bars, snacks et clubs"],["MALAGA","https://malagagabon-dot.github.io/malaga-gabon/","Location immobilière à Libreville"],["Gabon Sport Connect","https://gabon-sport-connect.web.app","Clubs, fédérations et athlètes"],["LE WORK","https://lework63-2b761.web.app","Clients et techniciens validés"],["BIJOU","https://bijouesno1-bit.github.io/bijou/","Billetterie en ligne sécurisée"],["TROC MAISON","https://trocmaison106-rgb.github.io/troc-maison/","Petites annonces de troc"],["ANEG","https://pcinformatique28-cloud.github.io/aneg-gabon/","Annuaire national des églises"],["LAV","https://gabonlave-spec.github.io/lavegabon/","Laveurs et laveuses au Gabon"]];
const aboutV = () => `<div class="card"><h3>🌱 Neoferme</h3><p><b>De la ferme à l'assiette</b><br>Application de suivi des exploitations agricoles et d'élevage du Gabon : inscription des fermes, saisies quotidiennes, alertes, carte nationale et traçabilité. Version 0.9.</p><span class="chip">11<sup>e</sup> réalisation du studio PC-INFORMATIQUE</span></div>
<div class="card"><h3>👤 Créateur technique</h3><p><b>KOZANGUE ESSONO PATRICK BERTIN</b><br>Informaticien développeur · Fondateur de PC-INFORMATIQUE</p></div>
<div class="card"><h3>🏢 Le studio PC-INFORMATIQUE</h3><p>Studio de développement basé à Libreville, Gabon, spécialisé dans la création de sites, d'applications et de PWA sur mesure pour les entreprises et les particuliers gabonais.</p><a class="lk" href="https://pcinformatique28-cloud.github.io/pc-informatique-site/" target="_blank" rel="noopener">Visiter le site du studio</a></div>
<div class="card"><h3>📁 Nos réalisations</h3>${REAL.map((r, i) => `<a class="row" href="${r[1]}" target="_blank" rel="noopener"><b>${i + 1}. ${r[0]}</b><small>${r[2]}</small></a>`).join("")}<div class="row"><b>11. Neoferme</b><small>Suivi des fermes et traçabilité agricole · vous êtes ici</small></div></div>
<div class="card"><h3>📞 Contact</h3><a class="row" href="mailto:pcinformatique28@gmail.com"><b>✉️ pcinformatique28@gmail.com</b></a><a class="row" href="tel:+24160141924"><b>📞 +241 60 14 19 24</b></a><a class="row" href="https://wa.me/24160141924" target="_blank" rel="noopener"><b>💬 WhatsApp</b></a></div>
<div class="card"><h3>⚖️ Mentions légales</h3><p class="mut"><b>Éditeur :</b> PC-INFORMATIQUE, studio de développement, Libreville, Gabon.<br><b>Données :</b> les informations saisies servent uniquement au fonctionnement de l'application et au suivi des exploitations. Elles sont hébergées via Firebase (Authentification, Firestore).</p></div>`;

// ---- administration : synthèses et exports ----
function group(k) { const o = {}; EX.forEach(e => { const g = o[k(e)] ||= { n: 0, eff: 0, surf: 0, prod: 0 }; g.n++; g.eff += num(e.effectif); g.surf += num(e.surface); g.prod += num(e.production); }); return o; }
const tbl = (t, o) => { const r = Object.entries(o), s = f => r.reduce((a, [, g]) => a + g[f], 0);
  return `<h4>${t}</h4><table><tr><th>${t.split(" ").pop()}</th><th>Expl.</th><th>Effectif</th><th>Surf. ha</th><th>Prod. kg</th></tr>${r.map(([k, g]) => `<tr><td>${esc(k)}</td><td>${g.n}</td><td>${g.eff}</td><td>${g.surf.toFixed(1)}</td><td>${g.prod}</td></tr>`).join("")}<tr class="tot"><td>TOTAL</td><td>${s("n")}</td><td>${s("eff")}</td><td>${s("surf").toFixed(1)}</td><td>${s("prod")}</td></tr></table>`; };
function adminV() {
  return `<div class="card noprint"><h3>🛠️ Administration</h3><button class="b g" onclick="print()">🖨️ Imprimer / enregistrer en PDF</button><button class="b n" onclick="A.csv()">📄 Export CSV (Excel)</button><p class="mut">Pour un PDF : Imprimer → « Enregistrer au format PDF ».</p></div>
<div class="card" id="print"><h3>Neoferme — Synthèse nationale (${new Date().toLocaleDateString("fr-FR")})</h3>${tbl("Synthèse par catégorie", group(e => e.secteur + " / " + e.categorie))}${tbl("Synthèse par province", group(e => e.province))}
<h4>Fiches individuelles</h4><table><tr><th>Nom</th><th>Catégorie</th><th>Lieu</th><th>Eff.</th><th>Mort. %</th></tr>${EX.map(e => `<tr onclick="A.go('fiche','${e.id}')"><td>${esc(e.nom)}</td><td>${esc(e.categorie)}</td><td>${esc(e.ville)}</td><td>${e.effectif || ""}</td><td>${mort(e).toFixed(1)}</td></tr>`).join("")}</table></div>`;
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
  return `<div class="card post${p.hidden ? " hid" : ""}"><div class="ph"><div class="pw">${avs(p.photo, p.nom)}<div class="pi"><b>${esc(p.nom || "Membre")}</b><small>${esc(p.role || "")} · ${ago(p.created)}${p.hidden ? " · 🙈 masqué" : ""}</small></div></div></div>
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
const cmH = id => `${(FCM[id] || []).map(c => `<div class="cm"><div class="pw">${avs(c.photo, c.nom)}<div class="pi"><b>${esc(c.nom)}</b><small>${ago(c.created)}</small></div></div><p>${esc(c.texte)}</p>${canForum() && (c.uid === U.uid || ROLE === "admin") ? `<a onclick="A.fcd('${id}','${c.id}')">Supprimer</a>` : ""}</div>`).join("") || '<p class="mut cr">Aucun commentaire.</p>'}
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
<button class="b g" onclick="A.psave()">Enregistrer mon profil</button><p id="msg" class="err"></p>`;
A.ppre = () => document.querySelectorAll('.x[data-g="prof"]').forEach(i => { i.value = UPF[i.dataset.k] || ""; });
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
    UP = j.secure_url; UPF.photo = UP; setAvatar(); const p = $(".pav"); if (p) p.innerHTML = avatarH() + '<span class="cam">📷</span>'; m.textContent = "✅ Photo mise à jour.";
  } catch (x) { m.textContent = x.code || x.message; }
};
A.prm = async () => { try { await setDoc(doc(db, "users", U.uid), { photo: "" }, { merge: true }); UP = ""; UPF.photo = ""; render(); } catch (x) { $("#pmsg").textContent = x.code || x.message; } };
A.psave = async () => {
  const o = {}, m = $("#msg"); document.querySelectorAll('.x[data-g="prof"]').forEach(i => { o[i.dataset.k] = i.value.trim(); });
  try { await setDoc(doc(db, "users", U.uid), o, { merge: true }); UPF = { ...UPF, ...o }; UN = o.nom || ""; m.style.color = "#1a7f37"; m.textContent = "✅ Profil enregistré."; }
  catch (x) { m.style.color = ""; m.textContent = x.code || x.message; }
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
