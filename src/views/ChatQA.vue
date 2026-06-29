<script setup lang="ts">
import { ref, nextTick, onMounted, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { askQuestion, type ReferenceChunk } from '@/api/chat'
import { sendTrace } from '@/api/monitor'
import { listKbs, type KnowledgeBase } from '@/api/kb'
import { getModelConfig } from '@/api/system'
import {
  listSessions, getSessionMessages,
  clearSession, exportSession,
  type SessionInfo, type ChatMessage
} from '@/api/history'
import { useAppStore } from '@/stores/app'
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

interface MsgFeedback { liked: boolean; disliked: boolean; feedbackReason?: string }

const appStore = useAppStore()
const kbs = ref<KnowledgeBase[]>([])
const inputQuery = ref('')
const messages = ref<Array<{ role: string; content: string; references?: ReferenceChunk[] }>>([])
const msgDbId = ref<Record<number, number>>({})  // msgIndex → ChatHistory.id, kept outside reactive message objects
const chatIdMap = ref<Record<number, string>>({})  // msgIndex → chat_id for monitor tracing
const loading = ref(false)
const sessionId = ref<string | null>(null)
const regeneratingIdx = ref<number | null>(null)
const msgFeedback = ref<Record<number, MsgFeedback>>({})

const currentKbId = ref<number | null>(appStore.currentKbId)
const currentModel = ref(appStore.currentModel)
const searchMode = ref(appStore.searchMode)
const modelOptions = ref<string[]>([])

// Collapse state
const sidebarCollapsed = ref(false)
const refsCollapsed = ref(false)

// History state
const sessions = ref<SessionInfo[]>([])
const historyLoading = ref(false)
const visibleMenu = ref<string | null>(null)

marked.use(markedHighlight({
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
}))
marked.setOptions({ gfm: true, breaks: true })

const sessionGroups = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; sessions: SessionInfo[] }[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '7 天内', sessions: [] },
    { label: '更早', sessions: [] },
  ]

  for (const s of sessions.value) {
    const d = new Date(s.created_at)
    if (d >= today) groups[0].sessions.push(s)
    else if (d >= yesterday) groups[1].sessions.push(s)
    else if (d >= sevenDaysAgo) groups[2].sessions.push(s)
    else groups[3].sessions.push(s)
  }

  return groups.filter(g => g.sessions.length > 0)
})

const currentKbName = computed(() => {
  const kb = kbs.value.find(k => k.id === currentKbId.value)
  return kb?.name || '未选择'
})

async function fetchKbs() {
  kbs.value = await listKbs()
  if (!currentKbId.value && kbs.value.length > 0) {
    currentKbId.value = kbs.value[0].id
  }
}

async function fetchModels() {
  try {
    const res = await getModelConfig()
    modelOptions.value = res.models
    // 若当前选中的模型已不在配置列表中，回退到第一个
    if (modelOptions.value.length && !modelOptions.value.includes(currentModel.value)) {
      currentModel.value = modelOptions.value[0]
    }
  } catch { /* keep current model */ }
}

async function fetchSessions() {
  historyLoading.value = true
  try {
    const res: any = await listSessions({ page_size: 100 })
    sessions.value = res.items
  } catch { } finally {
    historyLoading.value = false
  }
}

watch(currentKbId, (val) => {
  if (val) {
    const kb = kbs.value.find(k => k.id === val)
    appStore.setKb(val, kb?.name || '')
  }
})
watch(currentModel, (val) => appStore.setModel(val))
watch(searchMode, (val) => appStore.setSearchMode(val))

function newSession() {
  sessionId.value = null
  visibleMenu.value = null
  messages.value = []
  msgDbId.value = {}
  chatIdMap.value = {}
}

async function selectSession(sid: string) {
  if (sessionId.value === sid) return
  visibleMenu.value = null
  sessionId.value = sid
  messages.value = []
  msgDbId.value = {}
  chatIdMap.value = {}
  historyLoading.value = true
  try {
    const msgs: ChatMessage[] = await getSessionMessages(sid)
    for (const m of msgs) {
      const idx = messages.value.length
      messages.value.push({ role: 'user' as const, content: m.user_query })
      messages.value.push({ role: 'assistant' as const, content: m.ai_answer, references: m.reference_chunks || undefined })
      msgDbId.value[idx + 1] = m.id  // AI message is at idx+1
    }
  } finally {
    historyLoading.value = false
  }
}

function toggleMenu(sid: string) {
  visibleMenu.value = visibleMenu.value === sid ? null : sid
}

async function handleClearSession(sid: string) {
  visibleMenu.value = null
  try {
    await ElMessageBox.confirm('确定清空该会话的所有消息？', '确认', { type: 'warning' })
    await clearSession(sid)
    ElMessage.success('已清空')
    if (sessionId.value === sid) newSession()
    fetchSessions()
  } catch { }
}

async function handleExportSession(sid: string) {
  visibleMenu.value = null
  try {
    const res: any = await exportSession(sid)
    const blob = new Blob([res], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chat_${sid}.md`; a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch { }
}

async function handleDeleteSession(sid: string) {
  visibleMenu.value = null
  try {
    await ElMessageBox.confirm('确定删除该会话及所有历史消息？此操作不可恢复。', '确认删除', { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' })
    await clearSession(sid)
    if (sessionId.value === sid) newSession()
    fetchSessions()
    ElMessage.success('已删除')
  } catch { }
}

function truncateQuery(query: string): string {
  if (!query) return '新对话'
  return query.length > 15 ? query.slice(0, 15) + '...' : query
}

async function sendQuery() {
  const q = inputQuery.value.trim()
  if (!q || !currentKbId.value) return
  if (!currentKbId.value) { ElMessage.warning('请先选择知识库'); return }

  inputQuery.value = ''
  messages.value.push({ role: 'user', content: q })
  messages.value.push({ role: 'assistant', content: '' })
  loading.value = true
  const wasNew = !sessionId.value

  try {
    const aiIdx = messages.value.length - 1
    await streamAnswer(q, messages.value[aiIdx], aiIdx, null)
    if (wasNew) fetchSessions()
  } catch (e: any) {
    messages.value[messages.value.length - 1].content = '回答生成失败：' + (e.message || '未知错误')
  } finally {
    loading.value = false
  }
}

function msgState(msg: { role: string; content: string }, i: number): 'loading' | 'failed' | 'empty' | 'normal' {
  if (msg.role !== 'assistant') return 'normal'
  if (!msg.content && regeneratingIdx.value === i) return 'loading'
  if (!msg.content && loading.value && i === messages.value.length - 1) return 'loading'
  if (!msg.content) return 'empty'
  if (msg.content.startsWith('回答生成失败')) return 'failed'
  return 'normal'
}

function sendFeedbackTrace(msgIdx: number, feedback: string) {
  const cid = chatIdMap.value[msgIdx]
  if (cid) {
    sendTrace({ chat_id: cid, feedback }).catch(() => {})
  }
}

function handleCopy(content: string, i: number) {
  navigator.clipboard.writeText(content)
  ElMessage.success('复制成功')
  sendFeedbackTrace(i, 'copy')
}

function handleLike(i: number) {
  const fb = msgFeedback.value[i] || { liked: false, disliked: false }
  if (fb.liked) {
    msgFeedback.value[i] = { ...fb, liked: false }
  } else {
    msgFeedback.value[i] = { liked: true, disliked: false }
    sendFeedbackTrace(i, 'like')
  }
}

async function handleDislike(i: number) {
  const fb = msgFeedback.value[i] || { liked: false, disliked: false }
  if (fb.disliked) {
    msgFeedback.value[i] = { ...fb, disliked: false }
    return
  }
  msgFeedback.value[i] = { liked: false, disliked: true }
  sendFeedbackTrace(i, 'dislike')

  try {
    const { value } = await ElMessageBox.prompt('请简述点踩原因（可选）', '反馈', {
      confirmButtonText: '提交',
      cancelButtonText: '跳过',
      inputType: 'textarea',
      inputPlaceholder: '如：回答错误、内容不完整...',
      customClass: 'dislike-feedback-dialog',
    })
    msgFeedback.value[i] = { ...msgFeedback.value[i], feedbackReason: value || undefined }
  } catch {
    // User skipped — keep dislike active
  }
}

async function streamAnswer(query: string, targetMsg: { role: string; content: string; references?: ReferenceChunk[] }, msgIdx: number, msgId?: number | null) {
  const effectiveMsgId = msgId ?? msgDbId.value[msgIdx] ?? null
  console.log('[streamAnswer] msgIdx:', msgIdx, '| param msgId:', msgId, '| map lookup:', msgDbId.value[msgIdx], '| effectiveMsgId:', effectiveMsgId, '| all keys:', Object.keys(msgDbId.value))
  const response = await askQuestion({
    kb_id: currentKbId.value!,
    query,
    session_id: sessionId.value,
    model_name: currentModel.value,
    search_mode: searchMode.value,
    message_id: effectiveMsgId,
  })
  if (!response.body) throw new Error('No response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        console.log('[stream event] type:', json.type, '| msgIdx:', msgIdx)
        if (json.type === 'token') {
          targetMsg.content += json.content
        } else if (json.type === 'references') {
          targetMsg.references = json.data
        } else if (json.type === 'session_id') {
          sessionId.value = json.data
        } else if (json.type === 'message_id') {
          console.log('[stream event] SETTING msgDbId[' + msgIdx + '] =', json.data)
          msgDbId.value[msgIdx] = json.data
          console.log('[stream event] AFTER SET msgDbId[' + msgIdx + '] =', msgDbId.value[msgIdx], '| all keys:', Object.keys(msgDbId.value))
        } else if (json.type === 'chat_id') {
          chatIdMap.value[msgIdx] = json.data
          console.log('[stream event] SETTING chatIdMap[' + msgIdx + '] =', json.data)
        }
      } catch (e) {
        console.log('[stream event] PARSE ERROR:', e, '| raw data:', data)
      }
    }
  }
}

async function handleRegenerate(i: number) {
  const userMsg = messages.value[i - 1]
  if (!userMsg || userMsg.role !== 'user') return

  sendFeedbackTrace(i, 'regenerate')

  const aiMsg = messages.value[i]
  aiMsg.content = ''
  aiMsg.references = undefined
  delete msgFeedback.value[i]

  regeneratingIdx.value = i
  loading.value = true
  try {
    const msgId = msgDbId.value[i]
    console.log('[handleRegenerate] i:', i, '| msgId from map:', msgId, '| all msgDbId keys:', Object.keys(msgDbId.value))
    await streamAnswer(userMsg.content, aiMsg, i, msgId)
  } catch (e: any) {
    aiMsg.content = '回答生成失败：' + (e.message || '未知错误')
  } finally {
    loading.value = false
    regeneratingIdx.value = null
  }
}

const chatContainer = ref<HTMLElement>()
watch(messages, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
}, { deep: true })

const sendDisabled = computed(() => loading.value || !inputQuery.value.trim())

// ── Chunk detail dialog ────────────────────────────────
const chunkDetailVisible = ref(false)
const selectedChunk = ref<ReferenceChunk | null>(null)

function showChunkDetail(ref: ReferenceChunk) {
  selectedChunk.value = ref
  chunkDetailVisible.value = true
}

// ── Bidirectional highlight linkage ────────────────────
const hoveredMsgIndex = ref<number | null>(null)
const hoveredChunkId = ref<number | null>(null)
const refsBody = ref<HTMLElement>()

function isMsgLinkedToChunk(msgIdx: number) {
  if (!hoveredChunkId.value) return false
  return messages.value[msgIdx]?.references?.some(r => r.chunk_id === hoveredChunkId.value)
}

function onMsgEnter(i: number) {
  if (!messages.value[i]?.references?.length) return
  hoveredMsgIndex.value = i
  nextTick(() => {
    const card = refsBody.value?.querySelector(`[data-msg-index="${i}"]`)
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function onMsgLeave() {
  hoveredMsgIndex.value = null
}

function onRefEnter(chunkId: number, msgIdx: number) {
  hoveredChunkId.value = chunkId
  nextTick(() => {
    const el = chatContainer.value?.querySelector(`[data-msg-index="${msgIdx}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function onRefLeave() {
  hoveredChunkId.value = null
}

onMounted(() => { fetchKbs(); fetchModels(); fetchSessions() })
</script>

<template>
  <div class="chat-page">
    <!-- ===== History Sidebar ===== -->
    <div class="history-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- Expanded panel -->
      <div v-if="!sidebarCollapsed" class="panel-expanded panel-history">
        <div class="panel-topbar">
          <span class="panel-title">对话历史</span>
          <span class="collapse-btn" @click="sidebarCollapsed = true" title="收起">
            <el-icon><ArrowLeft /></el-icon>
          </span>
        </div>
        <div class="new-chat-btn" @click="newSession">
          <el-icon><Plus /></el-icon>
          <span>开启新对话</span>
        </div>
        <div class="session-list" v-loading="historyLoading">
          <template v-if="sessions.length === 0 && !historyLoading">
            <el-empty description="暂无历史对话" :image-size="40" />
          </template>
          <div v-for="group in sessionGroups" :key="group.label" class="session-group">
            <div class="group-label">{{ group.label }}</div>
            <div
              v-for="s in group.sessions" :key="s.session_id"
              class="session-item"
              :class="{ active: sessionId === s.session_id }"
              @click="selectSession(s.session_id)"
            >
              <span class="session-label">{{ truncateQuery(s.first_query) }}</span>
              <span class="session-more" :class="{ visible: visibleMenu === s.session_id }" @click.stop="toggleMenu(s.session_id)">
                <el-icon><MoreFilled /></el-icon>
              </span>
              <div v-if="visibleMenu === s.session_id" class="session-dropdown" @click.stop>
                <div class="menu-item" @click="handleClearSession(s.session_id)">清空</div>
                <div class="menu-item" @click="handleExportSession(s.session_id)">导出</div>
                <div class="menu-item danger" @click="handleDeleteSession(s.session_id)">删除</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Collapsed icon bar -->
      <div v-else class="panel-collapsed">
        <span class="expand-btn" @click="sidebarCollapsed = false" title="展开历史">
          <el-icon><ArrowRight /></el-icon>
        </span>
      </div>
    </div>

    <!-- ===== Center Chat Area (fixed 1000px) ===== -->
    <div class="center-area">
      <div class="chat-messages" ref="chatContainer">
        <div v-if="messages.length === 0 && !loading" class="empty-chat">
          <div class="empty-icon"><el-icon :size="48"><ChatDotRound /></el-icon></div>
          <p>开始提问，探索你的知识库</p>
        </div>
        <div v-for="(msg, i) in messages" :key="i"
          class="msg-item"
          :class="[
            msg.role,
            { 'has-refs': msg.references?.length, 'msg-linked': isMsgLinkedToChunk(i) }
          ]"
          :data-msg-index="i"
          @mouseenter="onMsgEnter(i)"
          @mouseleave="onMsgLeave"
        >
          <div class="msg-avatar">{{ msg.role === 'user' ? 'U' : 'AI' }}</div>
          <div class="msg-content">
            <div v-if="msg.role === 'assistant'" v-html="marked(msg.content || '思考中...')" class="markdown-body"></div>
            <div v-else>{{ msg.content }}</div>
            <!-- Feedback actions: only for assistant, not loading/empty -->
            <div v-if="msg.role === 'assistant' && msgState(msg, i) !== 'loading' && msgState(msg, i) !== 'empty'" class="msg-actions">
              <!-- Copy -->
              <el-tooltip content="复制" placement="top" :show-after="300">
                <button class="action-icon-btn" @click="handleCopy(msg.content, i)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </el-tooltip>
              <!-- Regenerate -->
              <el-tooltip content="重新生成" placement="top" :show-after="300">
                <button class="action-icon-btn" :class="{ spinning: regeneratingIdx === i }" :disabled="loading" @click="handleRegenerate(i)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                </button>
              </el-tooltip>
              <!-- Like (hidden on failed) -->
              <template v-if="msgState(msg, i) !== 'failed'">
                <el-tooltip content="点赞" placement="top" :show-after="300">
                  <button class="action-icon-btn" :class="{ active: msgFeedback[i]?.liked }" @click="handleLike(i)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14ZM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                    </svg>
                  </button>
                </el-tooltip>
              </template>
              <!-- Dislike -->
              <el-tooltip content="点踩" placement="top" :show-after="300">
                <button class="action-icon-btn" :class="{ active: msgFeedback[i]?.disliked }" @click="handleDislike(i)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10Zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
                  </svg>
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>
        <div v-if="loading && messages[messages.length-1]?.content === ''" class="msg-item assistant">
          <div class="msg-avatar">AI</div>
          <div class="msg-content typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>

      <!-- ===== Input Section ===== -->
      <div class="input-section">
        <div class="input-capsule">
          <!-- Toolbar row -->
          <div class="input-toolbar">
            <div class="toolbar-item">
              <span class="toolbar-label">知识库选择</span>
              <el-select v-model="currentKbId" placeholder="请选择知识库" size="small" class="toolbar-select">
                <el-option v-for="kb in kbs" :key="kb.id" :label="kb.name" :value="kb.id" />
              </el-select>
            </div>
            <div class="toolbar-item">
              <span class="toolbar-label">模型选择</span>
              <el-select v-model="currentModel" size="small" class="toolbar-select" placeholder="请选择模型">
                <el-option v-for="m in modelOptions" :key="m" :label="m" :value="m" />
              </el-select>
            </div>
            <div class="toolbar-item">
              <span class="toolbar-label">检索模式</span>
              <el-radio-group v-model="searchMode" size="small" class="search-radio-group">
                <el-radio-button value="normal">普通检索</el-radio-button>
                <el-radio-button value="hybrid">混合检索</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <!-- Textarea row -->
          <div class="input-row">
            <textarea
              v-model="inputQuery"
              class="input-textarea"
              placeholder="输入你的问题..."
              rows="3"
              @keydown.enter.exact.prevent="sendQuery"
              :disabled="loading"
              @input="(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px' }"
            ></textarea>
            <button
              class="send-btn"
              :class="{ disabled: sendDisabled, loading: loading }"
              :disabled="sendDisabled"
              @click="sendQuery"
            >
              <el-icon v-if="loading" class="spin-icon"><Loading /></el-icon>
              <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="input-footer">
          <span>内容由 AI 生成，请仔细甄别</span>
          <span class="footer-divider">|</span>
          <span>当前模型：{{ currentModel }} | 当前知识库：{{ currentKbName }}</span>
        </div>
      </div>
    </div>

    <!-- ===== References Panel ===== -->
    <div class="ref-sidebar" :class="{ collapsed: refsCollapsed }">
      <div v-if="!refsCollapsed" class="panel-expanded panel-refs">
        <div class="panel-topbar">
          <span class="panel-title">检索溯源</span>
          <span class="collapse-btn" @click="refsCollapsed = true" title="收起">
            <el-icon><ArrowRight /></el-icon>
          </span>
        </div>
        <div class="refs-body" ref="refsBody">
          <template v-for="(msg, msgIdx) in messages" :key="'refg'+msgIdx">
            <el-card
              v-for="ref in (msg.references || [])"
              :key="ref.chunk_id"
              shadow="never"
              class="ref-card clickable"
              :class="{ 'ref-linked': hoveredMsgIndex === msgIdx, 'ref-hovered': hoveredChunkId === ref.chunk_id }"
              :data-msg-index="msgIdx"
              @mouseenter="onRefEnter(ref.chunk_id, msgIdx)"
              @mouseleave="onRefLeave"
              @click="showChunkDetail(ref)"
            >
              <div class="ref-header">
                <span class="ref-file">{{ ref.filename }}</span>
                <span class="ref-page">页码 {{ ref.page_num }}</span>
                <span class="ref-score">相关度 {{ (ref.score * 100).toFixed(0) }}%</span>
              </div>
              <div class="ref-content">{{ ref.content }}</div>
            </el-card>
          </template>
          <el-empty v-if="!messages.some(m => m.references?.length)" description="暂无溯源数据" :image-size="40" />
        </div>
      </div>
      <div v-else class="panel-collapsed">
        <span class="expand-btn" @click="refsCollapsed = false" title="展开溯源">
          <el-icon><ArrowLeft /></el-icon>
        </span>
      </div>
    </div>

    <!-- ===== Chunk Detail Dialog ===== -->
    <el-dialog
      v-model="chunkDetailVisible"
      :title="selectedChunk ? `${selectedChunk.filename}  页码 ${selectedChunk.page_num}  相关度 ${(selectedChunk.score * 100).toFixed(0)}%` : 'Chunk 详情'"
      width="700px"
      :close-on-click-modal="true"
      :close-on-press-escape="true"
      destroy-on-close
    >
      <div v-if="selectedChunk" class="chunk-detail-body">
        <div class="chunk-detail-text">{{ selectedChunk.content }}</div>
      </div>
      <template #footer>
        <el-button @click="chunkDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  height: calc(100vh - 72px);
  width: 100%;
  --primary: #1677FF;
  --primary-light: #e8f0fe;
}

/* ===== Panel common ===== */
.panel-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #f0f0f0;
}
.panel-title { font-size: 15px; font-weight: 600; color: #333; }
.collapse-btn, .expand-btn {
  cursor: pointer;
  color: #999;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.collapse-btn:hover, .expand-btn:hover { background: #f0f0f0; color: #333; }

/* ===== History Sidebar ===== */
.history-sidebar {
  flex-shrink: 0;
  width: 240px;
  background: #fff;
  border-radius: 8px;
  margin-right: 8px;
  overflow: hidden;
  transition: width 0.25s ease;
}
.history-sidebar.collapsed {
  width: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
}
.panel-history {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.panel-collapsed {
  width: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12px;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 8px 12px 10px;
  padding: 8px 0;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: all 0.2s;
}
.new-chat-btn:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}
.session-group { margin-bottom: 4px; }
.group-label {
  font-size: 12px;
  color: #bbb;
  padding: 6px 8px 4px;
  font-weight: 500;
}
.session-item {
  display: flex;
  align-items: center;
  padding: 9px 8px;
  cursor: pointer;
  font-size: 14px;
  color: #555;
  border-radius: 6px;
  transition: background 0.15s;
  position: relative;
}
.session-item:hover { background: #f5f5f5; }
.session-item.active { background: var(--primary-light); color: var(--primary); }
.session-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 28px;
}
.session-more {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  cursor: pointer;
  color: #999;
  opacity: 0;
  transition: opacity 0.15s;
}
.session-item:hover .session-more { opacity: 1; }
.session-more.visible { opacity: 1; background: #e0e0e0; color: #333; }
.session-more:hover { background: #e0e0e0; color: #333; }

.session-dropdown {
  position: absolute;
  right: 8px;
  top: 100%;
  z-index: 100;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  min-width: 120px;
  overflow: hidden;
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.session-dropdown .menu-item {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: background 0.15s;
}
.session-dropdown .menu-item:hover { background: #f5f5f5; }
.session-dropdown .menu-item.danger { color: #f56c6c; }
.session-dropdown .menu-item.danger:hover { background: #fef0f0; }

/* ===== Center Area ===== */
.center-area {
  width: 1000px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: #fff;
  border-radius: 8px;
  margin-bottom: 8px;
}
.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #ccc;
}
.empty-chat p { margin-top: 12px; font-size: 15px; color: #bbb; }

/* Messages */
.msg-item {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}
.msg-item.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px; font-weight: 600;
  flex-shrink: 0;
}
.msg-item.user .msg-avatar { background: var(--primary); color: #fff; }
.msg-item.assistant .msg-avatar { background: #52c41a; color: #fff; }
.msg-content {
  max-width: 72%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.65;
}
.msg-item.user .msg-content { background: var(--primary); color: #fff; }
.msg-item.assistant .msg-content { background: #f5f5f5; }
.msg-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
.action-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  padding: 0;
}
.action-icon-btn:hover:not(:disabled) {
  color: var(--primary);
  background: rgba(22,119,255,0.08);
  transform: scale(1.08);
}
.action-icon-btn:disabled {
  color: #ddd;
  cursor: not-allowed;
}
.action-icon-btn.active {
  color: var(--primary);
}
.action-icon-btn.active svg {
  fill: var(--primary);
}
.action-icon-btn.spinning svg {
  animation: spin 1s linear infinite;
}
.typing-dots { display: flex; gap: 4px; align-items: center; padding: 8px 0; }
.typing-dots span {
  width: 7px; height: 7px; border-radius: 50%; background: #bbb;
  animation: bounce 1.4s infinite ease-in-out both;
}
.typing-dots span:nth-child(1) { animation-delay: -0.32s; }
.typing-dots span:nth-child(2) { animation-delay: -0.16s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* ===== Input Section ===== */
.input-section {
  flex-shrink: 0;
}
.input-capsule {
  background: #fafbfc;
  border: 1.5px solid #e5e7eb;
  border-radius: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  overflow: hidden;
}
.input-capsule:focus-within {
  border-color: #1677FF;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.08);
  background: #fff;
}

/* Toolbar */
.input-toolbar {
  display: flex;
  align-items: center;
  gap: 30px;
  padding: 10px 18px 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid #f0f0f0;
}
.toolbar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.toolbar-label {
  font-size: 13px;
  color: #888;
  flex-shrink: 0;
}
.toolbar-select {
  width: 150px;
}
.toolbar-select :deep(.el-input__wrapper) {
  border-radius: 6px;
  box-shadow: none;
}
.search-radio-group {
  flex-shrink: 0;
}

/* Textarea row */
.input-row {
  display: flex;
  align-items: flex-end;
  padding: 8px 14px 10px 18px;
  gap: 8px;
}
.input-textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  min-height: 56px;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;
  padding: 4px 0;
  color: #333;
}
.input-textarea::placeholder { color: #bbb; }
.input-textarea:disabled { opacity: 0.6; }

.send-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  margin-bottom: 2px;
}
.send-btn:hover { background: #4096ff; transform: scale(1.05); }
.send-btn.disabled { background: #d9d9d9; cursor: not-allowed; transform: none; }
.send-btn.loading { background: var(--primary); pointer-events: none; }
.spin-icon { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Footer */
.input-footer {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 8px 0 2px;
  font-size: 12px;
  color: #bbb;
}
.footer-divider { color: #ddd; }

/* ===== References Sidebar ===== */
.ref-sidebar {
  flex: 1;
  min-width: 0;
  background: #fff;
  border-radius: 8px;
  margin-left: 8px;
  overflow: hidden;
  transition: flex 0.25s ease, min-width 0.25s ease;
}
.ref-sidebar.collapsed {
  flex: 0 0 40px;
  min-width: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10px;
}
.panel-refs {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.refs-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
}
.ref-card { margin-bottom: 8px; font-size: 13px; }
.ref-card.clickable { cursor: pointer; }
.ref-header { display: flex; gap: 8px; margin-bottom: 4px; color: #999; font-size: 12px; }
.ref-file { font-weight: 600; color: #333; }
.ref-content {
  color: #666; line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Chunk detail dialog */
.chunk-detail-body {
  max-height: 55vh;
  overflow-y: auto;
}
.chunk-detail-text {
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}

/* === Bidirectional highlight linkage === */
.msg-item.has-refs { cursor: pointer; }
.msg-item.assistant.msg-linked .msg-content {
  background: #eef5ff;
  box-shadow: 0 0 0 2px rgba(22,119,255,0.25);
}
.msg-item.user.msg-linked .msg-content {
  box-shadow: 0 0 0 2px rgba(22,119,255,0.4);
}
.ref-card.ref-linked,
.ref-card.ref-hovered {
  background: #e6f0ff !important;
  border-color: #1677FF !important;
}

/* Markdown styles are defined globally in assets/style.css (.markdown-body) */
</style>
