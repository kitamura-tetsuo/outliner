import os

with open('japanese_files.txt', 'r') as f:
    files = [line.strip() for line in f]

batch3_prefixes = [
    'client/src/lib/',
    'client/src/utils/',
    'client/src/stores/',
    'client/src/services/',
    'client/src/auth/',
    'client/src/schema/',
    'client/src/yjs/'
]

batch3 = []
for f in files:
    for prefix in batch3_prefixes:
        if f.startswith(prefix):
            batch3.append(f)
            break

for f in batch3:
    print(f)
