<template>
  <div class="env-target-field">
    <div class="mode-switch" role="tablist">
      <button
          type="button"
          role="tab"
          class="mode-btn"
          :class="{ active: mode === 'project' }"
          @click="setMode('project')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        项目环境
      </button>
      <button
          type="button"
          role="tab"
          class="mode-btn"
          :class="{ active: mode === 'custom' }"
          @click="setMode('custom')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        自定义
      </button>
    </div>

    <!-- 跟随项目环境 -->
    <div v-if="mode === 'project'" class="env-card">
      <div class="env-card-row">
        <span class="platform-badge">{{ platformIcon }}</span>
        <div class="env-card-main">
          <span class="env-card-label">{{ summary }}</span>
          <template v-if="isMobilePlatform">
            <div class="env-dual">
              <div class="env-dual-row">
                <span class="dual-icon">🤖</span>
                <code class="env-var mini">{{ wrapVar('app.android.package') }}</code>
              </div>
              <div class="env-dual-row">
                <span class="dual-icon">🍏</span>
                <code class="env-var mini">{{ wrapVar('app.ios.bundle') }}</code>
              </div>
            </div>
            <code class="env-var resolve-var">{{ displayVar }}</code>
          </template>
          <code v-else-if="displayVar" class="env-var">{{ displayVar }}</code>
          <span v-else class="env-warn">请先在上方选择目标平台</span>
        </div>
      </div>
      <p class="env-footnote">
        {{ isMobilePlatform
            ? 'Run 时按执行设备自动选用上方 Android / iOS 配置'
            : 'Run 时按 dev / test / pre / prod 从项目环境配置解析' }}
      </p>
    </div>

    <!-- 自定义 -->
    <div v-else class="custom-block">
      <div class="custom-input-wrap">
        <input
            :value="modelValue"
            type="text"
            class="custom-input"
            :placeholder="customPlaceholder"
            spellcheck="false"
            @input="onCustomInput"
        />
        <button type="button" class="var-pick" title="选择上游变量" @click="$emit('pick-var')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/>
          </svg>
        </button>
      </div>
      <p class="env-footnote">手动填写包名 / Bundle / URL，或使用变量引用</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  envTargetSummary,
  getDefaultEnvVarValue,
  isKnownEnvPlaceholder,
  normalizePlatformKey,
  shouldUseProjectEnv,
  wrapConfigVar,
  targetMobilePlaceholder,
  targetWebPlaceholder,
} from '@/constants/configVars'

const props = defineProps({
  modelValue: { type: String, default: '' },
  fieldName: { type: String, required: true },
  platform: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'pick-var'])

const mode = ref('project')

const summary = computed(() => envTargetSummary(props.fieldName, props.platform))

const platformIcon = computed(() => {
  const p = normalizePlatformKey(props.platform)
  if (p === 'mobile') return '📱'
  if (p === 'ios') return '🍏'
  if (p === 'android') return '🤖'
  if (p === 'web') return '🌐'
  return '📱'
})

const isMobilePlatform = computed(
    () => normalizePlatformKey(props.platform) === 'mobile' && props.fieldName === 'target_mobile'
)

const wrapVar = (key) => wrapConfigVar(key)

const displayVar = computed(() => {
  if (props.modelValue && isKnownEnvPlaceholder(props.modelValue)) return props.modelValue
  return getDefaultEnvVarValue(props.fieldName, props.platform) || ''
})

const customPlaceholder = computed(() => {
  if (props.fieldName === 'target_web') return targetWebPlaceholder()
  return targetMobilePlaceholder(props.platform)
})

const syncModeFromValue = (val) => {
  mode.value = shouldUseProjectEnv(val) ? 'project' : 'custom'
}

const applyProjectDefault = () => {
  const next = getDefaultEnvVarValue(props.fieldName, props.platform)
  if (next) emit('update:modelValue', next)
  else if (!props.modelValue) emit('update:modelValue', '')
}

const setMode = (next) => {
  mode.value = next
  if (next === 'project') {
    applyProjectDefault()
  } else if (isKnownEnvPlaceholder(props.modelValue)) {
    emit('update:modelValue', '')
  }
}

const onCustomInput = (e) => {
  emit('update:modelValue', e.target.value)
}

watch(
    () => [props.modelValue, props.platform, props.fieldName],
    ([val, platform]) => {
      if (mode.value === 'custom') {
        if (isKnownEnvPlaceholder(val)) mode.value = 'project'
        return
      }
      syncModeFromValue(val)
      if (mode.value === 'project') {
        const next = getDefaultEnvVarValue(props.fieldName, platform)
        if (next && (val === '' || val === undefined || isKnownEnvPlaceholder(val)) && val !== next) {
          emit('update:modelValue', next)
        }
      }
    },
    { immediate: true }
)
</script>

<style scoped>
.env-target-field {
  width: 100%;
}

/* 与 PropertyPanel / CaseEditor glass-tabs 一致的分段控件 */
.mode-switch {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 10px;
  border-radius: 8px;
  background: #f1f5f9;
}

.mode-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.18s ease;
}

.mode-btn svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.mode-btn:hover:not(.active) {
  color: #334155;
}

.mode-btn.active {
  background: #fff;
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.mode-btn.active svg {
  opacity: 1;
  stroke: #6366f1;
}

/* 项目环境卡片 — 对齐 PropertyPanel description-box */
.env-card {
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.env-card-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.platform-badge {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.env-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.env-card-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.env-var.mini {
  font-size: 11px;
  padding: 4px 8px;
  margin: 0;
}

.env-dual {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.env-dual-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dual-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.resolve-var {
  margin-top: 2px;
  font-size: 11px;
  color: #6366f1;
  background: #eef2ff;
  border-color: #c7d2fe;
}

.env-var {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  line-height: 1.4;
}

.env-warn {
  font-size: 12px;
  color: #b45309;
}

.env-footnote {
  margin: 8px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
}

/* 自定义输入 — 对齐 PropertyPanel .panel-input + .pick-btn */
.custom-block {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.custom-input-wrap {
  position: relative;
  width: 100%;
}

.custom-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 36px 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #334155;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.custom-input::placeholder {
  color: #cbd5e1;
  font-family: inherit;
}

.custom-input:focus {
  border-color: #6366f1;
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.var-pick {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.var-pick:hover {
  color: #6366f1;
  background: #f1f5f9;
}
</style>
