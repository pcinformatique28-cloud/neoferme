import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,updateDoc,addDoc,collection,query,where,onSnapshot,getDocs,limit,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const au=getAuth(initializeApp(firebaseConfig)),db=getFirestore(),ADMIN="pcinformatique28@gmail.com";
const $=q=>document.querySelector(q),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let U=null,P={},ADM=false,N=[],unsub=null;
const PR=[["alertes","🚨 Alertes mortalité"],["vaccins","💉 Rappels de vaccins"],["saisie","✍️ Saisie manquante"],["annonces","📣 Annonces officielles"]];
const X='<button data-a="x" class="btn2">Fermer</button>';
const css=document.createElement("style");css.textContent=`
body.out main,body.out nav,body.out footer,body.out #hb,body.out #bell{display:none!important}
#hb,#bell{background:none;border:0;color:#fff;font-size:1.5rem;width:auto;margin:0;padding:4px 8px;position:relative;display:block}
#bc{position:absolute;top:-2px;right:-2px;background:#f26b21;border-radius:99px;font:700 .65rem system-ui;padding:1px 5px;font-style:normal}
#lg{position:fixed;inset:0;z-index:50;background:linear-gradient(160deg,#0b1f4d,#1f9d55);display:none;align-items:center;justify-content:center;padding:16px;overflow:auto}
body.out #lg{display:flex}.bx{background:#fff;border-radius:18px;padding:20px;width:100%;max-width:380px}
.pw{position:relative}.pw button{position:absolute;right:4px;top:4px;width:auto;margin:0;background:none;color:#64708a;padding:10px;font-size:1.2rem}
.lk{background:none!important;color:#3a75c4!important;font-size:.9rem!important;padding:8px!important;margin:4px 0 0!important}
#ov{position:fixed;inset:0;background:#0008;z-index:30;display:none}
#dr{position:fixed;top:0;bottom:0;left:0;width:78%;max-width:300px;background:#fff;z-index:31;transform:translateX(-105%);transition:.25s;padding:calc(16px + env(safe-area-inset-top,0px)) 0 16px;overflow:auto}
body.mo #dr{transform:none}body.mo #ov{display:block}
#dr a,#dr button{display:block;width:100%;text-align:left;padding:14px 20px;background:none;color:#16213e;border:0;border-radius:0;margin:0;font-size:1rem;font-weight:600;text-decoration:none}
#dr .hd{padding:6px 20px 14px;border-bottom:1px solid #e6ebf3;color:#64708a;font-size:.85rem}
#md{position:fixed;inset:0;z-index:40;background:#0008;display:none;align-items:flex-end;justify-content:center}
#md>div{background:#fff;width:100%;max-width:640px;max-height:88%;overflow:auto;border-radius:18px 18px 0 0;padding:18px}
.sw{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eef1f6;margin:0}
.sw input{width:26px;height:26px;padding:0;accent-color:#1f9d55}
#hw{position:fixed;right:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:20;width:auto;margin:0;padding:12px 16px;border-radius:99px;background:#f26b21;font-size:.9rem;box-shadow:0 4px 14px #0004;transition:.6s}
#hw.off{opacity:0;pointer-events:none;transform:translateY(20px)}
.sm{width:auto;margin:0;padding:6px 10px;font-size:.8rem;border-radius:8px}`;
document.head.append(css);
const LG=document.createElement("div");LG.id="lg";LG.innerHTML=`<div class="bx"><h2 style="text-align:center;margin:0">SYSTEP</h2><p style="text-align:center;color:#64708a;margin:4px 0 8px">Agri-Track 241 · connexion</p>
<label>E-mail</label><input id="em" type="email" autocomplete="username"><label>Mot de passe</label>
<div class="pw"><input id="pw" type="password" autocomplete="current-password"><button type="button" data-a="eye">👁️</button></div>
<button data-a="login">Se connecter</button><button data-a="reg" class="btn2">Créer un compte</button><button data-a="forgot" class="lk">Mot de passe oublié ?</button><div id="lm"></div></div>`;
document.body.append(LG);
document.body.insertAdjacentHTML("beforeend",`<div id="ov" data-a="menu"></div><div id="dr"></div><div id="md"></div><button id="hw" class="off" data-a="help">❓ Comment ça marche</button>`);
document.body.classList.add("out");
const h=document.querySelector("header");
h.insertAdjacentHTML("afterbegin",'<button id="hb" data-a="menu" aria-label="Menu">☰</button>');
h.insertAdjacentHTML("beforeend",'<button id="bell" data-a="bell" aria-label="Notifications">🔔<i id="bc"></i></button>');
const M=t=>{$("#md").innerHTML="<div>"+t+"</div>";$("#md").style.display="flex"},C=()=>{$("#md").style.display="none"};
const ER={"auth/invalid-credential":"E-mail ou mot de passe incorrect.","auth/invalid-email":"Adresse e-mail invalide.","auth/email-already-in-use":"Cette adresse a déjà un compte.","auth/weak-password":"Mot de passe trop court (6 caractères minimum).","auth/network-request-failed":"Pas de connexion Internet.","auth/too-many-requests":"Trop d’essais, réessayez plus tard."};
const lm=(t,ok)=>{$("#lm").innerHTML=`<div class="msg ${ok?"ok":"al"}">${t}</div>`},er=e=>lm(ER[e.code]||"Erreur : "+e.code);
const log=(action,target)=>addDoc(collection(db,"auditLogs"),{actor:U.email,action,target,at:serverTimestamp()}).catch(()=>{});
const list=()=>N.filter(n=>P.prefs?.[n.type]!==false);
function badge(){const s=+localStorage.getItem("seen")||0,n=list().filter(x=>(x.at?.seconds||0)*1000>s).length;$("#bc").textContent=n||"";$("#bc").style.display=n?"block":"none"}
function drawer(){$("#dr").innerHTML=`<div class="hd"><b style="color:#0b1f4d;font-size:1.1rem">SYSTEP</b><br>${esc(U.email)}<br>Rôle : ${ADM?"administrateur":esc(P.role)}</div>
<a href="#accueil" data-a="menu">🏠 Accueil</a><a href="#saisie" data-a="menu">✍️ Saisie</a><a href="#dashboard" data-a="menu">📊 National</a><a href="#tracabilite" data-a="menu">🔎 Traçabilité</a>
<button data-a="bell">🔔 Notifications</button>${ADM?'<button data-a="admin">🛠️ Administration</button>':""}<button data-a="help">❓ Comment ça marche</button><button data-a="about">ℹ️ À propos de</button><button data-a="out">🚪 Déconnexion</button>`}
function listen(){unsub&&unsub();unsub=onSnapshot(query(collection(db,"notifications"),where("to","in",[U.uid,"all"])),s=>{N=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.at?.seconds||0)-(a.at?.seconds||0));badge()},()=>{})}
async function admin(){M("<h2>🛠️ Administration</h2><p>Chargement…</p>");
const us=(await getDocs(collection(db,"users"))).docs.map(d=>({id:d.id,...d.data()}));let lg=[];
try{lg=(await getDocs(query(collection(db,"auditLogs"),limit(15)))).docs.map(d=>d.data())}catch(e){}
const rl=["eleveur","technicien","ministere","admin"];
M(`<h2>🛠️ Administration</h2><div class="grid"><div class="k"><b>${us.length}</b><span>Utilisateurs</span></div><div class="k"><b>${us.filter(u=>u.status=="suspendu").length}</b><span>Suspendus</span></div></div>
<h3 style="margin-top:14px">Utilisateurs</h3><div class="sc"><table>${us.map(u=>`<tr><td>${esc(u.email)}</td><td><select data-u="${u.id}" style="padding:6px">${rl.map(r=>`<option ${u.role==r?"selected":""}>${r}</option>`).join("")}</select></td><td><button class="sm" data-a="sus" data-id="${u.id}" data-s="${u.status=="suspendu"?"actif":"suspendu"}">${u.status=="suspendu"?"Réactiver":"Suspendre"}</button></td></tr>`).join("")}</table></div>
<h3 style="margin-top:14px">📣 Envoyer une annonce</h3><input id="at" placeholder="Titre"><input id="ax" placeholder="Message" style="margin-top:6px"><select id="ay" style="margin-top:6px">${PR.map(p=>`<option value="${p[0]}">${p[1]}</option>`).join("")}</select><button data-a="ann">Envoyer à tous</button>
<h3 style="margin-top:14px">Journal d’audit</h3>${lg.map(l=>`<p style="margin:4px 0;font-size:.8rem">${esc(l.actor)} · ${esc(l.action)} · ${esc(l.target)}</p>`).join("")||"<p style='color:#64708a'>Vide.</p>"}
<button data-a="csv" class="btn2">⬇️ Exporter les utilisateurs</button>${X}`);window._us=us}
const A={
menu(){document.body.classList.toggle("mo")},x:C,
eye(e){const i=$("#pw"),s=i.type=="password";i.type=s?"text":"password";e.textContent=s?"🙈":"👁️"},
async login(){try{await signInWithEmailAndPassword(au,$("#em").value.trim(),$("#pw").value)}catch(e){er(e)}},
async reg(){try{const c=await createUserWithEmailAndPassword(au,$("#em").value.trim(),$("#pw").value);sendEmailVerification(c.user).catch(()=>{})}catch(e){er(e)}},
async forgot(){const m=$("#em").value.trim();if(!m)return lm("Entrez d’abord votre e-mail.");try{await sendPasswordResetEmail(au,m);lm("E-mail de réinitialisation envoyé.",1)}catch(e){er(e)}},
bell(){document.body.classList.remove("mo");localStorage.setItem("seen",Date.now());badge();
M(`<h2>🔔 Notifications</h2>`+PR.map(([k,l])=>`<label class="sw"><span>${l}</span><input type="checkbox" data-k="${k}" ${P.prefs?.[k]!==false?"checked":""}></label>`).join("")+`<h3 style="margin-top:14px">Récentes</h3>`+(list().map(n=>`<p style="margin:8px 0"><b>${esc(n.title)}</b><br><small style="color:#64708a">${esc(n.text)}</small></p>`).join("")||"<p style='color:#64708a'>Aucune notification.</p>")+X)},
help(){document.body.classList.remove("mo");$("#hw").classList.add("off");M(`<h2>❓ Comment ça marche</h2><p><b>1. ✍️ Saisie</b> : l’éleveur note chaque jour morts, aliment et vaccins.</p><p><b>2. 🚨 Alertes</b> : une mortalité anormale prévient le technicien.</p><p><b>3. 📊 National</b> : le ministère suit les 150 fermes en direct.</p><p><b>4. 🔎 Traçabilité</b> : un QR code donne l’origine de chaque lot.</p>`+X)},
about(){document.body.classList.remove("mo");M(`<h2>ℹ️ À propos de SYSTEP</h2><p>SYSTEP est la plateforme de suivi technico-économique et de traçabilité des 150 fermes avicoles du programme POUFA, présentée au Challenge National Agri-Track 241.</p><p><b>Partenaires</b> : Ministère de l’Agriculture, de l’Élevage et du Développement rural · Ministère de l’Économie numérique · Centre Gabonais de l’Innovation.</p><p><b>Version</b> 0.2 (prototype)<br><b>Contact</b> : ${ADMIN}</p>`+X)},
async out(){document.body.classList.remove("mo");await signOut(au)},admin(){document.body.classList.remove("mo");admin()},
async sus(e){await updateDoc(doc(db,"users",e.dataset.id),{status:e.dataset.s});log("statut "+e.dataset.s,e.dataset.id);admin()},
async ann(){const t=$("#at").value.trim();if(!t)return;await addDoc(collection(db,"notifications"),{title:t,text:$("#ax").value,type:$("#ay").value,to:"all",at:serverTimestamp()});log("annonce",t);M("<h2>✅ Annonce envoyée</h2>"+X)},
csv(){const t="email,role,statut\n"+window._us.map(u=>[u.email,u.role,u.status].join(",")).join("\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([t],{type:"text/csv"}));a.download="utilisateurs.csv";a.click()}};
document.addEventListener("click",e=>{if(e.target.id=="md")return C();const b=e.target.closest("[data-a]");if(b&&A[b.dataset.a])A[b.dataset.a](b)});
document.addEventListener("change",async e=>{const k=e.target.dataset.k,u=e.target.dataset.u;
if(k){P.prefs={...P.prefs,[k]:e.target.checked};updateDoc(doc(db,"users",U.uid),{prefs:P.prefs}).catch(()=>{});badge()}
if(u&&ADM){await updateDoc(doc(db,"users",u),{role:e.target.value});log("rôle "+e.target.value,u)}});
onAuthStateChanged(au,async u=>{U=u;document.body.classList.toggle("out",!u);if(!u){P={};return}
try{const r=doc(db,"users",u.uid);let s=await getDoc(r);if(!s.exists()){await setDoc(r,{email:u.email,role:"eleveur",status:"actif",prefs:{alertes:true,vaccins:true,saisie:true,annonces:true},createdAt:serverTimestamp()});s=await getDoc(r)}P=s.data()}catch(e){P={role:"eleveur",prefs:{}}}
if(P.status=="suspendu"){await signOut(au);lm("Compte suspendu. Contactez l’administrateur.");return}
ADM=(u.email==ADMIN&&u.emailVerified)||P.role=="admin";drawer();listen();
setTimeout(()=>$("#hw").classList.remove("off"),800);setTimeout(()=>$("#hw").classList.add("off"),11000)});
