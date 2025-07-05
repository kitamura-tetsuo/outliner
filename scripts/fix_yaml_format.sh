#!/bin/bash

# Fix YAML formatting issues before dprint runs
find docs -name "*.yaml" -type f -exec sed -i 's/^--\s\+/  - /g' {} \;

# Run dprint format
npx dprint fmt

# Fix YAML formatting issues after dprint runs (in case dprint changes them back)
find docs -name "*.yaml" -type f -exec sed -i 's/^--\s\+/  - /g' {} \;
