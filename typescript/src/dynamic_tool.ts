interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const LINEAR_GRAPHQL_NAME = 'linear_graphql'

export function toolSpecs(): ToolSpec[] {
  return [
    {
      name: LINEAR_GRAPHQL_NAME,
      description: 'Execute a raw GraphQL query or mutation against Linear using Symphony\'s configured auth.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Single GraphQL query or mutation document.' },
          variables: { type: ['object', 'null'], description: 'Optional GraphQL variables object.', additionalProperties: true },
        },
      },
    },
  ]
}

async function executeLinearGraphql(
  args: { query: string; variables?: Record<string, unknown> | null },
  linearClient: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: unknown; errors?: Array<{ message: string }> }>,
): Promise<ToolResult> {
  if (!args.query || typeof args.query !== 'string' || args.query.trim() === '') {
    return { success: false, error: 'query must be a non-empty string' }
  }

  const operationCount = (args.query.match(/\b(query|mutation|subscription)\s+\w+\s*\{/g) || []).length
  if (operationCount > 1) {
    return { success: false, error: 'query must contain exactly one GraphQL operation' }
  }

  try {
    const result = await linearClient(args.query, args.variables ?? undefined)
    if (result.errors && result.errors.length > 0) {
      return { success: false, data: result, error: result.errors.map((e) => e.message).join(', ') }
    }
    return { success: true, data: result.data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeTool(
  tool: string,
  args: Record<string, unknown>,
  linearClient: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: unknown; errors?: Array<{ message: string }> }>,
): Promise<ToolResult> {
  if (tool === LINEAR_GRAPHQL_NAME) {
    return executeLinearGraphql(args as { query: string; variables?: Record<string, unknown> | null }, linearClient)
  }

  return {
    success: false,
    error: `Unsupported dynamic tool: ${tool}. Supported tools: ${toolSpecs().map((t) => t.name).join(', ')}`,
  }
}
