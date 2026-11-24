#!/usr/bin/env python3
"""Prepare the next Branchline web release in the existing app repository.
Run from any directory. Commit the source changes and generated stamps together.
Never use a lower sequence, including rollback releases.
"""
import argparse, json, pathlib, re
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument("sequence",type=int)
parser.add_argument("label")
args=parser.parse_args()
path=root/"updates/release.json"
current=json.loads(path.read_text())
if args.sequence<=current["sequence"] or args.sequence>9007199254740991:
 raise SystemExit("Sequence must increase and be a safe integer.")
if not re.fullmatch(r"[A-Za-z0-9 ._-]{1,64}",args.label):
 raise SystemExit("Invalid release label.")
old=current["sequence"]
updates={}
for name in ("index.html","apps/index.html"):
 p=root/name
 s=p.read_text()
 assert s.count(f'/branchline/updates/check.js?v={old}')==1
 assert s.count(f'/branchline/updates/check.css?v={old}')==1
 assert s.count(f'data-sequence="{old}"')==1
 assert s.count('data-release-label="'+current["label"]+'"')==1
 updates[p]=s.replace(f'/branchline/updates/check.js?v={old}',f'/branchline/updates/check.js?v={args.sequence}').replace(f'/branchline/updates/check.css?v={old}',f'/branchline/updates/check.css?v={args.sequence}').replace(f'data-sequence="{old}"',f'data-sequence="{args.sequence}"').replace('data-release-label="'+current["label"]+'"','data-release-label="'+args.label+'"')
p=root/"sw.js"
s=p.read_text()
assert s.count(f'-web-{old}"')==1
assert s.count(f'./updates/check.js?v={old}')==1
assert s.count(f'./updates/check.css?v={old}')==1
updates[p]=s.replace(f'-web-{old}"',f'-web-{args.sequence}"').replace(f'./updates/check.js?v={old}',f'./updates/check.js?v={args.sequence}').replace(f'./updates/check.css?v={old}',f'./updates/check.css?v={args.sequence}')
updates[path]=json.dumps({"schema":1,"channel":"production","app":"sales","sequence":args.sequence,"label":args.label},indent=2)+"\n"
for p,content in updates.items():p.write_text(content)
print("Prepared",args.label,"— review, test and commit together. No deployment performed.")
