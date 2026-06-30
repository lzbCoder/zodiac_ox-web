<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Download } from '@element-plus/icons-vue'
import { marked } from 'marked'
import {
  getOverview, getTrend, getFeedbackDistribution, getKbDistribution,
  getChatList, getChatDetail, exportChats,
  type OverviewData, type TrendPoint, type ChatListItem, type ChatDetail,
} from '@/api/monitor'
import { listKbs } from '@/api/kb'

marked.setOptions({ gfm: true, breaks: true })

// ── Filters ──
const timeRange = ref('today')
const kbFilter = ref<string[]>([])
const statusFilter = ref('')
const refreshKey = ref(0)

const kbOptions = ref<{ id: number; name: string }[]>([])

const timePresets: Record<string, { start: string; end: string }> = {
  today: { start: todayStart(), end: nowStr() },
  yesterday: { start: dayOffset(-1, true), end: dayOffset(-1, false) },
  '7days': { start: dayOffset(-7, true), end: nowStr() },
  '30days': { start: dayOffset(-30, true), end: nowStr() },
}

const customStart = ref('')
const customEnd = ref('')

function todayStart() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 00:00:00`
}
function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function dayOffset(n: number, start: boolean) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const time = start ? '00:00:00' : '23:59:59'
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${time}`
}
function pad(n: number) { return String(n).padStart(2, '0') }

const filterParams = computed(() => {
  let start = '', end = ''
  if (timeRange.value === 'custom') {
    start = customStart.value; end = customEnd.value
  } else {
    const preset = timePresets[timeRange.value]
    if (preset) { start = preset.start; end = preset.end }
  }
  return {
    startTime: start || undefined,
    endTime: end || undefined,
    kbId: kbFilter.value.length ? kbFilter.value.join(',') : undefined,
    status: statusFilter.value || undefined,
  }
})

// ── Overview ──
const overview = ref<OverviewData>({
  total_conversations: 0, success_conversations: 0,
  avg_search_cost_ms: 0, avg_llm_cost_ms: 0,
  avg_total_tokens: 0, avg_chunks_count: 0,
})
const overviewLoading = ref(false)

async function fetchOverview() {
  overviewLoading.value = true
  try {
    const res = await getOverview(filterParams.value)
    overview.value = res.data
  } catch { /* ignore */ }
  finally { overviewLoading.value = false }
}

// ── Trends ──
interface TrendSeries { time: string; total?: number; success?: number; fail?: number; value?: number }
const chatCountTrend = ref<TrendSeries[]>([])
const searchCostTrend = ref<TrendPoint[]>([])
const llmCostTrend = ref<TrendPoint[]>([])
const tokenTrend = ref<TrendPoint[]>([])
const feedbackDist = ref<{ name: string; value: number }[]>([])
const kbDist = ref<{ kb_id: number; kb_name: string; count: number }[]>([])
const trendsLoading = ref(false)

async function fetchTrends() {
  trendsLoading.value = true
  const p = filterParams.value
  try {
    const [cc, sc, lc, tk, fb, kb] = await Promise.all([
      getTrend({ ...p, trendType: 'chatCount' }),
      getTrend({ ...p, trendType: 'searchCost' }),
      getTrend({ ...p, trendType: 'llmCost' }),
      getTrend({ ...p, trendType: 'token' }),
      getFeedbackDistribution(p),
      getKbDistribution(p),
    ])
    chatCountTrend.value = cc.data
    searchCostTrend.value = sc.data
    llmCostTrend.value = lc.data
    tokenTrend.value = tk.data
    feedbackDist.value = fb.data
    kbDist.value = kb.data
  } catch { /* ignore */ }
  finally { trendsLoading.value = false }
}

// ── Chat List ──
const chatList = ref<ChatListItem[]>([])
const chatTotal = ref(0)
const chatPage = ref(1)
const chatPageSize = 20
const chatKeyword = ref('')
const chatListLoading = ref(false)

async function fetchChatList() {
  chatListLoading.value = true
  try {
    const res = await getChatList({
      ...filterParams.value,
      page: chatPage.value,
      size: chatPageSize,
      keyword: chatKeyword.value || undefined,
    })
    chatList.value = res.data.items
    chatTotal.value = res.data.total
  } catch { /* ignore */ }
  finally { chatListLoading.value = false }
}

function onChatPageChange(page: number) {
  chatPage.value = page
  fetchChatList()
}

// ── Detail Dialog ──
const detailVisible = ref(false)
const detail = ref<ChatDetail | null>(null)
const detailLoading = ref(false)
const detailTab = ref('basic')

async function openDetail(chatId: string) {
  detailVisible.value = true
  detailTab.value = 'basic'
  detailLoading.value = true
  try {
    const res = await getChatDetail(chatId)
    detail.value = res.data
  } catch { /* ignore */ }
  finally { detailLoading.value = false }
}

// ── Refresh & Export ──
function refreshAll() {
  refreshKey.value++
  fetchOverview()
  fetchTrends()
  fetchChatList()
}

async function handleExport() {
  try {
    const res = await exportChats(filterParams.value)
    const blob = res instanceof Blob ? res : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    ElMessage.error('导出失败')
  }
}

// ── Search debounce ──
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    chatPage.value = 1
    fetchChatList()
  }, 400)
}

// ── Watchers ──
watch([timeRange, customStart, customEnd, kbFilter, statusFilter], () => {
  chatPage.value = 1
  fetchOverview()
  fetchTrends()
  fetchChatList()
})

// ── Chart options ──
const chatCountChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['总数', '成功', '失败'], top: 0, right: 0, orient: 'horizontal' },
  grid: { left: 10, right: 20, top: 30, bottom: 0 },
  xAxis: { type: 'category' as const, data: chatCountTrend.value.map(d => d.time), axisLabel: { formatter: (v: string) => fmtChartTime(v) } },
  yAxis: { type: 'value' as const, name: '对话数', nameLocation: 'middle', nameGap: 35, nameTextStyle: { align: 'center', verticalAlign: 'middle' } },
  series: [
    { name: '总数', type: 'line', data: chatCountTrend.value.map(d => d.total ?? 0), smooth: true },
    { name: '成功', type: 'line', data: chatCountTrend.value.map(d => d.success ?? 0), smooth: true },
    { name: '失败', type: 'line', data: chatCountTrend.value.map(d => d.fail ?? 0), smooth: true },
  ],
}))

const lineChartOption = (data: TrendPoint[], name: string, unit: string) => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: 15, right: 20, top: 20, bottom: 0 },
  xAxis: { type: 'category' as const, data: data.map(d => d.time), axisLabel: { formatter: (v: string) => fmtChartTime(v) } },
  yAxis: { type: 'value' as const, name: unit, nameLocation: 'middle', nameGap: 40, nameTextStyle: { align: 'center', verticalAlign: 'middle' } },
  series: [{ name, type: 'line', data: data.map(d => d.value ?? 0), smooth: true, areaStyle: { opacity: 0.15 } }],
})

const feedbackPieOption = computed(() => ({
  tooltip: {
    trigger: 'item' as const,
    formatter: (p: any) => `${feedbackLabel[p.name] || p.name}: ${p.value} 次 (${p.percent}%)`,
  },
  legend: { bottom: 0 },
  series: [{
    type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
    data: feedbackDist.value.map(d => ({ ...d, name: feedbackLabel[d.name] || d.name })),
    label: { show: true, formatter: '{b}\n{d}%' },
  }],
}))

const kbBarOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: 20, right: 20, top: 20, bottom: 30 },
  xAxis: { type: 'category' as const, data: kbDist.value.map(d => d.kb_name), axisLabel: { rotate: 20 } },
  yAxis: { type: 'value' as const, name: '对话数', nameLocation: 'middle', nameGap: 35, nameTextStyle: { align: 'center', verticalAlign: 'middle' } },
  series: [{ name: '对话数', type: 'bar', data: kbDist.value.map(d => d.count), itemStyle: { borderRadius: [4, 4, 0, 0] } }],
}))

// ── Init ──
onMounted(async () => {
  // Load KB options
  try {
    const kbs = await listKbs()
    kbOptions.value = Array.isArray(kbs) ? kbs : []
  } catch { /* ignore */ }

  fetchOverview()
  fetchTrends()
  fetchChatList()
})

// ── Helpers ──
const feedbackLabel: Record<string, string> = { like: '点赞', dislike: '点踩', copy: '复制', regenerate: '重新生成', none: '无反馈' }
function fmtFeedback(f: string | null) {
  if (!f || f === 'none') return '无反馈'
  return feedbackLabel[f] || f
}
function fmtTruncate(s: string, n = 20) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
function fmtTime(iso: string) {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:${s}`
  } catch { return iso }
}
function fmtChartTime(t: string) {
  if (!t) return ''
  // Parse "YYYY-MM-DD HH:00" or "YYYY-MM-DD" into display format
  const dateStr = t.includes(' ') ? t.replace(' ', 'T') + ':00' : t + 'T00:00:00'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return t  // fallback: return as-is if unparseable
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  if (t.includes(' ')) {
    return `${mm}-${dd} ${hh}:00`
  }
  return `${mm}-${dd}`
}
</script>

<template>
  <div class="monitor-dashboard">
    <h2 class="page-title">RAG监控</h2>

    <!-- Filter Bar -->
    <div class="filter-bar">
      <div class="filter-row">
        <el-radio-group v-model="timeRange">
          <el-radio-button value="today">今天</el-radio-button>
          <el-radio-button value="yesterday">昨日</el-radio-button>
          <el-radio-button value="7days">近7天</el-radio-button>
          <el-radio-button value="30days">近30天</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <template v-if="timeRange === 'custom'">
          <el-date-picker
            v-model="customStart" type="datetime" placeholder="开始时间"
            format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss"
            style="width:185px"
          />
          <span style="color:#999">—</span>
          <el-date-picker
            v-model="customEnd" type="datetime" placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DD HH:mm:ss"
            style="width:185px"
          />
        </template>
      </div>
      <div class="filter-row">
        <el-select v-model="kbFilter" multiple placeholder="全部知识库" clearable collapse-tags style="width:200px">
          <el-option v-for="k in kbOptions" :key="k.id" :label="k.name" :value="k.id" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width:120px">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="fail" />
        </el-select>
        <el-button type="primary" :icon="Refresh" @click="refreshAll">刷新</el-button>
        <el-button :icon="Download" @click="handleExport">导出Excel</el-button>
      </div>
    </div>

    <!-- Overview Cards -->
    <el-row :gutter="16" class="overview-cards">
      <el-col :span="4">
        <div class="stat-card">
          <div class="stat-value">{{ overview.total_conversations }}</div>
          <div class="stat-label">总对话次数</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="stat-card success">
          <div class="stat-value">{{ overview.success_conversations }}</div>
          <div class="stat-label">成功对话数</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="stat-card">
          <div class="stat-value">{{ overview.avg_search_cost_ms }}<small>ms</small></div>
          <div class="stat-label">平均检索耗时</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="stat-card">
          <div class="stat-value">{{ overview.avg_llm_cost_ms }}<small>ms</small></div>
          <div class="stat-label">平均生成耗时</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="stat-card">
          <div class="stat-value">{{ overview.avg_total_tokens }}<small>个</small></div>
          <div class="stat-label">平均Token消耗</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="stat-card">
          <div class="stat-value">{{ overview.avg_chunks_count }}<small>个</small></div>
          <div class="stat-label">平均召回Chunk数</div>
        </div>
      </el-col>
    </el-row>

    <!-- Trend Charts -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <div class="chart-card">
          <h4>对话量趋势</h4>
          <v-chart :option="chatCountChartOption" autoresize style="height:260px" />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-card">
          <h4>检索耗时趋势</h4>
          <v-chart :option="lineChartOption(searchCostTrend, '检索耗时', 'ms')" autoresize style="height:260px" />
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <div class="chart-card">
          <h4>LLM生成耗时趋势</h4>
          <v-chart :option="lineChartOption(llmCostTrend, 'LLM耗时', 'ms')" autoresize style="height:260px" />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-card">
          <h4>Token消耗趋势</h4>
          <v-chart :option="lineChartOption(tokenTrend, 'Token', '个')" autoresize style="height:260px" />
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <div class="chart-card">
          <h4>用户反馈分布</h4>
          <v-chart v-if="feedbackDist.length" :option="feedbackPieOption" autoresize style="height:280px" />
          <div v-else class="empty-chart">暂无数据</div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-card">
          <h4>知识库调用分布</h4>
          <v-chart v-if="kbDist.length" :option="kbBarOption" autoresize style="height:280px" />
          <div v-else class="empty-chart">暂无数据</div>
        </div>
      </el-col>
    </el-row>

    <!-- Chat List -->
    <div class="table-section">
      <div class="table-header">
        <h4>对话明细</h4>
        <el-input v-model="chatKeyword" placeholder="搜索Query / Chat ID" clearable style="width:260px" @input="onKeywordInput" />
      </div>
      <el-table :data="chatList" v-loading="chatListLoading" stripe border style="width:100%">
        <el-table-column label="序号" type="index" width="60" :index="(idx:number) => (chatPage-1)*chatPageSize + idx + 1" />
        <el-table-column label="对话ID" prop="chat_id" width="170">
          <template #default="{ row }">
            <el-link type="primary" @click="openDetail(row.chat_id)">{{ row.chat_id }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="Query" min-width="180">
          <template #default="{ row }">
            <el-tooltip :content="row.query" placement="top" :show-after="400">
              <span>{{ fmtTruncate(row.query, 20) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="知识库" prop="kb_name" width="120" />
        <el-table-column label="LLM模型" prop="llm_model" width="130">
          <template #default="{ row }">{{ row.llm_model || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="总耗时(ms)" prop="total_cost_ms" width="110" />
        <el-table-column label="Token" prop="total_tokens" width="80" />
        <el-table-column label="反馈" width="100">
          <template #default="{ row }">
            {{ fmtFeedback(row.feedback) }}
          </template>
        </el-table-column>
        <el-table-column label="操作时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.create_time) }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="chatTotal > 0"
        :current-page="chatPage"
        :page-size="chatPageSize"
        :total="chatTotal"
        layout="total, prev, pager, next"
        @current-change="onChatPageChange"
        style="margin-top:16px;justify-content:flex-end"
      />
      <div v-if="!chatListLoading && chatList.length === 0" class="empty-table">暂无监控数据，请发起对话后再查看</div>
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" title="对话详情" width="800px" top="5vh">
      <template v-if="detail">
        <el-tabs v-model="detailTab">
          <el-tab-pane label="基础信息" name="basic">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="对话ID">{{ detail.chat_id }}</el-descriptions-item>
              <el-descriptions-item label="会话ID">{{ detail.session_id }}</el-descriptions-item>
              <el-descriptions-item label="知识库ID">{{ detail.kb_id }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="detail.status === 'success' ? 'success' : 'danger'">{{ detail.status }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="LLM模型">{{ detail.llm_model || '-' }}</el-descriptions-item>
              <el-descriptions-item label="反馈">{{ fmtFeedback(detail.feedback) }}</el-descriptions-item>
              <el-descriptions-item label="检索耗时">{{ detail.search_cost_ms }}ms</el-descriptions-item>
              <el-descriptions-item label="LLM耗时">{{ detail.llm_cost_ms }}ms</el-descriptions-item>
              <el-descriptions-item label="总耗时">{{ detail.total_cost_ms }}ms</el-descriptions-item>
              <el-descriptions-item label="提示词Tokens">{{ detail.prompt_tokens }}</el-descriptions-item>
              <el-descriptions-item label="生成Tokens">{{ detail.completion_tokens }}</el-descriptions-item>
              <el-descriptions-item label="总Tokens">{{ detail.total_tokens }}</el-descriptions-item>
              <el-descriptions-item label="操作时间">{{ fmtTime(detail.create_time) }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane label="问答内容" name="qa">
            <div class="detail-block">
              <div class="detail-block-title">用户问题</div>
              <div class="detail-block-body markdown-body" v-html="marked(detail.query)"></div>
            </div>
            <div class="detail-block" style="margin-top:16px">
              <div class="detail-block-title">AI 回答</div>
              <div v-if="detail.answer" class="detail-block-body markdown-body" v-html="marked(detail.answer)"></div>
              <div v-else class="detail-block-body">(生成失败)</div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="提示词" name="prompt">
            <div class="detail-block">
              <div class="detail-block-title">系统提示词 (System Prompt)</div>
              <div class="detail-block-body markdown-body" v-html="marked(detail.system_prompt || '(无)')"></div>
            </div>
            <div class="detail-block" style="margin-top:16px">
              <div class="detail-block-title">用户提示词 (User Prompt)</div>
              <div class="detail-block-body markdown-body" v-html="marked(detail.user_prompt || '(无)')"></div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="检索详情" name="chunks">
            <el-table :data="detail.chunks" stripe border size="small">
              <el-table-column label="Chunk ID" prop="chunk_id" width="90" />
              <el-table-column label="相似度分数" prop="similarity_score" width="110" />
              <el-table-column label="排序" prop="rank_num" width="60" />
              <el-table-column label="用于生成">
                <template #default="{ row }">
                  <el-tag :type="row.is_used ? 'success' : 'info'" size="small">
                    {{ row.is_used ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
      <div v-else v-loading="detailLoading" style="min-height:200px" />
    </el-dialog>
  </div>
</template>

<style scoped>
.monitor-dashboard {
  max-width: 1400px;
  margin: 0 auto;
}
.page-title { margin: 0 0 16px; font-size: 15px; font-weight: 600; }

.filter-bar {
  background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.filter-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.filter-row + .filter-row { margin-top: 10px; }

.overview-cards { margin-bottom: 16px; }
.stat-card {
  background: #fff; border-radius: 8px; padding: 18px 16px; text-align: center;
  cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  transition: box-shadow 0.2s;
}
.stat-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
.stat-value { font-size: 28px; font-weight: 700; color: #1677FF; line-height: 1.3; }
.stat-value small { font-size: 14px; font-weight: 400; color: #999; margin-left: 2px; }
.stat-card.success .stat-value { color: #52c41a; }
.stat-label { font-size: 13px; color: #999; margin-top: 4px; }

.chart-row { margin-bottom: 16px; }
.chart-card {
  background: #fff; border-radius: 8px; padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.chart-card h4 { margin: 0 0 12px; font-size: 15px; }
.empty-chart { display: flex; align-items: center; justify-content: center; height: 280px; color: #999; }

.table-section {
  background: #fff; border-radius: 8px; padding: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.table-header h4 { margin: 0; font-size: 15px; }
.empty-table { text-align: center; padding: 40px; color: #999; }


/* ── Dialog detail blocks (QA / Prompt) ─────────────── */
.detail-block-title {
  font-weight: 600;
  font-size: 14px;
  color: #1f2329;
  margin-bottom: 8px;
}
.detail-block-body {
  background: #fafbfc;
  border: 1px solid #eaecef;
  border-radius: 8px;
  padding: 14px 16px;
  max-height: 320px;
  overflow-y: auto;
  line-height: 1.65;
  font-size: 14px;
  color: #333;
}
</style>
