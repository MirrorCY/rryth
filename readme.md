# [koishi-plugin-rryth](https://github.com/MirrorCY/koishi-rryth)

[![downloads](https://img.shields.io/npm/dm/koishi-plugin-rryth?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-rryth) 

本插件基于 [novelai-bot](https://github.com/koishijs/novelai-bot) 修改完成，使用 [stablehorde](https://stablehorde.net/) 进行 AI 图片生成。已实现功能：

- 绘制图片
- 更改图片尺寸
- 高级请求语法
- 翻译中文关键词
- 自定义违禁词表
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

TODO:

- [ ] bug: 检查中文输入的问题
  - 包括添加的中文符号
- [x] docs: 写 readme.md
- [x] feat: 关键词改为 sai （0.0.3）
- [x] feat: 暂不支持图转图的提示（0.0.3）
- [ ] docs: 网络不好的解决方案（0.0.3）
- [x] new: 创建 GitHub 仓库（0.0.3）
- [ ] feat: nsfw 内容选择（0.0.4）
- [ ] docs: 提供 worker 的汉化教程
- [ ] bug: webp 格式在 QQPC 端无法查看（0.1.0）
- [ ] bug: 有报告出图失败导致无法清空队列，但是不影响使用
- [ ] feat: 图转图支持（0.2.0）
- [ ] feat: 图放大支持（0.2.0）
- [ ] feat：面部修复支持（0.2.0）
- [ ] feat：采样器选择（0.2.1）
- [ ] feat: worker 选择器