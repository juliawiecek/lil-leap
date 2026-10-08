"""Exercise supervision without starting child processes or changing OS handlers."""
import runpy
import signal
import subprocess
import sys
from unittest.mock import Mock, call

import pytest

from src import service_runner as runner


def child(code=None):
    return Mock(poll=Mock(return_value=code))


def test_stop_signals_only_running_children_once():
    running, exited = child(), child(0)
    stop = runner.build_stop_handler([running, exited])
    stop(signal.SIGINT, None)
    stop(signal.SIGTERM, None)
    running.send_signal.assert_called_once_with(signal.SIGINT)
    exited.send_signal.assert_not_called()


def test_wait_skips_exited_children_and_kills_only_timeouts():
    running, stalled, exited = child(), child(), child(2)
    stalled.wait.side_effect = subprocess.TimeoutExpired("worker", 3)
    runner.wait_or_kill([running, stalled, exited], timeout=3)
    running.wait.assert_called_once_with(timeout=3)
    running.kill.assert_not_called()
    stalled.kill.assert_called_once_with()
    exited.wait.assert_not_called()


def test_running_children_are_not_stopped():
    children = [child(), child()]
    stop = Mock()
    assert runner.find_exit_code(children) is None
    assert runner.handle_child_exit(children, stop) is None
    stop.assert_not_called()


@pytest.mark.parametrize("code", [0, 7, -15])
def test_first_exit_stops_and_waits_for_sibling(code):
    running, exited = child(), child(code)
    assert runner.handle_child_exit([running, exited], runner.build_stop_handler([running, exited])) == code
    running.send_signal.assert_called_once_with(signal.SIGTERM)
    running.wait.assert_called_once_with(timeout=10)
    exited.wait.assert_not_called()


def test_registers_both_shutdown_signals(monkeypatch):
    register = Mock()
    monkeypatch.setattr(runner.signal, "signal", register)
    stop = Mock()
    runner.register_signal_handlers(stop)
    assert register.call_args_list == [call(signal.SIGTERM, stop), call(signal.SIGINT, stop)]


def test_main_launches_services_monitors_then_returns_child_failure(monkeypatch):
    ingestor, api = child(), child()
    ingestor.poll.side_effect = [None, 7, 7, 7]
    launch = Mock(side_effect=[ingestor, api])
    sleep = Mock()
    monkeypatch.setattr(runner.subprocess, "Popen", launch)
    monkeypatch.setattr(runner.signal, "signal", Mock())
    monkeypatch.setattr(runner.time, "sleep", sleep)
    assert runner.main() == 7
    assert launch.call_args_list == [
        call([sys.executable, "-m", "src.quote_ingestor", "--continuous"]),
        call([sys.executable, "-m", "src.app"]),
    ]
    sleep.assert_called_once_with(0.5)
    api.send_signal.assert_called_once_with(signal.SIGTERM)
    api.wait.assert_called_once_with(timeout=10)


def test_main_stops_children_when_monitoring_raises(monkeypatch):
    children = [child(), child()]
    monkeypatch.setattr(runner.subprocess, "Popen", Mock(side_effect=children))
    monkeypatch.setattr(runner.signal, "signal", Mock())
    monkeypatch.setattr(runner.time, "sleep", Mock(side_effect=RuntimeError("monitor failed")))
    with pytest.raises(RuntimeError, match="monitor failed"):
        runner.main()
    for process in children:
        process.send_signal.assert_called_once_with(signal.SIGTERM)


def test_module_entrypoint_exits_with_child_status(monkeypatch):
    monkeypatch.setattr(subprocess, "Popen", Mock(side_effect=[child(4), child(0)]))
    monkeypatch.setattr(signal, "signal", Mock())
    with pytest.raises(SystemExit) as result:
        runpy.run_path(runner.__file__, run_name="__main__")
    assert result.value.code == 4
