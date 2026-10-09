import { Chess } from 'chess.js';

const PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 });

/**
 * Tìm dấu hiệu hy sinh quân thật: một quân nhẹ/xe/hậu được đưa vào ô
 * đối thủ có thể bắt hợp lệ, không có nước bắt lại ngay để đổi quân.
 * Đây là điều kiện bảo thủ, KHÔNG phải bộ phân loại Brilliant chính thức.
 */
export function sacrificeEvidence(review) {
  try {
    const game = new Chess(review.before);
    const move = game.move({ from: review.uci.slice(0, 2), to: review.uci.slice(2, 4), ...(review.uci.length > 4 ? { promotion: review.uci[4] } : {}) });
    if (!move || !['n', 'b', 'r', 'q'].includes(move.piece) || move.promotion) return null;

    const offered = PIECE_VALUE[move.piece];
    const taken = PIECE_VALUE[move.captured] || 0;
    // Không gắn 'Thiên tài' cho một đổi quân thông thường hoặc hy sinh 1 tốt.
    if (offered - taken < 2) return null;

    const opponentCaptures = game.moves({ verbose: true }).filter(m => m.to === move.to && !!m.captured);
    for (const capture of opponentCaptures) {
      const next = new Chess(game.fen());
      next.move({ from: capture.from, to: capture.to, ...(capture.promotion ? { promotion: capture.promotion } : {}) });
      // Nếu có thể bắt lại ngay, coi là trao đổi quân (không phải hy sinh rõ ràng).
      const canRecapture = next.moves({ verbose: true }).some(m => m.to === move.to && !!m.captured);
      if (!canRecapture) {
        return { sacrificed: move.piece, materialRisk: offered - taken, captureSan: capture.san };
      }
    }
  } catch (err) {
    console.warn('Không xác định được hy sinh quân:', err);
  }
  return null;
}

export function moveGrade(review, before, after) {
  const isBest = Boolean(before.move && before.move === review.uci);
  const sign = review.color === 'w' ? 1 : -1;
  const beforePoint = before.whiteScore;
  const afterPoint = after.whiteScore;
  const loss = beforePoint == null || afterPoint == null ? null : Math.max(0, Math.round(sign * (beforePoint - afterPoint)));

  // !!! Khắt khe hơn 'Tốt nhất': tốt/không mất lợi thế + hy sinh quân có chủ đích,
  // dữ liệu phân tích đạt độ sâu tối thiểu. CP chỉ là thước đo gần đúng.
  if (loss !== null && loss <= 20 && sign * afterPoint >= -250 &&
    (before.info?.depth ?? 0) >= 8 && (after.info?.depth ?? 0) >= 8) {
    const sacrifice = sacrificeEvidence(review);
    if (sacrifice) {
      const pieces = { n: 'mã', b: 'tượng', r: 'xe', q: 'hậu' };
      return {
        label: 'Thiên tài', grade: 'brilliant', symbol: '!!', loss,
        comment: `Nước ${review.san} có dấu hiệu hy sinh ${pieces[sacrifice.sacrificed]} (${sacrifice.materialRisk} điểm vật chất) nhưng vẫn giữ đánh giá gần tối ưu. Đối thủ có thể bắt bằng ${sacrifice.captureSan}. Đây là nhận diện Thiên tài ước tính, không phải nhãn chính thức của Chess.com.`
      };
    }
  }
  if (isBest) return { label: 'Tốt nhất', grade: 'best', symbol: '★', loss: 0, comment: 'Nước này trùng với lựa chọn hàng đầu của Stockfish ở độ sâu hiện tại.' };
  if (loss === null) return { label: 'Chưa đủ dữ liệu', grade: 'neutral', symbol: '…', loss: null, comment: 'Engine chưa trả về điểm đánh giá đáng tin cậy.' };
  if (loss <= 25) return { label: 'Rất tốt', grade: 'great', symbol: '✓', loss, comment: 'Chênh lệch rất nhỏ so với phương án tối ưu. Đây là lựa chọn mạnh.' };
  if (loss <= 60) return { label: 'Tốt', grade: 'good', symbol: '✓', loss, comment: 'Nước đi vẫn giữ được phần lớn lợi thế của vị trí.' };
  if (loss <= 110) return { label: 'Thiếu chính xác', grade: 'inaccuracy', symbol: '?!', loss, comment: 'Có phương án tốt hơn giúp bạn duy trì thế cờ hiệu quả hơn.' };
  if (loss <= 250) return { label: 'Sai lầm', grade: 'mistake', symbol: '?', loss, comment: 'Nước này làm giảm đáng kể đánh giá vị trí. Hãy xem nước tối ưu.' };
  return { label: 'Sai lầm nghiêm trọng', grade: 'blunder', symbol: '??', loss, comment: 'Bạn đã bỏ lỡ lợi thế lớn hoặc tạo cơ hội phản công cho đối thủ.' };
}
