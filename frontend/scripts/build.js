const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const apiUrl = process.env.VITE_API_URL || process.env.API_URL || "";
const cleanApiUrl = apiUrl.replace(/\/$/, "");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
fs.copyFileSync(path.join(root, "assets", "welcome-people.png"), path.join(dist, "assets", "welcome-people.png"));
fs.writeFileSync(
  path.join(dist, "config.js"),
  `window.RESOLVEAI_API_URL = ${JSON.stringify(cleanApiUrl)};\n`
);
