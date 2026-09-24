# Database Setup Guide

## Overview

The lil-leap platform uses PostgreSQL as its primary database. It's configured to run in Docker for easy setup.

## Starting the Database

### With Docker Compose (Recommended)

From the repository root:

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL container
- Run all initialization scripts
- Load seed data
- Create necessary schemas and roles

### Verify It's Running

```bash
docker-compose ps
```

You should see the PostgreSQL container in the list.

### Check Logs

```bash
docker-compose logs postgres
```

---

## Accessing the Database

### Connection Details

| Parameter | Value |
|-----------|-------|
| **Host** | localhost |
| **Port** | 5432 |
| **Database** | nexttrade |
| **User** | app_user |
| **Password** | (see .env file) |

### Using psql (Command Line)

```bash
psql -h localhost -U app_user -d nexttrade
```

### Connection String

For applications:
```
postgresql://app_user:PASSWORD@localhost:5432/nexttrade
```

---

## Database Schema

The database includes these main tables:

- **instruments** - US equity symbols (AAPL, MSFT, NVDA, AMZN, GOOGL)
- **quotes** - Market data (bid/ask prices)
- **orders** - Customer order records
- **fills** - Order execution records
- **users** - User accounts and authentication
- **order_status_history** - Order lifecycle tracking

### Viewing the Schema

```bash
docker-compose exec postgres psql -U app_user -d nexttrade -c "\dt"
```

---

## Initialization Scripts

Located in `db/`:

- **finalized-schema.sql** - Main schema definition
- **init-app-role.sh** - Creates app_user role
- **seeds/001_us_equity_instruments.sql** - Seed data for stocks

These run automatically when the container starts.

---

## Environment Variables

Create a `.env` file in the repository root:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexttrade
DB_APP_USERNAME=app_user
DB_APP_PASSWORD=your_secure_password
```

Used by:
- Data Pipeline (Python)
- Insights Service (Java)

---

## Running Database Tests

Test scripts in `db/tests/` verify schema and data integrity:

```bash
# Run inside the container
docker-compose exec postgres psql -U app_user -d nexttrade -f /docker-entrypoint-initdb.d/tests/001_schema_verification.sql
```

---

## Stopping the Database

```bash
docker-compose down
```

To also remove data:
```bash
docker-compose down -v
```

---

## Troubleshooting

### Connection Refused

```bash
# Restart the container
docker-compose restart postgres

# Check if port is in use
netstat -an | findstr "5432"
```

### Authentication Failed

```bash
# Check database logs
docker-compose logs postgres

# Verify credentials in .env
```

### Schema Issues

```bash
# Re-initialize database
docker-compose down -v
docker-compose up -d
```

---

## Next Steps

- [Getting Started Guide](./GETTING_STARTED.md) - Set up the full application
- [Architecture Documentation](./architecture/) - Database design decisions

