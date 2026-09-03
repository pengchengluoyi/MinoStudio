<template>
  <div class="scrcpy-window" v-loading="loading" element-loading-text="正在建立连接...">
    <div class="video-wrapper">
      <img v-if="useImageStream" class="scrcpy-image" :src="frameSrc" alt="device screen" />
      <video v-show="!useImageStream" ref="videoRef" autoplay muted playsinline class="scrcpy-video"></video>
    </div>
    <div class="status-bar" v-if="errorMsg">
      <el-alert :title="errorMsg" type="error" show-icon :closable="false" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import JMuxer from 'jmuxer'
import { getWsUrl } from '@/utils/config'
import { getServerInfo } from '@/api/system'

const props = defineProps({
  targetDeviceId: { type: String, required: true },
})

const videoRef = ref(null)
const loading = ref(true)
const errorMsg = ref('')
const useImageStream = ref(false)
const frameSrc = ref('')
let ws = null
let jmuxer = null
const viewerSn = `viewer-${Date.now()}-${Math.floor(Math.random() * 1000)}`

const initPlayer = () => {
  if (!videoRef.value || jmuxer) return
  jmuxer = new JMuxer({
    node: videoRef.value,
    mode: 'video',
    flushingTime: 0,
    fps: 30,
    debug: false,
    onError: (e) => {
      console.error('JMuxer error:', e)
      if (/MediaSource/.test(e.toString())) {
        errorMsg.value = '浏览器不支持 MSE 或 H.264 解码'
      }
    },
  })
}

const toImageSrc = (b64, format = 'jpeg') => {
  if (!b64) return ''
  if (b64.startsWith('data:')) return b64
  return `data:image/${format};base64,${b64}`
}

const handleStreamFrame = (data) => {
  const sn = data?.sn
  if (sn && sn !== props.targetDeviceId) return
  const b64 = data?.base64_image || data?.base64
  if (!b64) return
  useImageStream.value = true
  loading.value = false
  frameSrc.value = toImageSrc(b64, data?.format || 'jpeg')
}

const handleTextMessage = (raw) => {
  try {
    const msg = JSON.parse(raw)
    if (msg?.code !== undefined && msg?.req_id) {
      if (msg.code !== 200) {
        errorMsg.value = msg.msg || '启动投屏失败'
        loading.value = false
      }
      return
    }

    const type = msg?.type
    const data = msg?.data || {}
    if (type === 'STREAM_FRAME') {
      handleStreamFrame(data)
      return
    }
    if (type === 'STREAM_STATUS') {
      loading.value = false
      if (data.status && data.status !== 'success') {
        errorMsg.value = data.message || '推流失败'
      }
    }
  } catch {
    // ignore non-json frames
  }
}

const connect = async () => {
  try {
    const res = await getServerInfo()
    const token = res.data?.token || ''
    const wsUrl = getWsUrl() + (token ? `?token=${token}` : '')
    ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: 'start_stream',
        data: {
          device_sn: props.targetDeviceId,
          viewer_sn: viewerSn,
        },
      }))
    }

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        useImageStream.value = false
        ensureJmuxer()
        handleBinaryData(event.data)
        loading.value = false
        return
      }
      if (typeof event.data === 'string') {
        handleTextMessage(event.data)
      }
    }

    ws.onerror = () => {
      errorMsg.value = '视频流连接断开'
      loading.value = false
    }
  } catch (e) {
    errorMsg.value = `连接初始化失败: ${e.message}`
    loading.value = false
  }
}

const ensureJmuxer = () => {
  initPlayer()
}

const handleBinaryData = (buffer) => {
  const view = new DataView(buffer)
  if (view.byteLength > 4 && view.getUint8(0) === 0xAA && view.getUint8(1) === 0x02) {
    const snLen = view.getUint8(2)
    const dataOffset = 3 + snLen
    const videoData = new Uint8Array(buffer, dataOffset)
    if (jmuxer && videoData.length > 0) {
      jmuxer.feed({ video: videoData })
    }
  }
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      action: 'stop_stream',
      data: {
        device_sn: props.targetDeviceId,
        viewer_sn: viewerSn,
      },
    }))
    ws.close()
  }
  if (jmuxer) {
    jmuxer.destroy()
    jmuxer = null
  }
})
</script>

<style scoped>
.scrcpy-window {
  width: 100%;
  height: 100%;
  min-height: 360px;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  position: relative;
}

.video-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.scrcpy-video,
.scrcpy-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.scrcpy-image {
  display: block;
  background: #000;
}

.status-bar {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  z-index: 10;
}
</style>
