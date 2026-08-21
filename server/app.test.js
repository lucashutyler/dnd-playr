import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { buildApp } from './app.js'

describe('server', () => {
  let app

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  it('reports healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true })
  })

  it('404s unknown api routes as json', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(res.statusCode).toBe(404)
  })
})
