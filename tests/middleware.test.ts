import { describe, it, expect } from 'vitest'
import { canAccess } from '@/proxy'

describe('canAccess', () => {
  it('allows editor to write articles', () => {
    expect(canAccess('editor', '/api/articles', 'POST')).toBe(true)
  })
  it('blocks read_only from writing articles', () => {
    expect(canAccess('read_only', '/api/articles', 'POST')).toBe(false)
  })
  it('allows read_only to read articles', () => {
    expect(canAccess('read_only', '/api/articles', 'GET')).toBe(true)
  })
  it('blocks editor from user management', () => {
    expect(canAccess('editor', '/api/users', 'POST')).toBe(false)
  })
  it('allows admin everything', () => {
    expect(canAccess('admin', '/api/users', 'POST')).toBe(true)
  })
})
