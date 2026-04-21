# Frontend

Angular dashboard for viewing trade stats and listening to realtime trade events from the backend.

## Stack

- Angular 20
- Angular Signals
- HttpClient
- Socket.IO client

## Start

```powershell
npm install
npm start
```

App URL:

```text
http://localhost:4200
```

## What It Does

- Calls `GET /api/stats` on initial load
- Connects to Socket.IO at `http://localhost:8000`
- Listens for `new_trade`
- Updates Angular signals automatically
- Reloads stats after each incoming realtime trade event

## Main Files

- [app.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/app.ts)
- [dashboard.store.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/stores/dashboard.store.ts)
- [trade.service.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/services/trade.service.ts)
- [trade-realtime.service.ts](/c:/Users/suppe/Desktop/finView/frontend/src/app/services/trade-realtime.service.ts)

## Current Limitation

- Frontend realtime depends on backend receiving `new_trade`
- Since Python is currently not a continuous watcher, MT5 closes are not pushed automatically unless Python runs again

## Expected Local Setup

1. Start backend on `http://localhost:8000`
2. Start Angular app on `http://localhost:4200`
3. Trigger ingestion by running Python matcher or sending `POST /api/trades`
