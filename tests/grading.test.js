import test from 'node:test';
import assert from 'node:assert/strict';
import { sacrificeEvidence, moveGrade } from '../src/grading.js';

const rookOffer = {
  // Xe e3-e4 có thể bị tốt đen d5xe4, không bắt lại ngay được.
  before: '6k1/8/8/3p4/8/4R3/8/6K1 w - - 0 1',
  uci: 'e3e4', san: 'Re4', color: 'w'
};
function score(move, whiteScore, depth = 16) { return { move, whiteScore, info: { depth } }; }

test('Nước gần tối ưu hy sinh xe không bắt lại ngay: Thiên tài', () => {
  assert.ok(sacrificeEvidence(rookOffer));
  const grade = moveGrade(rookOffer, score('e3e4', 50), score('d5e4', 45));
  assert.equal(grade.grade, 'brilliant');
  assert.equal(grade.symbol, '!!');
});

test('Nước đi tốt nhất bình thường không bị gọi nhầm Thiên tài', () => {
  const r = { ...rookOffer, uci: 'e3e2', san: 'Re2' };
  assert.equal(sacrificeEvidence(r), null);
  assert.equal(moveGrade(r, score('e3e2', 10), score('d5d4', 10)).grade, 'best');
});

test('Nước hy sinh quân nhưng mất nhiều CP: không phải Thiên tài', () => {
  const grade = moveGrade(rookOffer, score('g1g2', 100), score('d5e4', -130));
  assert.equal(grade.grade, 'mistake');
});

test('Nước có thể bắt lại quân ngay: không tính là hy sinh rõ ràng', () => {
  const defended = { ...rookOffer, before: '6k1/8/8/3p4/8/3PR3/8/6K1 w - - 0 1' };
  assert.equal(sacrificeEvidence(defended), null);
  assert.equal(moveGrade(defended, score('e3e4', 50), score('d5e4', 45)).grade, 'best');
});

test('Độ sâu thấp hoặc thế thua nặng không cho nhãn Thiên tài', () => {
  assert.equal(moveGrade(rookOffer, score('e3e4', 0, 5), score('d5e4', 0, 5)).grade, 'best');
  assert.equal(moveGrade(rookOffer, score('e3e4', -400), score('d5e4', -400)).grade, 'best');
});
