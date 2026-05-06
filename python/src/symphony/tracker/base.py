from abc import ABC, abstractmethod
from symphony.models import Issue


class TrackerAdapter(ABC):
    @abstractmethod
    def fetch_candidate_issues(self) -> list[Issue]:
        ...

    @abstractmethod
    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        ...

    @abstractmethod
    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        ...
