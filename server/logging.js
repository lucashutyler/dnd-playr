/**
 * Logging is structured because it is read by grep at 1am, not by a person
 * watching a terminal. The important part is what it must never contain.
 */

/**
 * Member tokens are bearer credentials and the websocket upgrade carries one
 * in the query string. A log line with a live token in it is a log line that
 * hands over somebody's seat.
 */
export function scrubToken(url) {
  if (typeof url !== 'string') return url
  return url.replace(/([?&]token=)[^&]*/gi, '$1REDACTED')
}

export function loggerOptions(level) {
  return {
    level,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true,
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: scrubToken(request.url),
          remoteAddress: request.ip,
        }
      },
    },
  }
}
