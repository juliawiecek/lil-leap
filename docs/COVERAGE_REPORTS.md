# Test Coverage Reports

View interactive code coverage reports for Python and Java components.

## 📊 Quick Links

| Language | Coverage | Tests | Report |
|----------|----------|-------|--------|
| **Python** | 79.67% | 72 passing ✓ | [`coverage-reports/python/index.html`](../coverage-reports/python/index.html) |
| **Java** | 77.79% | 320 passing ✓ | [`coverage-reports/java/index.html`](../coverage-reports/java/index.html) |

---

## 🔍 How to View

**Option 1: Direct (Easiest)**
- Navigate to `coverage-reports/` folder
- Double-click `python/index.html` or `java/index.html`

**Option 2: PowerShell**
```powershell
cd coverage-reports
Start-Process ./python/index.html
Start-Process ./java/index.html
```

---

## 📝 Summary

- **Python (data-pipeline)**: 79.67% coverage with 8/10 modules at 85%+
- **Java (insights)**: 77.79% coverage with 66/99 classes at 85%+
- **Total**: 392 tests, all passing
- Reports include per-module/class breakdowns and uncovered line details

See [`coverage-reports/SUMMARY.txt`](../coverage-reports/SUMMARY.txt) for detailed metrics.

---

## 📁 Files in coverage-reports/

- **python/** - Pytest HTML coverage report
- **java/** - JaCoCo HTML coverage report
- **SUMMARY.txt** - Quick metrics reference
- **pytest_output.txt** - Python test execution log
