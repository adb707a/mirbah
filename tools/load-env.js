'use strict';
/**
 * Loads optional KEY=VALUE pairs from server/.env without adding a dependency.
 * Existing process environment variables always win, so CI/ops can override.
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return false;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i < 1) continue;
      const key = s.slice(0, i).trim();
      let value = s.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return true;
  } catch (e) {
    console.error('[env] تعذر قراءة ملف البيئة:', e && e.message);
    return false;
  }
}

loadEnvFile(process.env.MIRBAH_ENV_FILE || path.join(__dirname, '..', 'server', '.env'));

module.exports = { loadEnvFile };
