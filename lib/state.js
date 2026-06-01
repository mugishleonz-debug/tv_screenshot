const fs = require('fs');
const path = require('path');
const { STATE_DIR } = require('./util');

const FILE = path.join(STATE_DIR, 'state.json');

function defaultState() {
  return {
    lastUpdateId: 0,
    charts: {
      chart1: { posts: {} },
      chart2: { posts: {} },
    },
  };
}

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const obj = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...obj,
      charts: { ...base.charts, ...(obj.charts || {}) },
    };
  } catch {
    return defaultState();
  }
}

function save(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

function mutate(fn) {
  const s = load();
  const res = fn(s);
  save(s);
  return res;
}

module.exports = { load, save, mutate, FILE };
