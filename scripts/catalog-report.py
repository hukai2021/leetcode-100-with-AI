"""Finalize catalog evidence without re-running already completed algorithms."""
from __future__ import annotations
import base64
from collections import Counter
import copy
from datetime import datetime,timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import urllib.parse

ROOT=Path(__file__).resolve().parents[1]
def read(name): return json.loads((ROOT/name).read_text(encoding='utf-8'))
def write(name,value): (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(value): return hashlib.sha256(value).hexdigest()
class ImageSources(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='img': self.urls.append(dict(attrs).get('src',''))

def main():
    if (ROOT/'data/chinese-translations.json').exists():
        import runpy
        runpy.run_path(str(ROOT/'scripts/catalog-localize.py'))['verify']()
        return
    problems=read('data/problems.json'); cases=read('data/cases.json')
    validation=read('docs/catalog-validation.json'); assets=read('data/official-assets.json')
    assert len(problems)==len({p['id'] for p in problems})==100
    assert len(cases['1'])==3
    assert validation['passedProblems']==validation['totalProblems']==100
    assert validation['passedCases']==validation['totalCases']==247
    cases_unchanged=sha((ROOT/'data/cases.json').read_bytes())==validation['codeHashes']['data/cases.json']
    assert cases_unchanged,'Sample data changed since real execution; investigate before reporting.'
    original=copy.deepcopy(problems)
    for p in original:
        offline=p['source'].pop('offlineImages',None)
        if not offline: continue
        for image in offline['cached']:
            cached=assets[image['url']]; binary=(ROOT/cached['path']).read_bytes()
            assert sha(binary)==image['sha256']==cached['sha256']
            uri='data:'+cached['mimeType']+';base64,'+base64.b64encode(binary).decode()
            p['content']=p['content'].replace('src="'+uri+'"','src="'+image['url']+'"').replace("src='"+uri+"'","src='"+image['url']+"'")
    # Path.write_text uses Windows CRLF translation here; preserve the exact
    # newline encoding of the delivered JSON when reconstructing byte hashes.
    original_text=json.dumps(original,ensure_ascii=False,indent=2)+'\n'
    if b'\r\n' in (ROOT/'data/problems.json').read_bytes(): original_text=original_text.replace('\n','\r\n')
    reconstructed=sha(original_text.encode())
    content_only_transform=reconstructed==validation['codeHashes']['data/problems.json']
    assert content_only_transform,'Changes extend beyond embedded images; investigate before reporting.'
    remote=[]; embedded=[]
    for p in problems:
        parser=ImageSources(); parser.feed(p['content'])
        for src in parser.urls:
            if src.startswith('data:image/'):
                header,encoded=src.split(',',1); binary=base64.b64decode(encoded,validate=True)
                assert binary.startswith((b'\x89PNG\r\n\x1a\n',b'\xff\xd8\xff',b'GIF87a',b'GIF89a',b'RIFF'))
                embedded.append({'id':p['id'],'sha256':sha(binary),'bytes':len(binary)})
            else: remote.append({'id':p['id'],'src':src})
    assert not remote,'Some image URLs are not cached.'
    stamp=datetime.now(timezone.utc).isoformat()
    audit={'verifiedAt':stamp,'algorithmTestsRerun':False,'casesUnchangedSinceExecution':cases_unchanged,
        'onlyImageEmbeddingAndImageSourceMetadataChanged':content_only_transform,
        'originalProblemsSha256':validation['codeHashes']['data/problems.json'],
        'reconstructedOriginalProblemsSha256':reconstructed,
        'deliveredProblemsSha256':sha((ROOT/'data/problems.json').read_bytes()),
        'casesSha256':validation['codeHashes']['data/cases.json'],
        'embeddedImageElements':len(embedded),'cachedUniqueImageUrls':len(assets),'uncachedImageElements':remote,
        'imageFileSignaturesAndBase64Verified':True}
    write('docs/catalog-asset-integrity.json',audit)
    report=read('data/catalog-report.json')
    report.update({'finalizedAt':stamp,'categoryCount':len({p['category'] for p in problems}),
        'difficultyCounts':dict(Counter(p['difficulty'] for p in problems)),
        'contentLanguages':dict(Counter(p['source']['contentLanguage'] for p in problems)),
        'localPythonVerification':{'problemsPassed':100,'problemsTotal':100,'casesPassed':247,'casesTotal':247,'executedAt':validation['completedAt'],'report':'docs/catalog-validation.json','referenceSource':'scripts/catalog-reference-solutions.py'},
        'offlineImages':{'cachedUniqueUrls':len(assets),'embeddedElements':len(embedded),'missing':remote,'report':'docs/catalog-assets.json','integrityReport':'docs/catalog-asset-integrity.json'},
        'scope':'100题公开题面、Python3/C++模板及247个官方公开样例已缓存；100题本地编写的Python参考解经应用真实运行器执行，247/247样例通过。示意图已全部离线嵌入并核验完整性。无力扣隐藏测试或官方判题结果；样例通过不构成算法正确性证明。'})
    write('data/catalog-report.json',report)
    cpp=read('docs/runner-cpp-catalog-results.json')
    cpp_summary=cpp['summary']
    content=f'''# 题库来源与实际核验记录

最终数据：**100 题、17 个官方中文分类、247 个官方公开示例**。20 道简单、68 道中等、12 道困难。全部具备完整题面、约束、示例、官方 Python 3 / C++ 初始代码及官方运行参数元数据。

正文语言为 **2 题中文、98 题英文**。中文题为 1「两数之和」与 49「字母异位词分组」。全部标题与分类为中文；部分算法标签保留官方英文。没有将英文自动翻译内容冒充官方中文题面。

## 来源和核实日期

- 目标题单：[力扣官方 LeetCode 热题 100](https://leetcode.cn/studyplan/top-100-liked/)。2026-09-06 通过未登录的官方网页实际读取 100 个标题、难度和中文分类。
- 题目 ID、slug、代码模板、metaData、英文题面和公开示例：2026-09-06 通过 [LeetCode 官方国际站](https://leetcode.com/studyplan/top-100-liked/)的匿名公开 GraphQL 查询获得。对中文题单和国际站题单进行 ID 集合校验，结果均为同一组 100 题；分类和顺序采用中文站显示内容。
- 两数之和中文正文于 2026-09-06、字母异位词分组中文正文于 2026-09-07 从官方网页可见 DOM 读取。记录在 `data/official-cn-content.json`。
- 原始公开查询结果保存在 `data/official-cache/study-plan.json` 和各题 ID JSON。没有访问付费题解、隐藏测试、私有账号状态或浏览器 Cookie。
- 直接访问中文站 HTML / GraphQL 曾返回 Cloudflare HTTP 403；未绕过挑战。后续使用已成功的国际官方公开来源提供完整英文题面。扩大中文正文读取曾因页面导航超时及本次工具额度耗尽中断；当前最终中文数量为 2，未声明其余中文内容已完成。

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

C++ 的独立报告 `docs/runner-cpp-catalog-results.json` 记录了 **{cpp_summary['passed']} / {cpp_summary['total']} 题官方模板签名的真实编译与适配调用检查**；该项采用有意抛出异常的函数体，证明模板及调用参数能进入真实编译执行路径，**不等于 100 题 C++ 正确算法均已验证**。代表性的 C++ / Python 正确算法、错误算法、链表/树、特殊比较、超时和停止等另见 `docs/runner-test-results.json`。

以上均为本地验证。没有获得或显示力扣官方 AC、隐藏测试通过或官方执行排名。

## 离线题面图片

官方题面引用的 **69 / 69 个不同图片 URL 均已缓存**，共 1,486,909 字节，覆盖 42 题；最终题面共嵌入 {len(embedded)} 个 `data:image/...;base64` 图片元素，剩余远程图片链接为 0。图片包括 67 张来自 `assets.leetcode.com` 的资源、1 张来自力扣旧 S3 图床的资源，以及题 118 原题直接引用的 [维基媒体杨辉三角动图](https://upload.wikimedia.org/wikipedia/commons/0/0d/PascalTriangleAnimated2.gif)。保持原始图片，不对图片内容作改写。

图片原始文件在 `data/assets/`；每张来源 URL、下载日期、MIME、大小和 SHA-256 在 `data/official-assets.json`。发布时题面本身含有完整图片数据，无需依赖源文件路径或联网加载。`docs/catalog-assets.json` 汇总下载结果。

图片嵌入发生在算法测试之后，没有重跑相同的算法测试。`docs/catalog-asset-integrity.json` 验证：图片 Base64 和文件签名有效；恢复远程图片 URL 并移除新增图片来源字段后，题库文件 SHA-256 与算法测试时完全一致；用例文件 SHA-256 也完全一致。因此只变更了题面图片缓存，不影响当时已验证的题目签名、模板、输入或预期结果。

## 复现与刷新

```powershell
# 仅使用已保存的公开原始缓存重建题库和示例；自动重新嵌入已缓存图片
python scripts/catalog-fetch.py --cached

# 显式访问官方公开来源刷新（普通网络访问失败会记录错误）
python scripts/catalog-fetch.py
python scripts/catalog-assets.py

# 导出验证代码，再通过应用实际运行器执行全部官方公开示例
python scripts/catalog-reference-solutions.py
node scripts/catalog-verify.cjs
```

`data/catalog-report.json` 为最终机器可读统计。刷新后的数据若有变动，应重新验证；不能沿用本次结果宣称新数据也已通过。
'''
    (ROOT/'docs'/'CATALOG.md').write_text(content,encoding='utf-8')
    print(json.dumps({'catalog':len(problems),'cases':sum(map(len,cases.values())),'languages':report['contentLanguages'],'images':audit['cachedUniqueImageUrls'],'embeddedElements':len(embedded),'imagesMissing':len(remote),'contentOnlyTransform':content_only_transform,'casesUnchanged':cases_unchanged},ensure_ascii=False))

if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8'); main()
