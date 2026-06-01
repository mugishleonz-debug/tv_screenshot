const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const { SCREENSHOT_DIR, stampForFile, parseStampFromFile, fmtJst, jstParts, isWeekend, log: rawLog } = require('./lib/util');
const { sendPhoto } = require('./lib/telegram');
const state = require('./lib/state');
const claude = require('./lib/claude');

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function buildDayButtons(chartName, now) {
  const todayDow = jstParts(now).dow;
  const buttons = [];
  for (let targetDow = 1; targetDow <= 6; targetDow++) {
    let daysBack = (todayDow - targetDow + 7) % 7;
    if (daysBack === 0) daysBack = 7;
    const target = new Date(now.getTime() - daysBack * 86400 * 1000);
    const tp = jstParts(target);
    buttons.push({
      text: `${DOW_LABELS[targetDow]} ${tp.m}/${tp.d}`,
      callback_data: `d:${chartName}:${stampForFile(target)}`,
    });
  }
  return buttons;
}

const CHARTS = [
  { name: 'chart1', url: 'https://jp.tradingview.com/chart/zzoZL69h/?symbol=CRYPTO%3ABTCUSD' },
  { name: 'chart2', url: 'https://jp.tradingview.com/chart/bEHe5sqW/?symbol=CRYPTO%3ABTCUSD' },
];

const VIEWPORT = { width: 1920, height: 1080 };
const RETENTION_DAYS = 14;
const NIGHT_START_H = 0;
const NIGHT_END_H = 7;
const COMMENT_INTERVAL_MS = 55 * 60 * 1000;

const log = (m) => rawLog('capture', m);

async function captureOne(browser, chart, stamp) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  log(`opening ${chart.name}`);
  await page.goto(chart.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);

  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="ウォッチリスト・詳細・ニュース"]');
    const panel = document.querySelector('.layout__area--right');
    if (btn && panel && panel.getBoundingClientRect().width > 50) btn.click();
  });
  await page.waitForTimeout(1500);

  const centers = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.chart-container')).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })
  );
  for (const c of centers) {
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(150);
    await page.keyboard.press('Alt+KeyR');
    await page.waitForTimeout(250);
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);

  for (let i = 0; i < 3; i++) {
    const clicked = await page.evaluate(() => {
      let hit = 0;
      document.querySelectorAll('button').forEach((b) => {
        const t = (b.textContent || '').trim();
        if (/^(了解|OK|閉じる|Got it|Dismiss)/i.test(t)) { b.click(); hit++; }
      });
      return hit;
    });
    if (!clicked) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);

  const outPath = path.join(SCREENSHOT_DIR, `${chart.name}_${stamp}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  await ctx.close();
  log(`saved ${path.basename(outPath)}`);
  return outPath;
}

function findYesterdaySame(chartName, now) {
  const target = new Date(now.getTime() - 24 * 3600 * 1000);
  const toleranceMs = 45 * 60 * 1000;
  const files = fs.readdirSync(SCREENSHOT_DIR).filter((f) => f.startsWith(chartName + '_') && f.endsWith('.png'));
  let best = null;
  let bestDiff = Infinity;
  for (const f of files) {
    const ts = parseStampFromFile(f);
    if (!ts) continue;
    const diff = Math.abs(ts - target);
    if (diff < bestDiff && diff <= toleranceMs) {
      bestDiff = diff;
      best = path.join(SCREENSHOT_DIR, f);
    }
  }
  return best;
}

async function makeCaption(chartName, currentPath, now, withComment) {
  const nowStr = fmtJst(now);
  const header = `${chartName} — ${nowStr}`;
  if (!withComment) return header;
  const prev = findYesterdaySame(chartName, now);
  let prompt;
  if (prev) {
    prompt = `画像A=${currentPath}（今のTradingViewチャート、複数ペイン構成）、画像B=${prev}（昨日同時刻）。2枚をReadツールで読み、画像内に写っている全銘柄を確認した上で、画像全体の値動き観点（方向・レンジ/ブレイク・天底）を比較して日本語1〜2行で総括。画像に写っていない銘柄には言及しないこと。特定の1銘柄だけに偏らないこと。前置き不要。`;
  } else {
    prompt = `画像A=${currentPath}（今のTradingViewチャート、複数ペイン構成）。Readツールで読み、画像内に写っている全銘柄を確認した上で、画像全体の値動き観点で日本語1〜2行で総括。画像に写っていない銘柄には言及しないこと。特定の1銘柄だけに偏らないこと。前置き不要。`;
  }
  const res = await claude.ask(prompt, { timeoutMs: 180_000 });
  const comment = res.ok && res.text ? res.text.slice(0, 600) : '(コメント生成失敗)';
  if (!res.ok) log(`claude error: ${res.error}`);
  return `${header}\n${comment}${prev ? '' : '\n(前日データなし)'}`;
}

function retentionCleanup() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;
  try {
    for (const f of fs.readdirSync(SCREENSHOT_DIR)) {
      const full = path.join(SCREENSHOT_DIR, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (e) {
    log(`retention error: ${e.message}`);
  }
}

function postsCleanup() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;
  state.mutate((s) => {
    for (const chartName of Object.keys(s.charts || {})) {
      const posts = (s.charts[chartName] && s.charts[chartName].posts) || {};
      for (const stamp of Object.keys(posts)) {
        const ts = parseStampFromFile(stamp);
        if (!ts || ts.getTime() < cutoff) delete posts[stamp];
      }
    }
  });
}

function isNight() {
  const h = jstParts().h;
  return h >= NIGHT_START_H && h < NIGHT_END_H;
}

(async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    process.exit(1);
  }
  const now = new Date();
  if (isWeekend(now)) {
    log('weekend, skipping');
    return;
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const stamp = stampForFile(now);
  const night = isNight();
  if (night) log('night mode: capture only, no send');

  const browser = await chromium.launch({ headless: true });
  const savedPaths = {};
  try {
    for (const chart of CHARTS) {
      try {
        const p = await captureOne(browser, chart, stamp);
        savedPaths[chart.name] = p;
      } catch (e) {
        log(`capture error on ${chart.name}: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (!night) {
    const s0 = state.load();
    const lastCommentTs = s0.lastCommentTs ? new Date(s0.lastCommentTs) : null;
    const withComment = !lastCommentTs || (now - lastCommentTs) >= COMMENT_INTERVAL_MS;
    log(`comment mode: ${withComment ? 'ON' : 'OFF'}`);
    let commentedThisRun = false;
    for (const chart of CHARTS) {
      const p = savedPaths[chart.name];
      if (!p) continue;
      try {
        const caption = await makeCaption(chart.name, p, now, withComment);
        const dayButtons = buildDayButtons(chart.name, now);
        const replyMarkup = { inline_keyboard: [dayButtons.slice(0, 3), dayButtons.slice(3)] };
        const msg = await sendPhoto({ filePath: p, caption, replyMarkup });
        const stamp = stampForFile(now);
        state.mutate((s) => {
          s.charts[chart.name] = s.charts[chart.name] || {};
          s.charts[chart.name].posts = s.charts[chart.name].posts || {};
          s.charts[chart.name].posts[stamp] = msg.message_id;
        });
        commentedThisRun = commentedThisRun || withComment;
        log(`sent ${chart.name} msg=${msg.message_id}${withComment ? ' (commented)' : ''}`);
      } catch (e) {
        log(`send error on ${chart.name}: ${e.message}`);
      }
    }
    if (commentedThisRun) {
      state.mutate((s) => { s.lastCommentTs = now.toISOString(); });
    }
  }

  retentionCleanup();
  postsCleanup();
})();
