# API documentation

Identity, Orders, Holdings and Insights generate Swagger/OpenAPI documentation from
their current controllers. Java APIs use the `/api/v1` servlet context exactly once.

| Service | Swagger UI | OpenAPI JSON |
| --- | --- | --- |
| Identity through the shared gateway | http://localhost:4200/auth/docs | http://localhost:4200/auth/docs-json |
| Holdings, when running natively | http://localhost:8080/api/v1/swagger-ui.html | http://localhost:8080/api/v1/v3/api-docs |
| Orders, when running natively | http://localhost:8082/api/v1/swagger-ui.html | http://localhost:8082/api/v1/v3/api-docs |
| Insights, when running natively | http://localhost:8084/api/v1/swagger-ui.html | http://localhost:8084/api/v1/v3/api-docs |

The Java URLs are direct development endpoints. Base Compose publishes only the
shared gateway, so those Java ports are not accessible on the Docker host by default.
Java Swagger pages are not routed through the gateway. See the service READMEs and
[setup guide](../GETTING_STARTED.md) for native/database configuration. Insights
requires its reporting replica and restricted reporting credentials.

To try protected endpoints, log in through Identity's `POST /auth/login`, copy the
access token, and paste it into the relevant Swagger page's **Authorize** dialog.
The Java documentation routes are public; business routes still enforce JWT roles
and ownership. Use a trader token for submission/history and an analyst token for
Insights reports. Token expiry returns `401`; authenticate again.

| Gateway endpoint | Owner | Behavior |
| --- | --- | --- |
| `POST /api/v1/orders` | Orders | Validated, idempotent submission; initially SUBMITTED, then accepted and executed by the worker |
| `GET /api/v1/clients/{id}/orders` | Holdings | Trader-owned history with inclusive UTC date and status filters |
| `GET /api/v1/clients/{id}/cash` | Holdings | Caller-owned cash balance |
| `GET /api/v1/clients/{id}/portfolio-summary` | Holdings | Positions, settled/pending/available cash and portfolio value for the caller's first account by ID |
| `GET /api/v1/quotes/latest/by-instrument/{id}` | Holdings | Stored quote display API |
| `GET /api/v1/reports/summary` on port 4201 | Insights | Analyst-only replica-backed summary |

Portfolio totals include all ledger cash; active holds reduce available cash but do
not reduce portfolio value. The current worker settles immediately. Cash-hold
creation/release and delayed settlement processing are not implemented.

## Remote access

For a Compose stack on another machine, forward the gateway ports:

```sh
ssh -L 4200:localhost:4200 -L 4201:localhost:4201 <user>@<server-host>
```

Keep the SSH session open and use the local gateway URLs. Forwarding a Java port
only works if a native service or an explicit loopback Docker port mapping exists
on that host; SSH does not expose unpublished container ports automatically.

Identity also has a committed [OpenAPI specification](../../auth/openapi.json).
