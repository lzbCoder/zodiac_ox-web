<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getReport, getResults, exportReport, listReports, type EvalReport, type EvalTask, type EvalResult } from '@/api/ragEval'
import { listKbs, type KnowledgeBase } from '@/api/kb'

const route = useRoute()
const router = useRouter()

const taskId = computed(() => route.params.taskId ? Number(route.params.taskId) : null)

// Report detail
const report = ref<EvalReport | null>(null)
const detailLoading = ref(false)

// Report list
const reports = ref<EvalTask[]>([])
const kbs = ref<KnowledgeBase[]>([])
const listLoading = ref(false)
const filterKbId = ref<number | null>(null)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// Result filter
const resultFilter = ref<string>('')
const results = ref<EvalResult[]>([])
const resultsLoading = ref(false)


const retrievalBarOption = computed(() => {
  if (!report.value) return {}
  const t = report.value.task
  const pctVal = (v: number | null) => v != null ? +(v * 100).toFixed(1) : 0
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: ['召回率', '准确率', '命中率', 'MRR'],
      axisLabel: { fontSize: 12 },
    },
    yAxis: { type: 'value' as const, max: 100, name: '%' },
    series: [{
      name: '检索指标',
      type: 'bar',
      barWidth: '40%',
      data: [
        { value: pctVal(t.recall), itemStyle: { color: '#1677FF' } },
        { value: pctVal(t.precision), itemStyle: { color: '#ff4d4f' } },
        { value: pctVal(t.hit_rate), itemStyle: { color: '#52c41a' } },
        { value: t.mrr != null ? +(t.mrr * 100).toFixed(1) : 0, itemStyle: { color: '#722ed1' } },
      ],
      label: { show: true, position: 'top', fontSize: 11 },
    }],
  }
})

const ragasBarOption = computed(() => {
  if (!report.value) return {}
  const t = report.value.task
  const pctVal = (v: number | null) => v != null ? +(v * 100).toFixed(1) : 0
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: ['上下文精确度', '忠实度', '答案相关度'],
      axisLabel: { fontSize: 12 },
    },
    yAxis: { type: 'value' as const, max: 100, name: '%' },
    series: [{
      name: '生成质量',
      type: 'bar',
      barWidth: '40%',
      data: [
        { value: pctVal(t.context_precision), itemStyle: { color: '#13c2c2' } },
        { value: pctVal(t.faithfulness), itemStyle: { color: '#fa8c16' } },
        { value: pctVal(t.answer_relevancy), itemStyle: { color: '#eb2f96' } },
      ],
      label: { show: true, position: 'top', fontSize: 11 },
    }],
  }
})

const pieChartOption = computed(() => {
  if (!report.value) return {}
  const hits = report.value.results.filter(r => r.hit).length
  const misses = report.value.results.length - hits
  return {
    tooltip: { trigger: 'item' as const },
    legend: { orient: 'vertical' as const, left: 'left' },
    series: [{
      name: '命中分布',
      type: 'pie',
      radius: ['40%', '70%'],
      data: [
        { value: hits, name: '命中', itemStyle: { color: '#52c41a' } },
        { value: misses, name: '未命中', itemStyle: { color: '#ff4d4f' } },
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' } },
    }],
  }
})

function pct(v: number | null) {
  return v != null ? (v * 100).toFixed(1) + '%' : '-'
}

function fmtDifficulty(d: string) {
  const map: Record<string, string> = { easy: '简单', medium: '中等', hard: '困难' }
  return map[d] || d
}

function rowClassName({ row }: { row: EvalResult }) {
  return row.hit ? '' : 'row-miss'
}

function formatDate(iso: string) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(0, 19)
}

// ── Fetch report detail ───────────────────────────────

async function fetchReport() {
  if (!taskId.value) return
  detailLoading.value = true
  try {
    report.value = await getReport(taskId.value)
    await fetchResults()
  } catch {
    ElMessage.error('加载评测报告失败')
  } finally {
    detailLoading.value = false
  }
}

async function fetchResults() {
  if (!taskId.value) return
  resultsLoading.value = true
  try {
    const res: any = await getResults(taskId.value, resultFilter.value || undefined)
    results.value = res.items
  } finally {
    resultsLoading.value = false
  }
}

watch(resultFilter, () => {
  fetchResults()
})

// ── Fetch report list ─────────────────────────────────

async function fetchReports() {
  listLoading.value = true
  try {
    const res: any = await listReports({ kb_id: filterKbId.value || undefined, page: page.value, page_size: pageSize.value })
    reports.value = res.items
    total.value = res.total
  } finally {
    listLoading.value = false
  }
}

async function fetchKbs() {
  kbs.value = await listKbs()
}

function viewReport(task: EvalTask) {
  router.push(`/eval/report/${task.id}`)
}

async function handleExport() {
  if (!taskId.value) return
  try {
    const resp = await fetch(`/api/rag/eval/tasks/${taskId.value}/report/export`)
    if (!resp.ok) throw new Error(resp.statusText)
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `eval_report_${taskId.value}.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('报告已导出')
  } catch {
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  fetchKbs()
  if (taskId.value) {
    fetchReport()
  } else {
    fetchReports()
  }
})

// Re-fetch when route changes
watch(() => route.params.taskId, () => {
  if (taskId.value) {
    fetchReport()
  } else {
    fetchReports()
  }
})
</script>

<template>
  <div>
    <!-- Report List (when no taskId) -->
    <template v-if="!taskId">
      <div class="page-header">
        <h2>评测报告</h2>
      </div>
      <div style="margin-bottom: 16px; display: flex; gap: 12px;">
        <el-select v-model="filterKbId" placeholder="选择知识库" clearable @change="fetchReports" style="width: 200px;">
          <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
        </el-select>
      </div>
      <el-table :data="reports" v-loading="listLoading" stripe style="width: 100%">
        <el-table-column label="任务名称" min-width="160" align="center" show-overflow-tooltip>
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
        <el-table-column label="召回率" width="80" align="right">
          <template #default="{ row }">{{ row.recall != null ? (row.recall * 100).toFixed(1) + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="准确率" width="85" align="right">
          <template #default="{ row }">{{ row.precision != null ? (row.precision * 100).toFixed(1) + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="命中率" width="80" align="right">
          <template #default="{ row }">{{ row.hit_rate != null ? (row.hit_rate * 100).toFixed(1) + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="MRR" width="75" align="right">
          <template #default="{ row }">{{ row.mrr != null ? row.mrr.toFixed(2) : '-' }}</template>
        </el-table-column>
        <el-table-column label="上下文精确度" width="110" align="right">
          <template #default="{ row }">{{ pct(row.context_precision) }}</template>
        </el-table-column>
        <el-table-column label="答案忠实度" width="100" align="right">
          <template #default="{ row }">{{ pct(row.faithfulness) }}</template>
        </el-table-column>
        <el-table-column label="答案相关度" width="100" align="right">
          <template #default="{ row }">{{ pct(row.answer_relevancy) }}</template>
        </el-table-column>
        <el-table-column prop="cost_seconds" label="耗时(s)" width="80" align="right" />
        <el-table-column label="完成时间" width="170" align="center">
          <template #default="{ row }">{{ formatDate(row.finished_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewReport(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="pageSize"
        layout="prev, pager, next, total"
        style="margin-top: 16px; justify-content: flex-end;"
        @change="fetchReports"
      />
    </template>

    <!-- Report Detail (when taskId is present) -->
    <template v-else>
      <div class="page-header">
        <h2>评测报告 #{{ taskId }}</h2>
        <div style="display: flex; gap: 8px;">
          <el-button @click="router.back()">返回</el-button>
          <el-button type="primary" @click="handleExport">导出报告</el-button>
        </div>
      </div>

      <div v-loading="detailLoading">
        <!-- Summary Cards — 检索指标 -->
        <el-row v-if="report" :gutter="16" style="margin-bottom: 16px;">
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">总样本数</div>
              <div class="value" style="color: #1677FF;">{{ report.total_questions }}</div>
            </el-card>
          </el-col>
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">召回率</div>
              <div class="value" :style="{ color: (report.task.recall ?? 0) >= 0.8 ? '#52c41a' : (report.task.recall ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.recall) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">准确率</div>
              <div class="value" :style="{ color: (report.task.precision ?? 0) >= 0.8 ? '#52c41a' : (report.task.precision ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.precision) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">命中率</div>
              <div class="value" :style="{ color: (report.task.hit_rate ?? 0) >= 0.8 ? '#52c41a' : (report.task.hit_rate ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.hit_rate) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">MRR</div>
              <div class="value" style="color: #722ed1;">{{ report.task.mrr != null ? report.task.mrr.toFixed(3) : '-' }}</div>
            </el-card>
          </el-col>
          <el-col :span="4">
            <el-card shadow="hover" class="stat-card">
              <div class="label">耗时</div>
              <div class="value" style="color: #666;">{{ report.task.cost_seconds != null ? report.task.cost_seconds + 's' : '-' }}</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- Summary Cards — RAGAS 生成质量指标 -->
        <el-row v-if="report && report.task.enable_ragas" :gutter="16" style="margin-bottom: 20px;">
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="label">上下文精确度 (Context Precision)</div>
              <div class="value" :style="{ color: (report.task.context_precision ?? 0) >= 0.8 ? '#52c41a' : (report.task.context_precision ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.context_precision) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="label">上下文召回率 (Context Recall)</div>
              <div class="value" :style="{ color: (report.task.context_recall ?? 0) >= 0.8 ? '#52c41a' : (report.task.context_recall ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.context_recall) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="label">忠实度 (Faithfulness)</div>
              <div class="value" :style="{ color: (report.task.faithfulness ?? 0) >= 0.8 ? '#52c41a' : (report.task.faithfulness ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.faithfulness) }}
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="hover" class="stat-card">
              <div class="label">答案相关度 (Answer Relevancy)</div>
              <div class="value" :style="{ color: (report.task.answer_relevancy ?? 0) >= 0.8 ? '#52c41a' : (report.task.answer_relevancy ?? 0) >= 0.5 ? '#faad14' : '#ff4d4f' }">
                {{ pct(report.task.answer_relevancy) }}
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- Charts: RAGAS mode — two bar charts + pie side by side -->
        <el-row v-if="report && report.task.enable_ragas" :gutter="16" style="margin-bottom: 20px;">
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>检索指标概览</template>
              <v-chart :option="retrievalBarOption" style="height: 280px;" autoresize />
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>生成指标概览</template>
              <v-chart :option="ragasBarOption" style="height: 280px;" autoresize />
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>命中分布</template>
              <v-chart :option="pieChartOption" style="height: 280px;" autoresize />
            </el-card>
          </el-col>
        </el-row>

        <!-- Charts: non-RAGAS mode — single bar chart + pie -->
        <el-row v-if="report && !report.task.enable_ragas" :gutter="16" style="margin-bottom: 20px;">
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>检索指标概览</template>
              <v-chart :option="retrievalBarOption" style="height: 280px;" autoresize />
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="hover">
              <template #header>命中分布</template>
              <v-chart :option="pieChartOption" style="height: 280px;" autoresize />
            </el-card>
          </el-col>
        </el-row>

        <!-- Detail Table -->
        <div v-if="report" style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center;">
          <span style="font-weight: 600;">评测明细</span>
          <el-radio-group v-model="resultFilter" size="small" @change="fetchResults">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="hit">命中</el-radio-button>
            <el-radio-button value="miss">未命中</el-radio-button>
          </el-radio-group>
        </div>

        <el-table v-if="report" :data="results" v-loading="resultsLoading" stripe style="width: 100%"
          :row-class-name="rowClassName"
        >
          <el-table-column prop="query" label="问题" min-width="220" show-overflow-tooltip />
          <el-table-column label="检索结果" width="140" align="center">
            <template #default="{ row }">{{ row.retrieved_chunk_ids?.join(', ') || '-' }}</template>
          </el-table-column>
          <el-table-column label="召回率" width="80" align="right">
            <template #default="{ row }">{{ pct(row.recall) }}</template>
          </el-table-column>
          <el-table-column label="准确率" width="85" align="right">
            <template #default="{ row }">{{ pct(row.precision) }}</template>
          </el-table-column>
          <el-table-column label="命中" width="75" align="center">
            <template #default="{ row }">
              <el-tag :type="row.hit ? 'success' : 'danger'" size="small">{{ row.hit ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="排名" width="70" align="center">
            <template #default="{ row }">{{ row.rank || '-' }}</template>
          </el-table-column>
          <el-table-column label="MRR" width="70" align="right">
            <template #default="{ row }">{{ row.mrr != null ? row.mrr.toFixed(3) : '-' }}</template>
          </el-table-column>
          <el-table-column label="检索耗时" width="90" align="right">
            <template #default="{ row }">{{ row.retrieve_time != null ? row.retrieve_time.toFixed(2) + 's' : '-' }}</template>
          </el-table-column>
          <!-- RAGAS 生成评测列 -->
          <template v-if="report.task.enable_ragas">
            <el-table-column label="生成耗时" width="90" align="right">
              <template #default="{ row }">{{ row.answer_time != null ? row.answer_time.toFixed(2) + 's' : '-' }}</template>
            </el-table-column>
            <el-table-column label="模型回答" width="180" align="center">
              <template #default="{ row }">
                <el-popover v-if="row.answer" placement="left" width="450" trigger="click" :content="row.answer">
                  <template #reference>
                    <el-button size="small" type="primary" text>查看回答</el-button>
                  </template>
                </el-popover>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="上下文精确度" width="110" align="right">
              <template #default="{ row }">{{ pct(row.context_precision) }}</template>
            </el-table-column>
            <el-table-column label="上下文召回率" width="110" align="right">
              <template #default="{ row }">{{ pct(row.context_recall) }}</template>
            </el-table-column>
            <el-table-column label="忠实度" width="85" align="right">
              <template #default="{ row }">{{ pct(row.faithfulness) }}</template>
            </el-table-column>
            <el-table-column label="答案相关度" width="100" align="right">
              <template #default="{ row }">{{ pct(row.answer_relevancy) }}</template>
            </el-table-column>
          </template>
        </el-table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-card {
  text-align: center;
}
.stat-card .label {
  font-size: 13px;
  color: #999;
  margin-bottom: 6px;
}
.stat-card .value {
  font-size: 26px;
  font-weight: 700;
}

:deep(.row-miss) {
  background-color: #fff2f0 !important;
}
:deep(.row-miss:hover > td) {
  background-color: #ffd8d2 !important;
}
.name-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
