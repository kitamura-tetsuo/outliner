#!/usr/bin/env python3
"""
Script to add the required coverage hooks to E2E spec files.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
E2E_DIR = REPO_ROOT / "client" / "e2e"

# Read the list of files missing import and call from the error output
# We'll add both the import and the call to all spec files that are missing them

def find_spec_files(base: Path) -> list[Path]:
    return [p for p in base.rglob("*.spec.ts") if p.is_file()]

def add_coverage_hooks_to_file(spec_file: Path):
    """Add coverage hooks import and call to a spec file."""
    try:
        content = spec_file.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading {spec_file}: {e}")
        return False

    # Check if import already exists
    has_import = "registerCoverageHooks" in content and "../utils/registerCoverageHooks" in content
    
    # Check if call already exists
    has_call = "registerCoverageHooks()" in content

    if has_import and has_call:
        # Already has both, skip
        return True

    # Add import after other import statements near the top
    if not has_import:
        # Find where to insert the import - after other imports
        # Look for the line after the last import statement
        lines = content.splitlines()
        insert_pos = 0
        
        # Find the position to insert our import after existing imports
        for i, line in enumerate(lines):
            if line.strip().startswith("import "):
                insert_pos = i + 1
            elif line.strip() and not line.strip().startswith("import ") and not line.strip().startswith("//"):
                # Reached a non-import, non-comment line, so stop looking
                break
        
        import_line = 'import { registerCoverageHooks } from "../utils/registerCoverageHooks";'
        
        if insert_pos == 0:
            # No imports found, insert after first line (for shebang/typescript directives)
            lines.insert(0, import_line)
        else:
            lines.insert(insert_pos, import_line)
        
        content = "\n".join(lines)

    # Add call after imports but before test definitions
    if not has_call:
        lines = content.splitlines()
        # Find position after imports but before test declarations
        insert_pos = 0
        test_found = False
        
        for i, line in enumerate(lines):
            if line.strip().startswith("import "):
                continue
            elif line.strip().startswith("registerCoverageHooks()"):
                # Already has the call
                break
            elif line.strip().startswith("test.") or line.strip().startswith("test."):
                test_found = True
                insert_pos = i
                break
            elif "describe" in line and ("test" in line.lower() or "Test" in line):
                test_found = True
                insert_pos = i
                break
            else:
                # Found a non-import line that's not a test declaration
                insert_pos = i
                break

        if insert_pos == 0:
            # If no test found, insert at end of imports
            for i, line in enumerate(lines):
                if line.strip().startswith("import ") or 'registerCoverageHooks' in line:
                    insert_pos = i + 1
                elif line.strip() and not line.strip().startswith("import ") and not line.strip().startswith("//"):
                    break

        call_line = "registerCoverageHooks();"
        if insert_pos == len(lines):
            lines.append(call_line)
        else:
            lines.insert(insert_pos, call_line)

        content = "\n".join(lines)

    # Write the updated content back to the file
    try:
        spec_file.write_text(content, encoding="utf-8")
        print(f"Updated {spec_file}")
        return True
    except Exception as e:
        print(f"Error writing {spec_file}: {e}")
        return False

def main():
    print("Adding coverage hooks to E2E spec files...")
    
    spec_files = find_spec_files(E2E_DIR)
    success_count = 0
    
    for spec_file in spec_files:
        if add_coverage_hooks_to_file(spec_file):
            success_count += 1
    
    print(f"Updated {success_count} of {len(spec_files)} spec files")
    
if __name__ == "__main__":
    main()