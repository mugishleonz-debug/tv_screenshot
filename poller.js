const { parseStampFromFile, fmtJst, log: rawLog } = require('./lib/util');
const { getUpdates, sendMessage, answerCallbackQuery } = require('./lib/telegram');
const state = require('./lib/state');

const log = (m) => rawLog('poller', m);

const TOLERANCE_MS = 30 * 60 * 1000;

function findStoredPost(chartName, targetTs) {
  const s = state.load();
  const posts = (s.charts[chartName] && s.charts[chartName].posts) || {};
  let bestStamp = null;
  let bestDiff = Infinity;
  for (const stamp of Object.keys(posts)) {
    const ts = parseStampFromFile(stamp);
    if (!ts) continue;
    const diff = Math.abs(ts - targetTs);
    if (diff < bestDiff && diff <= TOLERANCE_MS) {
      bestDiff = diff;
      bestStamp = stamp;
    }
  }
  return bestStamp ? { stamp: bestStamp, ts: parseStampFromFile(bestStamp), messageId: posts[bestStamp] } : null;
}

async function handleDay(callback) {
  const data = callback.data || '';
  const m = data.match(/^d:(chart\d):(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})$/);
  if (!m) return;
  const [, chartName, stamp] = m;
  const targetTs = parseStampFromFile(stamp);
  if (!targetTs) {
    await answerCallbackQuery(callback.id, 'パース失敗');
    return;
  }
  log(`day click: ${chartName} ${stamp}`);

  const hit = findStoredPost(chartName, targetTs);
  if (!hit) {
    await answerCallbackQuery(callback.id, `${fmtJst(targetTs)} のデータなし`);
    return;
  }

  await answerCallbackQuery(callback.id);
  try {
    await sendMessage({
      text: `↩ ${chartName} ${fmtJst(hit.ts)}`,
      replyToMessageId: hit.messageId,
    });
    log(`quote-replied to msg ${hit.messageId} (${hit.stamp})`);
  } catch (e) {
    log(`reply error: ${e.message}`);
    if (/replied|not found/i.test(e.message)) {
      await sendMessage({ text: `↩ ${chartName} ${fmtJst(hit.ts)} (元投稿が見つかりません)` }).catch(() => {});
    }
  }
}

async function loop() {
  log('poller started');
  while (true) {
    try {
      const s = state.load();
      const updates = await getUpdates({ offset: (s.lastUpdateId || 0) + 1, timeout: 25 });
      if (updates.length) {
        log(`received ${updates.length} updates`);
        for (const up of updates) {
          if (up.callback_query) {
            try { await handleDay(up.callback_query); }
            catch (e) { log(`handle error: ${e.message}`); }
          }
          state.mutate((ss) => { ss.lastUpdateId = up.update_id; });
        }
      }
    } catch (e) {
      log(`poll error: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

loop();
