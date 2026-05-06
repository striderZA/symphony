---
name: linear
description: |
  Use Symphony's `linear_graphql` client tool for raw Linear GraphQL
  operations such as comment editing and upload flows.
---

# Linear GraphQL

Use this skill for raw Linear GraphQL work during Symphony app-server sessions.

## Primary tool

Use the `linear_graphql` client tool exposed by Symphony's app-server session.
It reuses Symphony's configured Linear auth for the session.

Tool input:

```json
{
  "query": "query or mutation document",
  "variables": {
    "optional": "graphql variables object"
  }
}
```

Tool behavior:

- Send one GraphQL operation per tool call.
- Treat a top-level `errors` array as a failed GraphQL operation even if the
  tool call itself completed.
- Keep queries/mutations narrowly scoped; ask only for the fields you need.

## Common workflows

### Query an issue by key, identifier, or id

Lookup by issue key:

```graphql
query IssueByKey($key: String!) {
  issue(id: $key) {
    id
    identifier
    title
    state { id name type }
    project { id name }
    branchName
    url
    description
    updatedAt
  }
}
```

Lookup by identifier filter:

```graphql
query IssueByIdentifier($identifier: String!) {
  issues(filter: { identifier: { eq: $identifier } }, first: 1) {
    nodes { id identifier title state { id name } }
  }
}
```

### Query team workflow states for an issue

```graphql
query IssueTeamStates($id: String!) {
  issue(id: $id) {
    id
    team {
      id
      key
      states { nodes { id name type } }
    }
  }
}
```

### Edit an existing comment

```graphql
mutation UpdateComment($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) {
    success
    comment { id body }
  }
}
```

### Create a comment

```graphql
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id url }
  }
}
```

### Move an issue to a different state

```graphql
mutation MoveIssueToState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id identifier state { id name } }
  }
}
```

## Usage rules

- Use `linear_graphql` for comment edits, uploads, and ad-hoc Linear API
  queries.
- Prefer the narrowest issue lookup that matches what you already know.
- For state transitions, fetch team states first and use the exact `stateId`.
- Do not introduce new raw-token shell helpers for GraphQL access.
