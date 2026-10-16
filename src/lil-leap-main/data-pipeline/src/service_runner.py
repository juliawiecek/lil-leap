"""Run continuous ingestion and the Flask API with coordinated shutdown."""
from __future__ import annotations
import signal
import subprocess
import sys
import time


def stop_children(children: list[subprocess.Popen], signum: int) -> None:
    for child in children:
        if child.poll() is None:
            child.send_signal(signum)


def wait_or_kill(children: list[subprocess.Popen], timeout: float = 10) -> None:
    for child in children:
        if child.poll() is None:
            try:
                child.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                child.kill()


def find_exit_code(children: list[subprocess.Popen]) -> int | None:
    for child in children:
        code = child.poll()
        if code is not None:
            return code
    return None


def build_stop_handler(children: list[subprocess.Popen]):
    stopping = False

    def stop(signum, _frame):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        stop_children(children, signum)

    return stop


def register_signal_handlers(stop_handler) -> None:
    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)


def handle_child_exit(children: list[subprocess.Popen], stop_handler) -> int | None:
    code = find_exit_code(children)
    if code is None:
        return None
    stop_handler(signal.SIGTERM, None)
    wait_or_kill(children)
    return code


def main() -> int:
    children = [
        subprocess.Popen([sys.executable, "-m", "src.quote_ingestor", "--continuous"]),
        subprocess.Popen([sys.executable, "-m", "src.app"]),
    ]
    stop_handler = build_stop_handler(children)
    register_signal_handlers(stop_handler)
    try:
        while True:
            code = handle_child_exit(children, stop_handler)
            if code is not None:
                return code
            time.sleep(0.5)
    finally:
        stop_handler(signal.SIGTERM, None)


if __name__ == "__main__":
    raise SystemExit(main())
