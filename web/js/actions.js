// Actions sur le synthé : renommer, jouer un preset, sauver le son en cours, lire une plage.
"use strict";

/* ---------- Écriture (renommage) ---------- */
// Écrit un programme complet dans la mémoire du synthé (banques utilisateur uniquement).
async function sendProgram(b, p, data) {
  if (!isUser(b)) throw new Error("banque d'usine");
  if (data.length !== 1024) throw new Error("taille de programme inattendue");
  if (conn.mode === "demo") { demoState.written.set(keyOf(b, p), Uint8Array.from(data)); return; }
  conn.output.send([0xF0, 0x01, conn.id, 0x02, b, p, ...packData(data), 0xF7]);
}
const asciiName = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, 20).trimEnd();
const canRename = () => conn && !busy && NAME_AT[synth] !== null && NAME_AT[synth] !== undefined;

async function renameOnSynth(k, wanted) {
  const b = +k[0], p = +k.slice(1), at = NAME_AT[synth];
  if (!canRename() || !isUser(b)) return;
  const clean = asciiName(wanted);
  if (!clean) { toast("Le nom est vide"); return; }
  const current = slot(k).synthName || "";
  if (clean === current) { toast("C'est déjà son nom"); return; }
  const ok = await askConfirm({
    title: `Renommer ${k} sur le ${synth} ?`,
    html: `<div class="swap"><span class="old">${escapeHtml(current || "(sans nom)")}</span><span>→</span><span class="new">${escapeHtml(clean)}</span></div>
      Seul le nom change, le son reste identique. Une sauvegarde .syx du preset est faite juste avant, puis le preset est relu pour vérifier l'écriture.`,
    ok: "Renommer",
  });
  if (!ok) return;
  busy = true; setBusyUi(true); setProgressText(`Renommage de ${k}…`);
  try {
    await readSlot(b, p);                                   // 1. état actuel
    const before = raw.get(k);
    const s = slot(k);
    const j = await postSyx("export", before, `${synth} ${k} ${s.synthName} (avant renommage)`);   // 2. sauvegarde
    if (j) db.backups.push({ date: new Date().toISOString(), file: j.name, label: `${k} avant renommage`, count: 1 });
    else if (conn.mode !== "demo") throw new Error("sauvegarde impossible, rien n'a été écrit");
    const data = unpack(before.subarray(6, before.length - 1));   // 3. nouveau nom, rien d'autre
    const target = clean.padEnd(20, " ");
    for (let i = 0; i < 20; i++) data[at + i] = target.charCodeAt(i);
    await sendProgram(b, p, data);                          // 4. écriture
    await sleep(500);
    const wasProtected = s.protected;
    await readSlot(b, p);                                   // 5. vérification
    const m = raw.get(k), after = unpack(m.subarray(6, m.length - 1));
    const diffs = data.reduce((n, v, i) => n + (after[i] !== v ? 1 : 0), 0);
    if (s.synthName !== clean || diffs) throw new Error(`relecture différente (${diffs} octet(s))`);
    if (wasProtected) { s.protectedHash = s.hash; s.protectedRaw = b64(m); s.protectedAt = new Date().toISOString(); s.alert = false; }
    delete s.changedAt;
    toast(`${k} s'appelle maintenant « ${clean} » sur le synthé`);
  } catch (e) {
    toast(`Renommage non confirmé : ${e.message}. L'original est dans Sauvegardes/.`);
  }
  busy = false; setBusyUi(false); render(); scheduleSave();
}

/* ---------- Jouer un preset sur le synthé ---------- */
let pcTimer = null;
function playOnSynth(k) {
  if (!conn || conn.mode !== "midi" || !live.play) return;
  clearTimeout(pcTimer);
  pcTimer = setTimeout(async () => {
    if (live.ok && live.edited && live.slot !== k) {
      const ok = await askConfirm({ title: "Le son en cours a été modifié", html: `Tes réglages sur <b>${escapeHtml(live.slot || "le son en cours")}</b> ne sont pas sauvés. Charger <b>${k}</b> les fera perdre.<br><br>Pour les garder, annule puis clique sur <b>Sauver</b>.`, ok: `Charger ${k}` });
      if (!ok) return;
    }
    const b = +k[0], p = +k.slice(1), ch = live.chan || 0;
    conn.output.send([0xB0 | ch, 32, b, 0xC0 | ch, p]);
    live.slot = k; live.slotSource = "pc"; live.bank = b; live.edited = false;
    setTimeout(pollEditBuffer, 150);
    renderLive(); markPlaying();
  }, 120);
}

// Enregistre le son en cours (avec les réglages modifiés) dans un emplacement utilisateur.
async function saveCurrent() {
  if (!conn || conn.mode !== "midi" || busy || !live.ok) return;
  const def = live.slot && isUser(+live.slot[0]) ? live.slot : (isUser(+selected[0]) ? selected : "");
  const canName = NAME_AT[synth] !== null && NAME_AT[synth] !== undefined;
  const ok = await askConfirm({
    title: "Sauver le son en cours",
    html: `<div class="field" style="margin-top:0"><label>Emplacement</label><input type="text" id="svSlot" maxlength="3" value="${def}" placeholder="000 à 499" style="font-family:var(--mono)"></div>
      ${canName ? `<div class="field"><label>Nom sur le synthé</label><input type="text" id="svName" maxlength="20" value="${escapeHtml(live.name === INIT_NAME ? "" : live.name)}" style="font-family:var(--mono)"></div>` : ""}
      <div class="sub" id="svInfo"></div>`,
    ok: "Sauver", onOpen: () => {
      const info = () => {
        const k = $("svSlot").value.trim(), t = db.slots[k];
        const el = $("svInfo");
        if (!/^[0-4]\d\d$/.test(k)) { el.className = "sub warn"; el.textContent = "Choisis un emplacement utilisateur, de 000 à 499."; return; }
        el.className = "sub" + (t?.protected ? " warn" : "");
        el.innerHTML = t?.protected ? `<b style="color:var(--red)">${k} est protégé</b> (${escapeHtml(displayName(t))}). Il sera remplacé, et la nouvelle version deviendra la version protégée.`
          : t?.synthName && t.synthName !== INIT_NAME ? `Remplace « ${escapeHtml(t.synthName)} ». Une sauvegarde .syx est faite avant.` : t?.synthName === INIT_NAME ? "Remplace un son sans nom (Basic Program). Une sauvegarde .syx est faite avant." : "Emplacement pas encore lu.";
      };
      $("svSlot").oninput = info; info();
    },
  });
  if (!ok) return;
  const k = $("svSlot").value.trim();
  if (!/^[0-4]\d\d$/.test(k)) { toast("Emplacement invalide : choisis entre 000 et 499"); return; }
  const wanted = canName ? asciiName($("svName").value) : "";
  const b = +k[0], p = +k.slice(1);
  busy = true; setBusyUi(true); setProgressText(`Sauvegarde dans ${k}…`);
  try {
    // 1. son en cours, lu à l'instant
    const r = waitFor(d => d[0] === 0xF0 && d[1] === 0x01 && d[2] === conn.id && d[3] === 0x03, 2000);
    conn.output.send([0xF0, 0x01, conn.id, 0x06, 0xF7]);
    const eb = await r;
    const data = unpack(eb.subarray(4, eb.length - 1));
    if (data.length !== 1024) throw new Error("son en cours illisible");
    if (canName && wanted) { const t = wanted.padEnd(20, " "); for (let i = 0; i < 20; i++) data[NAME_AT[synth] + i] = t.charCodeAt(i); }
    // 2. copie de ce qu'il y avait dans l'emplacement
    await readSlot(b, p);
    const old = slot(k);
    const j = await postSyx("export", raw.get(k), `${synth} ${k} ${old.synthName || ""} (avant sauvegarde)`);
    if (!j) throw new Error("copie de sécurité impossible, rien n'a été écrit");
    db.backups.push({ date: new Date().toISOString(), file: j.name, label: `${k} avant sauvegarde`, count: 1 });
    // 3. écriture, puis relecture
    await sendProgram(b, p, data);
    await sleep(700);
    const wasProtected = old.protected;
    await readSlot(b, p);
    const m = raw.get(k), after = unpack(m.subarray(6, m.length - 1));
    const diffs = data.reduce((n, v, i) => n + (after[i] !== v ? 1 : 0), 0);
    if (diffs) throw new Error(`relecture différente (${diffs} octet(s))`);
    const s = slot(k);
    if (wasProtected) { s.protectedHash = s.hash; s.protectedRaw = b64(m); s.protectedAt = new Date().toISOString(); s.alert = false; }
    delete s.changedAt;
    // 4. le synthé affiche maintenant ce numéro
    const ch = live.chan || 0;
    conn.output.send([0xB0 | ch, 32, b, 0xC0 | ch, p]);
    live.slot = k; live.slotSource = "pc"; live.bank = b; live.edited = false;
    live.name = s.synthName; live.hash = s.hash; live.data = after;
    selected = k; bank = b;
    toast(`Son enregistré dans ${k}${s.synthName ? ` « ${s.synthName} »` : ""} · vérifié`);
  } catch (e) {
    toast(`Sauvegarde non confirmée : ${e.message}`);
  }
  busy = false; setBusyUi(false); render(); scheduleSave();
}

/* ---------- Lecture ---------- */
async function readRange(list, label, { quiet = false } = {}) {
  if (busy || !conn) return;
  busy = true; cancelRequested = false; setBusyUi(true);
  let done = 0, fails = 0;
  for (const [b, p] of list) {
    if (cancelRequested) break;
    try { await readSlot(b, p); fails = 0; }
    catch { fails++; if (fails >= 3) { toast("Le synthé ne répond plus. Vérifie le câble et GLOBALS > 8 MIDI SysEx = USB."); break; } }
    done++;
    setProgress(done, list.length, label);
    if (done % 25 === 0 || done === list.length) { if (view === "grid") renderGridOnly(); }
  }
  busy = false; setBusyUi(false); render(); scheduleSave();
  const alerts = Object.values(db.slots).filter(s => s.alert).length;
  if ((!quiet && list.length > 1) || alerts) toast(cancelRequested ? `Arrêté après ${done} presets` : `${done} presets lus` + (alerts ? ` · ${alerts} protégé(s) modifié(s) !` : ""));
}
const rangeBanks = (from, to) => { const l = []; for (let b = from; b <= to; b++) for (let p = 0; p < 100; p++) l.push([b, p]); return l; };
