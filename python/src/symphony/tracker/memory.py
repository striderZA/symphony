from symphony.tracker.base import TrackerAdapter
from symphony.models import Issue


class MemoryTracker(TrackerAdapter):
    def __init__(
        self,
        issues: list[Issue] | None = None,
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
    ):
        self._issues = {i.id: i for i in (issues or [])}
        self._active_states = active_states or ["Todo", "In Progress"]
        self._terminal_states = terminal_states or ["Done", "Closed", "Cancelled", "Duplicate"]

    def fetch_candidate_issues(self) -> list[Issue]:
        lower_active = [s.lower() for s in self._active_states]
        return [
            i for i in self._issues.values()
            if i.state.lower() in lower_active
        ]

    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        if not state_names:
            return []
        lower = [s.lower() for s in state_names]
        return [i for i in self._issues.values() if i.state.lower() in lower]

    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        return [self._issues[iid] for iid in issue_ids if iid in self._issues]
