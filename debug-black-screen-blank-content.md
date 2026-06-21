# Debug Session: black-screen-blank-content

- **Created**: 2026-06-21
- **Status**: [OPEN]
- **Session ID**: black-screen-blank-content
- **Symptom**: 项目启动后页面黑屏，无任何可见内容
- **Reproduction**: `pnpm install` → `pnpm dev` → 访问 http://localhost:50003

---

## Hypotheses

| ID | Hypothesis | Status | Evidence |
|----|------------|--------|----------|
| H1 | 前端路由/应用挂载失败，React 根组件未渲染或崩溃 | PENDING | — |
| H2 | Tailwind CSS 编译失败，深色主题下文字与背景同色 | PENDING | — |
| H3 | 运行时异常（Hook/Store 抛出错误），React 崩溃 | PENDING | — |
| H4 | Vite 依赖未安装或构建失败，HMR 报错 | PENDING | — |
| H5 | 自定义字体未加载导致文本不可见 | PENDING | — |

---

## Instrumentation Log

| Time | Point | Action |
|------|-------|--------|
| - | - | - |

---

## Evidence & Analysis

*(to be filled)*

---

## Fix

| File | Change |
|------|--------|
| - | - |

---

## Verification

| Run | Result |
|-----|--------|
| pre-fix | - |
| post-fix | - |
