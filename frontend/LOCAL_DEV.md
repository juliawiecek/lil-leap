# Frontend (Angular) — Local Development

No `.env` file is required for the current local setup.

## Proxy config
`frontend/proxy.conf.json` should point to the local services:

```json
{
  "/auth/**": { "target": "http://localhost:8081", "secure": false },
  "/rules/**": { "target": "http://localhost:8081", "secure": false },
  "/api/v1/orders": { "target": "http://localhost:8082", "secure": false },
  "/api/v1/accounts": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/instruments": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/clients/**": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/quotes/latest/**": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/quotes/history/**": { "target": "http://localhost:8080", "secure": false }
}
```

Orders submission is served by `nextTrade-orders` on port `8082`, while account, instrument, order-history, and quote-read endpoints are served by `nextTrade-holdings` on port `8080`. The local proxy must split those paths instead of sending every `/api/**` request to Orders.

## Run
```cmd
cd frontend
npm ci
npm start
```

## Verify
- App: `http://localhost:4300`


