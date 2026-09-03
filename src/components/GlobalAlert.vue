<template>
  <transition name="fade">
    <div v-if="visible" class="alert-overlay" @click.self="close">
      <div class="alert-modal">
        <div class="modal-header" :class="type">
          <div class="icon-wrapper">{{ icon }}</div>
          <h3>{{ title }}</h3>
        </div>

        <div class="modal-body">
          <p>{{ message }}</p>
        </div>

        <div class="modal-footer">
          <button class="btn primary" @click="close">确定</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const visible = ref(false)
const title = ref('')
const message = ref('')
const type = ref('info') // info, warning, error

const icon = computed(() => {
  switch (type.value) {
    case 'error': return '❌'
    case 'warning': return '⚠️'
    case 'success': return '✅'
    default: return 'ℹ️'
  }
})

const close = () => {
  visible.value = false
}

onMounted(() => {
  if (window.electronAPI) {
    // 监听主进程发来的显示弹窗指令
    window.electronAPI.onShowAlert((data) => {
      title.value = data.title || '提示'
      message.value = data.message || ''
      type.value = data.type || 'info'
      visible.value = true
    })
  }
})
</script>

<style scoped>
.alert-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000; /* 比 UpdatePrompt 更高一点 */
  backdrop-filter: blur(2px);
}

.alert-modal {
  background: white;
  width: 360px;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.modal-header {
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
}

.modal-body {
  padding: 24px 20px;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}

.modal-footer {
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  background: #fff;
}

.btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  background: #3b82f6;
  color: white;
  transition: background 0.2s;
}

.btn:hover {
  background: #2563eb;
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
</style>