<template>
  <transition name="fade">
    <div v-if="show" class="update-overlay">
      <div class="update-modal">
        <div class="modal-header">
          <div class="icon-wrapper">🚀</div>
          <h3>发现新版本 v{{ version }}</h3>
        </div>

        <div class="modal-body">
          <!-- 更新日志 (支持 HTML) -->
          <div class="release-notes" v-html="releaseNotes || '修复了一些已知问题，优化了用户体验。'"></div>

          <!-- 进度条 -->
          <div v-if="isDownloading" class="progress-section">
            <div class="progress-info">
              <span>正在下载...</span>
              <span>{{ progress.toFixed(1) }}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-bar" :style="{ width: progress + '%' }"></div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <!-- 状态 1: 提示更新 -->
          <template v-if="!isDownloading && !isDownloaded">
            <button class="btn secondary" @click="close">稍后提醒</button>
            <button class="btn primary" @click="startDownload">立即更新</button>
          </template>

          <!-- 状态 2: 下载中 -->
          <template v-if="isDownloading">
            <button class="btn disabled" disabled>下载中...</button>
          </template>

          <!-- 状态 3: 下载完成 -->
          <template v-if="isDownloaded">
            <button class="btn primary" @click="install">立即重启安装</button>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const show = ref(false)
const version = ref('')
const releaseNotes = ref('')
const isDownloading = ref(false)
const isDownloaded = ref(false)
const progress = ref(0)

onMounted(() => {
  if (!window.electronAPI) return

  // 1. 监听发现新版本
  window.electronAPI.onUpdateAvailable((info) => {
    console.log('Update available:', info)
    version.value = info.version
    releaseNotes.value = info.releaseNotes || ''
    show.value = true
  })

  // 2. 监听下载进度
  window.electronAPI.onUpdateProgress((progObj) => {
    isDownloading.value = true
    progress.value = progObj.percent
  })

  // 3. 监听下载完成
  window.electronAPI.onUpdateDownloaded(() => {
    isDownloading.value = false
    isDownloaded.value = true
  })
})

const close = () => {
  show.value = false
}

const startDownload = () => {
  isDownloading.value = true
  window.electronAPI.startDownload()
}

const install = () => {
  window.electronAPI.quitAndInstall()
}
</script>

<style scoped>
.update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.update-modal {
  background: white;
  width: 400px;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.modal-header {
  padding: 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-wrapper {
  font-size: 24px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.modal-body {
  padding: 20px;
}

.release-notes {
  max-height: 200px;
  overflow-y: auto;
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
  background: #f1f5f9;
  padding: 12px;
  border-radius: 8px;
}

.progress-section {
  margin-top: 16px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.progress-track {
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

.modal-footer {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #e2e8f0;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn.primary {
  background: #3b82f6;
  color: white;
}

.btn.primary:hover {
  background: #2563eb;
}

.btn.secondary {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
}

.btn.secondary:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

.btn.disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>