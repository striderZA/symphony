import pytest
from symphony.tracker.linear import LinearTracker
from symphony.exceptions import MissingTrackerApiKey


def test_requires_api_key():
    with pytest.raises(MissingTrackerApiKey):
        LinearTracker(api_key="", project_slug="test", endpoint="https://api.linear.app/graphql")


def test_constructs_with_key():
    tracker = LinearTracker(api_key="sk-test", project_slug="slug", endpoint="https://api.linear.app/graphql")
    assert tracker.api_key == "sk-test"
    assert tracker.project_slug == "slug"
    assert tracker.endpoint == "https://api.linear.app/graphql"


def test_query_builder():
    tracker = LinearTracker(api_key="sk-test", project_slug="test-proj")
    query, variables = tracker._build_candidate_query(after=None)
    assert "slugId" in query
    assert variables["pageSize"] == 50
    assert variables["projectSlug"] == "test-proj"
