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

Open **http://localhost:4200** after the build finishes.
Keep the terminal open. Press **Ctrl+C** to stop the app.
On later runs, run `npm start` from `frontend`.
Run `npm ci` again if you pull changes to `package-lock.json`.

### Signing in (auth service)

Sign up, sign in, and sign out call the auth service at relative `/auth/...`
paths. `npm start` forwards them to `http://localhost:3000` through
`proxy.conf.json`, so run the auth service locally first (see
`../auth/README.md`). In Docker, nginx proxies `/auth/` the same way. Both keep
requests same-origin, so no CORS setup is needed. Never call the auth
service by absolute URL.

Tokens are held in memory only (`src/app/auth-api.ts`), so reloading the page
signs you out.

### Common problems

- **Missing `package.json`:** run npm commands inside `frontend`.
- **Connection refused:** check that `npm start` is still running.
- **Port already in use:** stop the previous server with **Ctrl+C**.

For backend startup, follow the [orders backend setup guide](../nextTrade-orders/README.md#local-development).

## Production build

```powershell
npm run build
```

The compiled site is written to `dist/nexttrade-angular/browser`.

## Run with Docker

The repository `docker-compose.yml` already defines a `frontend` service that builds from `./frontend`
and publishes the container on `http://localhost:4200`.

```bash
docker compose up --build frontend
```

The container serves the production build with Nginx on port `80`, and Docker maps that to host port `4200`.
Requests sent by the browser to `/api/...` are reverse proxied by Nginx to the `orders` service on the internal Docker Compose network.
Requests sent to `/api/holdings/...` are reverse proxied to the `holdings` service, with the `/api/holdings/` prefix stripped before forwarding.
This lets the Angular app use same-origin relative paths instead of calling service hostnames directly from the browser.

## Main files

- `src/app/app.html`: Angular template
- `src/app/app.scss`: visual design and animations
- `src/app/app.ts`: Angular state, interactions, and chart rendering

The current authentication controls are front-end placeholders. They do not send credentials or connect to a brokerage backend yet.

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
