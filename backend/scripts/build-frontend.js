const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const publicDir = path.join(backendRoot, "public");

if (!fs.existsSync(frontendRoot)) {
  throw new Error(`Frontend nao encontrado em ${frontendRoot}`);
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "OneSignalSDKWorker.js"]) {
  fs.copyFileSync(path.join(frontendRoot, file), path.join(publicDir, file));
}

const assetSource = path.join(frontendRoot, "assets", "welcome-people.png");
if (fs.existsSync(assetSource)) {
  fs.copyFileSync(assetSource, path.join(publicDir, "assets", "welcome-people.png"));
}

fs.writeFileSync(path.join(publicDir, "config.js"), "window.RESOLVEAI_API_URL = \"\";\n");
console.log(`Frontend copiado para ${publicDir}`);
