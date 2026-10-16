#!/usr/bin/env python3
"""Validate all Java API docs and refresh the HTML sites linked from README.md."""

from pathlib import Path
import re
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
MODULES = ("insights", "nextTrade-orders", "nextTrade-holdings")


def main():
    maven = shutil.which("mvn")
    if maven is None:
        raise SystemExit("Maven is required: install Maven and add mvn to PATH.")

    # Build every report first so a failed service leaves published snapshots intact.
    for module in MODULES:
        module_root = (ROOT / module).resolve()
        local_report = (module_root / "target/site/apidocs").resolve()
        if not local_report.is_relative_to(module_root / "target"):
            raise SystemExit(f"Refusing to clear a report outside {module_root / 'target'}")
        if local_report.exists():
            shutil.rmtree(local_report)
        subprocess.run(
            [maven, "-B", "-f", str(ROOT / module / "pom.xml"), "javadoc:javadoc"],
            cwd=ROOT,
            check=True,
        )
        report = ROOT / module / "target/site/apidocs/index.html"
        if not report.is_file():
            raise SystemExit(f"Javadoc did not produce the expected report: {report}")

    destination = (ROOT / "docs/javadoc").resolve()
    for module in MODULES:
        target = (destination / module).resolve()
        if target.parent != destination:
            raise SystemExit(f"Refusing to replace a path outside {destination}")
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(
            ROOT / module / "target/site/apidocs",
            target,
            # Maven diagnostic inputs and cache files are not website assets.
            ignore=shutil.ignore_patterns("options", "packages", "argfile", "*.sh", "*.bat"),
        )
    # A successful build from the working tree supersedes the initial snapshot caveat.
    landing_page = destination / "index.html"
    landing_page.write_text(
        re.sub(
            r"    <!-- snapshot-note:start -->.*?<!-- snapshot-note:end -->\n",
            "",
            landing_page.read_text(encoding="utf-8"),
            flags=re.DOTALL,
        ),
        encoding="utf-8",
    )
    print(f"Generated HTML: {destination / 'index.html'}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
