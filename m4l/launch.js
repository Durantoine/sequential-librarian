// Ouvre le gestionnaire de presets (app Mac) depuis le device Max for Live.
// Lancé par [node.script] au clic sur « Ouvrir l'app », puis arrêté aussitôt.
const { spawn } = require("child_process");
const maxApi = require("max-api");

const APP = "Sequential Librarian";

// « open -a » trouve l'application où qu'elle soit installée.
const child = spawn("/usr/bin/open", ["-a", APP], { detached: true, stdio: "ignore" });
child.on("error", e => maxApi.outlet("error", String(e.message || e)));
child.on("exit", code => maxApi.outlet(code === 0 ? "done" : "error", code === 0 ? "" : `${APP} introuvable`));
child.unref();
