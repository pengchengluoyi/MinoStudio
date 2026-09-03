<template>
  <div class="smart-json-editor" :class="{ invalid: !isValid, focused: isFocused }">
    <div class="editor-toolbar">
      <div class="status">
        <span v-if="isValid" class="valid-tag">● Valid JSON</span>
        <span v-else class="invalid-tag">● Invalid JSON</span>
      </div>
      <button class="format-btn" @click="formatJson" title="Format / Beautify">
        🪄 Format
      </button>
    </div>
    <textarea
      ref="textareaRef"
      :value="modelValue"
      @input="onInput"
      @focus="isFocused = true"
      @blur="onBlur"
      :placeholder="placeholder"
      class="json-textarea"
      spellcheck="false"
    ></textarea>
    <div v-if="!isValid && errorMessage" class="error-msg">{{ errorMessage }}</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Object],
    default: ''
  },
  placeholder: {
    type: String,
    default: '{}'
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const isValid = ref(true)
const errorMessage = ref('')
const isFocused = ref(false)
const textareaRef = ref(null)

const validate = (val) => {
  if (!val || val.trim() === '') {
    isValid.value = true
    errorMessage.value = ''
    return
  }
  try {
    JSON.parse(val)
    isValid.value = true
    errorMessage.value = ''
  } catch (e) {
    isValid.value = false
    errorMessage.value = e.message
  }
}

const onInput = (e) => {
  const val = e.target.value
  emit('update:modelValue', val)
  validate(val)
}

const onBlur = (e) => {
  isFocused.value = false
  emit('change', e.target.value)
}

const formatJson = () => {
  try {
    const val = props.modelValue
    if (!val) return
    const obj = JSON.parse(val)
    const formatted = JSON.stringify(obj, null, 2)
    emit('update:modelValue', formatted)
    emit('change', formatted) // Trigger change on format
    isValid.value = true
    errorMessage.value = ''
  } catch (e) {
    // Validation logic already handles error state
  }
}

watch(() => props.modelValue, (newVal) => {
  if (typeof newVal === 'string') {
    validate(newVal)
  }
}, { immediate: true })
</script>

<style scoped>
.smart-json-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  transition: all 0.2s;
}
.smart-json-editor.focused { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
.smart-json-editor.invalid { border-color: #ef4444; }
.smart-json-editor.invalid.focused { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1); }

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-size: 11px;
}
.valid-tag { color: #10b981; font-weight: 600; }
.invalid-tag { color: #ef4444; font-weight: 600; }

.format-btn { background: transparent; border: none; cursor: pointer; font-size: 11px; color: #6366f1; padding: 2px 6px; border-radius: 4px; }
.format-btn:hover { background: rgba(99, 102, 241, 0.1); }

.json-textarea {
  width: 100%;
  min-height: 120px;
  border: none;
  padding: 8px;
  font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #334155;
  background: #f8fafc;
  resize: vertical;
  outline: none;
}

.error-msg { padding: 4px 8px; background: #fef2f2; color: #ef4444; font-size: 10px; border-top: 1px solid #fee2e2; }
</style>