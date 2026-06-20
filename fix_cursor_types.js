const fs = require('fs');

const path = 'client/src/lib/cursor/CursorSelection.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const currentLineIndex = getCurrentLineIndex\(text, this\.cursor\.offset\);/g, 'const currentLineIndex = getCurrentLineIndex(text.toString(), this.cursor.offset);');
content = content.replace(/this\.cursor\.offset = getLineStartOffset\(text, currentLineIndex\);/g, 'this.cursor.offset = getLineStartOffset(text.toString(), currentLineIndex);');
content = content.replace(/this\.cursor\.offset = getLineEndOffset\(text, currentLineIndex\);/g, 'this.cursor.offset = getLineEndOffset(text.toString(), currentLineIndex);');
content = content.replace(/const lineStartOffset = getLineStartOffset\(text, currentLineIndex\);/g, 'const lineStartOffset = getLineStartOffset(text.toString(), currentLineIndex);');
content = content.replace(/const lineEndOffset = getLineEndOffset\(text, currentLineIndex\);/g, 'const lineEndOffset = getLineEndOffset(text.toString(), currentLineIndex);');

fs.writeFileSync(path, content);
