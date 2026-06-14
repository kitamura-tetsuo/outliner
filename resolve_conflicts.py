import sys
import os
import re

def resolve_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    if '<<<<<<< HEAD' not in content:
        print(f"No conflict markers found in {file_path}")
        return

    lines = content.splitlines()
    new_lines = []
    i = 0
    conflicts_resolved = 0
    while i < len(lines):
        if lines[i].startswith('<<<<<<< HEAD'):
            head_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith('======='):
                head_lines.append(lines[i])
                i += 1
            i += 1 # skip =======
            main_lines = []
            while i < len(lines) and not lines[i].startswith('>>>>>>>'):
                main_lines.append(lines[i])
                i += 1
            i += 1 # skip >>>>>>>
            
            head_str = '\n'.join(head_lines).strip()
            main_str = '\n'.join(main_lines).strip()
            
            # Normalize for comparison: replace window with globalThis and strip whitespace
            head_norm = head_str.replace('globalThis', 'placeholder').replace(' ', '').replace('\n', '')
            main_norm = main_str.replace('window', 'placeholder').replace(' ', '').replace('\n', '')
            
            if head_norm == main_norm:
                # They are effectively the same, pick HEAD (which has globalThis)
                new_lines.extend(head_lines)
                conflicts_resolved += 1
            else:
                # They are different. 
                # If main has window and HEAD has globalThis, but other things changed too.
                # Instruction: "If main ... has new logic ... preserve that logic but update any window references in it to globalThis."
                # As a heuristic, if main is longer or seems to have more "substance", we might want to merge or pick main.
                # But the PR is about refactoring TO globalThis.
                
                # If head_str is empty but main_str is not, main added something.
                if not head_str and main_str:
                    new_lines.extend([l.replace('window', 'globalThis') for l in main_lines])
                    conflicts_resolved += 1
                # If main_str is empty but head_str is not, HEAD added something.
                elif head_str and not main_str:
                    new_lines.extend(head_lines)
                    conflicts_resolved += 1
                else:
                    # Both have content and they are different.
                    # Use HEAD but print a warning for manual check if it's very different.
                    # Or just follow "Prefer newer code (globalThis) over older code (window)".
                    # "If main has new logic ... preserve that logic but update window to globalThis".
                    
                    # Let's try to see if main has everything HEAD has plus more.
                    if head_str.replace('globalThis', 'window') in main_str:
                        # main seems to have more logic/context, use main but replace window
                        new_lines.extend([l.replace('window', 'globalThis') for l in main_lines])
                        conflicts_resolved += 1
                    else:
                        # Fallback: prefer HEAD as it's the PR branch's intended state
                        # but replace window in main just in case we want to merge them? 
                        # No, just pick one. 
                        # User said: "Preferring the newer code (the changes from the PR branch, which use globalThis) over the older code (from main, which use window)."
                        new_lines.extend(head_lines)
                        conflicts_resolved += 1
                        if head_norm != main_norm:
                            print(f"Warning: Complex conflict in {file_path}. Picked HEAD.")
        else:
            new_lines.append(lines[i])
            i += 1
            
    with open(file_path, 'w') as f:
        f.write('\n'.join(new_lines) + ('\n' if content.endswith('\n') else ''))
    
    print(f"Resolved {conflicts_resolved} conflicts in {file_path}")

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        resolve_file(arg)
