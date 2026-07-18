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
  it('allows editor to self-service reset their password', () => {
    expect(canAccess('editor', '/api/users/reset-password', 'POST')).toBe(true)
  })
  it('allows read_only to self-service reset their password', () => {
    expect(canAccess('read_only', '/api/users/reset-password', 'POST')).toBe(true)
  })
  it('blocks editor from other user-management paths', () => {
    expect(canAccess('editor', '/api/users', 'POST')).toBe(false)
    expect(canAccess('editor', '/api/users/some-id', 'GET')).toBe(false)
  })
  it('blocks read_only from other user-management paths', () => {
    expect(canAccess('read_only', '/api/users', 'POST')).toBe(false)
    expect(canAccess('read_only', '/api/users/some-id', 'GET')).toBe(false)
  })
  it('allows editor to view the article page routes', () => {
    expect(canAccess('editor', '/articles/new', 'GET')).toBe(true)
    expect(canAccess('editor', '/articles/some-id', 'GET')).toBe(true)
  })
  it('allows read_only to view the article page routes', () => {
    expect(canAccess('read_only', '/articles/new', 'GET')).toBe(true)
    expect(canAccess('read_only', '/articles/some-id', 'GET')).toBe(true)
  })
  it('allows editor and read_only to view the search page route', () => {
    expect(canAccess('editor', '/search', 'GET')).toBe(true)
    expect(canAccess('read_only', '/search', 'GET')).toBe(true)
  })
})
