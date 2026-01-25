import os

with open('japanese_files.txt', 'r') as f:
    files = [line.strip() for line in f]

batch4 = []
for f in files:
    if f.startswith('client/src/routes/'):
        batch4.append(f)

for f in batch4:
    print(f)
