// Rendu de l'interface : barre latérale, grille, inspecteur.
"use strict";

/* ---------- Rendu ---------- */
function render() {
  // Synthés
  $("synthList").innerHTML = Object.keys(SYNTHS).map(name => {
    const on = name === synth;
    const led = on && conn ? (conn.mode === "demo" ? "demo" : "on") : "";
    const st = on && conn ? (conn.mode === "demo" ? "Démo" : "Connecté") : (on ? "Non connecté" : "");
    return `<button class="synth ${on ? "on" : ""}" data-s="${name}" ${busy ? "disabled" : ""}>
      <div style="flex:1"><div class="name">${name}</div><div class="st"><span class="led ${led}"></span>${st || "Sélectionner"}</div></div></button>`;
  }).join("");
  $("synthList").querySelectorAll(".synth").forEach(el => el.onclick = async () => {
    const name = el.dataset.s; if (name === synth || busy) return;
    synth = name; savePref("synth", name);
    if (conn?.mode === "midi") { conn.input.onmidimessage = null; }
    conn = null; stopLive(); await loadDb(); if (midi) fillPorts();
    if (!PANELS[synth] && view === "panel") setView("grid"); else render();
    autoConnect();
  });

  // En-tête
  $("title").textContent = synth;
  const dev = db.device;
  $("subtitle").textContent = conn?.mode === "demo" ? "Synthé simulé" : conn ? `Connecté via ${conn.output.name}` : (dev ? `Dernière connexion : ${dev.port}` : "Pas encore connecté");
  $("demoBanner").classList.toggle("show", conn?.mode === "demo");
  $("kbdBank").textContent = bank;
  if (!busy) setBusyUi(false);
  $("backupLabel").textContent = raw.size ? `Fichier .syx · ${raw.size} lus` : "Fichier .syx";

  renderStats();
  const all = Object.entries(db.slots);
  const alerts = all.filter(([, s]) => s.alert).map(([k]) => k).sort();
  const q = $("search").value.trim().toLowerCase();

  // Alertes
  const ab = $("alertBanner");
  ab.classList.toggle("show", alerts.length > 0);
  ab.innerHTML = alerts.length ? `${icon("lock")}<b>${alerts.length} preset${alerts.length > 1 ? "s protégés ont" : " protégé a"} changé sur le synthé</b>` +
    alerts.map(k => `<span class="chip" data-k="${k}">${k} ${escapeHtml(displayName(db.slots[k]))}</span>`).join("") : "";
  ab.querySelectorAll(".chip").forEach(a => a.onclick = () => select(a.dataset.k));

  renderGrid();
  if (view === "panel") renderPanel();

  // Recherche
  const res = $("results");
  if (q) {
    const hits = all.filter(([, s]) => matches(s, q)).sort(([a], [b]) => a.localeCompare(b));
    res.innerHTML = `<div class="hd">${hits.length} résultat${hits.length > 1 ? "s" : ""} dans toutes les banques</div>` +
      hits.slice(0, 60).map(([k, s]) => `<div class="it" data-k="${k}"><code>${k}</code><span>${escapeHtml(displayName(s))}</span>${s.protected ? `<span style="margin-left:auto;color:var(--accent)">${icon("lock")}</span>` : ""}</div>`).join("");
    res.querySelectorAll(".it").forEach(d => d.onclick = () => select(d.dataset.k, true));
  }
  res.classList.toggle("show", !!q);
  renderDetail();
}

function renderStats() {
  const all = Object.entries(db.slots);
  const userRead = all.filter(([k, s]) => isUser(+k[0]) && s.hash);
  const nProt = all.filter(([, s]) => s.protected).length;
  const nEmpty = userRead.filter(([, s]) => isEmpty(s)).length;
  const alerts = all.filter(([, s]) => s.alert).map(([k]) => k).sort();
  $("stats").innerHTML = `
    <div class="stat"><b>${userRead.length}</b><span>lus sur 500</span></div>
    <div class="stat"><b>${nProt}</b><span>protégés</span></div>
    <div class="stat"><b>${userRead.length ? nEmpty : "–"}</b><span>sans nom</span></div>
    <div class="stat ${alerts.length ? "bad" : ""}"><b>${alerts.length}</b><span>alertes</span></div>`;
  const last = db.backups?.[db.backups.length - 1];
  $("footHint").innerHTML = last ? `Dernière sauvegarde : <b>${fmtDate(last.date)}</b>` : "Aucune sauvegarde .syx pour l'instant.";

}

function renderGrid() {
  const all = Object.entries(db.slots);
  // Banques
  const groups = [["Utilisateur", 0, 4], ["Usine", 5, 9]];
  $("banks").innerHTML = groups.map(([label, a, z]) => `<div class="bgroup"><span>${label}</span><div class="seg">` +
    Array.from({ length: z - a + 1 }, (_, i) => {
      const b = a + i;
      const ks = all.filter(([k]) => k[0] === String(b));
      const pip = ks.some(([, s]) => s.alert) ? "bad" : ks.some(([, s]) => s.protected) ? "" : null;
      return `<button class="bank ${b === bank ? "on" : ""}" data-b="${b}" title="Banque ${b}">${b}${pip !== null ? `<span class="pip ${pip}"></span>` : ""}</button>`;
    }).join("") + `</div></div>`).join("") +
    `<div class="views seg"><button class="vtab ${view === "grid" ? "on" : ""}" data-v="grid">Grille</button>` +
    `<button class="vtab ${view === "panel" ? "on" : ""}" data-v="panel" ${PANELS[synth] ? "" : "disabled title='Pas encore disponible pour ce synthé'"}>Façade</button></div>`;
  $("banks").querySelectorAll(".bank").forEach(el => el.onclick = () => { bank = +el.dataset.b; render(); });
  $("banks").querySelectorAll(".vtab").forEach(el => el.onclick = () => setView(el.dataset.v));

  // Grille
  const q = $("search").value.trim().toLowerCase();
  let html = "";
  for (let p = 0; p < 100; p++) {
    const k = keyOf(bank, p), s = db.slots[k];
    const empty = isEmpty(s);
    const cls = ["cell", !s?.hash && "unread", empty && "empty", s?.alert && "alert", k === selected && "sel", q && !matches(s, q) && "dim"].filter(Boolean).join(" ");
    const label = s?.name || (empty ? "sans nom" : s?.synthName || "");
    html += `<div class="${cls}" data-k="${k}"><div class="num">${k}` +
      (recent(s?.changedAt) && !s?.alert ? `<span class="chg" title="Changé depuis la lecture précédente"></span>` : "") +
      (factoryCopy(k, s) ? `<span class="tag" title="Identique au preset d'usine ${+k[0] + 5}${k.slice(1)}">usine</span>` : "") +
      (s?.protected ? `<span class="lock">${icon("lock")}</span>` : "") +
      `</div><div class="nm ${s?.name ? "custom" : ""}">${escapeHtml(label)}</div>` +
      (s?.type ? `<span class="ty">${escapeHtml(s.type)}</span>` : "") + `</div>`;
  }
  $("grid").innerHTML = html;
  markPlaying();
  renderLive();
  $("grid").querySelectorAll(".cell").forEach(c => {
    c.onclick = () => select(c.dataset.k, true);
  });

}
const renderGridOnly = () => { renderGrid(); renderStats(); };

function renderDetail() {
  const k = selected, b = +k[0], p = +k.slice(1), s = db.slots[k] || {};
  const empty = isEmpty(s), user = isUser(b);
  const renameOk = canRename() && user && !!s.synthName;
  const renameWhy = NAME_AT[synth] === null ? `Pas encore disponible pour le ${synth}.` : !conn ? "Connecte le synthé pour renommer." : !s.synthName ? "Lis ce preset d'abord." : !user ? "Banque d'usine : non modifiable." : "20 caractères maximum, sans accents.";
  const pills = [
    `<span class="pill">${user ? "Utilisateur" : "Usine"}</span>`,
    s.protected ? `<span class="pill amber">${icon("lock")} Protégé</span>` : "",
    s.alert ? `<span class="pill red">Modifié</span>` : "",
    factoryCopy(k, s) ? `<span class="pill">Copie d'usine</span>` : "",
    empty ? `<span class="pill">Sans nom</span>` : "",
  ].join("");
  $("detail").innerHTML = `
    <div class="disp">
      <div class="n">${k}</div>
      <div class="t ${s.synthName && !empty ? "" : "empty"}">${s.synthName ? escapeHtml(empty ? "Basic Program · sans nom" : s.synthName) : "pas encore lu"}</div>
      <div class="s">${pills}</div>
    </div>

    ${s.alert ? `<div class="alertbox"><b>Ce preset a changé sur le synthé</b>Il ne correspond plus à la version protégée le ${fmtDate(s.protectedAt)}.
      <div class="acts"><button class="btn" id="fExport">${icon("down")}Exporter la version protégée (.syx)</button>
      <button class="btn ghost" id="fAccept">C'est voulu, garder la nouvelle</button></div>
      <div class="sub">Pour la récupérer : envoie le fichier exporté au synthé avec SysEx Librarian, il reprendra sa place en ${k}.</div></div>` : ""}

    ${user ? `<button class="protect ${s.protected ? "on" : ""}" id="fProtect">
      <span class="ic">${icon(s.protected ? "lock" : "unlock")}</span>
      <span><b>${s.protected ? "Protégé" : "Protéger ce preset"}</b><span>${s.protected ? `Depuis le ${fmtDate(s.protectedAt)}` : "Alerte s'il est écrasé"}</span></span>
      <span class="sw"></span></button>` : ""}

    <div class="field">
      <label>Nom sur le synthé</label>
      <div class="inrow"><input type="text" id="fSynthName" maxlength="20" value="${escapeHtml(empty ? "" : s.synthName || "")}" placeholder="${empty ? "Donne-lui un nom" : ""}" ${renameOk ? "" : "disabled"}>
      <button class="btn primary" id="fRename" ${renameOk ? "" : "disabled"}>${icon("pen")}Écrire</button></div>
      <div class="sub" id="fRenameHint">${renameWhy}</div>
    </div>

    <div class="field">
      <label>Type</label>
      <div class="types">${TYPES.map(t => `<button class="type ${s.type === t ? "on" : ""}" data-t="${t}">${t}</button>`).join("")}</div>
    </div>

    <div class="field">
      <label>Notes</label>
      <textarea id="fNotes" placeholder="Pourquoi il compte, morceau, réglages…">${escapeHtml(s.notes || "")}</textarea>
    </div>

    <div class="field">
      <label>Alias dans l'app (optionnel)</label>
      <input type="text" id="fName" maxlength="40" value="${escapeHtml(s.name || "")}" placeholder="Affiché à la place du nom du synthé">
    </div>

    <div class="actions">
      <button class="btn sm" id="fRead" ${!conn || busy ? "disabled" : ""}>${icon("read")}Relire</button>
      ${s.protected && !s.alert ? `<button class="btn sm" id="fExport">${icon("down")}Exporter la version protégée</button>` : ""}
    </div>

    <dl class="meta">
      <dt>Banque · programme</dt><dd>${b} · ${pad2(p)}</dd>
      <dt>Dernière lecture</dt><dd>${fmtDate(s.lastRead)}</dd>
      ${s.hash ? `<dt>Empreinte</dt><dd><code>${s.hash}</code></dd>` : ""}
      ${factoryCopy(k, s) ? `<dt>Identique à</dt><dd><code>${b + 5}${pad2(p)}</code> (usine)</dd>` : ""}
      ${s.changedAt ? `<dt>Changé le</dt><dd>${fmtDate(s.changedAt)}</dd>` : ""}
    </dl>`;

  const upd = (field, v) => { const x = slot(k); x[field] = v; cleanSlot(k); scheduleSave(); };
  $("fName").oninput = e => {
    upd("name", e.target.value.trim());
    const c = $("grid").querySelector(`[data-k="${k}"] .nm`);
    if (c) { c.textContent = e.target.value.trim() || (empty ? "sans nom" : s.synthName || ""); c.classList.toggle("custom", !!e.target.value.trim()); }
  };
  $("fNotes").oninput = e => upd("notes", e.target.value);
  $("detail").querySelectorAll(".type").forEach(t => t.onclick = () => { upd("type", slot(k).type === t.dataset.t ? "" : t.dataset.t); renderDetail(); });
  const sn = $("fSynthName");
  sn.oninput = () => {
    const c = asciiName(sn.value);
    $("fRenameHint").textContent = c !== sn.value.trimEnd() ? `Sera écrit : « ${c} »` : `${c.length}/20 caractères`;
    $("fRenameHint").className = "sub" + (c !== sn.value.trimEnd() ? " warn" : "");
  };
  sn.onkeydown = e => { if (e.key === "Enter") renameOnSynth(k, sn.value); };
  $("fRename").onclick = () => renameOnSynth(k, sn.value);
  $("fProtect") && ($("fProtect").onclick = () => toggleProtect(k));
  $("detail").querySelectorAll("#fExport").forEach(x => x.onclick = () => exportProtected(k));
  $("fAccept") && ($("fAccept").onclick = () => acceptNewVersion(k));
  $("fRead").onclick = () => readRange([[b, p]], "Lecture");
}
