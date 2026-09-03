<template>
  <div class="window-controls no-drag">
  </div>
</template>
<style scoped>
.window-controls {
  display: flex;
  height: 100%;
  min-width: 60px;
  flex-shrink: 0; /* 防止被挤压 */
  /* 关键：防止父级拖拽影响点击 */
  -webkit-app-region: no-drag;
}

</style>