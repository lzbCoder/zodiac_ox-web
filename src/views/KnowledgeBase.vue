<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listKbs, createKb, updateKb, deleteKb, type KnowledgeBase } from '@/api/kb'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const kbs = ref<KnowledgeBase[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogTitle = ref('新建知识库')
const form = ref({ name: '', description: '' })
const editingId = ref<number | null>(null)

async function fetchKbs() {
  loading.value = true
  try {
    kbs.value = await listKbs()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  dialogTitle.value = '新建知识库'
  form.value = { name: '', description: '' }
  dialogVisible.value = true
}

function openEdit(kb: KnowledgeBase) {
  editingId.value = kb.id
  dialogTitle.value = '编辑知识库'
  form.value = { name: kb.name, description: kb.description || '' }
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!form.value.name.trim()) return
  if (editingId.value) {
    await updateKb(editingId.value, form.value)
    ElMessage.success('更新成功')
  } else {
    await createKb(form.value)
    ElMessage.success('创建成功')
  }
  dialogVisible.value = false
  fetchKbs()
}

async function handleDelete(kb: KnowledgeBase) {
  try {
    await ElMessageBox.confirm(`确定删除知识库「${kb.name}」吗？删除后数据不可恢复。`, '确认删除', { type: 'warning' })
    await deleteKb(kb.id)
    ElMessage.success('已删除')
    fetchKbs()
  } catch { /* canceled */ }
}

function enterChat(kb: KnowledgeBase) {
  appStore.setKb(kb.id, kb.name)
  router.push('/chat')
}

onMounted(fetchKbs)
</script>

<template>
  <div>
    <div class="page-header">
      <h2>知识库管理</h2>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 新建知识库
      </el-button>
    </div>

    <div v-loading="loading" class="card-grid">
      <el-card v-for="kb in kbs" :key="kb.id" shadow="hover" class="kb-card">
        <div class="kb-card-body">
          <h3>{{ kb.name }}</h3>
          <p class="desc">{{ kb.description || '暂无描述' }}</p>
          <div class="meta">
            <span>文档数：<b>{{ kb.doc_count }}</b></span>
            <el-tag size="small" :type="kb.vector_status === 'normal' ? 'success' : 'warning'">
              {{ kb.vector_status === 'normal' ? '正常' : '异常' }}
            </el-tag>
          </div>
        </div>
        <div class="kb-card-actions">
          <el-button size="small" type="primary" @click="enterChat(kb)">进入问答</el-button>
          <el-button size="small" @click="openEdit(kb)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(kb)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="!loading && kbs.length === 0" description="暂无知识库" />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="480px">
      <el-form :model="form" label-position="top">
        <el-form-item label="知识库名称" required>
          <el-input v-model="form.name" placeholder="请输入名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可选描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.kb-card {
  cursor: pointer;
  transition: transform 0.2s;
}
.kb-card:hover {
  transform: translateY(-2px);
}
.kb-card-body h3 {
  font-size: 16px;
  margin-bottom: 8px;
}
.kb-card-body .desc {
  color: #999;
  font-size: 13px;
  min-height: 36px;
  margin-bottom: 12px;
}
.kb-card-body .meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #666;
}
.kb-card-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 8px;
}
</style>
