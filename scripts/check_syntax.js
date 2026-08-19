#!/usr/bin/env node
/**
 * NOTIGAS - Syntax & Compilation Integrity Checker
 * Verifies all JS files with `node --check` to prevent syntax regressions.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', '.gemini']);

function getJsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const jsFiles = getJsFiles(ROOT_DIR);
console.log(`\n🔍 Verificando sintaxis JavaScript en ${jsFiles.length} archivos...\n`);

let failedCount = 0;
const failures = [];

for (const file of jsFiles) {
  const relativePath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`  ✅ [OK]   ${relativePath}`);
  } catch (err) {
    failedCount++;
    const errMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    failures.push({ file: relativePath, error: errMsg });
    console.error(`  ❌ [FAIL] ${relativePath}`);
    console.error(`     ${errMsg.split('\n')[0]}`);
  }
}

console.log('\n--------------------------------------------------');
if (failedCount === 0) {
  console.log(`✨ ÉXITO: Todos los archivos (${jsFiles.length}) compilan correctamente.\n`);
  process.exit(0);
} else {
  console.error(`🚨 ERROR: ${failedCount} de ${jsFiles.length} archivos tienen errores de sintaxis:\n`);
  for (const f of failures) {
    console.error(`  - ${f.file}:\n    ${f.error}\n`);
  }
  process.exit(1);
}
