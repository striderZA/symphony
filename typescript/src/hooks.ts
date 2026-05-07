import { exec } from 'node:child_process'

export interface HookResult {
  success: boolean
  stdout: string
  stderr: string
  error: string | null
}

export function execHook(command: string, cwd: string, timeoutMs: number): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const isTimeout = (err.killed || err.message?.includes('timeout'))
        resolve({
          success: false,
          stdout,
          stderr,
          error: isTimeout ? `Hook timed out after ${timeoutMs}ms` : err.message,
        })
      } else {
        resolve({ success: true, stdout, stderr, error: null })
      }
    })
  })
}
