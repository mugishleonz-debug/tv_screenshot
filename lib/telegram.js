const fs = require('fs');
const https = require('https');
const path = require('path');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function api(method, payload, useForm = false) {
  return new Promise((resolve, reject) => {
    let body, headers;
    if (useForm) {
      const boundary = '----tv' + Date.now() + Math.random().toString(36).slice(2);
      const chunks = [];
      for (const [k, v] of Object.entries(payload)) {
        if (v == null) continue;
        if (v && v._file) {
          const fileBuf = fs.readFileSync(v._file);
          const filename = path.basename(v._file);
          chunks.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${k}"; filename="${filename}"\r\n` +
            `Content-Type: ${v._mime || 'application/octet-stream'}\r\n\r\n`
          ));
          chunks.push(fileBuf);
          chunks.push(Buffer.from('\r\n'));
        } else {
          const str = typeof v === 'string' ? v : JSON.stringify(v);
          chunks.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${k}"\r\n\r\n${str}\r\n`
          ));
        }
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      body = Buffer.concat(chunks);
      headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      };
    } else {
      body = Buffer.from(JSON.stringify(payload));
      headers = {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      };
    }
    const req = https.request(
      {
        method: 'POST',
        host: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/${method}`,
        headers,
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.ok) resolve(j.result);
            else reject(new Error(`Telegram ${method}: ${j.description}`));
          } catch (e) {
            reject(new Error(`Telegram ${method} parse: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendPhoto({ filePath, caption, replyMarkup, parseMode, replyToMessageId }) {
  return api('sendPhoto', {
    chat_id: CHAT_ID,
    caption,
    parse_mode: parseMode || 'HTML',
    photo: { _file: filePath, _mime: 'image/png' },
    reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
    reply_to_message_id: replyToMessageId,
  }, true);
}

function sendMessage({ text, parseMode, replyMarkup, replyToMessageId }) {
  return api('sendMessage', {
    chat_id: CHAT_ID,
    text,
    parse_mode: parseMode || 'HTML',
    reply_markup: replyMarkup,
    reply_to_message_id: replyToMessageId,
  });
}

function answerCallbackQuery(id, text) {
  return api('answerCallbackQuery', {
    callback_query_id: id,
    text,
  });
}

function getUpdates({ offset, timeout = 25 }) {
  return api('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['callback_query'],
  });
}

module.exports = {
  sendPhoto,
  sendMessage,
  answerCallbackQuery,
  getUpdates,
};
