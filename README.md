# finView

Current workspace status for the MT5 -> Backend -> Angular flow.

## Architecture

```text
MT5 history_deals_get()
  -> Python matcher
  -> POST /api/trades
  -> MongoDB via Prisma
  -> Socket.IO event: new_trade
  -> Angular signals store
```

## Current Scope

- Python extracts closed trades from MT5 history and sends one JSON payload per closed trade.
- Backend stores trades in MongoDB with Prisma.
- Backend emits `new_trade` through Socket.IO after a successful upsert.
- Angular loads `/api/stats` on startup and refreshes stats when `new_trade` is received.

## Important Limitation

- The Python process is currently `run once`, not a long-running watcher.
- This means Angular realtime works only when backend receives a new `POST /api/trades`.
- Closing a trade in MT5 will not update the UI automatically unless Python is run again or replaced with a continuous watcher or an MT5 EA.

## Trade Payload Contract

Python sends this payload to backend:

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

## Project Structure

- [mt5_matcher](/c:/Users/suppe/Desktop/finView/mt5_matcher): Python extractor and matcher
- [backend](/c:/Users/suppe/Desktop/finView/backend): Express + TypeScript + Prisma + Socket.IO
- [frontend](/c:/Users/suppe/Desktop/finView/frontend): Angular app with signals-based dashboard state

## Run Order

1. Start backend
2. Start frontend
3. Run Python matcher when you want to ingest closed trades

## Backend

See [backend/README.md](/c:/Users/suppe/Desktop/finView/backend/README.md)

## Frontend

See [frontend/README.md](/c:/Users/suppe/Desktop/finView/frontend/README.md)

## Python Matcher

Install:

```powershell
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

Required env:

```powershell
$env:MT5_LOGIN="463138470"
$env:MT5_PASSWORD="your-mt5-password"
$env:MT5_SERVER="Exness-MT5Trial17"
$env:BACKEND_URL="http://localhost:8000/api/trades"
```

Optional env:

```powershell
$env:MT5_PATH="C:\Program Files\MetaTrader 5\terminal64.exe"
$env:HISTORY_FROM="2026-03-01T00:00:00"
$env:HISTORY_TO="2026-03-13T23:59:59"
$env:REQUEST_TIMEOUT="10"
$env:STRATEGY_TAG="Breakout_v1"
```

Run:

```powershell
python -m mt5_matcher.main
```
