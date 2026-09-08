# 本地运行器与实际验证

截至 2026-09-07，Windows 上真实运行的结果如下。

| 验证 | 结果 | 记录 |
| --- | --- | --- |
| 关键正确/错误答案、链表、树、随机指针深拷贝、原地修改、设计类、特殊比较、超时/停止/输出/内存/进程树回收/越界 | 32 / 32 组通过 | `runner-test-results.json` |
| Hot 100 Python 本地编写参考解执行官方题面样例 | 100 / 100 题，247 / 247 例通过 | `catalog-validation.json` |
| Hot 100 官方 C++17 模板编译及调用签名适配 | 100 / 100 题通过 | `runner-cpp-catalog-results.json` |
| Python/C++ 格式化，保留中文注释，格式化后真实运行 | 2 / 2 通过 | `runner-format-results.json` |

C++ 全题审计把空方法替换为主动抛出固定异常，验证编译器、官方签名、参数构造和方法调用确实能工作。它不是 100 道 C++ 算法正确性验证。C++ 算法行为已有代表性的真实实现测试。所有结果属于本地测试，未进行力扣官方提交，未获得隐藏测试或官方 AC。

## 随软件提供的依赖

- Python 3.13.15 官方 Windows x64 嵌入包，`runtime/python`。
- w64devkit 2.9.1（GCC 16.2.0），`runtime/w64devkit`，编译参数 `-std=c++17 -O1 -D_GLIBCXX_ASSERTIONS`。
- Windows Job Object 启动器，源码 `scripts/runner-job.cs`，成品 `runtime/runner-job.exe`。
- autopep8 2.3.2、pycodestyle 2.14.0、clang-format 23.1.0，`runtime/formatters`。格式化只读取代码文本，不执行代码。
- 下载地址、SHA256、上游源码地址在 `runtime/manifest.json`。同版本 w64devkit 的完整上游依赖源码压缩包在 `runtime/downloads/w64devkit-source-v2.9.1.tar`；该文件单独交付，不装入日常安装包。

## 实际隔离范围

运行时主进程先创建独立临时目录，通过最小白名单传递环境变量，不传递 `OPENAI_API_KEY`、`CODEX_HOME` 等凭据变量。用户代码不在 Electron 主进程执行。

Windows Job Object 在目标程序的主线程恢复执行之前绑定进程，设置每次执行默认 3 秒（自定义 100 毫秒至 30 秒）、256 MiB 进程和作业内存上限、最多 8 个活动进程及关闭作业时杀死全部子孙进程。C++ 编译单独允许 45 秒和 1536 MiB。标准输出和标准错误合计限制 256 KiB。停止、超时、内存耗尽、编译错误、非零退出码会显示真实错误。测试验证了任务结束后派生子进程被回收。

**这不是安全沙箱。** 运行的代码仍有当前 Windows 用户的文件和网络权限；清理环境变量不能阻止恶意代码主动读取用户有权限访问的文件。请只运行自己编写或信任的代码。`_GLIBCXX_ASSERTIONS` 能捕捉测试覆盖的 `vector` 越界，不是通用内存安全检查器；没有宣称启用 AppContainer、网络封禁或全套 AddressSanitizer。

## 数据适配与比较

根据缓存的官方 `meta` 生成方法调用，支持数值、布尔、字符串、字符、数组/嵌套数组、链表、链表数组、层序二叉树，以及 LRUCache、Trie、MinStack、MedianFinder 的操作序列。

专门处理环入口索引、相交链表共享节点、LCA 原树节点、随机指针及深拷贝身份检查。原地修改返回被修改参数。两数之和按索引有效性验证；回文子串允许同长度的其他有效回文；有序数组转 BST 验证中序值与平衡性；无序答案按题目规则规范化且保留必要的内部顺序与重复计数。用户自定义用例必须提供 `expected`；自定义预期答案的正确性由提供者负责，系统不会将其标记为官方隐藏测试。

## 复现命令

```powershell
# 初次准备缺失的解释器/编译器并构建 Job Object 启动器
powershell -ExecutionPolicy Bypass -File scripts/runner-setup.ps1

# 格式化依赖（仅开发/重新构建时需要有 pip 的 Python；安装后的软件已附带）
python -m pip install --index-url https://pypi.org/simple --target runtime/formatters autopep8==2.3.2 pycodestyle==2.14.0 clang-format==23.1.0

node tests/runner-smoke.cjs
node tests/runner-format.cjs
node tests/runner-catalog-cpp.cjs
node scripts/catalog-verify.cjs
```

Codex 受限 shell 的 Node 路径检查可使用 `--preserve-symlinks --preserve-symlinks-main`。clang-format 在受限 shell 下出现父目录路径权限错误；已获执行批准后在正常 Windows 环境验证格式化与编译运行成功。该限制不是软件安装后运行的环境。
