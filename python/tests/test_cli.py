import pytest
from symphony.cli import parse_args


def test_default_workflow_path():
    args = parse_args([])
    assert args.workflow_path is None


def test_explicit_workflow_path():
    args = parse_args(["--port", "8080", "/path/to/WORKFLOW.md"])
    assert args.workflow_path == "/path/to/WORKFLOW.md"
    assert args.port == 8080


def test_port_flag():
    args = parse_args(["--port", "9090"])
    assert args.port == 9090


def test_logs_root():
    args = parse_args(["--logs-root", "/var/log/symphony"])
    assert args.logs_root == "/var/log/symphony"
