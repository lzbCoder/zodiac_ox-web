<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  listDatasets,
  createDataset,
  updateDataset,
  deleteDataset,
  listQuestions,
  importQuestions,
  deleteQuestion,
  type EvalDataset,
  type EvalQuestion,
} from "@/api/ragEval";
import { listKbs, type KnowledgeBase } from "@/api/kb";

const datasets = ref<EvalDataset[]>([]);
const kbs = ref<KnowledgeBase[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filterKbId = ref<number | null>(null);

// Create/Edit dialog
const formVisible = ref(false);
const formSubmitting = ref(false);
const editingId = ref<number | null>(null);
const formName = ref("");
const formDesc = ref("");
const formKbId = ref<number | null>(null);

// Import dialog
const importVisible = ref(false);
const importDatasetId = ref<number | null>(null);
const importing = ref(false);

// Questions dialog
const questionsVisible = ref(false);
const questionsDatasetId = ref<number | null>(null);
const questionsDatasetName = ref("");
const questions = ref<EvalQuestion[]>([]);
const questionsTotal = ref(0);
const questionsPage = ref(1);
const questionsLoading = ref(false);

async function fetchDatasets() {
  loading.value = true;
  try {
    const res: any = await listDatasets({
      kb_id: filterKbId.value || undefined,
      page: page.value,
      page_size: pageSize.value,
    });
    datasets.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function fetchKbs() {
  kbs.value = await listKbs();
}

function openCreate() {
  editingId.value = null;
  formName.value = "";
  formDesc.value = "";
  formKbId.value = null;
  formVisible.value = true;
}

function openEdit(ds: EvalDataset) {
  editingId.value = ds.id;
  formName.value = ds.name;
  formDesc.value = ds.description || "";
  formKbId.value = ds.kb_id;
  formVisible.value = true;
}

async function handleFormSubmit() {
  if (!formName.value || !formKbId.value) {
    ElMessage.warning("请填写名称和关联知识库");
    return;
  }
  formSubmitting.value = true;
  try {
    if (editingId.value) {
      await updateDataset(editingId.value, {
        name: formName.value,
        description: formDesc.value || undefined,
      });
      ElMessage.success("已更新");
    } else {
      await createDataset({
        kb_id: formKbId.value,
        name: formName.value,
        description: formDesc.value || undefined,
      });
      ElMessage.success("已创建");
    }
    formVisible.value = false;
    fetchDatasets();
  } catch {
    ElMessage.error("操作失败");
  } finally {
    formSubmitting.value = false;
  }
}

async function handleDelete(ds: EvalDataset) {
  try {
    await ElMessageBox.confirm(
      `确定删除评测集「${ds.name}」吗？将同步删除所有关联问题。`,
      "确认删除",
      { type: "warning" }
    );
    await deleteDataset(ds.id);
    ElMessage.success("已删除");
    fetchDatasets();
  } catch {
    /* canceled */
  }
}

// ── Import ────────────────────────────────────────────

function openImport(ds: EvalDataset) {
  importDatasetId.value = ds.id;
  importVisible.value = true;
}

async function handleImport() {
  const fileInput = document.querySelector<HTMLInputElement>(
    "#eval-import-file-input"
  );
  const file = fileInput?.files?.[0];
  if (!file) {
    ElMessage.warning("请选择文件");
    return;
  }
  if (!importDatasetId.value) return;

  const ext = file.name.toLowerCase();
  if (
    !ext.endsWith(".xlsx") &&
    !ext.endsWith(".xls") &&
    !ext.endsWith(".csv")
  ) {
    ElMessage.warning("仅支持 Excel(.xlsx/.xls) 或 CSV(.csv) 文件");
    return;
  }

  importing.value = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res: any = await importQuestions(importDatasetId.value, formData);
    ElMessage.success(res.message || `成功导入 ${res.count} 条问题`);
    importVisible.value = false;
    if (fileInput) fileInput.value = "";
    fetchDatasets();
  } catch {
    ElMessage.error("导入失败，请检查文件格式");
  } finally {
    importing.value = false;
  }
}

// ── Questions ─────────────────────────────────────────

async function openQuestions(ds: EvalDataset) {
  questionsDatasetId.value = ds.id;
  questionsDatasetName.value = ds.name;
  questionsPage.value = 1;
  questionsVisible.value = true;
  await fetchQuestions();
}

async function fetchQuestions() {
  if (!questionsDatasetId.value) return;
  questionsLoading.value = true;
  try {
    const res: any = await listQuestions(questionsDatasetId.value, {
      page: questionsPage.value,
      page_size: 50,
    });
    questions.value = res.items;
    questionsTotal.value = res.total;
  } finally {
    questionsLoading.value = false;
  }
}

async function handleDeleteQuestion(q: EvalQuestion) {
  try {
    await ElMessageBox.confirm("确定删除该问题吗？", "确认删除", {
      type: "warning",
    });
    await deleteQuestion(q.id);
    ElMessage.success("已删除");
    fetchQuestions();
    fetchDatasets();
  } catch {
    /* canceled */
  }
}

function formatDifficulty(d: string) {
  const map: Record<string, string> = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };
  return map[d] || d;
}

function formatDate(iso: string) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 19);
}

onMounted(() => {
  fetchDatasets();
  fetchKbs();
});
</script>

<template>
  <div>
    <div class="page-header">
      <h2>评测集管理</h2>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon> 创建评测集
      </el-button>
    </div>

    <div style="margin-bottom: 16px; display: flex; gap: 12px">
      <el-select
        v-model="filterKbId"
        placeholder="选择知识库"
        clearable
        @change="fetchDatasets"
        style="width: 200px"
      >
        <el-option
          v-for="kb in kbs"
          :key="kb.id"
          :label="kb.name"
          :value="kb.id"
        />
      </el-select>
    </div>

    <el-table :data="datasets" v-loading="loading" stripe style="width: 100%">
      <el-table-column label="名称" min-width="200" align="center">
        <template #default="{ row }">
          <el-tooltip
            :content="row.name"
            placement="top"
            :disabled="row.name.length <= 20"
          >
            <span class="name-cell">{{ row.name.length > 20 ? row.name.slice(0, 20) + '...' : row.name }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="描述" min-width="160" align="center" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tooltip
            :content="row.description || '-'"
            placement="top"
            :disabled="!row.description || row.description.length <= 20"
          >
            <span class="name-cell">{{ row.description ? (row.description.length > 20 ? row.description.slice(0, 20) + '...' : row.description) : '-' }}</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="样本数" width="190" align="center">
        <template #default="{ row }">{{ row.total_questions }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="270" align="center">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="390" align="center" fixed="right">
        <template #default="{ row }">
          <div class="action-btns">
            <el-button @click="openEdit(row)">编辑</el-button>
            <el-button @click="openQuestions(row)">内容</el-button>
            <el-button @click="openImport(row)">导入</el-button>
            <el-button type="danger" @click="handleDelete(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      :total="total"
      :page-size="pageSize"
      layout="prev, pager, next, total"
      style="margin-top: 16px; justify-content: flex-end"
      @change="fetchDatasets"
    />

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="formVisible"
      :title="editingId ? '编辑评测集' : '创建评测集'"
      width="480px"
    >
      <el-form label-position="top" :disabled="formSubmitting">
        <el-form-item label="关联知识库" required>
          <el-select
            v-model="formKbId"
            placeholder="请选择"
            style="width: 100%"
            :disabled="!!editingId"
          >
            <el-option
              v-for="kb in kbs"
              :key="kb.id"
              :label="kb.name"
              :value="kb.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="评测集名称" required>
          <el-input
            v-model="formName"
            placeholder="如：知识库1基础评测集"
            maxlength="200"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="formDesc"
            type="textarea"
            placeholder="可选的描述信息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false" :disabled="formSubmitting"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="formSubmitting"
          @click="handleFormSubmit"
          >确认</el-button
        >
      </template>
    </el-dialog>

    <!-- Import Dialog -->
    <el-dialog
      v-model="importVisible"
      title="导入评测问题"
      width="500px"
      :close-on-click-modal="!importing"
      :close-on-press-escape="!importing"
    >
      <div style="position: relative">
        <div
          v-if="importing"
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
          <span style="color: #333; font-size: 14px">正在导入，请稍候...</span>
        </div>
        <div style="margin-bottom: 12px; color: #666; font-size: 13px">
          支持 Excel(.xlsx/.xls) 或 CSV(.csv) 文件，需包含 <b>query</b> 列。
          可选列：standard_answer、standard_doc_ids、standard_chunk_ids、difficulty。
        </div>
        <el-form label-position="top" :disabled="importing">
          <el-form-item label="选择文件" required>
            <input
              id="eval-import-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              style="display: block"
              :disabled="importing"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button :disabled="importing" @click="importVisible = false"
          >取消</el-button
        >
        <el-button type="primary" :loading="importing" @click="handleImport"
          >开始导入</el-button
        >
      </template>
    </el-dialog>

    <!-- Questions Dialog -->
    <el-dialog
      v-model="questionsVisible"
      :title="`${questionsDatasetName} — 样本列表`"
      width="900px"
      top="5vh"
    >
      <el-table
        :data="questions"
        v-loading="questionsLoading"
        stripe
        max-height="520"
      >
        <el-table-column
          prop="query"
          label="问题"
          min-width="250"
          show-overflow-tooltip
        />
        <el-table-column label="标准答案" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{
            row.standard_answer || "-"
          }}</template>
        </el-table-column>
        <el-table-column label="难度" width="80">
          <template #default="{ row }">{{
            formatDifficulty(row.difficulty)
          }}</template>
        </el-table-column>
        <el-table-column label="标准分块" width="100">
          <template #default="{ row }">{{
            row.standard_chunk_ids?.join(", ") || "-"
          }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="danger"
              @click="handleDeleteQuestion(row)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.action-btns {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: center;
}
.action-btns .el-button {
  padding: 6px 12px;
  font-size: 13px;
}
.name-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
