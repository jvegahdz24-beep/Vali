/**
 * Cross-platform build asset copier.
 * Copies the assets required by Next.js standalone output.
 * Works on Windows, macOS, and Linux.
 */
const fs = require("fs");
const path = require("path");

function copyRecursiveSync(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");

for (const requiredPath of [path.join(standaloneDir, "server.js"), staticSrc, publicSrc]) {
  if (!fs.existsSync(requiredPath)) {
    throw new Error(`Required standalone build path is missing: ${requiredPath}`);
  }
}

console.log("Copying .next/static → .next/standalone/.next/static ...");
copyRecursiveSync(staticSrc, staticDest);

console.log("Copying public → .next/standalone/public ...");
copyRecursiveSync(publicSrc, publicDest);

for (const copiedPath of [path.join(standaloneDir, "server.js"), staticDest, publicDest]) {
  if (!fs.existsSync(copiedPath)) {
    throw new Error(`Standalone asset copy failed: ${copiedPath}`);
  }
}

console.log("Build assets copied successfully.");
