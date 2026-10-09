import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('Giao diện có nút fullscreen dễ truy cập', () => {
  assert.match(html, /id="btn-fullscreen"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /Toàn màn hình/);
});
test('Bật tắt bằng Fullscreen API và phản ánh trạng thái khi nhấn Esc', () => {
  assert.match(code, /document\.documentElement\.requestFullscreen\(\)/);
  assert.match(code, /document\.exitFullscreen\(\)/);
  assert.match(code, /addEventListener\('fullscreenchange', syncFullscreenButton\)/);
  assert.match(code, /addEventListener\('click', toggleFullscreen\)/);
});
test('CSS ưu tiên bố cục rộng màn hình và màn hình hẹp', () => {
  assert.match(css, /\.chesslab-fullscreen \.workspace/);
  assert.match(css, /100dvh/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
test('Giữ phân tích đánh dấu quân đến nước mới của người chơi', () => {
  assert.match(code, /stickyAnnotationIndex\(moveReviews, playerColor, viewPly\)/);
  assert.match(code, /renderMoveAnnotation\(\)/);
});
