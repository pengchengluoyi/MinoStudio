<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="acct-status" :class="{ compact }">
    <span v-if="!rows.length" class="acct-status-empty">—</span>
    <div v-for="item in rows" :key="item.key" class="acct-status-row" :class="{ extended: item.extended }">
      <span class="acct-status-k">{{ item.title }}</span>
      <span class="acct-status-v" :class="`tone-${item.tone}`">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.acct-status {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  font-size: 12px;
  line-height: 1.35;
}
.acct-status.compact {
  grid-template-columns: 1fr;
  gap: 2px;
}
.acct-status-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.acct-status-k {
  flex: 0 0 auto;
  color: var(--mo-muted, #6b7280);
  font-weight: 600;
  min-width: 2.2em;
}
.acct-status-k::after {
  content: '：';
}
.acct-status-v {
  font-weight: 700;
  color: var(--mo-text, #111827);
}
.tone-ok { color: #047857; }
.tone-info { color: #1d4ed8; }
.tone-warn { color: #b45309; }
.tone-danger { color: #b91c1c; }
.tone-muted { color: #6b7280; font-weight: 600; }
.acct-status-empty {
  color: var(--mo-muted, #9ca3af);
  font-size: 12px;
}
.acct-status-row.extended .acct-status-k {
  color: #6366f1;
}
.acct-status-row.extended .acct-status-v {
  color: #4338ca;
}
</style>
