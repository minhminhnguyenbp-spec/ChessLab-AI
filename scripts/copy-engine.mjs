import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const source = join(process.cwd(), 'node_modules', 'stockfish', 'bin');
const dest = join(process.cwd(), 'public', 'engine');
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
mkdirSync(dest, { recursive: true });
for (const filename of files) {
  const input = join(source, filename);
  if (!existsSync(input)) {
    console.error('Khong tim thay engine: ' + input);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(input, join(dest, filename));
  console.log('Copied: ' + filename);
}
