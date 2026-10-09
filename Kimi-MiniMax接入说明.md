# Kimi / MiniMax 通用 API 接入

在“设置 → 智能模型选择 → 大模型选择”中选择 Kimi 或 MiniMax，填写本人 API Key，点击“保存并连接”，再选择模型和推理强度。模型与强度更改后自动保存，也保留显式“保存模型设置”按钮。点击“发送测试消息”进行实际联网验证；日程助手使用同一已保存配置。

## 账户与官方接口

- Kimi：中国区通用 API，固定地址 `https://api.moonshot.cn/v1`。[获取密钥](https://platform.kimi.com/console/api-keys)。Kimi Code、聊天会员和海外平台密钥不是此模式的密钥。
- MiniMax：中国区按量 API，固定地址 `https://api.minimax.cn/v1`。[获取密钥](https://platform.minimax.cn/console/access?tab=api-keys)。M Plan 订阅密钥、海外密钥不在此次接入范围内；仅出现在目录中也不保证账户有某预览模型的推理权限，失败时不会换模型。
- 连接与“更新模型”只调用 `GET /models`；测试、助手才调用 `POST /chat/completions`，可能产生官方 API 费用。无密钥时无法验证余额、权限或真实回复。密钥不可提交到 Git 或发送到公开聊天。

## 模型参数

- Kimi `kimi-k2.5` / `kimi-k2.6`：不思考或自动思考，通过 `thinking.type` 控制；不伪造轻／中／高选项。
- Kimi `kimi-k3`：轻、高、最大，通过 `reasoning_effort` 控制；不发送 `thinking`。
- Kimi Code 模型、旧版 thinking 模型：自动思考，不发送不支持的强度。
- MiniMax `MiniMax-M3`：不思考或自动，通过 `thinking.type=disabled/adaptive` 控制。
- MiniMax `MiniMax-M3.1-Flash-Preview`：轻、中、高、极高、最大，且不提供关闭思考；是否可用取决于官方账户权益。
- MiniMax M2.x：自动思考，不承诺不存在的思考深度控制。
- 新目录模型在能力未确认时仅提供“自动”，按官方默认参数调用。

Kimi 助手使用 JSON Mode；MiniMax 使用 JSON 提示词及本地严格校验，不发送其文档未列出的 `response_format`。助手将此前对话作为本次提取的参考数据，避免构造没有保留式思考内容的历史 assistant 消息。无需在浏览器保存或展示隐藏推理。日程信息本地校验成功才创建，截断、无效格式或模型不符均不创建日程。

## 存储与运行环境

- Windows：`.local/kimi.dpapi`、`.local/minimax.dpapi`，当前用户 DPAPI 加密、原子写入。原有 ChatGPT、DeepSeek、学校账号文件不变。
- Android：应用私有 `files/vault/kimi.aes`、`minimax.aes`，Android Keystore AES-256-GCM 加密；沿用同签名升级保留数据。
- 密钥不回显、不写日志、不进入 localStorage、日程备份或 APK。测试及日程助手消息会发送给所选官方服务。
- Edge 离线预览只查看新界面，禁用密钥输入及联网调用；实际连接请启动 Windows 本机服务或使用 Android 安装版。

## 官方参数依据

- [Kimi 思考模型](https://platform.kimi.com/docs/guide/use-thinking-models)
- [Kimi 推理强度](https://platform.kimi.com/docs/guide/use-reasoning-effort)
- [Kimi JSON Mode](https://platform.kimi.com/docs/guide/use-json-mode-feature-of-kimi-api)
- [MiniMax OpenAI 兼容对话](https://platform.minimax.cn/docs/api-reference/text-chat-openai)
- [MiniMax 模型目录](https://platform.minimax.cn/docs/api-reference/models/openai/list-models)

自动测试使用临时加密文件和模拟接口，不接触用户现有密钥、不消耗真实推理额度；官方账户实测需要用户在设置中自行填写密钥。
