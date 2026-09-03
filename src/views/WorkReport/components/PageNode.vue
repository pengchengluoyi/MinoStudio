<template>
  <div class="page-node" :class="[data.type, { selected }]">
    <Handle type="target" :position="Position.Left" class="io-handle handle-left"/>

    <div class="node-shell">
      <div class="node-content">
        <div class="node-header">
          <ElIcon class="node-icon" :size="14">
            <component :is="iconMap[data.type] || Document"/>
          </ElIcon>
          <span class="node-title">{{ label }}</span>
        </div>

        <div class="node-desc" v-if="data.desc">{{ data.desc }}</div>

        <div class="visual-wrapper" v-if="displayScreenshot">
          <img
              :src="displayScreenshot"
              class="node-screenshot"
              :class="{ 'dimmed': !!displaySkeleton }"
              draggable="false"
              @load="onImageLoaded"
          />

          <!-- 🔥 新增：骨架蒙版层 -->
          <img
              v-if="displaySkeleton"
              :src="displaySkeleton"
              class="skeleton-mask"
              draggable="false"
          />

          <div class="hotspots-overlay">
            <div v-for="(comp, i) in data.interactions" :key="i"
                 class="mini-hotspot" :style="getHotspotStyle(comp)">
              <!-- 🔥 修复：始终渲染 Handle，但在 isPicker 模式下通过样式隐藏，保证连线逻辑正常 -->
              <Handle
                type="source"
                :id="`hotspot-${i}`"
                :position="Position.Right"
                class="hotspot-handle"
                :class="{ 'hidden-handle': isPicker }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" class="io-handle handle-right"/>
  </div>
</template>

<script setup>
import {computed, ref, watch, nextTick, onUnmounted} from 'vue'
import {Handle, Position, useVueFlow} from '@vue-flow/core'
import {Document, Cpu, Aim} from '@element-plus/icons-vue'
import {ElIcon} from 'element-plus'
import {wsGetFile} from '@/api/mWebSocket'

const props = defineProps({
  id: String,
  label: String,
  data: {type: Object, default: () => ({type: 'page', desc: '', interactions: []})},
  selected: Boolean,
  isPicker: { type: Boolean, default: false }
})

const emit = defineEmits(['update-size'])

const {updateNodeInternals} = useVueFlow()
const displayScreenshot = ref('')
const displaySkeleton = ref('')

const loadedNaturalSize = ref({ w: 0, h: 0 })

const onImageLoaded = (event) => {
  const img = event.target;
  const realW = img.naturalWidth;
  const realH = img.naturalHeight;
  loadedNaturalSize.value = { w: realW, h: realH };

  if (!props.data.naturalSize || props.data.naturalSize.w !== realW) {
    emit('update-size', { w: realW, h: realH });
  }

  nextTick(() => updateNodeInternals([props.id]));
}

// 辅助函数：将 DataURL 转换为 BlobURL
// 1. 提升性能：避免渲染进程反复解析巨大的 Base64 字符串
// 2. 规避错误：减少 Opaque Origin Check 失败的概率
const dataURLtoBlobURL = (dataurl) => {
  try {
    const arr = dataurl.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    const blob = new Blob([u8arr], {type: mime})
    return URL.createObjectURL(blob)
  } catch (e) {
    console.warn('DataURL conversion failed', e)
    return dataurl // 转换失败则回退使用原字符串
  }
}

const loadImages = async () => {
  // 清理旧的 BlobURL，防止内存泄漏
  if (displayScreenshot.value && displayScreenshot.value.startsWith('blob:')) {
    URL.revokeObjectURL(displayScreenshot.value)
  }
  if (displaySkeleton.value && displaySkeleton.value.startsWith('blob:')) {
    URL.revokeObjectURL(displaySkeleton.value)
  }

  // 1. 准备路径
  let screenshotSrc = props.data.screenshot
  if (screenshotSrc && typeof screenshotSrc === 'object') {
    screenshotSrc = screenshotSrc.path || screenshotSrc.url || ''
  }
  if (screenshotSrc && typeof screenshotSrc === 'string' && screenshotSrc.startsWith('/static/')) {
    screenshotSrc = screenshotSrc.replace('/static/', '')
  }

  let skeletonSrc = props.data.skeleton_config?.mask_url || props.data.skeleton_config?.filename || ''
  if (skeletonSrc && typeof skeletonSrc === 'string' && skeletonSrc.startsWith('/static/')) {
    skeletonSrc = skeletonSrc.replace('/static/', '')
  }

  // 2. 决策显示逻辑：有screenshot显示screenshot，没有则显示骨架图作为主图
  let mainSrc = ''
  let maskSrc = ''

  if (screenshotSrc) {
    mainSrc = screenshotSrc
    maskSrc = skeletonSrc // 有主图时，骨架图作为蒙版
  } else if (skeletonSrc) {
    mainSrc = skeletonSrc // 无主图时，骨架图作为主图
    maskSrc = ''          // 避免重叠显示
  }

  // 3. 加载图片
  if (mainSrc) {
    displayScreenshot.value = await fetchImage(mainSrc)
  } else {
    displayScreenshot.value = ''
  }

  if (maskSrc) {
    displaySkeleton.value = await fetchImage(maskSrc)
  } else {
    displaySkeleton.value = ''
  }

  nextTick(() => updateNodeInternals([props.id]))
}

// 提取公共的图片获取逻辑
const fetchImage = async (src) => {
  if (!src) return ''
  if (src.startsWith('data:image') || src.startsWith('http')) {
    if (src.startsWith('data:image')) return dataURLtoBlobURL(src)
    return src
  }
  try {
    const res = await wsGetFile(src)
    if (res.code === 200 && res.data) {
      let dataUrl = res.data
      if (typeof dataUrl === 'object') {
        if (dataUrl instanceof Blob) return URL.createObjectURL(dataUrl)
        if (dataUrl instanceof ArrayBuffer) return URL.createObjectURL(new Blob([dataUrl]))
        if (dataUrl.type === 'Buffer' && Array.isArray(dataUrl.data)) {
          const u8 = new Uint8Array(dataUrl.data)
          return URL.createObjectURL(new Blob([u8]))
        }
        if (dataUrl.content && typeof dataUrl.content === 'string') {
          let rawStr = dataUrl.content
          if (!rawStr.startsWith('data:')) {
            let mime = 'image/png'
            if (dataUrl.name) {
              const ext = dataUrl.name.split('.').pop().toLowerCase()
              if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
            }
            rawStr = `data:${mime};base64,${rawStr}`
          }
          return dataURLtoBlobURL(rawStr)
        }
      } else if (typeof dataUrl === 'string') {
        if (!dataUrl.startsWith('data:')) {
          const ext = src.split('.').pop().toLowerCase()
          const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
          dataUrl = `data:${mime};base64,${dataUrl}`
        }
        return dataURLtoBlobURL(dataUrl)
      }
    }
  } catch (e) {
    console.error('Failed to load image', src, e)
  }
  return ''
}

// 🔥 优化：明确监听 skeleton_config 的关键字段，确保变化时触发
watch(
  () => [props.data.screenshot, props.data.skeleton_config?.filename, props.data.skeleton_config?.mask_url],
  loadImages,
  {deep: true, immediate: true}
)

onUnmounted(() => {
  if (displayScreenshot.value && displayScreenshot.value.startsWith('blob:')) {
    URL.revokeObjectURL(displayScreenshot.value)
  }
  if (displaySkeleton.value && displaySkeleton.value.startsWith('blob:')) {
    URL.revokeObjectURL(displaySkeleton.value)
  }
})

// 关键逻辑：确保 naturalSize 存在，否则百分比会计算错误导致偏移
const naturalSize = computed(() => {
  if (loadedNaturalSize.value.w > 0) return loadedNaturalSize.value
  const size = props.data.naturalSize;
  if (size && size.w > 0) return size;
  return { w: 1080, h: 1920 };
})

const getHotspotStyle = (comp) => {
  // 这里的 x, y 必须是相对于截图左上角的原始像素坐标
  return {
    left: `${(comp.x / naturalSize.value.w) * 100}%`,
    top: `${(comp.y / naturalSize.value.h) * 100}%`,
    width: `${(comp.w / naturalSize.value.w) * 100}%`,
    height: `${(comp.h / naturalSize.value.h) * 100}%`,
  }
}

const iconMap = {page: Document, component: Cpu, case: Aim}
</script>

<style scoped>
.page-node {
  width: 220px;
  position: relative;
  background: transparent;
  overflow: visible;
}

.node-shell {
  background: rgba(255, 255, 255, 0.45) !important;
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.page-node:hover .node-shell {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(255, 77, 0, 0.15);
}

.page-node.selected .node-shell {
  border: 2px solid #ff4d00;
}

.io-handle {
  width: 12px;
  height: 12px;
  background: #fff !important;
  border: 2px solid #94a3b8 !important;
  z-index: 100;
  transition: none !important;
}

.handle-left {
  left: -6px;
}

.handle-right {
  right: -6px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(245, 247, 250, 0.3);
}

.node-title {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 截图容器修复 */
.visual-wrapper {
  position: relative; /* 必须是 relative，作为热区的参考系 */
  background: #f1f5f9;
  line-height: 0;
  width: 100%;
}

.node-screenshot {
  width: 100%;
  height: auto;
  display: block;
  opacity: 0.95;
}

/* 🔥 4. 骨架模式下，底图变暗，突出骨架 */
.node-screenshot.dimmed {
  opacity: 0.3;
  filter: grayscale(0.8) contrast(1.2);
}

.skeleton-mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.28;
  mix-blend-mode: normal;
  pointer-events: none;
}

/* 核心修复：热区遮罩层 */
.hotspots-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 让点击穿透到图片，除非点击到具体热区 */
}

.mini-hotspot {
  position: absolute;
  background: rgba(255, 77, 0, 0.15);
  border: 1px solid rgba(255, 77, 0, 0.4);
  pointer-events: auto; /* 恢复热区的交互 */
}

.hotspot-handle {
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background: #ff4d00 !important;
  border: 1px solid #fff !important;
}

/* 🔥 新增：隐藏 Handle 的样式 */
.hidden-handle {
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  border: none !important;
}
</style>