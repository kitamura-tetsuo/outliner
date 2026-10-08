#!/usr/bin/env python3
"""Verify retained historical bytes, list entries, or print one without extraction."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--list', action='store_true')
parser.add_argument('--cat', metavar='ENTRY')
args = parser.parse_args()
assets = Path(__file__).resolve().parents[3] / 'docs/poc/assets'
manifest = json.loads((assets / 'windows-native-ime-manifest.json').read_text())
archive = assets / 'windows-native-ime-evidence.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['archiveSha256'], 'Archive hash differs'
with zipfile.ZipFile(archive) as z:
    expected = {entry['path']: entry for entry in manifest['entries']}
    assert len(z.namelist()) == len(expected), 'Duplicate or missing entries'
    assert set(z.namelist()) == set(expected), 'Archive entry set differs'
    for name, entry in expected.items():
        data = z.read(name)
        assert len(data) == entry['bytes'], name
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], name
    if args.list:
        print('\n'.join(expected))
    elif args.cat:
        data = z.read(args.cat)
        print(data.decode('utf-16' if data.startswith(b'\xff\xfe') else 'utf-8-sig'), end='')
    else:
        print(f'Verified archive and {len(expected)} original/redacted entries; no experiment rerun.')
