"""Refresh public LeetCode metadata without account, cookies, or private test data."""
from __future__ import annotations
import argparse
import concurrent.futures
from datetime import datetime, timezone
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import runpy
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
ENDPOINT = 'https://leetcode.com/graphql'
PLAN_URL = 'https://leetcode.cn/studyplan/top-100-liked/'

# Transcribed from the visible, unauthenticated official Chinese study-plan UI
# on 2026-09-06; IDs are cross-checked against the official international plan.
GROUPS = [
('哈希', [(1,'两数之和'),(49,'字母异位词分组'),(128,'最长连续序列')]),
('双指针', [(283,'移动零'),(11,'盛最多水的容器'),(15,'三数之和'),(42,'接雨水')]),
('滑动窗口', [(3,'无重复字符的最长子串'),(438,'找到字符串中所有字母异位词')]),
('子串', [(560,'和为 K 的子数组'),(239,'滑动窗口最大值'),(76,'最小覆盖子串')]),
('普通数组', [(53,'最大子数组和'),(56,'合并区间'),(189,'轮转数组'),(238,'除了自身以外数组的乘积'),(41,'缺失的第一个正数')]),
('矩阵', [(73,'矩阵置零'),(54,'螺旋矩阵'),(48,'旋转图像'),(240,'搜索二维矩阵 II')]),
('链表', [(160,'相交链表'),(206,'反转链表'),(234,'回文链表'),(141,'环形链表'),(142,'环形链表 II'),(21,'合并两个有序链表'),(2,'两数相加'),(19,'删除链表的倒数第 N 个结点'),(24,'两两交换链表中的节点'),(25,'K 个一组翻转链表'),(138,'随机链表的复制'),(148,'排序链表'),(23,'合并 K 个升序链表'),(146,'LRU 缓存')]),
('二叉树', [(94,'二叉树的中序遍历'),(104,'二叉树的最大深度'),(226,'翻转二叉树'),(101,'对称二叉树'),(543,'二叉树的直径'),(102,'二叉树的层序遍历'),(108,'将有序数组转换为二叉搜索树'),(98,'验证二叉搜索树'),(230,'二叉搜索树中第 K 小的元素'),(199,'二叉树的右视图'),(114,'二叉树展开为链表'),(105,'从前序与中序遍历序列构造二叉树'),(437,'路径总和 III'),(236,'二叉树的最近公共祖先'),(124,'二叉树中的最大路径和')]),
('图论', [(200,'岛屿数量'),(994,'腐烂的橘子'),(207,'课程表'),(208,'实现 Trie (前缀树)')]),
('回溯', [(46,'全排列'),(78,'子集'),(17,'电话号码的字母组合'),(39,'组合总和'),(22,'括号生成'),(79,'单词搜索'),(131,'分割回文串'),(51,'N 皇后')]),
('二分查找', [(35,'搜索插入位置'),(74,'搜索二维矩阵'),(34,'在排序数组中查找元素的第一个和最后一个位置'),(33,'搜索旋转排序数组'),(153,'寻找旋转排序数组中的最小值'),(4,'寻找两个正序数组的中位数')]),
('栈', [(20,'有效的括号'),(155,'最小栈'),(394,'字符串解码'),(739,'每日温度'),(84,'柱状图中最大的矩形')]),
('堆', [(215,'数组中的第K个最大元素'),(347,'前 K 个高频元素'),(295,'数据流的中位数')]),
('贪心算法', [(121,'买卖股票的最佳时机'),(55,'跳跃游戏'),(45,'跳跃游戏 II'),(763,'划分字母区间')]),
('动态规划', [(70,'爬楼梯'),(118,'杨辉三角'),(198,'打家劫舍'),(279,'完全平方数'),(322,'零钱兑换'),(139,'单词拆分'),(300,'最长递增子序列'),(152,'乘积最大子数组'),(416,'分割等和子集'),(32,'最长有效括号')]),
('多维动态规划', [(62,'不同路径'),(64,'最小路径和'),(5,'最长回文子串'),(1143,'最长公共子序列'),(72,'编辑距离')]),
('技巧', [(136,'只出现一次的数字'),(169,'多数元素'),(75,'颜色分类'),(31,'下一个排列'),(287,'寻找重复数')])]

def graphql(query, variables):
    request = urllib.request.Request(ENDPOINT,
        data=json.dumps({'query': query, 'variables': variables}).encode(),
        headers={'Content-Type':'application/json','User-Agent':'Hot100-AI-Coach/0.1 personal-public-catalog'})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    if payload.get('errors'):
        raise RuntimeError(str(payload['errors']))
    return payload['data']

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

PLAN_QUERY = '''query ($slug: String!) { studyPlanV2Detail(planSlug: $slug) {
 name slug planSubGroups { name slug questions { titleSlug title translatedTitle questionFrontendId difficulty } }
} }'''
QUESTION_QUERY = '''query ($slug: String!) { question(titleSlug: $slug) {
 questionFrontendId title titleSlug difficulty isPaidOnly content translatedTitle translatedContent
 codeSnippets { lang langSlug code } metaData exampleTestcases sampleTestCase
 topicTags { name slug translatedName }
} }'''

class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self,data): self.parts.append(data)
    def handle_starttag(self,tag,attrs):
        if tag in ('p','pre','li','br','div'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('p','pre','li','br','div'): self.parts.append('\n')

def plain(content):
    parser=PlainHTML(); parser.feed(content); return ''.join(parser.parts)

def values(text):
    decoder=json.JSONDecoder(); result=[]; pos=0
    while pos < len(text):
        while pos < len(text) and (text[pos].isspace() or text[pos] == ','): pos+=1
        match=re.match(r'[A-Za-z_]\w*\s*=\s*',text[pos:])
        if match: pos+=match.end()
        if pos>=len(text): break
        value,end=decoder.raw_decode(text[pos:]); result.append(value); pos+=end
    return result

def extract_cases(problem):
    body=plain(problem['content'])
    results=[]
    for n,match in enumerate(re.finditer(r'^\s*(?:Input:?|输入[：:]?)\s*(.*?)\s*(?:Output:?|输出[：:]?)\s*(.*?)(?=\n\s*(?:Explanation:?|解释[：:]?|Example \d|示例\s*\d|Constraints:|提示[：:]|Follow.up:)|\Z)',body,re.S|re.M),1):
        try:
            ins=values(match[1])
            if problem['id']=='142':
                found=re.search(r'node index\s+(\d+)|索引为\s*(\d+)',match[2])
                out=int(next(v for v in found.groups() if v is not None)) if found else -1
                if not found and not re.search(r'no cycle|没有环|无环',match[2],re.I): continue
            elif problem['id']=='160':
                found=re.search(r"Intersected at\s+'(\d+)'|相交节点的值为\s*(\d+)",match[2])
                out=int(next(v for v in found.groups() if v is not None)) if found else None
                if not found and not re.search(r'No intersection|不相交|没有交点',match[2],re.I): continue
            else:
                out=json.JSONDecoder().raw_decode(match[2].lstrip())[0]
            params=problem['meta'].get('params',[])
            if problem['meta'].get('systemdesign'):
                if len(ins)!=2: continue
            elif len(ins)!=len(params): continue
            conversion='；文本输出规范化为环入口索引（无环 -1）' if problem['id']=='142' else ('；文本输出规范化为交点值（无交点 null）' if problem['id']=='160' else '')
            results.append({'input':ins,'expected':out,'source':f"官方公开题面示例 {n}：{problem['source']['contentUrl']}；2026-09-06 原始内容缓存{conversion}"})
        except (ValueError,TypeError):
            pass
    return results

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--cached',action='store_true'); args=parser.parse_args()
    stamp=datetime.now(timezone.utc).isoformat()
    rawdir=DATA/'official-cache'
    rawdir.mkdir(parents=True,exist_ok=True)
    if args.cached:
        plan=json.loads((rawdir/'study-plan.json').read_text(encoding='utf-8'))
    else:
        plan=graphql(PLAN_QUERY, {'slug':'top-100-liked'})['studyPlanV2Detail']
        save(rawdir/'study-plan.json',plan)
    official={q['questionFrontendId']:q for g in plan['planSubGroups'] for q in g['questions']}
    cnids={str(i) for _,items in GROUPS for i,_ in items}
    assert cnids==set(official), f"Official plan mismatch: {cnids ^ set(official)}"
    ordered=[(str(i),title,category) for category,items in GROUPS for i,title in items]
    def fetch(item):
        pid,title,category=item; q=official[pid]; cache=rawdir/(pid+'.json')
        try:
            if cache.exists(): raw=json.loads(cache.read_text(encoding='utf-8'))
            else:
                raw=graphql(QUESTION_QUERY,{'slug':q['titleSlug']})['question']
                save(cache,raw); time.sleep(.35)
            if raw['isPaidOnly']: raise ValueError('Paid-only question: content intentionally not cached')
            snippets={v['langSlug']:v['code'] for v in raw['codeSnippets']}
            obj={'id':pid,'title':title,'slug':q['titleSlug'],'difficulty':raw['difficulty'],'category':category,
                'tags':[t['translatedName'] or t['name'] for t in raw['topicTags']],
                'url':f"https://leetcode.cn/problems/{q['titleSlug']}/",'content':raw['translatedContent'] or raw['content'],
                'contentFormat':'html','templates':{'python':snippets.get('python3',''),'cpp':snippets.get('cpp','')},
                'meta':json.loads(raw['metaData']),'exampleTestcases':raw['exampleTestcases'],'sampleTestCase':raw['sampleTestCase'],
                'source':{'url':PLAN_URL,'verifiedAt':'2026-09-06T14:09:29+00:00' if args.cached else stamp,'contentUrl':f"https://leetcode.com/problems/{q['titleSlug']}/",'method':'官方中文题单可见标题/分类 + 官方国际站匿名 GraphQL 元数据','contentLanguage':'zh-CN' if raw['translatedContent'] else 'en','metaSource':'official GraphQL metaData'},
                'available':bool(raw['content'] and snippets.get('python3') and snippets.get('cpp'))}
            print(f"OK {pid} {q['titleSlug']}",flush=True)
            return obj
        except Exception as error:
            print(f"ERROR {pid}: {error}",flush=True)
            return {'id':pid,'title':title,'slug':q['titleSlug'],'difficulty':q['difficulty'].title(),'category':category,'tags':[],
                'url':f"https://leetcode.cn/problems/{q['titleSlug']}/",'content':'','contentFormat':'html','templates':{'python':'','cpp':''},'meta':{},
                'exampleTestcases':'','sampleTestCase':'','source':{'url':PLAN_URL,'verifiedAt':stamp,'error':str(error)},'available':False}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        problems=list(pool.map(fetch,ordered))
    # Retain Chinese content captured from official rendered pages when present.
    zhpath=DATA/'official-cn-content.json'
    if zhpath.exists():
        chinese=json.loads(zhpath.read_text(encoding='utf-8'))
        for p in problems:
            if p['id'] in chinese:
                entry=chinese[p['id']]
                assert entry['title']==p['title']
                p['content']=entry['content']; p['tags']=entry.get('tags') or p['tags']
                p['source']['contentUrl']=p['url']; p['source']['contentLanguage']='zh-CN'; p['source']['contentMethod']='官方网页可见 DOM'
    cases={p['id']:extract_cases(p) for p in problems if p['available']}
    translations=DATA/'chinese-translations.json'
    if translations.exists():
        localizer=runpy.run_path(str(ROOT/'scripts'/'catalog-localize.py'))
        localizer['apply_translations'](problems,json.loads(translations.read_text(encoding='utf-8')))
    asset_manifest=DATA/'official-assets.json'
    if asset_manifest.exists():
        helper=runpy.run_path(str(ROOT/'scripts'/'catalog-assets.py'))
        helper['apply_cached_assets'](problems,json.loads(asset_manifest.read_text(encoding='utf-8')))
    save(DATA/'problems.json',problems)
    save(DATA/'cases.json',cases)
    report={'generatedAt':stamp,'target':PLAN_URL,'catalogCount':len(problems),'availableCount':sum(p['available'] for p in problems),
        'chineseContentCount':sum(p['source'].get('contentLanguage')=='zh-CN' for p in problems),
        'caseProblemCount':sum(bool(v) for v in cases.values()),'caseCount':sum(map(len,cases.values())),
        'missingCaseIds':[p['id'] for p in problems if not cases.get(p['id'])],
        'failedIds':[p['id'] for p in problems if not p['available']],
        'blockedRequests':['2026-09-06: leetcode.cn HTML and GraphQL from Python/Node returned HTTP 403 Cloudflare; no challenge bypass used.'],
        'scope':'公开题面/模板/示例；无力扣隐藏测试，无官方判题；用例可运行与正确比较仍须runner验证'}
    save(DATA/'catalog-report.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
