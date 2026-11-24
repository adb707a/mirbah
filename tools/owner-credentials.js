'use strict';
/**
 * Owner credentials are generated locally and written outside Git.
 * The password is never printed by the platform; only this file path is shown.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CREDENTIALS_FILE = process.env.MIRBAH_OWNER_CREDENTIALS_FILE ||
  path.join(__dirname, '..', 'server', 'data', 'owner-credentials.txt');

function generatePassword(length = 28) {
  let out = '';
  while (out.length < length) out += crypto.randomBytes(32).toString('base64url');
  return out.slice(0, length);
}

function writeCredentials(email, password) {
  const dir = path.dirname(CREDENTIALS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const body = [
    '# مِرْباح — بيانات مالك مؤقتة، محلية فقط. لا تُرفع إلى Git.',
    '# سجّل الدخول من /owner-login/ ثم غيّر كلمة المرور واحذف هذا الملف.',
    'email=' + email,
    'password=' + password,
    'generated=' + new Date().toISOString(),
    ''
  ].join('\n');
  fs.writeFileSync(CREDENTIALS_FILE, body, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(CREDENTIALS_FILE, 0o600); } catch (e) {}
  return CREDENTIALS_FILE;
}

module.exports = { CREDENTIALS_FILE, generatePassword, writeCredentials };
