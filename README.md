# tv_screenshot

TradingView のチャート画面を定期的に撮影し、Telegram に送信するための Node.js スクリプトです。

## Features

- 15分ごとにチャート画像を撮影して Telegram に送信
- 朝のサマリー送信
- Telegram のボタン操作から過去画像を返信
- Playwright によるブラウザ操作
- launchd による macOS 常駐・定期実行

## Tech Stack

- Node.js
- Playwright
- Telegram Bot API
- macOS launchd

## Setup

```bash
npm install
```

`.env` を作成して Telegram の送信先を設定します。

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## Scripts

```bash
./run.sh
./run_morning.sh
./run_poller.sh
```

## Notes

`.env`、ログ、状態ファイル、スクリーンショット、`node_modules` は Git 管理から除外しています。
