/**
 * What tracks a class starts with — not what the numbers are.
 *
 * We deliberately do not ship a slot progression table. Seeding the right rows
 * with a max of 0 and letting the player type "4" once is the text field the
 * prime directive asks for, and it keeps every class progression rule out of
 * the codebase. Hit Dice is the exception because it is just the level.
 */

const FULL = 'full'
const HALF = 'half'
const PACT = 'pact'

const CLASSES = {
  Barbarian: { casting: null, tracks: [['Rage', 'long']] },
  Bard: { casting: FULL, tracks: [['Bardic Inspiration', 'short']] },
  Cleric: { casting: FULL, tracks: [['Channel Divinity', 'short']] },
  Druid: { casting: FULL, tracks: [['Wild Shape', 'short']] },
  Fighter: {
    casting: null,
    tracks: [
      ['Second Wind', 'short'],
      ['Action Surge', 'short'],
    ],
  },
  Monk: { casting: null, tracks: [['Ki', 'short']] },
  Paladin: {
    casting: HALF,
    tracks: [
      ['Lay on Hands', 'long'],
      ['Channel Divinity', 'short'],
    ],
  },
  Ranger: { casting: HALF, tracks: [] },
  Rogue: { casting: null, tracks: [] },
  Sorcerer: { casting: FULL, tracks: [['Sorcery Points', 'long']] },
  Warlock: { casting: PACT, tracks: [['Pact Slots', 'short']] },
  Wizard: { casting: FULL, tracks: [['Arcane Recovery', 'long']] },
  Other: { casting: null, tracks: [] },
}

export const CLASS_NAMES = Object.keys(CLASSES)

/**
 * How many slot levels to offer. Arithmetic rather than a table: this decides
 * which rows exist, never what is in them.
 */
function slotLevels(casting, level) {
  if (casting === FULL) return Math.min(9, Math.ceil(level / 2))
  if (casting === HALF) return Math.min(5, Math.ceil(level / 4))
  return 0
}

/** The resource rows a new character starts with, in display order. */
export function tracksFor(className, level = 1) {
  const preset = CLASSES[className] ?? CLASSES.Other
  const tracks = [{ name: 'Hit Dice', current: level, max: level, resetsOn: 'long' }]

  for (let i = 1; i <= slotLevels(preset.casting, level); i += 1) {
    tracks.push({ name: 'Level ' + i + ' Slots', current: 0, max: 0, resetsOn: 'long' })
  }

  for (const [name, resetsOn] of preset.tracks) {
    tracks.push({ name, current: 0, max: 0, resetsOn })
  }

  return tracks
}
