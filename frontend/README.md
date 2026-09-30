# NextTrade Angular

Angular conversion of the approved NextTrade animated landing and authentication experience.

## Included

- Animated candlestick intro rendered with the Canvas API
- Moving market ticker and ambient volume animation
- NextTrade brand reveal and transition into the access screen
- Sign In and Create Account modes
- Password visibility, form validation, and a password recovery placeholder
- Responsive desktop and mobile styling
- Reduced-motion support

## Technology

- Angular 22 standalone component
- TypeScript
- SCSS
- Angular signals for interface state
- Native Canvas API for the chart animation

## Run locally

Install **Node.js 24.15.0 or a later 24.x release** (includes npm), then clone
this repository. From the project folder (`lil-leap`):

```powershell
cd frontend
npm ci
npm start
```

Open **http://localhost:4300** after the build finishes.
Keep the terminal open. Press **Ctrl+C** to stop the app.
On later runs, run `npm start` from `frontend`.
Run `npm ci` again if you pull changes to `package-lock.json`.

### Signing in (auth service)

Sign up, sign in, and sign out call the auth service at relative `/auth/...`
paths. Start the stack from the repository root with `docker compose up --build -d gateway`.
`npm start` forwards API requests to the shared gateway at `http://localhost:4200`
through `proxy.conf.json`. In Docker, the shared gateway routes `/auth/` to Identity. Both keep
requests same-origin, so no CORS setup is needed. Never call the auth
service by absolute URL.

Tokens are held in memory only (`src/app/auth-api.ts`), so reloading the page
signs you out. While you're active the app refreshes them in the background;
after 10 minutes without input it signs you out (`src/app/session-keeper.ts`,
BR-03 — keep `SESSION_INACTIVITY_MINUTES` there in step with the auth service).

### Common problems

- **Missing `package.json`:** run npm commands inside `frontend`.
- **Connection refused:** check that `npm start` is still running.
- **Port already in use:** stop the previous server with **Ctrl+C**.

For backend startup, follow the [setup guide](../docs/GETTING_STARTED.md).

## Production build

```powershell
npm run build
```

The compiled site is written to `dist/nexttrade-angular/browser`.

## Run with Docker

The shared gateway publishes the trading client at `http://localhost:4200`:

```bash
docker compose up --build -d gateway
```

The frontend container serves static files on internal port 80. The gateway routes
authentication to Identity, portfolio and instrument reads to Holdings, order
submission to Orders, and quote requests to Quotes. `GET /api/v1/orders` belongs
to Holdings; `POST /api/v1/orders` belongs to Orders. Paths are preserved.
See the [route table](../docs/architecture/service-boundaries.md#gateway-routes).

## Main files

- `src/app/app.html`: Angular template
- `src/app/app.scss`: visual design and animations
- `src/app/app.ts`: Angular state, interactions, and chart rendering

Registration, login, token refresh and logout use the real Identity service. Trading screens still use local sample data and simulated order interactions; live order, quote and portfolio integration remains separate work.

## Error logging

Bootstrap and Angular/global runtime errors log fixed event messages, never raw
errors, stacks, HTTP payloads, or form data.

Run `npm test` (Node 24+, or Node 22.18+) for application startup and secret-bearing
error tests, then `npm run build` for the production compilation check.

Deploy `dist/nexttrade-angular/browser` on a static host. The development server
is not a production host. Keep static-host/proxy access logs free of query strings,
cookies, Authorization headers, and request/response bodies.

Future API integration must not log credentials or store tokens in URLs.
Backend logging setup is in [the orders backend README](../nextTrade-orders/README.md).
