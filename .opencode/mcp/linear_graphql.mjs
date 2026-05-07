/**
 * Minimal MCP server for linear_graphql.
 * Exposes a single tool that executes raw GraphQL queries/mutations against the Linear API.
 *
 * Register in opencode.json:
 *   "mcp": {
 *     "linear_graphql": {
 *       "type": "local",
 *       "command": ["bun", ".opencode/mcp/linear_graphql.mjs"]
 *     }
 *   }
 */

const API_KEY = process.env.LINEAR_API_KEY
if (!API_KEY) {
  process.stderr.write('LINEAR_API_KEY not set\n')
  process.exit(1)
}

function toolList() {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [{
        name: 'linear_graphql',
        description: 'Execute a raw GraphQL query or mutation against Linear using configured auth. Pass a single query or mutation document and optional JSON variables.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Single GraphQL query or mutation document' },
            variables: { type: 'string', description: 'JSON object of GraphQL variables (optional)' },
          },
          required: ['query'],
        },
      }],
    },
  }) + '\n'
}

async function toolCall(id, args) {
  const query = args?.query
  if (!query || typeof query !== 'string') {
    return jsonRpc(id, 1, { content: [{ type: 'text', text: 'query must be a non-empty string' }] })
  }
  const ops = (query.match(/\b(query|mutation)\s+\w+/g) || []).length
  if (ops !== 1) {
    return jsonRpc(id, 1, { content: [{ type: 'text', text: 'query must contain exactly one operation' }] })
  }
  let variables
  if (args.variables) {
    try { variables = JSON.parse(args.variables) }
    catch { return jsonRpc(id, 1, { content: [{ type: 'text', text: 'variables must be valid JSON' }] }) }
  }
  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: API_KEY },
      body: JSON.stringify({ query, variables }),
    })
    const body = await res.json()
    if (body.errors) return jsonRpc(id, 1, { content: [{ type: 'text', text: JSON.stringify(body) }] })
    return jsonRpc(id, 0, { content: [{ type: 'text', text: JSON.stringify(body.data) }] })
  } catch (err) {
    return jsonRpc(id, 1, { content: [{ type: 'text', text: String(err) }] })
  }
}

function jsonRpc(id, isError, result) {
  const key = isError ? 'error' : 'result'
  return JSON.stringify({ jsonrpc: '2.0', id, [key]: isError ? { message: result.content[0].text } : result }) + '\n'
}

let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      if (msg.method === 'tools/list') {
        process.stdout.write(toolList())
      } else if (msg.method === 'tools/call') {
        toolCall(msg.id, msg.params?.arguments).then((r) => process.stdout.write(r))
      } else {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { message: 'unknown method' } }) + '\n')
      }
    } catch { /* ignore parse errors */ }
  }
})
