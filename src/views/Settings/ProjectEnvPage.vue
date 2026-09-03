<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProjectEnvEditor from './ProjectEnvEditor.vue'

const route = useRoute()
const router = useRouter()
const projectId = computed(() => route.params.projectId)
const projectName = computed(() => route.query.name || '项目')
const editorRef = ref(null)

const save = async () => {
  await editorRef.value?.save()
}

const goProjects = () => router.push({ name: 'TestingHome' })
</script>

<template>
  <div class="settings-panel">
    <el-button text @click="goProjects">← 应用与环境</el-button>
    <div class="head-row">
      <div>
        <h2>{{ projectName }} · 运行环境</h2>
        <p class="desc">本项目的 App / Web / Server 与各环境启动标识在此维护。</p>
      </div>
      <el-button type="primary" :loading="editorRef?.saving" @click="save">保存</el-button>
    </div>
    <ProjectEnvEditor ref="editorRef" :project-id="projectId" />
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin: 12px 0 20px;
}
h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
.desc { margin: 0; color: #6b7280; font-size: 13px; }
</style>
