const fs = require('fs');
const path = require('path');

const { SCREENSHOT_DIR, parseStampFromFile, fmtJst, jstParts, isWeekend, log: rawLog } = require('./lib/util');
const { sendMessage, sendPhoto } = require('./lib/telegram');
const claude = require('./lib/claude');

const log = (m) => rawLog('morning', m);

function lastTradingDayRange() {
  const jst = jstParts();
  const daysBack = jst.dow === 1 ? 3 : 1;
  const startBase = new Date(Date.UTC(jst.y, jst.m - 1, jst.d, 9 - 9, 0, 0));
  const endBase = new Date(Date.UTC(jst.y, jst.m - 1, jst.d, 6 - 9, 0, 0));
  const from = new Date(startBase.getTime() - daysBack * 24 * 3600 * 1000);
  const to = new Date(endBase.getTime() - (daysBack - 1) * 24 * 3600 * 1000);
  return { from, to };
}

function filesInRange(chartName, from, to) {
  return fs.readdirSync(SCREENSHOT_DIR)
    .filter((f) => f.startsWith(chartName + '_') && f.endsWith('.png'))
    .map((f) => ({ f, ts: parseStampFromFile(f) }))
    .filter((x) => x.ts && x.ts >= from && x.ts <= to)
    .sort((a, b) => a.ts - b.ts)
    .map((x) => path.join(SCREENSHOT_DIR, x.f));
}

function pickRepresentatives(files, count) {
  if (files.length <= count) return files;
  const step = (files.length - 1) / (count - 1);
  const out = [];
  for (let i = 0; i < count; i++) out.push(files[Math.round(i * step)]);
  return out;
}

async function summarizeChart(chartName, from, to) {
  const files = filesInRange(chartName, from, to);
  if (!files.length) return { ok: false, text: `${chartName}: 昨日のアジアセッション画像なし` };
  const reps = pickRepresentatives(files, 10);
  const listText = reps.map((f, i) => `画像${i + 1}=${f}`).join('\n');
  const prompt = `以下は前営業日のTradingView画像群です(JST、時系列順)。Readツールで全画像を読み、以下4セッションに分けて値動き観点(方向・レンジ/ブレイク・天底)で各2行以内の日本語でまとめてください。前置き不要、プレーンテキスト。\n\n- 東京前場 (9:00-12:00)\n- 東京後場 (12:00-15:00)\n- ロンドン (16:00-翌1:00)\n- ニューヨーク (22:00-翌5:00)\n\n${listText}`;
  const res = await claude.ask(prompt, { timeoutMs: 300_000 });
  return { ok: res.ok, text: res.text, lastFile: reps[reps.length - 1] };
}

(async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    process.exit(1);
  }
  if (isWeekend()) {
    log('weekend, skipping');
    return;
  }
  const { from, to } = lastTradingDayRange();
  log(`summarizing ${fmtJst(from)} → ${fmtJst(to)}`);

  const header = `☀️ セッション要約\n${fmtJst(from)} 〜 ${fmtJst(to)}`;
  const parts = [header];
  for (const chart of ['chart1', 'chart2']) {
    const r = await summarizeChart(chart, from, to);
    parts.push(`\n[${chart}]\n${r.ok ? r.text : '(生成失敗)'}`);
  }
  const text = parts.join('\n').slice(0, 3800);
  await sendMessage({ text, parseMode: undefined });
  log('morning summary sent');
})();
