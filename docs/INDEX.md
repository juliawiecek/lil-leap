# Project Documentation Index

Navigate the NextTrade project documentation using the links below.

---

## Getting Started (START HERE)

**New team members or running the project locally?**

- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Complete setup guide
  - Prerequisites & dependencies
  - Database startup with Docker
  - Python environment setup
  - Java build & test commands
  - Frontend development server
  - Service port reference

---

## Test Coverage & Quality

**View test execution reports:**

- **[coverage/README.md](coverage/README.md)** - Code coverage for every service
  - JaCoCo, Jest, pytest-cov and c8 commands and report locations
  - Latest coverage figures

---

## Operations & Database

**Database setup, schema details, and production hardening:**

- **[DATABASE_SETUP.md](DATABASE_SETUP.md)** - PostgreSQL configuration
  - Connection details
  - Docker initialization
  - Schema overview
  - Access methods (psql, connection strings)
  - Troubleshooting

- **[RUN_DATABASE_HARDENING.md](RUN_DATABASE_HARDENING.md)** - Production hardening procedures

---

## API Documentation

**Browse and try the service APIs in Swagger UI:**

- **[api/README.md](api/README.md)** - Swagger pages per service
  - Auth and orders Swagger UI links
  - Getting a token and authorizing
  - SSH tunnel for the EC2 server

---

## Architecture & Design

**System design, decisions, and documentation:**

- **[architecture/](architecture/)** - Architecture Decision Records
  - ADR: Quote storage and retrieval patterns
  - [TS-10.1: Atomic settlement](architecture/ADR-TS-10.1-atomic-settlement.md) - Decision and seven-operation comparison
  - System design notes

- **[../insights/README.md](../insights/README.md)** - Insights Service architecture
- **[../nextTrade-orders/README.md](../nextTrade-orders/README.md)** - Orders Service architecture
- **[../auth/README.md](../auth/README.md)** - Identity Service architecture

---

## Release & Deployment

**Runner scripts and release documentation:**

- **[RUN_NEXT_88.md](RUN_NEXT_88.md)** - NEXT 88 deployment guide
- **[RUN_NEXT_97.md](RUN_NEXT_97.md)** - NEXT 97 deployment guide
- **[README_NEXT_97.md](README_NEXT_97.md)** - NEXT 97 technical details
- **[README_BUNDLE.md](README_BUNDLE.md)** - Build bundle documentation

---

## Sprint Planning & Stories

**Sprint boards and story tracking:**

- **[stories/](stories/)** - Sprint planning documents
  - NEXT-95 through NEXT-145
  - User story details and acceptance criteria

---

## Quick Directory Reference

| Folder | Purpose |
|--------|---------|
| **docs/** | Documentation (current location) |
| **coverage-reports/** | Test coverage reports & metrics |
| **auth/** | NestJS Identity Service |
| **insights/** | Spring Boot reporting & backend |
| **nextTrade-orders/** | Spring Boot order service |
| **nextTrade-holdings/** | Spring Boot holdings service |
| **frontend/** | Angular trading UI |
| **insights-frontend/** | Angular reporting UI |
| **data-pipeline/** | Python quote generation & ingestion |
| **db/** | PostgreSQL schemas & migrations |

---

## External References

- Project: NextTrade, built by team Lil Leap
- Repository: GitHub (private)
- Team Lead: Kevin Marin

---

**Last Updated:** September 24, 2026  
**Status:** Active Development
