"""Cache publicly linked official problem diagrams for offline use."""
from __future__ import annotations
import base64
import concurrent.futures
from datetime import datetime,timezone
import hashlib
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
# Exact public image hosts observed in the cached official problem HTML.
# The final host serves the openly linked Pascal-triangle animation on #118.
ALLOWED={'assets.leetcode.com','assets.leetcode.cn','pic.leetcode.cn','s3-lc-upload.s3.amazonaws.com','upload.wikimedia.org'}
class Images(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='img':
            src=dict(attrs).get('src','')
            if src.startswith('https://'): self.urls.append(src)

def apply_cached_assets(problems,cache):
    for problem in problems:
        parser=Images(); parser.feed(problem['content']); failures=[]; saved=[]
        for url in parser.urls:
            entry=cache.get(url)
            if entry and entry.get('status')=='cached':
                local=ROOT/entry['path']
                if local.is_file():
                    encoded='data:'+entry['mimeType']+';base64,'+base64.b64encode(local.read_bytes()).decode()
                    problem['content']=re.sub(r'(<img\b[^>]*\bsrc\s*=\s*[\"\x27])'+re.escape(url)+r'([\"\x27])',lambda match:match[1]+encoded+match[2],problem['content'],flags=re.I)
                    saved.append({'url':url,'sha256':entry['sha256']}); continue
            failures.append(url)
        if saved or failures:
            problem['source']['offlineImages']={'cached':saved,'missing':failures}
    return problems

def main():
    problems=json.loads((ROOT/'data'/'problems.json').read_text(encoding='utf-8'))
    urls=[]
    for problem in problems:
        parser=Images(); parser.feed(problem['content']); urls.extend(parser.urls)
    urls=sorted(set(urls))
    cachefile=ROOT/'data'/'official-assets.json'
    cache=json.loads(cachefile.read_text(encoding='utf-8')) if cachefile.exists() else {}
    dest=ROOT/'data'/'assets'; dest.mkdir(parents=True,exist_ok=True)
    def fetch(url):
        if cache.get(url,{}).get('status')=='cached' and (ROOT/cache[url]['path']).is_file(): return url,cache[url]
        stamp=datetime.now(timezone.utc).isoformat()
        try:
            parsed=urllib.parse.urlparse(url)
            if parsed.hostname not in ALLOWED: raise ValueError('Image host is outside the official asset allowlist')
            request=urllib.request.Request(url,headers={'User-Agent':'Hot100-AI-Coach/0.1 personal-offline-cache'})
            with urllib.request.urlopen(request,timeout=30) as response:
                if urllib.parse.urlparse(response.url).hostname not in ALLOWED: raise ValueError('Redirect outside official assets')
                content=response.read(8*1024*1024+1)
                mime=response.headers.get_content_type()
            if len(content)>8*1024*1024: raise ValueError('Image exceeds 8 MiB')
            if mime not in ('image/png','image/jpeg','image/gif','image/webp','image/svg+xml'): raise ValueError('Unsupported image MIME '+mime)
            suffix={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/webp':'.webp','image/svg+xml':'.svg'}[mime]
            digest=hashlib.sha256(content).hexdigest(); path=dest/(digest[:20]+suffix); path.write_bytes(content)
            print('OK '+url,flush=True)
            return url,{'status':'cached','url':url,'verifiedAt':stamp,'path':path.relative_to(ROOT).as_posix(),'mimeType':mime,'bytes':len(content),'sha256':digest}
        except Exception as error:
            print('FAIL '+url+' '+str(error),flush=True)
            return url,{'status':'failed','url':url,'verifiedAt':stamp,'error':str(error)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        cache.update(dict(pool.map(fetch,urls)))
    cachefile.write_text(json.dumps(cache,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    apply_cached_assets(problems,cache)
    (ROOT/'data'/'problems.json').write_text(json.dumps(problems,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary={'completedAt':datetime.now(timezone.utc).isoformat(),'uniqueUrls':len(cache),'cached':sum(v['status']=='cached' for v in cache.values()),'failed':[v for v in cache.values() if v['status']!='cached'],'cachedBytes':sum(v.get('bytes',0) for v in cache.values()),'problemsWithCachedImages':sum(bool(p['source'].get('offlineImages',{}).get('cached')) for p in problems)}
    (ROOT/'docs'/'catalog-assets.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8'); main()
