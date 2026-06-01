const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(ROOT, 'screenshots');
const STATE_DIR = path.join(ROOT, 'state');
const TMP_DIR = path.join(ROOT, 'tmp');
const LOG_DIR = path.join(ROOT, 'logs');

function nowJst() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}

function jstParts(d = new Date()) {
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    y: j.getUTCFullYear(),
    m: j.getUTCMonth() + 1,
    d: j.getUTCDate(),
    h: j.getUTCHours(),
    min: j.getUTCMinutes(),
    dow: j.getUTCDay(),
  };
}

function isWeekend(d = new Date()) {
  const { dow, h } = jstParts(d);
  if (dow === 0) return true;
  if (dow === 6 && h >= 7) return true;
  if (dow === 1 && h < 7) return true;
  return false;
}

function stampForFile(d = new Date()) {
  const p = jstParts(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)}_${pad(p.h)}-${pad(p.min)}`;
}

function parseStampFromFile(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})/);
  if (!m) return null;
  const [_, ymd, hh, mm] = m;
  const iso = `${ymd}T${hh}:${mm}:00+09:00`;
  return new Date(iso);
}

function fmtJst(d, withSec = false) {
  const p = jstParts(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}${withSec ? ':00' : ''}`;
}

function log(scope, msg) {
  const ts = fmtJst(new Date(), true);
  console.log(`[${ts}] [${scope}] ${msg}`);
}

module.exports = {
  ROOT,
  SCREENSHOT_DIR,
  STATE_DIR,
  TMP_DIR,
  LOG_DIR,
  nowJst,
  jstParts,
  isWeekend,
  stampForFile,
  parseStampFromFile,
  fmtJst,
  log,
};
