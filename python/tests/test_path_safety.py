import pytest
from symphony.path_safety import sanitize_workspace_key, check_containment
from symphony.exceptions import PathSafetyError


def test_sanitize_basic():
    assert sanitize_workspace_key("PROJ-123") == "PROJ-123"


def test_sanitize_replaces_special_chars():
    assert sanitize_workspace_key("PROJ/foo@bar#baz") == "PROJ_foo_bar_baz"


def test_sanitize_allows_dot_underscore_hyphen():
    assert sanitize_workspace_key("a.B-C_d") == "a.B-C_d"


def test_sanitize_empty_string():
    assert sanitize_workspace_key("") == ""


def test_containment_inside():
    check_containment("/tmp/root/ws-1", "/tmp/root")


def test_containment_at_root_level():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root", "/tmp/root")


def test_containment_outside():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/other", "/tmp/root")


def test_containment_same_prefix_different_dir():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root-extra", "/tmp/root")


def test_containment_traversal_attack():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root/../etc/passwd", "/tmp/root")
