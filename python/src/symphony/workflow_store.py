import logging
import os
from pathlib import Path
from typing import Callable

from symphony.workflow import load_workflow
from symphony.config import build_service_config, ServiceConfig
from symphony.models import WorkflowDefinition
from symphony.exceptions import WorkflowError

logger = logging.getLogger(__name__)


class WorkflowStore:
    """Manages workflow file loading, caching, and change detection."""

    def __init__(
        self,
        path: str | None = None,
        on_reload: Callable[[], None] | None = None,
    ):
        self.path = path or os.path.join(os.getcwd(), "WORKFLOW.md")
        self.on_reload = on_reload
        self.workflow: WorkflowDefinition | None = None
        self.config: ServiceConfig | None = None
        self.last_error: str | None = None
        self._load()

    def _load(self):
        try:
            self.workflow = load_workflow(self.path)
            wf_dir = str(Path(self.path).parent)
            self.config = build_service_config(self.workflow, workflow_dir=wf_dir)
            self.last_error = None
            logger.info("workflow_loaded", extra={"path": self.path})
        except WorkflowError as e:
            self.last_error = str(e)
            logger.error("workflow_load_error", extra={"error": str(e)})

    def reload(self) -> bool:
        """Re-read the workflow file. Returns True if successful."""
        old_config = self.config
        self._load()
        if self.workflow and self.config:
            if self.on_reload:
                self.on_reload()
            return True
        if old_config:
            self.config = old_config
        return False
