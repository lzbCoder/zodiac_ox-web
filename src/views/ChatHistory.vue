<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listSessions, getSessionMessages, deleteMessage, clearSession, exportSession, type SessionInfo, type ChatMessage } from '@/api/history'
import { useAppStore } from '@/stores/app'
import { marked } from 'marked'

const router = useRouter()
const appStore = useAppStore()
const sessions = ref<SessionInfo[]>([])
const messages = ref<ChatMessage[]>([])
const currentSessionId = ref<string | null>(null)
const loading = ref(false)

async function fetchSessions() {
  const res: any = await listSessions({ page_size: 100 })
  sessions.value = res.items
}

async function selectSession(sessionId: string) {
  currentSessionId.value = sessionId
  loading.value = true
  try {
    messages.value = await getSessionMessages(sessionId)
  } finally {
    loading.value = false
  }
}

async function handleDeleteMessage(msgId: number) {
  await deleteMessage(msgId)
  ElMessage.success('已删除')
  if (currentSessionId.value) selectSession(currentSessionId.value)
}

async function handleClearSession(sessionId: string) {
  try {
    await ElMessageBox.confirm('确定清空该会话的所有消息？', '确认', { type: 'warning' })
    await clearSession(sessionId)
    ElMessage.success('已清空')
    currentSessionId.value = null
    messages.value = []
    fetchSessions()
  } catch { /* canceled */ }
}

async function handleExport(sessionId: string) {
  const res: any = await exportSession(sessionId)
  const blob = new Blob([res], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chat_${sessionId}.md`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

function continueChat(session: SessionInfo) {
  appStore.setKb(session.kb_id, '')
  router.push('/chat')
}

onMounted(fetchSessions)
</script>

<template>
  <div class="history-layout">
    <!-- Session List -->
    <div class="session-list">
      <h4 style="padding:12px 0;">对话列表</h4>
      <div
        v-for="s in sessions"
        :key="s.session_id"
        class="session-item"
        :class="{ active: currentSessionId === s.session_id }"
        @click="selectSession(s.session_id)"
      >
        <div class="session-title">{{ s.first_query }}</div>
        <div class="session-meta">
          <span>{{ s.message_count }} 条消息</span>
          <span>{{ new Date(s.created_at).toLocaleDateString() }}</span>
        </div>
        <div class="session-actions">
          <el-button size="small" text @click.stop="continueChat(s)">续聊</el-button>
          <el-button size="small" text type="danger" @click.stop="handleClearSession(s.session_id)">清空</el-button>
          <el-button size="small" text @click.stop="handleExport(s.session_id)">导出</el-button>
        </div>
      </div>
      <el-empty v-if="sessions.length === 0" description="暂无对话记录" />
    </div>

    <!-- Messages -->
    <div class="message-detail" v-loading="loading">
      <div v-if="!currentSessionId" style="display:flex;align-items:center;justify-content:center;height:100%;color:#ccc;">
        请选择左侧对话查看详情
      </div>
      <div v-else>
        <div v-for="msg in messages" :key="msg.id" class="history-msg">
          <div class="user-query">
            <b>用户：</b>{{ msg.user_query }}
            <span style="float:right;font-size:12px;color:#ccc;">
              {{ new Date(msg.created_at).toLocaleString() }}
            </span>
          </div>
          <div class="ai-answer markdown-body" v-html="marked(msg.ai_answer)"></div>
          <div style="text-align:right;margin-top:4px;">
            <el-button size="small" text type="danger" @click="handleDeleteMessage(msg.id)">删除</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-layout {
  display: flex;
  gap: 16px;
  height: calc(100vh - 48px);
}
.session-list {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  padding: 0 12px;
}
.session-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.2s;
}
.session-item:hover, .session-item.active {
  background: #e6f4ff;
}
.session-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-meta {
  font-size: 12px;
  color: #999;
  display: flex;
  gap: 12px;
}
.session-actions {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
.message-detail {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
.history-msg {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.user-query {
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.6;
}
.ai-answer {
  background: #f9f9f9;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
}
.markdown-body :deep(pre) {
  background: #f0f0f0;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
}
</style>
