#!/bin/bash

# Script to move the import of registerAfterEachSnapshot to the top in all e2e test files

set -e

cd "$(dirname "$0")/.."

# Find all .spec.ts files in the e2e directory
find e2e -name "*.spec.ts" | while read -r file; do
    # Check if the import of registerAfterEachSnapshot is included
    if grep -q "registerAfterEachSnapshot" "$file"; then
        echo "Processing: $file"
        
        # Create a temporary file
        temp_file=$(mktemp)
        
        # Extract the import line of registerAfterEachSnapshot
        import_line=$(grep "registerAfterEachSnapshot" "$file" | head -1)
        
        # Remove the import line of registerAfterEachSnapshot
        grep -v "registerAfterEachSnapshot" "$file" > "$temp_file"
        
        # Create a new file: Add the import line to the top
        {
            echo "$import_line"
            cat "$temp_file"
        } > "$file"
        
        rm "$temp_file"
        echo "  ✓ Moved import to top"
    fi
done

echo ""
echo "✓ All files processed"

