<script setup>
defineProps({
  badge: { type: Object, default: () => ({ kind: 'free', text: '可租用', detail: '' }) },
})
</script>

<template>
  <div class="lease-badge" :class="`kind-${badge.kind}`">
    <span class="lease-badge-title">{{ badge.text }}</span>
    <span v-if="badge.detail" class="lease-badge-detail">{{ badge.detail }}</span>
    <span v-if="badge.expires" class="lease-badge-exp">至 {{ badge.expires }}</span>
  </div>
</template>

<style scoped>
.lease-badge {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 12px;
  line-height: 1.35;
  max-width: 220px;
}
.lease-badge-title {
  font-weight: 800;
  letter-spacing: -0.01em;
}
.lease-badge-detail,
.lease-badge-exp {
  color: inherit;
  opacity: 0.88;
  font-size: 11px;
  word-break: break-all;
}
.kind-free {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}
.kind-leased {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
}
.kind-locked {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}
.kind-expired {
  background: #f3f4f6;
  border-color: #e5e7eb;
  color: #4b5563;
}
</style>
