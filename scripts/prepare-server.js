#!/usr/bin/env node
/**
 * prepare-server.js
 *
 * Copies src/, public/, and node_modules/ into src-tauri/server-bundle/
 * so Tauri can bundle them as app resources.
 *
 * Run automatically via tauri.conf.json > build.beforeBuildCommand.
 * Can also be run manually: node scripts/prepare-server.js
 */

const fs   = require('fs');
const path = require('path');

// Project root (one level above scripts/)
const ROOT = path.resolve(__dirname, '..');
const DEST = path.resolve(ROOT, 'src-tauri', 'server-bundle');

// Directories to bundle
const SOURCES = ['src', 'public', 'node_modules'];

console.log('📦 Preparing server bundle for Tauri…');
console.log(`   Source: ${ROOT}`);
console.log(`   Dest:   ${DEST}`);

// Clean destination
if (fs.existsSync(DEST)) {
  console.log('   Cleaning previous bundle…');
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });

// Copy each directory
for (const dir of SOURCES) {
  const src = path.join(ROOT, dir);
  const dst = path.join(DEST, dir);
  if (!fs.existsSync(src)) {
    console.warn(`   ⚠️  Skipping ${dir}/ (not found)`);
    continue;
  }
  console.log(`   Copying ${dir}/…`);
  copyDir(src, dst);
}

console.log('✅ Server bundle ready.');

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isSymbolicLink()) {
      // Preserve symlinks (e.g. .bin/ entries in node_modules)
      const target = fs.readlinkSync(srcPath);
      try { fs.unlinkSync(dstPath); } catch (_) {}
      fs.symlinkSync(target, dstPath);
    } else if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
