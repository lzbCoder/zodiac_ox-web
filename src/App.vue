<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-icon">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 4L4 26h24L16 4z" fill="#1677FF" opacity="0.3"/>
            <path d="M16 10L8 26h16L16 10z" fill="#1677FF"/>
            <path d="M16 16L12 26h8L16 16z" fill="#fff" opacity="0.4"/>
          </svg>
        </div>
        <div class="header-text">
          <h1>越群山</h1>
          <span>知识库RAG系统</span>
        </div>
      </div>
      <el-menu
        :default-active="router.currentRoute.value.path"
        router
        background-color="#001529"
        text-color="#ffffffb3"
        active-text-color="#1677FF"
      >
        <el-menu-item index="/kb">
          <el-icon :size="18"><Folder /></el-icon>
          <span>知识库</span>
        </el-menu-item>
        <el-menu-item index="/documents">
          <el-icon :size="18"><Document /></el-icon>
          <span>文档管理</span>
        </el-menu-item>
        <el-menu-item index="/chat">
          <el-icon :size="18"><ChatDotRound /></el-icon>
          <span>RAG问答</span>
        </el-menu-item>
        <el-menu-item index="/monitor">
          <el-icon :size="18"><Monitor /></el-icon>
          <span>RAG监控</span>
        </el-menu-item>
        <el-sub-menu index="/eval-group">
          <template #title>
            <el-icon :size="18"><DataAnalysis /></el-icon>
            <span>RAG评测</span>
          </template>
          <el-menu-item index="/eval/datasets">
            <el-icon :size="16"><Collection /></el-icon>
            <span>评测集</span>
          </el-menu-item>
          <el-menu-item index="/eval/tasks">
            <el-icon :size="16"><Checked /></el-icon>
            <span>评测任务</span>
          </el-menu-item>
          <!-- <el-menu-item index="/eval/reports">
            <el-icon :size="16"><TrendCharts /></el-icon>
            <span>评测报告</span>
          </el-menu-item> -->
          <el-menu-item index="/eval/label-tool">
            <el-icon :size="16"><EditPen /></el-icon>
            <span>标注工具</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/vector">
          <el-icon :size="18"><DataAnalysis /></el-icon>
          <span>向量管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon :size="18"><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
}
.sidebar {
  width: 270px;
  background-color: #001529;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.logo-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-icon svg {
  width: 36px;
  height: 36px;
}
.header-text {
  display: flex;
  flex-direction: column;
}
.header-text h1 {
  color: #fff;
  font-size: 19px;
  margin: 0;
  font-weight: 600;
  line-height: 1.2;
}
.header-text span {
  color: #ffffff73;
  font-size: 12px;
}
.main-content {
  flex: 1;
  overflow-x: auto;
  overflow-y: auto;
  background: #f5f7fa;
  padding: 12px;
}

/* Force el-menu to fill sidebar width */
.sidebar :deep(.el-menu) {
  border-right: none;
  width: 100%;
}
.sidebar :deep(.el-menu-item) {
  font-size: 15px;
  padding-left: 24px !important;
  width: 100%;
}
.sidebar :deep(.el-menu-item .el-icon) {
  font-size: 18px;
  width: 18px;
  height: 18px;
}

/* Sub-menu: title aligns with top-level items */
.sidebar :deep(.el-sub-menu__title) {
  font-size: 15px;
  padding-left: 24px !important;
  width: 100%;
}
.sidebar :deep(.el-sub-menu__title .el-icon) {
  font-size: 18px;
  width: 18px;
  height: 18px;
}

/* Sub-menu children: indent 24px to show hierarchy */
.sidebar :deep(.el-menu--inline) {
  padding-left: 0;
}
.sidebar :deep(.el-menu--inline .el-menu-item) {
  font-size: 14px;
  padding-left: 48px !important;
}
.sidebar :deep(.el-menu--inline .el-menu-item .el-icon) {
  font-size: 16px;
  width: 16px;
  height: 16px;
}
</style>
