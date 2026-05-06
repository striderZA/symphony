import { type Plugin, tool } from "@opencode-ai/plugin"

export const LinearGraphQLPlugin: Plugin = async () => {
  return {
    tool: {
      linear_graphql: tool({
        description: "Execute a raw GraphQL query or mutation against Linear using configured auth",
        args: {
          query: tool.schema.string().describe("Single GraphQL query or mutation document"),
          variables: tool.schema.string().optional().describe("JSON object of GraphQL variables"),
        },
        async execute(args) {
          const apiKey = process.env.LINEAR_API_KEY
          if (!apiKey) {
            return JSON.stringify({ success: false, error: "LINEAR_API_KEY not set" })
          }
          if (!args.query || args.query.trim().length === 0) {
            return JSON.stringify({ success: false, error: "query must be a non-empty string" })
          }
          const operationCount = (args.query.match(/\b(query|mutation)\s+\w+/g) || []).length
          if (operationCount !== 1) {
            return JSON.stringify({ success: false, error: "query must contain exactly one operation" })
          }
          let variables: Record<string, unknown> | undefined
          if (args.variables) {
            try { variables = JSON.parse(args.variables) }
            catch { return JSON.stringify({ success: false, error: "variables must be a valid JSON object" }) }
          }
          try {
            const response = await fetch("https://api.linear.app/graphql", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: apiKey },
              body: JSON.stringify({ query: args.query, variables }),
            })
            const body = await response.json()
            if (body.errors) return JSON.stringify({ success: false, data: body })
            return JSON.stringify({ success: true, data: body.data })
          } catch (err) {
            return JSON.stringify({ success: false, error: String(err) })
          }
        },
      }),
    },
  }
}
