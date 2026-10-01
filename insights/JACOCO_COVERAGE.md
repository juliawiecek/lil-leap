# Insights coverage

Run `mvn clean verify` from `insights`, then open `target/site/jacoco/index.html`.
Insights now tests reporting access boundaries and JWT/logging behavior. Trading,
portfolio and instrument tests moved to their owning services. Old percentages
from the combined backend no longer describe this module.
