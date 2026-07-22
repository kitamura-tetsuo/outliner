import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('ENV-* Production Build Security Guard', () => {
    it('ensures test-only escape hatches do not leak into the production bundle', () => {
        // Try both client/build and ../build to find the output directory
        let buildDir = path.resolve(__dirname, '../../../build'); // if running from client/src/tests
        if (!fs.existsSync(buildDir)) {
            buildDir = path.resolve(__dirname, '../../build');
        }

        if (!fs.existsSync(buildDir)) {
            console.warn(`Build directory not found at ${buildDir}. Skipping bundle check. Run 'npm run build' first.`);
            return;
        }

        const forbiddenStrings = [
            { pattern: 'alg:"none"', readable: 'alg:none mock token generator' },
            { pattern: 'alg: "none"', readable: 'alg:none mock token generator' },
            { pattern: '127.0.0.1:57070', readable: 'Localhost Firebase function URL' },
            { pattern: 'localhost:57070', readable: 'Localhost Firebase function URL' },
            { pattern: 'localhost:57000', readable: 'Localhost Firebase hosting URL' },
        ];

        function findJsFiles(dir, fileList = []) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    findJsFiles(filePath, fileList);
                } else if (filePath.endsWith('.js')) {
                    fileList.push(filePath);
                }
            }
            return fileList;
        }

        const jsFiles = findJsFiles(buildDir);
        expect(jsFiles.length).toBeGreaterThan(0); // Ensure we actually found files

        let leaks = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            for (const rule of forbiddenStrings) {
                if (content.includes(rule.pattern)) {
                    leaks.push(`Found prohibited string "${rule.pattern}" (${rule.readable}) in production bundle: ${path.relative(process.cwd(), file)}`);
                }
            }
        }

        expect(leaks).toEqual([]);
    });
});
