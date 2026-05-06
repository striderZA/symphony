class SymphonyError(Exception):
    """Base for all Symphony errors."""


class WorkflowError(SymphonyError):
    """Workflow file or config errors."""

class MissingWorkflowFile(WorkflowError):
    ...

class WorkflowParseError(WorkflowError):
    ...

class WorkflowFrontMatterNotAMap(WorkflowError):
    ...

class TemplateParseError(WorkflowError):
    ...

class TemplateRenderError(WorkflowError):
    ...


class TrackerError(SymphonyError):
    """Tracker adapter errors."""

class UnsupportedTrackerKind(TrackerError):
    ...

class MissingTrackerApiKey(TrackerError):
    ...

class MissingTrackerProjectSlug(TrackerError):
    ...

class LinearApiRequest(TrackerError):
    ...

class LinearApiStatus(TrackerError):
    ...

class LinearGraphQLErrors(TrackerError):
    ...

class LinearUnknownPayload(TrackerError):
    ...

class LinearMissingEndCursor(TrackerError):
    ...


class AgentError(SymphonyError):
    """Coding agent session errors."""

class CodexNotFound(AgentError):
    ...

class InvalidWorkspaceCwd(AgentError):
    ...

class ResponseTimeout(AgentError):
    ...

class TurnTimeout(AgentError):
    ...

class PortExit(AgentError):
    ...

class TurnFailed(AgentError):
    ...

class TurnCancelled(AgentError):
    ...

class TurnInputRequired(AgentError):
    ...


class WorkspaceError(SymphonyError):
    """Workspace manager errors."""

class HookError(SymphonyError):
    """Hook execution errors."""

class HookTimeout(HookError):
    ...

class PathSafetyError(SymphonyError):
    """Path containment errors."""
