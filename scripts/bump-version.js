#!/usr/bin/env node
/**
 * bump-version.js
 *
 * Bumps the version in package.json, tauri.conf.json, and Cargo.toml,
 * then commits and tags for release.
 *
 * Usage:
 *   npm run release:patch   → 1.0.0 → 1.0.1
 *   npm run release:minor   → 1.0.0 → 1.1.0
 *   npm run release:major   → 1.0.0 → 2.0.0
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT        = path.resolve(__dirname, '..');
const PKG         = path.join(ROOT, 'package.json');
const TAURI_CONF  = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const CARGO_TOML  = path.join(ROOT, 'src-tauri', 'Cargo.toml');

const bumpType = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node scripts/bump-version.js [patch|minor|major]');
  process.exit(1);
}

// ── Read current version ──────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let nextMajor = major, nextMinor = minor, nextPatch = patch;
if (bumpType === 'major') { nextMajor++; nextMinor = 0; nextPatch = 0; }
if (bumpType === 'minor') { nextMinor++; nextPatch = 0; }
if (bumpType === 'patch') { nextPatch++; }

const oldVersion = `${major}.${minor}.${patch}`;
const newVersion = `${nextMajor}.${nextMinor}.${nextPatch}`;
const tag        = `v${newVersion}`;

console.log(`\nBumping version: ${oldVersion} → ${newVersion}\n`);

// ── Update package.json ───────────────────────────────────────────────────────
pkg.version = newVersion;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ package.json       → ${newVersion}`);

// ── Update tauri.conf.json ────────────────────────────────────────────────────
const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF, 'utf8'));
tauriConf.version = newVersion;
fs.writeFileSync(TAURI_CONF, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`✅ tauri.conf.json    → ${newVersion}`);

// ── Update Cargo.toml ─────────────────────────────────────────────────────────
let cargo = fs.readFileSync(CARGO_TOML, 'utf8');
cargo = cargo.replace(
  /^version = "[^"]*"/m,
  `version = "${newVersion}"`
);
fs.writeFileSync(CARGO_TOML, cargo);
console.log(`✅ Cargo.toml         → ${newVersion}`);

// ── Commit + tag ──────────────────────────────────────────────────────────────
console.log('\nCommitting and tagging…');
execSync(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`, { cwd: ROOT, stdio: 'inherit' });
execSync(`git commit -m "chore: release ${tag}"`, { cwd: ROOT, stdio: 'inherit' });
execSync(`git tag ${tag}`, { cwd: ROOT, stdio: 'inherit' });
execSync(`git push origin master`, { cwd: ROOT, stdio: 'inherit' });
execSync(`git push origin ${tag}`, { cwd: ROOT, stdio: 'inherit' });

console.log(`\n🚀 Released ${tag} — GitHub Actions is now building the .dmg`);
console.log(`   https://github.com/therealechan/longbridge-liquidator-web/releases\n`);
