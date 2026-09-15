/*
 * Spese Casa — logica pura, senza DOM.
 * Stesso formato dati della versione per computer (spese-casa.html), così i backup
 * passano dall'una all'altra:
 *   db = { "2026": { in: { "Stipendio": [12 importi] }, out: { "Bollette": [...] } } }
 * Nell'app è window.SpeseCore; nei test si carica con require().
 */
(function (radice, fabbrica) {
  const api = fabbrica();
  if (typeof module === "object" && module.exports) module.exports = api;
  else radice.SpeseCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  const MESI_S = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const DEFAULTS = { in: ["Stipendio"], out: ["Bollette", "Spesa cibo", "Rate mutuo", "Rate varie"] };
  const SEZIONI = ["in", "out"];
  const MAX_NOME = 40;

  const zeri = () => Array(12).fill(0);
  const cent = (v) => Math.round(v * 100) / 100 || 0; // `|| 0` toglie il -0
  const somma = (valori) => cent(valori.reduce((s, v) => s + v, 0));
  const haChiave = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const eAnno = (k) => /^\d{4}$/.test(k);

  /**
   * Legge un importo scritto a mano: "1.234,56" · "12,5" · "€ 80" · "-30" · "1234.5".
   * La virgola è sempre decimale (tastiera italiana); il punto è separatore delle
   * migliaia solo nella forma 1.234 / 12.345.678. Non valido → 0.
   */
  function parseImporto(testo) {
    if (typeof testo === "number") return Number.isFinite(testo) ? cent(testo) : 0;
    let s = String(testo ?? "").replace(/[€\s ]/g, "");
    let segno = 1;
    if (/^[-−]/.test(s)) { segno = -1; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1);
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return 0;
    const virgola = s.lastIndexOf(","), punto = s.lastIndexOf(".");
    if (virgola === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    } else if (virgola !== -1 || punto !== -1) {
      const i = Math.max(virgola, punto); // il separatore più a destra è quello decimale
      s = s.slice(0, i).replace(/[.,]/g, "") + "." + s.slice(i + 1).replace(/[.,]/g, "");
    }
    const v = Number(s);
    return Number.isFinite(v) ? cent(segno * v) : 0;
  }

  /** Importo già salvato (numero, o stringa da un backup scritto a mano). */
  function num(v) {
    return typeof v === "number" ? (Number.isFinite(v) ? v : 0) : parseImporto(v);
  }

  function cifre(v) {
    const c = cent(Number(v) || 0);
    const abs = Math.abs(c);
    const [intero, decimali] = abs.toFixed(Number.isInteger(abs) ? 0 : 2).split(".");
    return { negativo: c < 0, intero, decimali };
  }

  /** 1234 → "€1.234" · -12.5 → "-€12,50": come la versione per computer, centesimi solo se ci sono. */
  function formatEur(v) {
    const { negativo, intero, decimali } = cifre(v);
    return (negativo ? "-" : "") + "€" + intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".") +
      (decimali ? "," + decimali : "");
  }

  /** Valore da mostrare nel campo di un importo: "" per zero, "800", "12,50". */
  function formatCampo(v) {
    const { negativo, intero, decimali } = cifre(v);
    if (intero === "0" && !decimali) return "";
    return (negativo ? "-" : "") + intero + (decimali ? "," + decimali : "");
  }

  /** Numero per il CSV (separatore ";", quindi virgola decimale per Excel italiano). */
  function formatCsv(v) {
    return formatCampo(v) || "0";
  }

  /**
   * Dati di un anno. Se non esiste lo crea: con le voci dell'anno precedente più
   * vicino (importi a zero) oppure, se non ce ne sono, con le voci predefinite.
   */
  function anno(db, y) {
    const k = String(y);
    if (!haChiave(db, k)) {
      const precedente = Object.keys(db).filter((a) => eAnno(a) && +a < +k).sort((a, b) => b - a)[0];
      const base = precedente ? db[precedente] : null;
      const nuovo = { in: {}, out: {} };
      for (const sez of SEZIONI) {
        const nomi = base ? Object.keys(base[sez] || {}) : DEFAULTS[sez];
        for (const n of nomi) nuovo[sez][n] = zeri();
      }
      db[k] = nuovo;
    }
    return db[k];
  }

  function totaleMese(dati, sez, m) {
    return somma(Object.values(dati[sez]).map((valori) => num(valori[m])));
  }

  function totaleSezione(dati, sez) {
    let s = 0;
    for (let m = 0; m < 12; m++) s += totaleMese(dati, sez, m);
    return cent(s);
  }

  /** Per ogni mese: entrate, uscite, saldo del mese e saldo cumulato da gennaio. */
  function riepilogoMesi(dati) {
    let cumulato = 0;
    return Array.from({ length: 12 }, (_, m) => {
      const entrate = totaleMese(dati, "in", m);
      const uscite = totaleMese(dati, "out", m);
      const saldo = cent(entrate - uscite);
      cumulato = cent(cumulato + saldo);
      return { entrate, uscite, saldo, cumulato };
    });
  }

  function riepilogoAnno(dati) {
    const entrate = totaleSezione(dati, "in");
    const uscite = totaleSezione(dati, "out");
    const saldo = cent(entrate - uscite);
    return { entrate, uscite, saldo, media: Math.round(saldo / 12) || 0 };
  }

  const pulisciNome = (nome) => String(nome ?? "").replace(/\s+/g, " ").trim();

  /** Controlla un nome di voce: { nome } se va bene, { errore } altrimenti. */
  function controllaNome(dati, sez, nome, attuale) {
    const n = pulisciNome(nome);
    if (!n) return { errore: "Scrivi il nome della voce." };
    if (n.length > MAX_NOME) return { errore: `Nome troppo lungo (massimo ${MAX_NOME} caratteri).` };
    if (n === "__proto__") return { errore: "Nome non valido." };
    const minuscolo = n.toLocaleLowerCase("it");
    const doppio = Object.keys(dati[sez]).some((k) => k !== attuale && k.toLocaleLowerCase("it") === minuscolo);
    if (doppio) return { errore: `«${n}» c'è già.` };
    return { nome: n };
  }

  function aggiungiVoce(dati, sez, nome) {
    const esito = controllaNome(dati, sez, nome);
    if (esito.nome) dati[sez][esito.nome] = zeri();
    return esito;
  }

  /** Rinomina tenendo importi e posizione della voce. */
  function rinominaVoce(dati, sez, vecchio, nuovo) {
    if (!haChiave(dati[sez], vecchio)) return { errore: "Voce non trovata." };
    const esito = controllaNome(dati, sez, nuovo, vecchio);
    if (!esito.nome || esito.nome === vecchio) return esito;
    const voci = {};
    for (const [k, v] of Object.entries(dati[sez])) voci[k === vecchio ? esito.nome : k] = v;
    dati[sez] = voci;
    return esito;
  }

  function eliminaVoce(dati, sez, nome) {
    delete dati[sez][nome];
  }

  /** Scrive l'importo digitato e restituisce il numero salvato (null se la voce non c'è). */
  function impostaImporto(dati, sez, nome, m, valore) {
    if (!haChiave(dati[sez], nome)) return null;
    return (dati[sez][nome][m] = parseImporto(valore));
  }

  function azzeraAnno(dati) {
    for (const sez of SEZIONI) for (const n of Object.keys(dati[sez])) dati[sez][n] = zeri();
  }

  function copiaMese(dati, da, a) {
    for (const sez of SEZIONI) for (const valori of Object.values(dati[sez])) valori[a] = num(valori[da]);
  }

  function meseVuoto(dati, m) {
    return SEZIONI.every((sez) => Object.values(dati[sez]).every((valori) => num(valori[m]) === 0));
  }

  function mesiConDati(dati) {
    return Array.from({ length: 12 }, (_, m) => !meseVuoto(dati, m));
  }

  /** Anni da proporre: da due anni fa a tre anni avanti, più quelli che hanno già dati. */
  function anniDisponibili(db, corrente) {
    const anni = new Set();
    for (let y = corrente - 2; y <= corrente + 3; y++) anni.add(y);
    for (const k of Object.keys(db)) if (eAnno(k)) anni.add(+k);
    return [...anni].sort((a, b) => a - b);
  }

  /**
   * Valida e ripulisce dati letti da un backup o dal telefono. Accetta il formato
   * della versione per computer ({ app, version, data }) e quello "grezzo".
   * Lancia un Error con messaggio leggibile se non c'è niente di utilizzabile.
   */
  function normalizzaDb(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Il file non contiene dati di Spese Casa.");
    const sorgente = obj.data && typeof obj.data === "object" && !Array.isArray(obj.data) ? obj.data : obj;
    const db = {};
    for (const [y, a] of Object.entries(sorgente)) {
      if (!eAnno(y) || !a || typeof a !== "object" || Array.isArray(a)) continue;
      const dati = { in: {}, out: {} };
      let valido = false;
      for (const sez of SEZIONI) {
        const voci = a[sez];
        if (!voci || typeof voci !== "object" || Array.isArray(voci)) continue;
        valido = true;
        for (const [nome, valori] of Object.entries(voci)) {
          if (!nome || nome === "__proto__") continue;
          const importi = zeri();
          if (Array.isArray(valori)) for (let m = 0; m < 12; m++) importi[m] = parseImporto(valori[m]);
          dati[sez][nome] = importi;
        }
      }
      if (valido) db[y] = dati;
    }
    if (!Object.keys(db).length) throw new Error("Il file non contiene dati di Spese Casa.");
    return db;
  }

  /** Stesso formato del «Salva backup» della versione per computer. */
  function creaBackup(db) {
    return JSON.stringify({ app: "spese-casa", version: 1, data: db }, null, 2);
  }

  function campoCsv(x) {
    let s = String(x);
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; // niente formule di Excel dai nomi
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** CSV dell'anno, separatore ";" come la versione per computer (più i totali di sezione). */
  function creaCSV(dati) {
    const righe = [["Voce", ...MESI_S, "Totale"]];
    const sezione = (titolo, sez, etichettaTotale) => {
      righe.push([titolo]);
      for (const [nome, valori] of Object.entries(dati[sez])) {
        const importi = valori.map(num);
        righe.push([nome, ...importi.map(formatCsv), formatCsv(somma(importi))]);
      }
      const totali = Array.from({ length: 12 }, (_, m) => totaleMese(dati, sez, m));
      righe.push([etichettaTotale, ...totali.map(formatCsv), formatCsv(somma(totali))]);
    };
    sezione("ENTRATE", "in", "Totale entrate");
    sezione("USCITE", "out", "Totale uscite");
    const mesi = riepilogoMesi(dati);
    righe.push(["Saldo mese", ...mesi.map((x) => formatCsv(x.saldo)), formatCsv(riepilogoAnno(dati).saldo)]);
    righe.push(["Saldo cumulato", ...mesi.map((x) => formatCsv(x.cumulato))]);
    return righe.map((riga) => riga.map(campoCsv).join(";")).join("\r\n");
  }

  return {
    MESI, MESI_S, DEFAULTS, SEZIONI, MAX_NOME,
    cent, parseImporto, num, formatEur, formatCampo,
    anno, totaleMese, totaleSezione, riepilogoMesi, riepilogoAnno,
    controllaNome, aggiungiVoce, rinominaVoce, eliminaVoce, impostaImporto,
    azzeraAnno, copiaMese, meseVuoto, mesiConDati, anniDisponibili,
    normalizzaDb, creaBackup, creaCSV,
  };
});
