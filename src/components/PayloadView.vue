<script setup>
import { computed, ref } from 'vue'
import { formatPayload, payloadHasBody } from '@/utils/payloadView'

const props = defineProps({
  value: { type: [String, Number, Boolean, Object, Array], default: '' },
  images: { type: Array, default: () => [] },
  title: { type: String, default: '' },
})

const preview = ref('')
const broken = ref(new Set())

const payload = computed(() => formatPayload(props.value, props.images))
const visible = computed(() => payloadHasBody(payload.value) || Boolean(props.title))

const markBroken = (src) => {
  broken.value = new Set(broken.value).add(src)
}
</script>

<template>
  <section v-if="visible" class="pv">
    <div v-if="title" class="pv-kicker">{{ title }}</div>
    <div v-if="payload.images.length" class="pv-shots">
      <button
        v-for="(src, idx) in payload.images"
        :key="`${src}-${idx}`"
        type="button"
        class="pv-shot"
        :class="{ broken: broken.has(src) }"
        :disabled="broken.has(src)"
        @click="!broken.has(src) && (preview = src)"
      >
        <img v-if="!broken.has(src)" :src="src" alt="" @error="markBroken(src)">
        <span v-else>当时只记下了编码开头，这张图没能存完整。</span>
      </button>
    </div>
    <pre v-if="payload.text" class="pv-blob">{{ payload.text }}</pre>
    <Teleport to="body">
      <div v-if="preview" class="pv-preview" @click="preview = ''">
        <img :src="preview" alt="">
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.pv {
  --pv-border: var(--settings-border, #e3e8f0);
  --pv-soft: var(--settings-soft, #f8fafc);
  --pv-muted: var(--settings-muted, #6b7280);
  --pv-text: var(--settings-text, #334155);
  --pv-primary: var(--settings-primary, #6366f1);
  min-width: 0;
}

.pv + .pv {
  margin-top: 12px;
}

.pv-kicker {
  color: var(--pv-primary);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 6px;
}

.pv-shots {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}

.pv-shot {
  display: block;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--pv-border);
  border-radius: 12px;
  background: var(--pv-soft);
  cursor: zoom-in;
}

.pv-shot img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
}

.pv-shot.broken {
  cursor: default;
  color: var(--pv-muted);
  font-size: 12px;
  text-align: left;
}

.pv-blob {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--pv-border);
  border-radius: 12px;
  background: var(--pv-soft);
  color: var(--pv-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pv-preview {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.72);
  cursor: zoom-out;
}

.pv-preview img {
  max-width: min(920px, 100%);
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  background: #fff;
}
</style>
