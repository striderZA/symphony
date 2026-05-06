import os
from pathlib import Path
from typing import Any

import yaml

from symphony.exceptions import (
    MissingWorkflowFile, WorkflowParseError, WorkflowFrontMatterNotAMap,
)
from symphony.models import WorkflowDefinition


def load_workflow(path: str | Path | None) -> WorkflowDefinition:
    """Load and parse WORKFLOW.md.

    If path is None, default to ./WORKFLOW.md in cwd.
    """
    if path is None:
        path = Path.cwd() / "WORKFLOW.md"
    else:
        path = Path(path)

    if not path.is_file():
        raise MissingWorkflowFile(f"Workflow file not found: {path}")

    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as e:
        raise MissingWorkflowFile(f"Cannot read workflow file: {e}")

    config, prompt_body = _split_front_matter(raw)

    if config is not None:
        if not isinstance(config, dict):
            raise WorkflowFrontMatterNotAMap(
                "YAML front matter must decode to a map/object"
            )
    else:
        config = {}

    prompt_template = prompt_body.strip()

    return WorkflowDefinition(config=config, prompt_template=prompt_template)


def _split_front_matter(raw: str) -> tuple[dict[str, Any] | None, str]:
    """Split raw markdown into (front_matter_dict, body_string).

    Returns (None, body) if no front matter delimiter found.
    """
    if not raw.startswith("---"):
        return None, raw

    rest = raw[3:].lstrip("\n")
    end_idx = rest.find("\n---")
    if end_idx == -1:
        return None, raw

    yaml_text = rest[:end_idx]
    body = rest[end_idx + 4:]

    try:
        config = yaml.safe_load(yaml_text)
    except yaml.YAMLError as e:
        raise WorkflowParseError(f"Invalid YAML front matter: {e}")

    return config, body
