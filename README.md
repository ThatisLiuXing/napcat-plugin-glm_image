# napcat-plugin-tsai

NapCat 插件 —— TS-AI 绘画

## 功能

在群聊中发送 `生图 <prompt>` 或 `/draw <prompt>`，调用 TS-AI API 生成图片并发送到群内。

## 安装

1. 下载 `napcat-plugin-tsai.zip`
2. 解压到 NapCat 的 `plugins` 目录
3. 重启 NapCat

> 💡 你也可以在 NapCat WebUI 中直接安装插件。

## 命令

| 命令 | 说明 |
|------|------|
| `生图 <prompt>` | 使用 RR3 工作流生成图片 |
| `/draw <prompt>` | 同上 |

## 配置

在 NapCat WebUI 配置面板中可修改：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `apiKey` | TS-AI API Key | (空) |
| `apiUrl` | TS-AI API 入口地址 | `https://api.tavr.top/v1/index.php` |

## 许可证

MIT
