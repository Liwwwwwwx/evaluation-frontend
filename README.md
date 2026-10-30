# Science Evaluation Frontend

面向内部研发和测试的独立 AI 科学服务评测平台前端。

## 当前状态

- 已实现登录、工作台、题库（导入、删除、筛选）、新建测评（服务选择、题库随机/单选、直接输入、真实发起）、运行记录列表和运行详情（对话正文 + 右侧评分）。
- 运行记录只支持分页，暂无关键词搜索、状态筛选和批量发起；导出、人工复核未接入。
- 产品页面开发须遵循 [产品界面设计规范](docs/产品界面设计规范.md)。

## 本地运行

需要 Node.js 22.14 或更高的 22.x，以及 Yarn 1.22.22：

```bash
corepack yarn install --frozen-lockfile
corepack yarn dev
```

打开 http://localhost:6714。登录代理默认访问测评后端 `http://127.0.0.1:7714`，可通过 `SCIENCE_EVALUATION_BACKEND_URL` 指定；后端需配置数据库、会话表和对应的前端访问 origin。生产环境必须使用 HTTPS，参见 `.env.example` 和后端 README。

检查命令：`corepack yarn lint`、`corepack yarn type-check` 和 `corepack yarn build`。

## 项目边界

- 登录使用独立测评后端，共享 Science Admin 的账号和权限；业务代理仍指向旧管理端，不接受新的测评登录会话，业务功能等待逐步迁移。
- 项目不包含凭据、真实评测数据或生产部署配置；模型评分不等于科学真实性验证。
