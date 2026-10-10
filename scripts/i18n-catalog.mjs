import ts from 'typescript';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const catalogPath = 'lib/i18n/messages/zh-CN.json';
const existing = JSON.parse(readFileSync(catalogPath, 'utf8'));
const keys = new Set();
function scanDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (file !== path.join('lib', 'i18n')) scanDirectory(file); continue; }
    if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        const argument = ['t','tr'].includes(name) ? node.arguments[0] : name === 'messageForLocale' ? node.arguments[1] : null;
        if (argument && ts.isStringLiteral(argument)) keys.add(argument.text);
      }
      // Domain constants and validation messages also appear in translated UI.
      if ((file === path.join('lib','domain.ts') || file === path.join('lib','item-details.ts') || file === path.join('lib','personal-sizes.ts') || file === path.join('lib','subsets.ts') || file.startsWith(path.join('app','api')) || file === path.join('lib','server.ts') || file === path.join('lib','local-auth.ts')) && ts.isStringLiteral(node) && /[\u3400-\u9fff]/.test(node.text)) keys.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const directory of ['app','components','lib']) scanDirectory(directory);
const ordered = [...keys].sort((a,b) => a.localeCompare(b));
const next = Object.fromEntries(ordered.map(key => [key, existing[key] || key]));
writeFileSync(catalogPath, JSON.stringify(next, null, 2) + '\n');
writeFileSync('lib/i18n/messages/locale.template.json', JSON.stringify(Object.fromEntries(ordered.map(key => [key,''])), null, 2) + '\n');
console.log(`Updated ${keys.size} source messages; native locale files were not modified.`);
