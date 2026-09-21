# Am Market

Live **NSE · BSE · Bitcoin** analysis terminal with a React desk, GenAI copilot, and Sensibull-style options tools.

This is a research / education UI. It is **not** SEBI-registered advice and it does not place broker orders.

## What you get

- Live Nifty, Sensex, Bank Nifty, GIFT Nifty, India VIX and BTC tickers (WebSocket)
- Advanced option chain: OI, IV, Greeks, PCR, max pain, support / resistance
- Strategy builder, strategy wizard and Easy Options with expiry P&L
- OI lab, heatmap, screener, technical signals, FII/DII, market news
- Live chatbot that answers from the current tape (optional Groq / Gemini / OpenAI)

## Free data sources

| Feed | Use |
| --- | --- |
| NSE India JSON (session cookie) | Option chain, OI |
| Yahoo Finance chart API | NSE/BSE stocks, indices, BTC history |
| Downstox public API | India overview, sectors, FII/DII, holidays, news |
| Binance | BTCUSDT 24x7 last price |
| CoinGecko | BTC USD / INR |
| Google News RSS | Headlines |

## Run

```bash
cd d:\Am_Market
npm install
npm run install:all
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). API is [http://localhost:8787](http://localhost:8787).

Optional GenAI (free Groq key works): copy `.env.example` to `server/.env` or project `.env` and set `GROQ_API_KEY`. Without a key the copilot still uses live ML / rule analysis on the tape.

## Stack

React 18 + Vite front end, Node Express + WebSocket back end, Black-Scholes Greeks, RSI/MACD/Bollinger, PCR and max-pain engine.
