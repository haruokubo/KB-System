import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.hoisted` (rather than the plain `const mockX = vi.fn()` pattern used
// elsewhere in this repo) is required here: `applicationinsights` is a large
// externalized CJS package, and Vitest's mock factory for it runs eagerly
// enough to hit the `mockTrackEvent` binding before a plain top-level const
// would be initialized. `vi.hoisted` guarantees initialization order.
const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }))
vi.mock('applicationinsights', () => ({
  defaultClient: { trackEvent: mockTrackEvent },
  setup: vi.fn().mockReturnThis(),
  start: vi.fn(),
}))

import { logAuditEvent } from '@/lib/logger'

describe('logAuditEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the event name and properties to Application Insights when configured', () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test'
    logAuditEvent('article.publish', { articleId: 'a1', role: 'editor' })
    expect(mockTrackEvent).toHaveBeenCalledWith({
      name: 'article.publish',
      properties: { articleId: 'a1', role: 'editor' },
    })
  })

  it('does not throw when Application Insights is not configured', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    expect(() => logAuditEvent('article.publish', { articleId: 'a1' })).not.toThrow()
  })
})
