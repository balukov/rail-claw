<p align="center">
  <img src="snapclaw-logo.png" alt="SnapClaw" width="300"/>
</p>

<p align="center"><em>Your own AI agent on Railway in 5 minutes</em></p>

<p align="center">
  <a href="https://railway.com/deploy/snapclaw" target="_blank">
    <img src="https://railway.com/button.svg" alt="Deploy on Railway"/>
  </a>
</p>

One-click deploy. No Docker, no terminal, no DevOps. Just click the button, follow the setup wizard, and talk to your bot.

## What you need

- [Railway](https://railway.app) account (free tier works)
- [ChatGPT](https://chat.openai.com) subscription (for Codex OAuth)
- [Telegram](https://telegram.org) app

## Deploy

1. Click **Deploy on Railway**
2. Set two environment variables:
   - `SETUP_PASSWORD` — password for the admin panel
   - `OPENCLAW_GATEWAY_TOKEN` — any random string
3. Deploy and wait for the build

## Setup

In Railway, open **Settings > Networking** and click your public domain. Log in with your `SETUP_PASSWORD`.

**Step 1 — Connect Codex**
- Click **Connect** — copy the OAuth URL, sign in with your ChatGPT account, paste the redirect URL back

**Step 2 — Add Telegram Bot**
- Create a bot via [@BotFather](https://t.me/BotFather) in Telegram (`/newbot`)
- Paste the bot token and click **Connect**
- Send a message to your bot to get a pairing code
- Enter the code and click **Approve**

Done. Talk to your bot via Telegram or the Web UI.

## Your data

Everything lives on a Railway Volume at `/data` and survives redeploys:

- Conversations, memory, config, credentials, skills, workspace

To update, just redeploy.

## Credits

- [OpenClaw](https://openclaw.ai) | [GitHub](https://github.com/openclaw/openclaw)
- SnapClaw by [@balukov](https://github.com/balukov)
