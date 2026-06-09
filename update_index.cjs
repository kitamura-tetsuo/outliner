const fs = require('fs');

const content = fs.readFileSync('functions/index.js', 'utf-8');

const updated = content.replace(
  '  admin.initializeApp(config);',
  '  try {\n    admin.initializeApp(config);\n  } catch (e) {\n    // catch error when initializing more than once\n  }'
);

fs.writeFileSync('functions/index.js', updated);
