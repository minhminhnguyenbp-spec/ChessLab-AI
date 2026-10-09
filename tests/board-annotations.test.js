import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('SVG có mũi tên và huy hiệu phân tích trên quân cờ', () => {
  for (const id of ['review-arrow','review-arrowhead','review-arrowhead-path',
      'review-badge','review-badge-circle','review-badge-text','review-badge-title']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
test('Mỗi hạng nước có một huy hiệu, và phân tích xong cập nhật bàn cờ', () => {
  for (const grade of ['brilliant','best','great','good','inaccuracy','mistake','blunder']) {
    assert.match(main, new RegExp(`\\b${grade}:\\s*\\{`));
  }
  assert.match(main, /renderMoveAnnotation\(\);/);
  assert.match(main, /renderAnalysis\(\); renderHistory\(\); renderBoard\(\);/);
  assert.match(main, /stickyAnnotationIndex\(moveReviews, playerColor, viewPly\)/);
});
