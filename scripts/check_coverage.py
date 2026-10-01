#!/usr/bin/env python3
"""Fail closed unless every scored component has at least 60% line coverage.

Run after fresh test suites. This validates report contents, not report freshness;
the review runner and CI must generate reports in the same execution first.
"""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def main():
    results = []
    for module in ("nextTrade-orders", "nextTrade-holdings", "insights", "frontend", "insights-frontend", "auth", "data-pipeline"):
        try:
            if module.startswith("nextTrade-") or module == "insights":
                report = ROOT / module / "target/site/jacoco/jacoco.xml"
                counter = ET.parse(report).getroot().find("counter[@type='LINE']")
                covered = int(counter.attrib["covered"])
                total = covered + int(counter.attrib["missed"])
            elif module == "data-pipeline":
                report = ROOT / module / "coverage.xml"
                root = ET.parse(report).getroot()
                covered, total = int(root.attrib["lines-covered"]), int(root.attrib["lines-valid"])
            else:
                report = ROOT / module / "coverage/lcov.info"
                records = report.read_text(encoding="utf-8").splitlines()
                covered = sum(int(line[3:]) for line in records if line.startswith("LH:"))
                total = sum(int(line[3:]) for line in records if line.startswith("LF:"))
            percentage = 100 * covered / total
            results.append({"component": module, "covered": covered, "total": total,
                            "line_percent": round(percentage, 2), "pass": percentage >= 60,
                            "report": str(report.relative_to(ROOT)).replace("\\", "/")})
        except (OSError, ValueError, AttributeError, ET.ParseError, KeyError, ZeroDivisionError) as error:
            results.append({"component": module, "pass": False, "error": str(error)})
    print(json.dumps(results, indent=2))
    return 0 if all(row["pass"] for row in results) else 1


if __name__ == "__main__":
    sys.exit(main())
