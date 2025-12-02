import json
with open('/workspace/client/package.json', 'r') as f:
    package = json.load(f)
package['scripts']['coverage:cleanup'] = 'node scripts/cleanup-coverage.js'
with open('/workspace/client/package.json', 'w') as f:
    json.dump(package, f, indent=4)
    f.write('\n')
