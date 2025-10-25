#!/usr/bin/env python3
"""
Script to automatically fix unused variables based on ESLint warnings.
This script reads the lint output and removes unused variables from files.
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
                unused_vars[current_file].append({
                    'line': line_num,
                    'col': col_num,
                    'name': var_name
                })
    
    return unused_vars

def fix_unused_import(line, var_name):
    """Remove unused import from a line."""
    # Pattern 1: import { name } from "..."
    if re.match(rf'^\s*import\s*\{{\s*{re.escape(var_name)}\s*\}}\s*from', line):
        return None  # Remove entire line
    
    # Pattern 2: import { name, other } from "..." or import { other, name } from "..."
    line = re.sub(rf'\{{\s*{re.escape(var_name)}\s*,\s*', '{ ', line)
    line = re.sub(rf',\s*{re.escape(var_name)}\s*\}}', ' }', line)
    line = re.sub(rf',\s*{re.escape(var_name)}\s*,', ',', line)
    
    # Pattern 3: import name from "..."
    if re.match(rf'^\s*import\s+{re.escape(var_name)}\s+from', line):
        return None  # Remove entire line
    
    # Check if import is now empty
    if re.search(r'import\s*\{\s*\}\s*from', line):
        return None
    
    return line

def fix_unused_error_handler(line, var_name):
    """Replace unused error variable with underscore."""
    # Pattern: } catch (error) {
    if re.search(rf'catch\s*\(\s*{re.escape(var_name)}\s*\)', line):
        return re.sub(rf'catch\s*\(\s*{re.escape(var_name)}\s*\)', 'catch (_)', line)
    
    # Pattern: .catch((error) => {
    if re.search(rf'\.catch\s*\(\s*\(?\s*{re.escape(var_name)}\s*\)?\s*=>', line):
        return re.sub(rf'\.catch\s*\(\s*\(?\s*{re.escape(var_name)}\s*\)?\s*=>', '.catch((_) =>', line)
    
    return line

def fix_unused_variable(line, var_name):
    """Remove or comment out unused variable assignment."""
    # Pattern: const varName = ...
    if re.search(rf'^\s*(const|let|var)\s+{re.escape(var_name)}\s*=', line):
        # Comment it out instead of removing
        return f"// {line.lstrip()}"
    
    return line

def fix_file(file_path, unused_vars):
    """Fix unused variables in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        modified = False
        new_lines = []
        
        # Group vars by line
        vars_by_line = defaultdict(list)
        for var in unused_vars:
            vars_by_line[var['line']].append(var['name'])
        
        for i, line in enumerate(lines, 1):
            if i in vars_by_line:
                original_line = line
                for var_name in vars_by_line[i]:
                    # Try different fix strategies
                    if 'import' in line:
                        line = fix_unused_import(line, var_name)
                    elif 'catch' in line or var_name in ['e', 'error', '_e']:
                        line = fix_unused_error_handler(line, var_name)
                    else:
                        line = fix_unused_variable(line, var_name)
                    
                    if line != original_line:
                        modified = True
                
                if line is not None:
                    new_lines.append(line if line.endswith('\n') else line + '\n')
            else:
                new_lines.append(line)
        
        if modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
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

