from jinja2 import Environment, StrictUndefined, TemplateSyntaxError, UndefinedError
from symphony.models import Issue
from symphony.exceptions import TemplateRenderError


_default_prompt = (
    "You are working on an issue from Linear.\n\n"
    "Issue: {{ issue.identifier }}: {{ issue.title }}\n\n"
    "Description:\n{{ issue.description or '(no description)' }}\n\n"
    "State: {{ issue.state }}\n"
    "Priority: {{ issue.priority or 'not set' }}\n"
    "Labels: {{ issue.labels | join(', ') or 'none' }}\n"
    "{% if issue.blocked_by %}Blocked by: {% for b in issue.blocked_by %}{{ b.identifier }} ({{ b.state }}) {% endfor %}{% endif %}"
)


def render_prompt(template: str, issue: Issue, attempt: int | None) -> str:
    effective = template.strip() or _default_prompt

    env = Environment(undefined=StrictUndefined)
    try:
        tpl = env.from_string(effective)
    except TemplateSyntaxError as e:
        raise TemplateRenderError(f"Template parse error: {e}")

    issue_dict = {
        "id": issue.id,
        "identifier": issue.identifier,
        "title": issue.title,
        "description": issue.description,
        "priority": issue.priority,
        "state": issue.state,
        "branch_name": issue.branch_name,
        "url": issue.url,
        "labels": issue.labels,
        "blocked_by": [
            {"id": b.id, "identifier": b.identifier, "state": b.state}
            for b in (issue.blocked_by or [])
        ],
        "created_at": issue.created_at.isoformat() if issue.created_at else None,
        "updated_at": issue.updated_at.isoformat() if issue.updated_at else None,
    }

    ctx = {"issue": issue_dict, "attempt": attempt}

    try:
        result = tpl.render(ctx)
    except UndefinedError as e:
        raise TemplateRenderError(f"Unknown template variable: {e}")
    except Exception as e:
        raise TemplateRenderError(f"Template render error: {e}")

    return result
