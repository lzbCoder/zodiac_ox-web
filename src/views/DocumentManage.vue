<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  listDocuments,
  uploadDocument,
  previewChunks,
  previewDocument,
  deleteDocument,
  getChunkConfig,
  updateChunkConfig,
  listFileTypes,
  type DocumentItem,
  type ChunkPreviewItem,
} from "@/api/document";
import { getDefaultChunkConfig } from "@/api/system";
import { listKbs, type KnowledgeBase } from "@/api/kb";
import { useAppStore } from "@/stores/app";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10M

const appStore = useAppStore();
const documents = ref<DocumentItem[]>([]);
const kbs = ref<KnowledgeBase[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filterKbId = ref<number | null>(null);
const filterType = ref<string | null>(null);
const fileTypes = ref<string[]>([]);

async function fetchFileTypes() {
  try {
    fileTypes.value = await listFileTypes();
  } catch { /* ignore */ }
}

// Upload dialog
const uploadVisible = ref(false);
const uploadKbId = ref<number | null>(null);
const uploadChunkSize = ref(1000);
const uploadChunkOverlap = ref(100);
const uploadSplitSep = ref("\n\n");
const uploading = ref(false);

async function openUploadDialog() {
  try {
    const cfg = await getDefaultChunkConfig();
    uploadChunkSize.value = cfg.chunk_size;
    uploadChunkOverlap.value = cfg.chunk_overlap;
    uploadSplitSep.value = cfg.split_separator;
  } catch { /* use current defaults */ }
  uploadVisible.value = true;
}

// Preview dialog
const previewVisible = ref(false);
const previewData = ref<any>(null);
const previewTab = ref("content");

// Chunk preview
const chunkPreviewVisible = ref(false);
const chunkPreviewData = ref<ChunkPreviewItem[]>([]);
const previewingChunks = ref(false);

// Document preview
const previewingDoc = ref(false);

const formLocked = computed(() => uploading.value || previewingChunks.value);

async function fetchDocuments() {
  loading.value = true;
  try {
    const res: any = await listDocuments({
      kb_id: filterKbId.value || undefined,
      file_type: filterType.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    });
    documents.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function fetchKbs() {
  kbs.value = await listKbs();
}

function getSelectedFile(): File | null {
  const fileInput =
    document.querySelector<HTMLInputElement>("#upload-file-input");
  return fileInput?.files?.[0] ?? null;
}

function validateFileSize(file: File): boolean {
  if (file.size > MAX_FILE_SIZE) {
    ElMessage.warning(
      `文件大小超出限制，最大支持上传 ${
        MAX_FILE_SIZE / 1024 / 1024
      }M，请压缩后重试`
    );
    return false;
  }
  return true;
}

async function handleUpload() {
  if (!uploadKbId.value) {
    ElMessage.warning("请选择知识库");
    return;
  }
  const file = getSelectedFile();
  if (!file) {
    ElMessage.warning("请选择文件");
    return;
  }
  if (!validateFileSize(file)) return;

  uploading.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kb_id", String(uploadKbId.value));
    formData.append("chunk_size", String(uploadChunkSize.value));
    formData.append("chunk_overlap", String(uploadChunkOverlap.value));
    formData.append("split_separator", uploadSplitSep.value);

    await uploadDocument(formData);
    ElMessage.success("文档上传、解析、向量化入库完成");
    uploadVisible.value = false;
    fetchDocuments();
    fetchFileTypes();
  } catch {
    ElMessage.error("上传失败，请检查文件或参数后重试");
  } finally {
    uploading.value = false;
  }
}

async function handlePreviewChunks() {
  const file = getSelectedFile();
  if (!file) {
    ElMessage.warning("请选择文件");
    return;
  }
  if (!validateFileSize(file)) return;

  previewingChunks.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chunk_size", String(uploadChunkSize.value));
    formData.append("chunk_overlap", String(uploadChunkOverlap.value));
    formData.append("split_separator", uploadSplitSep.value);
    const res = await previewChunks(formData);
    chunkPreviewData.value = res.chunks;
    chunkPreviewVisible.value = true;
  } catch {
    ElMessage.error("分片预览失败，请检查文件或参数后重试");
  } finally {
    previewingChunks.value = false;
  }
}

async function handlePreview(docId: number) {
  previewVisible.value = true;
  previewingDoc.value = true;
  previewTab.value = "content";
  try {
    const res: any = await previewDocument(docId);
    previewData.value = res;
  } catch {
    ElMessage.error("文档预览加载失败");
    previewVisible.value = false;
    previewData.value = null;
  } finally {
    previewingDoc.value = false;
  }
}

async function handleDelete(doc: DocumentItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${doc.filename}」吗？将同步清理向量和本地文件。`,
      "确认删除",
      { type: "warning" }
    );
    await deleteDocument(doc.id);
    ElMessage.success("已删除");
    fetchDocuments();
    fetchFileTypes();
  } catch {
    /* canceled */
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const statusTagType = (s: string) => {
  const map: Record<string, string> = {
    pending: "info",
    processing: "warning",
    success: "success",
    completed: "success",
    failed: "danger",
  };
  return map[s] || "info";
};
const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    pending: "待处理",
    processing: "处理中",
    success: "成功",
    completed: "已完成",
    failed: "失败",
  };
  return map[s] || s;
};

onMounted(() => {
  fetchDocuments();
  fetchKbs();
  fetchFileTypes();
});
</script>

<template>
  <div>
    <div class="page-header">
      <h2>文档管理</h2>
      <el-button type="primary" @click="openUploadDialog">
        <el-icon><Upload /></el-icon> 上传文档
      </el-button>
    </div>

    <!-- Filters -->
    <div style="margin-bottom: 16px; display: flex; gap: 12px">
      <el-select
        v-model="filterKbId"
        placeholder="选择知识库"
        clearable
        @change="fetchDocuments"
        style="width: 200px"
      >
        <el-option
          v-for="kb in kbs"
          :key="kb.id"
          :label="kb.name"
          :value="kb.id"
        />
      </el-select>
      <el-select
        v-model="filterType"
        placeholder="文件类型"
        clearable
        @change="fetchDocuments"
        style="width: 140px"
      >
        <el-option v-for="t in fileTypes" :key="t" :label="t.toUpperCase()" :value="t" />
      </el-select>
    </div>

    <!-- Table -->
    <el-table :data="documents" v-loading="loading" stripe style="width: 100%">
      <el-table-column
        prop="filename"
        label="文件名"
        min-width="200"
        align="center"
        show-overflow-tooltip
      />
      <el-table-column label="知识库" width="160" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tooltip :content="row.kb_name" placement="top" :disabled="row.kb_name.length <= 10">
            <span class="name-cell">{{ row.kb_name.length > 10 ? row.kb_name.slice(0, 10) + '...' : row.kb_name }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="file_type" label="类型" width="110" align="center" />
      <el-table-column label="大小" width="100" align="center">
        <template #default="{ row }">{{ formatSize(row.file_size) }}</template>
      </el-table-column>
      <el-table-column prop="page_count" label="页码" width="110" align="center" />
      <el-table-column label="上传状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.upload_status)" size="small">{{
            statusLabel(row.upload_status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="向量状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.vector_status)" size="small">{{
            statusLabel(row.vector_status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分片数" width="110" align="center">
        <template #default="{ row }">{{ row.chunk_count }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="200" align="center">
        <template #default="{ row }">{{
          row.created_at
            ? new Date(row.created_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-')
            : '-'
        }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handlePreview(row.id)"
            >预览</el-button
          >
          <el-button size="small" type="danger" @click="handleDelete(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      :total="total"
      :page-size="pageSize"
      layout="prev, pager, next, total"
      style="margin-top: 16px; justify-content: flex-end"
      @change="fetchDocuments"
    />

    <!-- Upload Dialog -->
    <el-dialog
      v-model="uploadVisible"
      title="上传文档"
      width="560px"
      :close-on-click-modal="!formLocked"
      :close-on-press-escape="!formLocked"
    >
      <div style="position: relative">
        <!-- Loading overlay -->
        <div
          v-if="formLocked"
          style="
            position: absolute;
            inset: 0;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.75);
            border-radius: 8px;
            gap: 16px;
          "
        >
          <el-icon class="is-loading" style="font-size: 40px; color: #1677ff"
            ><Loading
          /></el-icon>
          <span style="color: #333; font-size: 14px">{{
            uploading
              ? "正在解析文档、生成向量并入库，请稍候…"
              : "文档加载中..."
          }}</span>
        </div>
        <el-form label-position="top">
          <el-form-item label="选择知识库" required>
            <el-select
              v-model="uploadKbId"
              placeholder="请选择"
              style="width: 100%"
              :disabled="formLocked"
            >
              <el-option
                v-for="kb in kbs"
                :key="kb.id"
                :label="kb.name"
                :value="kb.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item required>
            <template #label>
              选择文件
              <!-- <el-tooltip
                content="支持最大文件大小为 10M，文件超出限制无法上传"
                placement="top"
              >
                <el-icon style="margin-left: 4px; color: #909399; cursor: help"
                  ><InfoFilled
                /></el-icon>
              </el-tooltip> -->
            </template>
            <input
              id="upload-file-input"
              type="file"
              accept="*"
              style="display: block"
              :disabled="formLocked"
            />
          </el-form-item>
          <el-divider>通用文本分块参数</el-divider>
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="分块大小">
                <el-input-number
                  v-model="uploadChunkSize"
                  :min="100"
                  :max="8000"
                  style="width: 100%"
                  :disabled="formLocked"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="重叠长度">
                <el-input-number
                  v-model="uploadChunkOverlap"
                  :min="0"
                  :max="2000"
                  style="width: 100%"
                  :disabled="formLocked"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="分隔符">
                <el-input
                  v-model="uploadSplitSep"
                  placeholder="\\n\\n"
                  :disabled="formLocked"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-button
            size="small"
            :loading="previewingChunks"
            :disabled="formLocked"
            @click="handlePreviewChunks"
            >预览分片</el-button
          >
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="formLocked" @click="uploadVisible = false"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="previewingChunks"
          @click="handleUpload"
          >开始上传</el-button
        >
      </template>
    </el-dialog>

    <!-- Document Preview Dialog -->
    <el-dialog
      v-model="previewVisible"
      :title="previewData?.filename || '预览'"
      width="800px"
      top="5vh"
    >
      <div style="position: relative; min-height: 200px">
        <!-- Loading overlay -->
        <div
          v-if="previewingDoc"
          style="
            position: absolute;
            inset: 0;
            z-index: 10;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.85);
            border-radius: 8px;
            gap: 16px;
          "
        >
          <el-icon class="is-loading" style="font-size: 40px; color: #1677ff"
            ><Loading
          /></el-icon>
          <span style="color: #333; font-size: 14px">文档加载中...</span>
        </div>
        <el-tabs v-model="previewTab">
          <el-tab-pane label="原文内容" name="content">
            <div
              style="
                max-height: 500px;
                overflow-y: auto;
                white-space: pre-wrap;
                background: #f9f9f9;
                padding: 16px;
                border-radius: 8px;
                font-size: 14px;
              "
            >
              {{ previewData?.content }}
            </div>
          </el-tab-pane>
          <el-tab-pane label="分片列表" name="chunks">
            <div style="max-height: 500px; overflow-y: auto">
              <el-card
                v-for="c in previewData?.chunks"
                :key="c.chunk_index"
                style="margin-bottom: 8px"
              >
                <div style="font-size: 12px; color: #999; margin-bottom: 4px">
                  分片 #{{ c.chunk_index }}
                  {{ c.page_num ? `— 页码 ${c.page_num}` : "" }}
                </div>
                <div style="font-size: 13px; white-space: pre-wrap">
                  {{ c.content }}
                </div>
              </el-card>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>

    <!-- Chunk Preview Dialog -->
    <el-dialog v-model="chunkPreviewVisible" title="分片预览" width="700px">
      <div style="max-height: 500px; overflow-y: auto">
        <el-card
          v-for="c in chunkPreviewData"
          :key="c.chunk_index"
          style="margin-bottom: 8px"
        >
          <div style="font-size: 12px; color: #999; margin-bottom: 4px">
            分片 #{{ c.chunk_index }}
          </div>
          <div style="font-size: 13px; white-space: pre-wrap">
            {{ c.content }}
          </div>
        </el-card>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.name-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
