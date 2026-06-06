import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const currentKbId = ref<number | null>(null)
  const currentKbName = ref('')
  const currentModel = ref('qwen3-max')
  const searchMode = ref('normal')

  function setKb(id: number, name: string) {
    currentKbId.value = id
    currentKbName.value = name
  }

  function setModel(model: string) {
    currentModel.value = model
  }

  function setSearchMode(mode: string) {
    searchMode.value = mode
  }

  return { currentKbId, currentKbName, currentModel, searchMode, setKb, setModel, setSearchMode }
})
