# VLA 真机部署 Demo —— 文档站

Docusaurus 3 静态文档站，内容来自 `/root/ros2_ws`（README、verify.sh 的 32 项断言、实测日志）
与 ONNX 导出实验记录。

## 本地跑

```bash
npm install --registry=https://registry.npmmirror.com   # 首次
npm run start        # 开发服务器，热更新，默认 http://localhost:3000
npm run build        # 产出静态文件到 build/
npm run serve        # 预览 build/ 的成品
```

## 目录

```
docs/
  intro.md         项目简介 + 硬数字
  architecture.md  四层架构 + 消息契约
  packages.md      6 个包 + 话题总览
  bridge.md        桥接层参数与看门狗
  control.md       ros2_control + mock 硬件
  smolvla.md       真模型接入 + 五条 lerobot 坑
  onnx.md          ONNX 导出实验（四路延迟）
  verification.md  9 节 32 项断言
  pitfalls.md      十条坑
  roadmap.md       下一步 + 明确未做
```

## 发到 GitHub Pages 前要改两处

`docusaurus.config.js`：

```js
url: 'https://<你的用户名>.github.io',
baseUrl: '/<仓库名>/',
```

然后：

```bash
npm run build
# 把 build/ 推到 gh-pages 分支，或在仓库 Settings → Pages 选 GitHub Actions
```

## 注意

- `node_modules/` 和 `build/` 已在 `.gitignore` 里，别提交；
- 站点是**静态**的，无后端、无跟踪脚本；
- 内容里的数字全部来自实测日志，改数字前先重跑 `/root/ros2_ws/verify.sh`。
