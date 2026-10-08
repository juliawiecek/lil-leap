# Quick Start: Run NextTrade Locally (No Docker)

This is a TL;DR version of `LOCAL_SETUP.md`. Follow these steps to get the stack running in ~20 minutes.

## One-Time Setup (30 minutes)

### 1. Install Prerequisites
- PostgreSQL 16: https://www.postgresql.org/download/windows/
- Java 17+: https://adoptium.net/
- Maven 3.9+: https://maven.apache.org/ (or `choco install maven`)
- Node.js 24.x: https://nodejs.org/
- Python 3.12+: https://www.python.org/downloads/windows/

### 2. Set Up Database
From the repository root:

```cmd
psql -h localhost -p 5432 -U postgres -d postgres -f db\setup-local.sql
```

This single script creates the local roles, creates the `nexttrade` database if needed, loads the schema, seeds instrument data, and applies the app permissions.

### 3. Create Per-Service Local Config Where Needed

Create these files from their examples:

- `auth/.env` from `auth/.env.example`
- `data-pipeline/.env` from `data-pipeline/.env.example`

Spring Boot services use committed local profile files instead of `.env` files:

- `nextTrade-orders/src/main/resources/application-local.yml`
- `nextTrade-holdings/src/main/resources/application-local.yml`
- `insights/src/main/resources/application-local.yml`

### 4. Verify Proxy Configs
Two files need to be updated (they already exist, just need verification):

**`frontend/proxy.conf.json`:**
```json
{
  "/auth/**": { "target": "http://localhost:8081", "secure": false },
  "/rules/**": { "target": "http://localhost:8081", "secure": false },
  "/api/v1/orders": { "target": "http://localhost:8082", "secure": false },
  "/api/v1/accounts": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/instruments": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/clients/**": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/quotes/latest/**": { "target": "http://localhost:8080", "secure": false },
  "/api/v1/quotes/history/**": { "target": "http://localhost:8080", "secure": false }
}
```

**`insights-frontend/proxy.conf.json`:**
```json
{
  "/auth/**": { "target": "http://localhost:8081", "secure": false },
  "/rules/**": { "target": "http://localhost:8081", "secure": false },
  "/api/**": { "target": "http://localhost:8084", "secure": false }
}
```

---

## Each Development Session (5 minutes)

Open **7 terminals** from the repository root and run these commands in order:

### Terminal 1: Auth Service
```cmd
cd auth
npm ci
npm run start:dev
```
**Ready when:** Port 8081 prints "Nest application successfully started"

### Terminal 2: Orders Service
```cmd
cd nextTrade-orders
mvn spring-boot:run '-Dspring.profiles.active=local'
```
**Ready when:** "Tomcat started on port(s): 8082"

### Terminal 3: Holdings Service
```cmd
cd nextTrade-holdings
mvn spring-boot:run '-Dspring.profiles.active=local'
```
**Ready when:** "Tomcat started on port(s): 8080"

### Terminal 4: Insights Service
```cmd
cd insights
mvn spring-boot:run '-Dspring.profiles.active=local'
```
**Ready when:** "Tomcat started on port(s): 8084"

### Terminal 5: Data Pipeline
```cmd
cd data-pipeline
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m src.service_runner
```
**Ready when:** "Generating and ingesting synthetic quotes continuously"

### Terminal 6: Frontend
```cmd
cd frontend
npm ci
npm start
```
**Ready when:** "Angular Live Development Server is listening on localhost:4300"

### Terminal 7: Insights Frontend
```cmd
cd insights-frontend
npm ci
npm start
```
**Ready when:** "Angular Live Development Server is listening on localhost:4301"

---

## Access the Apps

- **Trading Frontend:** http://localhost:4300
- **Reporting Frontend:** http://localhost:4301
- **Auth Health:** http://localhost:8081/health
- **Auth Swagger:** http://localhost:8081/auth/docs
- **Orders Swagger:** http://localhost:8082/api/v1/swagger-ui.html
- **Holdings Swagger:** http://localhost:8080/api/v1/swagger-ui.html
- **Insights Swagger:** http://localhost:8084/api/v1/swagger-ui.html

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `psql: command not found` | PostgreSQL not installed or not in PATH; run installer again |
| `Connection refused` | PostgreSQL not running; start it: `net start PostgreSQL16` |
| `FATAL: database "nexttrade" does not exist` | Run `psql -h localhost -p 5432 -U postgres -d postgres -f db\setup-local.sql` |
| `Port already in use` | Kill process using port: `netstat -ano \| findstr :<PORT>` then `taskkill /PID <PID> /F` |
| `npm: command not found` | Node.js not installed; download from https://nodejs.org/ |
| `java: command not found` | Java not installed; download from https://adoptium.net/ |
| `mvn: command not found` | Maven not installed; download from https://maven.apache.org/ |
| `python: command not found` | Python not installed; download from https://www.python.org/downloads/windows/ |

---

## Full Setup Guide

For detailed explanations, see:
- [`LOCAL_SETUP.md`](LOCAL_SETUP.md) — Complete setup with explanations
- Individual service READMEs:
  - [`auth/README.md`](auth/README.md)
  - [`nextTrade-orders/README.md`](nextTrade-orders/README.md)
  - [`insights/README.md`](insights/README.md)
  - [`frontend/README.md`](frontend/README.md)

---

## Key Concepts

- **No Docker:** All services run natively on your Windows machine
- **Local Ports:** Each service has its own port (8080–8084 for backends, 4300–4301 for frontends)
- **Shared Database:** All services connect to the same PostgreSQL on localhost:5432
- **Shared JWT Secret:** Services must use the same local JWT secret value across `auth/.env` and the Spring local profile files
- **Per-Service Local Config:** `auth` and `data-pipeline` use `.env`; Spring Boot services use `application-local.yml`
- **No Global Setup Scripts:** Start each service directly from its own folder

---

## Next Steps

1. Go through one-time setup (above)
2. Open 7 terminals and follow "Each Development Session" commands
3. Test at http://localhost:4300
4. Happy coding!

Questions? See `LOCAL_SETUP.md` for detailed setup and troubleshooting.




