<script setup>
import { computed } from 'vue'
import { getBaseUrl } from '@/utils/config'

const props = defineProps({
  wireframe: { type: Object, default: null },
  turnLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  appId: { type: String, default: '' },
})

const screen = computed(() => props.wireframe?.screen || { w: 1080, h: 1920 })
const regions = computed(() => (Array.isArray(props.wireframe?.regions) ? props.wireframe.regions : []))

const screenUrl = computed(() => {
  const cap = props.wireframe?.capture || {}
  const app = String(cap.app_id || props.appId || '').trim()
  const sid = String(cap.session_id || '').trim()
  const tid = Number(cap.turn_id || 0)
  if (!app || !sid || !tid || !cap.has_screenshot) return ''
  const base = getBaseUrl().replace(/\/$/, '')
  return `${base}/nav-fsm/${app}/captures/${sid}/turn/${tid}/screen`
})

const canvasBg = computed(() => {
  if (!screenUrl.value) return {}
  return {
    backgroundImage: `url(${screenUrl.value})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

const styleRect = (rect) => {
  const x = Number(rect?.x || 0) * 100
  const y = Number(rect?.y || 0) * 100
  const w = Number(rect?.w || 0) * 100
  const h = Number(rect?.h || 0) * 100
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${w}%`,
    height: `${h}%`,
  }
}

const regionStyle = (r) => {
  const base = styleRect(r.rect)
  const sw = Number(screen.value.w || 1080)
  const sh = Number(screen.value.h || 1920)
  const showSnip = screenUrl.value && (r.is_image || r.show_snip)
  if (!showSnip) return base
  const x = Number(r.rect?.x || 0) * sw
  const y = Number(r.rect?.y || 0) * sh
  return {
    ...base,
    backgroundImage: `url(${screenUrl.value})`,
    backgroundSize: `${sw}px ${sh}px`,
    backgroundPosition: `-${x}px -${y}px`,
    backgroundRepeat: 'no-repeat',
  }
}
</script>

<template>
  <div class="nav-wireframe" :class="{ 'is-compact': compact }">
    <div v-if="turnLabel" class="wire-kicker">{{ turnLabel }}</div>
    <div class="wire-canvas" role="img" aria-label="屏面线框" :style="canvasBg">
      <div
        v-for="r in regions"
        :key="`${r.source}-${r.id}`"
        class="wire-region"
        :class="{
          'is-vision': r.source === 'vision',
          'is-hierarchy': r.source === 'hierarchy',
          'is-image': r.is_image,
          'has-snip': screenUrl && r.is_image,
          'is-nav': Boolean(r.nav_to),
        }"
        :style="regionStyle(r)"
        :title="r.nav_to ? `${r.label} → ${r.nav_to}` : r.label"
      >
        <span v-if="!r.is_image || !screenUrl" class="wire-label">{{ r.label }}</span>
        <span v-if="r.nav_to" class="wire-nav">→</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nav-wireframe {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.wire-kicker {
  font-size: 10px;
  font-weight: 600;
  color: #334155;
  line-height: 1.25;
  max-height: 2.5em;
  overflow: hidden;
}

.wire-canvas {
  position: relative;
  width: 100%;
  max-width: 280px;
  aspect-ratio: 9 / 16;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  overflow: hidden;
}

.wire-region {
  position: absolute;
  border: 1px solid rgba(37, 99, 235, 0.65);
  background: rgba(59, 130, 246, 0.08);
  box-sizing: border-box;
  z-index: 2;
  overflow: hidden;
  min-height: 2px;
  min-width: 2px;
}

.wire-region.is-vision {
  border-color: rgba(124, 58, 237, 0.7);
  background: rgba(139, 92, 246, 0.08);
}

.wire-region.has-snip {
  background-color: transparent;
  border-color: rgba(15, 23, 42, 0.35);
}

.wire-region.is-nav {
  border-color: #059669;
  box-shadow: 0 0 0 1px rgba(5, 150, 105, 0.35);
}

.wire-label {
  display: block;
  font-size: 7px;
  line-height: 1.15;
  padding: 1px 2px;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.72);
  word-break: break-all;
}

.wire-nav {
  position: absolute;
  right: 1px;
  bottom: 1px;
  font-size: 8px;
  font-weight: 700;
  color: #059669;
  background: rgba(255, 255, 255, 0.85);
  padding: 0 2px;
  border-radius: 2px;
}

.nav-wireframe.is-compact .wire-canvas {
  width: 200px;
  max-width: 200px;
  min-height: 360px;
  border-radius: 8px;
}

.nav-wireframe.is-compact .wire-label {
  font-size: 6px;
}
</style>
