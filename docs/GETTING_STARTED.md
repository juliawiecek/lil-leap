# Getting Started

Welcome to the lil-leap (NextTrade Platform) project! This guide will help you get up and running quickly.

## 📋 Prerequisites

- **Python 3.12+** (for data-pipeline)
- **Java 17+** (for insights service)
- **Maven 3.8+** (for building Java projects)
- **Docker & Docker Compose** (for database)
- **PostgreSQL** (runs in Docker)

## 🚀 Quick Start

### 1. Start the Database

```bash
docker-compose up -d
```

This starts PostgreSQL with all necessary schemas and seed data.

**Verify it's running:**
```bash
docker-compose ps
```

### 2. Set Up Python Environment (Data Pipeline)

```bash
cd data-pipeline

# Create virtual environment
python -m venv venv

# Activate it
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pip install -r requirements-coverage.txt
pytest -v
```

### 3. Build & Test Java Backend (Insights Service)

```bash
cd insights

# Build and run tests
mvn clean test

# Start the application
mvn spring-boot:run
```

This starts the Spring Boot backend on `http://localhost:8080`

### 4. Start the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm start
```

Frontend will be available at `http://localhost:4200`

---

## 📊 Viewing Test Coverage

Test coverage reports are in the `coverage-reports/` folder:

- **Python Coverage**: `coverage-reports/python/index.html`
- **Java Coverage**: `coverage-reports/java/index.html`

Both are interactive HTML reports showing line-by-line coverage.

---

## 🛠️ Development

### Running Tests with Coverage

**Python:**
```bash
cd data-pipeline
pytest -v --cov=src --cov-report=html
# Report: htmlcov/index.html
```

**Java:**
```bash
cd insights
mvn clean test
# Report: target/site/jacoco/index.html
```

### Key Services

| Service | Port | Command |
|---------|------|---------|
| Frontend (Angular) | 4200 | `cd frontend && npm start` |
| Backend (Spring) | 8080 | `cd insights && mvn spring-boot:run` |
| Database (PostgreSQL) | 5432 | `docker-compose up` |
| Data Pipeline | N/A | `cd data-pipeline && python -m src.service_runner --continuous` |

---

## 📁 Project Structure

```
lil-leap/
├── auth/                    # Authentication service (NestJS)
├── data-pipeline/           # Python data ingestion service
├── db/                      # Database schemas & migrations
├── docs/                    # Documentation (you are here)
├── frontend/                # Angular UI
├── insights/                # Java Spring Boot backend
├── coverage-reports/        # Test coverage reports
└── docker-compose.yml       # Docker setup
```

---

## ❓ Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart services
docker-compose restart
```

### Python Dependency Issues

```bash
# Clear pip cache and reinstall
pip install --upgrade pip
pip install --force-reinstall -r requirements.txt
```

### Java Build Errors

```bash
# Clear Maven cache
mvn clean
mvn install

# Update dependencies
mvn dependency:resolve
```

---

## 📚 More Documentation

- [Database Setup](./DATABASE_SETUP.md) - Schema details and migrations
- [Architecture](./architecture/ADR-quote-storage-and-retrieval.md) - Design decisions
- [Coverage Reports](../coverage-reports/) - Test coverage details

---

**Questions?** Check the main README.md at the repository root.
