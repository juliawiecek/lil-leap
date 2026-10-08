# Insights Frontend (Angular) — Local Development

No `.env` file is required for the current local setup.

## Proxy config
`insights-frontend/proxy.conf.json` should point to the local services:

```json
{
  "/auth/**": { "target": "http://localhost:8081", "secure": false },
  "/rules/**": { "target": "http://localhost:8081", "secure": false },
  "/api/**": { "target": "http://localhost:8084", "secure": false }
}
```

## Run
```cmd
cd insights-frontend
npm ci
npm start
```

## Verify
- App: `http://localhost:4301`

