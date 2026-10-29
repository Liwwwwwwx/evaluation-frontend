# Science 评测前端项目规则

## 产品界面设计规范（强制）

- 开始任何页面、组件、样式或交互的设计、实现与修改前，必须阅读并遵循 [产品界面设计规范](docs/产品界面设计规范.md) 的当前版本；本规则适用于登录、工作台及所有后续页面。
- 按规范统一布局、间距、字号、颜色、控件状态、响应式、评分展示和验收，不得因个人习惯随意偏离。规范中的待确认项应先结合现有业务契约核实；规范提出但尚未实现的内容不得描述为已完成。
- 文本输入控件聚焦时不显示额外焦点标记；其他控件的键盘焦点、可访问性和已知限制按规范处理。
- 如用户最新明确要求与规范冲突，以用户要求为准；若需长期改变规范，先更新规范文档并说明原因，再执行页面改动。
- 每次页面开发按规范的验收清单检查受影响页面和状态，明确已验证与未验证范围；不虚构业务数据或评分真实性。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
