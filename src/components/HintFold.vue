<script setup>
import { ref } from 'vue'
import '@/views/Settings/settings-ui.css'

const props = defineProps({
  title: { type: String, default: '说明' },
  summary: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: false },
})

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="settings-info-card is-fold" :class="{ 'is-open': open }">
    <div class="fold-bar">
      <button type="button" class="fold-toggle" @click="open = !open">
        <span class="fold-copy">
          <span class="settings-kicker">{{ title }}</span>
          <span v-if="!open && summary" class="fold-summary">{{ summary }}</span>
        </span>
        <span class="fold-action">{{ open ? '收起' : '展开' }}</span>
      </button>
      <div v-if="$slots.actions" class="fold-extra">
        <slot name="actions" />
      </div>
    </div>
    <div v-show="open" class="fold-body">
      <slot />
    </div>
  </section>
</template>
