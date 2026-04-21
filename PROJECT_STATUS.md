# finView Project Status

## 1. Executive Summary

`finView` is a trade analytics pipeline for MT5 trading data.

Current product flow:

```text
MT5 -> Python matcher -> Backend API -> MongoDB -> Socket.IO -> Angular dashboard
```

The current system can:

- extract closed trades from MT5 history
- send normalized trade payloads to the backend
- store trades in MongoDB using Prisma
- emit realtime `new_trade` events from the backend
- load summary statistics in Angular
- refresh Angular state when backend emits a new trade event

The main gap at the moment:

- MT5 is not yet pushing events continuously by itself
- Python currently runs once per execution, not as a continuous watcher
- because of that, frontend realtime updates only happen after backend receives a new `POST /api/trades`

## 2. Product Goal

Build a dashboard that automatically reflects MT5 trading activity and calculates portfolio/trade analytics such as:

- total P&L
- monthly P&L
- trade win rate
- day win rate
- profit factor
- average win / average loss
- average trade duration
- best day contribution
- live trade ingestion and realtime dashboard refresh

## 3. Current Scope Delivered

### Card 1: Python Matcher & Extractor

Status: Delivered for closed-trade batch ingestion

Delivered:

- MT5 initialization via `mt5.initialize()`
- deal history extraction via `history_deals_get()`
- matching closed trades from MT5 deal history
- payload generation per closed trade
- dispatch to backend with `requests.post()`

Current behavior:

- batch/run-once mode
- closed trades only
- no open-position streaming

Files:

- [mt5_matcher/main.py](/c:/Users/suppe/Desktop/finView/mt5_matcher/main.py)
- [mt5_matcher/matcher.py](/c:/Users/suppe/Desktop/finView/mt5_matcher/matcher.py)
- [mt5_matcher/client.py](/c:/Users/suppe/Desktop/finView/mt5_matcher/client.py)
- [mt5_matcher/models.py](/c:/Users/suppe/Desktop/finView/mt5_matcher/models.py)
- [mt5_matcher/config.py](/c:/Users/suppe/Desktop/finView/mt5_matcher/config.py)

### Card 2: Backend Infrastructure & Prisma

Status: Delivered

Delivered:

- Express + TypeScript backend
- Prisma + MongoDB integration
- `Trade` model aligned with current Python payload
- Prisma client available to controllers/services

Files:

- [backend/prisma/schema.prisma](/c:/Users/suppe/Desktop/finView/backend/prisma/schema.prisma)
- [backend/src/lib/prisma.ts](/c:/Users/suppe/Desktop/finView/backend/src/lib/prisma.ts)
- [backend/src/server.ts](/c:/Users/suppe/Desktop/finView/backend/src/server.ts)

### Card 3: Ingestion API & Realtime Emit

Status: Delivered

Delivered:

- `POST /api/trades`
- upsert logic to prevent duplicate trade rows
- Socket.IO integration
- `io.emit('new_trade', data)` after successful save

Files:

- [backend/src/controllers/trade.controller.ts](/c:/Users/suppe/Desktop/finView/backend/src/controllers/trade.controller.ts)
- [backend/src/services/trade.service.ts](/c:/Users/suppe/Desktop/finView/backend/src/services/trade.service.ts)
- [backend/src/lib/socket.ts](/c:/Users/suppe/Desktop/finView/backend/src/lib/socket.ts)

### Card 4: Analytics Service

Status: Delivered

Delivered:

- `GET /api/stats`
- backend analytics computation for dashboard summary
- daily and monthly breakdown output

Metrics currently implemented:

- total P&L
- monthly P&L
- best day % of total profit
- trade win %
- day win %
- avg win / avg loss
- profit factor
- avg winning trade
- avg losing trade
- total trades
- total lots
- avg trades/day
- active days
- average trade duration
- average win duration
- average loss duration

Files:

- [backend/src/routes/stats.routes.ts](/c:/Users/suppe/Desktop/finView/backend/src/routes/stats.routes.ts)
- [backend/src/controllers/stats.controller.ts](/c:/Users/suppe/Desktop/finView/backend/src/controllers/stats.controller.ts)
- [backend/src/services/stats.service.ts](/c:/Users/suppe/Desktop/finView/backend/src/services/stats.service.ts)

### Card 5: Angular Service & Socket Integration

Status: Delivered in code

Delivered:

- Angular frontend scaffold
- initial load from `GET /api/stats`
- Socket.IO client connection
- signals-based dashboard store
- UI updates when backend emits `new_trade`

Important note:

- This card is technically working only when backend actually receives a new trade event
- because MT5 is not yet continuously feeding backend, the perceived end-to-end realtime behavior is still incomplete

Files:

- [frontend/src/app/services/trade.service.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/services/trade.service.ts)
- [frontend/src/app/services/trade-realtime.service.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/services/trade-realtime.service.ts)
- [frontend/src/app/stores/dashboard.store.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/stores/dashboard.store.ts)
- [frontend/src/app/app.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/app.ts)
- [frontend/src/app/app.html](/c:/Users\suppe\Desktop\finView\frontend\src\app\app.html)

## 4. Current Data Contract

Backend ingests the following trade payload:

```json
{
  "TicketID": "123456789",
  "Symbol": "XAUUSD",
  "Side": "Buy",
  "Lots": 0.1,
  "Open_Time": "2026-03-13T08:00:00+00:00",
  "Close_Time": "2026-03-13T08:30:00+00:00",
  "Open_Price": 2150.5,
  "Close_Price": 2155.2,
  "Profit_USD": 45.8,
  "Strategy_Tag": "Breakout_v1"
}
```

Current backend storage model:

- `ticketId`
- `symbol`
- `side`
- `lots`
- `openTime`
- `closeTime`
- `openPrice`
- `closePrice`
- `profitUsd`
- `strategyTag`

## 5. External Dependencies

These are required outside the local codebase.

### Trading Platform

- MetaTrader 5 terminal installed locally
- MT5 account credentials
- broker server name
- current known example: `Exness-MT5Trial17`

### Broker / Account

- Exness demo account has been used during setup
- MT5 login and trade password are required

### Database

- MongoDB Atlas
- active cluster
- database user
- IP/network access configured
- `DATABASE_URL` with explicit database name, for example `/finview`

### Runtime / Tooling

- Python 3.x
- Node.js / npm
- Angular CLI

## 6. Current Runbook

### Backend

```powershell
cd c:\Users\suppe\Desktop\finView\backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

### Frontend

```powershell
cd c:\Users\suppe\Desktop\finView\frontend
npm install
npm start
```

### Python Ingestion

```powershell
cd c:\Users\suppe\Desktop\finView
$env:MT5_LOGIN="463138470"
$env:MT5_PASSWORD="your-mt5-password"
$env:MT5_SERVER="Exness-MT5Trial17"
$env:BACKEND_URL="http://localhost:8000/api/trades"
$env:STRATEGY_TAG="Breakout_v1"
python -m mt5_matcher.main
```

## 7. API Summary

### Backend APIs

- `GET /health`
- `POST /api/trades`
- `GET /api/stats`

### Socket Event

- `new_trade`

## 8. Current Business Rules

- Winning trade: `Profit_USD > 0`
- Winning day: daily P&L `> 0`
- Profit factor: `gross profit / abs(gross loss)`
- Avg losing trade is returned as absolute value
- Daily and monthly grouping use `Close_Time`
- Python sends only closed trades

## 9. Known Gaps / Risks

### Gap 1: No true MT5 realtime source yet

Impact:

- dashboard does not update automatically when a trade closes in MT5 unless backend receives a fresh ingestion request

Recommendation:

- implement Python watcher loop, or
- implement MT5-native MQL5 EA using `OnTradeTransaction()` and `WebRequest()`

### Gap 2: Python only runs once

Impact:

- user must rerun Python to ingest newly closed trades

Recommendation:

- add long-running polling worker with state persistence

### Gap 3: Angular realtime depends on backend event emission

Impact:

- frontend signals are correct only if socket receives `new_trade`

Recommendation:

- first solve the MT5 -> backend continuous ingestion gap

### Gap 4: Analytics scope is partial relative to desired product

Not yet implemented:

- direction analysis
- duration bucket analysis
- calendar summaries
- balance curve
- max loss limit overlays

## 10. Recommended Next Steps

### Option A: Python Watcher

Best if the team wants to keep most logic in Python.

Deliverables:

- continuous loop
- incremental MT5 polling
- duplicate protection
- retry/reconnect logic
- background run script for Windows

### Option B: MQL5 EA

Best if the team wants MT5-native realtime.

Deliverables:

- `OnTradeTransaction()` hook
- closed-trade detection
- `WebRequest()` to backend
- no manual Python rerun needed

### Option C: Dashboard Expansion

After ingestion is fixed, continue frontend/business analytics with:

- charts
- calendar heatmap
- balance curve
- direction split
- duration buckets

## 11. Suggested PM-Level Status

Overall status: Yellow

Reason:

- core architecture is in place
- backend analytics and realtime plumbing exist
- the main user-facing promise of automatic MT5-driven refresh is not complete yet because ingestion is not continuous

## 12. Handoff Note

If another engineer continues this project, the first priority should be:

1. make MT5 ingestion continuous
2. verify `POST /api/trades` fires automatically on each closed trade
3. confirm Angular signal state updates without manual refresh
4. only then expand dashboard analytics and visualizations
