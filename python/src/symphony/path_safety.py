import re
import os
from symphony.exceptions import PathSafetyError

_INVALID_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def sanitize_workspace_key(identifier: str) -> str:
    """Replace any character not in [A-Za-z0-9._-] with _."""
    return _INVALID_CHARS.sub("_", identifier)


def check_containment(workspace_path: str, workspace_root: str) -> None:
    """Require workspace_path to have workspace_root as parent prefix."""
    wp = os.path.normpath(os.path.abspath(workspace_path))
    wr = os.path.normpath(os.path.abspath(workspace_root))
    if wp == wr:
        raise PathSafetyError(
            f"Workspace path {wp} equals root {wr}; must be a subdirectory"
        )
    prefix = wr + os.sep
    if not wp.startswith(prefix):
        raise PathSafetyError(
            f"Workspace path {wp} is not under root {wr}"
        )
