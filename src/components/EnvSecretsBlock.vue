<template>
  <div class="field-list secrets-block" :class="{ disabled: disabled }">
    <div class="field-row">
      <div class="field-label"><span class="field-name">一次性口令</span></div>
      <div class="field-control">
        <el-select
          :model-value="secrets.otp.mode"
          :disabled="disabled"
          style="width: 100%"
          @update:model-value="(v) => patch({ otp: { ...secrets.otp, mode: v } })"
        >
          <el-option label="自动（账号码 → 固定码 → Gmail → 问人）" value="auto" />
          <el-option label="只用固定码" value="fixed" />
          <el-option label="Gmail 收信" value="gmail" />
          <el-option label="每次问人" value="hitl" />
        </el-select>
        <el-input
          v-if="secrets.otp.mode === 'fixed' || secrets.otp.mode === 'auto'"
          :model-value="secrets.otp.fixed"
          :disabled="disabled"
          placeholder="固定验证码，可空；账号 otp 列优先"
          style="margin-top: 8px"
          @update:model-value="(v) => patch({ otp: { ...secrets.otp, fixed: v } })"
        />
        <template v-if="secrets.otp.mode === 'gmail' || secrets.otp.mode === 'auto'">
          <el-input
            :model-value="allowlistStr"
            :disabled="disabled"
            placeholder="发件人白名单，逗号分隔（可选）"
            style="margin-top: 8px"
            @update:model-value="setAllowlist"
          />
          <el-input
            :model-value="secrets.otp.subject_contains"
            :disabled="disabled"
            placeholder="主题包含关键字（可选）"
            style="margin-top: 8px"
            @update:model-value="(v) => patch({ otp: { ...secrets.otp, subject_contains: v } })"
          />
        </template>
      </div>
    </div>
    <div class="field-row">
      <div class="field-label"><span class="field-name">登录号</span></div>
      <div class="field-control">
        <el-select
          :model-value="secrets.login.mode"
          :disabled="disabled"
          style="width: 100%"
          @update:model-value="(v) => patchLoginMode(v)"
        >
          <el-option label="自动（账号管理 → 问人）" value="auto" />
          <el-option label="只用账号管理" value="pool" />
          <el-option label="真实号 / 问人" value="hitl" />
        </el-select>
        <el-select
          :model-value="secrets.login.kind"
          :disabled="disabled"
          style="width: 100%; margin-top: 8px"
          @update:model-value="(v) => patch({ login: { ...secrets.login, kind: v } })"
        >
          <el-option label="手机号（号池 phone）" value="phone" />
          <el-option label="邮箱（号池 email / +别名）" value="email" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { normalizeEnvSecrets } from '@/constants/envProfiles'

const props = defineProps({
  secrets: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['change'])

const secrets = computed(() => normalizeEnvSecrets(props.secrets))

const allowlistStr = computed(() => (secrets.value.otp.from_allowlist || []).join(', '))

const patch = (partial) => {
  emit('change', normalizeEnvSecrets({ ...secrets.value, ...partial }))
}

const patchLoginMode = (mode) => {
  emit('change', normalizeEnvSecrets({
    ...secrets.value,
    login: { ...secrets.value.login, mode },
    phone: { mode },
  }))
}

const setAllowlist = (v) => {
  const list = String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  patch({ otp: { ...secrets.value.otp, from_allowlist: list } })
}
</script>

<style scoped>
.secrets-block.disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
