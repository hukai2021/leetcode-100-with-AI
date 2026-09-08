"""Create a source-only deliverable from an explicit allowlist; never include credentials."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = root / 'release' / f'Hot100-AI-Coach-Source-{version}.zip'
folders = ['src', 'electron', 'data', 'assets', 'scripts', 'tests', 'docs']
files = ['README.md', 'Hot100-Codex-Prompt.md', 'package.json', 'package-lock.json',
         'tsconfig.json', 'vite.config.ts', 'index.html', '.gitignore', 'runtime/manifest.json']
selected = [root / p for p in files if (root / p).is_file()]
for folder in folders:
    selected.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and 'test-evidence' not in p.parts)
for p in selected:
    assert 'test-evidence' not in p.parts
    assert p.name != 'auth.json' and p.suffix not in {'.sqlite', '.db'}
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for p in sorted(selected):
        archive.write(p, 'Hot100-AI-Coach/' + p.relative_to(root).as_posix())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert all('/.local/' not in x and '/node_modules/' not in x and '/test-evidence/' not in x for x in archive.namelist())
manifest_path = root / 'release' / 'DELIVERY.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['sourceArchive'] = {'file': target.name, 'files': len(selected), 'bytes': target.stat().st_size,
                           'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
source_tar = root / 'runtime/downloads/w64devkit-source-v2.9.1.tar'
manifest['thirdPartySource'] = {'file': str(source_tar.relative_to(root)), 'bytes': source_tar.stat().st_size,
                              'sha256': hashlib.file_digest(source_tar.open('rb'), 'sha256').hexdigest()}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(manifest['sourceArchive'], ensure_ascii=False))
