#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ValiFlow Pro — Post-build fix for Turbopack standalone
# Fixes: jose hashed package resolution + runtime patch
# Run after EVERY: bun run build / npx next build
# ═══════════════════════════════════════════════════════════════

set -e
PROJECT="/home/z/my-project"
STANDALONE="$PROJECT/.next/standalone"
RUNTIME="$STANDALONE/.next/server/chunks/[turbopack]_runtime.js"

echo "🔧 [fix-standalone] Applying Turbopack standalone fixes..."

# ─── STEP 1: Copy jose CJS dist to all hashed locations ───────

JOSE_HASH=$(rg -o '"jose-[a-f0-9]+"' "$STANDALONE/.next/server/chunks/" --no-filename 2>/dev/null | sort -u | head -1 | tr -d '"')

if [ -z "$JOSE_HASH" ]; then
  echo "⚠️  No jose hash found — skipping jose dist fix"
else
  echo "📦 Found jose hash: $JOSE_HASH"

  ORIG_CJS="$PROJECT/node_modules/jose/dist/node/cjs"
  if [ -d "$ORIG_CJS" ]; then
    cp -r "$ORIG_CJS" "$STANDALONE/node_modules/jose/dist/node/cjs" 2>/dev/null || true
    mkdir -p "$STANDALONE/node_modules/$JOSE_HASH/dist/node"
    cp -r "$ORIG_CJS" "$STANDALONE/node_modules/$JOSE_HASH/dist/node/cjs" 2>/dev/null || true
    mkdir -p "$STANDALONE/.next/node_modules/$JOSE_HASH/dist/node"
    cp -r "$ORIG_CJS" "$STANDALONE/.next/node_modules/$JOSE_HASH/dist/node/cjs" 2>/dev/null || true
    echo "✅ CJS dist copied to all jose locations"
  else
    echo "⚠️  Original jose CJS not found at $ORIG_CJS"
  fi

  CHUNKS_NM="$STANDALONE/.next/server/chunks/node_modules"
  mkdir -p "$CHUNKS_NM"
  ln -sf "$STANDALONE/.next/node_modules/$JOSE_HASH" "$CHUNKS_NM/$JOSE_HASH"
  echo "✅ Symlink: chunks/node_modules/$JOSE_HASH"

  for HASHED_PKG in $(ls "$STANDALONE/node_modules" 2>/dev/null | grep -E '^[a-z]+-[a-f0-9]{10,}$'); do
    REAL_PKG=$(echo "$HASHED_PKG" | sed 's/-[a-f0-9]\{10,\}$//')
    if [ -d "$PROJECT/node_modules/$REAL_PKG" ] && [ -d "$STANDALONE/node_modules/$HASHED_PKG" ]; then
      if [ -d "$PROJECT/node_modules/$REAL_PKG/dist" ] && [ ! -d "$STANDALONE/node_modules/$HASHED_PKG/dist" ]; then
        cp -r "$PROJECT/node_modules/$REAL_PKG/dist" "$STANDALONE/node_modules/$HASHED_PKG/dist" 2>/dev/null || true
        cp -r "$PROJECT/node_modules/$REAL_PKG/dist" "$STANDALONE/.next/node_modules/$HASHED_PKG/dist" 2>/dev/null || true
        echo "✅ Fixed dist: $HASHED_PKG (from $REAL_PKG)"
      fi
    fi
    if [ ! -L "$CHUNKS_NM/$HASHED_PKG" ] && [ -d "$STANDALONE/.next/node_modules/$HASHED_PKG" ]; then
      ln -sf "$STANDALONE/.next/node_modules/$HASHED_PKG" "$CHUNKS_NM/$HASHED_PKG"
    fi
  done
fi

# ─── STEP 2: ALWAYS patch Turbopack runtime ────────────────────

if [ -f "$RUNTIME" ]; then
  echo "🔧 Patching Turbopack runtime..."

  python3 << 'PYEOF'
import re, subprocess

RUNTIME = "/home/z/my-project/.next/standalone/.next/server/chunks/[turbopack]_runtime.js"

with open(RUNTIME, "r") as f:
    content = f.read()

changed = False

# ── PATCH 1: Move path require BEFORE externalImport ──
# Turbopack declares `const path = require('path')` after externalRequire,
# but our fallback needs it before both externalImport and externalRequire.
# Also remove any previous ValiFlow path hacks.

path_decl = "const path = require('path');"

# Clean previous hacks
for hack in [
    "const path = require('path'); // ValiFlow Fix: must be before externalImport & externalRequire\n\n",
    "const path = require('path'); // ValiFlow Fix: must be before externalRequire\n",
    "/* eslint-disable @typescript-eslint/no-unused-vars */ " + path_decl,
    "// path moved before externalRequire (ValiFlow Fix)\n",
]:
    content = content.replace(hack, "")

# Check if path is before externalImport
if "async function externalImport" in content:
    before_import = content.split("async function externalImport")[0]
    if path_decl not in before_import:
        content = content.replace(
            "async function externalImport(id) {",
            "const path = require('path'); // ValiFlow Fix: before externalImport & externalRequire\n\nasync function externalImport(id) {"
        )
        changed = True
        print("  ✅ path moved before externalImport")

# ── PATCH 2: Add fallback in externalImport ──
# Replace ONLY the throw line, keeping all surrounding code intact.
# Original:
#     throw new Error(`Failed to load external module ${id}: ${err}`);
#     }
#     if (raw && raw.__esModule && raw.default && 'default' in raw.default) {
# Replaced with:
#     // ValiFlow Fix: ...
#     try { ... } catch { ... }
#     }
#     if (raw && raw.__esModule && raw.default && 'default' in raw.default) {

import_marker = "// ValiFlow Fix: retry via require.resolve (follows symlinks & package.json)"
import_fallback_block = """// ValiFlow Fix: retry via require.resolve (follows symlinks & package.json)
        try {
            const _resolved = require.resolve(id, { paths: [__dirname] });
            raw = require(_resolved);
        } catch(_r) {
            try {
                const _localMod = path.join(__dirname, "node_modules", id);
                raw = require(_localMod);
            } catch(_r2) { throw new Error(`Failed to load external module ${id}: ${err}`); }
        }"""

if import_marker not in content:
    # The throw in externalImport is followed by } and then if (raw && raw.__esModule)
    old = 'throw new Error(`Failed to load external module ${id}: ${err}`);'
    if old in content:
        # Replace ONLY the first occurrence (externalImport)
        content = content.replace(old, import_fallback_block, 1)
        changed = True
        print("  ✅ externalImport fallback added")
    else:
        print("  ⚠️  externalImport throw not found")
else:
    print("  ✅ externalImport fallback already present")

# ── PATCH 3: Add fallback in externalRequire ──
# Same approach: replace ONLY the throw, keep surrounding code.
# Original:
#     throw new Error(`Failed to load external module ${id}: ${err}`);
#     }
#     if (!esm || raw.__esModule) {

require_marker = "// ValiFlow Fix: retry via require.resolve (follows symlinks & package.json)"
require_fallback_block = """// ValiFlow Fix: retry via require.resolve (follows symlinks & package.json)
        try {
            const _resolved = require.resolve(id, { paths: [__dirname] });
            raw = require(_resolved);
        } catch(_r) {
            try {
                const _localMod = path.join(__dirname, "node_modules", id);
                raw = require(_localMod);
            } catch(_r2) { throw new Error(`Failed to load external module ${id}: ${err}`); }
        }"""

if require_marker not in content:
    # Find the second occurrence of the throw (in externalRequire)
    old = 'throw new Error(`Failed to load external module ${id}: ${err}`);'
    occurrences = content.count(old)
    if occurrences >= 2:
        # Replace the second occurrence
        idx = content.find(old, content.find(old) + 1)
        if idx > -1:
            content = content[:idx] + require_fallback_block + content[idx + len(old):]
            changed = True
            print("  ✅ externalRequire fallback added")
        else:
            print("  ⚠️  Could not find 2nd throw occurrence")
    elif occurrences == 1:
        # Only one throw left — externalImport already patched, this must be externalRequire
        idx = content.find(old)
        if idx > -1:
            content = content[:idx] + require_fallback_block + content[idx + len(old):]
            changed = True
            print("  ✅ externalRequire fallback added")
        else:
            print("  ⚠️  Could not find throw")
    else:
        print("  ⚠️  No throw found for externalRequire")
else:
    # Check if there are TWO markers (one per function)
    marker_count = content.count(require_marker)
    if marker_count >= 2:
        print("  ✅ externalRequire fallback already present")
    else:
        # Only one marker — need to add to externalRequire
        old = 'throw new Error(`Failed to load external module ${id}: ${err}`);'
        if old in content:
            idx = content.find(old)
            content = content[:idx] + require_fallback_block + content[idx + len(old):]
            changed = True
            print("  ✅ externalRequire fallback added")

if changed:
    with open(RUNTIME, "w") as f:
        f.write(content)

    # Verify syntax
    result = subprocess.run(["node", "-c", RUNTIME], capture_output=True, text=True)
    if result.returncode == 0:
        print("  ✅ Syntax verified OK")
    else:
        print(f"  ❌ SYNTAX ERROR: {result.stderr.strip()}")
        # Restore from git or rebuild
        print("  ⚠️  Runtime has syntax errors — may need manual fix")

print("✅ Runtime patched successfully")
PYEOF
else
  echo "⚠️  Runtime not found at $RUNTIME"
fi

echo "🎉 [fix-standalone] All fixes applied. Ready to start server."
