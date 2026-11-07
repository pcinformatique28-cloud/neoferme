import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, deleteDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PROVINCES } from "./gabon.js";

// ---- config Firebase : réutilise firebase-config.js existant ----
let cfg;
try { const m = await import("./firebase-config.js"); cfg = Object.values(m).find(v => v && v.apiKey) || (m.default && m.default.apiKey ? m.default : null); } catch (e) {}
if (!cfg && !getApps().length) { try { const t = await (await fetch("firebase-config.js")).text(); const r = t.match(/\{[^{}]*apiKey[^{}]*\}/); if (r) cfg = new Function("return " + r[0])(); } catch (e) {} }
const app = getApps()[0] || initializeApp(cfg || window.firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STAFF = ["admin", "ministere", "technicien"];
let U = null, ROLE = "eleveur", NOM = "", EX = [], SA = [], view = "home", cur = null, mode = "login", map;
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
  if (!U) { SA = []; return; }
  try { SA = (await getDocs(collection(db, "saisies"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(s => isStaff() || s.uid === U.uid); } catch (e) { SA = []; }
}
onAuthStateChanged(auth, async u => {
  U = u; ROLE = "eleveur"; NOM = "";
  if (u) { try { const d = await getDoc(doc(db, "users", u.uid)); ROLE = d.exists() ? (d.data().role || "eleveur") : "eleveur"; NOM = d.exists() ? (d.data().nom || "") : ""; } catch (e) {} }
  await load(); track(); watchVis();
  if (u) { if (view === "login") view = "home"; if (location.hash.startsWith("#lot=")) { view = "fiche"; cur = location.hash.slice(5); } }
  else if (!["home", "how", "about"].includes(view)) view = "home";
  render();
});

// ---- navigation ----
const PUB = [["home", "🏠", "Accueil"], ["how", "❓", "Aide"], ["about", "ℹ️", "À propos"], ["login", "🔑", "Connexion"]];
const TABS = [["home", "🏠", "Accueil"], ["saisie", "✍️", "Saisie"], ["fermes", "🌾", "Exploitations"], ["national", "📊", "National"], ["trace", "🔎", "Traçabilité"]];
A.go = (v, id) => { if (!U && !["home", "how", "about", "login"].includes(v)) v = "login"; view = v; cur = id || null; $("#drawer").classList.remove("open"); window.scrollTo(0, 0); render(); };
A.menu = () => {
  const items = U ? [...TABS, ["notif", "🔔", "Notifications"], ["how", "❓", "Comment ça marche"], ["about", "ℹ️", "À propos de"]] : [["home", "🏠", "Accueil"], ["how", "❓", "Comment ça marche"], ["about", "ℹ️", "À propos de"], ["login", "🔑", "Connexion"]];
  if (isStaff()) items.splice(5, 0, ["admin", "🛠️", "Administration" + (newVis() ? `<i class="bd">${newVis()}</i>` : "")]);
  $("#drawer").innerHTML = `<div class="dp"><b>Neoferme</b><br><small>${U ? esc(U.email) + "<br>Rôle : " + esc(ROLE) : "Visiteur"}</small><hr>${items.map(i => `<a onclick="A.go('${i[0]}')">${i[1]} ${i[2]}</a>`).join("")}${U ? '<a onclick="A.out()">🚪 Déconnexion</a>' : ""}</div><div class="dbg" onclick="A.menu()"></div>`;
  $("#drawer").classList.toggle("open");
};
A.user = () => U ? A.menu() : A.go("login");
A.out = () => { signOut(auth); $("#drawer").classList.remove("open"); };

function render() {
  $("#nav").innerHTML = (U ? TABS : PUB).map(t => `<a class="${view === t[0] ? "on" : ""}" onclick="A.go('${t[0]}')"><span>${t[1]}</span>${t[2]}</a>`).join("");
  updBadges();
  if (map) { map.remove(); map = null; }
  const main = $("#main");
  if (!U && !["home", "how", "about"].includes(view)) view = "login";
  if (!U && view === "login") { main.innerHTML = loginV(); return; }
  main.innerHTML = ({ home: homeV, saisie: saisieV, fermes: fermesV, national: nationalV, trace: traceV, notif: notifV, how: howV, about: aboutV, admin: adminV, fiche: ficheV, nouveau: nouveauV }[view] || homeV)();
  if (view === "home" || view === "national") initMap();
  if (view === "nouveau") A.sect();
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
  if (view === "home") refreshHome(); else EX.filter(e => e.lat).forEach(e => mkr(e).addTo(ML));
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => L.marker([p.coords.latitude, p.coords.longitude]).addTo(map).bindPopup("📍 Vous êtes ici"), () => {});
}

// ---- exploitations ----
const fermesV = () => { const l = isStaff() ? EX : EX.filter(e => e.uid === U.uid);
  return `<div class="card"><h3>${isStaff() ? "Toutes les exploitations" : "Mes exploitations"}</h3><button class="b g" onclick="A.go('nouveau')">➕ Ajouter une exploitation</button>
${l.map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${esc(e.nom)}</b><small>${esc(e.secteur)} · ${esc(e.categorie)} · ${esc(e.ville)} (${esc(e.province)})</small></div>`).join("") || "<p class='mut'>Aucune exploitation enregistrée.</p>"}</div>`; };
function nouveauV() {
  return `<div class="card"><h3>Nouvelle exploitation</h3>
<label>Nom de l'exploitation<input id="xn"></label>
<label>Secteur<select id="sec" onchange="A.sect()">${Object.keys(SEC).map(s => `<option>${s}</option>`).join("")}</select></label>
<label>Catégorie<select id="cat" onchange="A.cat()"></select></label><div id="dyn"></div>
<label id="effl">Effectif (têtes)<input id="effectif" type="number"></label>
<label>Surface / emprise (ha)<input id="surface" type="number" step="0.01"></label>
<label>Production annuelle estimée (kg)<input id="prod" type="number"></label>
<label>Province<select id="prov" onchange="A.prov()">${Object.keys(PROVINCES).map(p => `<option>${p}</option>`).join("")}</select></label>
<label>Ville / commune<select id="ville" onchange="A.ville()"></select></label>
<label>Quartier<input id="quartier" list="ql" placeholder="Choisir ou saisir"></label><datalist id="ql"></datalist>
<label>Village / lieu-dit<input id="village" placeholder="Saisie libre"></label>
<label>Position GPS<div class="gps"><input id="lat" placeholder="Latitude"><input id="lng" placeholder="Longitude"></div></label>
<button class="b n" onclick="A.gps()">📍 Utiliser ma position</button><button class="b g" onclick="A.save()">Enregistrer</button><p id="msg" class="err"></p></div>`;
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
  const e = { uid: U.uid, nom, secteur: $("#sec").value, categorie: $("#cat").value, details, effectif: num($("#effectif").value), surface: num($("#surface").value), production: num($("#prod").value),
    province: $("#prov").value, ville: $("#ville").value, quartier: $("#quartier").value, village: $("#village").value, lat: parseFloat($("#lat").value) || v.lat, lng: parseFloat($("#lng").value) || v.lng, created: serverTimestamp() };
  try { await addDoc(collection(db, "exploitations"), e); await load(); A.go("fermes"); } catch (x) { $("#msg").textContent = x.code || x.message; }
};
function ficheV() {
  const e = EX.find(x => x.id === cur); if (!e) return fermesV();
  const url = location.origin + location.pathname + "#lot=" + e.id;
  return `<div class="card" id="print"><h3>${esc(e.nom)}</h3><p>${esc(e.secteur)} · ${esc(e.categorie)}</p>
<p>📍 ${esc([e.village, e.quartier, e.ville, e.province].filter(Boolean).join(", "))}<br>GPS : ${e.lat?.toFixed?.(4)}, ${e.lng?.toFixed?.(4)}</p>
<p>Effectif : ${e.effectif || "–"} · Surface : ${e.surface || 0} ha · Production : ${e.production || 0} kg/an · Mortalité : ${mort(e).toFixed(1)} %</p>
<p>${Object.entries(e.details || {}).map(([k, v]) => `${esc(k)} : ${esc(v)}`).join("<br>")}</p><p class="mut">Code traçabilité : <b>${e.id}</b></p>
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
const notifV = () => (isStaff() ? visNotif() : "") + `<div class="card"><h3>🔔 Alertes</h3>${alerts().map(e => `<div class="row" onclick="A.go('fiche','${e.id}')"><b>${esc(e.nom)}</b><small>Mortalité ${mort(e).toFixed(1)} % (> 5 %) · ${esc(e.ville)}</small></div>`).join("") || "<p class='mut'>Aucune alerte.</p>"}</div>`;
const traceV = () => `<div class="card"><h3>🔎 Traçabilité</h3><label>Code de l'exploitation / lot<input id="tc"></label><button class="b g" onclick="A.go('fiche',$('#tc').value.trim())">Rechercher</button></div>`;
const howV = () => `<div class="card"><h3>❓ Comment ça marche</h3><p>1. <b>Inscrivez</b> votre exploitation (élevage ou agriculture).<br>2. <b>Saisie</b> quotidienne : pertes, intrants, vaccins.<br>3. <b>Alertes</b> automatiques si mortalité anormale.<br>4. <b>National</b> : suivi cartographique et statistiques.<br>5. <b>Traçabilité</b> : QR code par exploitation.</p></div>`;
const REAL = [["PC-INFORMATIQUE (ce site)","https://pcinformatique28-cloud.github.io/pc-informatique-site/","Sites, applications & PWA sur mesure"],["AMBI241","https://ambi2412026-debug.github.io/ambi241","Annuaire des bars, restos et boîtes de nuit"],["MAGERANTE","https://magerante241-boop.github.io/magerante/","Caisse et inventaire pour bars, snacks et clubs"],["MALAGA","https://malagagabon-dot.github.io/malaga-gabon/","Location immobilière à Libreville"],["Gabon Sport Connect","https://gabon-sport-connect.web.app","Clubs, fédérations et athlètes"],["LE WORK","https://lework63-2b761.web.app","Clients et techniciens validés"],["BIJOU","https://bijouesno1-bit.github.io/bijou/","Billetterie en ligne sécurisée"],["TROC MAISON","https://trocmaison106-rgb.github.io/troc-maison/","Petites annonces de troc"],["ANEG","https://pcinformatique28-cloud.github.io/aneg-gabon/","Annuaire national des églises"],["LAV","https://gabonlave-spec.github.io/lavegabon/","Laveurs et laveuses au Gabon"]];
const aboutV = () => `<div class="card"><h3>🌱 Neoferme</h3><p><b>De la ferme à l'assiette</b><br>Application de suivi des exploitations agricoles et d'élevage du Gabon : inscription des fermes, saisies quotidiennes, alertes, carte nationale et traçabilité. Version 0.7.</p><span class="chip">11<sup>e</sup> réalisation du studio PC-INFORMATIQUE</span></div>
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
  return `<div class="card noprint"><h3>🛠️ Administration</h3><button class="b g" onclick="print()">🖨️ Imprimer / enregistrer en PDF</button><button class="b n" onclick="A.csv()">📄 Export CSV (Excel)</button><p class="mut">Pour un PDF : Imprimer → « Enregistrer au format PDF ».</p></div>
<div class="card" id="print"><h3>Neoferme — Synthèse nationale (${new Date().toLocaleDateString("fr-FR")})</h3>${tbl("Synthèse par catégorie", group(e => e.secteur + " / " + e.categorie))}${tbl("Synthèse par province", group(e => e.province))}
<h4>Fiches individuelles</h4><table><tr><th>Nom</th><th>Catégorie</th><th>Lieu</th><th>Eff.</th><th>Mort. %</th></tr>${EX.map(e => `<tr onclick="A.go('fiche','${e.id}')"><td>${esc(e.nom)}</td><td>${esc(e.categorie)}</td><td>${esc(e.ville)}</td><td>${e.effectif || ""}</td><td>${mort(e).toFixed(1)}</td></tr>`).join("")}</table></div>`;
}
A.csv = () => { const h = ["id", "nom", "secteur", "categorie", "province", "ville", "quartier", "village", "lat", "lng", "effectif", "surface_ha", "production_kg", "mortalite_%"];
  const r = EX.map(e => [e.id, e.nom, e.secteur, e.categorie, e.province, e.ville, e.quartier, e.village, e.lat, e.lng, e.effectif, e.surface, e.production, mort(e).toFixed(1)].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + h.join(";") + "\n" + r.join("\n")], { type: "text/csv" })); a.download = "neoferme-exploitations.csv"; a.click(); };


// ---- tracking des connexions (admin) ----
let atab = "synth", VIS = [], TF = { t: "", q: "" }, PREV = 0, SEEN = 0, unsub = null;
const dev = () => { const u = navigator.userAgent; return (/Tablet|iPad/i.test(u) ? "Tablette" : /Mobi|Android|iPhone/i.test(u) ? "Mobile" : "Ordinateur") + " · " + (/Edg/.test(u) ? "Edge" : /OPR|Opera/.test(u) ? "Opera" : /Chrome/.test(u) ? "Chrome" : /Firefox/.test(u) ? "Firefox" : /Safari/.test(u) ? "Safari" : "Autre"); };
async function track() {
  try {
    const key = "nf_t_" + (U ? U.uid : "v"); if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1");
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
function updBadges() { const n = newVis(), a = alerts().length + n, b = $("#badge"), t = $("#bt"); if (b) b.textContent = a > 99 ? "99+" : a || ""; if (t) t.textContent = n || ""; }
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
const visNotif = () => { const l = VIS.filter(v => v.ts > SEEN && v.uid !== U.uid);
  return `<div class="card"><h3>📡 Nouvelles connexions <span class="bd">${l.length || ""}</span></h3>${l.slice(0, 10).map(v => `<div class="row"><b>${esc(v.nom)} · ${esc(v.type)}</b><small>${esc(v.ville)}, ${esc(v.pays)} · ${new Date(v.ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></div>`).join("") || "<p class='mut'>Aucune nouvelle connexion.</p>"}<button class="b n" onclick="A.go('admin');A.atab('track')">Ouvrir le tracking</button>${l.length ? '<button class="b g" onclick="A.seen()">✔️ Marquer comme vu</button>' : ""}</div>`; };
A.seen = () => { markSeen(); render(); };

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
