import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/kb',
    },
    {
      path: '/kb',
      name: 'KnowledgeBase',
      component: () => import('@/views/KnowledgeBase.vue'),
    },
    {
      path: '/documents',
      name: 'DocumentManage',
      component: () => import('@/views/DocumentManage.vue'),
    },
    {
      path: '/chat',
      name: 'ChatQA',
      component: () => import('@/views/ChatQA.vue'),
    },
    {
      path: '/monitor',
      name: 'MonitorDashboard',
      component: () => import('@/views/MonitorDashboard.vue'),
    },
{
      path: '/vector',
      name: 'VectorManage',
      component: () => import('@/views/VectorManage.vue'),
    },
    {
      path: '/settings',
      name: 'SystemSettings',
      component: () => import('@/views/SystemSettings.vue'),
    },
    {
      path: '/eval/datasets',
      name: 'EvalDataset',
      component: () => import('@/views/EvalDataset.vue'),
    },
    {
      path: '/eval/tasks',
      name: 'EvalTask',
      component: () => import('@/views/EvalTask.vue'),
    },
    {
      path: '/eval/reports',
      name: 'EvalReports',
      component: () => import('@/views/EvalReport.vue'),
    },
    {
      path: '/eval/label-tool',
      name: 'EvalLabelTool',
      component: () => import('@/views/EvalLabelTool.vue'),
    },
    {
      path: '/eval/report/:taskId',
      name: 'EvalReportDetail',
      component: () => import('@/views/EvalReport.vue'),
    },
  ],
})

export default router
