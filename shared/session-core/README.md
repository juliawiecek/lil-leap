# Shared session implementation

Private ESM package for the trading and Insights applications. `./core` exports
the auth client and idle keeper without Angular imports. `./angular` exports URL
state, the coordinator, guards, and the `SESSION_AUTH` injection token used by
the interceptor. App adapters supply their existing AuthService, allowed return
URLs and required role. Storage keys and route tables stay app-specific.

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
