# 📚 Documentation Organization Guide

Quick reference for the project structure and documentation.

---

## 🎯 Quick Reference

### Test Coverage (Quick Access)
**Path**: `docs/COVERAGE_REPORTS.md` or `coverage-reports/` folder

Simply open these HTML files in any browser:
- **Python Tests**: `coverage-reports/python/index.html`
  - 79.67% coverage
  - 72 tests (all passing ✓)
  
- **Java Tests**: `coverage-reports/java/index.html`
  - 77.79% coverage
  - 320 tests (all passing ✓)

**Alternative**: View `coverage-reports/SUMMARY.txt` for quick metrics
**Read more**: [docs/COVERAGE_REPORTS.md](COVERAGE_REPORTS.md)

---

### Project Setup & Database
**Path**: `docs/`

- **New users**: Start with [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)
- **Database questions**: See [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)
- **Navigate everything**: Check [docs/INDEX.md](docs/INDEX.md)

---

## 🗂️ Documentation Structure

```
repository-root/
│
├── README.md                      ← Main project README (START HERE)
│
├── docs/                          ← All project documentation
│   ├── INDEX.md                   ← Documentation navigation
│   ├── GETTING_STARTED.md         ← Setup guide
│   ├── DATABASE_SETUP.md          ← Database configuration
│   ├── architecture/              ← Architecture Decision Records
│   └── stories/                   ← Sprint planning documents
│
└── coverage-reports/              ← Test coverage reports
    ├── python/index.html          ← Python coverage (open this!)
    ├── java/index.html            ← Java coverage (open this!)
    ├── pytest_output.txt           ← Python test output
    ├── README.md                   ← Coverage instructions
    └── SUMMARY.txt                 ← Coverage metrics summary
```

---

## ✅ What Was Organized

### Created
- ✅ `docs/GETTING_STARTED.md` - Complete setup guide
- ✅ `docs/DATABASE_SETUP.md` - Database & Docker configuration
- ✅ `docs/INDEX.md` - Documentation index/navigation
- ✅ `coverage-reports/README.md` - Coverage report instructions (simplified)

### Updated
- ✅ `README.md` - Added "Quick Start" section with doc references

### Moved
- ✅ `pytest_output.txt` → `coverage-reports/pytest_output.txt`

### Already Existed
- ✅ `coverage-reports/` - Contains HTML reports for Python & Java
- ✅ `docs/architecture/` - Architecture notes
- ✅ `docs/stories/` - Sprint planning documents

---

## 🚀 Getting Started

### Step 1: Review Coverage
1. Open `coverage-reports/python/index.html`
2. Open `coverage-reports/java/index.html`
3. Verify test counts: Python (72), Java (320)
4. Check coverage percentages: Python (79.67%), Java (77.79%)

### Step 2: Verify Setup
1. Read `docs/GETTING_STARTED.md` for full setup
2. Follow the quick start commands
3. Run `docker-compose up -d` to start the database
4. Verify each service is running on its port

### Step 3: Running Tests (Optional)
```bash
# Python tests
cd data-pipeline
pytest -v --cov=src

# Java tests
cd insights
mvn clean test
```

---

## 📊 Summary

| Resource | Location | Purpose |
|----------|----------|---------|
| **Coverage Reports** | `coverage-reports/` | HTML test coverage dashboards |
| **Getting Started** | `docs/GETTING_STARTED.md` | Local setup instructions |
| **Database Setup** | `docs/DATABASE_SETUP.md` | PostgreSQL configuration |
| **Main README** | `README.md` | Project overview & architecture |
| **Architecture** | `docs/architecture/` | Design decisions |
| **Planning** | `docs/stories/` | Sprint documentation |

---

**All documentation is organized in one clean structure for easy assessment!** ✨
