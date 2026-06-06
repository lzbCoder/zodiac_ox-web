import api from './index'

export interface EvalDataset {
  id: number
  kb_id: number
  name: string
  description: string | null
  total_questions: number
  created_at: string
  updated_at: string | null
  created_by: string | null
  is_deleted: boolean
}

export interface EvalQuestion {
  id: number
  dataset_id: number
  kb_id: number
  query: string
  standard_answer: string | null
  standard_doc_ids: number[] | null
  standard_chunk_ids: number[] | null
  difficulty: string
  created_at: string
}

export interface EvalTask {
  id: number
  name: string
  task_type: string
  dataset_id: number | null
  kb_id: number
  dataset_name: string
  kb_name: string
  top_k: number
  retriever_mode: string
  model_name: string | null
  eval_model: string | null
  sample_count: number | null
  sample_strategy: string | null
  enable_ragas: boolean
  status: string
  progress: number
  recall: number | null
  precision: number | null
  hit_rate: number | null
  mrr: number | null
  context_precision: number | null
  context_recall: number | null
  faithfulness: number | null
  answer_relevancy: number | null
  cost_seconds: number | null
  created_at: string
  finished_at: string | null
}

export interface EvalResult {
  id: number
  task_id: number
  qid: number
  query: string
  retrieved_chunk_ids: number[] | null
  retrieved_doc_ids: number[] | null
  recall: number | null
  precision: number | null
  hit: boolean | null
  rank: number | null
  mrr: number | null
  retrieve_time: number | null
  answer_time: number | null
  answer: string | null
  context_precision: number | null
  context_recall: number | null
  faithfulness: number | null
  answer_relevancy: number | null
}

export interface EvalReport {
  task: EvalTask
  total_questions: number
  results: EvalResult[]
}

export interface EvalConfig {
  id: number
  kb_id: number
  default_top_k: number
  default_retriever_mode: string
  updated_at: string | null
}

// ── Datasets ─────────────────────────────────────────

export function listDatasets(params: { kb_id?: number; page?: number; page_size?: number } = {}) {
  return api.get<any, { items: EvalDataset[]; total: number; page: number; page_size: number }>('/rag/eval/datasets', { params })
}

export function createDataset(data: { kb_id: number; name: string; description?: string; created_by?: string }) {
  return api.post<any, EvalDataset>('/rag/eval/datasets', data)
}

export function getDataset(id: number) {
  return api.get<any, EvalDataset>(`/rag/eval/datasets/${id}`)
}

export function updateDataset(id: number, data: { name?: string; description?: string }) {
  return api.put<any, EvalDataset>(`/rag/eval/datasets/${id}`, data)
}

export function deleteDataset(id: number) {
  return api.delete(`/rag/eval/datasets/${id}`)
}

// ── Questions ────────────────────────────────────────

export function listQuestions(datasetId: number, params: { page?: number; page_size?: number } = {}) {
  return api.get<any, { items: EvalQuestion[]; total: number }>(`/rag/eval/datasets/${datasetId}/questions`, { params })
}

export function importQuestions(datasetId: number, formData: FormData) {
  return api.post<any, { message: string; count: number }>(`/rag/eval/datasets/${datasetId}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteQuestion(id: number) {
  return api.delete(`/rag/eval/questions/${id}`)
}

// ── Tasks ────────────────────────────────────────────

export function listTasks(params: { kb_id?: number; page?: number; page_size?: number } = {}) {
  return api.get<any, { items: EvalTask[]; total: number; page: number; page_size: number }>('/rag/eval/tasks', { params })
}

export function createTask(data: { name: string; task_type?: string; dataset_id?: number | null; kb_id: number; top_k?: number; retriever_mode?: string; model_name?: string; enable_ragas?: boolean; eval_model?: string; sample_time_start?: string; sample_time_end?: string; sample_count?: number; sample_strategy?: string }) {
  return api.post<any, EvalTask>('/rag/eval/tasks', data)
}

export function getTask(id: number) {
  return api.get<any, EvalTask>(`/rag/eval/tasks/${id}`)
}

export function runTask(id: number) {
  return api.post<any, { message: string; task_id: number }>(`/rag/eval/tasks/${id}/run`)
}

export function cancelTask(id: number) {
  return api.post<any, { message: string }>(`/rag/eval/tasks/${id}/cancel`)
}

export function deleteTask(id: number) {
  return api.delete<any, { message: string }>(`/rag/eval/tasks/${id}`)
}

// ── Reports ──────────────────────────────────────────

export function getReport(taskId: number) {
  return api.get<any, EvalReport>(`/rag/eval/tasks/${taskId}/report`)
}

export function getResults(taskId: number, hitFilter?: string) {
  return api.get<any, { items: EvalResult[]; total: number }>(`/rag/eval/tasks/${taskId}/results`, {
    params: hitFilter ? { hit_filter: hitFilter } : {},
  })
}

export function exportReport(taskId: number) {
  return api.get<any, Blob>(`/rag/eval/tasks/${taskId}/report/export`, { responseType: 'blob' })
}

export function listReports(params: { kb_id?: number; page?: number; page_size?: number } = {}) {
  return api.get<any, { items: EvalTask[]; total: number; page: number; page_size: number }>('/rag/eval/reports', { params })
}

// ── Config ───────────────────────────────────────────

export function getEvalConfig(kbId: number) {
  return api.get<any, EvalConfig>(`/rag/eval/configs/${kbId}`)
}

export function updateEvalConfig(kbId: number, data: { default_top_k?: number; default_retriever_mode?: string }) {
  return api.put<any, EvalConfig>(`/rag/eval/configs/${kbId}`, data)
}

// ── Label Tool ──────────────────────────────────────────

export interface LabelTask {
  id: number
  name: string
  kb_id: number
  top_k: number
  description: string | null
  created_by: string | null
  status: string
  progress: number
  total_details: number
  created_at: string
  updated_at: string | null
}

export interface LabelDetail {
  id: number
  task_id: number
  query: string
  standard_answer: string | null
  standard_chunk_ids: number[] | null
  standard_doc_ids: number[] | null
  status: string
  annotated_by: string | null
  annotated_at: string | null
}

export interface CandidateChunk {
  chunk_id: number
  doc_id: number
  kb_id: number
  content: string
  doc_name: string
  score: number
  page_num: number | null
}

export interface ChunkCandidates {
  detail_id: number
  query: string
  standard_answer: string | null
  chunks: CandidateChunk[]
}

export function listLabelTasks(params: { kb_id?: number; page?: number; page_size?: number } = {}) {
  return api.get<any, { items: LabelTask[]; total: number; page: number; page_size: number }>('/rag/eval/label/tasks', { params })
}

export function createLabelTask(data: { name: string; kb_id: number; top_k?: number; description?: string; queries: { query: string; standard_answer?: string }[] }) {
  return api.post<any, LabelTask>('/rag/eval/label/tasks', data)
}

export function getLabelTask(id: number) {
  return api.get<any, LabelTask>(`/rag/eval/label/tasks/${id}`)
}

export function updateLabelTask(id: number, data: { name?: string; description?: string }) {
  return api.put<any, LabelTask>(`/rag/eval/label/tasks/${id}`, data)
}

export function deleteLabelTask(id: number) {
  return api.delete(`/rag/eval/label/tasks/${id}`)
}

export function listLabelDetails(taskId: number, params: { status?: string; keyword?: string; page?: number; page_size?: number } = {}) {
  return api.get<any, { items: LabelDetail[]; total: number }>(`/rag/eval/label/tasks/${taskId}/details`, { params })
}

export function getCandidateChunks(detailId: number) {
  return api.get<any, ChunkCandidates>(`/rag/eval/label/details/${detailId}/chunks`)
}

export function saveAnnotation(detailId: number, data: { standard_chunk_ids: number[]; annotated_by?: string }) {
  return api.put<any, LabelDetail>(`/rag/eval/label/details/${detailId}`, data)
}

export function batchSaveAnnotations(taskId: number, data: { annotations: { detail_id: number; standard_chunk_ids: number[] }[]; annotated_by?: string }) {
  return api.put<any, { message: string; saved: number }>(`/rag/eval/label/tasks/${taskId}/details/batch`, data)
}

export function exportLabelTask(taskId: number, format: string = 'json') {
  const responseType = format === 'json' ? 'json' : 'blob'
  return api.get<any, any>(`/rag/eval/label/tasks/${taskId}/export`, { params: { format }, responseType })
}

export function parseLabelFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<any, { items: { query: string; standard_answer: string | null }[]; count: number }>('/rag/eval/label/parse-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
