<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listTasks, createTask, runTask, cancelTask, deleteTask, listDatasets, getEvalConfig, getTask, type EvalTask, type EvalDataset } from '@/api/ragEval'
import { listKbs, type KnowledgeBase } from '@/api/kb'

const router = useRouter()
const tasks = ref<EvalTask[]>([])
const kbs = ref<KnowledgeBase[]>([])
const datasets = ref<EvalDataset[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterKbId = ref<number | null>(null)

// Create dialog
const formVisible = ref(false)
const formSubmitting = ref(false)
const formName = ref('')
const formTaskType = ref('manual')
const formDatasetId = ref<number | null>(null)
const formKbId = ref<number | null>(null)
const formTopK = ref(5)
const formMode = ref('normal')
const formModel = ref('')
const formEvalModel = ref('qwen-turbo')
const formEnableRagas = ref(false)
// Chat sample fields
const formTimeRange = ref<[Date, Date] | null>(null)
const formSampleCount = ref(10)
const formSampleStrategy = ref('random')

// Polling — track running task IDs for targeted updates
let pollTimer: ReturnType<typeof setInterval> | null = null
const runningIds = ref<Set<number>>(new Set())

async function fetchTasks() {
  loading.value = true
  try {
    const res: any = await listTasks({ kb_id: filterKbId.value || undefined, page: page.value, page_size: pageSize.value })
    tasks.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function fetchKbs() {
  kbs.value = await listKbs()
}

async function fetchDatasetsForKb() {
  if (!formKbId.value) {
    datasets.value = []
    return
  }
  const res: any = await listDatasets({ kb_id: formKbId.value, page_size: 100 })
  datasets.value = res.items
}

function openCreate() {
  formName.value = ''
  formTaskType.value = 'manual'
  formDatasetId.value = null
  formKbId.value = null
  formTopK.value = 5
  formMode.value = 'normal'
  formModel.value = ''
  formEvalModel.value = 'qwen-turbo'
  formEnableRagas.value = false
  formTimeRange.value = null
  formSampleCount.value = 10
  formSampleStrategy.value = 'random'
  datasets.value = []
  formVisible.value = true
}

async function onKbChange() {
  formDatasetId.value = null
  if (formTaskType.value === 'manual') {
    await fetchDatasetsForKb()
    if (formKbId.value) {
      try {
        const config = await getEvalConfig(formKbId.value)
        formTopK.value = config.default_top_k
        formMode.value = config.default_retriever_mode
      } catch { /* use defaults */ }
    }
  }
}

function onTaskTypeChange() {
  formDatasetId.value = null
  datasets.value = []
  formTopK.value = 5
  formMode.value = 'normal'
}

async function handleCreate() {
  if (!formName.value.trim()) {
    ElMessage.warning('请输入评测任务名称')
    return
  }
  if (formTaskType.value === 'chat_sample') {
    if (!formKbId.value) {
      ElMessage.warning('请选择知识库')
      return
    }
    formSubmitting.value = true
    try {
      await createTask({
        name: formName.value.trim(),
        task_type: 'chat_sample',
        kb_id: formKbId.value,
        top_k: formTopK.value,
        retriever_mode: formMode.value,
        model_name: formModel.value || undefined,
        enable_ragas: formEnableRagas.value,
        eval_model: formEnableRagas.value ? formEvalModel.value : undefined,
        sample_time_start: formTimeRange.value ? String(formTimeRange.value[0]) : undefined,
        sample_time_end: formTimeRange.value ? String(formTimeRange.value[1]) : undefined,
        sample_count: formSampleCount.value,
        sample_strategy: formSampleStrategy.value,
      })
      ElMessage.success('任务已创建')
      formVisible.value = false
      fetchTasks()
    } catch {
      ElMessage.error('创建失败')
    } finally {
      formSubmitting.value = false
    }
    return
  }
  // Manual task
  if (!formDatasetId.value || !formKbId.value) {
    ElMessage.warning('请选择评测集和知识库')
    return
  }
  formSubmitting.value = true
  try {
    await createTask({
      name: formName.value.trim(),
      task_type: 'manual',
      dataset_id: formDatasetId.value,
      kb_id: formKbId.value,
      top_k: formTopK.value,
      retriever_mode: formMode.value,
      model_name: formModel.value || undefined,
      enable_ragas: formEnableRagas.value,
      eval_model: formEnableRagas.value ? formEvalModel.value : undefined,
    })
    ElMessage.success('任务已创建')
    formVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error('创建失败')
  } finally {
    formSubmitting.value = false
  }
}

async function handleRun(task: EvalTask) {
  try {
    await runTask(task.id)
    ElMessage.success('评测任务已启动')
    runningIds.value.add(task.id)
    startPolling()
    task.status = 'running'
  } catch {
    ElMessage.error('启动失败')
  }
}

async function handleCancel(task: EvalTask) {
  try {
    await cancelTask(task.id)
    ElMessage.success('已请求取消')
    fetchTasks()
  } catch {
    ElMessage.error('取消失败')
  }
}

async function handleDeleteTask(task: EvalTask) {
  if (task.status === 'running') {
    ElMessage.warning('运行中的任务无法删除，请先取消')
    return
  }
  try {
    await ElMessageBox.confirm('确定删除该评测任务吗？', '确认删除', { type: 'warning' })
    await deleteTask(task.id)
    ElMessage.success('已删除')
    fetchTasks()
  } catch { /* canceled */ }
}

function viewReport(task: EvalTask) {
  router.push(`/eval/report/${task.id}`)
}

// ── Polling: only update running tasks in-place ──────────

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (runningIds.value.size === 0) {
      stopPolling()
      return
    }
    const ids = [...runningIds.value]
    for (const id of ids) {
      try {
        const updated = await getTask(id)
        const idx = tasks.value.findIndex(t => t.id === id)
        if (idx !== -1) {
          Object.assign(tasks.value[idx], updated)
        }
        if (updated.status !== 'running' && updated.status !== 'pending') {
          runningIds.value.delete(id)
        }
      } catch { /* skip failed polls */ }
    }
    if (runningIds.value.size === 0) {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  runningIds.value.clear()
}

const statusTagType = (s: string) => {
  const map: Record<string, string> = { pending: 'info', running: '', cancelled: 'info', completed: 'success', failed: 'danger' }
  return map[s] || 'info'
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = { pending: '待执行', running: '运行中', cancelled: '已取消', completed: '已完成', failed: '失败' }
  return map[s] || s
}

const modeLabel = (m: string) => {
  const map: Record<string, string> = { normal: '普通检索', hybrid: '混合检索', mixed: '混合检索' }
  return map[m] || m
}

function fmtPct(v: number | null) {
  return v != null ? (v * 100).toFixed(1) + '%' : '-'
}

function fmtMrr(v: number | null) {
  return v != null ? v.toFixed(2) : '-'
}

onMounted(async () => {
  await fetchTasks()
  fetchKbs()
  // Only start polling if running tasks exist (e.g. user navigated back)
  for (const t of tasks.value) {
    if (t.status === 'running') runningIds.value.add(t.id)
  }
  if (runningIds.value.size > 0) startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h2>评测任务管理</h2>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 创建评测任务
      </el-button>
    </div>

    <div style="margin-bottom: 16px; display: flex; gap: 12px;">
      <el-select v-model="filterKbId" placeholder="选择知识库" clearable @change="fetchTasks" style="width: 200px;">
        <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
      </el-select>
    </div>

    <el-table :data="tasks" v-loading="loading" stripe style="width: 100%">
      <el-table-column label="任务名称" width="160" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tooltip :content="row.name" placement="top" :disabled="row.name.length <= 12">
            <span class="name-cell">{{ row.name.length > 12 ? row.name.slice(0, 12) + '...' : row.name }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="评测集" width="140" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tooltip :content="row.dataset_name" placement="top" :disabled="row.dataset_name.length <= 10">
            <span class="name-cell">{{ row.dataset_name.length > 10 ? row.dataset_name.slice(0, 10) + '...' : row.dataset_name }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="知识库" width="130" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tooltip :content="row.kb_name" placement="top" :disabled="row.kb_name.length <= 10">
            <span class="name-cell">{{ row.kb_name.length > 10 ? row.kb_name.slice(0, 10) + '...' : row.kb_name }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="top_k" label="Top K" width="75" align="center" />
      <el-table-column label="检索模式" width="95" align="center">
        <template #default="{ row }">{{ modeLabel(row.retriever_mode) }}</template>
      </el-table-column>
      <el-table-column label="任务类型" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.task_type === 'chat_sample' ? 'warning' : ''" size="small">
            {{ row.task_type === 'chat_sample' ? '聊天抽样' : '传统标注' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="评测类型" width="120" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enable_ragas ? 'success' : 'info'" size="small">
            {{ row.enable_ragas ? '检索 + 生成评测' : '仅检索评测' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" min-width="140" align="center">
        <template #default="{ row }">
          <el-progress :percentage="row.progress" :status="row.status === 'failed' ? 'exception' : (row.status === 'completed' ? 'success' : undefined)" :stroke-width="14" />
        </template>
      </el-table-column>
      <el-table-column label="召回率" width="80" align="right">
        <template #default="{ row }">{{ fmtPct(row.recall) }}</template>
      </el-table-column>
      <el-table-column label="准确率" width="90" align="right">
        <template #default="{ row }">{{ fmtPct(row.precision) }}</template>
      </el-table-column>
      <el-table-column label="命中率" width="80" align="right">
        <template #default="{ row }">{{ fmtPct(row.hit_rate) }}</template>
      </el-table-column>
      <el-table-column label="MRR" width="70" align="right">
        <template #default="{ row }">{{ fmtMrr(row.mrr) }}</template>
      </el-table-column>
      <el-table-column prop="cost_seconds" label="耗时(s)" width="80" align="right" />
      <el-table-column label="操作" width="240" align="center" fixed="right">
        <template #default="{ row }">
          <div class="action-btns">
            <el-button v-if="row.status === 'pending' || row.status === 'failed'" size="small" type="primary" @click="handleRun(row)">运行</el-button>
            <el-button v-if="row.status === 'running'" size="small" type="warning" @click="handleCancel(row)">取消</el-button>
            <el-button v-if="row.status === 'completed'" size="small" @click="viewReport(row)">查看报告</el-button>
            <el-button v-if="row.status !== 'running'" size="small" type="danger" @click="handleDeleteTask(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      :total="total"
      :page-size="pageSize"
      layout="prev, pager, next, total"
      style="margin-top: 16px; justify-content: flex-end;"
      @change="fetchTasks"
    />

    <!-- Create Dialog -->
    <el-dialog v-model="formVisible" title="创建评测任务" width="550px">
      <el-form label-position="top" :disabled="formSubmitting">
        <el-form-item label="评测任务名称" required>
          <el-input v-model="formName" placeholder="请输入任务名称" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="任务类型" required>
          <el-select v-model="formTaskType" style="width: 100%;" @change="onTaskTypeChange">
            <el-option label="传统标注评测" value="manual" />
            <el-option label="聊天记录抽样评测" value="chat_sample" />
          </el-select>
        </el-form-item>

        <!-- 聊天抽样配置 -->
        <template v-if="formTaskType === 'chat_sample'">
          <el-form-item label="关联知识库" required>
            <el-select v-model="formKbId" placeholder="请选择知识库" style="width: 100%;" @change="onKbChange">
              <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker
              v-model="formTimeRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%;"
            />
            <span style="color:#909399;font-size:12px;">留空则不限制时间范围</span>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="抽样数量">
                <el-input-number v-model="formSampleCount" :min="1" :max="100" style="width: 100%;" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="抽样策略">
                <el-radio-group v-model="formSampleStrategy" style="padding-top: 6px;">
                  <el-radio value="random">随机抽样</el-radio>
                  <el-radio value="latest">最新优先</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="Top K">
                <el-input-number v-model="formTopK" :min="1" :max="100" style="width: 100%;" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="检索模式">
                <el-select v-model="formMode" style="width: 100%;">
                  <el-option label="普通检索" value="normal" />
                  <el-option label="混合检索" value="mixed" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <!-- 传统标注评测配置 -->
        <template v-if="formTaskType === 'manual'">
          <el-form-item label="关联知识库" required>
            <el-select v-model="formKbId" placeholder="请选择" style="width: 100%;" @change="onKbChange">
              <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="选择评测集" required>
            <el-select v-model="formDatasetId" placeholder="请选择" style="width: 100%;">
              <el-option v-for="ds in datasets" :key="ds.id" :label="`${ds.name} (${ds.total_questions}题)`" :value="ds.id" />
            </el-select>
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="Top K">
                <el-input-number v-model="formTopK" :min="1" :max="100" style="width: 100%;" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="检索模式">
                <el-select v-model="formMode" style="width: 100%;">
                  <el-option label="普通检索" value="normal" />
                  <el-option label="混合检索" value="mixed" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item>
          <el-checkbox v-model="formEnableRagas" label="启用 RAGAS 评测" />
          <span style="color:#909399;font-size:12px;margin-left:8px;">
            勾选后将调用LLM生成回答并计算上下文精确度、上下文召回率、忠实度、答案相关度四项生成质量指标
          </span>
        </el-form-item>
        <el-form-item v-if="formEnableRagas" label="答案生成模型">
          <el-select v-model="formModel" placeholder="选择用于生成回答的模型" style="width: 100%;">
            <el-option label="qwen3-max（推荐）" value="qwen3-max" />
            <el-option label="deepseek-v4-pro" value="deepseek-v4-pro" />
            <el-option label="glm-5.1" value="glm-5.1" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="formEnableRagas" label="RAGAS 评分模型">
          <el-select v-model="formEvalModel" placeholder="选择用于 RAGAS 指标计算的轻量模型" style="width: 100%;">
            <el-option label="qwen-turbo（推荐，速度快）" value="qwen-turbo" />
            <el-option label="qwen-flash（极速）" value="qwen-flash" />
            <el-option label="deepseek-v4-flash" value="deepseek-v4-flash" />
          </el-select>
          <span style="color:#909399;font-size:12px;">
            RAGAS 指标计算需要大量 LLM 调用，使用轻量模型可大幅提升评测速度
          </span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="formSubmitting" @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="formSubmitting" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.action-btns {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
}
.name-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-progress) {
  max-width: 300px;
  margin: 0 auto;
}
</style>
