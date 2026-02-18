# napcat-plugin-glm_image

NapCat 插件 —— glm_image 绘画

## 注意事项

文件 *package.json* *index.mjs* 为Claude输出，上传仓库和修改其余文件为本人手动执行。
修改目的：解决本人喜欢用GLM，但没有相关插件的问题

## 功能

在群聊中发送 `生图 <prompt>` 或 `/draw <prompt>`，调用 glm_image API 生成图片并发送到群内。

## 安装

1. 下载 `napcat-plugin-glm_image.zip`
2. 解压到 NapCat 的 `plugins` 目录
3. 重启 NapCat

> 💡 你也可以在 NapCat WebUI 中直接安装插件。

## 命令

| 命令 | 说明 |
|------|------|
| `生图 <prompt>` | 使用 RR3 工作流生成图片 |
| `/draw <prompt>` | 同上 |

## 配置

在 NapCat WebUI 配置面板中可修改

## 许可证

MIT
