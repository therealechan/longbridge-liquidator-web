#!/usr/bin/env node
/**
 * prepare-server.js
 *
 * Copies src/, public/, node_modules/ and package.json into
 * src-tauri/server-bundle/ so Tauri can bundle them as app resources.
 *
 * The desktop UI itself is served from the app bundle (tauri.conf.json >
 * build.frontendDist = ../public); public/ is still copied so the bundled
 * Express server can serve the same UI to a browser on 127.0.0.1:3456.
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
const FILES   = ['package.json'];

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

// Copy individual files (package.json provides the version for /api/health)
for (const file of FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    console.warn(`   ⚠️  Skipping ${file} (not found)`);
    continue;
  }
  console.log(`   Copying ${file}…`);
  fs.copyFileSync(src, path.join(DEST, file));
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
