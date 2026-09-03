<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElDialog, ElInput, ElIcon } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { actions as allActions } from '@/logic/ActionRegistry'

const router = useRouter()

const visible = ref(false)
const searchInputRef = ref(null)
const searchTerm = ref('')
const selectedIndex = ref(0)

const filteredActions = computed(() => {
  if (!searchTerm.value) {
    return allActions
  }
  const lowerCaseTerm = searchTerm.value.toLowerCase()
  return allActions.filter(action =>
    action.title.toLowerCase().includes(lowerCaseTerm) ||
    action.keywords?.some(kw => kw.toLowerCase().includes(lowerCaseTerm))
  )
})

const open = () => {
  visible.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

const close = () => {
  visible.value = false
  searchTerm.value = ''
  selectedIndex.value = 0
}

const executeAction = (action) => {
  if (action && action.handler) {
    action.handler(router)
    close()
  }
}

const onKeydown = (e) => {
  if (!visible.value) return

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      if (filteredActions.value.length > 0) {
        selectedIndex.value = (selectedIndex.value + 1) % filteredActions.value.length
      }
      break
    case 'ArrowUp':
      e.preventDefault()
      if (filteredActions.value.length > 0) {
        selectedIndex.value = (selectedIndex.value - 1 + filteredActions.value.length) % filteredActions.value.length
      }
      break
    case 'Enter':
      e.preventDefault()
      executeAction(filteredActions.value[selectedIndex.value])
      break
    case 'Escape':
      close()
      break
  }
}

defineExpose({ open })

onMounted(() => {
  // The global Cmd+K listener is in App.vue, this is for palette-specific keys
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    :modal="true"
    width="600px"
    top="20vh"
    class="command-palette"
    @closed="close"
  >
    <template #header>
      <el-input
        ref="searchInputRef"
        v-model="searchTerm"
        placeholder="Type a command or search..."
        size="large"
        clearable
        @input="selectedIndex = 0"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </template>

    <div class="results-list" v-if="filteredActions.length > 0">
      <div
        v-for="(action, index) in filteredActions"
        :key="action.id"
        class="result-item"
        :class="{ 'is-selected': index === selectedIndex }"
        @click="executeAction(action)"
        @mouseenter="selectedIndex = index"
      >
        <span class="item-title">{{ action.title }}</span>
        <span class="item-shortcut">Enter</span>
      </div>
    </div>
    <div v-else class="no-results">
      No results found.
    </div>
  </el-dialog>
</template>

<style>
/* Use global styles for the dialog override */
.command-palette .el-dialog__header { padding: 12px; margin: 0; border-bottom: 1px solid var(--el-border-color-light); }
.command-palette .el-dialog__body { padding: 8px; max-height: 400px; overflow-y: auto; }
.command-palette .el-input__wrapper { box-shadow: none !important; }
.command-palette .el-input__inner { font-size: 16px; }
</style>

<style scoped>
.results-list { display: flex; flex-direction: column; }
.result-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 6px; cursor: pointer; user-select: none; transition: background-color 0.1s ease; }
.result-item.is-selected { background-color: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.item-title { font-size: 14px; }
.item-shortcut { font-size: 12px; color: var(--el-text-color-placeholder); border: 1px solid var(--el-border-color); padding: 2px 6px; border-radius: 4px; }
.no-results { padding: 40px 20px; text-align: center; color: var(--el-text-color-secondary); }
</style>