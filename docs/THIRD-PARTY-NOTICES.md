# 第三方组件与许可

本软件使用 Electron、React、Monaco Editor、SQL.js、React Markdown、DOMPurify、Lucide、官方 OpenAI Codex，以及运行环境中的 Python、w64devkit/GCC、autopep8、pycodestyle 和 clang-format。

精确版本与上游仓库见 `DEPENDENCIES.json` 和 `../runtime/manifest.json`。JavaScript 依赖保持 npm 发布包中的许可证；运行依赖许可证保留在安装程序的 `resources/runtime` 对应组件目录及 `licenses` 中。

OpenAI Codex 0.153.4 使用 Apache-2.0；官方对应版本的许可证附于 `licenses/Codex-Apache-2.0.txt`。题面、图示及代码签名来自力扣官方公开页面，仅为此个人学习软件缓存，来源逐题保留；本软件不是力扣或 OpenAI 官方产品。

w64devkit 2.9.1 对应的完整上游源码档案作为交付附件：`runtime/downloads/w64devkit-source-v2.9.1.tar`（238,049,280 字节）。其 SHA256 为 `d9be3950813fef00404e9ba5d9b42fa9a229fb29b7b375053beca592d5da809c`。它未装入日常应用目录；从本项目继续分发这些二进制时应同时提供对应源码与许可证。
