import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeApp } from './test-helpers.js'

let ctx

beforeEach(async () => {
  ctx = await makeApp()
})
afterEach(async () => {
  await ctx.close()
})

describe('server', () => {
  it('reports healthy', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })

  it('404s unknown api routes as json', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
  })
})
