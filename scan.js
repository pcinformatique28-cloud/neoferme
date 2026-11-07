const K="nf_scans";
const hist=()=>{try{return JSON.parse(localStorage.getItem(K)||"[]")}catch(e){return[]}};
const save=h=>{try{localStorage.setItem(K,JSON.stringify(h.slice(0,30)))}catch(e){}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const parse=raw=>{const t=String(raw).trim();if(/^M:/i.test(t))return{type:"membre",id:t.slice(2).trim()};
 try{const u=new URL(t);const h=(u.hash||"").replace(/^#\/?/,"");const seg=(h||u.pathname).split("/").filter(Boolean);
  const id=u.searchParams.get("id")||u.searchParams.get("e")||seg[seg.length-1]||t;
  return{type:/membre|profil/i.test(h+u.search)?"membre":"fiche",id:decodeURIComponent(id)}}catch(e){}
 return{type:"fiche",id:t}};
const go=r=>{if(window.A)window.A.go(r.type,r.id)};
let st=null,raf=0,ov=null;
const stop=()=>{cancelAnimationFrame(raf);if(st){st.getTracks().forEach(t=>t.stop());st=null}if(ov){ov.remove();ov=null}};
const loadJs=()=>new Promise(r=>{if(window.jsQR)return r(true);const s=document.createElement("script");s.src="jsqr.min.js";s.onload=()=>r(!!window.jsQR);s.onerror=()=>r(false);document.head.appendChild(s)});
const refresh=()=>{const e=document.getElementById("scl");if(e)e.innerHTML=histH()};
const histH=()=>hist().map((r,i)=>`<a class="row" onclick="SCAN.go(${i})"><b>${r.type==="membre"?"👤 Membre":"🌾 Lot / exploitation"} · ${esc(r.id)}</b><small>${new Date(r.ts).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"})}</small></a>`).join("")||"<p class='mut'>Aucun scan pour l'instant.</p>";
const found=(txt,mode)=>{const r=parse(txt);stop();
 if(mode==="admin"){const h=hist();h.unshift({...r,ts:Date.now()});save(h);refresh();
  if(confirm("Détecté : "+(r.type==="membre"?"membre ":"lot / exploitation ")+r.id+"\nOuvrir la fiche ?"))go(r)}
 else go(r)};
async function open(mode){stop();
 ov=document.createElement("div");ov.style.cssText="position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center";
 ov.innerHTML='<div style="position:relative;width:100%;max-width:520px"><video playsinline muted style="width:100%;max-height:68vh;object-fit:cover"></video><div style="position:absolute;inset:18% 18%;border:3px solid #22c55e;border-radius:16px;pointer-events:none"></div></div><p id="scm" style="color:#fff;padding:14px;text-align:center">Placez le QR code dans le cadre</p><button id="scx" style="padding:12px 26px;border:0;border-radius:12px;background:#fff;font-size:16px;font-weight:700">✖ Fermer</button>';
 document.body.appendChild(ov);ov.querySelector("#scx").onclick=stop;
 const v=ov.querySelector("video"),m=ov.querySelector("#scm");
 const bd=window.BarcodeDetector?new BarcodeDetector({formats:["qr_code"]}):null;
 if(!bd&&!(await loadJs())){m.textContent="Scanner non pris en charge sur ce navigateur.";return}
 try{st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});v.srcObject=st;await v.play()}
 catch(e){m.textContent="Caméra refusée ou indisponible : autorisez l'accès à la caméra.";return}
 const cv=document.createElement("canvas"),cx=cv.getContext("2d",{willReadFrequently:true});
 const tick=async()=>{if(!st)return;if(v.readyState>=2){let t="";
  try{if(bd){const r=await bd.detect(v);if(r[0])t=r[0].rawValue}else{cv.width=v.videoWidth;cv.height=v.videoHeight;cx.drawImage(v,0,0);const d=cx.getImageData(0,0,cv.width,cv.height);const q=window.jsQR(d.data,d.width,d.height);if(q)t=q.data}}catch(e){}
  if(t)return found(t,mode)}raf=requestAnimationFrame(tick)};
 tick()}
window.SCAN={open,histH,go:i=>{const r=hist()[i];if(r)go(r)}};
