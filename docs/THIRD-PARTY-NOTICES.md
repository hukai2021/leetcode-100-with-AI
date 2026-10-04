# 第三方组件与许可

本软件使用 Electron、React、Monaco Editor、SQL.js、mysql2、MySQL Community Server、Microsoft Visual C++ CRT、React Markdown、DOMPurify、Lucide、官方 OpenAI Codex，以及运行环境中的 Python、w64devkit/GCC、autopep8、pycodestyle 和 clang-format。

精确版本与上游仓库见 `DEPENDENCIES.json` 和 `../runtime/manifest.json`。JavaScript 依赖保持 npm 发布包中的许可证；运行依赖许可证保留在安装程序的 `resources/runtime` 对应组件目录及 `licenses` 中。

OpenAI Codex 0.159.3 使用 Apache-2.0；官方对应版本的许可证附于 `licenses/Codex-Apache-2.0.txt`。题面、图示及代码签名来自力扣官方公开页面，仅为此个人学习软件缓存，来源逐题保留；本软件不是力扣或 OpenAI 官方产品。

w64devkit 2.9.1 对应的完整上游源码档案作为交付附件：`runtime/downloads/w64devkit-source-v2.9.1.tar`（238,049,280 字节）。其 SHA256 为 `d9be3950813fef00404e9ba5d9b42fa9a229fb29b7b375053beca592d5da809c`。它未装入日常应用目录；从本项目继续分发这些二进制时应同时提供对应源码与许可证。

SQL 50 的 MySQL 模式随包提供官方 **MySQL Community Server 8.4.11 LTS（Windows x64）**，使用 GPLv2，并保留官方许可中对另行授权组件的附加链接许可。完整 Oracle 许可及附带第三方声明位于 `licenses/MySQL-GPL-2.0.txt`，与运行包中的 `resources/runtime/mysql/LICENSE` 字节一致；该文档 SHA256 为 `cb104b45f22bdecc7517916f792726056912586ffa5f4b1b0322d687bc3f3f1e`。Windows 运行包来自 [MySQL 官方下载页](https://dev.mysql.com/downloads/mysql/8.4.html)，原始 ZIP 的 SHA256 为 `a492371d687d2bab088b0062581144a0044b8964baefdf4faa579292b423d25c`。这里只提取运行所需文件，服务器与客户端二进制保持原样；应用通过 MySQL 协议访问自己的独立数据库实例。

与上述二进制匹配的完整官方源码 `mysql-8.4.11.tar.gz`（479,170,675 字节）保存于 `runtime/downloads`，并作为本项目 0.4.0 交付附件提供。源码 SHA256 为 `eb3051164d625dd346a8203f76e0d5d5d9aec51dbe9d51788e39ec6b3f1394c2`，对应 [MySQL 官方源包](https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.11.tar.gz)。源码附件不装入日常应用目录；继续分发 MySQL 二进制时，应保留完整许可并同时提供匹配源码获取方式。

MySQL 的应用目录内包含 **Microsoft Visual C++ x64 CRT 14.44.35211** 非调试 DLL，来自固定版本微软官方分发组件，包 SHA256 为 `4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5`。DLL 保持未修改并按 [Visual Studio 2022 可分发代码规则](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution)随应用分发，不安装或替换系统 DLL。完整适用许可位于 `licenses/Microsoft-VC-CRT.txt` 及运行目录 `LICENSE.Microsoft-VC-CRT.txt`，来自 [微软官方 Community 2022 许可文档](https://visualstudio.microsoft.com/wp-content/uploads/2021/11/Visual-Studio-2022-Community-License-EN.docx)；许可文档 SHA256 为 `93ccca3c236d04dcd09777ccb8f1e147e90cf0af002d6112be6184fbcad29e3c`。CRT 使用微软专有许可，未提供上游源码；原始分发包地址、原始许可 DOCX 的 SHA256、各 DLL 的 SHA256 均记录在 `DEPENDENCIES.json` 和运行时 manifest 中。

**mysql2 3.24.5** 使用 MIT 许可，JavaScript 协议实现来自 [同版 npm 发布包](https://registry.npmjs.org/mysql2/-/mysql2-3.24.5.tgz)及[上游源码仓库](https://github.com/sidorares/node-mysql2)。安装包保留 `node_modules/mysql2/License`；许可 SHA256 为 `f17f1be30bce27fe6324513a35fa61f6e6766d3028e42e45bdf668a0db7c8d4f`，发布包 SHA256 为 `c9bba82eff3ad73f2e48655ee3e5333504030ba42c70c1651e71bcba33855027`。已将官方 npm 包的 SHA512 与 `package-lock.json` 锁定完整性值实际核对一致。
