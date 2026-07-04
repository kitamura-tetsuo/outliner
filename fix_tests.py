import re

with open('server/tests/firebase-init.test.ts', 'r') as f:
    content = f.read()

content = content.replace("const crypto = require('crypto');", "")
content = "import crypto from 'crypto';\n" + content

with open('server/tests/firebase-init.test.ts', 'w') as f:
    f.write(content)
