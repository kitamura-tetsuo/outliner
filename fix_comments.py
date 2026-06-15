import re

file_path = '/workspace/client/src/lib/Cursor.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Fix the broken comment pattern
def fix_comment(match):
    indent = match.group(1)
    comment = match.group(2)
    return f"{indent}}}\n\n{indent}// {comment}"

# Escaping the parenthesis
content = re.sub(r'^(\s*)\}\);\s+([A-Z].*)$', fix_comment, content, flags=re.MULTILINE)

# Also fix ones that don't start with capital if needed
content = re.sub(r'^(\s*)\}\);\s+(navigate-to-item.*)$', fix_comment, content, flags=re.MULTILINE)

with open(file_path, 'w') as f:
    f.write(content)
