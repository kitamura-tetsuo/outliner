#!/usr/bin/env python3
"""
Script to prefix unused variables with underscore to suppress ESLint warnings.
"""

import re
import subprocess
import sys
from pathlib import Path
from collections import defaultdict

def get_lint_output():
    """Run linter and get output."""
    try:
        result = subprocess.run(
            ['npm', 'run', 'lint'],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True
        )
        return result.stdout + result.stderr
    except Exception as e:
        print(f"Error running linter: {e}")
        sys.exit(1)

def parse_unused_vars(lint_output):
    """Parse lint output to find unused variables."""
    unused_vars = defaultdict(list)
    current_file = None
    
    for line in lint_output.split('\n'):
        # Match file paths
        if line.startswith('/workspace/client/'):
            current_file = line.strip()
        # Match unused variable warnings
        elif current_file and '@typescript-eslint/no-unused-vars' in line:
            match = re.search(r'^\s+(\d+):(\d+)\s+warning\s+\'([^\']+)\'\s+is\s+(defined|assigned)', line)
            if match:
                line_num = int(match.group(1))
                col_num = int(match.group(2))
                var_name = match.group(3)
                # Skip variables that already start with _
                if not var_name.startswith('_'):
                    unused_vars[current_file].append({
                        'line': line_num,
                        'col': col_num,
                        'name': var_name
                    })
    
    return unused_vars

def prefix_variable(line, var_name):
    """Prefix a variable name with underscore."""
    # Don't prefix if already starts with _
    if var_name.startswith('_'):
        return line
    
    new_var_name = f'_{var_name}'
    
    # Pattern 1: const/let/var varName = ...
    line = re.sub(rf'\b(const|let|var)\s+{re.escape(var_name)}\b', rf'\1 {new_var_name}', line)
    
    # Pattern 2: function parameter (varName) or (varName: Type)
    line = re.sub(rf'\(\s*{re.escape(var_name)}\s*:', rf'({new_var_name}:', line)
    line = re.sub(rf'\(\s*{re.escape(var_name)}\s*\)', rf'({new_var_name})', line)
    line = re.sub(rf',\s*{re.escape(var_name)}\s*:', rf', {new_var_name}:', line)
    line = re.sub(rf',\s*{re.escape(var_name)}\s*\)', rf', {new_var_name})', line)
    
    # Pattern 3: arrow function parameter varName =>
    line = re.sub(rf'\(\s*{re.escape(var_name)}\s*\)\s*=>', rf'({new_var_name}) =>', line)
    line = re.sub(rf'\b{re.escape(var_name)}\s*=>', rf'{new_var_name} =>', line)
    
    # Pattern 4: destructuring { varName } or [ varName ]
    line = re.sub(rf'\{{\s*{re.escape(var_name)}\s*\}}', rf'{{ {new_var_name} }}', line)
    line = re.sub(rf'\[\s*{re.escape(var_name)}\s*\]', rf'[ {new_var_name} ]', line)
    
    return line

def fix_file(file_path, unused_vars):
    """Prefix unused variables in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        modified = False
        
        # Group vars by line
        vars_by_line = defaultdict(list)
        for var in unused_vars:
            vars_by_line[var['line']].append(var['name'])
        
        for line_num, var_names in vars_by_line.items():
            if line_num <= len(lines):
                original_line = lines[line_num - 1]
                new_line = original_line
                
                for var_name in var_names:
                    new_line = prefix_variable(new_line, var_name)
                
                if new_line != original_line:
                    lines[line_num - 1] = new_line
                    modified = True
        
        if modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            return True
        
        return False
    except Exception as e:
        print(f"Error fixing {file_path}: {e}")
        return False

def main():
    print("Running linter to detect unused variables...")
    lint_output = get_lint_output()
    
    print("Parsing unused variables...")
    unused_vars = parse_unused_vars(lint_output)
    
    print(f"Found {len(unused_vars)} files with unused variables")
    
    fixed_count = 0
    for file_path, vars_list in unused_vars.items():
        if fix_file(file_path, vars_list):
            fixed_count += 1
            print(f"Fixed: {file_path}")
    
    print(f"\nFixed {fixed_count} files")
    print("Running dprint fmt...")
    subprocess.run(['npx', 'dprint', 'fmt'], cwd=Path(__file__).parent.parent)
    print("Done! Run 'npm run lint' to verify the changes")

if __name__ == '__main__':
    main()

