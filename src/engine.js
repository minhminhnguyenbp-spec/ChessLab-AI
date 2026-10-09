// Động cơ UCI chạy trong Web Worker, hoàn toàn không cần máy chủ.
// BASE_URL = './' khi build: hoat dong tai /ten-repo/ tren GitHub Pages.
const ENGINE_URL = new URL(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`, document.baseURI).href;

export class StockfishClient {
  constructor(name) {
    this.name = name;
    this.worker = null;
    this.ready = false;
    this.pending = null;
    this.queue = Promise.resolve();
    this.handlers = [];
    this.error = null;
  }

  async init() {
    if (this.ready) return;
    if (!window.Worker) throw new Error('Trình duyệt không hỗ trợ Web Worker.');
    this.worker = new Worker(ENGINE_URL);
    this.worker.onerror = (ev) => {
      this.error = new Error(`Không tải được Stockfish ${this.name}. Hãy chạy npm install và npm run dev.`);
      if (this.pending) this.pending.reject(this.error);
      console.error('Engine worker:', ev.message || ev);
    };
    this.worker.onmessage = (ev) => {
      const raw = String(ev.data ?? '');
      for (const line of raw.split(/\r?\n/)) {
        if (!line) continue;
        for (const fn of [...this.handlers]) fn(line);
        if (this.pending) this.pending.onLine(line);
      }
    };
    const uciReady = this.waitFor('uciok', 25000);
    this.send('uci');
    await uciReady;
    this.send('setoption name Hash value 16');
    const engineReady = this.waitFor('readyok', 25000);
    this.send('isready');
    await engineReady;
    this.ready = true;
  }

  send(command) { this.worker?.postMessage(command); }

  waitFor(term, ms = 20000) {
    return new Promise((resolve, reject) => {
      const onLine = line => { if (line.startsWith(term)) { cleanup(); resolve(line); } };
      const timeout = setTimeout(() => { cleanup(); reject(new Error(`Stockfish không phản hồi (${term}).`)); }, ms);
      const cleanup = () => { clearTimeout(timeout); this.handlers = this.handlers.filter(h => h !== onLine); };
      this.handlers.push(onLine);
    });
  }

  configureElo(elo) {
    const rating = Math.max(1320, Math.min(3190, Math.round(elo)));
    this.send('setoption name UCI_LimitStrength value true');
    this.send(`setoption name UCI_Elo value ${rating}`);
  }

  // Tất cả lệnh tìm kiếm trên mỗi worker được xếp hàng, tránh trộn kết quả.
  search(fen, timeMs = 600) {
    const task = () => this._search(fen, timeMs);
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  _search(fen, timeMs) {
    return new Promise((resolve, reject) => {
      if (!this.ready || this.error) return reject(this.error || new Error('Stockfish chưa sẵn sàng.'));
      let lastInfo = null;
      let done = false;
      const timeout = setTimeout(() => finish(null, new Error('Stockfish tìm nước quá thời gian.')), Math.max(12000, timeMs + 10000));
      const finish = (result, err) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        this.pending = null;
        if (err) { this.send('stop'); reject(err); } else resolve(result);
      };
      this.pending = { reject: err => finish(null, err), onLine: line => {
        if (line.startsWith('info ') && line.includes(' score ')) {
          const match = line.match(/\bscore (cp|mate) (-?\d+)/);
          const pvMatch = line.match(/\bpv (.+)$/);
          const depthMatch = line.match(/\bdepth (\d+)/);
          if (match) lastInfo = {
            kind: match[1], score: Number(match[2]),
            pv: pvMatch?.[1]?.split(' ') || [], depth: Number(depthMatch?.[1] || 0)
          };
        }
        if (line.startsWith('bestmove ')) {
          const move = line.split(/\s+/)[1];
          finish({ move: move === '(none)' ? null : move, info: lastInfo, fen });
        }
      }};
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${timeMs}`);
    });
  }

  destroy() { this.worker?.terminate(); this.worker = null; this.ready = false; }
}

export function scoreFromWhite(result) {
  if (!result?.info) return null;
  const side = result.fen.split(' ')[1] === 'w' ? 1 : -1;
  const { kind, score } = result.info;
  // Mate được biểu diễn thành ±10000 CP để so sánh; không phải giá trị centipawn thực.
  return side * (kind === 'mate' ? Math.sign(score) * (10000 - Math.min(99, Math.abs(score))) : score);
}

export function uciToMove(uci) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) };
}
