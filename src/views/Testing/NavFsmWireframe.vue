<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { RGConnectTarget } from '@relation-graph/vue'
import request from '@/utils/request'
import { hotspotTargetId, RG_TARGET_HTML } from '@/utils/navRelationGraph'

const props = defineProps({
  wireframe: { type: Object, default: null },
  turnLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  graphNode: { type: Boolean, default: false },
  appId: { type: String, default: '' },
  stateId: { type: String, default: '' },
  connectHotspots: { type: Boolean, default: false },
  editableHotspots: { type: Boolean, default: false },
  /** 弹窗大图预览 */
  preview: { type: Boolean, default: false },
  /** 架构图画布：与预览同字号，不裁切底栏 */
  archCanvas: { type: Boolean, default: false },
})

const targetIdFor = (r) => hotspotTargetId(props.stateId, r)

const screen = computed(() => props.wireframe?.screen || { w: 1080, h: 1920 })
const isFrameLayout = (r) => {
  const label = String(r?.label || '').trim()
  const cls = String(r?.class_name || '').trim()
  return label === 'FrameLayout' || cls === 'FrameLayout'
}

const regions = computed(() => {
  const raw = Array.isArray(props.wireframe?.regions) ? props.wireframe.regions : []
  return raw.filter((r) => !isFrameLayout(r))
})

const screenPath = computed(() => {
  const cap = props.wireframe?.capture || {}
  const app = String(cap.app_id || props.appId || '').trim()
  const sid = String(cap.session_id || '').trim()
  const tid = Number(cap.turn_id || 0)
  if (!app || !sid || !tid || !cap.has_screenshot) return ''
  return `/nav-fsm/${app}/captures/${sid}/turn/${tid}/screen`
})

const screenBlobUrl = ref('')
let revokeUrl = ''

const loadScreenBlob = async (path) => {
  if (revokeUrl) {
    URL.revokeObjectURL(revokeUrl)
    revokeUrl = ''
  }
  screenBlobUrl.value = ''
  if (!path) return
  try {
    const res = await request.get(path, { responseType: 'blob' })
    const blob = res?.data
    if (!blob || !(blob instanceof Blob)) return
    revokeUrl = URL.createObjectURL(blob)
    screenBlobUrl.value = revokeUrl
  } catch {
    screenBlobUrl.value = ''
  }
}

watch(screenPath, (path) => {
  loadScreenBlob(path)
}, { immediate: true })

onUnmounted(() => {
  if (revokeUrl) URL.revokeObjectURL(revokeUrl)
})

const canvasBg = computed(() => {
  if (!screenBlobUrl.value) return {}
  return {
    backgroundImage: `url(${screenBlobUrl.value})`,
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
  const showSnip = screenBlobUrl.value && (r.is_image || r.show_snip)
  if (!showSnip) return base
  const x = Number(r.rect?.x || 0) * sw
  const y = Number(r.rect?.y || 0) * sh
  return {
    ...base,
    backgroundImage: `url(${screenBlobUrl.value})`,
    backgroundSize: `${sw}px ${sh}px`,
    backgroundPosition: `-${x}px -${y}px`,
    backgroundRepeat: 'no-repeat',
  }
}

/** 架构图画布只保留色块与跳转箭头，不叠控件文案 */
function showWireLabel(r) {
  if (props.archCanvas) return false
  return !r.is_image || !screenBlobUrl.value
}
</script>

<template>
  <div
    class="nav-wireframe"
    :class="{
      'is-compact': compact && !preview && !archCanvas,
      'is-graph-node': graphNode && !preview,
      'is-preview': preview,
      'is-arch-canvas': archCanvas,
    }"
  >
    <div v-if="turnLabel" class="wire-kicker">{{ turnLabel }}</div>
    <div class="wire-canvas" role="img" aria-label="屏面线框" :style="canvasBg">
      <template v-for="r in regions" :key="`${r.source}-${r.id}`">
        <RGConnectTarget
          v-if="connectHotspots && (r.nav_to || r.clickable)"
          :target-id="targetIdFor(r)"
          :target-type="RG_TARGET_HTML"
          dom-mode="contents"
          :disable-drag="!editableHotspots"
          :line-template="{ color: '#2563eb', lineWidth: 2 }"
          class="wire-region-anchor"
          :style="regionStyle(r)"
        >
          <div
            class="wire-region wire-region-fill"
            :class="{
              'is-vision': r.source === 'vision',
              'is-hierarchy': r.source === 'hierarchy',
              'is-image': r.is_image,
              'has-snip': screenBlobUrl && r.is_image,
              'is-nav': Boolean(r.nav_to),
              'is-hotspot': true,
            }"
            :title="r.nav_to ? `${r.nav_label || r.label} → ${r.nav_to}` : r.label"
          >
            <span v-if="showWireLabel(r)" class="wire-label">{{ r.nav_label || r.label }}</span>
            <span v-if="r.nav_to" class="wire-nav">→</span>
          </div>
        </RGConnectTarget>
        <div
          v-else
          class="wire-region"
          :class="{
            'is-vision': r.source === 'vision',
            'is-hierarchy': r.source === 'hierarchy',
            'is-image': r.is_image,
            'has-snip': screenBlobUrl && r.is_image,
            'is-nav': Boolean(r.nav_to),
          }"
          :style="regionStyle(r)"
          :title="r.nav_to ? `${r.label} → ${r.nav_to}` : r.label"
        >
          <span v-if="showWireLabel(r)" class="wire-label">{{ r.label }}</span>
          <span v-if="r.nav_to" class="wire-nav">→</span>
        </div>
      </template>
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

.nav-wireframe.is-arch-canvas .wire-canvas,
.nav-wireframe.is-preview .wire-canvas {
  max-width: none;
  width: 100%;
  aspect-ratio: 9 / 16;
  height: auto;
  min-height: 0;
  overflow: hidden;
}

.nav-wireframe.is-graph-node.is-arch-canvas .wire-canvas {
  flex: 1 1 auto;
  height: 100%;
  max-height: 100%;
}

.nav-wireframe.is-arch-canvas .wire-label,
.nav-wireframe.is-arch-canvas .wire-nav,
.nav-wireframe.is-arch-canvas .wire-kicker {
  display: none !important;
}

.nav-wireframe.is-preview .wire-label {
  font-size: 9px;
  line-height: 1.2;
}

.wire-region-anchor {
  position: absolute;
  box-sizing: border-box;
}

.wire-region-fill {
  width: 100%;
  height: 100%;
  position: relative;
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

.wire-region.is-hotspot.is-nav,
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

.nav-wireframe.is-graph-node {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.nav-wireframe.is-graph-node:not(.is-arch-canvas) .wire-canvas {
  width: 100%;
  max-width: none;
  aspect-ratio: 9 / 16;
  height: auto;
  min-height: 0;
}

.nav-wireframe.is-compact .wire-label {
  font-size: 6px;
}
</style>
