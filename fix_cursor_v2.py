import re

file_path = '/workspace/client/src/lib/Cursor.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    original_line = line
    # If line ends with // (potentially followed by comments or whitespace)
    if '//' in line and not line.strip().startswith('//'):
        # Check if it's a corrupted line ending
        # Pattern: ...// followed by nothing or just whitespace
        match = re.search(r'^(.*?)(//)\s*$', line)
        if match:
            content = match.group(1)
            # Count parens in content
            open_parens = content.count('(')
            close_parens = content.count(')')
            open_braces = content.count('{')
            close_braces = content.count('}')
            
            if open_parens > close_parens:
                # Needs one or more closing parens
                needed = open_parens - close_parens
                line = content + (')' * needed) + ';\n'
            elif open_braces > close_braces:
                needed = open_braces - close_braces
                line = content + ('}' * needed) + ';\n'
            else:
                line = content + ';\n'
        
        # Special case for L863: }, 150//  // Increase timeout...
        if '}, 150//' in line:
            line = line.replace('}, 150//', '}, 150);')

    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
