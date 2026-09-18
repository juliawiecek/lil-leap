"""Run continuous ingestion and the Flask API with coordinated shutdown."""
from __future__ import annotations
import signal
import subprocess
import sys
import time


def main() -> int:
    children = [
        subprocess.Popen([sys.executable, "-m", "src.quote_ingestor", "--continuous"]),
        subprocess.Popen([sys.executable, "-m", "src.app"]),
    ]
    stopping = False

    def stop(signum, _frame):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        for child in children:
            if child.poll() is None:
                child.send_signal(signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        while True:
            for child in children:
                code = child.poll()
                if code is not None:
                    stop(signal.SIGTERM, None)
                    for other in children:
                        if other.poll() is None:
                            try:
                                other.wait(timeout=10)
                            except subprocess.TimeoutExpired:
                                other.kill()
                    return code
            time.sleep(0.5)
    finally:
        stop(signal.SIGTERM, None)


if __name__ == "__main__":
    raise SystemExit(main())
