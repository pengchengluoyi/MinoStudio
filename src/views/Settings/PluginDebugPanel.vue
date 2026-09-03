<script setup>
import './settings-ui.css'

defineProps({
  title: { type: String, default: '调试' },
  hint: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  busyLabel: { type: String, default: '进行中' },
  result: { type: Object, default: null },
  actions: { type: Array, default: () => [] },
})

const emit = defineEmits(['run'])
</script>

<template>
  <section class="settings-card plugin-debug">
    <div class="settings-kicker">{{ title }}</div>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <div class="row-actions">
      <button
        v-for="item in actions"
        :key="item.id"
        type="button"
        class="settings-action-pill"
        :disabled="busy || item.disabled"
        @click="emit('run', item.id)"
      >
        {{ busy && item.id === result?.action ? busyLabel : item.label }}
        <span class="settings-action-arrow">→</span>
      </button>
    </div>
    <div v-if="result" class="debug-result" :class="result.ok ? 'is-ok' : 'is-err'">
      <strong>{{ result.title || (result.ok ? '已完成' : '失败') }}</strong>
      <p>{{ result.summary || result.error || '' }}</p>
      <a
        v-if="result.url"
        :href="result.url"
        target="_blank"
        rel="noreferrer"
      >打开飞书</a>
      <ul v-if="result.items?.length">
        <li v-for="(row, idx) in result.items" :key="row.token || row.url || idx">
          <a v-if="row.url" :href="row.url" target="_blank" rel="noreferrer">{{ row.label }}</a>
          <span v-else>{{ row.label }}</span>
          <small v-if="row.meta">{{ row.meta }}</small>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.plugin-debug .hint {
  margin: 8px 0 0;
  color: var(--settings-muted);
  font-size: 13px;
  line-height: 1.65;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.debug-result {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--settings-border);
  background: var(--settings-soft);
}

.debug-result.is-ok {
  background: #ecfdf5;
  border-color: #a7f3d0;
}

.debug-result.is-err {
  background: #fef2f2;
  border-color: #fecaca;
}

.debug-result strong {
  display: block;
  color: var(--settings-text);
  font-size: 13px;
}

.debug-result p,
.debug-result a {
  margin: 6px 0 0;
  color: var(--settings-muted);
  font-size: 12px;
  line-height: 1.55;
}

.debug-result a {
  color: var(--settings-primary);
  font-weight: 700;
}

.debug-result ul {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.debug-result li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--settings-border) 70%, white);
  font-size: 12px;
}

.debug-result li:first-child {
  border-top: 0;
  padding-top: 0;
}

.debug-result small {
  color: var(--settings-muted);
}
</style>
