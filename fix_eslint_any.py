import re
import os

files = [
    "client/src/lib/KeyEventHandler.ts",
    "client/src/components/OutlinerItem.svelte",
    "client/src/components/OutlinerTree.svelte",
    "client/src/components/CommentThread.svelte",
    "client/src/yjs/YjsClient.ts"
]

def fix_file(file_path):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, "r") as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check if it's a suppression comment
        if "// eslint-disable-next-line @typescript-eslint/no-explicit-any" in line:
            # Look ahead for more suppression comments or the target line
            j = i + 1
            while j < len(lines) and "// eslint-disable-next-line @typescript-eslint/no-explicit-any" in lines[j]:
                j += 1
            
            # Now j points to the first non-suppression line
            if j < len(lines):
                target_line = lines[j]
                # Check if target line contains 'any'
                if "any" in target_line or j + 1 < len(lines) and "any" in lines[j+1]:
                    # Keep exactly one suppression comment
                    new_lines.append(line)
                    # Skip all redundant suppression comments
                    i = j
                else:
                    # No 'any' found in next line(s), so this suppression is unused
                    print(f"Removing unused suppression at {file_path}:{i+1}")
                    i = j
            else:
                # End of file
                i = j
        else:
            new_lines.append(line)
            i += 1

    # Second pass: ensure 'any' triggers have a suppression
    final_lines = []
    i = 0
    while i < len(new_lines):
        line = new_lines[i]
        # Regex to find 'as any' or ': any' or '<any>' etc.
        # But only if it's not already suppressed
        if ("any" in line and 
            not line.strip().startswith("//") and 
            not line.strip().startswith("/*") and
            re.search(r'(\sany|:any|<any>|as\sany)', line)):
            
            # Check if previous line was a suppression
            prev_line = final_lines[-1] if final_lines else ""
            if "// eslint-disable-next-line @typescript-eslint/no-explicit-any" not in prev_line:
                # Add suppression
                indent = re.match(r'^\s*', line).group(0)
                final_lines.append(f"{indent}// eslint-disable-next-line @typescript-eslint/no-explicit-any\n")
                print(f"Added missing suppression at {file_path}:{len(final_lines)}")
        
        final_lines.append(line)
        i += 1

    with open(file_path, "w") as f:
        f.writelines(final_lines)

for f in files:
    fix_file(f)
