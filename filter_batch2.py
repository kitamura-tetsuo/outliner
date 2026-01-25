import os

with open('japanese_files.txt', 'r') as f:
    files = [line.strip() for line in f]

batch2 = []
for f in files:
    if f.startswith('client/src/components/'):
        batch2.append(f)

for f in batch2:
    print(f)
