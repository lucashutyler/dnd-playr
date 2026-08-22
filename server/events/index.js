import memberRename from './member-rename.js'
import sessionRename from './session-rename.js'
import characterCreate from './character-create.js'
import characterClaim from './character-claim.js'
import characterRelease from './character-release.js'
import characterUpdate from './character-update.js'
import hpDamage from './hp-damage.js'
import hpHeal from './hp-heal.js'
import deathSet from './death-set.js'
import resourceAdd from './resource-add.js'
import resourceAdjust from './resource-adjust.js'
import resourceUpdate from './resource-update.js'
import resourceRemove from './resource-remove.js'
import resourceReorder from './resource-reorder.js'
import restTake from './rest-take.js'
import enemyAdd from './enemy-add.js'
import enemyDamage from './enemy-damage.js'
import enemyHeal from './enemy-heal.js'
import enemyUpdate from './enemy-update.js'
import enemyRemove from './enemy-remove.js'
import enemyReorder from './enemy-reorder.js'
import encounterNew from './encounter-new.js'
import sessionPassphrase from './session-passphrase.js'
import sessionLock from './session-lock.js'
import sessionArchive from './session-archive.js'
import historyUndo from './history-undo.js'

/**
 * Every mutation lives in a file here exporting { type, validate, apply }.
 * Nothing else is allowed to change session state — see the data flow rules
 * in CLAUDE.md. Adding a mutation means adding a file and this one line.
 */
const handlers = [
  memberRename,
  sessionRename,
  characterCreate,
  characterClaim,
  characterRelease,
  characterUpdate,
  hpDamage,
  hpHeal,
  deathSet,
  resourceAdd,
  resourceAdjust,
  resourceUpdate,
  resourceRemove,
  resourceReorder,
  restTake,
  enemyAdd,
  enemyDamage,
  enemyHeal,
  enemyUpdate,
  enemyRemove,
  enemyReorder,
  encounterNew,
  sessionPassphrase,
  sessionLock,
  sessionArchive,
  historyUndo,
]

export const eventHandlers = new Map(handlers.map((h) => [h.type, h]))

export function findHandler(type) {
  return eventHandlers.get(type) ?? null
}
