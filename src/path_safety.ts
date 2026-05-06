import path from 'node:path'

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, '_')
}

export function checkContainment(workspacePath: string, workspaceRoot: string): void {
  const absPath = path.resolve(workspacePath)
  const absRoot = path.resolve(workspaceRoot)
  const relative = path.relative(absRoot, absPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path ${absPath} is not contained within workspace root ${absRoot}`)
  }
}
