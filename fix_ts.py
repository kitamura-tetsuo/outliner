import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Let's match more carefully
    # Use re.DOTALL so . matches newlines
    pattern = r'\(window as Window & typeof globalThis & \{.*?\}\)\.'
    new_content = re.sub(pattern, 'window.', content, flags=re.DOTALL)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Fixed {filepath}")
    else:
        print(f"No changes in {filepath}")

fix_file('client/src/stores/EditorOverlayStore.svelte.ts')
