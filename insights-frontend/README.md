 b# NextTrade Angular

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

Then open `http://localhost:4200`.

## Production build

```bash
npm run build
```

The compiled site is written to `dist/nexttrade-angular/browser`.

## Run with Docker

The repository `docker-compose.yml` already defines a `frontend` service that builds from `./frontend`
and publishes the container on `http://localhost:4200`.

```bash
ecause docker compose up --build insights-frontend
```

The container serves the production build with Nginx on port `80`, and Docker maps that to host port `4201`.
Requests sent by the browser to `/api/...` are reverse proxied by Nginx to the `insights` service on the internal Docker Compose network, so the Angular app can use relative paths instead of calling `http://insights:8080` directly from the browser.

## Main files

- `src/app/app.html`: Angular template
- `src/app/app.scss`: visual design and animations
- `src/app/app.ts`: Angular state, interactions, and chart rendering

The current authentication controls are front-end placeholders. They do not send credentials or connect to a brokerage backend yet.
