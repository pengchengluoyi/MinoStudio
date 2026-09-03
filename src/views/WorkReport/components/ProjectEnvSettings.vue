<template>
  <el-dialog
    :model-value="modelValue"
    width="720px"
    class="project-env-dialog"
    align-center
    destroy-on-close
    @close="$emit('update:modelValue', false)"
  >
    <template #header>
      <div class="dialog-head">
        <div>
          <h2 class="dialog-title">运行环境</h2>
          <p class="dialog-desc">{{ displayProjectName }} · 也可在「设置 → 项目环境」中管理</p>
        </div>
        <el-button link type="primary" @click="openInSettings">在设置页打开</el-button>
      </div>
    </template>

    <ProjectEnvEditor
      v-if="modelValue && projectId"
      ref="editorRef"
      :project-id="projectId"
      @saved="$emit('update:modelValue', false)"
    />

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="editorRef?.saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import ProjectEnvEditor from '@/views/Settings/ProjectEnvEditor.vue'

const props = defineProps({
  modelValue: Boolean,
  projectId: { type: String, default: '' },
  projectName: { type: String, default: '' },
})
defineEmits(['update:modelValue', 'saved'])

const router = useRouter()
const editorRef = ref(null)
const displayProjectName = computed(() => props.projectName || editorRef.value?.loadedProjectName || '项目')

const handleSave = async () => {
  await editorRef.value?.save()
}

const openInSettings = () => {
  router.push({
    name: 'SettingsProjectEnv',
    params: { projectId: props.projectId },
    query: { name: props.projectName },
  })
}
</script>

<style scoped>
.dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.dialog-title {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}
.dialog-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}
</style>
