"""Apply Chinese translations while preserving executable templates and official samples."""
from __future__ import annotations
import argparse, copy, hashlib, json, re, runpy
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,v): Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(v): return hashlib.sha256(v).hexdigest()
def digest(v): return sha(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
def immutable(p): return {k:v for k,v in p.items() if k not in {'content','source'}}
class Structure(HTMLParser):
 def __init__(self,body):
  super().__init__(convert_charrefs=True);self.tags=[];self.codes=[];self.images=[];self.text=[];self.depth=0;self.feed(body)
 def handle_starttag(self,tag,attrs):
  self.tags.append(('start',tag,sorted(attrs)))
  if tag=='code': self.depth+=1;self.codes.append('')
  if tag=='img':self.images.append(dict(attrs).get('src',''))
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
 def handle_endtag(self,tag):
  self.tags.append(('end',tag))
  if tag=='code':self.depth-=1
 def handle_data(self,data):
  self.text.append(data)
  if self.depth and self.codes:self.codes[-1]+=data
def apply_translations(problems,entries):
 for p in problems:
  e=entries.get(p['id'])
  if not e:continue
  raw=read(ROOT/'data/official-cache'/f"{p['id']}.json")
  assert p['slug']==e['slug']==raw['titleSlug']
  assert sha(raw['content'].encode())==e['originalSha256'],'Original changed; review translation: '+p['id']
  p['content']=e['content']
  p['source'].update({'contentLanguage':'zh-CN','contentMethod':'基于已缓存官方英文原文的中文翻译（非官方译文）',
   'translation':{'kind':'local-translation','translatedAt':e['translatedAt'],'originalLanguage':'en','originalSha256':e['originalSha256']}})
 return problems
def merge(stage):
 stage=Path(stage);before=read(stage/'before-problems.json');current=read(ROOT/'data/problems.json')
 assert current==before,'Catalog changed during translation; review before merging.'
 translated={}
 for part in range(1,4):
  chunk=read(stage/f'translated-{part}.json')
  assert not set(chunk)&set(translated)
  assert set(chunk)=={p['id'] for p in read(stage/f'input-{part}.json')}
  translated.update(chunk)
 expected={p['id'] for p in before if not p['source']['contentLanguage'].startswith('zh')}
 assert set(translated)==expected and len(translated)==98
 entries={};stamp=datetime.now(timezone.utc).isoformat()
 for p in before:
  if p['id'] not in translated:continue
  raw=read(ROOT/'data/official-cache'/f"{p['id']}.json")
  entries[p['id']]={'slug':p['slug'],'title':p['title'],'originalSha256':sha(raw['content'].encode()),'translatedAt':stamp,'content':translated[p['id']]}
 baseline={'capturedAt':stamp,'casesSha256':sha((stage/'before-cases.json').read_bytes()),'problemsSha256':sha((stage/'before-problems.json').read_bytes()),
  'problems':{p['id']:{'immutableSha256':digest(immutable(p)),'contentSha256':sha(p['content'].encode()),'source':p['source']} for p in before}}
 save(ROOT/'data/chinese-translations.json',entries);save(ROOT/'docs/chinese-baseline.json',baseline)
 apply_translations(current,entries)
 runpy.run_path(str(ROOT/'scripts/catalog-assets.py'))['apply_cached_assets'](current,read(ROOT/'data/official-assets.json'))
 save(ROOT/'data/problems.json',current);verify()
def verify():
 problems=read(ROOT/'data/problems.json');baseline=read(ROOT/'docs/chinese-baseline.json')
 entries=read(ROOT/'data/chinese-translations.json');assets=read(ROOT/'data/official-assets.json')
 assert len(problems)==len({p['id'] for p in problems})==100
 assert sha((ROOT/'data/cases.json').read_bytes())==baseline['casesSha256']
 embed=runpy.run_path(str(ROOT/'scripts/catalog-assets.py'))['apply_cached_assets']
 extract=runpy.run_path(str(ROOT/'scripts/catalog-fetch.py'))['extract_cases']
 checks=[];errors=[]
 for p in problems:
  pid=p['id'];old=baseline['problems'][pid];item={'id':pid,'title':p['title']}
  item['executableDataUnchanged']=digest(immutable(p))==old['immutableSha256']
  item['chineseLanguage']=p['source']['contentLanguage']=='zh-CN';parsed=Structure(p['content'])
  item['embeddedImages']=len(parsed.images)
  item['imagesUnchanged']=p['source'].get('offlineImages')==old['source'].get('offlineImages') and all(x.startswith('data:image/') for x in parsed.images)
  item['hasChineseText']=bool(re.search(r'[\u4e00-\u9fff]',''.join(parsed.text)))
  if pid in entries:
   e=entries[pid];raw=read(ROOT/'data/official-cache'/f'{pid}.json');english=Structure(re.sub(r'<sup>(?:th|st|nd|rd)</sup>','',raw['content']));chinese=Structure(e['content'])
   item['originalHashMatches']=sha(raw['content'].encode())==e['originalSha256']
   item['htmlStructureUnchangedExceptOrdinalSuffixes']=english.tags==chinese.tags
   allowed={'347':{('[1, the number of unique elements in the array]','[1, 数组中不同元素的个数]')},'153':{('O(log n) time','O(log n) 时间')}}
   changes=[(a,b) for a,b in zip(english.codes,chinese.codes) if a!=b]
   item['codeFormulasUnchanged']=len(english.codes)==len(chinese.codes) and all(x in allowed.get(pid,set()) for x in changes)
   if changes:item['codeNaturalLanguageTranslations']=changes
   item['imageSourcesUnchanged']=english.images==chinese.images
   normalized=lambda body:[{'input':c['input'],'expected':c['expected']} for c in extract({**p,'content':re.sub(r'相交节点的值为\s*&#39;(\d+)&#39;',r'相交节点的值为 \1',body.replace('下标为','索引为'))})]
   item['exampleDataUnchanged']=normalized(raw['content'])==normalized(e['content'])
   item['exampleLabelsTranslated']=not bool(re.search(r'\b(?:Input|Output|Explanation|Constraints|Follow.up)\s*:',e['content']))
   expected=copy.deepcopy(p);expected['content']=e['content'];embed([expected],assets)
   item['publishedContentMatchesTranslation']=expected['content']==p['content']
  else:item['officialChineseUnchanged']=sha(p['content'].encode())==old['contentSha256']
  for k,v in item.items():
   if isinstance(v,bool) and not v:errors.append({'id':pid,'check':k})
  checks.append(item)
 report={'verifiedAt':datetime.now(timezone.utc).isoformat(),'total':len(problems),'chineseCount':sum(c['chineseLanguage'] for c in checks),
  'officialChineseCount':len(problems)-len(entries),'localTranslationCount':len(entries),'casesUnchanged':True,
  'casesSha256':baseline['casesSha256'],'catalogSha256':sha((ROOT/'data/problems.json').read_bytes()),
  'embeddedImageCount':sum(c['embeddedImages'] for c in checks),'errors':errors,'checks':checks,
  'scope':'逐题翻译并自查；自动检查HTML结构、代码片段、图源、原文哈希、题目非正文字段及247用例不变。此检查不等于第三方人工审译，也未重新执行历史AI批改。'}
 save(ROOT/'docs/chinese-localization.json',report)
 assert not errors,json.dumps(errors,ensure_ascii=False)
 summary=read(ROOT/'data/catalog-report.json')
 summary.update({'finalizedAt':report['verifiedAt'],'chineseContentCount':100,'contentLanguages':{'zh-CN':100},
  'localization':{'officialChineseCount':2,'localTranslationCount':98,'report':'docs/chinese-localization.json'},
  'scope':'100题中文题面（2题官方中文、98题基于缓存官方原文的本地译文），Python3/C++模板及247个官方公开样例；本次仅更新正文与来源元数据，用例、模板和函数签名不变。示意图全部离线嵌入。既有算法实测见历史报告，无官方判题或隐藏测试结果。'})
 save(ROOT/'data/catalog-report.json',summary)
 print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
 return report
if __name__=='__main__':
 import sys
 sys.stdout.reconfigure(encoding='utf-8')
 parser=argparse.ArgumentParser();parser.add_argument('--merge');args=parser.parse_args()
 if args.merge:merge(args.merge)
 else:verify()
