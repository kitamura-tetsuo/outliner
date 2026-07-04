import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    if 'import admin from "firebase-admin";' in content:
        new_imports = []
        if re.search(r'admin\.firestore', content):
            if 'admin.firestore.Firestore' in content:
                new_imports.append('import { getFirestore, Firestore } from "firebase-admin/firestore";')
                content = content.replace('admin.firestore.Firestore', 'Firestore')
            else:
                new_imports.append('import { getFirestore } from "firebase-admin/firestore";')
            content = re.sub(r'admin\.firestore\(\)', 'getFirestore()', content)

        if re.search(r'admin\.auth', content):
            if 'admin.auth.DecodedIdToken' in content:
                new_imports.append('import { getAuth, DecodedIdToken } from "firebase-admin/auth";')
                content = content.replace('admin.auth.DecodedIdToken', 'DecodedIdToken')
            else:
                new_imports.append('import { getAuth } from "firebase-admin/auth";')
            content = re.sub(r'admin\.auth\(\)', 'getAuth()', content)
            content = re.sub(r'admin\.auth', 'getAuth', content)

        if re.search(r'admin\.storage', content):
            new_imports.append('import { getStorage } from "firebase-admin/storage";')
            content = re.sub(r'admin\.storage\(\)', 'getStorage()', content)

        app_imports = []
        if re.search(r'admin\.apps', content):
            app_imports.append('getApps')
            content = re.sub(r'admin\.apps', 'getApps()', content)

        if re.search(r'admin\.app\(\)', content):
            app_imports.append('getApp')
            content = re.sub(r'admin\.app\(\)', 'getApp()', content)

        if re.search(r'admin\.initializeApp', content):
            app_imports.append('initializeApp')
            content = re.sub(r'admin\.initializeApp', 'initializeApp', content)

        if re.search(r'admin\.credential\.cert', content):
            app_imports.append('cert')
            content = re.sub(r'admin\.credential\.cert', 'cert', content)

        if 'admin.ServiceAccount' in content:
            app_imports.append('ServiceAccount')
            content = content.replace('admin.ServiceAccount', 'ServiceAccount')

        if app_imports:
            new_imports.append(f'import {{ {", ".join(set(app_imports))} }} from "firebase-admin/app";')

        content = content.replace('import admin from "firebase-admin";\n', '\n'.join(new_imports) + '\n')

    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('server/src'):
    for file in files:
        if file.endswith('.ts'):
            process_file(os.path.join(root, file))

for root, _, files in os.walk('server/tests'):
    for file in files:
        if file.endswith('.test.ts') or file.endswith('-helper.ts'):
            process_file(os.path.join(root, file))
