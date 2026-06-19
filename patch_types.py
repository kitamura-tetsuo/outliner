import re

filepath = 'client/src/types/global.d.ts'

with open(filepath, 'r') as f:
    content = f.read()

# Update itemsStore to be more specific
new_content = content.replace('itemsStore?: { allItems?: unknown[]; };', 'itemsStore?: { allItems?: { id?: string; text?: unknown; }[]; };')

with open(filepath, 'w') as f:
    f.write(new_content)
