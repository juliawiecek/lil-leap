# Lab 15 Model Answers

## Verified Output

### Part 1 — OpenAPI

```bash
npm run build && npm start
curl -s http://localhost:3000/api-json | python3 -c "import json,sys; d=json.load(sys.stdin); print(list(d['paths'].keys())); print(d['info']['title'])"
```
```
['/auth/register', '/auth/login']
Sprint 8 Auth Service
```

`GET /health` does not appear - `@ApiExcludeController()` on `HealthController` keeps it
out of the document, exactly as intended.

```bash
curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"mission123"}'
```
```
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"dd3b03f97a1a749c..."}
```

### Part 2 — Integration, against a real Postgres and a real, unmodified Sprint 6
mission service (Module 13's actual solution)

`integration-test.sh`'s container-build step needs a first-time Maven dependency pull
that was too slow to finish in this authoring sandbox. The verification below runs the
exact same jar and the exact same auth service directly instead - same code, same
`sprint6-postgres` container, same claim proven; only the container-wrapping step
differs from what `integration-test.sh` automates.

```bash
# No token -> 401 (SecurityConfig, Sprint 6 Module 9, untouched)
401

# Real login against the NEW auth service
{"accessToken":"eyJhbGciOiJIUzI1NiIs...","refreshToken":"dd3b03f97a1a749c..."}

# That token, submitted to the mission service
{"status":"ACCEPTED","fee":0.04,"newHoldingQuantity":501.0}

# Confirmed directly in Postgres
 account_id | ticker | quantity
------------+--------+----------
          1 | ULVR.L |  501.0000
(1 row)
```

## Key Points

- **TODO 1-3 (OpenAPI)**: `@ApiProperty`, `@ApiTags`, `@ApiOperation`, and
  `@ApiResponse` are pure metadata - `class-validator`'s `@IsString`/`@MinLength` still
  do the actual runtime validation Module 10 built. The two decorator families read
  each field/route independently; neither one knows the other exists.
- **TODO 4 (wait-for-ready)**: the auth service's `/health` responds the moment Nest
  finishes bootstrapping; the mission service takes longer (Postgres connection pool,
  MyBatis mapper scanning), which is why it's polled with an actual `POST
  /accounts/1/orders` rather than a lighter endpoint - there's no dedicated `/health`
  on the mission service in this sprint, so the real route doubles as the readiness
  check.
- **TODO 5 (401 smoke test)**: this is the mission service's `SecurityConfig` from
  Sprint 6, Module 9, completely unmodified - it doesn't know or care that the token
  issuer changed.
- **TODO 6 (end-to-end)**: `newHoldingQuantity: 501.0` is the real proof, not just the
  `200` status code - ULVR.L's holding for account 1 started at 500 (Sprint 3's seed
  data) and the order was for quantity 1.
- **TODO 7 (Postgres confirmation)**: the HTTP response could theoretically lie (a bug
  that returns `ACCEPTED` without actually writing); querying Postgres directly is what
  makes this an END-to-end test rather than a test of the HTTP layer alone.

## Why This Is the Right Note to End Sprint 8 On

Every earlier module in this sprint built one piece of `sprint8-auth-service` in
isolation - JavaScript and TypeScript fundamentals (Days 1-2), NestJS structure
(Module 9), DTOs (Module 10), the skeleton (Module 11), password hashing (Module 12),
JWTs (Module 13), a lightweight security-and-testing pass (Module 14). None of those
modules touched the mission service at all. This lab is the first (and only) point
where the two sides of the mission brief's "What Changes, and What Doesn't" actually
meet - and the mission service's total line count changed by zero.
