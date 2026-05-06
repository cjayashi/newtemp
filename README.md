# Static Prototype (Option A)

This folder is a pure `HTML + CSS + JavaScript` handoff package for backend developers who prefer traditional stacks (PHP/Laravel).

## Included Pages

- `index.html` - Dashboard
- `managed-trade.html` - Trading program + trading history
- `wallet-deposit.html` - Deposit form + deposit history
- `wallet-withdraw.html` - Withdraw form + withdraw history
- `assets/styles.css` - Shared visual styles
- `assets/app.js` - Shared interaction logic

## Purpose

- Show **what should appear** in each user flow.
- Show **what happens when user invests/deposits/withdraws**.
- Keep implementation plain JS so backend can replace data layer with PHP endpoints.

## Demo Behavior

- Uses `localStorage` to simulate state updates:
  - execute trade
  - submit deposit
  - submit withdraw
- Shows corresponding history entries per section.

## API Wiring Notes (for backend dev)

Replace localStorage actions with real endpoints:

- Execute trade: `POST /api/investments` with `{ amountUsd }`
- Deposit submit: `POST /api/deposits` with `{ method, amount, referenceNumber, proofImageBase64 }`
- Withdraw submit: `POST /api/withdrawals` with `{ amountUsd, destinationNote }`
- Get wallet + history:
  - `GET /api/me`
  - `GET /api/investments`
  - `GET /api/deposits`
  - `GET /api/withdrawals`

## Open Locally

From this folder, open `index.html` directly in browser or serve with any static server.

No build step required.
