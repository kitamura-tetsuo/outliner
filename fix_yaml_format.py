#!/usr/bin/env python3
import os
import re
import glob

def fix_yaml_file(filepath):
    """Fix YAML formatting issues in a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix list indentation: replace "-- " with "  - "
    content = re.sub(r'^--\s+', '  - ', content, flags=re.MULTILINE)
    
    # Remove trailing quotes with spaces
    content = re.sub(r"  '\s*$", "'", content, flags=re.MULTILINE)
    
    # Remove empty lines with only spaces
    content = re.sub(r'^\s+$', '', content, flags=re.MULTILINE)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    """Fix all YAML files in docs directory"""
    yaml_files = glob.glob('docs/**/*.yaml', recursive=True)
    
    for filepath in yaml_files:
        print(f"Fixing {filepath}")
        fix_yaml_file(filepath)
    
    print(f"Fixed {len(yaml_files)} YAML files")

if __name__ == '__main__':
    main()
