import api from './index'

export interface DocumentItem {
  id: number
  kb_id: number
  kb_name: string
  filename: string
  file_type: string
  file_path: string
  file_size: number
  page_count: number
  upload_status: string
  vector_status: string
  chunk_count: number
  created_at: string
  is_deleted: boolean
}

export interface ChunkPreviewItem {
  chunk_index: number
  content: string
  page_num: number
}

export function listDocuments(params: { kb_id?: number; file_type?: string; page?: number; page_size?: number }) {
  return api.get('/documents', { params })
}

export function uploadDocument(formData: FormData) {
  return api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  })
}

export function previewChunks(formData: FormData) {
  return api.post<any, { chunks: ChunkPreviewItem[] }>('/documents/preview-chunks', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function getDocument(docId: number) {
  return api.get<any, DocumentItem>(`/documents/${docId}`)
}

export function previewDocument(docId: number) {
  return api.get(`/documents/${docId}/preview`)
}

export function deleteDocument(docId: number) {
  return api.delete(`/documents/${docId}`)
}

export function listFileTypes(): Promise<string[]> {
  return api.get('/documents/file-types') as any
}

export function getChunkConfig(kbId: number) {
  return api.get(`/documents/chunk-config/${kbId}`)
}

export function updateChunkConfig(kbId: number, data: { chunk_size: number; chunk_overlap: number; split_separator: string }) {
  return api.put(`/documents/chunk-config/${kbId}`, data)
}
