/** Shared payload checks, so every handler rejects junk the same way. */

export const NAME_MAX = 60
export const NOTE_MAX = 2000
export const CONDITION_MAX = 40
export const CONDITIONS_MAX = 24

export function isText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

export function isCount(value, { min = 0, max = 9999 } = {}) {
  return Number.isInteger(value) && value >= min && value <= max
}

export function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
}

export function isConditionList(value) {
  return (
    Array.isArray(value) &&
    value.length <= CONDITIONS_MAX &&
    value.every((c) => isText(c, CONDITION_MAX))
  )
}

export const RESETS_ON = ['short', 'long', 'never']
