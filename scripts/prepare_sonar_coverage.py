"""Make service-local LCOV paths unambiguous for a repository-root scan."""

from pathlib import Path
import xml.etree.ElementTree as ET


def normalize_jacoco(report: ET.Element, service: str) -> ET.Element:
    """Qualify package paths so equal Java package names resolve to one service."""
    normalized = ET.fromstring(ET.tostring(report))
    prefix = f"{service}/src/main/java/"
    for package in normalized.findall("package"):
        name = package.get("name", "")
        if not name.startswith(prefix):
            package.set("name", prefix + name)
    return normalized


def normalize_lcov(text: str, service: str, root: Path) -> str:
    lines = []
    for line in text.splitlines():
        if line.startswith("SF:"):
            source = line[3:].replace("\\", "/")
            if source.startswith("/app/"):
                source = source[len("/app/"):]
            if not source.startswith(f"{service}/"):
                source = f"{service}/{source.removeprefix('./')}"
            path = (root / source).resolve()
            if not path.is_relative_to((root / service / "src").resolve()) or not path.is_file():
                raise ValueError(f"Unresolvable LCOV source in {service}: {line[3:]}")
            line = f"SF:{source}"
        lines.append(line)
    return "\n".join(lines) + "\n"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    for service in ("nextTrade-orders", "nextTrade-holdings", "insights"):
        directory = root / service / "target/site/jacoco"
        report = normalize_jacoco(ET.parse(directory / "jacoco.xml").getroot(), service)
        ET.ElementTree(report).write(directory / "sonar-jacoco.xml", encoding="utf-8", xml_declaration=True)
        print(f"Prepared {service}/target/site/jacoco/sonar-jacoco.xml for SonarQube")
    for service in ("auth", "frontend", "insights-frontend", "shared/session-core"):
        report = root / service / "coverage" / "lcov.info"
        normalized = normalize_lcov(report.read_text(encoding="utf-8"), service, root)
        report.write_text(normalized, encoding="utf-8")
        print(f"Prepared {service}/coverage/lcov.info for SonarQube")


if __name__ == "__main__":
    main()
