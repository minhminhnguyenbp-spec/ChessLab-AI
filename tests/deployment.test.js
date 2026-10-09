import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('Vite dung duong dan tuong doi de host trong subdirectory', () => {
  assert.match(read('../vite.config.js'), /base:\s*['"]\.\/['"]/);
});
test('Stockfish worker dung public base, khong absolute root', () => {
  const engine = read('../src/engine.js');
  assert.match(engine, /import\.meta\.env\.BASE_URL/);
  assert.doesNotMatch(engine, /const ENGINE_URL = ['"]\/engine\//);
});
test('GitHub workflow build Vite, copy engine, and deploy dist', () => {
  const yaml = read('../.github/workflows/deploy.yml');
  assert.match(yaml, /npm install/);
  assert.match(yaml, /npm run build/);
  assert.match(yaml, /actions\/deploy-pages@v4/);
  assert.match(yaml, /path: \.\/dist/);
});
