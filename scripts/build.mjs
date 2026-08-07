import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'styles'), { recursive: true });
const result = spawnSync('tsc', ['-p', path.join(root, 'tsconfig.json')], { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'styles'), path.join(dist, 'styles'), { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
const indexPath = path.join(dist, 'index.html');
const index = await readFile(indexPath, 'utf8');
await writeFile(indexPath, index.replace('</body>', '<!-- build: local-first dependency-free TypeScript -->\n</body>'));
console.log('Build complete:', dist);
