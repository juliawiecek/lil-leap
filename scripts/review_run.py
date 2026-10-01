#!/usr/bin/env python3
"""Capture a reproducible PO check, its UTC timestamps, exit status and source hash."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def source_hash():
    """Hash tracked source/config, excluding generated documentation and evidence."""
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    digest = hashlib.sha256()
    for name in sorted(filter(None, names)):
        if name.startswith(("docs/javadoc/", "docs/review/", "coverage-reports/")):
            continue
        path = ROOT / name
        if path.is_file():
            digest.update(name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name")
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command
    if command and command[0] == "--":
        command = command[1:]
    if not command or Path(args.name).name != args.name:
        parser.error("provide a simple check name and command after --")
    output = ROOT / "docs/review/runs"
    output.mkdir(parents=True, exist_ok=True)
    record = {
        "command": command, "cwd": args.cwd,
        "started_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "git_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
        "source_sha256": source_hash(),
        "output": f"docs/review/runs/{args.name}.txt",
        "environment_keys": [key for key in ("JAVA_HOME", "TEST_POSTGRES_URL", "TEST_POSTGRES_USER", "TEST_POSTGRES_PASSWORD") if key in os.environ],
    }
    executable = shutil.which(command[0]) or command[0]
    with (output / f"{args.name}.txt").open("w", encoding="utf-8") as log:
        try:
            result = subprocess.run([executable, *command[1:]], cwd=ROOT / args.cwd,
                                    stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout)
            record["exit_code"] = result.returncode
        except (OSError, subprocess.TimeoutExpired) as error:
            log.write(str(error) + "\n")
            record["exit_code"] = 124 if isinstance(error, subprocess.TimeoutExpired) else 127
    record["finished_utc"] = dt.datetime.now(dt.timezone.utc).isoformat()
    (output / f"{args.name}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2))
    return record["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
