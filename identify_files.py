import os
import re

def contains_japanese(text):
    japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]')
    return bool(japanese_pattern.search(text))

root_dir = 'client'
excluded_dirs = ['e2e', 'node_modules', '.svelte-kit', 'project.inlang']
# Exclude message files and generated paraglide files
excluded_paths = ['client/messages', 'client/src/lib/paraglide']

files_with_japanese = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    dirnames[:] = [d for d in dirnames if d not in excluded_dirs]

    for filename in filenames:
        filepath = os.path.join(dirpath, filename)

        if any(filepath.startswith(p) for p in excluded_paths):
            continue

        if filename.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot')):
            continue

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                if contains_japanese(content):
                    files_with_japanese.append(filepath)
        except UnicodeDecodeError:
            pass
        except Exception as e:
            print(f"Error reading {filepath}: {e}")

with open('japanese_files.txt', 'w') as f:
    for file in files_with_japanese:
        f.write(file + '\n')

print(f"Found {len(files_with_japanese)} files.")
