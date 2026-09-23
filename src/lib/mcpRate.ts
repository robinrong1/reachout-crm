export const MCP_RATE_LIMIT = 60
export const MCP_RATE_WINDOW_MS = 60_000

export function consumeMcpRate(input: {
  now: number
  windowStartedAt: string | null
  windowCount: number
  limit?: number
  windowMs?: number
}) {
  const limit = input.limit ?? MCP_RATE_LIMIT
  const windowMs = input.windowMs ?? MCP_RATE_WINDOW_MS
  const started = input.windowStartedAt ? Date.parse(input.windowStartedAt) : Number.NaN
  const inWindow = !Number.isNaN(started) && input.now - started < windowMs

  if (!inWindow) {
    return { allowed: true as const, windowStartedAt: new Date(input.now).toISOString(), windowCount: 1 }
  }

  if (input.windowCount >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((started + windowMs - input.now) / 1000))
    return { allowed: false as const, retryAfterSeconds }
  }

  return {
    allowed: true as const,
    windowStartedAt: new Date(started).toISOString(),
    windowCount: input.windowCount + 1,
  }
}
