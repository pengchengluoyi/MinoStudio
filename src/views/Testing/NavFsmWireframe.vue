<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { RGConnectTarget } from '@relation-graph/vue'
import request from '@/utils/request'
import { hotspotTargetId, RG_TARGET_CONNECT } from '@/utils/navRelationGraph'

const props = defineProps({
  wireframe: { type: Object, default: null },
  turnLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  graphNode: { type: Boolean, default: false },
  appId: { type: String, default: '' },
  stateId: { type: String, default: '' },
  connectHotspots: { type: Boolean, default: false },
  editableHotspots: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  archCanvas: { type: Boolean, default: false },
  navOutgoing: { type: Array, default: () => [] },
  layoutClass: { type: String, default: '' },
  layoutExtent: { type: Object, default: null },
})

function regionEligibleForNavAnchor(r) {
  const rect = r?.rect || {}
  const w = Number(rect.w || 0)
  const h = Number(rect.h || 0)
  if (w * h > 0.22) return false
  if (w > 0.88 && h > 0.35) return false
  if (h > 0.55 && w > 0.45) return false
  return true
}

const navOutSet = computed(
  () => new Set((props.navOutgoing || []).map((id) => String(id || '').trim()).filter(Boolean)),
)

function regionHasNavLine(r) {
  const dst = String(r?.nav_to || '').trim()
  if (!dst) return false
  if (!navOutSet.value.size) return Boolean(r.nav_to)
  return navOutSet.value.has(dst)
}

function showConnectTarget(r) {
  if (!props.connectHotspots) return false
  if (!regionHasNavLine(r)) return false
  if (String(r?.source || '') === 'nav_hint') return true
  return regionEligibleForNavAnchor(r)
}

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

const isFeedRegion = (r) => String(r?.morph_axis || '') === 'vertical'

const isHorizontalMorphRegion = (r) => String(r?.morph_axis || '') === 'horizontal'

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
    <div
      class="wire-canvas"
      :class="{
        'is-infinite-feed': layoutClass === 'infinite_feed' && !archCanvas,
        'is-horizontal-pager': layoutClass === 'horizontal_pager' && !archCanvas,
        'is-fixed-viewport': layoutClass === 'fixed_viewport',
      }"
      role="img"
      aria-label="屏面线框"
      :style="canvasBg"
    >
      <template v-for="r in regions" :key="`${r.source}-${r.id}`">
        <RGConnectTarget
          v-if="showConnectTarget(r)"
          :target-id="targetIdFor(r)"
          :target-type="RG_TARGET_CONNECT"
          junction-point="bottom"
          dom-mode="wrap"
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
              'is-nav': regionHasNavLine(r),
              'is-hotspot': showConnectTarget(r),
              'is-feed-slot': isFeedRegion(r),
              'is-h-morph-slot': isHorizontalMorphRegion(r),
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
            'is-nav': regionHasNavLine(r),
            'is-feed-slot': isFeedRegion(r),
            'is-h-morph-slot': isHorizontalMorphRegion(r),
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

.wire-canvas.is-infinite-feed {
  border-style: dashed;
  border-color: #94a3b8;
}

.wire-canvas.is-horizontal-pager::after {
  content: '⇄';
  position: absolute;
  right: 6px;
  top: 6px;
  font-size: 11px;
  color: #b45309;
  font-weight: 700;
  pointer-events: none;
}

.wire-region.is-feed-slot {
  border-style: dashed !important;
  border-color: #64748b !important;
  opacity: 0.92;
}

.wire-region.is-h-morph-slot {
  border-style: dotted !important;
  border-color: #b45309 !important;
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

.nav-wireframe.is-graph-node.is-arch-canvas {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nav-wireframe.is-graph-node.is-arch-canvas .wire-canvas {
  flex: 0 0 auto;
  width: 100%;
  aspect-ratio: 9 / 16;
  height: auto;
  max-height: none;
}

.nav-wireframe.is-arch-canvas .wire-region.is-hotspot.is-nav::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 18%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  border-radius: 50%;
  background: #2563eb;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  pointer-events: none;
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
