import api from './index'

export interface SessionInfo {
  session_id: string
  kb_id: number
  first_query: string
  message_count: number
  created_at: string
}

export interface ChatMessage {
  id: number
  session_id: string
  kb_id: number
  model_name: string
  user_query: string
  ai_answer: string
  reference_chunks: any
  created_at: string
}

export function listSessions(params: { page?: number; page_size?: number }) {
  return api.get('/history/sessions', { params })
}

export function getSessionMessages(sessionId: string) {
  return api.get<any, ChatMessage[]>(`/history/sessions/${sessionId}`)
}

export function deleteMessage(msgId: number) {
  return api.delete(`/history/messages/${msgId}`)
}

export function clearSession(sessionId: string) {
  return api.delete(`/history/sessions/${sessionId}`)
}

export function exportSession(sessionId: string) {
  return api.get(`/history/sessions/${sessionId}/export`, { responseType: 'blob' })
}
