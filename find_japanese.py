import os
import re

def contains_japanese(text):
    # Common Japanese unicode ranges
    # Hiragana: 3040-309F
    # Katakana: 30A0-30FF
    # Kanji: 4E00-9FAF
    japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]')
    return bool(japanese_pattern.search(text))

root_dir = 'client'
excluded_dirs = ['e2e', 'node_modules', '.svelte-kit', 'project.inlang']
# The issue description says: "Please leave files that are explicitly included in Japanese, such as title-ja and motivation: ja, in /workspace/docs/client-features."
# So I should probably check if those are in client/docs or something.
# Wait, the issue says . That seems to be outside ?
# Let's check  directory structure again.

files_with_japanese = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    # Modify dirnames in-place to exclude directories
    dirnames[:] = [d for d in dirnames if d not in excluded_dirs]

    for filename in filenames:
        filepath = os.path.join(dirpath, filename)

        # Skip binary files or specific extensions if needed
        if filename.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot')):
            continue

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                if contains_japanese(content):
                    files_with_japanese.append(filepath)
        except UnicodeDecodeError:
            # Skip files that aren't text
            pass
        except Exception as e:
            print(f"Error reading {filepath}: {e}")

for file in files_with_japanese:
    print(file)
