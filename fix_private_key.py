import re

with open('server/tests/firebase-init.test.ts', 'r') as f:
    content = f.read()

# Make sure privateKey is declared before it's assigned inside the describe block
# Right now it says "const { privateKey } = ..." or it accesses it before init
content = content.replace("privateKey = crypto.generateKeyPairSync", "let privateKey = crypto.generateKeyPairSync")
# Remove any duplicate declarations or let
content = re.sub(r'let privateKey: string;\s*', '', content)

with open('server/tests/firebase-init.test.ts', 'w') as f:
    f.write(content)
