import api from './index'

export interface TraceRequest {
  chat_id: string
  session_id?: string
  kb_id?: number
  query?: string
  answer?: string
  retrieved_chunk_ids?: string
  used_chunk_ids?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  search_cost_ms?: number
  llm_cost_ms?: number
  total_cost_ms?: number
  llm_model?: string
  feedback?: string
  status?: string
}

export interface OverviewData {
  total_conversations: number
  success_conversations: number
  avg_search_cost_ms: number
  avg_llm_cost_ms: number
  avg_total_tokens: number
  avg_chunks_count: number
}

export interface TrendPoint {
  time: string
  value?: number
  total?: number
  success?: number
  fail?: number
}

export interface ChatListItem {
  id: number
  chat_id: string
  query: string
  kb_id: number
  kb_name: string
  llm_model: string | null
  status: string
  total_cost_ms: number
  total_tokens: number
  feedback: string | null
  create_time: string
}

export interface ChunkDetail {
  chunk_id: number
  similarity_score: number | null
  rank_num: number | null
  is_used: number
}

export interface ChatDetail {
  id: number
  chat_id: string
  session_id: string | null
  kb_id: number
  query: string
  answer: string | null
  retrieved_chunk_ids: string | null
  used_chunk_ids: string | null
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  search_cost_ms: number
  llm_cost_ms: number
  total_cost_ms: number
  llm_model: string | null
  feedback: string | null
  status: string
  system_prompt: string | null
  user_prompt: string | null
  create_time: string
  chunks: ChunkDetail[]
}

export function sendTrace(data: TraceRequest) {
  return api.post('/rag/monitor/trace', data)
}

export function getOverview(params: Record<string, string | undefined>) {
  return api.get('/rag/monitor/overview', { params })
}

export function getTrend(params: Record<string, string | undefined>) {
  return api.get('/rag/monitor/trend', { params })
}

export function getFeedbackDistribution(params: Record<string, string | undefined>) {
  return api.get('/rag/monitor/feedback-distribution', { params })
}

export function getKbDistribution(params: Record<string, string | undefined>) {
  return api.get('/rag/monitor/kb-distribution', { params })
}

export function getChatList(params: Record<string, string | number | undefined>) {
  return api.get('/rag/monitor/chat-list', { params })
}

export function getChatDetail(chatId: string) {
  return api.get('/rag/monitor/chat-detail', { params: { chatId } })
}

export function exportChats(params: Record<string, string | undefined>) {
  return api.get('/rag/monitor/export', {
    params,
    responseType: 'blob',
  })
}
