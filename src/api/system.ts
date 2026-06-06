import api from './index'

export interface SystemConfigItem {
  id: number
  config_key: string
  config_value: string | null
  description: string | null
  updated_at: string
}

export interface ConnectionStatus {
  postgresql: boolean
  milvus: boolean
  redis: boolean
}

export function listConfigs() {
  return api.get<any, SystemConfigItem[]>('/system/configs')
}

export function createConfig(data: { config_key: string; config_value: string; description?: string }) {
  return api.post<any, SystemConfigItem>('/system/configs', data)
}

export function updateConfig(key: string, data: { config_value: string; description?: string }) {
  return api.put<any, SystemConfigItem>(`/system/configs/${key}`, data)
}

export function deleteConfig(key: string) {
  return api.delete(`/system/configs/${key}`)
}

export function checkConnection() {
  return api.get<any, ConnectionStatus>('/system/connection-status')
}

export interface DefaultChunkConfig {
  chunk_size: number
  chunk_overlap: number
  split_separator: string
}

export function getDefaultChunkConfig() {
  return api.get<any, DefaultChunkConfig>('/system/default-chunk-config')
}

export interface PromptConfig {
  system_prompt: string
  user_prompt: string
}

export function getPromptConfig() {
  return api.get<any, PromptConfig>('/system/prompt-config')
}

export function savePromptConfig(data: PromptConfig) {
  return api.post<any, { message: string }>('/system/prompt-config', data)
}

export interface RetrievalConfig {
  dense_top_k: number
  sparse_top_k: number
  final_top_k: number
}

export function getRetrievalConfig() {
  return api.get<any, RetrievalConfig>('/system/retrieval-config')
}

export function saveRetrievalConfig(data: RetrievalConfig) {
  return api.post<any, { message: string }>('/system/retrieval-config', data)
}

export interface FeatureFlags {
  otel_enabled: boolean
  memory_enabled: boolean
}

export function getFeatureFlags() {
  return api.get<any, FeatureFlags>('/system/feature-flags')
}

export function toggleOtel(data: { otel_enabled: boolean }) {
  return api.post<any, { message: string; otel_enabled: boolean }>('/system/feature-flags/otel', data)
}

export function toggleMemory(data: { memory_enabled: boolean }) {
  return api.post<any, { message: string; memory_enabled: boolean }>('/system/feature-flags/memory', data)
}
