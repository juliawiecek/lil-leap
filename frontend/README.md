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
this repository. Each teammate must set up HTTPS on their own computer.

### Windows: first-time setup

Install **Git for Windows** in its default location, then open PowerShell in the
project folder (`lil-leap`).

**1. Set up HTTPS:**

```powershell
.\scripts\setup-local-tls.ps1
```

Click **Yes** when Windows asks to trust the localhost certificate. Wait for the
script to finish.

**2. Start the frontend:**

```powershell
cd frontend
npm ci
npm start
```

**3. Open https://localhost:4200** after the build finishes.
Keep the terminal open. Press **Ctrl+C** to stop the app.

### Windows: next time

Open a terminal in `frontend` and run:

```powershell
npm start
```

Run `npm ci` again if you pull changes to `package-lock.json`.

### Common problems

- **Missing `package.json`:** run npm commands inside `frontend`.
- **Empty response:** use **https://localhost:4200**, including `https://`.
- **Certificate warning on Windows:** rerun the setup script, click **Yes**, then
  restart the frontend and browser.
- **Connection refused:** check that `npm start` is still running.
- **Port already in use:** stop the previous server with **Ctrl+C**.
- **Certificate expired on Windows:** certificates last 90 days. Rename
  `%LOCALAPPDATA%\NextTrade\tls` to a backup folder, rerun setup from the project
  root, then restart the services.

For backend HTTPS, follow the [backend setup guide](../backend/README.md#windows-trusted-localhost-certificate).
A shared public website needs a domain and a publicly trusted certificate;
this setup is for local development.

## Production build

```powershell
npm run build
```

The compiled site is written to `dist/nexttrade-angular/browser`.

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
