import type { Issue, BlockerRef } from '../models'
import type { TrackerAdapter } from './base'

interface LinearConfig {
  endpoint: string
  apiKey: string
  projectSlug: string
  activeStates: string[]
  terminalStates: string[]
}

interface LinearIssueNode {
  id: string
  identifier: string
  title: string
  description?: string | null
  priority?: number | null
  branchName?: string | null
  url?: string | null
  labels?: { nodes?: Array<{ name: string }> }
  state?: { name: string }
  createdAt?: string
  updatedAt?: string
  children?: { nodes?: Array<{ id: string; identifier: string; state?: { name: string } }> }
}

function normalizeIssue(node: LinearIssueNode): Issue {
  const blockers: BlockerRef[] = (node.children?.nodes ?? []).map((c) => ({
    id: c.id ?? null,
    identifier: c.identifier ?? null,
    state: c.state?.name ?? null,
  }))

  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    state: node.state?.name ?? 'Unknown',
    description: node.description ?? null,
    priority: typeof node.priority === 'number' ? node.priority : null,
    branchName: node.branchName ?? null,
    url: node.url ?? null,
    labels: (node.labels?.nodes ?? []).map((l) => l.name.toLowerCase()),
    blockedBy: blockers,
    createdAt: node.createdAt ? new Date(node.createdAt) : null,
    updatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
  }
}

export class LinearTracker implements TrackerAdapter {
  constructor(private config: LinearConfig) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const allNodes: LinearIssueNode[] = []
    let cursor: string | null = null
    const pageSize = 50

    while (true) {
      const query = `query Candidates($projectSlug: String!, $activeStates: [String!]!, $after: String, $first: Int!) {
        issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $activeStates } } }, first: $first, after: $after) {
          nodes { id identifier title description priority branchName url
            labels { nodes { name } }
            state { name }
            createdAt updatedAt
            children { nodes { id identifier state { name } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`
      const data = await this.graphql<{ issues: { nodes: LinearIssueNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(query, {
        projectSlug: this.config.projectSlug,
        activeStates: this.config.activeStates,
        after: cursor,
        first: pageSize,
      })
      if (!data?.issues) break
      allNodes.push(...data.issues.nodes)
      if (!data.issues.pageInfo.hasNextPage) break
      cursor = data.issues.pageInfo.endCursor
      if (!cursor) break
    }

    return allNodes.map(normalizeIssue)
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const query = `query ByStates($stateNames: [String!]!) {
      issues(filter: { state: { name: { in: $stateNames } } }, first: 50) {
        nodes { id identifier title state { name } }
      }
    }`
    const data = await this.graphql<{ issues: { nodes: LinearIssueNode[] } }>(query, { stateNames })
    return (data?.issues?.nodes ?? []).map(normalizeIssue)
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    const query = `query ByIds($ids: [ID!]!) {
      issues(filter: { id: { in: $ids } }, first: 50) {
        nodes { id identifier title state { name } }
      }
    }`
    const data = await this.graphql<{ issues: { nodes: LinearIssueNode[] } }>(query, { ids: issueIds })
    return (data?.issues?.nodes ?? []).map(normalizeIssue)
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.config.apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`Linear API returned ${response.status}`)
    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors) throw new Error(`Linear GraphQL errors: ${body.errors.map((e) => e.message).join(', ')}`)
    return body.data ?? null
  }
}
