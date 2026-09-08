"""Temporary localhost-only bridge for saving public, rendered source-page text.

The browser tool reads visible problem content, fills this tool's ordinary form,
and presses Save. No accounts, cookies, private state or browser session data are
read by this server. Exit with Ctrl+C after capture; it is not part of the app.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import html
import json
from urllib.parse import parse_qs

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data'/'official-cn-content.json'
PORT=49178

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        problems=json.loads((ROOT/'data'/'problems.json').read_text(encoding='utf-8'))
        rows=''.join(f'<li><a data-id="{p["id"]}" href="{p["url"]}">{p["id"]}. {html.escape(p["title"])}</a></li>' for p in problems)
        body=('<!doctype html><meta charset="utf-8"><title>题库公开内容缓存工具</title>'
              '<h1>官方公开题面缓存</h1><form method="POST"><label>公开题面 JSON<textarea name="payload" rows="8" cols="80"></textarea></label>'
              '<button type="submit">保存缓存</button></form><ol>'+rows+'</ol>').encode()
        self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        length=int(self.headers.get('Content-Length','0'))
        if not 0 < length < 8_000_000:
            self.send_error(413); return
        data=json.loads(parse_qs(self.rfile.read(length).decode())['payload'][0])
        assert isinstance(data,dict)
        for pid,value in data.items():
            assert pid.isdigit() and isinstance(value,dict) and isinstance(value['title'],str) and isinstance(value['content'],str)
        existing=json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {}
        existing.update(data)
        DEST.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.end_headers()
        self.wfile.write(f'<meta charset="utf-8"><p>已保存 {len(existing)} 题</p><a href="/">返回缓存工具</a>'.encode())

if __name__=='__main__':
    print(f'Public catalog capture bridge: http://127.0.0.1:{PORT}',flush=True)
    HTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
