<template>
  <header class="app-titlebar">
    <div class="mac-spacer" v-if="showMacTraffic"></div>
    <div id="titlebar-center-portal" class="titlebar-center"></div>
    <div class="win-controls" v-if="showWinControls">
      <div class="control-btn minimize" @click="handleMinimize">
        <el-icon><Minus /></el-icon>
      </div>
      <div class="control-btn maximize" @click="handleMaximize">
        <el-icon><FullScreen /></el-icon>
      </div>
      <div class="control-btn close" @click="handleClose">
        <el-icon><Close /></el-icon>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ElIcon } from 'element-plus'
import { Minus, FullScreen, Close } from '@element-plus/icons-vue'
import { useAppChrome } from '@/composables/useAppChrome'

const { showMacTraffic, showWinControls, handleMinimize, handleMaximize, handleClose } = useAppChrome()
</script>

<style scoped>
.app-titlebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 50px;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  -webkit-app-region: no-drag;
  user-select: none;
}

.mac-spacer {
  width: 80px;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
  pointer-events: none;
}

.titlebar-center {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  -webkit-app-region: drag;
  overflow: hidden;
}

.win-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  color: #666;
}

.control-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.control-btn.close:hover {
  background: #e81123;
  color: white;
}
</style>
