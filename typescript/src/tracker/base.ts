import type { Issue } from '../models'

export interface TrackerAdapter {
  fetchCandidateIssues(): Promise<Issue[]>
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>
  fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]>
  updateIssueState(issueId: string, stateName: string): Promise<void>
}
