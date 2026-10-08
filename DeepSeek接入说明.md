# 智能模型选择与 DeepSeek

设置中的“ChatGPT 连接、模型与测试”已改为“智能模型选择”。新增“大模型选择”：GPT / ChatGPT、DeepSeek、MiniMax、Kimi。GPT 保留原授权和模型/强度选择；DeepSeek 已接入，MiniMax 与 Kimi 明确标注尚未接入，不会自动回退到 GPT。

## 开始使用

1. 在 [DeepSeek 官方平台](https://platform.deepseek.com/api_keys) 创建自己的 API Key，并确认账户可以使用 API。不要把密钥发到聊天、截图或 GitHub。
2. 电脑端重启 `start-ketime.cmd`，通过本机服务页面使用；手机端覆盖安装最新 Release APK。
3. 打开“设置 → 智能模型选择”，将“大模型选择”切换为 DeepSeek。
4. 填写 API Key，点击“保存并连接”。程序先访问官方模型目录验证，再加密保存；失败时保留原密钥。密钥不会回显。
5. 选择模型和推理强度。更改会自动保存；保存失败时可点击“保存模型设置”重试。
6. 点击“发送测试消息”，只有完整回复才显示“测试成功”。日程助手使用相同提供方、模型和强度。

“更新模型”从账户重新获取目录，不发送推理请求。初次 DeepSeek 连接优先 Flash / Chat，默认关闭推理（如模型支持）；旧 Reasoner 仅显示其实际支持的自动强度。模型或强度失效时停止发送，请重新选择，不会自动改模型。

## 本地与隐私

- Windows 密钥与模型设置单独存于 `.local/deepseek.dpapi`，采用当前 Windows 用户级 DPAPI；Android 使用 Keystore AES-GCM，存于应用私有目录。密钥不进入浏览器 localStorage、JSON 日程备份、APK 或源码。
- 浏览器只保存提供方名称，Edge 预览使用独立偏好键。输入框提交、关闭设置或切换提供方后清空；状态与错误不回显密钥或远端原始响应。
- 固定请求 DeepSeek 官方 HTTPS 地址，禁止携带密钥跟随跳转，不支持自定义代理地址。沿用本机 Host、Origin、请求验证令牌及静态资源白名单。
- 消息测试只发送测试文字；日程助手发送本次对话、本地参考日期时区和项目/节点名称，不发送已有日程全文、学校凭据或 API Key 到提示词。
- 回复结束原因不是 `stop`、内容为空、仅有思考内容、JSON/日程字段不合规时，不当作成功，不创建日程。
- “清除本机连接”只清除本机 DeepSeek 凭据，不撤销官方平台密钥，也不影响 GPT 授权或日程。需要撤销时到官方平台删除对应密钥。
- Edge 单文件版仅用于离线排版与本地功能预览：可以查看提供方选项，但密钥输入和连接禁用。真实调用使用安装版或本机服务。

## 验证与限制

已通过模拟接口与隔离浏览器检查：连接失败不覆盖原密钥、加密存储、不回显、不进入浏览器存储、模型更新/自动保存/失效拦截、测试回复与错误、DeepSeek 日程助手多项创建排序、GPT 原功能、手机布局和离线预览。

没有使用用户的真实 DeepSeek API Key，尚未验证真实账户返回；不能将模拟测试视为已成功调用用户账户。API 使用由 DeepSeek 单独计费，ChatGPT 订阅不提供 DeepSeek 额度。余额不足、网络或账户权限问题由页面明确提示。

接口依据：[首次调用](https://api-docs.deepseek.com/zh-cn/)、[模型目录](https://api-docs.deepseek.com/api/list-models/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。可用模型和支持强度以运行时目录为准，不写死未来模型名称。
