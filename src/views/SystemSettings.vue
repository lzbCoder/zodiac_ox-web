<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listConfigs, createConfig, updateConfig, deleteConfig, checkConnection,
  getPromptConfig, savePromptConfig,
  getRetrievalConfig, saveRetrievalConfig,
  getFeatureFlags, toggleOtel, toggleMemory,
  type SystemConfigItem, type ConnectionStatus, type PromptConfig, type RetrievalConfig
} from '@/api/system'

const configs = ref<SystemConfigItem[]>([])
const connStatus = ref<ConnectionStatus>({ postgresql: false, milvus: false, redis: false })
const loading = ref(false)
const activeTab = ref('chunk')

// Chunk default form
const chunkForm = ref({ chunk_size: 1000, chunk_overlap: 100, split_separator: '\\n\\n' })

// Prompt config form
const promptForm = ref<PromptConfig>({
  system_prompt: '',
  user_prompt: '',
})
const savingPrompt = ref(false)

// Retrieval config form
const retrievalForm = ref<RetrievalConfig>({
  dense_top_k: 5,
  sparse_top_k: 5,
  final_top_k: 5,
})
const savingRetrieval = ref(false)

// Feature flags
const otelEnabled = ref(true)
const togglingOtel = ref(false)
const memoryEnabled = ref(true)
const togglingMemory = ref(false)

async function fetchFeatureFlags() {
  try {
    const res = await getFeatureFlags()
    otelEnabled.value = res.otel_enabled
    memoryEnabled.value = res.memory_enabled
  } catch { /* use default (true) */ }
}

async function handleToggleOtel() {
  // beforeChange callback receives no arguments — derive target from current state
  const targetValue = !otelEnabled.value
  try {
    await ElMessageBox.confirm(
      `确认${targetValue ? '开启' : '关闭'} OTel 监测？修改后将立即生效。`,
      '确认操作',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return false
  }
  togglingOtel.value = true
  try {
    await toggleOtel({ otel_enabled: targetValue })
    ElMessage.success(`OTel 监测已${targetValue ? '开启' : '关闭'}`)
    return true
  } catch {
    ElMessage.error('操作失败')
    return false
  } finally {
    togglingOtel.value = false
  }
}

async function handleToggleMemory() {
  const targetValue = !memoryEnabled.value
  try {
    await ElMessageBox.confirm(
      `确认${targetValue ? '开启' : '关闭'} 短期/长期记忆？${
        targetValue ? '对话将加载历史上下文和用户记忆。' : '关闭后对话将不使用历史上下文和用户记忆，仅基于当前问题与知识库内容生成回答。'
      }修改后将立即生效。`,
      '确认操作',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return false
  }
  togglingMemory.value = true
  try {
    await toggleMemory({ memory_enabled: targetValue })
    ElMessage.success(`短期/长期记忆已${targetValue ? '开启' : '关闭'}`)
    return true
  } catch {
    ElMessage.error('操作失败')
    return false
  } finally {
    togglingMemory.value = false
  }
}

async function fetchConfigs() {
  configs.value = await listConfigs()
  for (const c of configs.value) {
    if (c.config_key === 'default_chunk_size') chunkForm.value.chunk_size = parseInt(c.config_value || '1000')
    if (c.config_key === 'default_chunk_overlap') chunkForm.value.chunk_overlap = parseInt(c.config_value || '100')
    if (c.config_key === 'default_split_separator') chunkForm.value.split_separator = c.config_value || '\\n\\n'
  }
}

async function checkConn() {
  try {
    connStatus.value = await checkConnection()
  } catch {
    connStatus.value = { postgresql: false, milvus: false, redis: false }
  }
}

async function saveConfig(key: string, value: string, description: string) {
  const existing = configs.value.find(c => c.config_key === key)
  if (existing) {
    await updateConfig(key, { config_value: value, description })
  } else {
    await createConfig({ config_key: key, config_value: value, description })
  }
  ElMessage.success('保存成功')
  fetchConfigs()
}

async function handleDeleteConfig(key: string) {
  await deleteConfig(key)
  ElMessage.success('已删除')
  fetchConfigs()
}

async function fetchPromptConfig() {
  try {
    promptForm.value = await getPromptConfig()
  } catch { /* use defaults */ }
}

async function handleSavePrompt() {
  savingPrompt.value = true
  try {
    await savePromptConfig(promptForm.value)
    ElMessage.success('提示词配置保存成功')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingPrompt.value = false
  }
}

async function fetchRetrievalConfig() {
  try {
    retrievalForm.value = await getRetrievalConfig()
  } catch { /* use defaults */ }
}

async function handleSaveRetrieval() {
  savingRetrieval.value = true
  try {
    await saveRetrievalConfig(retrievalForm.value)
    ElMessage.success('检索参数配置保存成功')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingRetrieval.value = false
  }
}

onMounted(() => {
  fetchConfigs()
  checkConn()
  fetchPromptConfig()
  fetchRetrievalConfig()
  fetchFeatureFlags()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h2>系统设置</h2>
    </div>

    <el-tabs v-model="activeTab">
      <!-- Default Chunk Settings -->
      <el-tab-pane label="默认分块" name="chunk">
        <el-card>
          <el-form label-width="140px" label-position="left">
            <el-form-item label="默认分块大小">
              <el-input-number v-model="chunkForm.chunk_size" :min="100" :max="8000" />
              <el-button style="margin-left:8px;" @click="saveConfig('default_chunk_size', String(chunkForm.chunk_size), '默认分块大小')">保存</el-button>
            </el-form-item>
            <el-form-item label="默认重叠长度">
              <el-input-number v-model="chunkForm.chunk_overlap" :min="0" :max="2000" />
              <el-button style="margin-left:8px;" @click="saveConfig('default_chunk_overlap', String(chunkForm.chunk_overlap), '默认重叠长度')">保存</el-button>
            </el-form-item>
            <el-form-item label="默认分隔符">
              <el-input v-model="chunkForm.split_separator" style="width:300px;" />
              <el-button style="margin-left:8px;" @click="saveConfig('default_split_separator', chunkForm.split_separator, '默认分隔符')">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Connection Status -->
      <el-tab-pane label="连接状态" name="connection">
        <el-card>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="PostgreSQL">
              <el-tag :type="connStatus.postgresql ? 'success' : 'danger'">
                {{ connStatus.postgresql ? '已连接' : '连接失败' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Milvus">
              <el-tag :type="connStatus.milvus ? 'success' : 'danger'">
                {{ connStatus.milvus ? '已连接' : '连接失败' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="Redis">
              <el-tag :type="connStatus.redis ? 'success' : 'danger'">
                {{ connStatus.redis ? '已连接' : '连接失败' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
          <el-button style="margin-top:16px;" @click="checkConn" type="primary">重新检测</el-button>
        </el-card>
      </el-tab-pane>

      <!-- Retrieval Config -->
      <el-tab-pane label="检索参数配置" name="retrieval">
        <el-card>
          <el-form label-width="140px" label-position="left">
            <el-form-item label="稠密向量 TopK">
              <el-input-number v-model="retrievalForm.dense_top_k" :min="1" :max="100" />
              <el-button style="margin-left:8px;" :loading="savingRetrieval" @click="handleSaveRetrieval">保存</el-button>
            </el-form-item>
            <el-form-item label="稀疏向量 TopK">
              <el-input-number v-model="retrievalForm.sparse_top_k" :min="1" :max="100" />
              <el-button style="margin-left:8px;" :loading="savingRetrieval" @click="handleSaveRetrieval">保存</el-button>
            </el-form-item>
            <el-form-item label="融合结果 TopK">
              <el-input-number v-model="retrievalForm.final_top_k" :min="1" :max="100" />
              <el-button style="margin-left:8px;" :loading="savingRetrieval" @click="handleSaveRetrieval">保存</el-button>
            </el-form-item>
          </el-form>
          <el-alert
            style="margin-top:12px"
            type="info"
            :closable="false"
            show-icon
            title="配置说明"
            description="修改后立即生效，仅对新发起的问答生效。普通检索仅使用稠密向量 TopK 和融合结果 TopK；混合检索同时使用三个参数。"
          />
        </el-card>
      </el-tab-pane>

      <!-- Prompt Config -->
      <el-tab-pane label="提示词配置" name="prompt">
        <el-card>
          <el-form label-width="120px" label-position="left">
            <el-form-item label="系统提示词">
              <el-input
                v-model="promptForm.system_prompt"
                type="textarea"
                :rows="8"
                placeholder="请输入系统提示词，用于设定角色、规则、回答要求"
              />
              <div style="color:#909399;font-size:12px;margin-top:4px">
                固定给大模型的系统指令，用于设定角色、规则、回答要求。
              </div>
            </el-form-item>
            <el-form-item label="用户提示词">
              <el-input
                v-model="promptForm.user_prompt"
                type="textarea"
                :rows="8"
                placeholder="请输入用户提示词模板，支持变量占位符"
              />
              <div style="color:#909399;font-size:12px;margin-top:4px">
                用户问题的前置模板。支持变量占位符：<code>{context}</code> 检索上下文、<code>{query}</code> 用户原始问题。
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingPrompt" @click="handleSavePrompt">
                保存提示词配置
              </el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- Feature Flags -->
      <el-tab-pane label="特性开关" name="flags">
        <el-card>
          <el-form label-width="160px" label-position="left">
            <el-form-item label="OTel 监测开关">
              <div style="display:flex;align-items:center;gap:12px;">
                <el-switch
                  v-model="otelEnabled"
                  :loading="togglingOtel"
                  :before-change="handleToggleOtel"
                  inline-prompt
                  active-text="已开启"
                  inactive-text="已关闭"
                />
                <span style="color:#909399;font-size:13px;">
                  控制是否向 LangSmith 发送 Trace 数据
                </span>
              </div>
            </el-form-item>
            <el-form-item label="短期/长期记忆开关">
              <div style="display:flex;align-items:center;gap:12px;">
                <el-switch
                  v-model="memoryEnabled"
                  :loading="togglingMemory"
                  :before-change="handleToggleMemory"
                  inline-prompt
                  active-text="已开启"
                  inactive-text="已关闭"
                />
                <span style="color:#909399;font-size:13px;">
                  控制对话时是否加载和使用短期记忆、长期记忆
                </span>
              </div>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- All Configs -->
      <el-tab-pane label="所有配置" name="all">
        <el-card>
          <el-table :data="configs" stripe>
            <el-table-column prop="config_key" label="配置项" width="200" />
            <el-table-column prop="config_value" label="值" show-overflow-tooltip />
            <el-table-column prop="description" label="说明" width="180" />
            <el-table-column prop="updated_at" label="更新时间" width="180">
              <template #default="{ row }">{{ new Date(row.updated_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button size="small" type="danger" text @click="handleDeleteConfig(row.config_key)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
