import os

with open('japanese_files.txt', 'r') as f:
    files = [line.strip() for line in f]

batch1 = []
for f in files:
    if f.startswith('client/scripts/') or (f.startswith('client/') and '/' not in f[7:]):
        batch1.append(f)

for f in batch1:
    print(f)
