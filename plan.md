1. **Remove newlines in `link-preview-wrapper` HTML generation in `ScrapboxFormatter.ts`**
   - Lines 385-387:
     ```javascript
     html += `<span class="link-preview-wrapper"><a href="/${escapedNormalized}" class="internal-link project-link ${existsClassTokens}" data-project="${escapedProjectName}" data-page="${escapedPageName}">${escapedNormalized}</a></span>`;
     ```
   - Lines 395-397:
     ```javascript
     html += `<span class="link-preview-wrapper"><a href="${projectPrefix}/${content}" class="internal-link ${existsClass}" data-page="${content}">${content}</a></span>`;
     ```
   - Lines 608-614:
     ```javascript
     html = `<span class="link-preview-wrapper"><a href="/${this.escapeHtml(path)}" class="internal-link project-link ${existsClass}" data-project="${this.escapeHtml(projectName)}" data-page="${this.escapeHtml(pageName)}">${this.escapeHtml(path)}</a></span>`;
     ```
   - Lines 618-622:
     ```javascript
     html = `<span class="link-preview-wrapper"><a href="/${this.escapeHtml(path)}" class="internal-link ${existsClass}" data-page="${this.escapeHtml(path)}">${this.escapeHtml(path)}</a></span>`;
     ```
   - Lines 677-683:
     ```javascript
     const html = `<span class="link-preview-wrapper"><a href="${projectPrefix}/${this.escapeHtml(text)}" class="internal-link ${existsClass}" data-page="${this.escapeHtml(text)}">${this.escapeHtml(text)}</a></span>`;
     ```
2. **Add a test case in `ScrapboxFormatter.test.ts`**
   - Assert that no `\n` characters are present in the generated link HTML when using `ScrapboxFormatter.formatToHtml("[Internal Link]")`.
3. **Run tests to verify changes**
   - Run `npm run test:unit` in the client directory.
4. **Complete pre-commit steps**
   - Call `pre_commit_instructions` and follow the instructions to complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit changes**
