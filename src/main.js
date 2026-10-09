import { Chess } from 'chess.js';
import { StockfishClient, scoreFromWhite, uciToMove } from './engine.js';
import { moveGrade } from './grading.js';
import './style.css';

const $ = id => document.getElementById(id);
const chess = new Chess();
const bot = new StockfishClient('Bot');
const analyst = new StockfishClient('Phân tích');
const PIECES = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};
const FILES = 'abcdefgh';
const startingFen = chess.fen();
let playerColor = 'w';
let facing = 'w';
let elo = 1500;
let thinkTime = 850;
let analysisTime = 600;
let selected = null;
let hinted = null;
let lastMove = null;
let moveReviews = [];
let positionScore = 0;
let gameToken = 0;
let botBusy = false;
let engineReady = false;
let analystReady = false;
let viewPly = null;
let pendingPromotion = null;
let notification = '';
const cache = new Map();

function setMessage(msg) { notification = msg; $('game-message').textContent = msg; }
function modalToggle(id, show) { $(id).classList.toggle('hidden', !show); }
function getShownChess() {
  if (viewPly === null) return chess;
  const copy = new Chess(startingFen);
  for (const san of chess.history().slice(0, viewPly)) copy.move(san);
  return copy;
}
function squareAt(row, col) {
  const file = facing === 'w' ? col : 7 - col;
  const rank = facing === 'w' ? 8 - row : row + 1;
  return `${FILES[file]}${rank}`;
}
function isLight(square) { return (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 0; }
function legalTargets() {
  if (!selected || viewPly !== null) return [];
  return chess.moves({ square: selected, verbose: true });
}
function renderBoard() {
  const shown = getShownChess();
  const legal = legalTargets();
  const last = viewPly === null ? lastMove : chess.history({ verbose: true })[viewPly - 1];
  const checkedKing = shown.isCheck() ? shown.board().flat().find(p => p?.color === shown.turn() && p.type === 'k')?.square : null;
  const fragment = document.createDocumentFragment();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = squareAt(r, c);
    const piece = shown.get(sq);
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `square ${isLight(sq) ? 'light' : 'dark'}`;
    if (last && (last.from === sq || last.to === sq)) element.classList.add('last');
    if (selected === sq) element.classList.add('selected');
    if (checkedKing === sq) element.classList.add('check');
    const legalMove = legal.find(m => m.to === sq);
    if (legalMove) element.classList.add(piece ? 'capture-square' : 'target-square');
    element.dataset.square = sq;
    element.setAttribute('aria-label', `${sq}${piece ? ' ' + (piece.color === 'w' ? 'trắng ' : 'đen ') + piece.type : ''}`);
    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece piece-${piece.color}`;
      glyph.textContent = PIECES[piece.color][piece.type];
      glyph.draggable = viewPly === null && piece.color === playerColor && chess.turn() === playerColor && !botBusy && !chess.isGameOver();
      glyph.addEventListener('dragstart', ev => {
        selected = sq;
        ev.dataTransfer.setData('text/plain', sq);
        ev.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(renderBoard);
      });
      element.appendChild(glyph);
    }
    if ((facing === 'w' ? c === 0 : c === 7)) {
      const coord = document.createElement('span');
      coord.className = 'rank-label'; coord.textContent = sq[1]; element.appendChild(coord);
    }
    if ((facing === 'w' ? r === 7 : r === 0)) {
      const coord = document.createElement('span');
      coord.className = 'file-label'; coord.textContent = sq[0]; element.appendChild(coord);
    }
    element.addEventListener('click', () => clickSquare(sq));
    element.addEventListener('dragover', e => { e.preventDefault(); });
    element.addEventListener('drop', e => { e.preventDefault(); const from = e.dataTransfer.getData('text/plain'); if (from) attemptMove(from, sq); });
    fragment.appendChild(element);
  }
  $('board').replaceChildren(fragment);
  renderArrow();
  renderMoveAnnotation();
  $('move-count').textContent = chess.history().length;
  updateTurn();
}
function clickSquare(sq) {
  if (viewPly !== null) { setMessage('Đang xem lại ván. Bấm nút ⏭ để trở về vị trí hiện tại.'); return; }
  if (!engineReady || botBusy || chess.isGameOver() || chess.turn() !== playerColor) return;
  const piece = chess.get(sq);
  if (selected) {
    if (selected === sq) { selected = null; renderBoard(); return; }
    if (piece?.color === playerColor) { selected = sq; renderBoard(); return; }
    attemptMove(selected, sq); return;
  }
  if (piece?.color === playerColor) { selected = sq; hinted = null; renderBoard(); }
}
function attemptMove(from, to, promotion) {
  if (!engineReady || chess.turn() !== playerColor || botBusy || chess.isGameOver() || viewPly !== null) return;
  const legal = chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!legal.length) { selected = null; setMessage('Nước đi không hợp lệ. Hãy chọn ô có dấu chấm.'); renderBoard(); return; }
  if (legal.some(m => m.isPromotion()) && !promotion) {
    pendingPromotion = { from, to }; openPromotion(); return;
  }
  try {
    commitMove({ from, to, ...(promotion ? { promotion } : {}) });
  } catch (e) { setMessage('Không thực hiện được nước đi.'); console.error(e); }
}
function openPromotion() {
  const options = $('promotion-options'); options.replaceChildren();
  for (const p of ['q', 'r', 'b', 'n']) {
    const button = document.createElement('button'); button.textContent = PIECES[playerColor][p];
    button.title = { q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã' }[p];
    button.addEventListener('click', () => {
      const move = pendingPromotion; pendingPromotion = null; modalToggle('promotion-modal', false);
      if (move) attemptMove(move.from, move.to, p);
    });
    options.appendChild(button);
  }
  modalToggle('promotion-modal', true);
}
function commitMove(moveObj) {
  if (chess.isGameOver()) return;
  const before = chess.fen();
  const played = chess.move(moveObj);
  if (!played) return;
  const after = chess.fen();
  lastMove = played;
  selected = null; hinted = null;
  const index = chess.history().length - 1;
  moveReviews[index] = { san: played.san, color: played.color, before, after, uci: played.from + played.to + (played.promotion || ''), status: 'loading' };
  renderAll();
  if (chess.isGameOver()) setMessage(gameOverMessage());
  else setMessage(played.color === playerColor ? `Bạn vừa đi ${played.san}. Stockfish đang tính nước đáp trả...` : `Bot vừa đi ${played.san}. Đến lượt bạn!`);
  const token = gameToken;
  // Phân tích độc lập, không chặn Bot tính nước.
  reviewMove(index, token);
  if (!chess.isGameOver() && chess.turn() !== playerColor) requestBotMove(token);
}
function gameOverMessage() {
  if (chess.isCheckmate()) return chess.turn() === playerColor ? 'Chiếu hết! Bot thắng ván này.' : 'Chiếu hết! Bạn thắng. Xuất sắc!';
  if (chess.isStalemate()) return 'Ván cờ hòa do hết nước đi hợp lệ (stalemate).';
  if (chess.isThreefoldRepetition()) return 'Ván cờ hòa do lặp lại vị trí 3 lần.';
  if (chess.isInsufficientMaterial()) return 'Ván cờ hòa do không đủ quân để chiếu hết.';
  if (chess.isDraw()) return 'Ván cờ hòa theo luật cờ vua.';
  return 'Ván cờ kết thúc.';
}
function updateTurn() {
  $('bot-thinking').textContent = botBusy ? '◌ Đang suy nghĩ...' : chess.isGameOver() ? 'Kết thúc' : chess.turn() !== playerColor ? 'Đến lượt Bot' : 'Sẵn sàng';
  $('bot-thinking').classList.toggle('thinking', botBusy);
  $('turn-indicator').textContent = chess.isGameOver() ? 'Ván kết thúc' : viewPly !== null ? 'Đang xem lại' : botBusy ? 'Bot đang nghĩ...' : chess.turn() === playerColor ? '● Đến lượt bạn' : 'Đợi Bot...';
  $('turn-indicator').classList.toggle('your-turn', !chess.isGameOver() && chess.turn() === playerColor && !botBusy);
}
async function requestBotMove(token) {
  if (!engineReady || botBusy || chess.turn() === playerColor || chess.isGameOver()) return;
  botBusy = true; renderBoard();
  const fen = chess.fen();
  try {
    const result = await bot.search(fen, thinkTime);
    if (token !== gameToken || chess.fen() !== fen) return;
    const parsed = uciToMove(result.move);
    if (!parsed) throw new Error('Bot không trả về nước đi hợp lệ.');
    botBusy = false;
    commitMove(parsed);
  } catch (e) {
    if (token === gameToken) {
      console.error(e); setMessage(`Lỗi Bot: ${e.message}. Có thể nhấn Ván mới để thử lại.`);
    }
  } finally { if (token === gameToken) { botBusy = false; renderBoard(); } }
}
async function evaluate(fen, ms = analysisTime) {
  const key = `${fen}|${ms}`;
  if (cache.has(key)) return cache.get(key);
  const search = await analyst.search(fen, ms);
  const score = scoreFromWhite(search);
  const answer = { ...search, whiteScore: score };
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(key, answer);
  return answer;
}
function bestMoveSan(fen, uci) {
  if (!uci) return '—';
  try { const copy = new Chess(fen); return copy.move(uciToMove(uci))?.san || uci; }
  catch { return uci; }
}
async function reviewMove(index, token) {
  if (!analystReady) return;
  const row = moveReviews[index];
  if (!row) return;
  try {
    const before = await evaluate(row.before);
    const after = await evaluate(row.after);
    if (token !== gameToken || moveReviews[index] !== row) return;
    const grade = moveGrade(row, before, after);
    Object.assign(row, { ...grade, status: 'done', bestSan: bestMoveSan(row.before, before.move), bestUci: before.move, beforeScore: before.whiteScore, afterScore: after.whiteScore, depth: before.info?.depth || 0 });
    positionScore = after.whiteScore ?? positionScore;
    renderAnalysis(); renderHistory(); renderBoard();
  } catch (err) {
    console.error('Phân tích thất bại:', err);
    if (token === gameToken && moveReviews[index] === row) {
      row.status = 'error'; $('analysis-status').textContent = 'Lỗi phân tích'; renderBoard();
    }
  }
}
function formatScore(cp) {
  if (cp == null) return '—';
  if (Math.abs(cp) > 9000) return cp > 0 ? 'MATE +' : 'MATE −';
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
}
function renderAnalysis() {
  const completed = moveReviews.filter(r => r?.status === 'done');
  const last = [...moveReviews].reverse().find(r => r?.status === 'done');
  const latest = moveReviews.at(-1);
  $('brilliant-count').textContent = `!! ${completed.filter(r => r.grade === 'brilliant' && r.color === playerColor).length} thiên tài`;
  const cp = last?.afterScore ?? positionScore;
  const whitePct = 100 / (1 + Math.exp(-Math.max(-1800, Math.min(1800, cp)) / 380));
  $('eval-white').style.width = `${whitePct}%`;
  $('eval-black').style.width = `${100 - whitePct}%`;
  $('eval-value').innerHTML = `${formatScore(cp)} <small>${cp > 30 ? 'Trắng lợi thế' : cp < -30 ? 'Đen lợi thế' : 'Cân bằng'}</small>`;
  if (!latest) {
    $('verdict-title').textContent = 'Chờ nước đi đầu tiên';
    $('verdict-desc').textContent = 'Sau mỗi nước, AI sẽ so sánh nước đã đi với nước tối ưu và nhận xét độ chính xác.';
    $('verdict-icon').textContent = '✦'; $('verdict-card').dataset.grade = 'neutral';
    $('analysis-status').textContent = analystReady ? 'Sẵn sàng' : 'Đang tải...';
    $('best-move').textContent = '—'; $('best-description').textContent = 'Chơi một nước để xem gợi ý từ engine.';
    $('cp-loss').textContent = '—'; $('accuracy').textContent = '—';
  } else {
    $('analysis-status').textContent = latest.status === 'loading' ? '◌ Đang phân tích...' : latest.status === 'error' ? 'Lỗi phân tích' : '✓ Đã phân tích';
    const review = latest.status === 'done' ? latest : last;
    if (review) {
      $('verdict-title').textContent = `${review.symbol} ${review.san} · ${review.label}`;
      $('verdict-desc').textContent = review.comment;
      $('verdict-icon').textContent = review.symbol;
      $('verdict-card').dataset.grade = review.grade;
      $('best-move').textContent = review.bestSan || '—';
      $('best-description').textContent = review.bestSan === review.san ? 'Trùng với nước tối ưu của Stockfish!' : `So sánh: ${review.san} · Stockfish chọn ${review.bestSan}`;
      $('cp-loss').textContent = review.loss == null ? '—' : `${review.loss} CP`;
    } else {
      $('verdict-title').textContent = 'Đang đánh giá...'; $('verdict-desc').textContent = 'So sánh thế cờ trước và sau nước vừa đi.';
    }
    if (latest.status === 'loading') {
      $('verdict-title').textContent = `◌ ${latest.san} · Đang phân tích`;
      $('verdict-desc').textContent = 'AI đang so nước đi vừa đánh với phương án tối ưu.';
      $('verdict-icon').textContent = '…'; $('verdict-card').dataset.grade = 'neutral';
    }
    const userRows = completed.filter(r => r.color === playerColor && r.loss != null);
    $('accuracy').textContent = userRows.length ? `${(userRows.reduce((s, r) => s + 100 * Math.exp(-r.loss / 180), 0) / userRows.length).toFixed(1)}%` : '—';
  }
  $('recent-moves').innerHTML = '';
  for (const [i, item] of [...moveReviews].map((r, i) => [i, r]).slice(-6).reverse()) {
    const el = document.createElement('button');
    el.className = 'recent-item';
    const number = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}`;
    const mark = item.status === 'done' ? item.symbol : item.status === 'loading' ? '◌' : '!';
    el.innerHTML = `<span class="recent-num">${number}</span><strong>${item.san}</strong><span class="recent-grade ${item.grade || 'neutral'}">${mark} ${item.label || (item.status === 'loading' ? 'Đang phân tích' : 'Chưa có đánh giá')}</span>`;
    el.addEventListener('click', () => { showTab('history'); viewPly = i + 1; renderAll(); });
    $('recent-moves').appendChild(el);
  }
  if (!moveReviews.length) $('recent-moves').innerHTML = '<p class="empty-text">Chưa có nước đi nào.</p>';
}
function renderHistory() {
  const area = $('full-history'); area.replaceChildren();
  if (!moveReviews.length) { area.innerHTML = '<p class="empty-text">Chưa có nước đi.</p>'; return; }
  for (let i = 0; i < moveReviews.length; i += 2) {
    const row = document.createElement('div'); row.className = 'history-row';
    const nr = document.createElement('span'); nr.className = 'history-index'; nr.textContent = `${i / 2 + 1}.`; row.appendChild(nr);
    for (let j = i; j <= i + 1; j++) {
      const m = moveReviews[j];
      const btn = document.createElement('button'); btn.className = 'history-move';
      if (viewPly === j + 1) btn.classList.add('selected-history');
      if (m) {
        btn.innerHTML = `<b>${m.san}</b><span class="history-symbol ${m.grade || 'neutral'}">${m.symbol || '·'}</span>`;
        btn.title = m.label || 'Đang phân tích';
        btn.addEventListener('click', () => { viewPly = j + 1; selected = null; hinted = null; renderAll(); });
      } else btn.disabled = true;
      row.appendChild(btn);
    }
    area.appendChild(row);
  }
  $('review-note').textContent = viewPly === null ? 'Đang ở vị trí hiện tại. Chọn một nước để xem lại.' : `Đang xem sau nước ${viewPly}/${moveReviews.length}. Nhấn ⏭ để trở về ván hiện tại.`;
}
function updateNavigation(next) {
  const length = chess.history().length;
  viewPly = next >= length ? null : Math.max(0, next);
  selected = null; hinted = null;
  renderAll();
}
// Tọa độ SVG (800×800), tự đảo khi đổi góc nhìn Trắng/Đen.
function svgCenter(square) {
  const col = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return facing === 'w'
    ? [col * 100 + 50, (8 - rank) * 100 + 50]
    : [(7 - col) * 100 + 50, (rank - 1) * 100 + 50];
}

// Chấm đánh giá đặt ngay trên góc quân vừa đi, không phải trên ô nước đi gợi ý.
// Nhãn dựa trên phân tích Stockfish, nên lúc đầu là '…' và được thay khi có kết quả.
const GRADE_MARKERS = {
  brilliant:  { text: '!!', color: '#23b5d0' },
  best:       { text: '★',  color: '#27a7c1' },
  great:      { text: '!',  color: '#37b77c' },
  good:       { text: '✓',  color: '#59a766' },
  inaccuracy: { text: '?!', color: '#e6b342' },
  mistake:    { text: '?',  color: '#e58c45' },
  blunder:    { text: '×',  color: '#f16a77' },
  neutral:    { text: '…',  color: '#66748c' }
};
// Giữ nhãn nước đi của người chơi qua cả lượt đáp trả của Bot.
// Chỉ đổi nhãn trên bàn cờ khi người chơi đi nước mới, hoặc khi tua lịch sử.
function stickyAnnotationIndex(reviews, humanColor, historyPly = null) {
  if (historyPly !== null) return historyPly - 1;
  for (let i = reviews.length - 1; i >= 0; i--) {
    if (reviews[i]?.color === humanColor) return i;
  }
  // Người chơi chọn Đen: khi Bot khai cuộc, tạm hiện nước Bot đầu tiên.
  return reviews.length - 1;
}
function renderMoveAnnotation() {
  const arrow = $('review-arrow');
  const tip = $('review-arrowhead-path');
  const badge = $('review-badge');
  const badgeCircle = $('review-badge-circle');
  const badgeText = $('review-badge-text');
  const badgeTitle = $('review-badge-title');
  const index = stickyAnnotationIndex(moveReviews, playerColor, viewPly);
  const review = moveReviews[index];
  const move = chess.history({ verbose: true })[index];
  if (!review || !move || review.status === 'error') {
    arrow.style.display = 'none'; badge.style.display = 'none';
    return;
  }
  const grade = review.status === 'done' ? review.grade : 'neutral';
  const style = GRADE_MARKERS[grade] || GRADE_MARKERS.neutral;
  const [x1, y1] = svgCenter(move.from);
  const [x2, y2] = svgCenter(move.to);
  const dx = x2 - x1, dy = y2 - y1;
  const distance = Math.hypot(dx, dy) || 1;
  const unitX = dx / distance, unitY = dy / distance;
  arrow.setAttribute('x1', x1 + unitX * 25);
  arrow.setAttribute('y1', y1 + unitY * 25);
  arrow.setAttribute('x2', x2 - unitX * 18);
  arrow.setAttribute('y2', y2 - unitY * 18);
  arrow.setAttribute('stroke', style.color);
  tip.setAttribute('fill', style.color);
  arrow.style.display = '';

  // Góc trên bên phải quân cờ (theo hướng nhìn hiện tại), giống ví dụ.
  const badgeX = x2 + 31, badgeY = y2 - 31;
  badgeCircle.setAttribute('cx', badgeX);
  badgeCircle.setAttribute('cy', badgeY);
  badgeCircle.setAttribute('fill', style.color);
  badgeText.setAttribute('x', badgeX);
  badgeText.setAttribute('y', badgeY + 1);
  badgeText.textContent = style.text;
  badgeTitle.textContent = review.status === 'done'
    ? `${review.san} — ${review.label}. ${review.loss ?? '—'} CP mất.`
    : `${review.san} — Đang phân tích...`;
  badge.style.display = '';
}
function renderArrow() {
  const el = $('hint-arrow');
  if (!hinted || viewPly !== null) { el.style.display = 'none'; return; }
  const [x1, y1] = svgCenter(hinted.from);
  const [x2, y2] = svgCenter(hinted.to);
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  el.style.display = '';
}
function renderAll() { renderBoard(); renderAnalysis(); renderHistory(); }
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === `pane-${name}`));
}
function newGame({ side = playerColor, rating = elo, botTime = thinkTime, reviewTime = analysisTime } = {}) {
  gameToken++;
  chess.reset();
  playerColor = side; facing = side; elo = rating; thinkTime = botTime; analysisTime = reviewTime;
  botBusy = false; moveReviews = []; positionScore = 0; selected = null; lastMove = null; hinted = null; viewPly = null;
  $('bot-elo-label').textContent = `${elo} Elo`;
  $('you-color').textContent = side === 'w' ? 'Quân Trắng' : 'Quân Đen';
  document.querySelector('.opponent .avatar').textContent = PIECES[side === 'w' ? 'b' : 'w'].k;
  document.querySelector('.self .avatar').textContent = PIECES[side].k;
  bot.configureElo(elo);
  // Lệnh setoption được Stockfish xử lý trước lệnh go xếp tiếp theo.
  setMessage('Ván mới đã bắt đầu. Chúc bạn chơi tốt!');
  renderAll();
  if (playerColor === 'b') requestBotMove(gameToken);
}
async function giveHint() {
  if (!analystReady || botBusy || chess.isGameOver() || chess.turn() !== playerColor || viewPly !== null) {
    setMessage('Gợi ý chỉ có thể xem ở lượt của bạn, khi ván đang diễn ra.'); return;
  }
  const token = gameToken;
  const fen = chess.fen();
  const button = $('btn-hint'); button.disabled = true; button.innerHTML = '◌ Đang tìm...';
  try {
    const info = await evaluate(fen, Math.max(850, analysisTime));
    if (token !== gameToken || chess.fen() !== fen) return;
    hinted = uciToMove(info.move); selected = null;
    renderBoard(); setMessage(`✦ Gợi ý của Stockfish: ${bestMoveSan(fen, info.move)} (mũi tên tím trên bàn cờ).`);
  } catch (e) { setMessage(`Không tìm được gợi ý: ${e.message}`); }
  finally { button.disabled = false; button.innerHTML = '✧ <span>Gợi ý</span>'; }
}
function applySettings() {
  const rating = Number($('elo-slider').value);
  const side = document.querySelector('input[name="side"]:checked').value;
  newGame({ side, rating, botTime: Number($('think-time').value), reviewTime: Number($('analysis-time').value) });
  showTab('analysis');
}
function downloadText(name, data) {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Đổi chế độ toàn màn hình mà không ảnh hưởng ván cờ hoặc phân tích nước đi.
function syncFullscreenButton() {
  const active = Boolean(document.fullscreenElement);
  document.documentElement.classList.toggle('chesslab-fullscreen', active);
  const button = $('btn-fullscreen');
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Thoát toàn màn hình' : 'Bật chế độ toàn màn hình');
  button.title = active ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình (hoặc nhấn F11)';
  button.querySelector('.fullscreen-symbol').textContent = active ? '⤢' : '⛶';
  button.querySelector('.fullscreen-word').textContent = active ? 'Thu nhỏ' : 'Toàn màn hình';
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (err) {
    console.warn('Không thể chuyển chế độ toàn màn hình:', err);
    setMessage('Trình duyệt không cho phép toàn màn hình. Bạn có thể dùng phím F11.');
  }
  syncFullscreenButton();
}
function setupEvents() {
  $('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  syncFullscreenButton();
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('btn-show-history').addEventListener('click', () => showTab('history'));
  $('btn-new').addEventListener('click', () => newGame());
  $('btn-apply').addEventListener('click', applySettings);
  $('btn-flip').addEventListener('click', () => { facing = facing === 'w' ? 'b' : 'w'; selected = null; renderBoard(); });
  $('btn-hint').addEventListener('click', giveHint);
  $('btn-undo').addEventListener('click', () => {
    if (!engineReady || !chess.history().length) return;
    gameToken++; botBusy = false; viewPly = null;
    const amount = chess.turn() === playerColor ? 2 : 1;
    for (let i = 0; i < amount; i++) if (chess.history().length) { chess.undo(); moveReviews.pop(); }
    lastMove = chess.history({ verbose: true }).at(-1) || null;
    selected = null; hinted = null;
    positionScore = moveReviews.at(-1)?.afterScore || 0;
    setMessage('Đã hoàn tác lượt trước. Bạn có thể chọn nước khác.');
    renderAll();
  });
  $('elo-slider').addEventListener('input', e => {
    $('elo-output').textContent = `${e.target.value} Elo`;
    document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b.dataset.elo === e.target.value));
  });
  document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
    $('elo-slider').value = b.dataset.elo; $('elo-slider').dispatchEvent(new Event('input'));
  }));
  document.querySelectorAll('input[name="side"]').forEach(input => input.addEventListener('change', () => {
    document.querySelectorAll('.choice').forEach(l => l.classList.toggle('selected', l.querySelector('input').checked));
  }));
  $('go-start').addEventListener('click', () => updateNavigation(0));
  $('go-back').addEventListener('click', () => updateNavigation((viewPly ?? chess.history().length) - 1));
  $('go-forward').addEventListener('click', () => updateNavigation((viewPly ?? chess.history().length) + 1));
  $('go-end').addEventListener('click', () => updateNavigation(chess.history().length));
  $('btn-pgn').addEventListener('click', () => {
    const result = chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : chess.isDraw() ? '1/2-1/2' : '*';
    const pgn = `[Event "ChessLab Training"]\n[Site "Local Browser"]\n[White "${playerColor === 'w' ? 'You' : 'Stockfish'}"]\n[Black "${playerColor === 'b' ? 'You' : 'Stockfish'}"]\n[Result "${result}"]\n\n${chess.pgn()}\n`;
    downloadText('chesslab-game.pgn', pgn);
  });
  $('btn-fen').addEventListener('click', async () => {
    const fen = getShownChess().fen();
    try { await navigator.clipboard.writeText(fen); setMessage('Đã sao chép FEN vào bộ nhớ tạm.'); }
    catch { window.prompt('Sao chép FEN:', fen); }
  });
  $('btn-help').addEventListener('click', () => modalToggle('help-modal', true));
  $('close-help').addEventListener('click', () => modalToggle('help-modal', false));
  $('help-modal').addEventListener('click', e => { if (e.target === $('help-modal')) modalToggle('help-modal', false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { modalToggle('help-modal', false); if (pendingPromotion) { pendingPromotion = null; modalToggle('promotion-modal', false); } }
    if (document.querySelector('#pane-history.active')) {
      if (e.key === 'ArrowLeft') updateNavigation((viewPly ?? chess.history().length) - 1);
      if (e.key === 'ArrowRight') updateNavigation((viewPly ?? chess.history().length) + 1);
    }
  });
}
async function start() {
  setupEvents(); renderAll();
  setMessage('Đang khởi động Stockfish 19. Nếu tải lần đầu, có thể mất một lúc.');
  const initResults = await Promise.allSettled([bot.init(), analyst.init()]);
  if (initResults[0].status === 'fulfilled') {
    engineReady = true; bot.configureElo(elo);
    $('engine-status').textContent = 'Stockfish đã sẵn sàng'; $('engine-dot').classList.add('online');
    setMessage('Sẵn sàng! Bạn cầm Trắng và được đi trước.');
  } else {
    $('engine-status').textContent = 'Stockfish không hoạt động';
    setMessage(`Không tải được Bot: ${initResults[0].reason?.message}. Hãy chạy npm install và npm run dev.`);
  }
  analystReady = initResults[1].status === 'fulfilled';
  if (!analystReady) console.error('Stockfish analyst:', initResults[1].reason);
  renderAll();
}
start().catch(err => { console.error(err); setMessage(`Lỗi khởi động: ${err.message}`); });
