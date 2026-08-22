<script setup>
let counter = 0

const props = defineProps({
  label: { type: String, required: true },
  modelValue: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  maxlength: { type: Number, default: undefined },
  autocomplete: { type: String, default: 'off' },
  code: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

counter += 1
const id = 'field-' + counter

// Room codes are typed in a hurry, in the dark. Uppercase them as they arrive.
const cast = (value) => (props.code ? value.toUpperCase() : value)

function onInput(event) {
  const next = cast(event.target.value)
  // When the cast leaves the model unchanged there is no re-render to correct
  // the element, so write it back by hand. Pasting 'ktzp' over 'KTZP' hits this.
  if (event.target.value !== next) event.target.value = next
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :autocapitalize="code ? 'characters' : 'sentences'"
      :spellcheck="!code"
      :class="{ 'is-code': code }"
      @input="onInput"
    />
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

label {
  color: var(--c-text-dim);
  font-size: var(--t-sm);
  font-weight: 500;
}

input {
  min-height: var(--tap-lg);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--c-border);
  border-radius: var(--r-2);
  background: var(--c-surface);
  /* 16px minimum or iOS Safari zooms the whole page on focus. */
  font-size: var(--t-md);
}

input::placeholder {
  color: var(--c-text-dim);
  opacity: 0.7;
}

.is-code {
  font-family: var(--f-mono);
  font-size: var(--t-xl);
  letter-spacing: 0.35em;
  text-align: center;
  text-indent: 0.35em;
}

.hint {
  color: var(--c-text-dim);
  font-size: var(--t-xs);
}
</style>
