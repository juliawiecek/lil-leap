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

```bash
npm install
npm start
```

Then open `https://localhost:4200`. The development server uses TLS by default.
For a locally trusted certificate, use
`npm start -- --ssl-cert /path/to/localhost.crt --ssl-key /path/to/localhost.key`.
Without supplied files, the Angular CLI generates a development certificate that
must be trusted locally. Keep private keys outside version control.

## Production build

```bash
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
Requests sent by the browser to `/api/...` are reverse proxied by Nginx to the `app` service on the internal Docker Compose network, so the Angular app can use relative paths instead of calling `http://app:8080` directly from the browser.

## Main files

- `src/app/app.html`: Angular template
- `src/app/app.scss`: visual design and animations
- `src/app/app.ts`: Angular state, interactions, and chart rendering

The current authentication controls are front-end placeholders. They do not send credentials or connect to a brokerage backend yet.

## TS-02.4 security controls

The application only bootstraps on HTTPS. On HTTP it displays a secure-connection
notice before mounting any credential form. Bootstrap and Angular/global runtime
errors log fixed event messages, never raw errors, stacks, HTTP payloads, or form data.

Run `npm test` (Node 24+, or Node 22.18+) for HTTP/HTTPS bootstrap and secret-bearing
error tests, then `npm run build` for the production compilation check.

Deploy `dist/nexttrade-angular/browser` on a TLS-only static host with TLS 1.2/1.3.
The development server is not a production host. Configure HSTS, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a CSP appropriate
for Angular at that host. Do not serve credential pages over HTTP; the bootstrap
guard is defense in depth. Keep static-host/proxy access logs free of query strings,
cookies, Authorization headers, and request/response bodies.

Future API integration must use HTTPS URLs and must not log credentials or store
tokens in URLs. Backend certificate and logging setup is in [backend/README.md](../backend/README.md).
