const { spawn } = require('child_process');
const { ROOT } = require('./util');

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/Users/mugish/.local/bin/claude';
const DEFAULT_TIMEOUT = 120_000;

function ask(prompt, { timeoutMs = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ['--permission-mode', 'bypassPermissions', '-p', prompt], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, text: '', error: 'timeout' });
    }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim();
      if (code === 0 && text) resolve({ ok: true, text });
      else resolve({ ok: false, text, error: err.trim() || `exit ${code}` });
    });
  });
}

module.exports = { ask };
