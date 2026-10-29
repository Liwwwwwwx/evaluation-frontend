# Science Evaluation Frontend

面向内部研发和测试的独立 AI 科学服务评测平台前端。

## 当前状态

- 已实现登录页、工作台界面，以及通过现有 Science Admin 前端代理的登录、会话查询和退出。
- 登录依赖可访问的 Science Admin 认证代理。真实账号登录需要在实际环境验证。
- 1110 问答、题库、运行记录和评分展示尚未接入；没有配置生产部署。
- 产品页面开发须遵循 [产品界面设计规范](docs/产品界面设计规范.md)。

## 本地运行

需要 Node.js 22.14 或更高的 22.x，以及 Yarn 1.22.22：

```bash
corepack yarn install --frozen-lockfile
corepack yarn dev
```

打开 http://localhost:6714。默认认证代理为本机 `http://127.0.0.1:6713`，可通过 `SCIENCE_ADMIN_FRONTEND_URL` 指定；生产环境必须配置 HTTPS 地址，参见 `.env.example`。认证服务需按其自身要求配置并运行。

检查命令：`corepack yarn lint`、`corepack yarn type-check` 和 `corepack yarn build`。

## 项目边界

- 登录与后续服务复用既有 Science Admin 能力；业务接口和权限需按实际契约接入。
- 项目不包含凭据、真实评测数据或生产部署配置；模型评分不等于科学真实性验证。
