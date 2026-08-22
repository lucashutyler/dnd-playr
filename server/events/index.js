import memberRename from './member-rename.js'
import sessionRename from './session-rename.js'

/**
 * Every mutation lives in a file here exporting { type, validate, apply }.
 * Nothing else is allowed to change session state — see the data flow rules
 * in CLAUDE.md. Adding a mutation means adding a file and this one line.
 */
const handlers = [memberRename, sessionRename]

export const eventHandlers = new Map(handlers.map((h) => [h.type, h]))

export function findHandler(type) {
  return eventHandlers.get(type) ?? null
}
