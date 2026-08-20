# AGENTS.md - 钟福管理中控台

## 项目概览
钟福管理中控台是一款宠物生活管理 Web 应用，集成采购、喂食、健康、支出四大模块与对话助手功能。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **State**: React Context + localStorage 持久化

## 目录结构
```
src/
├── app/
│   ├── layout.tsx            # 根布局（含 AppShell）
│   ├── page.tsx              # 总览仪表盘
│   ├── procurement/page.tsx  # 采购总览表
│   ├── feeding/page.tsx      # 喂食日历
│   ├── health/page.tsx       # 健康管理
│   └── expenses/page.tsx     # 支出记账
├── components/
│   ├── app-shell.tsx         # 应用外壳（侧边栏+主内容区）
│   ├── sidebar.tsx           # 侧边栏导航
│   ├── chat-dialog.tsx       # 对话助手弹窗
│   ├── providers.tsx         # 全局 Context Provider
│   └── ui/                   # shadcn/ui 组件
└── lib/
    ├── store.ts              # 数据模型与 localStorage 存取
    └── utils.ts              # 工具函数
```

## 开发命令
- 开发: `pnpm dev`
- 构建: `pnpm build`
- 类型检查: `pnpm ts-check`
- Lint: `pnpm lint`

## 设计规范
- 设计风格详见 `DESIGN.md`
- 主色: 鼠尾草绿 #6B9F7B
- 辅色: 琥珀暖橙 #D4915E
- 背景: 温暖米白 #FAFAF8

## 数据管理
- 所有数据通过 React Context (`useAppContext`) 访问
- 数据持久化到 localStorage（key: `zhongfu-console-data`）
- 预置示例数据用于演示

## 关键组件
- `StatCard`: 统计卡片（仪表盘）
- `WeightChart`: SVG 体重曲线图
- `ChatDialog`: 对话助手（支持快捷回复）
- `Sidebar`: 可折叠侧边栏导航
