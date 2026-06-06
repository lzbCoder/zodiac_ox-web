import api from './index'

export interface ChatRequest {
  kb_id: number
  query: string
  session_id?: string | null
  model_name?: string
  search_mode?: string
  doc_id?: number | null
  message_id?: number | null  // if set, update existing message instead of creating
}

export interface ReferenceChunk {
  doc_id: number
  filename: string
  chunk_id: number
  content: string
  page_num: number
  score: number
}

export function askQuestion(data: ChatRequest): Promise<Response> {
  return fetch('/api/chat/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}
