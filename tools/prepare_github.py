"""Stage the public source repository using an explicit file allowlist. Never publish."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'deployment/github-petro-vis-public'
assert TARGET.resolve().is_relative_to((ROOT / 'deployment').resolve())
TARGET.mkdir(parents=True, exist_ok=True)
paths = set()
for folder in ['site', 'cases', 'contracts', 'tests']:
    paths.update(p for p in (ROOT / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts
                 and not any(part.startswith('.') for part in p.relative_to(ROOT).parts))
for pattern in ['build_cases.py', 'build_release.py', 'prepare_github.py', 'validate-cases.cjs',
                'build-public-demo-data.cjs', 'build-case-*-content.cjs']:
    paths.update((ROOT / 'tools').glob(pattern))
for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'data/processed/force-demo-v2.json',
             'data/research/catalog.json', 'data/research/lithology-map.json',
             'tools/data/extract_force.py', 'tools/data/check_force_v2.py',
             'docs/interfaces-v1.md', 'docs/case-01-design.md',
             'docs/case-02-03-design.md', 'docs/case-04-05-design.md',
             'docs/experiments/R03-core-results.json',
             'extracted/assets/data.js', 'extracted/assets/core/registry.js',
             'extracted/assets/core/case-demo-host.js']:
    paths.add(ROOT / name)
paths.update(p for p in (ROOT / 'deliverables/cases').iterdir() if p.is_file())
files = {p.relative_to(ROOT).as_posix(): p.read_bytes() for p in sorted(paths)}
readme = ROOT / 'docs/public-README.md'
files['README.md'] = (readme if readme.exists() else ROOT / 'README.md').read_bytes()
files['.gitignore'] = b'data/raw/\n__pycache__/\n*.pyc\ndeployment/\ntmp/\nevidence/\n.private-*\ndeliverables/github-pages/\ndeliverables/github-pages.zip\ndeliverables/github-pages-manifest.json\n'
files['.gitattributes'] = b'* -text\n'
private_terms = ROOT / '.private-publication-terms.txt'
terms = private_terms.read_text(encoding='utf-8').splitlines() if private_terms.exists() else []

def check_private(name, raw):
    for term in terms:
        if term.strip():
            assert term.encode('utf-8') not in raw, 'private term in ' + name

for name, raw in files.items():
    check_private(name, raw)
    if name.endswith('.zip'):
        with zipfile.ZipFile(ROOT / name) as package:
            assert package.testzip() is None
            for entry in package.namelist():
                check_private(name + '/' + entry, package.read(entry))
    dest = TARGET / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
records = [{'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
           for name, raw in sorted(files.items())]
(TARGET / 'SOURCE_MANIFEST.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'directory': str(TARGET), 'files': len(files), 'bytes': sum(map(len, files.values())), 'privateTermsChecked': True}))
