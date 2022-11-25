# [koishi-plugin-rryth](https://github.com/MirrorCY/koishi-rryth)

[![downloads](https://img.shields.io/npm/dm/koishi-plugin-rryth?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rryth) 

### 1.2.0 版本发布，支持批量生成，支持自动超采样，出图更清晰

本插件基于 [novelai-bot](https://github.com/koishijs/novelai-bot) 修改完成，使用 [stablehorde](https://stablehorde.net/) 进行 AI 图片生成。已实现功能：

- 绘制图片/批量绘制图片
- 自动超分辨率
- 更改图片尺寸
- 高级请求语法
- 翻译中文关键词
- 设置并自动过滤违禁词
- 发送一段时间后自动撤回

得益于 Koishi 的插件化机制，只需配合其他插件即可实现更多功能：

- 多平台支持 (QQ、Discord、Telegram、开黑啦等)
- 速率限制 (限制每个用户每天可以调用的次数和每次调用的间隔)
- 上下文管理 (限制在哪些群聊中哪些用户可以访问)

**所以所以快去给 [Koishi](https://github.com/koishijs/koishi) 点个 star 吧！**

## 使用教程

- 安装并启用插件，开箱即用，无需任何配置
- 在沙盒里输入 `sai` 即可看到此插件的帮助啦

有任何问题都可以提 issue 我会尽快回复~
没有 Github 账号的小伙伴可以来群里找我 https://bot.novelai.dev/more.html
