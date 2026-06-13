const fs = require("fs");

const appSchemaPath = "src/schema/app-schema.ts";
let appSchemaContent = fs.readFileSync(appSchemaPath, "utf8");

// Add removeComment method to Item class in app-schema.ts
if (!appSchemaContent.includes("removeComment(commentId: string)")) {
    appSchemaContent = appSchemaContent.replace(
        /deleteComment\(commentId: string\) \{([\s\S]*?)this\._doc\.update\(this\.id, \{ comments: this\.comments \}\);([\s\S]*?)\}/,
        `deleteComment(commentId: string) {
        if (!this.comments) return;
        this.comments = this.comments.filter((c) => c.id !== commentId);
        if (this.comments.length === 0) {
            this.comments = undefined;
        }
        this._doc.update(this.id, { comments: this.comments });
    }

    removeComment(commentId: string) {
        this.deleteComment(commentId);
    }`,
    );
    fs.writeFileSync(appSchemaPath, appSchemaContent);
}

const cursorPath = "src/lib/Cursor.ts";
let cursorContent = fs.readFileSync(cursorPath, "utf8");

// Fix the typing in Cursor.ts
if (cursorContent.includes('target as import("../schema/app-schema").Item')) {
    cursorContent = cursorContent.replace(
        /target as import\("\.\.\/schema\/app-schema"\)\.Item/,
        'target as unknown as import("../schema/app-schema").Item',
    );
    cursorContent = cursorContent.replace(
        /target as import\("\.\.\/schema\/yjs-schema"\)\.Item/,
        'target as unknown as import("../schema/yjs-schema").Item',
    );
    fs.writeFileSync(cursorPath, cursorContent);
}
