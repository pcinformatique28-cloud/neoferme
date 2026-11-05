// Gabon : 9 provinces -> villes [lat, lng, quartiers]. Saisie libre possible pour les villages/lieux-dits.
const T = (lat, lng, q = []) => ({ lat, lng, q });
export const PROVINCES = {
  "Estuaire": { chef: "Libreville", villes: {
    "Libreville": T(0.4162, 9.4673, ["Akébé", "Nzeng-Ayong", "Lalala", "Louis", "Glass", "Batterie IV", "Mont-Bouët", "PK5", "PK8", "PK12", "Okala", "Nombakélé", "Alibandeng", "Plein-Ciel", "Sibang", "Ozangué", "Awendjé", "Montagne Sainte", "Charbonnages", "Likouala"]),
    "Owendo": T(0.2917, 9.5, ["Alénakiri", "Barracuda", "Akournam", "Awoungou"]),
    "Akanda": T(0.5333, 9.3333, ["Angondjé", "Cap Estérias", "Bambouchine", "Malibé"]),
    "Ntoum": T(0.3833, 9.7667), "Cocobeach": T(1.0, 9.6), "Kango": T(0.1667, 10.1333), "Cap Estérias": T(0.5833, 9.3333) } },
  "Haut-Ogooué": { chef: "Franceville", villes: {
    "Franceville": T(-1.6333, 13.5833, ["Potos", "Mbaya", "Bangombé", "Ogoua", "Mangoungou", "Batavéa"]),
    "Moanda": T(-1.5667, 13.2), "Mounana": T(-1.4, 13.15), "Léconi": T(-1.5833, 14.25),
    "Okondja": T(-0.6667, 13.7833), "Akiéni": T(-1.1833, 13.9167), "Bakoumba": T(-1.8167, 13.1167) } },
  "Moyen-Ogooué": { chef: "Lambaréné", villes: {
    "Lambaréné": T(-0.7, 10.2333, ["Isaac", "Adouma", "Atongowanga", "Sabot"]),
    "Ndjolé": T(-0.1833, 10.7667), "Bifoun": T(-0.3333, 10.3833) } },
  "Ngounié": { chef: "Mouila", villes: {
    "Mouila": T(-1.8667, 11.0556), "Fougamou": T(-1.2167, 10.5833), "Ndendé": T(-2.4, 11.35), "Lébamba": T(-2.1833, 11.5) } },
  "Nyanga": { chef: "Tchibanga", villes: {
    "Tchibanga": T(-2.85, 11.0333), "Mayumba": T(-3.4333, 10.65), "Moabi": T(-2.4333, 11.0) } },
  "Ogooué-Ivindo": { chef: "Makokou", villes: {
    "Makokou": T(0.5667, 12.8667), "Booué": T(-0.1, 11.9333), "Mékambo": T(1.0167, 13.9333) } },
  "Ogooué-Lolo": { chef: "Koulamoutou", villes: {
    "Koulamoutou": T(-1.1333, 12.4667), "Lastoursville": T(-0.8167, 12.7), "Pana": T(-1.8667, 12.8333) } },
  "Ogooué-Maritime": { chef: "Port-Gentil", villes: {
    "Port-Gentil": T(-0.7167, 8.7833, ["Grand Village", "Balise", "Ntchengué", "Cap Lopez", "Madagascar", "Bac Aviation", "Haut-de-Gué-Gué"]),
    "Omboué": T(-1.5667, 9.2667), "Gamba": T(-2.65, 10.0) } },
  "Woleu-Ntem": { chef: "Oyem", villes: {
    "Oyem": T(1.6, 11.5833, ["Ngoumou", "Akoakam", "Mfoulayong"]),
    "Bitam": T(2.0833, 11.4833), "Mitzic": T(0.7833, 11.5), "Minvoul": T(2.15, 12.1333), "Médouneu": T(0.9667, 10.8) } }
};
