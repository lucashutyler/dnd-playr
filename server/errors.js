/**
 * A failure the client is expected to see and act on, as opposed to a bug.
 * The hub sends the code straight down the wire and does not log it as an error.
 */
export class IntentError extends Error {
  constructor(code) {
    super(code)
    this.name = 'IntentError'
    this.code = code
    this.expected = true
  }
}
