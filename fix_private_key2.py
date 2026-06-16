import re

with open('server/tests/firebase-init.test.ts', 'r') as f:
    content = f.read()

# Make it completely inline to avoid scope issues
setup_env2 = """
        const crypto = require('crypto');
        const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
        const validKey = privateKey.replace(/\\n/g, "\\\\n");
        process.env.FIREBASE_PROJECT_ID = "test-project-id";
        process.env.FIREBASE_PRIVATE_KEY = validKey;
        process.env.FIREBASE_CLIENT_EMAIL = "test@example.com";
"""
content = re.sub(r'const { privateKey } = crypto.generateKeyPairSync.*?\n        validKey = privateKey;\n\n        // Provide dummy env vars so getServiceAccount\(\) and cert\(\) do not fail\n        process\.env\.FIREBASE_PROJECT_ID = "test-project-id";\n        process\.env\.FIREBASE_PRIVATE_KEY = validKey;\n        process\.env\.FIREBASE_CLIENT_EMAIL = "test@example\.com";', setup_env2.strip(), content, flags=re.DOTALL)

with open('server/tests/firebase-init.test.ts', 'w') as f:
    f.write(content)
