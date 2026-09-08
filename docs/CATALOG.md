# 题库来源与实际核验记录

最终数据：**100 题、17 个官方中文分类、247 个官方公开示例**。20 道简单、68 道中等、12 道困难。全部具备完整题面、约束、示例、官方 Python 3 / C++ 初始代码及官方运行参数元数据。

0.1.1 正文语言为 **100 题中文**：1「两数之和」与 49「字母异位词分组」采用官方中文，其他 98 题使用基于已缓存官方英文原文的本地中文译文。题意、示例解释、约束和进阶均已逐题翻译并由另一代理交叉核对；界面区分「中文题面」与「中文译文」。变量、字符串字面量和数学公式保留原样。

## 来源和核实日期

- 目标题单：[力扣官方 LeetCode 热题 100](https://leetcode.cn/studyplan/top-100-liked/)。2026-09-06 通过未登录的官方网页实际读取 100 个标题、难度和中文分类。
- 题目 ID、slug、代码模板、metaData、英文题面和公开示例：2026-09-06 通过 [LeetCode 官方国际站](https://leetcode.com/studyplan/top-100-liked/)的匿名公开 GraphQL 查询获得。对中文题单和国际站题单进行 ID 集合校验，结果均为同一组 100 题；分类和顺序采用中文站显示内容。
- 两数之和中文正文于 2026-09-06、字母异位词分组中文正文于 2026-09-07 从官方网页可见 DOM 读取。记录在 `data/official-cn-content.json`。
- 原始公开查询结果保存在 `data/official-cache/study-plan.json` 和各题 ID JSON。没有访问付费题解、隐藏测试、私有账号状态或浏览器 Cookie。
- 中文站批量接口于 2026-09-07 仍返回 HTTP 403，未绕过挑战。本次98题译文基于用户项目中已有的英文缓存完成，不宣称为官方中文译文。译文保存在 `data/chinese-translations.json`，保留原始内容SHA256与翻译时间。

每题 `source` 保留官方题目链接、题单核实时间、内容语言、获取方法和图片来源。原题链接仍指向 `leetcode.cn`，英文原文的来源指向对应 `leetcode.com` 题目页。

## 官方示例与适配

`data/cases.json` 保存函数参数数组、预期结果及来源。预期值从官方公开示例提取；没有生成隐藏用例或把模型预测当作官方答案。

- 普通例子解析官方 JSON 值。已修复中文正文“每种输入”被误识别为示例起点的问题；两数之和的 3 个官方示例均已保留。
- 142 环形链表 II：官方“连接到节点索引”的文字输出转换为索引；无环为 `-1`。
- 160 相交链表：官方文字交点转换为节点值，无交点为 `null`；运行器另验证返回节点身份，不能用新建同值节点蒙混。
- 146 LRU 缓存、208 Trie、155 最小栈、295 数据流中位数：保留官方操作序列、参数序列和输出序列。
- 数组、字符串、链表、树、原地修改、深复制和多解比较的实际执行证据见运行器测试报告。

## 已经实际执行的验证

2026-09-07 15:04（北京时间），通过软件同一 `Runner` 使用真实 Python 子进程执行了本地编写的 100 题参考算法，**100 / 100 题、247 / 247 个官方公开示例通过**。逐例输入、预期、实际输出、错误信息、耗时和当时源码 SHA-256 见 `docs/catalog-validation.json`。

参考实现源文件为 `scripts/catalog-reference-solutions.py`，提取后的代码快照为 `docs/catalog-reference-sources.json`。这些是开发时编写并实际运行的验证代码，不是力扣官方题解，也不会替代学生的初始模板。公开样例通过不能证明所有输入正确或算法满足所有规模限制。

C++ 的独立报告 `docs/runner-cpp-catalog-results.json` 记录了 **100 / 100 题官方模板签名的真实编译与适配调用检查**；该项采用有意抛出异常的函数体，证明模板及调用参数能进入真实编译执行路径，**不等于 100 题 C++ 正确算法均已验证**。代表性的 C++ / Python 正确算法、错误算法、链表/树、特殊比较、超时和停止等另见 `docs/runner-test-results.json`。

以上均为本地验证。没有获得或显示力扣官方 AC、隐藏测试通过或官方执行排名。

## 离线题面图片

官方题面引用的 **69 / 69 个不同图片 URL 均已缓存**，共 1,486,909 字节，覆盖 42 题；最终题面共嵌入 73 个 `data:image/...;base64` 图片元素，剩余远程图片链接为 0。图片包括 67 张来自 `assets.leetcode.com` 的资源、1 张来自力扣旧 S3 图床的资源，以及题 118 原题直接引用的 [维基媒体杨辉三角动图](https://upload.wikimedia.org/wikipedia/commons/0/0d/PascalTriangleAnimated2.gif)。保持原始图片，不对图片内容作改写。

图片原始文件在 `data/assets/`；每张来源 URL、下载日期、MIME、大小和 SHA-256 在 `data/official-assets.json`。发布时题面本身含有完整图片数据，无需依赖源文件路径或联网加载。`docs/catalog-assets.json` 汇总下载结果。

0.1.0 的历史图片完整性证据保存在 `docs/catalog-asset-integrity.json`。0.1.1 的正文翻译完整性证据为 `docs/chinese-localization.json`：100题非正文字段与原版本一致，247个用例文件字节不变；98题原文哈希、示例数据、图源及公式核对通过，73处离线图片保持完整。中文序数的英文上标后缀移除，少量 code 标签中的自然语言已译中文，并逐项登记。没有把历史算法测试伪装成本次重新执行；本次另在开发版与安装版逐题打开100题并执行代表性的Python/C++题目。

## 复现与刷新

```powershell
# 仅使用已保存的公开缓存重建题库和示例；保留中文译文并重新嵌入图片
python scripts/catalog-fetch.py --cached

# 显式访问官方公开来源刷新（普通网络访问失败会记录错误）
python scripts/catalog-fetch.py
python scripts/catalog-assets.py

# 导出验证代码，再通过应用实际运行器执行全部官方公开示例
python scripts/catalog-reference-solutions.py
node scripts/catalog-verify.cjs
```

`python scripts/catalog-localize.py` 核验译文、图片和数据完整性；`node tests/chinese-desktop.cjs` 逐题验证界面。刷新流程已通过不落盘的重建检查：100题中文与247用例保持一致。

`data/catalog-report.json` 为最终机器可读统计。刷新后的数据若有变动，应重新验证；不能沿用本次结果宣称新数据也已通过。
