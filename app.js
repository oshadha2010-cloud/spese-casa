/* Spese Casa per iPhone — interfaccia. I conti stanno in core.js (window.SpeseCore). */
(() => {
  "use strict";

  const C = window.SpeseCore;
  const KEY = "speseCasa_v1"; // stessa chiave della versione per computer
  const KEY_ULTIMO_BACKUP = "speseCasa_ultimoBackup";
  const KEY_AVVISO_HOME = "speseCasa_avvisoHomeChiuso";
  const MAX_BACKUP = 5 * 1024 * 1024;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  /** h("button", { class: "x", dataset: { az: "y" } }, "testo", figlio) — i testi finiscono sempre in nodi di testo */
  function h(tag, attributi = {}, ...figli) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attributi)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "onclick") el.addEventListener("click", v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const f of figli.flat()) if (f != null && f !== false) el.append(f);
    return el;
  }

  const leggi = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

  function carica() {
    const grezzo = leggi(KEY);
    if (!grezzo) return {};
    try {
      return C.normalizzaDb(JSON.parse(grezzo));
    } catch {
      // "{}" è solo vuoto; qualunque altra cosa illeggibile la metto da parte invece di sovrascriverla
      if (grezzo.trim() !== "{}") scrivi(KEY + "_danneggiato", grezzo);
      return {};
    }
  }

  let db = carica();
  let anno, mese;
  let meseScelto = false; // l'utente ha cambiato mese a mano: non riportarlo a oggi
  let modifica = false;

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  function vaiAOggi() {
    const d = new Date();
    anno = d.getFullYear();
    mese = d.getMonth();
  }
  vaiAOggi();

  const datiAnno = () => C.anno(db, anno);

  let ultimoAvvisoSalvataggio = 0;
  function salva() {
    if (scrivi(KEY, JSON.stringify(db))) return;
    if (Date.now() - ultimoAvvisoSalvataggio > 10000) {
      ultimoAvvisoSalvataggio = Date.now();
      toast("⚠️ Non riesco a salvare sul telefono");
    }
  }

  const oggiIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /* ================= disegno ================= */

  function render({ salvare = true } = {}) {
    renderAnni();
    renderMese();
    renderAnno();
    renderDati();
    if (salvare) salva();
  }

  function renderAnni() {
    const anni = C.anniDisponibili(db, new Date().getFullYear());
    if (!anni.includes(anno)) { anni.push(anno); anni.sort((a, b) => a - b); }
    const sel = $("#anno");
    sel.replaceChildren(...anni.map((y) => h("option", { value: y }, String(y))));
    sel.value = String(anno);
    for (const el of $$(".anno-corrente")) el.textContent = anno;
  }

  /* ---------- mese ---------- */

  function renderMese() {
    const d = datiAnno();
    $("#meseNome").textContent = C.MESI[mese];
    $("#meseAnno").textContent = anno;
    renderChips(d);
    renderLista(d, "in");
    renderLista(d, "out");
    const copia = $("#btnCopia");
    copia.hidden = mese === 0;
    if (mese > 0) copia.textContent = `Copia gli importi di ${C.MESI[mese - 1]}`;
    aggiornaTotali();
  }

  function renderChips(d) {
    const pieni = C.mesiConDati(d);
    $("#chips").replaceChildren(...C.MESI_S.map((m, i) => h("button", {
      type: "button",
      class: "chip" + (i === mese ? " sel" : "") + (pieni[i] ? " pieno" : ""),
      "aria-pressed": String(i === mese),
      "aria-label": C.MESI[i] + (pieni[i] ? ", con importi" : ""),
      dataset: { az: "mese", mese: i },
    }, m)));
    centraChip();
  }

  function centraChip() {
    const box = $("#chips");
    const chip = box.children[mese];
    // scrollLeft e non scrollIntoView: quello sposterebbe anche la pagina in verticale
    if (chip && box.clientWidth) box.scrollLeft = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
  }

  function renderLista(d, sez) {
    const lista = sez === "in" ? $("#listaIn") : $("#listaOut");
    const nomi = Object.keys(d[sez]);
    if (!nomi.length) {
      lista.replaceChildren(h("p", { class: "vuoto" },
        sez === "in" ? "Nessuna entrata: aggiungila qui sotto." : "Nessuna uscita: aggiungila qui sotto."));
      return;
    }
    lista.replaceChildren(...nomi.map((nome, i) => {
      const id = `imp-${sez}-${i}`;
      return h("div", { class: "riga", dataset: { sez, nome } },
        h("button", { type: "button", class: "elimina", "aria-label": `Elimina ${nome}`, dataset: { az: "elimina" } }),
        modifica
          ? h("button", { type: "button", class: "nome", "aria-label": `Rinomina ${nome}`, dataset: { az: "rinomina" } }, nome)
          : h("label", { class: "nome", for: id }, nome),
        h("div", { class: "importo" },
          h("span", { class: "valuta", "aria-hidden": "true" }, "€"),
          h("input", {
            id,
            class: "amt",
            type: "text",
            inputmode: "decimal",
            enterkeyhint: "done",
            autocomplete: "off",
            autocorrect: "off",
            spellcheck: "false",
            placeholder: "0",
            value: C.formatCampo(d[sez][nome][mese]),
            "aria-label": `${nome}, ${C.MESI[mese]} ${anno}, in euro`,
          })));
    }));
  }

  /** Aggiorna solo i numeri: si chiama a ogni tasto, quindi non ridisegna i campi (perderebbero il fuoco). */
  function aggiornaTotali() {
    const d = datiAnno();
    const entrate = C.totaleMese(d, "in", mese);
    const uscite = C.totaleMese(d, "out", mese);
    const saldo = C.cent(entrate - uscite);
    $("#totIn").textContent = $("#subIn").textContent = C.formatEur(entrate);
    $("#totOut").textContent = $("#subOut").textContent = C.formatEur(uscite);
    $("#saldoMese").textContent = C.formatEur(saldo);
    pillStato($("#statoMese"), saldo, entrate === 0 && uscite === 0);

    const quota = entrate > 0 ? uscite / entrate : uscite > 0 ? 1 : 0;
    $("#barraUscite").style.width = Math.min(100, Math.round(quota * 100)) + "%";
    $("#notaBarra").textContent =
      entrate > 0
        ? uscite > entrate
          ? `Uscite oltre le entrate di ${C.formatEur(uscite - entrate)}`
          : `Uscite: ${Math.round(quota * 100)}% delle entrate`
        : uscite > 0 ? "Uscite senza entrate registrate" : "Inserisci gli importi del mese qui sotto.";

    const chip = $("#chips").children[mese];
    if (chip) chip.classList.toggle("pieno", !C.meseVuoto(d, mese));
  }

  /** Stato del saldo: icona + parola + colore, mai il colore da solo. */
  function pillStato(el, valore, vuoto) {
    if (vuoto || valore === 0) {
      el.className = "stato";
      el.replaceChildren(vuoto ? "Nessun importo" : "In pari");
      return;
    }
    const buono = valore > 0;
    el.className = "stato " + (buono ? "buono" : "critico");
    el.replaceChildren(h("span", { class: "stato-ico", "aria-hidden": "true" }, buono ? "▲" : "▼"),
      buono ? "Risparmio" : "In rosso");
  }

  /* ---------- anno ---------- */

  function renderAnno() {
    const d = datiAnno();
    const r = C.riepilogoAnno(d);
    const mesi = C.riepilogoMesi(d);
    const vuoto = r.entrate === 0 && r.uscite === 0;

    $("#kpi").replaceChildren(
      tile("Entrate", r.entrate, { marca: "in" }),
      tile("Uscite", r.uscite, { marca: "out" }),
      tile("Saldo", r.saldo, { stato: true, vuoto }),
      tile("Media risparmio al mese", r.media, { stato: true, vuoto }),
    );

    $("#listaMesi").replaceChildren(
      h("div", { class: "mm-testa", "aria-hidden": "true" },
        h("span", {}, "Mese"), h("span", {}, "Entrate"), h("span", {}, "Uscite"), h("span", {}, "Saldo")),
      ...mesi.map((x, i) => h("button", {
        type: "button",
        class: "mm" + (i === mese ? " corrente" : ""),
        dataset: { az: "vai-mese", mese: i },
        "aria-label": `${C.MESI[i]}: entrate ${C.formatEur(x.entrate)}, uscite ${C.formatEur(x.uscite)}, ` +
          `saldo ${C.formatEur(x.saldo)}, cumulato ${C.formatEur(x.cumulato)}`,
      },
        h("span", { class: "mm-nome" }, C.MESI_S[i]),
        h("span", {}, C.formatEur(x.entrate)),
        h("span", {}, C.formatEur(x.uscite)),
        h("span", { class: "mm-saldo" },
          h("span", {},
            x.saldo === 0 ? null : h("span", { class: "freccia " + (x.saldo > 0 ? "buono" : "critico"), "aria-hidden": "true" }, x.saldo > 0 ? "▲" : "▼"),
            C.formatEur(x.saldo)),
          h("small", {}, "cum. " + C.formatEur(x.cumulato))))),
    );

    renderTabella(d, mesi, r);
  }

  function tile(etichetta, valore, { marca, stato, vuoto } = {}) {
    let pill = null;
    if (stato) pillStato((pill = h("span")), valore, vuoto);
    return h("div", { class: "card tile" },
      h("div", { class: "etichetta" }, marca ? h("span", { class: `marca ${marca}`, "aria-hidden": "true" }) : null, etichetta),
      h("div", { class: "valore" }, C.formatEur(valore)),
      pill);
  }

  /** La tabella annuale della versione per computer: qui in sola lettura, un tocco porta al mese. */
  function renderTabella(d, mesi, r) {
    const classi = (...c) => c.filter(Boolean).join(" ") || null;
    const cur = (m) => (m === mese ? "cur" : null);

    const testa = h("thead", {}, h("tr", {},
      h("th", { scope: "col" }, "Voce"),
      ...C.MESI_S.map((m, i) => h("th", { scope: "col", class: cur(i) }, m)),
      h("th", { scope: "col" }, "Totale")));

    const corpo = h("tbody");
    for (const [sez, titolo, etichettaTotale] of [["in", "Entrate", "Totale entrate"], ["out", "Uscite", "Totale uscite"]]) {
      corpo.append(h("tr", { class: "sez" },
        h("th", { scope: "rowgroup" }, h("span", { class: `marca ${sez}`, "aria-hidden": "true" }), titolo),
        h("td", { colspan: 13 })));
      for (const [nome, valori] of Object.entries(d[sez])) {
        const importi = valori.map(C.num);
        corpo.append(h("tr", {},
          h("th", { scope: "row", title: nome }, nome),
          ...importi.map((v, m) => h("td", { class: cur(m) }, h("button", {
            type: "button",
            class: classi("cella", v === 0 && "zero"),
            dataset: { az: "cella", sez, nome, mese: m },
            "aria-label": `${nome}, ${C.MESI[m]}: ${C.formatEur(v)}. Modifica`,
          }, v === 0 ? "–" : C.formatEur(v)))),
          h("td", { class: "num" }, C.formatEur(importi.reduce((s, v) => s + v, 0)))));
      }
      corpo.append(h("tr", { class: "totale" },
        h("th", { scope: "row" }, etichettaTotale),
        ...Array.from({ length: 12 }, (_, m) => h("td", { class: classi("num", cur(m)) }, C.formatEur(C.totaleMese(d, sez, m)))),
        h("td", { class: "num" }, C.formatEur(C.totaleSezione(d, sez)))));
    }

    const rigaSaldo = (etichetta, valori, totale) => h("tr", { class: "saldo" },
      h("th", { scope: "row" }, etichetta),
      ...valori.map((v, m) => h("td", { class: classi("num", cur(m), v < 0 && "neg") }, C.formatEur(v))),
      h("td", { class: classi("num", totale < 0 && "neg") }, totale == null ? "—" : C.formatEur(totale)));
    corpo.append(
      rigaSaldo("Saldo mese", mesi.map((x) => x.saldo), r.saldo),
      rigaSaldo("Saldo cumulato", mesi.map((x) => x.cumulato), null),
    );

    $("#tabella").replaceChildren(testa, corpo);
  }

  /* ---------- backup ---------- */

  function renderDati() {
    const data = new Date(leggi(KEY_ULTIMO_BACKUP) || NaN);
    $("#ultimoBackup").textContent = isNaN(data)
      ? "Non hai ancora salvato un backup: fallo ogni tanto, se cambi telefono ti serve."
      : `Ultimo backup: ${data.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`;
  }

  /* ================= navigazione ================= */

  function vaiAMese(y, m) {
    anno = y;
    mese = m;
    meseScelto = true;
    render();
  }

  function spostaMese(passo) {
    let m = mese + passo, y = anno;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    vaiAMese(y, m);
  }

  function vaiTab(nome) {
    for (const s of $$("main > section")) s.hidden = s.id !== "tab-" + nome;
    for (const b of $$(".tabbar [data-tab]")) {
      const attivo = b.dataset.tab === nome;
      b.classList.toggle("attivo", attivo);
      if (attivo) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    $("#btnModifica").hidden = nome !== "mese";
    if (nome !== "mese" && modifica) impostaModifica(false);
    if (nome === "mese") centraChip();
    if (nome === "anno") renderAnno(); // i tasti premuti nel mese aggiornano solo i totali del mese
    window.scrollTo(0, 0);
  }

  function impostaModifica(attiva) {
    modifica = attiva;
    document.body.classList.toggle("modifica", attiva);
    const b = $("#btnModifica");
    b.textContent = attiva ? "Fine" : "Modifica";
    b.setAttribute("aria-pressed", String(attiva));
    renderLista(datiAnno(), "in");
    renderLista(datiAnno(), "out");
  }

  /* ================= finestre ================= */

  /** Conferma (→ true/false) o richiesta di testo con `campo` (→ stringa o null). */
  function chiedi({ titolo, testo = "", ok = "OK", annulla = "Annulla", pericolo = false, campo = null }) {
    const dlg = $("#dlg");
    if (dlg.open) return Promise.resolve(campo == null ? false : null);
    const inp = $("#dlgCampo"), bOk = $("#dlgOk"), bNo = $("#dlgAnnulla");
    $("#dlgTitolo").textContent = titolo;
    $("#dlgTesto").textContent = testo;
    $("#dlgTesto").hidden = !testo;
    inp.hidden = campo == null;
    inp.value = campo ?? "";
    bOk.textContent = ok;
    bOk.classList.toggle("pericolo", pericolo);
    bNo.textContent = annulla ?? "";
    bNo.hidden = annulla == null;
    dlg.returnValue = "";
    dlg.showModal();
    if (campo != null) { inp.focus(); inp.setSelectionRange(0, inp.value.length); }
    else if (pericolo) bNo.focus();
    return new Promise((risolvi) => {
      dlg.addEventListener("close", () => {
        const si = dlg.returnValue === "ok";
        risolvi(campo == null ? si : si ? inp.value : null);
      }, { once: true });
    });
  }
  const avviso = (titolo, testo) => chiedi({ titolo, testo, annulla: null });

  let timerToast = 0;
  function toast(testo, azione) {
    const t = $("#toast");
    t.replaceChildren(h("span", {}, testo));
    if (azione) {
      t.append(h("button", {
        type: "button",
        class: "toast-azione",
        onclick: () => { t.classList.remove("show"); azione.fn(); },
      }, azione.testo));
    }
    t.classList.add("show");
    clearTimeout(timerToast);
    timerToast = setTimeout(() => t.classList.remove("show"), azione ? 6000 : 2600);
  }

  function ripristina(istantanea) {
    db = JSON.parse(istantanea);
    render();
    toast("Ripristinato");
  }

  /* ================= azioni ================= */

  function aggiungi(form) {
    const campo = form.elements.nome;
    const sez = form.dataset.sez;
    const esito = C.aggiungiVoce(datiAnno(), sez, campo.value);
    if (esito.errore) { toast(esito.errore); campo.focus(); return; }
    campo.value = "";
    render();
    const riga = $$("#tab-mese .riga").find((r) => r.dataset.sez === sez && r.dataset.nome === esito.nome);
    riga?.querySelector(".amt")?.focus(); // si scrive subito l'importo
  }

  async function eliminaVoce(sez, nome) {
    const ok = await chiedi({
      titolo: `Eliminare «${nome}»?`,
      testo: `La voce sparisce da tutto il ${anno}, insieme ai suoi importi.`,
      ok: "Elimina",
      pericolo: true,
    });
    if (!ok) return;
    const prima = JSON.stringify(db);
    C.eliminaVoce(datiAnno(), sez, nome);
    render();
    toast(`«${nome}» eliminata`, { testo: "Annulla", fn: () => ripristina(prima) });
  }

  async function rinominaVoce(sez, nome) {
    const nuovo = await chiedi({ titolo: "Rinomina voce", campo: nome, ok: "Salva" });
    if (nuovo == null) return;
    const esito = C.rinominaVoce(datiAnno(), sez, nome, nuovo);
    if (esito.errore) { avviso("Nome non valido", esito.errore); return; }
    render();
  }

  async function copiaMesePrecedente() {
    if (mese === 0) return;
    const d = datiAnno();
    const da = C.MESI[mese - 1], a = C.MESI[mese];
    if (C.meseVuoto(d, mese - 1)) { toast(`${da} non ha importi da copiare`); return; }
    if (!C.meseVuoto(d, mese)) {
      const ok = await chiedi({
        titolo: `Sovrascrivere ${a}?`,
        testo: `Gli importi di ${a} vengono sostituiti con quelli di ${da}.`,
        ok: "Sovrascrivi",
        pericolo: true,
      });
      if (!ok) return;
    }
    const prima = JSON.stringify(db);
    C.copiaMese(datiAnno(), mese - 1, mese);
    render();
    toast(`Copiati gli importi di ${da}`, { testo: "Annulla", fn: () => ripristina(prima) });
  }

  function modificaCella(sez, nome, m) {
    mese = m;
    meseScelto = true;
    vaiTab("mese");
    render();
    const riga = $$("#tab-mese .riga").find((r) => r.dataset.sez === sez && r.dataset.nome === nome);
    const campo = riga?.querySelector(".amt");
    if (!campo) return;
    riga.scrollIntoView({ block: "center" });
    campo.focus(); // sincrono dentro il tocco: su iOS apre la tastiera
    campo.setSelectionRange(0, campo.value.length);
  }

  async function azzeraAnno() {
    const ok = await chiedi({
      titolo: `Azzerare il ${anno}?`,
      testo: "Tutti gli importi dell'anno tornano a zero. Le voci restano.",
      ok: "Azzera",
      pericolo: true,
    });
    if (!ok) return;
    const prima = JSON.stringify(db);
    C.azzeraAnno(datiAnno());
    render();
    toast(`Importi del ${anno} azzerati`, { testo: "Annulla", fn: () => ripristina(prima) });
  }

  /**
   * Foglio di condivisione di iOS (Salva su File, AirDrop, Mail…); sul computer scarica il file.
   * Va chiamata direttamente dentro il tocco: niente await prima di navigator.share.
   */
  function condividiFile(nome, contenuto, tipo) {
    const file = new File([contenuto], nome, { type: tipo });
    if (navigator.canShare?.({ files: [file] })) {
      return navigator.share({ files: [file] }).then(() => true, (err) => {
        if (err?.name === "AbortError") return false;
        throw err;
      });
    }
    const url = URL.createObjectURL(file);
    const a = h("a", { href: url, download: nome });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return Promise.resolve(true);
  }

  function salvaBackup() {
    condividiFile(`backup-spese-casa-${oggiIso()}.json`, C.creaBackup(db), "application/json")
      .then((fatto) => {
        if (!fatto) return;
        scrivi(KEY_ULTIMO_BACKUP, new Date().toISOString());
        renderDati();
        toast("💾 Backup pronto");
      })
      .catch((err) => avviso("Backup non riuscito", err?.message || String(err)));
  }

  function esportaCSV() {
    condividiFile(`spese-casa-${anno}.csv`, "﻿" + C.creaCSV(datiAnno()), "text/csv")
      .then((fatto) => { if (fatto) toast("📊 CSV pronto"); })
      .catch((err) => avviso("Esportazione non riuscita", err?.message || String(err)));
  }

  async function caricaBackup(file) {
    if (file.size > MAX_BACKUP) { avviso("File non valido", "È troppo grande per essere un backup di Spese Casa."); return; }
    let nuovo;
    try {
      nuovo = C.normalizzaDb(JSON.parse(await file.text()));
    } catch (err) {
      avviso("File non valido", err instanceof SyntaxError ? "Non è un backup di Spese Casa (JSON illeggibile)." : err.message);
      return;
    }
    const anni = Object.keys(nuovo).sort();
    const ok = await chiedi({
      titolo: "Caricare il backup?",
      testo: `Contiene ${anni.length === 1 ? "l'anno" : "gli anni"} ${anni.join(", ")}. ` +
        "I dati attuali su questo telefono vengono sostituiti.",
      ok: "Carica",
      pericolo: true,
    });
    if (!ok) return;
    const prima = JSON.stringify(db);
    db = nuovo;
    render();
    toast("📂 Backup caricato", { testo: "Annulla", fn: () => ripristina(prima) });
  }

  /* ================= eventi ================= */

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-az]");
    if (!el) return;
    const riga = el.closest(".riga");
    switch (el.dataset.az) {
      case "tab": vaiTab(el.dataset.tab); break;
      case "modifica": impostaModifica(!modifica); break;
      case "mese-prec": spostaMese(-1); break;
      case "mese-succ": spostaMese(1); break;
      case "mese": vaiAMese(anno, +el.dataset.mese); break;
      case "vai-mese": vaiAMese(anno, +el.dataset.mese); vaiTab("mese"); break;
      case "cella": modificaCella(el.dataset.sez, el.dataset.nome, +el.dataset.mese); break;
      case "elimina": eliminaVoce(riga.dataset.sez, riga.dataset.nome); break;
      case "rinomina": rinominaVoce(riga.dataset.sez, riga.dataset.nome); break;
      case "copia": copiaMesePrecedente(); break;
      case "backup": salvaBackup(); break;
      case "csv": esportaCSV(); break;
      case "azzera": azzeraAnno(); break;
      case "chiudi-avviso":
        $("#avvisoHome").hidden = true;
        scrivi(KEY_AVVISO_HOME, "1");
        break;
    }
  });

  const tabMese = $("#tab-mese");
  tabMese.addEventListener("input", (e) => {
    if (!e.target.matches(".amt")) return;
    const riga = e.target.closest(".riga");
    C.impostaImporto(datiAnno(), riga.dataset.sez, riga.dataset.nome, mese, e.target.value);
    salva(); // a ogni tasto: se iOS chiude l'app a metà, il dato c'è già
    aggiornaTotali();
  });
  tabMese.addEventListener("focusout", (e) => {
    if (!e.target.matches(".amt")) return;
    const riga = e.target.closest(".riga");
    const valori = datiAnno()[riga.dataset.sez][riga.dataset.nome];
    if (valori) e.target.value = C.formatCampo(valori[mese]); // "12,5" → "12,50", "abc" → vuoto
  });
  tabMese.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".amt")) e.target.blur();
  });
  for (const form of $$("form.aggiungi")) {
    form.addEventListener("submit", (e) => { e.preventDefault(); aggiungi(form); });
  }

  $("#anno").addEventListener("change", (e) => vaiAMese(+e.target.value, mese));
  $("#fileBackup").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) caricaBackup(file);
  });
  $("#dlg").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.close("annulla"); // tocco fuori dalla finestra
  });

  // con la tastiera aperta la barra in basso non serve e su iOS finirebbe sopra i campi
  const campoTesto = (el) => Boolean(el?.matches?.("input:not([type=file]), textarea"));
  document.addEventListener("focusin", (e) => { if (campoTesto(e.target)) document.body.classList.add("digita"); });
  document.addEventListener("focusout", () => {
    setTimeout(() => { if (!campoTesto(document.activeElement)) document.body.classList.remove("digita"); }, 60);
  });

  // l'app resta aperta in memoria per giorni: se è cambiato il mese, riparti da oggi
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || meseScelto) return;
    const d = new Date();
    if (d.getFullYear() !== anno || d.getMonth() !== mese) { vaiAOggi(); render(); }
  });

  // stessa app aperta in due schede (sul computer): tieni allineati i dati
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { db = carica(); render({ salvare: false }); }
  });

  /* ================= avvio ================= */

  async function infoArchivio() {
    const el = $("#statoArchivio");
    try {
      if (!navigator.storage?.persisted) return;
      let persistente = await navigator.storage.persisted();
      if (!persistente && navigator.storage.persist) persistente = await navigator.storage.persist();
      el.textContent = persistente
        ? "✅ Memoria persistente: il telefono non cancella i dati per fare spazio."
        : "ℹ️ Memoria normale: tieni un backup aggiornato.";
    } catch { /* informazione facoltativa */ }
  }

  async function infoVersione() {
    try {
      if (!("caches" in window)) return;
      const v = (await caches.keys()).filter((n) => n.startsWith("spese-casa-")).pop();
      if (v) $("#versione").textContent = "Versione " + v.slice("spese-casa-".length).replace("-", " · ");
    } catch { /* informazione facoltativa */ }
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const eraControllata = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(infoVersione)
      .catch((err) => console.warn("Service worker non registrato:", err));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (eraControllata) toast("App aggiornata: chiudila e riaprila per la nuova versione");
      infoVersione();
    });
  }

  if (isIOS && !standalone && !leggi(KEY_AVVISO_HOME)) $("#avvisoHome").hidden = false;
  render();
  vaiTab("mese");
  infoArchivio();
  infoVersione();
})();
