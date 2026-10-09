import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Lấy chính hàm thuần đang dùng trong ứng dụng để kiểm thử không cần npm install.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const matched = source.match(/function stickyAnnotationIndex\([\s\S]*?\n}\n(?=function renderMoveAnnotation)/);
assert.ok(matched, 'Phải có hàm chọn nhãn giữ nguyên theo lượt người chơi');
const stickyAnnotationIndex = vm.runInNewContext(`(${matched[0].trim()})`);

const w = (grade) => ({ color: 'w', grade, status: 'done' });
const b = (grade) => ({ color: 'b', grade, status: 'done' });

test('Người chơi Trắng: giữ đánh giá của người qua lượt Bot', () => {
  const reviews = [w('brilliant'), b('best')];
  assert.equal(stickyAnnotationIndex(reviews, 'w'), 0);
  reviews.push(w('mistake'));
  assert.equal(stickyAnnotationIndex(reviews, 'w'), 2);
  reviews.push(b('blunder'));
  assert.equal(stickyAnnotationIndex(reviews, 'w'), 2);
});

test('Người chơi Đen: khi Bot mở màn hiển thị nước Bot, sau đó giữ nước của người', () => {
  const reviews = [w('good')];
  assert.equal(stickyAnnotationIndex(reviews, 'b'), 0);
  reviews.push(b('great'), w('best'));
  assert.equal(stickyAnnotationIndex(reviews, 'b'), 1);
});

test('Tua lịch sử chọn đúng nước trong lịch sử, không cố định vào nước của người', () => {
  const reviews = [w('good'), b('mistake'), w('brilliant')];
  assert.equal(stickyAnnotationIndex(reviews, 'w', 2), 1);
  assert.equal(stickyAnnotationIndex(reviews, 'w', 0), -1);
  assert.equal(stickyAnnotationIndex(reviews, 'w', 3), 2);
});

test('Chưa có nước đi hoặc đã hoàn tác: không giữ nhãn cũ', () => {
  assert.equal(stickyAnnotationIndex([], 'w'), -1);
  assert.equal(stickyAnnotationIndex([w('good')], 'w'), 0);
});
