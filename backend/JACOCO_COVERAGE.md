# Backend JaCoCo Coverage

This project uses JaCoCo to measure test execution coverage for the Spring Boot backend only.

## Generate the report locally

From the repository root:

```bash
cd backend
mvn clean verify
```

The `verify` lifecycle runs the existing test suite and then generates:

- `target/site/jacoco/index.html`
- `target/site/jacoco/jacoco.xml`
- `target/site/jacoco/jacoco.csv`

JaCoCo output stays under Maven's ignored `target/` directory and must not be committed.

## Open the HTML report

From Git Bash while inside `backend/`:

```bash
start target/site/jacoco/index.html
```

From PowerShell at the repository root:

```powershell
Start-Process .\backend\target\site\jacoco\index.html
```

## Jenkins behavior

Jenkins runs `mvn clean verify` in the existing Maven Java 21 container, archives the complete JaCoCo HTML directory (including `jacoco.xml` and `jacoco.csv`), and attempts to publish `index.html` through the optional HTML Publisher plugin. If that plugin is unavailable, the build continues and the archived artifacts remain downloadable.

## What the metrics mean

- **Instruction coverage**: JVM bytecode instructions executed by tests.
- **Branch coverage**: decision outcomes exercised, such as both true and false paths.
- **Line coverage**: source lines executed by tests.
- **Method and class coverage**: methods and classes reached by tests.

Coverage shows which code was executed. It does not prove that assertions are correct, business rules are complete, security is sufficient, or the application is defect-free. This initial change reports the baseline and intentionally adds no guessed failure threshold.
