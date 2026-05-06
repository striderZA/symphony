export interface SessionStatus {
  id: string
  status: string
  title?: string
}

export interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendMessage(sessionId: string, prompt: string): Promise<void>
  getSessionStatus(sessionId: string): Promise<SessionStatus>
  deleteSession(sessionId: string): Promise<void>
}

export class HttpOpenCodeClient implements OpenCodeClient {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async createSession(title: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    const data = await res.json() as { id: string }
    return data.id
  }

  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] }),
    })
    if (!res.ok) throw new Error(`Failed to send message: ${res.status}`)
    // Small delay so the AI picks up the message before we poll
    await new Promise((r) => setTimeout(r, 1000))
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`)
    if (!res.ok) throw new Error(`Failed to get session: ${res.status}`)
    return await res.json() as SessionStatus
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
  }
}
