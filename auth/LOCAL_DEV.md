# Auth (NestJS) — Local Development

## Local `.env`
Create `auth/.env` with:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexttrade
DB_APP_USERNAME=app_user
DB_APP_PASSWORD=my_app_password

APP_JWT_SECRET=nexttrade-shared-dev-secret-32bytes-min
APP_JWT_EXPIRATION_MINUTES=10
APP_JWT_CLIENT_ID=nexttrade-web
SESSION_INACTIVITY_MINUTES=10
NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY=my-ssn-encryption-key-dev-only

PORT=8081
```

You can copy `auth/.env.example` to `auth/.env` and use it as the local template.

## Run
```cmd
cd auth
npm ci
npm run start:dev
```

## Verify
- Health: `http://localhost:8081/health`
- Swagger: `http://localhost:8081/auth/docs`


