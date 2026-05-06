import pytest
from datetime import datetime, timezone
from symphony.models import Issue, BlockerRef
from symphony.prompt_builder import render_prompt
from symphony.exceptions import TemplateRenderError


def test_render_issue_fields():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix the bug", state="In Progress")
    template = "Working on {{ issue.identifier }}: {{ issue.title }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Working on PROJ-1: Fix the bug"


def test_render_with_attempt():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "Attempt {{ attempt }}"
    result = render_prompt(template, issue, attempt=2)
    assert result == "Attempt 2"


def test_render_attempt_none():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "Attempt {{ attempt }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Attempt None"


def test_strict_variable_fails():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "{{ unknown_var }}"
    with pytest.raises(TemplateRenderError):
        render_prompt(template, issue, attempt=None)


def test_render_labels():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress", labels=["bug", "urgent"])
    template = "Labels: {{ issue.labels | join(', ') }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Labels: bug, urgent"


def test_render_blockers():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="Todo", blocked_by=[
        BlockerRef(id="b1", identifier="PROJ-2", state="Done"),
    ])
    template = "Blocked by: {{ issue.blocked_by[0].identifier }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Blocked by: PROJ-2"


def test_default_fallback_empty_template():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix this", state="In Progress")
    result = render_prompt("", issue, attempt=None)
    assert "PROJ-1" in result
    assert "Fix this" in result
    assert "Linear" in result


def test_default_fallback_whitespace_template():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix this", state="In Progress")
    result = render_prompt("   ", issue, attempt=None)
    assert "PROJ-1" in result
