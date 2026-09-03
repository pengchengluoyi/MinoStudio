<script setup>
import { ref, onMounted, onUnmounted, reactive, computed, watch } from 'vue'
import { ElMessage, ElCard, ElButton, ElTable, ElTableColumn, ElPagination, ElTag, ElIcon, ElEmpty, vLoading, ElSlider } from 'element-plus'
import { Refresh, Back, Check, VideoPlay, VideoPause, Aim, Mouse, Reading, Close, Connection } from '@element-plus/icons-vue'
import { initWebSocket, wsGetFile, wsGetTimelineList, wsGetTimelineDetail } from '@/api/mWebSocket'
import { useBlobUrlCache } from '@/composables/useBlobUrlCache'
import PayloadView from '@/components/PayloadView.vue'

// ================== 列表页状态 ==================
const loading = ref(false)
const tableData = ref([])
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

// ================== 详情页状态 ==================
const showDetailDashboard = ref(false) // 控制是否显示详情页
const detailLoading = ref(false)
const detailList = ref([]) // 所有步骤
const currentRunId = ref('')
const activeStepIndex = ref(0) // 当前选中的步骤索引
const {
  map: screenshotUrlMap,
  set: setScreenshotUrl,
  has: hasScreenshotUrl,
  clear: clearScreenshotUrls,
} = useBlobUrlCache(48)
const currentImgNaturalSize = ref({ w: 0, h: 0 })
const isPlaying = ref(false)
let playTimer = null
const pendingScreenshots = new Set() // 🔥 防止重复请求
let imageObserver = null // 🔥 懒加载观察器

// ================== 布局调整 ==================
const leftPanelWidth = ref(300)
const rightPanelWidth = ref(350)

const startResize = (side, e) => {
  const startX = e.clientX
  const startWidth = side === 'left' ? leftPanelWidth.value : rightPanelWidth.value

  const onMouseMove = (ev) => {
    const diff = ev.clientX - startX
    if (side === 'left') {
      leftPanelWidth.value = Math.max(200, Math.min(600, startWidth + diff))
    } else {
      // 右侧面板：向左拖动(diff负数)增加宽度
      rightPanelWidth.value = Math.max(250, Math.min(600, startWidth - diff))
    }
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// 当前选中的步骤数据
const currentStep = computed(() => {
  if (!detailList.value.length || activeStepIndex.value === -1) return null
  return detailList.value[activeStepIndex.value]
})

// 解析步骤数据的通用方法
const parseStepData = (data) => {
  if (!data) return {}
  try {
    const res = typeof data === 'string' ? JSON.parse(data) : data
    return res || {}
  } catch (e) {
    // 🔥 尝试修复 Python 风格的单引号 JSON 字符串
    if (typeof data === 'string') {
      try {
        const fixed = data.replace(/'/g, '"').replace(/None/g, 'null').replace(/True/g, 'true').replace(/False/g, 'false')
        return JSON.parse(fixed)
      } catch (e2) {}
    }
    return data
  }
}

// 解析当前步骤的 Data (JSON字符串 -> 对象)
const currentStepData = computed(() => {
  if (!currentStep.value || !currentStep.value.data) return {}
  return parseStepData(currentStep.value.data)
})

// 辅助：获取截图路径字符串
const getScreenshotPath = (val) => {
  if (!val || val === 'None') return ''
  if (typeof val === 'string') return val
  if (typeof val === 'object') return val.path || val.url || ''
  return ''
}

// 🔥 新增：过滤出仅包含截图的步骤用于顶部时间轴 (Midscene 风格)
const filmstripItems = computed(() => {
  return detailList.value.map((step, index) => {
    // 🔥 仅 screenshot 和 vision 类型才去获取截图
    if (!['screenshot', 'vision'].includes(step.type)) return null
    const d = parseStepData(step.data)
    // 兼容：如果 d 是字符串则直接作为路径，否则取 .screenshot
    const path = getScreenshotPath(typeof d === 'string' ? d : d?.screenshot)
    return path ? { step, index, path } : null
  }).filter(item => item !== null)
})

const currentScreenshotUrl = computed(() => {
  // 1. 尝试获取当前步骤的截图
  let path = ''
  if (currentStep.value && ['screenshot', 'vision'].includes(currentStep.value.type)) {
    let data = currentStepData.value
    path = getScreenshotPath(typeof data === 'string' ? data : data?.screenshot)
  }

  // 2. 如果当前步骤没有截图，则向前回溯寻找最近的截图 (Context)
  if (!path && detailList.value.length) {
    for (let i = activeStepIndex.value - 1; i >= 0; i--) {
      const step = detailList.value[i]
      // 🔥 回溯时也只看 screenshot/vision 类型
      if (['screenshot', 'vision'].includes(step.type)) {
        const d = parseStepData(step.data)
        const p = getScreenshotPath(typeof d === 'string' ? d : d?.screenshot)
        if (p) {
          path = p
          break
        }
      }
    }
  }

  return path ? screenshotUrlMap[path] : ''
})

const highlightStyle = computed(() => {
  const data = currentStepData.value
  if (!data || !currentImgNaturalSize.value.w) return { display: 'none' }

  // 仅针对 click/tap 类型显示高亮，或者如果有 bbox/center 数据就显示
  const type = currentStep.value?.type?.toLowerCase() || ''
  // if (!type.includes('click') && !type.includes('tap')) return { display: 'none' }

  let x, y, w, h
  // 1. 优先使用 bbox [x, y, w, h]
  if (Array.isArray(data.bbox) && data.bbox.length === 4) {
    [x, y, w, h] = data.bbox
  }
  // 2. 其次使用 center [x, y]
  else if (Array.isArray(data.center) && data.center.length === 2) {
    [x, y] = data.center
    w = 30; h = 30; // 默认点击区域大小
    x -= w/2; y -= h/2;
  }
  // 3. 🔥 新增：支持直接的 x, y 坐标 (常见于 click/tap 事件)
  else if (typeof data.x === 'number' && typeof data.y === 'number') {
    x = data.x
    y = data.y
    w = 30; h = 30;
    x -= w/2; y -= h/2;
  }
  // 4. 🔥 新增：支持直接的 [x, y] 数组 (常见于 click 自带 Data Detail)
  else if (Array.isArray(data) && data.length === 2) {
    [x, y] = data
    w = 30; h = 30;
    x -= w/2; y -= h/2;
  }
  // 5. 🔥 新增：支持 position [x, y] (gesture 类型常见)
  else if (Array.isArray(data.position) && data.position.length === 2) {
    [x, y] = data.position
    w = 30; h = 30;
    x -= w/2; y -= h/2;
  }
  else {
    return { display: 'none' }
  }

  const left = (x / currentImgNaturalSize.value.w) * 100
  const top = (y / currentImgNaturalSize.value.h) * 100
  const width = (w / currentImgNaturalSize.value.w) * 100
  const height = (h / currentImgNaturalSize.value.h) * 100

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    position: 'absolute',
    border: '2px solid #F56C6C',
    backgroundColor: 'rgba(245, 108, 108, 0.3)',
    borderRadius: '50%', // 圆形更像点击
    boxShadow: '0 0 8px rgba(245, 108, 108, 0.6)', // 增加发光效果
    pointerEvents: 'none',
    zIndex: 10
  }
})

// 🔥 新增：箭头样式 (指向点击位置)
const arrowStyle = computed(() => {
  const data = currentStepData.value
  if (!data || !currentImgNaturalSize.value.w) return { display: 'none' }

  const type = currentStep.value?.type?.toLowerCase() || ''
  if (!type.includes('click') && !type.includes('tap')) return { display: 'none' }

  let x, y
  if (Array.isArray(data) && data.length === 2) {
    [x, y] = data
  } else if (Array.isArray(data.center) && data.center.length === 2) {
    [x, y] = data.center
  } else if (Array.isArray(data.position) && data.position.length === 2) {
    [x, y] = data.position
  } else if (typeof data.x === 'number' && typeof data.y === 'number') {
    x = data.x
    y = data.y
  } else if (Array.isArray(data.bbox) && data.bbox.length === 4) {
    x = data.bbox[0] + data.bbox[2]/2
    y = data.bbox[1] + data.bbox[3]/2
  } else {
    return { display: 'none' }
  }

  const left = (x / currentImgNaturalSize.value.w) * 100
  const top = (y / currentImgNaturalSize.value.h) * 100

  return {
    left: `${left}%`,
    top: `${top}%`,
    position: 'absolute',
    zIndex: 20,
    pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
  }
})

const getStepScreenshot = (step) => {
  const data = parseStepData(step.data)
  const path = getScreenshotPath(typeof data === 'string' ? data : data?.screenshot)
  return path ? screenshotUrlMap[path] : null
}

// 🔥 新增：监听当前步骤变化，如果截图未加载则立即请求
watch(currentStep, (newStep) => {
  if (newStep && ['screenshot', 'vision'].includes(newStep.type)) {
    const d = parseStepData(newStep.data)
    const path = typeof d === 'string' ? d : d?.screenshot
    if (path) loadScreenshot(path)
  }
})

// ================== 播放控制 ==================
const togglePlay = () => {
  if (isPlaying.value) pause()
  else play()
}

const play = () => {
  if (activeStepIndex.value >= detailList.value.length - 1) {
    activeStepIndex.value = 0
  }
  isPlaying.value = true
  playNext()
}

const pause = () => {
  isPlaying.value = false
  if (playTimer) clearTimeout(playTimer)
  playTimer = null
}

const playNext = () => {
  if (!isPlaying.value) return
  // 默认每步播放间隔 1000ms
  playTimer = setTimeout(() => {
    if (activeStepIndex.value < detailList.value.length - 1) {
      activeStepIndex.value++
      playNext()
    } else {
      pause()
    }
  }, 1000)
}

const formatTime = (ms) => {
  if (!ms || ms < 0) return '00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const startTime = computed(() => detailList.value.length ? detailList.value[0].timestamp : 0)
const endTime = computed(() => detailList.value.length ? detailList.value[detailList.value.length - 1].timestamp : 0)
const currentProgressTime = computed(() => currentStep.value ? formatTime(currentStep.value.timestamp - startTime.value) : '00:00')
const totalDurationTime = computed(() => formatTime(endTime.value - startTime.value))

// ================== API 方法 ==================
const fetchData = async () => {
  loading.value = true
  try {
    const res = await wsGetTimelineList({ page: pagination.page, page_size: pagination.pageSize })
    if (res.code === 200) {
      tableData.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (e) {
    ElMessage.error('获取列表失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

// 进入详情视图
const handleDetail = async (row) => {
  clearScreenshotUrls()
  currentRunId.value = row.run_id
  showDetailDashboard.value = true // 切换视图
  detailLoading.value = true
  detailList.value = []
  activeStepIndex.value = 0

  try {
    const res = await wsGetTimelineDetail(row.run_id)
    if (res.code === 200) {
      detailList.value = res.data
      // 默认选中第一个
      if (detailList.value.length > 0) activeStepIndex.value = 0

      pause() // 重置播放状态
    }
  } catch (e) {
    ElMessage.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

// 辅助函数：将 DataURL 转换为 BlobURL 以提升性能
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

const loadScreenshot = async (rawPath) => {
  const path = getScreenshotPath(rawPath)
  if (!path) return
  if (hasScreenshotUrl(path)) return
  if (pendingScreenshots.has(path)) return // 🔥 如果正在加载中，跳过

  // 如果已经是 base64 或 http 链接，直接使用
  if (path.startsWith('data:') || path.startsWith('http')) {
    if (path.startsWith('data:')) {
      setScreenshotUrl(path, dataURLtoBlobURL(path))
    } else {
      setScreenshotUrl(path, path)
    }
    return
  }

  pendingScreenshots.add(path)
  try {
    const res = await wsGetFile(path)
    if (res.code === 200) {
      const data = res.data
      let url = ''
      if (data instanceof Blob) url = URL.createObjectURL(data)
      else if (data instanceof ArrayBuffer) url = URL.createObjectURL(new Blob([data]))
      else if (data.type === 'Buffer' && Array.isArray(data.data)) {
        const u8 = new Uint8Array(data.data)
        url = URL.createObjectURL(new Blob([u8]))
      } else if (data.content && typeof data.content === 'string') {
        let rawStr = data.content
        if (!rawStr.startsWith('data:')) {
          let mime = 'image/png'
          if (data.name) {
            const ext = data.name.split('.').pop().toLowerCase()
            if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
          }
          rawStr = `data:${mime};base64,${rawStr}`
        }
        url = dataURLtoBlobURL(rawStr)
      } else if (typeof data === 'string') {
        let dataUrl = data
        if (data && !data.startsWith('data:')) {
          const ext = path.split('.').pop().toLowerCase()
          const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png'
          dataUrl = `data:${mime};base64,${data}`
        } else {
          dataUrl = data
        }
        url = dataURLtoBlobURL(dataUrl)
      }
      if (url) setScreenshotUrl(path, url)
    }
  } catch (e) { console.error(e) } finally {
    pendingScreenshots.delete(path)
  }
}

// 返回列表视图
const goBack = () => {
  showDetailDashboard.value = false
  pause()
  detailList.value = []
  clearScreenshotUrls()
}

// 辅助：获取图标
const getStepIcon = (type) => {
  const t = type?.toLowerCase() || ''
  if (t.includes('plan')) return Reading
  if (t.includes('locate')) return Aim
  if (t.includes('tap') || t.includes('click')) return Mouse
  return VideoPlay
}

// 辅助：格式化耗时 (模拟数据，如果后端有 duration 字段请替换)
const getDuration = (item) => {
  return item.duration ? `${item.duration}ms` : '0.5s' // 占位
}

const onImgLoad = (e) => {
  currentImgNaturalSize.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }
}

// 🔥 懒加载观察逻辑
const observeItem = (el, path) => {
  if (el && path && !hasScreenshotUrl(path)) {
    el.dataset.path = path
    if (imageObserver) imageObserver.observe(el)
  }
}

onMounted(() => {
  initWebSocket()
  fetchData()

  // 🔥 初始化 IntersectionObserver
  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const path = entry.target.dataset.path
        if (path) {
          loadScreenshot(path)
          imageObserver.unobserve(entry.target)
        }
      }
    })
  }, {
    rootMargin: '0px 200px 0px 200px' // 水平方向提前 200px 加载
  })
})

onUnmounted(() => {
  pause()
  clearScreenshotUrls()
  if (imageObserver) {
    imageObserver.disconnect()
    imageObserver = null
  }
})
</script>

<template>
  <div class="app-container">

    <transition name="el-fade-in-linear">
      <el-card v-if="!showDetailDashboard" shadow="never" class="main-card">
        <template #header>
          <div class="card-header">
            <span>时间线回放 / Timeline</span>
            <el-button circle :icon="Refresh" @click="fetchData" />
          </div>
        </template>

        <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
          <el-table-column prop="run_id" label="Run ID" min-width="180">
            <template #default="{ row }"><span class="mono-font">{{ row.run_id }}</span></template>
          </el-table-column>
          <el-table-column prop="start_time" label="开始时间" width="180" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-wrapper">
          <el-pagination
             background layout="total, prev, pager, next"
             :total="pagination.total"
             :page-size="pagination.pageSize"
             @current-change="(p) => { pagination.page = p; fetchData() }"
          />
        </div>
      </el-card>
    </transition>

    <div v-if="showDetailDashboard" class="dashboard-container" v-loading="detailLoading">
      <div class="dashboard-header">
        <div class="header-left">
          <el-button link :icon="Back" @click="goBack" class="back-btn">Back</el-button>
          <span class="run-title">Execution: {{ currentRunId }}</span>
        </div>
        <div class="header-right">
          <el-tag type="success" effect="dark">Finished</el-tag>
        </div>
      </div>

      <div class="dashboard-body">

        <div class="panel-left" :style="{ width: leftPanelWidth + 'px' }">
          <div class="panel-title">Execution Steps</div>
          <div class="steps-scroll-area">
            <div
              v-for="(step, index) in detailList"
              :key="index"
              class="step-item"
              :class="{ 'is-active': activeStepIndex === index }"
              @click="activeStepIndex = index"
            >
              <div class="step-status">
                <el-icon color="#67C23A" v-if="step.type !== 'error'"><Check /></el-icon>
                <el-icon color="#F56C6C" v-else><Close /></el-icon>
              </div>
              <div class="step-content">
                <div class="step-type">
                  <el-icon class="type-icon"><component :is="getStepIcon(step.type)" /></el-icon>
                  {{ step.type }}
                </div>
                </div>
              <div class="step-time">{{ getDuration(step) }}</div>
            </div>
          </div>
        </div>

        <!-- 左侧拖拽条 -->
        <div class="resizer" @mousedown="startResize('left', $event)"></div>

        <div class="panel-center">
          <!-- 播放控制栏 -->
          <div class="timeline-controls">
            <el-button circle :icon="isPlaying ? VideoPause : VideoPlay" @click="togglePlay" type="primary" plain />
            <div class="progress-container">
              <el-slider
                v-model="activeStepIndex"
                :max="Math.max(0, detailList.length - 1)"
                :format-tooltip="(val) => `Step ${val + 1}`"
                @change="pause"
              />
            </div>
            <div class="time-label">{{ currentProgressTime }} / {{ totalDurationTime }}</div>
          </div>

          <div class="filmstrip-bar">
            <div class="film-frame"
                 v-for="(item, i) in filmstripItems"
                 :key="i"
                 :ref="(el) => observeItem(el, item.path)"
                 :class="{ active: activeStepIndex === item.index }"
                 @click="activeStepIndex = item.index">
              <div class="frame-img-placeholder">
                 <img v-if="screenshotUrlMap[item.path]" :src="screenshotUrlMap[item.path]" class="thumb-img" />
                 <div v-else class="img-loading-skeleton"></div>
              </div>
              <div class="frame-time">{{ new Date(item.step.timestamp).toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'}) }}</div>
            </div>
          </div>

          <div class="canvas-area">
            <div class="device-mockup">
              <div class="screen-content">
                <div v-if="currentScreenshotUrl" class="img-wrapper">
                   <img :src="currentScreenshotUrl" @load="onImgLoad" class="main-screenshot" />
                   <div v-if="highlightStyle.display !== 'none'" class="highlight-box" :style="highlightStyle"></div>
                   <div v-if="arrowStyle.display !== 'none'" :style="arrowStyle">
                     <svg viewBox="0 0 24 24" width="32" height="32" fill="#F56C6C" style="display: block; transform: translate(-3px, -2px);">
                       <path d="M5.5 3.5l12 12-5.5 1.5 3.5 6-2.5 1.5-3.5-6-4 4z"></path>
                     </svg>
                   </div>
                </div>
                <el-empty v-else description="No Screenshot" :image-size="100" />
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧拖拽条 -->
        <div class="resizer" @mousedown="startResize('right', $event)"></div>

        <div class="panel-right" :style="{ width: rightPanelWidth + 'px' }">
          <div class="panel-title">Information</div>

          <div v-if="currentStep" class="info-content">

            <div class="info-block">
              <div class="label">Instruction / Type</div>
              <div class="value-text">{{ currentStep.type }}</div>
            </div>

            <div class="info-block">
              <div class="label">Data Detail</div>
              <div class="code-box">
                <PayloadView :value="currentStepData" />
              </div>
            </div>

            <div class="info-block">
              <div class="label">Meta</div>
              <div class="meta-grid">
                <div class="meta-item">
                  <span>Time</span>
                  <strong>{{ new Date(currentStep.timestamp).toLocaleTimeString() }}</strong>
                </div>
              </div>
            </div>
          </div>
          <el-empty v-else description="Select a step" />
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* 基础样式 */
.app-container {
  height: 100vh;
  background-color: #f0f2f5;
  display: flex;
  flex-direction: column;
}
.mono-font { font-family: 'Menlo', 'Monaco', monospace; color: #409EFF; }
.card-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
.pagination-wrapper { margin-top: 20px; display: flex; justify-content: flex-end; }

/* Dashboard 容器 */
.dashboard-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}

/* 顶部 Header */
.dashboard-header {
  height: 50px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #fff;
}
.run-title { font-weight: 600; margin-left: 10px; font-size: 14px; }
.back-btn { font-size: 14px; }

/* 三栏布局主体 */
.dashboard-body {
  flex: 1;
  display: flex;
  overflow: hidden; /* 防止整个页面滚动 */
}

/* === 左侧面板 (Steps) === */
.panel-left {
  display: flex;
  flex-direction: column;
  background: #fff;
  flex-shrink: 0; /* 防止被压缩 */
}
.panel-title {
  padding: 15px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}
.steps-scroll-area {
  flex: 1;
  overflow-y: auto;
}
.step-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid #f9f9f9;
  transition: all 0.2s;
}
.step-item:hover { background-color: #f5f7fa; }
.step-item.is-active {
  background-color: #ecf5ff;
  border-right: 3px solid #409EFF;
}
.step-status { margin-right: 10px; display: flex; align-items: center; }
.step-content { flex: 1; }
.step-type { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 5px; }
.step-time { font-size: 12px; color: #999; }

/* 拖拽条 */
.resizer {
  width: 5px;
  background: #f0f2f5;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.2s;
  border-left: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
}
.resizer:hover { background: #409EFF; border-color: #409EFF; }

/* === 中间面板 (Visual) === */
.panel-center {
  flex: 1;
  background: #f2f3f5;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
}
.timeline-controls {
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 15px;
}
.progress-container { flex: 1; padding: 0 10px; }
.time-label {
  font-size: 12px; color: #909399; font-family: monospace; min-width: 80px; text-align: right;
}
.filmstrip-bar {
  height: 130px;
  background: #ffffff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding: 0 16px;
  gap: 16px;
}
/* 隐藏滚动条 */
.filmstrip-bar::-webkit-scrollbar { height: 6px; }
.filmstrip-bar::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }

.film-frame {
  flex-shrink: 0;
  width: auto;
  height: 90px;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #f2f3f5;
  position: relative;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
  align-items: center;
}
.film-frame:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.film-frame.active {
  border-color: #409EFF;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.frame-time {
  margin-top: auto;
  width: 100%;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.frame-img-placeholder {
  width: auto; height: 60px; margin: 0 auto; border-radius: 2px; overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.thumb-img { width: auto; height: 100%; object-fit: contain; display: block; }

.canvas-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  overflow: hidden;
}
.device-mockup {
  width: auto;
  height: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
  position: relative;
  overflow: visible;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.screen-content {
  height: auto;
  max-height: 100%;
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  overflow: hidden;
  background: #fff;
  display: flex; align-items: center; justify-content: center;
}
.img-wrapper { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.main-screenshot { max-width: 100%; max-height: 100%; display: block; }
.highlight-box {
  /* style computed */
}

/* === 右侧面板 (Info) === */
.panel-right {
  background: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.info-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.info-block { margin-bottom: 25px; }
.info-block .label {
  font-size: 12px; color: #909399; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;
}
.value-text { font-size: 14px; color: #333; line-height: 1.5; }
.code-box {
  background: #f6f8fa;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #eee;
}
.code-box pre {
  margin: 0;
  font-family: 'Menlo', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #444;
}
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.meta-item { display: flex; flex-direction: column; font-size: 12px; }
.meta-item strong { margin-top: 4px; font-size: 13px; color: #333; }

.img-loading-skeleton {
  width: 100px; height: 100%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
}
@keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>