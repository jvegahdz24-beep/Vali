/**
 * Cross-platform build asset copier.
 * Replaces "cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
 * Works on Windows, macOS, and Linux.
 */
const fs = require("fs");
const path = require("path");

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
}

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

// 1. Copy .next/static → .next/standalone/.next/static
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
if (fs.existsSync(staticSrc)) {
  console.log("Copying .next/static → .next/standalone/.next/static ...");
  copyRecursiveSync(staticSrc, staticDest);
  console.log("  Done.");
} else {
  console.warn("  Warning: .next/static not found, skipping.");
}

// 2. Copy public → .next/standalone/public
const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneDir, "public");
if (fs.existsSync(publicSrc)) {
  console.log("Copying public → .next/standalone/public ...");
  copyRecursiveSync(publicSrc, publicDest);
  console.log("  Done.");
} else {
  console.warn("  Warning: public/ not found, skipping.");
}

console.log("\nBuild assets copied successfully.");
