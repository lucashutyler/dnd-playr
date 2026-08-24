<script setup>
import { computed, ref } from 'vue'
import qrcode from 'qrcode-generator'
import { useSession } from '../composables/useSession.js'

const { session, shareUrl } = useSession()

const showQr = ref(false)
const copied = ref(false)
let copiedTimer = null

/**
 * One SVG path for the whole code rather than a rect per module. Same picture,
 * a fraction of the DOM, and it scales to whatever the card gives it.
 */
const qr = computed(() => {
  const code = qrcode(0, 'M')
  code.addData(shareUrl.value)
  code.make()

  const size = code.getModuleCount()
  let path = ''
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (code.isDark(row, col)) path += 'M' + col + ',' + row + 'h1v1h-1z'
    }
  }

  // Two modules of quiet zone, which scanners need to find the edges.
  return { path, size, view: [-2, -2, size + 4, size + 4].join(' ') }
})

/** What people read off the screen: the pretty half of the link. */
const shortLink = computed(() => shareUrl.value.replace(/^https?:\/\//, ''))

async function copy() {
  const text = shareUrl.value
  let done

  try {
    // Only available over https or on localhost, which a phone on the house
    // wifi is neither, so the fallback below is the one that usually runs.
    await navigator.clipboard.writeText(text)
    done = true
  } catch {
    done = copyFallback(text)
  }

  if (!done) return
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 2000)
}

function copyFallback(text) {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)

  try {
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}
</script>

<template>
  <section class="share">
    <p class="link" :title="shareUrl">{{ shortLink }}</p>

    <div class="actions">
      <button type="button" class="primary" @click="copy">
        {{ copied ? 'Copied' : 'Copy link' }}
      </button>
      <button type="button" :aria-expanded="showQr" @click="showQr = !showQr">
        {{ showQr ? 'Hide code' : 'Show QR' }}
      </button>
    </div>

    <figure v-if="showQr" class="qr">
      <!-- Dark on white whatever the theme is: scanners want the contrast. -->
      <svg :viewBox="qr.view" role="img" :aria-label="'QR code for ' + shareUrl">
        <rect :x="-2" :y="-2" :width="qr.size + 4" :height="qr.size + 4" fill="#ffffff" />
        <path :d="qr.path" fill="#14120f" />
      </svg>
      <figcaption>Point a camera at this to join.</figcaption>
    </figure>

    <p v-if="session.hasPassphrase" class="note">
      They will need the passphrase too — the link alone will not get them in.
    </p>
  </section>
</template>

<style scoped>
.share {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
}

.link {
  overflow-wrap: anywhere;
  color: var(--c-accent);
  font-family: var(--f-mono);
  font-size: var(--t-sm);
}

.actions {
  display: flex;
  gap: var(--s-2);
}

.actions button {
  flex: 1;
  min-height: var(--tap);
  padding-inline: var(--s-3);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-bg);
  font-size: var(--t-sm);
}

.actions .primary {
  border-color: transparent;
  background: var(--c-accent);
  color: var(--c-on-accent);
  font-weight: 600;
}

.qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
}

.qr svg {
  width: 100%;
  /* Big enough to scan across a table, not so big it owns the screen. */
  max-width: 15rem;
  height: auto;
  padding: var(--s-2);
  border-radius: var(--r-2);
  background: #ffffff;
}

figcaption,
.note {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
  text-align: center;
  text-wrap: pretty;
}

.note {
  text-align: left;
}
</style>
