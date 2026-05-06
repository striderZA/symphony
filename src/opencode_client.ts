export interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendMessage(sessionId: string, prompt: string): Promise<void>
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
    // Sync call — blocks until AI fully responds
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] }),
    })
    if (!res.ok) throw new Error(`Failed to send message: ${res.status}`)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
  }
}
