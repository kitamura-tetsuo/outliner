import re

file_path = '/workspace/client/src/lib/Cursor.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Pattern 1: function(args// -> function(args);
content = re.sub(r'(\w+\([^/]*?)//', r'\1);', content)

# Pattern 2: (// -> ();
content = re.sub(r'\((//)', r'();', content)

# Pattern 3: {...// -> {...}
# (But often it is store.setSelection({...}// -> store.setSelection({...})
content = re.sub(r'(\{[^/]*?)\}//', r'\1})', content)
content = re.sub(r'(\{[^/]*?)\}//', r'\1})', content) # Repeat for nested? No, let's be more specific.

# Let's do some manual-ish replacements for known patterns to be safe
replacements = [
    ('return getSelectionForUser(this.userId//', 'return getSelectionForUser(this.userId);'),
    ('return storeHasSelection(this.userId//', 'return storeHasSelection(this.userId);'),
    ('const selection = this.getSelection(//', 'const selection = this.getSelection();'),
    ('this.editor = new CursorEditor(this//', 'this.editor = new CursorEditor(this);'),
    ('const p = pages.at(i//', 'const p = pages.at(i);'),
    ('String(raw//', 'String(raw);'),
    ('offset=${this.offset}`,//', 'offset=${this.offset}`,);'), # Wait, console.log(...,);
    ('this.userId,//', 'this.userId,'), # Inside object
    ('userId: this.userId,//', 'userId: this.userId,'),
    ('this.itemId//', 'this.itemId);'), # store.setActiveItem(this.itemId//
    ('textarea.focus(//', 'textarea.focus();'),
    ('setTimeout(() => {//', 'setTimeout(() => {'),
    ('}, 10//', '}, 10);'),
    ('this.applyToStore(//', 'this.applyToStore();'),
    ('store.startCursorBlink(//', 'store.startCursorBlink();'),
    ('this.navigateToItem("left"//', 'this.navigateToItem("left");'),
    ('this.navigateToItem("right"//', 'this.navigateToItem("right");'),
    ('this.navigateToItem("up"//', 'this.navigateToItem("up");'),
    ('this.navigateToItem("down"//', 'this.navigateToItem("down");'),
    ('currentTarget as unknown as import("../schema/app-schema").Item//', 'currentTarget as unknown as import("../schema/app-schema").Item);'),
    ('getVisualLineInfo(this.itemId, this.offset//', 'getVisualLineInfo(this.itemId, this.offset);'),
    ('visualLineInfo//', 'visualLineInfo);'), # console.log(..., visualLineInfo//
    ('currentLineIndex - 1//', 'currentLineIndex - 1);'),
    ('this.itemId, lineIndex - 1//', 'this.itemId, lineIndex - 1);'),
    ('targetColumn, prevLineLength//', 'targetColumn, prevLineLength);'),
    ('findPreviousItem(this.itemId//', 'findPreviousItem(this.itemId);'),
    ('findNextItem(this.itemId//', 'findNextItem(this.itemId);'),
    ('text.split("\\n"//', 'text.split("\\n");'),
    ('currentLineIndex + 1//', 'currentLineIndex + 1);'),
    ('this.itemId, lineIndex + 1//', 'this.itemId, lineIndex + 1);'),
    ('this.resetInitialColumn(//', 'this.resetInitialColumn();'),
    ('this.editor.insertText(ch//', 'this.editor.insertText(ch);'),
    ('this.editor.deleteBackward(//', 'this.editor.deleteBackward();'),
    ('this.editor.deleteForward(//', 'this.editor.deleteForward();'),
    ('this.editor.deleteMultiItemSelection(selection//', 'this.editor.deleteMultiItemSelection(selection);'),
    ('this.editor.insertLineBreak(//', 'this.editor.insertLineBreak();'),
    ('this.editor.insertItemBelow(//', 'this.editor.insertItemBelow();'),
    ('this.editor.onInput(event//', 'this.editor.onInput(event);'),
    ('event.shiftKey)//', 'event.shiftKey)'),
    ('this.selectAll(//', 'this.selectAll();'),
    ('this.copySelectedText(//', 'this.copySelectedText();'),
    ('this.cutSelectedText(//', 'this.cutSelectedText();'),
    ('this.outdent(//', 'this.outdent();'),
    ('this.indent(//', 'this.indent();'),
    ('this.moveItemUp(//', 'this.moveItemUp();'),
    ('this.moveItemDown(//', 'this.moveItemDown();'),
    ('this.moveToDocumentStart(//', 'this.moveToDocumentStart();'),
    ('this.moveToDocumentEnd(//', 'this.moveToDocumentEnd();'),
    ('this.pageUp(//', 'this.pageUp();'),
    ('this.pageDown(//', 'this.pageDown();'),
    ('this.jumpToMatchingBracket(//', 'this.jumpToMatchingBracket();'),
    ('this.moveSubtreeUp(//', 'this.moveSubtreeUp();'),
    ('this.moveSubtreeDown(//', 'this.moveSubtreeDown();'),
    ('this.extendSelectionLeft(//', 'this.extendSelectionLeft();'),
    ('this.extendSelectionRight(//', 'this.extendSelectionRight();'),
    ('this.extendSelectionUp(//', 'this.extendSelectionUp();'),
    ('this.extendSelectionDown(//', 'this.extendSelectionDown();'),
    ('this.extendSelectionToLineStart(//', 'this.extendSelectionToLineStart();'),
    ('this.extendSelectionToLineEnd(//', 'this.extendSelectionToLineEnd();'),
    ('this.clearSelection(//', 'this.clearSelection();'),
    ('this.moveLeft(//', 'this.moveLeft();'),
    ('this.moveRight(//', 'this.moveRight();'),
    ('this.moveUp(//', 'this.moveUp();'),
    ('this.moveDown(//', 'this.moveDown();'),
    ('this.moveToLineStart(//', 'this.moveToLineStart();'),
    ('this.moveToLineEnd(//', 'this.moveToLineEnd();'),
    ('this.deleteSelection(//', 'this.deleteSelection();'),
    ('this.editor.deleteSelection(//', 'this.editor.deleteSelection();'),
    ('this.editor.copySelectedText(//', 'this.editor.copySelectedText();'),
    ('this.editor.cutSelectedText(//', 'this.editor.cutSelectedText();'),
    ('this.collectAllItemIds(root, []//', 'this.collectAllItemIds(root, []);'),
    ('allItemIds.indexOf(startItemId//', 'allItemIds.indexOf(startItemId);'),
    ('allItemIds.indexOf(endItemId//', 'allItemIds.indexOf(endItemId);'),
    ('this.userId//', 'this.userId);'), # store.clearSelectionForUser(this.userId//
    ('comparison & Node.DOCUMENT_POSITION_FOLLOWING)//', 'comparison & Node.DOCUMENT_POSITION_FOLLOWING)'),
    ('this.updateSelectionAfterMove(startItemId, startOffset//', 'this.updateSelectionAfterMove(startItemId, startOffset);'),
    ('pos - 1//', 'pos - 1);'),
    ('pos + 1//', 'pos + 1);'),
    ('pos//', 'pos);'),
    ('pos - 2//', 'pos - 2);'),
    ('pages.at(0//', 'pages.at(0);'),
    ('window.scrollBy(0, -100//', 'window.scrollBy(0, -100);'),
    ('window.scrollBy(0, 100//', 'window.scrollBy(0, 100);'),
    ('window.scrollBy(0, -window.innerHeight//', 'window.scrollBy(0, -window.innerHeight);'),
    ('window.scrollBy(0, window.innerHeight//', 'window.scrollBy(0, window.innerHeight);'),
    ('this.getSelectionForCurrentItem(//', 'this.getSelectionForCurrentItem();'),
    ('selection.startOffset, selection.endOffset//', 'selection.startOffset, selection.endOffset);'),
    ('this.updateGlobalTextareaSelection(this.itemId, newOffset, this.itemId, newOffset//', 'this.updateGlobalTextareaSelection(this.itemId, newOffset, this.itemId, newOffset);'),
    ('getCurrentLineIndex(text, this.offset//', 'getCurrentLineIndex(text, this.offset);'),
    ('getLineStartOffset(text, currentLineIndex//', 'getLineStartOffset(text, currentLineIndex);'),
    ('getLineEndOffset(text, currentLineIndex//', 'getLineEndOffset(text, currentLineIndex);'),
    ('oldItemId//', 'oldItemId);'), # store.clearCursorForItem(oldItemId//
    ('this.cursorId//', 'this.cursorId);'),
    ('this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset//', 'this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);'),
    ('textarea.setSelectionRange(startOffset, endOffset//', 'textarea.setSelectionRange(startOffset, endOffset);'),
    ('textarea.setSelectionRange(selectionStart, selectionEnd//', 'textarea.setSelectionRange(selectionStart, selectionEnd);'),
    ('textarea.setSelectionRange(selectionEnd, selectionStart, "backward"//', 'textarea.setSelectionRange(selectionEnd, selectionStart, "backward");'),
    ('this.editor.formatBold(//', 'this.editor.formatBold();'),
    ('this.editor.formatItalic(//', 'this.editor.formatItalic();'),
    ('this.editor.formatUnderline(//', 'this.editor.formatUnderline();'),
    ('this.editor.formatStrikethrough(//', 'this.editor.formatStrikethrough();'),
    ('this.editor.formatCode(//', 'this.editor.formatCode();'),
    ('this.itemId, text.length//', 'this.itemId, text.length);'),
    ('items.at(i//', 'items.at(i);'),
    ('node.id//', 'ids.push(node.id);'), # wait, this.push(node.id//
    ('ids.push(node.id//', 'ids.push(node.id);'),
    ('this.collectAllItemIds(child, ids//', 'this.collectAllItemIds(child, ids);'),
    ('this.collectAllItemIds(root, []//', 'this.collectAllItemIds(root, []);'),
]

for old, new in replacements:
    content = content.replace(old, new)

# Fix the store.setSelection object endings
content = re.sub(r'isReversed,\n\s+\}//', r'isReversed,\n        });', content)

# Fix the remaining object endings with //
content = re.sub(r'\}\s*//', r'});', content)

# Fix the broken prevItem constructor around line 1730
broken_prev_item = """                    prevItem = new (currentTarget!.constructor as any)
                        //

                        //
                        //
                        //
                    //"""

fixed_prev_item = """                    prevItem = new (currentTarget!.constructor as unknown as {
                        new (...args: unknown[]): import("../schema/yjs-schema").Item;
                    })(
                        currentTarget!.ydoc,
                        currentTarget!.tree,
                        parentCollection.parentKey,
                    );"""

content = content.replace(broken_prev_item, fixed_prev_item)

# Also fix the parentItemInstance one around 380
# Current:
# parentItemInstance = new (currentTarget!.constructor as any)(currentTarget!.ydoc, currentTarget!.tree, parentCollection.parentKey);
#                     //
#
#                     //
#                     //
#                     //
#                 //
#
# We should probably change (currentTarget!.constructor as any) to the full type if possible,
# but at least clean up the // lines.

parent_instance_pattern = r'parentItemInstance = new \(currentTarget!\.constructor as any\)\(currentTarget!\.ydoc, currentTarget!\.tree, parentCollection\.parentKey\);\n\s+//\n\n\s+//\n\s+//\n\s+//\n\s+//'
parent_instance_fixed = r'parentItemInstance = new (currentTarget!.constructor as unknown as {\n                        new (...args: unknown[]): import("../schema/yjs-schema").Item;\n                    })(\n                        currentTarget!.ydoc,\n                        currentTarget!.tree,\n                        parentCollection.parentKey,\n                    );'

# Wait, let's just do a simpler replacement for that one too.
old_parent = """                parentItemInstance = new (currentTarget!.constructor as any)(currentTarget!.ydoc, currentTarget!.tree, parentCollection.parentKey);
                    //

                    //
                    //
                    //
                //"""

new_parent = """                parentItemInstance = new (currentTarget!.constructor as unknown as {
                    new (...args: unknown[]): import("../schema/yjs-schema").Item;
                })(
                    currentTarget!.ydoc,
                    currentTarget!.tree,
                    parentCollection.parentKey,
                );"""

content = content.replace(old_parent, new_parent)

# Finally, some cleanup of lines that just have //
content = re.sub(r'^\s+//\s*$', '', content, flags=re.MULTILINE)

with open(file_path, 'w') as f:
    f.write(content)
