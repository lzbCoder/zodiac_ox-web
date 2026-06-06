import api from './index'

export interface KnowledgeBase {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
  is_deleted: boolean
  doc_count: number
  vector_status: string
}

export function listKbs() {
  return api.get<any, KnowledgeBase[]>('/kb')
}

export function createKb(data: { name: string; description?: string }) {
  return api.post<any, KnowledgeBase>('/kb', data)
}

export function updateKb(id: number, data: { name?: string; description?: string }) {
  return api.put<any, KnowledgeBase>(`/kb/${id}`, data)
}

export function deleteKb(id: number) {
  return api.delete(`/kb/${id}`)
}
