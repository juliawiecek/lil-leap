"""Make service-local LCOV paths unambiguous for a repository-root scan."""

from pathlib import Path


def normalize_lcov(text: str, service: str, root: Path) -> str:
    lines = []
    for line in text.splitlines():
        if line.startswith("SF:"):
            source = line[3:].replace("\\", "/")
            if source.startswith("/app/"):
                source = source[len("/app/"):]
            if not Path(source).is_absolute() and not source.startswith((f"{service}/", "frontend-shared/")):
                source = f"{service}/{source.removeprefix('./')}"
            path = (root / source).resolve()
            allowed = [(root / service / "src").resolve()]
            if service in ("frontend", "insights-frontend"):
                allowed.append((root / "frontend-shared").resolve())
            if not any(path.is_relative_to(directory) for directory in allowed) or not path.is_file():
                raise ValueError(f"Unresolvable LCOV source in {service}: {line[3:]}")
            line = f"SF:{path.relative_to(root.resolve()).as_posix()}"
        lines.append(line)
    return "\n".join(lines) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for service in ("auth", "frontend", "insights-frontend"):
        report = root / service / "coverage" / "lcov.info"
        normalized = normalize_lcov(report.read_text(encoding="utf-8"), service, root)
        report.write_text(normalized, encoding="utf-8")
        print(f"Prepared {service}/coverage/lcov.info for SonarQube")


if __name__ == "__main__":
    main()
