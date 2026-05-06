import logging
from datetime import datetime, timezone
from typing import Any

from symphony.tracker.base import TrackerAdapter
from symphony.models import Issue, BlockerRef
from symphony.exceptions import (
    MissingTrackerApiKey, LinearApiRequest, LinearGraphQLErrors,
    LinearUnknownPayload, LinearMissingEndCursor,
)

logger = logging.getLogger(__name__)

CANDIDATE_QUERY = """
query CandidateIssues($projectSlug: String!, $activeStates: [String!]!, $after: String, $pageSize: Int!) {
  projects(filter: { slugId: { eq: $projectSlug } }) {
    nodes {
      id
      issues(first: $pageSize, after: $after, filter: { state: { name: { in: $activeStates } } }) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          branchName
          url
          labels { nodes { name } }
          children { nodes { id identifier state { name } } }
          createdAt
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"""

STATE_REFRESH_QUERY = """
query IssueStates($ids: [ID!]!) {
  issues(filter: { id: { in: $ids } }) {
    nodes {
      id
      identifier
      title
      description
      priority
      state { name }
      url
      labels { nodes { name } }
      createdAt
      updatedAt
    }
  }
}
"""

TERMINAL_QUERY = """
query TerminalIssues($projectSlug: String!, $terminalStates: [String!]!) {
  projects(filter: { slugId: { eq: $projectSlug } }) {
    nodes {
      id
      issues(filter: { state: { name: { in: $terminalStates } } }) {
        nodes {
          id
          identifier
        }
      }
    }
  }
}
"""


class LinearTracker(TrackerAdapter):
    def __init__(
        self,
        api_key: str,
        project_slug: str,
        endpoint: str = "https://api.linear.app/graphql",
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
        page_size: int = 50,
        timeout: int = 30,
    ):
        if not api_key:
            raise MissingTrackerApiKey("Linear API key is required")
        self.api_key = api_key
        self.project_slug = project_slug
        self.endpoint = endpoint
        self.active_states = active_states or ["Todo", "In Progress"]
        self.terminal_states = terminal_states or [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]
        self.page_size = page_size
        self.timeout = timeout

    def fetch_candidate_issues(self) -> list[Issue]:
        issues: list[Issue] = []
        after: str | None = None
        while True:
            query, variables = self._build_candidate_query(after)
            data = self._execute(query, variables)
            project_nodes = self._navigate(data, ["data", "projects", "nodes"])
            if not project_nodes:
                break
            issue_connection = project_nodes[0].get("issues", {})
            page_issues = self._parse_issue_nodes(issue_connection.get("nodes", []))
            issues.extend(page_issues)
            page_info = issue_connection.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            after = page_info.get("endCursor")
            if not after:
                raise LinearMissingEndCursor("Missing endCursor for pagination")
        return issues

    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        if not state_names:
            return []
        variables = {
            "projectSlug": self.project_slug,
            "terminalStates": state_names,
        }
        data = self._execute(TERMINAL_QUERY, variables)
        project_nodes = self._navigate(data, ["data", "projects", "nodes"])
        if not project_nodes:
            return []
        issue_nodes = project_nodes[0].get("issues", {}).get("nodes", [])
        return [
            Issue(id=n["id"], identifier=n["identifier"], title="", state="")
            for n in issue_nodes
        ]

    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        if not issue_ids:
            return []
        variables = {"ids": issue_ids}
        data = self._execute(STATE_REFRESH_QUERY, variables)
        nodes = self._navigate(data, ["data", "issues", "nodes"]) or []
        return [self._normalize_issue(n) for n in nodes]

    def _build_candidate_query(self, after: str | None) -> tuple[str, dict]:
        variables = {
            "projectSlug": self.project_slug,
            "activeStates": self.active_states,
            "after": after,
            "pageSize": self.page_size,
        }
        return CANDIDATE_QUERY, variables

    def _execute(self, query: str, variables: dict[str, Any]) -> dict:
        """Execute a GraphQL query synchronously using aiohttp."""
        import asyncio
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(self._async_execute(query, variables))
                return result
            finally:
                loop.close()
        except LinearGraphQLErrors:
            raise
        except LinearApiRequest:
            raise
        except Exception as e:
            raise LinearApiRequest(f"Linear API request failed: {e}")

    async def _async_execute(self, query: str, variables: dict[str, Any]) -> dict:
        import aiohttp
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"query": query, "variables": variables}
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.endpoint,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=self.timeout),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise LinearApiRequest(
                        f"Linear API returned status {resp.status}: {text[:500]}"
                    )
                data = await resp.json()

        if "errors" in data and data["errors"]:
            raise LinearGraphQLErrors(f"GraphQL errors: {data['errors']}")

        return data

    def _navigate(self, data: dict, path: list[str]) -> Any:
        current = data
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def _parse_issue_nodes(self, nodes: list[dict]) -> list[Issue]:
        return [self._normalize_issue(n) for n in nodes]

    def _normalize_issue(self, node: dict) -> Issue:
        state_name = ""
        if isinstance(node.get("state"), dict):
            state_name = node["state"].get("name", "")

        labels = []
        if isinstance(node.get("labels"), dict):
            label_nodes = node["labels"].get("nodes", [])
            labels = [l.get("name", "") for l in label_nodes if isinstance(l, dict)]

        blockers = []
        if isinstance(node.get("children"), dict):
            for child in node["children"].get("nodes", []):
                if isinstance(child, dict):
                    blockers.append(BlockerRef(
                        id=child.get("id"),
                        identifier=child.get("identifier"),
                        state=child.get("state", {}).get("name") if isinstance(child.get("state"), dict) else None,
                    ))

        priority = node.get("priority")
        if not isinstance(priority, int):
            priority = None

        created = None
        if node.get("createdAt"):
            try:
                created = datetime.fromisoformat(node["createdAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        updated = None
        if node.get("updatedAt"):
            try:
                updated = datetime.fromisoformat(node["updatedAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        return Issue(
            id=node.get("id", ""),
            identifier=node.get("identifier", ""),
            title=node.get("title", ""),
            description=node.get("description"),
            priority=priority,
            state=state_name,
            branch_name=node.get("branchName"),
            url=node.get("url"),
            labels=labels,
            blocked_by=blockers,
            created_at=created,
            updated_at=updated,
        )
