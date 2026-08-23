import { describe, expect, it } from 'vitest'
import { loggerOptions, scrubToken } from './logging.js'

describe('scrubToken', () => {
  it('takes the token out of a websocket upgrade url', () => {
    const scrubbed = scrubToken('/ws?token=abc123SECRET')
    expect(scrubbed).not.toContain('abc123SECRET')
    expect(scrubbed).toBe('/ws?token=REDACTED')
  })

  it('finds it wherever in the query string it sits', () => {
    expect(scrubToken('/ws?a=1&token=SECRET&b=2')).toBe('/ws?a=1&token=REDACTED&b=2')
    expect(scrubToken('/ws?TOKEN=SECRET')).toBe('/ws?TOKEN=REDACTED')
  })

  it('leaves everything else alone', () => {
    expect(scrubToken('/api/sessions/KTZP/join')).toBe('/api/sessions/KTZP/join')
    expect(scrubToken('/ws')).toBe('/ws')
    expect(scrubToken(undefined)).toBeUndefined()
  })
})

describe('loggerOptions', () => {
  it('drops the authorization header rather than logging a bearer token', () => {
    const { redact } = loggerOptions('info')
    expect(redact.paths).toContain('req.headers.authorization')
    expect(redact.remove).toBe(true)
  })

  it('serializes requests without their token', () => {
    const { serializers } = loggerOptions('info')
    const line = serializers.req({
      method: 'GET',
      url: '/ws?token=SECRET',
      ip: '127.0.0.1',
      headers: { authorization: 'Bearer SECRET' },
    })

    expect(JSON.stringify(line)).not.toContain('SECRET')
    expect(line.url).toBe('/ws?token=REDACTED')
  })
})
