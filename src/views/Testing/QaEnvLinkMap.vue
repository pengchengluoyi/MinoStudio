<script setup>
import { computed } from 'vue'
import { envLinkRows } from '@/utils/qaWorkflow'

const props = defineProps({
  workflow: { type: Object, default: null },
  envSummaries: { type: Array, default: () => [] },
})

const rows = computed(() => envLinkRows(props.workflow, props.envSummaries))
const summaryText = computed(() => {
  if (!rows.value.length) return '还没有环境'
  return `环境对照（${rows.value.map((r) => r.label).join(' → ')}）`
})
</script>

<template>
  <details class="env-link-fold">
    <summary>{{ summaryText }}</summary>
    <ol v-if="rows.length">
      <li v-for="row in rows" :key="row.key">
        <strong>{{ row.index }}. {{ row.label }}</strong>
        <span :class="{ empty: !row.channelText }">{{ row.channelText || '还没填渠道' }}</span>
        <span :class="{ empty: !row.usageText }">{{ row.usageText || '流程里还没挂' }}</span>
      </li>
    </ol>
    <p v-else class="env-link-empty">先在环境配置里加上线顺序。</p>
  </details>
</template>

<style scoped>
.env-link-fold {
  margin-top: 8px;
  font-size: 12px;
  color: #4b5563;
}
.env-link-fold summary {
  cursor: pointer;
  color: #4f46e5;
  font-weight: 700;
  list-style: none;
}
.env-link-fold summary::-webkit-details-marker { display: none; }
.env-link-fold summary::before {
  content: '▸ ';
  color: #818cf8;
}
.env-link-fold[open] summary::before { content: '▾ '; }
.env-link-fold ol {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.env-link-fold li {
  display: grid;
  grid-template-columns: minmax(88px, auto) minmax(0, 1fr);
  gap: 2px 12px;
  padding: 8px 10px;
  border: 1px solid #e3e8f0;
  border-radius: 10px;
  background: #fff;
  line-height: 1.4;
}
.env-link-fold li strong {
  grid-column: 1 / -1;
  font-size: 12px;
  color: #111827;
}
.env-link-fold li span { min-width: 0; }
.env-link-fold .empty { color: #b45309; }
.env-link-empty {
  margin: 6px 0 0;
  color: #6b7280;
}
</style>
