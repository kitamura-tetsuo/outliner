import re

with open('server/src/firebase-init.ts', 'r') as f:
    content = f.read()

content = content.replace('import { getApp, getApps, cert, initializeApp, deleteApp, deleteApp } from "firebase-admin/app";', 'import { getApp, getApps, cert, initializeApp, deleteApp } from "firebase-admin/app";')
content = content.replace('import { getApp, getApps, cert, initializeApp, deleteApp } , deleteApp } from "firebase-admin/app";', 'import { getApp, getApps, cert, initializeApp, deleteApp } from "firebase-admin/app";')

with open('server/src/firebase-init.ts', 'w') as f:
    f.write(content)
