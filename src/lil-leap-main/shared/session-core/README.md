# Shared session implementation

Private ESM package for the trading and Insights applications. `./core` exports
the auth client and idle keeper without Angular imports. `./angular` exports URL
state, the coordinator, guards, and the `SESSION_AUTH` injection token used by
the interceptor. App adapters supply their existing AuthService, allowed return
URLs and required role. Storage keys and route tables stay app-specific.

`./angular` also exports `ApiHttpClient`, the shared typed GET/POST wrapper for
business services (NEXT-153/NEXT-163). It delegates to Angular `HttpClient`, so
both apps use the registered interceptor for all business API requests. Only
same-origin `/api/` calls receive the current JWT. Identity calls, static assets,
and external URLs receive no automatically added token. Business clients keep
their domain validation and error messages; they do not attach tokens or handle
session invalidation themselves.

An API 401 invalidates the token captured for that request before domain error
handling. The coordinator clears the session and redirects to login with a safe
return destination. Older requests cannot invalidate a newer session, and no
requests are automatically replayed. Guards check readiness, app role, inactivity,
and finite future token expiry. The NestJS service remains responsible for JWT
signature verification.

From the repository root:

```sh
npm ci --prefix shared/session-core
npm run build --prefix shared/session-core
npm run test:coverage --prefix shared/session-core
npm ci --prefix frontend
npm ci --prefix insights-frontend
```

The Angular compiler emits ESM, declarations and source maps with partial
compilation configured. Angular dependencies are peers. Consumers install local
package copies (`install-links=true`) to use their own Angular runtime. Rebuild
and reinstall consumers when shared sources change. Generated output is ignored.

Contract tests exercise shared sources; consumer tests verify their adapters and
routes. Sonar analyzes shared sources and imports this package's LCOV once.
Session behavior, persisted record version and storage keys remain compatible
with NEXT-220; no stored-session migration is needed.
