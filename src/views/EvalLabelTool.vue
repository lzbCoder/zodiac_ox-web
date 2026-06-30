<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listLabelTasks, createLabelTask, getLabelTask, updateLabelTask, deleteLabelTask,
  listLabelDetails, getCandidateChunks, saveAnnotation, batchSaveAnnotations, exportLabelTask,
  parseLabelFile,
  type LabelTask, type LabelDetail, type CandidateChunk, type ChunkCandidates,
} from '@/api/ragEval'
import { listKbs, type KnowledgeBase } from '@/api/kb'

// ── View state ──────────────────────────────────────────

const currentView = ref<'list' | 'workspace'>('list')
const selectedTask = ref<LabelTask | null>(null)
const selectedDetailId = ref<number | null>(null)

// ── Task list state ─────────────────────────────────────

const tasks = ref<LabelTask[]>([])
const kbs = ref<KnowledgeBase[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterKbId = ref<number | null>(null)

// ── Create dialog ───────────────────────────────────────

const formVisible = ref(false)
const formSubmitting = ref(false)
const formName = ref('')
const formKbId = ref<number | null>(null)
const formTopK = ref(5)
const formDesc = ref('')
const formTab = ref<'manual' | 'file'>('manual')
const manualQueries = ref<{ query: string; standard_answer: string }[]>([{ query: '', standard_answer: '' }])
const importFile = ref<File | null>(null)

// ── Edit dialog ─────────────────────────────────────────

const editVisible = ref(false)
const editSubmitting = ref(false)
const editName = ref('')
const editDesc = ref('')

// ── Workspace state ─────────────────────────────────────

const details = ref<LabelDetail[]>([])
const detailsTotal = ref(0)
const detailPage = ref(1)
const detailsLoading = ref(false)
const statusFilter = ref<string>('all')
const searchKeyword = ref('')
const candidateLoading = ref(false)
const currentChunks = ref<CandidateChunk[]>([])
const currentQuery = ref('')
const currentAnswer = ref<string | null>(null)
const checkedChunkIds = ref<Set<number>>(new Set())
const saving = ref(false)
const chunkVisible = ref(false)
const clickedChunk = ref<CandidateChunk | null>(null)

// ── Batch mode ──────────────────────────────────────────

const batchMode = ref(false)
const batchChecked = ref<Map<number, Set<number>>>(new Map())  // detailId → chunkId set

// ── Keyboard shortcuts ──────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (currentView.value !== 'workspace') return
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
  if (e.ctrlKey && e.key === 'ArrowRight') {
    e.preventDefault()
    goNext()
  }
  if (e.ctrlKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    goPrev()
  }
}

// ── Task list ───────────────────────────────────────────

async function fetchTasks() {
  loading.value = true
  try {
    const res: any = await listLabelTasks({ kb_id: filterKbId.value || undefined, page: page.value, page_size: pageSize.value })
    tasks.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function fetchKbs() {
  kbs.value = await listKbs()
}

function openCreate() {
  formName.value = ''
  formKbId.value = null
  formTopK.value = 5
  formDesc.value = ''
  formTab.value = 'manual'
  manualQueries.value = [{ query: '', standard_answer: '' }]
  importFile.value = null
  formVisible.value = true
}

function addQueryRow() {
  if (manualQueries.value.length >= 50) {
    ElMessage.warning('最多添加50条')
    return
  }
  manualQueries.value.push({ query: '', standard_answer: '' })
}

function removeQueryRow(idx: number) {
  if (manualQueries.value.length <= 1) return
  manualQueries.value.splice(idx, 1)
}

async function handleCreate() {
  if (!formName.value.trim()) {
    ElMessage.warning('请输入标注任务名称')
    return
  }
  if (!formKbId.value) {
    ElMessage.warning('请选择知识库')
    return
  }
  if (formTopK.value < 1 || formTopK.value > 100) {
    ElMessage.warning('Top-K值需在1-100之间')
    return
  }

  const queries = manualQueries.value
    .filter(q => q.query.trim())
    .map(q => ({ query: q.query.trim(), standard_answer: q.standard_answer.trim() || undefined }))

  if (queries.length === 0) {
    ElMessage.warning('请至少添加一条Query')
    return
  }

  formSubmitting.value = true
  try {
    await createLabelTask({
      name: formName.value.trim(),
      kb_id: formKbId.value,
      top_k: formTopK.value,
      description: formDesc.value.trim() || undefined,
      queries,
    })
    ElMessage.success('标注任务已创建')
    formVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error('创建失败')
  } finally {
    formSubmitting.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  importFile.value = input.files?.[0] || null
}

async function handleFullImport() {
  const file = importFile.value
  if (!file) {
    ElMessage.warning('请先选择文件')
    return
  }

  // Validate file format
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['csv', 'xlsx', 'xls', 'json'].includes(ext)) {
    ElMessage.warning('请上传 Excel、JSON 或 CSV 格式的文件')
    return
  }

  // Validate form fields
  if (!formName.value.trim()) {
    ElMessage.warning('请完善标注任务信息')
    return
  }
  if (!formKbId.value) {
    ElMessage.warning('请完善标注任务信息')
    return
  }
  if (formTopK.value < 1 || formTopK.value > 100) {
    ElMessage.warning('Top-K值需在1-100之间')
    return
  }

  formSubmitting.value = true
  try {
    // Parse file via backend
    const res: any = await parseLabelFile(file)
    if (!res || res.count === 0) {
      ElMessage.warning('文件中无有效数据')
      return
    }

    if (res.count > 1000) {
      ElMessage.warning('单次导入最多支持1000条数据')
      return
    }

    // Deduplicate and filter empty queries
    const seen = new Set<string>()
    const queries: { query: string; standard_answer?: string }[] = []
    for (const it of res.items) {
      const q = (it.query || '').trim()
      if (!q || seen.has(q)) continue
      seen.add(q)
      queries.push({ query: q, standard_answer: it.standard_answer || undefined })
    }

    const skipped = res.count - queries.length
    if (skipped > 0) {
      ElMessage.warning(`已自动跳过 ${skipped} 条重复 Query`)
    }

    if (queries.length === 0) {
      ElMessage.warning('文件中无有效数据')
      return
    }

    await createLabelTask({
      name: formName.value.trim(),
      kb_id: formKbId.value,
      top_k: formTopK.value,
      description: formDesc.value.trim() || undefined,
      queries,
    })

    ElMessage.success(`标注任务创建成功，共导入 ${queries.length} 条 Query`)
    formVisible.value = false
    fetchTasks()
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    if (detail) {
      ElMessage.error(`标注任务创建失败：${detail}`)
    } else {
      ElMessage.error('标注任务创建失败，请稍后重试')
    }
  } finally {
    formSubmitting.value = false
  }
}

async function handleDeleteTask(task: LabelTask) {
  try {
    await ElMessageBox.confirm('删除后标注数据将全部丢失，是否确认删除？', '确认删除', { type: 'warning' })
    await deleteLabelTask(task.id)
    ElMessage.success('已删除')
    fetchTasks()
  } catch { /* canceled */ }
}

// ── Enter workspace ─────────────────────────────────────

async function enterWorkspace(task: LabelTask) {
  selectedTask.value = task
  selectedDetailId.value = null
  currentChunks.value = []
  currentQuery.value = ''
  currentAnswer.value = null
  checkedChunkIds.value = new Set()
  batchChecked.value = new Map()
  statusFilter.value = 'all'
  searchKeyword.value = ''
  detailPage.value = 1
  currentView.value = 'workspace'
  await fetchDetails()
}

function backToList() {
  currentView.value = 'list'
  selectedTask.value = null
  selectedDetailId.value = null
  fetchTasks()
}

// ── Edit task ───────────────────────────────────────────

function openEdit(task: LabelTask) {
  editName.value = task.name
  editDesc.value = task.description || ''
  selectedTask.value = task
  editVisible.value = true
}

async function handleEdit() {
  if (!selectedTask.value) return
  editSubmitting.value = true
  try {
    await updateLabelTask(selectedTask.value.id, { name: editName.value.trim(), description: editDesc.value.trim() || undefined })
    ElMessage.success('已更新')
    editVisible.value = false
    fetchTasks()
  } catch {
    ElMessage.error('更新失败')
  } finally {
    editSubmitting.value = false
  }
}

// ── Workspace: details ──────────────────────────────────

async function fetchDetails() {
  if (!selectedTask.value) return
  detailsLoading.value = true
  try {
    const params: any = { page: detailPage.value, page_size: 100 }
    if (statusFilter.value !== 'all') params.status = statusFilter.value
    if (searchKeyword.value.trim()) params.keyword = searchKeyword.value.trim()
    const res: any = await listLabelDetails(selectedTask.value.id, params)
    details.value = res.items
    detailsTotal.value = res.total
  } finally {
    detailsLoading.value = false
  }
}

watch([statusFilter, searchKeyword], () => {
  detailPage.value = 1
  fetchDetails()
})

// ── Workspace: chunk selection ──────────────────────────

async function selectDetail(detail: LabelDetail) {
  selectedDetailId.value = detail.id
  candidateLoading.value = true
  try {
    const res: any = await getCandidateChunks(detail.id)
    currentChunks.value = res.chunks
    currentQuery.value = res.query
    currentAnswer.value = res.standard_answer

    // Pre-populate checkboxes if already annotated
    if (detail.standard_chunk_ids && detail.standard_chunk_ids.length > 0) {
      checkedChunkIds.value = new Set(detail.standard_chunk_ids)
    } else {
      checkedChunkIds.value = new Set()
    }
  } catch {
    ElMessage.error('获取候选Chunk失败')
  } finally {
    candidateLoading.value = false
  }
}

function toggleChunk(chunkId: number) {
  const next = new Set(checkedChunkIds.value)
  if (next.has(chunkId)) {
    next.delete(chunkId)
  } else {
    next.add(chunkId)
  }
  checkedChunkIds.value = next

  // Update batch cache
  if (batchMode.value && selectedDetailId.value) {
    batchChecked.value.set(selectedDetailId.value, next)
  }
}

function isChunkChecked(chunkId: number) {
  return checkedChunkIds.value.has(chunkId)
}

function openChunkDetail(chunk: CandidateChunk) {
  clickedChunk.value = chunk
  chunkVisible.value = true
}

async function handleSave() {
  if (!selectedDetailId.value) return
  saving.value = true
  try {
    await saveAnnotation(selectedDetailId.value, {
      standard_chunk_ids: [...checkedChunkIds.value],
    })
    // Update local detail status
    const detail = details.value.find(d => d.id === selectedDetailId.value)
    if (detail) {
      detail.status = 'annotated'
      detail.standard_chunk_ids = [...checkedChunkIds.value]
    }
    // Refresh task progress
    if (selectedTask.value) {
      const task = await getLabelTask(selectedTask.value.id)
      if (task) selectedTask.value = task
    }
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function handleSaveAndNext() {
  await handleSave()
  goNext()
}

function goNext() {
  const idx = details.value.findIndex(d => d.id === selectedDetailId.value)
  if (idx < details.value.length - 1) {
    selectDetail(details.value[idx + 1])
  }
}

function goPrev() {
  const idx = details.value.findIndex(d => d.id === selectedDetailId.value)
  if (idx > 0) {
    selectDetail(details.value[idx - 1])
  }
}

async function handleBatchSave() {
  const annotations: { detail_id: number; standard_chunk_ids: number[] }[] = []
  for (const [detailId, chunkSet] of batchChecked.value) {
    annotations.push({ detail_id: detailId, standard_chunk_ids: [...chunkSet] })
  }
  if (annotations.length === 0) {
    ElMessage.warning('无待保存的标注')
    return
  }
  saving.value = true
  try {
    await batchSaveAnnotations(selectedTask.value!.id, { annotations })
    ElMessage.success(`已保存${annotations.length}条标注`)
    batchChecked.value = new Map()
    batchMode.value = false
    await fetchDetails()
    if (selectedTask.value) {
      const task = await getLabelTask(selectedTask.value.id)
      if (task) selectedTask.value = task
    }
  } catch {
    ElMessage.error('批量保存失败')
  } finally {
    saving.value = false
  }
}

// ── Export ──────────────────────────────────────────────

async function handleExport(format: string) {
  if (!selectedTask.value) return
  try {
    if (format === 'json') {
      const res: any = await exportLabelTask(selectedTask.value.id, 'json')
      const blob = new Blob([JSON.stringify(res.items, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `label_${selectedTask.value.id}.json`
      link.click()
      URL.revokeObjectURL(url)
    } else {
      const blob: Blob = await exportLabelTask(selectedTask.value.id, format)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `label_${selectedTask.value.id}.${format}`
      link.click()
      URL.revokeObjectURL(url)
    }
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  }
}

// ── Helpers ─────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 0.8) return '#52c41a'
  if (s >= 0.5) return '#faad14'
  return '#999'
}

function formatDate(iso: string) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}

function fmtProgress(task: LabelTask) {
  return task.total_details > 0 ? `${task.progress}% (${Math.round(task.progress * task.total_details / 100)}/${task.total_details})` : '-'
}

// ── Lifecycle ───────────────────────────────────────────

onMounted(() => {
  fetchTasks()
  fetchKbs()
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div>
    <!-- ═══ Task List View ═══ -->
    <template v-if="currentView === 'list'">
      <div class="page-header">
        <h2>标注任务</h2>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 创建标注任务
        </el-button>
      </div>

      <div style="margin-bottom: 16px; display: flex; gap: 12px;">
        <el-select v-model="filterKbId" placeholder="选择知识库" clearable @change="fetchTasks" style="width: 200px;">
          <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
        </el-select>
      </div>

      <el-table :data="tasks" v-loading="loading" stripe style="width: 100%">
        <el-table-column label="名称" min-width="120" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip :content="row.name" placement="top" :disabled="row.name.length <= 10">
              <span class="name-cell">{{ row.name.length > 10 ? row.name.slice(0, 10) + '...' : row.name }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="120" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip :content="row.description || '-'" placement="top" :disabled="!row.description || row.description.length <= 10">
              <span class="name-cell">{{ row.description ? (row.description.length > 10 ? row.description.slice(0, 10) + '...' : row.description) : '-' }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="知识库" width="180" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ kbs.find(k => k.id === row.kb_id)?.name || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Top-K" width="120" align="center">
          <template #default="{ row }">{{ row.top_k }}</template>
        </el-table-column>
        <el-table-column label="标注进度" width="190" align="center">
          <template #default="{ row }">
            <div class="progress-cell">
              <el-progress :percentage="row.progress" :stroke-width="10" :show-text="false" :status="row.status === 'completed' ? 'success' : undefined" />
              <span class="progress-text">{{ fmtProgress(row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'completed' ? 'success' : 'info'" size="small">
              {{ row.status === 'completed' ? '已完成' : '进行中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180" align="center">
          <template #default="{ row }"><span style="white-space:nowrap">{{ formatDate(row.created_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="360" align="center" fixed="right">
          <template #default="{ row }">
            <div class="action-btns">
              <el-button size="small" type="primary" @click="enterWorkspace(row)">进入标注</el-button>
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="handleDeleteTask(row)">删除</el-button>
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

      <!-- Create Task Dialog -->
      <el-dialog v-model="formVisible" title="创建标注任务" width="650px">
        <el-form label-position="top" :disabled="formSubmitting">
          <el-row :gutter="16">
            <el-col :span="14">
              <el-form-item label="标注任务名称" required>
                <el-input v-model="formName" placeholder="如：202405知识库A评测集标注" maxlength="100" show-word-limit />
              </el-form-item>
            </el-col>
            <el-col :span="10">
              <el-form-item label="Top-K" required>
                <el-input-number v-model="formTopK" :min="1" :max="100" style="width: 100%;" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="关联知识库" required>
            <el-select v-model="formKbId" placeholder="请选择" style="width: 100%;">
              <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="任务描述">
            <el-input v-model="formDesc" type="textarea" :rows="2" placeholder="可选填写标注任务说明" />
          </el-form-item>

          <el-divider>导入Query</el-divider>
          <el-tabs v-model="formTab">
            <el-tab-pane label="手动录入" name="manual">
              <div v-for="(q, idx) in manualQueries" :key="idx" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start;">
                <el-input v-model="q.query" placeholder="Query（必填）" style="flex: 1;" />
                <el-input v-model="q.standard_answer" placeholder="标准答案（选填）" style="flex: 1;" />
                <el-button :disabled="manualQueries.length <= 1" @click="removeQueryRow(idx)" style="flex-shrink: 0;">删除</el-button>
              </div>
              <el-button size="small" @click="addQueryRow" style="margin-top: 4px;">+ 添加一行</el-button>
            </el-tab-pane>
            <el-tab-pane label="文件导入" name="file">
              <div style="color: #999; font-size: 13px; margin-bottom: 8px;">
                支持导入 Excel、JSON、CSV 格式文件，文件必须包含 query 和 standard_answer 字段。
              </div>
              <input id="label-file-input" type="file" accept=".xlsx,.xls,.json,.csv" style="display: block;" @change="onFileChange" />
            </el-tab-pane>
          </el-tabs>
        </el-form>
        <template #footer>
          <template v-if="formTab === 'manual'">
            <el-button :disabled="formSubmitting" @click="formVisible = false">取消</el-button>
            <el-button type="primary" :loading="formSubmitting" @click="handleCreate">创建</el-button>
          </template>
          <template v-else>
            <el-tooltip content="请先选择文件" :disabled="!!importFile">
              <el-button type="primary" :loading="formSubmitting" :disabled="!importFile" @click="handleFullImport">
                {{ formSubmitting ? '解析中...' : '解析文件并创建任务' }}
              </el-button>
            </el-tooltip>
          </template>
        </template>
      </el-dialog>

      <!-- Edit Task Dialog -->
      <el-dialog v-model="editVisible" title="编辑标注任务" width="480px">
        <el-form label-position="top" :disabled="editSubmitting">
          <el-form-item label="任务名称">
            <el-input v-model="editName" maxlength="100" />
          </el-form-item>
          <el-form-item label="任务描述">
            <el-input v-model="editDesc" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button :disabled="editSubmitting" @click="editVisible = false">取消</el-button>
          <el-button type="primary" :loading="editSubmitting" @click="handleEdit">保存</el-button>
        </template>
      </el-dialog>
    </template>

    <!-- ═══ Workspace View ═══ -->
    <template v-else>
      <div class="page-header">
        <h2>标注工作区 — {{ selectedTask?.name }}</h2>
        <div style="display: flex; gap: 8px;">
          <span style="align-self: center; font-size: 13px; color: #666;">
            进度: {{ selectedTask?.progress }}%
            ({{ selectedTask ? Math.round(selectedTask.progress * selectedTask.total_details / 100) : 0 }}/{{ selectedTask?.total_details }})
          </span>
          <el-button @click="backToList">返回任务列表</el-button>
          <el-dropdown @command="(fmt: string) => handleExport(fmt)">
            <el-button type="primary">
              导出 <el-icon><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="json">JSON 格式</el-dropdown-item>
                <el-dropdown-item command="csv">CSV 格式</el-dropdown-item>
                <el-dropdown-item command="xlsx">Excel 格式</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="workspace-layout">
        <!-- Left Panel: Query List -->
        <div class="left-panel">
          <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
            <el-radio-group v-model="statusFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="unannotated">未标注</el-radio-button>
              <el-radio-button value="annotated">已标注</el-radio-button>
            </el-radio-group>
          </div>
          <el-input v-model="searchKeyword" placeholder="搜索Query..." clearable size="small" style="margin-bottom: 8px;" />

          <div class="detail-list">
            <div
              v-for="(d, idx) in details"
              :key="d.id"
              :class="['detail-item', { active: selectedDetailId === d.id }]"
              @click="selectDetail(d)"
            >
              <span class="detail-idx">{{ (detailPage - 1) * 100 + idx + 1 }}</span>
              <span class="detail-query">{{ d.query.length > 24 ? d.query.slice(0, 24) + '...' : d.query }}</span>
              <el-tag :type="d.status === 'annotated' ? 'success' : 'info'" size="small" style="margin-left: auto; flex-shrink: 0;">
                {{ d.status === 'annotated' ? '✓' : '○' }}
              </el-tag>
            </div>
            <el-empty v-if="!detailsLoading && details.length === 0" description="暂无数据" :image-size="60" />
          </div>

          <el-pagination
            v-if="detailsTotal > 100"
            v-model:current-page="detailPage"
            :total="detailsTotal"
            :page-size="100"
            layout="prev, pager, next"
            size="small"
            style="margin-top: 8px; justify-content: center;"
            @change="fetchDetails"
          />
        </div>

        <!-- Right Panel: Chunk Selection -->
        <div class="right-panel">
          <template v-if="selectedDetailId">
            <div class="right-panel-scroll">
              <!-- Query & Standard Answer -->
              <el-card shadow="never" style="margin-bottom: 12px;">
                <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px;">问题 (Query)</div>
                <div style="color: #333; line-height: 1.6;">{{ currentQuery }}</div>
                <el-collapse v-if="currentAnswer" style="margin-top: 8px;">
                  <el-collapse-item>
                    <template #title>
                      <span style="font-weight: 600; font-size: 14px; color: #303133;">标准答案（点击展开）</span>
                    </template>
                    <div style="color: #666; line-height: 1.6; white-space: pre-wrap;">{{ currentAnswer }}</div>
                  </el-collapse-item>
                </el-collapse>
              </el-card>

              <!-- Candidate Chunks -->
              <div v-loading="candidateLoading" style="min-height: 200px;">
                <div v-if="currentChunks.length === 0 && !candidateLoading" style="text-align: center; padding: 40px; color: #999;">
                  未检索到相关Chunk，请确认知识库中有相关文档
                </div>
                <el-table v-else :data="currentChunks" stripe style="width: 100%" row-class-name="chunk-row">
                  <el-table-column width="50" align="center">
                    <template #default="{ row: chunk }">
                      <el-checkbox
                        :model-value="isChunkChecked(chunk.chunk_id)"
                        @change="toggleChunk(chunk.chunk_id)"
                        @click.stop
                      />
                    </template>
                  </el-table-column>
                  <el-table-column label="Chunk内容" min-width="300">
                    <template #default="{ row: chunk }">
                      <span class="chunk-content clickable" @click="openChunkDetail(chunk)">{{ chunk.content.length > 200 ? chunk.content.slice(0, 200) + '...' : chunk.content }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="文档" width="140" align="center" show-overflow-tooltip>
                    <template #default="{ row: chunk }">{{ chunk.doc_name }}</template>
                  </el-table-column>
                  <el-table-column label="相关性" width="85" align="right">
                    <template #default="{ row: chunk }">
                      <span :style="{ color: scoreColor(chunk.score), fontWeight: 600 }">
                        {{ (chunk.score * 100).toFixed(1) }}%
                      </span>
                    </template>
                  </el-table-column>
                </el-table>
                <div style="margin-top: 4px; font-size: 12px; color: #999; text-align: center;">点击行查看完整内容</div>
              </div>
            </div>

            <!-- Actions (fixed at bottom) -->
            <div class="right-panel-actions">
              <el-button @click="goPrev" :disabled="!details.length || details[0]?.id === selectedDetailId">上一条</el-button>
              <el-button @click="goNext" :disabled="!details.length || details[details.length - 1]?.id === selectedDetailId">下一条</el-button>
              <el-button type="primary" :loading="saving" @click="handleSave">保存标注</el-button>
              <el-button type="primary" :loading="saving" @click="handleSaveAndNext">保存并切换下一条</el-button>
            </div>
          </template>
          <el-empty v-else description="请从左侧列表选择一条Query" :image-size="80" />
        </div>
      </div>
    </template>

    <!-- Chunk Detail Dialog (root level, outside both views) -->
    <el-dialog v-model="chunkVisible" title="Chunk 完整内容" width="750px" top="8vh" destroy-on-close>
      <template v-if="clickedChunk">
        <div style="margin-bottom: 12px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #666;">
          <span><b>文档：</b>{{ clickedChunk.doc_name }}</span>
          <span><b>页码：</b>{{ clickedChunk.page_num ?? '-' }}</span>
          <span><b>相关度：</b>{{ (clickedChunk.score * 100).toFixed(1) }}%</span>
        </div>
        <div style="background: #fafbfc; border: 1px solid #eaecef; border-radius: 8px; padding: 16px; max-height: 55vh; overflow-y: auto; white-space: pre-wrap; line-height: 1.7; font-size: 14px; color: #333;">
          {{ clickedChunk.content }}
        </div>
      </template>
      <template #footer>
        <el-button @click="chunkVisible = false">关闭</el-button>
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
.progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress-cell .el-progress {
  flex: 1;
  margin-bottom: 0;
}
.progress-text {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Workspace layout ──────────────────────────────────── */

.workspace-layout {
  display: flex;
  gap: 16px;
  height: calc(100vh - 180px);
  min-height: 500px;
}

.left-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-radius: 8px;
  padding: 12px;
}

.detail-list {
  flex: 1;
  overflow-y: auto;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.detail-item:hover {
  background: #e6f0ff;
}
.detail-item.active {
  background: #d6e4ff;
  border-color: #1677FF;
}

.detail-idx {
  color: #999;
  font-size: 12px;
  width: 28px;
  flex-shrink: 0;
}
.detail-query {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.right-panel-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.right-panel-actions {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  margin-top: 12px;
}

.chunk-content {
  font-size: 13px;
  line-height: 1.5;
}
.chunk-content.clickable {
  cursor: pointer;
}

:deep(.chunk-row) {
  cursor: pointer;
}
</style>
