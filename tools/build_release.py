"""Prepare a static-only release for Sites or GitHub Pages; never publish it."""
from pathlib import Path
import hashlib
import json
import argparse
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
CHECKOUT = ROOT / 'deployment/petro-vis-course'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--github-pages', action='store_true', help='write deliverables/github-pages and its ZIP')
args = parser.parse_args()
DIST = ROOT / 'deliverables/github-pages' if args.github_pages else CHECKOUT / 'dist'
DIST.mkdir(parents=True, exist_ok=True)
assert DIST.resolve().is_relative_to(ROOT.resolve()) and DIST.name in {'dist', 'github-pages'}
records = json.loads((ROOT / 'deliverables/cases/manifest.json').read_text(encoding='utf-8'))
assert {r['sceneId'] for r in records} == {'w1', 'w2', 'w3', 'w4', 'w5'}
expected = {}
for p in SITE.rglob('*'):
    if not p.is_file() or any(part.startswith('.') for part in p.relative_to(SITE).parts):
        continue
    assert not p.is_symlink() and p.resolve().is_relative_to(SITE.resolve())
    assert p.suffix.lower() in {'.html', '.js', '.css', '.md', '.txt', '.svg', '.png', '.jpg', '.json'}
    expected[p.relative_to(SITE).as_posix()] = p.read_bytes()
for record in records:
    source = ROOT / record['archive']
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == record['sha256']
    expected['downloads/' + source.name] = raw
expected['downloads/manifest.json'] = json.dumps(records, ensure_ascii=False, indent=2).encode('utf-8')
if args.github_pages:
    expected['.nojekyll'] = b''
private_terms = ROOT / '.private-publication-terms.txt'
for personal in (private_terms.read_text(encoding='utf-8').splitlines() if private_terms.exists() else []):
    if not personal.strip():
        continue
    assert all(personal.encode('utf-8') not in data for data in expected.values()), 'personal data in public release'

class EntryParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        ref = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' else None
        if ref:
            ref = ref.split('?')[0]
            assert not ref.startswith(('http:', 'https:', '//')), 'external startup dependency'
            assert ref in expected, 'missing startup file ' + ref

EntryParser().feed(expected['index.html'].decode('utf-8'))
# Only delete stale generated files within this explicitly verified dist directory.
for p in DIST.rglob('*'):
    if p.is_file() and p.relative_to(DIST).as_posix() not in expected:
        assert p.resolve().is_relative_to(DIST.resolve())
        p.unlink()
for name, data in expected.items():
    p = DIST / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
release = {'date': datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat(),
           'target': 'github-pages' if args.github_pages else 'sites',
           'published': False, 'readyCases': len(records), 'fileCount': len(expected),
           'bytes': sum(map(len, expected.values())), 'sourceBytes': sum(r['sourceBytes'] for r in records),
           'zipBytes': sum(r['zipBytes'] for r in records), 'personalDataPublished': False,
           'cases': records, 'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                                     for name, data in sorted(expected.items())]}
manifest_name = 'github-pages-manifest.json' if args.github_pages else 'release-manifest.json'
(ROOT / 'deliverables' / manifest_name).write_text(json.dumps(release, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if args.github_pages:
    archive = ROOT / 'deliverables/github-pages.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name, data in sorted(expected.items()):
            package.writestr(name, data)
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert all(package.read(name) == data for name, data in expected.items())
print(json.dumps({k: release[k] for k in ['readyCases','fileCount','bytes','sourceBytes','zipBytes','personalDataPublished']}))
