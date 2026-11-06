import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync('public/index.html','utf8');
assert(html.includes('등짝 스매싱'));
assert(!html.includes('\uFFFD'),'HTML must not contain replacement characters');
for(const file of ['public/app.js','public/game.js','public/style.css','src/worker.js','migrations/0001_rankings.sql'])assert(existsSync(file),`Missing ${file}`);
for(const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"#]+)"/g))assert(existsSync('public'+match[1].split('?')[0]),`Missing asset ${match[1]}`);
assert(!html.includes('data:text/javascript'));
console.log('Asset and Korean encoding checks passed.');
