# SQL 50 题库说明

SQL 50 是独立题单，通过左侧按钮与「热题 100」切换。两个题单分别统计进度，每题草稿、笔记、收藏、提交及聊天使用不同题目 ID。SQL 编号内部使用 sql- 前缀，界面仍显示力扣原题号。原 Hot 100 的题面、测试数据、Python/C++ 模板与算法运行器保持原样。

题单依据 [力扣官方 SQL 50](https://leetcode.com/studyplan/top-sql-50/) 于 2026-09-12 获取的 50 题和 7 个分组。全部中文正文为项目基于官方英文原文编写的译文，界面明确标注「中文译文」。原文和官方示例缓存于 data/sql-official-cache。重建题库先执行 scripts/sql-build-catalog.py，再执行 scripts/mysql-build-catalog.py 添加 MySQL 表结构、题面和参考 SQL。

## 练习方式

选择 SQL 50 → 阅读中文题意与 MySQL 表结构 → 编写单条 SQL → 点击「运行 SQL」查看预期/实际表格 → 提交给 GPT 批改 → 在右侧继续追问 → 自行标记完成。回到 Hot 100 会恢复此前题目和编程语言。

SQL 50 默认使用软件附带的真实 MySQL 8.4.11。编辑器上方可切换「MySQL 8.4」和「SQLite 3」。SQLite 3.50.4 保留，便于继续运行以前的 SQLite 草稿。切换方言会保留代码，不会自动转换日期函数、正则或 DELETE 语法；题面中的表类型及方言提示随选择更新。批改与聊天会携带本次使用的数据库方言，历史提交按原方言显示。

两种引擎都自动创建题目表并导入固定用例，无需手动安装数据库、建表或插入数据，也不使用学习记录数据库。MySQL 首次运行会初始化私有实例，启动过程可能比后续运行久；只监听本机随机端口，不安装 Windows 数据库服务，不连接电脑上已有的 MySQL 实例。每个用例新建题目数据库与受限账号，只允许读取题目表；第 196 题另允许删除 Person 并比较剩余记录。SQLite 每例新建内存库。删除不会改变后续用例或用户存档。

输出按列名（忽略大小写）、单元格类型与值、重复次数比较。NULL 与字符串不同，数字采用相对误差 1e-6。题目要求顺序时检查顺序；620 题允许相同评分行交换先后。结果表保留空结果列名，界面标识 NULL 与空字符串。每条查询默认 3 秒，最多返回 1000 行 / 128 KiB；界面预览前 200 行并标明总数，运行期间可点击停止。MySQL 私有实例由 Windows Job Object 限制 768 MiB 并随应用退出回收；SQLite 每个用例进程限制 256 MiB。初始化和装入测试数据不计入单条查询的 3 秒限时。

## MySQL 练习语法

本软件执行实际 MySQL 查询，支持 MySQL 8 的 CTE 和窗口函数。

- 日期列使用 DATE / DATETIME，可以直接使用 DATEDIFF、DATE_ADD、DATE_FORMAT。
- 字符串可以使用 CONCAT、SUBSTRING、CHAR_LENGTH。CHAR_LENGTH 统计字符数，LENGTH 统计字节数。
- 按日期合并商品可使用 GROUP_CONCAT(DISTINCT product ORDER BY product SEPARATOR ',')。
- REGEXP 与 REGEXP_LIKE 可执行正则。1517 题要求域名严格为小写，参考实现使用 REGEXP_LIKE(mail, 正则, 'c') 明确区分大小写。
- 196 题可使用 DELETE p1 FROM Person p1 JOIN Person p2 ... 自连接删除。
- / 执行除法，DIV 执行整数除法。聚合查询须满足 MySQL 的分组规则，派生表需要命名。
- 每次练习执行一条 SELECT / WITH；删除题执行一条 DELETE。不支持练习代码创建、修改表结构或写入文件。SQL 暂不提供自动格式化，原 Python/C++ 格式化功能保留。

对应语法可查阅 [MySQL 日期函数](https://dev.mysql.com/doc/refman/8.4/en/date-and-time-functions.html)、[正则函数](https://dev.mysql.com/doc/refman/8.4/en/regexp.html)、[GROUP_CONCAT](https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html#function_group-concat)、[DELETE](https://dev.mysql.com/doc/refman/8.4/en/delete.html)。

## SQLite 兼容方式

选择 SQLite 后，日期按 ISO 格式 TEXT 保存，可使用 date、julianday、strftime；比例计算应乘以 1.0 或 100.0 防止整数除法截断。字符串可用 substr、upper、lower、||、group_concat。SQLite 不内建 REGEXP，可按原题提示使用 GLOB；DELETE 使用 DELETE FROM Person ... 形式。MySQL 的 DATE_FORMAT、DATEDIFF 和多表 DELETE 不能在此模式直接运行。

对应语法参考 [SQLite SELECT](https://www.sqlite.org/lang_select.html)、[日期函数](https://www.sqlite.org/lang_datefunc.html)、[核心函数](https://www.sqlite.org/lang_corefunc.html)。

## 实际数据校验

MySQL 在 2026-10-04 已由真实 MysqlRunner 完成目录验证：**50/50 题、103/103 个用例通过，7/7 种代表错解被拒绝**。测试沿用 53 个公开示例及 50 个独立边界用例，没有改变原预期。另验证第 196 题先执行错误全删，再执行正确自连接 DELETE，后续用例恢复原数据并正常通过。参考 SQL 位于 scripts/mysql-reference-solutions.json，公开结果见 [MySQL 50 校验记录](mysql50-validation.json)。

SQLite 在 2026-10-04 已重新执行真实目录回归：50/50 题、103/103 个用例通过，5/5 种代表错解被拒绝。旧参考实现位于 scripts/sql-reference-solutions.json，答案与 data/sql-cases.json 中的预期未被改写。原 [v0.2.0 校验记录](sql50-validation.json) 作为历史证据保留。

开发验证可分别执行 node --test tests/mysql-catalog.test.cjs 和 node --test tests/sql-catalog.test.cjs tests/sql-runner.test.cjs tests/sql-service.test.cjs tests/store.test.cjs。测试报告中的“通过”指本地公开示例和项目边界用例；力扣官方隐藏测试、自动提交和官方 AC 同步不包含在本软件中。

公开说明中的修正与差异：

- 1731 题第二个官方结果表含使用竖线的横向分隔行。生成器过滤该分隔行，避免将其当成数据。
- 1484 题官方输入商品为 T-Shirt，输出写为 T-shirt。项目保留输入，修正预期输出为 T-Shirt，并在该题提示及用例来源中标注。原始缓存不修改。
- 180 题正文示意将 num 标为 varchar，官方数据库元数据使用 INT。MySQL 采用该元数据的 INT，SQLite 保留原 INTEGER。
- 620 题官方元数据把 rating 写为 FLOAT(2, 1)，但示例包含两位小数。题面保留原始声明，MySQL 本地建表归一化为 FLOAT，避免导入时将 9.25 等评分舍入为一位小数。
- MySQL 保留可用的原始 DATE、DATETIME、INT、BIGINT、VARCHAR(n) 和完整 ENUM 类型，枚举成员保持原大小写；缺少长度的 VARCHAR 和缺少枚举值的 ENUM 会归一化为 VARCHAR(4096)，当前 SQL50 官方 schema 均提供完整长度与成员。具体类型适配以运行器和测试记录为准。SQLite 保留其 INTEGER、REAL、TEXT 声明。
- 题面中的唯一键、外键和枚举语义保留；测试表不会额外创建唯一键、外键约束和索引。参考查询耗时不代表生产数据库性能。两个引擎的默认排序规则不同，MySQL 正则的大小写行为应显式指定。

这些验证覆盖公开示例和项目边界测试，不能证明隐藏测试全部通过。

## 题目列表

| 题号 | 中文标题 | 分组 |
| --- | --- | --- |
| 1757 | 可回收且低脂的产品 | 查询基础 |
| 584 | 寻找用户推荐人 | 查询基础 |
| 595 | 大的国家 | 查询基础 |
| 1148 | 文章浏览 I | 查询基础 |
| 1683 | 无效的推文 | 查询基础 |
| 1378 | 使用唯一标识码替换员工 ID | 基础连接 |
| 1068 | 产品销售分析 I | 基础连接 |
| 1581 | 进店却未进行过交易的顾客 | 基础连接 |
| 197 | 上升的温度 | 基础连接 |
| 1661 | 每台机器的进程平均运行时间 | 基础连接 |
| 577 | 员工奖金 | 基础连接 |
| 1280 | 学生们参加各科测试的次数 | 基础连接 |
| 570 | 至少有 5 名直接下属的经理 | 基础连接 |
| 1934 | 确认率 | 基础连接 |
| 620 | 有趣的电影 | 聚合函数 |
| 1251 | 平均售价 | 聚合函数 |
| 1075 | 项目员工 I | 聚合函数 |
| 1633 | 各赛事的用户注册率 | 聚合函数 |
| 1211 | 查询结果的质量和占比 | 聚合函数 |
| 1193 | 每月交易 I | 聚合函数 |
| 1174 | 即时食物配送 II | 聚合函数 |
| 550 | 游戏玩法分析 IV | 聚合函数 |
| 2356 | 每位教师所教授的科目种类的数量 | 排序与分组 |
| 1141 | 查询近30天活跃用户数 | 排序与分组 |
| 1070 | 产品销售分析 III | 排序与分组 |
| 596 | 至少有5名学生的课 | 排序与分组 |
| 1729 | 求关注者的数量 | 排序与分组 |
| 619 | 只出现一次的最大数字 | 排序与分组 |
| 1045 | 买下所有产品的客户 | 排序与分组 |
| 1731 | 每位经理的下属员工数量 | 高级查询与连接 |
| 1789 | 员工的直属部门 | 高级查询与连接 |
| 610 | 判断三角形 | 高级查询与连接 |
| 180 | 连续出现的数字 | 高级查询与连接 |
| 1164 | 指定日期的产品价格 | 高级查询与连接 |
| 1204 | 最后一个能进入巴士的人 | 高级查询与连接 |
| 1907 | 按分类统计薪水 | 高级查询与连接 |
| 1978 | 上级经理已离职的公司员工 | 子查询 |
| 626 | 换座位 | 子查询 |
| 1341 | 电影评分 | 子查询 |
| 1321 | 餐馆营业额变化增长 | 子查询 |
| 602 | 好友申请 II：谁有最多的好友 | 子查询 |
| 585 | 2016年的投资 | 子查询 |
| 185 | 部门工资前三高的所有员工 | 子查询 |
| 1667 | 修复表中的名字 | 字符串与正则 |
| 1527 | 患某种疾病的患者 | 字符串与正则 |
| 196 | 删除重复的电子邮箱 | 字符串与正则 |
| 176 | 第二高的薪水 | 字符串与正则 |
| 1484 | 按日期分组销售产品 | 字符串与正则 |
| 1327 | 列出指定时间段内所有的下单产品 | 字符串与正则 |
| 1517 | 查找拥有有效邮箱的用户 | 字符串与正则 |
