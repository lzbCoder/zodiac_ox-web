<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getVectorStats, cleanInvalidVectors, type VectorStats } from '@/api/vector'
import { listKbs, type KnowledgeBase } from '@/api/kb'

const stats = ref<VectorStats | null>(null)
const kbs = ref<KnowledgeBase[]>([])
const loading = ref(false)

async function fetchStats() {
  stats.value = await getVectorStats()
}

async function fetchKbs() {
  kbs.value = await listKbs()
}

async function handleCleanup() {
  try {
    await ElMessageBox.confirm('确定清理所有无效向量吗？将删除对应文档已被删除的向量数据。', '确认', { type: 'warning' })
    await cleanInvalidVectors()
    ElMessage.success('清理完成')
    fetchStats()
  } catch { /* canceled */ }
}

onMounted(() => {
  fetchStats()
  fetchKbs()
})
</script>

<template>
  <div>
    <div class="page-header">
      <h2>向量库管理</h2>
    </div>

    <!-- Stats -->
    <el-row :gutter="16" style="margin-bottom: 24px;">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="value">{{ stats?.total_vectors || 0 }}</div>
            <div class="label">总向量数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="value">{{ stats?.valid_vectors || 0 }}</div>
            <div class="label">有效向量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="value">{{ stats?.doc_count || 0 }}</div>
            <div class="label">文档数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <div class="value">{{ stats?.collection_name || '-' }}</div>
            <div class="label">集合名称</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Operations -->
    <el-card>
      <template #header>操作区</template>
      <el-button type="danger" size="small" @click="handleCleanup">清理无效向量</el-button>
    </el-card>
  </div>
</template>
