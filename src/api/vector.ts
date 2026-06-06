import api from './index'

export interface VectorStats {
  total_vectors: number
  valid_vectors: number
  doc_count: number
  collection_name: string
}

export function getVectorStats() {
  return api.get<any, VectorStats>('/vector/stats')
}

export function cleanInvalidVectors() {
  return api.post('/vector/cleanup')
}
