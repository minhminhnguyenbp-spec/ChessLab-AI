# ChessLab – Web cờ vua AI có phân tích nước đi (VS Code)

Website hoàn chỉnh dùng **chess.js** để kiểm tra luật cờ và **Stockfish 19 Lite Single-thread** chạy trực tiếp trong trình duyệt (2 Web Worker riêng biệt: chơi và phân tích).

## Cách nhanh nhất trên Windows

1. Cài Node.js LTS tại https://nodejs.org/
2. Giải nén toàn bộ dự án và nhấp đúp **`CHAY_CHESSLAB.bat`**. Lần đầu chương trình cần mạng để chạy `npm install` tự động.
3. Trình duyệt sẽ mở `http://localhost:5173/`. Nếu Vite đổi cổng, xem địa chỉ in trong cửa sổ Terminal.
4. Đừng đóng cửa sổ lệnh trong lúc chơi.

## Cách chạy (Windows / VS Code)

1. Cài **Node.js 20+** (khuyến nghị bản LTS): https://nodejs.org/
2. Giải nén dự án và mở thư mục `ChessLab_VSCode` trong VS Code (`File > Open Folder`).
3. Chọn `Terminal > New Terminal`. Gõ:

   ```bash
   npm install
   npm run dev
   ```

4. Mở địa chỉ được in ra, thường là **http://localhost:5173/**.

> BẮT BUỘC chạy bằng `npm run dev`, không chỉ bấm đúp `index.html`. Lệnh `npm install` tự chép file engine JS+WASM từ gói `stockfish` vào `public/engine/` thông qua `postinstall`.

**Kiểm thử bộ xếp hạng (sau khi cài thư viện):** `npm test`

## Chức năng

- Click chọn quân và ô đích hoặc kéo-thả quân; hợp lệ, bắt quân, nhập thành, phong cấp, chiếu, hòa, chiếu hết xử lý bằng chess.js.
- Chọn Trắng/Đen, đổi góc nhìn, hoàn tác một lượt, ván mới.
- Điều chỉnh Elo Stockfish UCI từ **1320–3190**, tùy thời gian suy nghĩ.
- Phân tích **cả nước của bạn lẫn Bot**: tìm nước AI ưu tiên, so đánh giá vị trí trước/sau, phân loại và tính điểm mất (centipawn), trong đó có **!! Thiên tài** khi phát hiện hy sinh quân gần tối ưu.
- **Ký hiệu đánh giá ngay trên quân vừa di chuyển**, kèm mũi tên từ ô đầu đến ô cuối: `!!` thiên tài (xanh ngọc), `★` tối ưu (xanh), `!` rất tốt, `✓` tốt, `?!` thiếu chính xác (vàng), `?` sai lầm (cam), `×` sai lầm nghiêm trọng (đỏ). Trong lúc tính toán hiện `…`. Dấu đánh giá nước của bạn **giữ nguyên cả khi Bot đã đi**, chỉ đổi khi bạn đánh nước tiếp theo. Nếu chơi Đen và Bot đi trước, tạm hiện dấu của Bot đến khi bạn có nước đầu tiên. Khi xem lại ván, nhãn cập nhật theo nước được chọn.
- Gợi ý đi nước tối ưu bằng mũi tên tím; xem lại ván từng bước và xuất tệp PGN, sao chép FEN.
- Giao diện desktop/mobile.

## Cách phân tích (không phải thuật toán Accuracy của Chess.com)

1. Tìm nước tối ưu và số centipawn của vị trí **trước khi đi**.
2. Tìm số centipawn của vị trí **sau khi đi**.
3. Quy điểm đánh giá về phía bên vừa đi. `CP loss = max(0, trước - sau)` (từ góc nhìn người đi).
4. Nếu nước đi gần tối ưu (≤20 CP mất; độ sâu ≥8 ở hai vị trí), không rơi vào thế thua nặng và tạo thế có thể bị bắt mất ít nhất 2 điểm vật chất (không bắt lại ngay), nhãn **!! Thiên tài**. Đây là bộ phát hiện mang tính heuristic/bảo thủ, có thể bỏ sót hoặc nhận nhầm, **không phải thuật toán Chess.com**.
5. Nếu đúng nước tối ưu nhưng không thỏa điều kiện Thiên tài, nhãn **Tốt nhất**. Nếu không, dùng các khoảng CP loss:

| CP mất | Xếp loại |
|---|---|
| 0–25 | Rất tốt |
| 26–60 | Tốt |
| 61–110 | Thiếu chính xác |
| 111–250 | Sai lầm |
| >250 | Sai lầm nghiêm trọng |

Đánh giá chỉ ước tính, đặc biệt trong thế có nước chiếu hết, khi thời gian engine ngắn, hoặc vị trí phức tạp. Hai lần tìm kiếm giới hạn thời gian có thể cho đánh giá dao động, nên một số nhãn có thể khác khi phân tích sâu hơn. Độ chính xác tự ước tính bằng `100 * exp(-CP mất / 180)` lấy trung bình các nước của người chơi.

## Elo có thật không?

Ứng dụng gửi đúng tùy chọn chuẩn Stockfish `UCI_LimitStrength=true` và `UCI_Elo=<mức đã chọn>` tới engine. **Không thể cam kết Elo chuẩn Chess.com/FIDE** vì Elo thực nghiệm phụ thuộc nhóm đối thủ, thời gian và bản engine; bản Lite cũng khác engine Stockfish đầy đủ. Đây là độ khó *mô phỏng có kiểm soát*, không phải Elo được chứng nhận bởi nền tảng xếp hạng.

## Kỹ thuật

- `index.html`: giao diện.
- `src/style.css`: thiết kế responsive.
- `src/main.js`: logic game, bản ghi, đánh giá nước đi.
- `src/engine.js`: giao tiếp Stockfish qua UCI / Web Worker.
- `src/grading.js`: xếp hạng nước đi và kiểm tra dấu hiệu hy sinh quân cho nhãn Thiên tài.
- `scripts/copy-engine.mjs`: chép file stockfish.js/wasm khi npm install.

Tải Google Font cần Internet, nếu không trình duyệt dùng font hệ thống. Sau khi `npm install`, game có thể chạy offline qua localhost.

Lưu ý: "đánh cờ online" ở đây nghĩa là chơi Bot trong website. Nếu cần **đấu người thật qua mạng**, phải bổ sung backend WebSocket, tài khoản và phòng chơi.

## Nếu không chạy

- `npm` không nhận diện: cài Node.js và mở terminal mới.
- Trắng màn hình: đảm bảo chạy `npm run dev`, mở Developer Tools (F12) xem Console.
- Stockfish không tải: thử chạy lại `npm install`, xem thư mục `public/engine/` đã có `.js` và `.wasm` chưa.
- Đổi Elo/đổi màu: bấm **Bắt đầu ván với thiết lập này** để áp dụng.


## Bản cập nhật: giao diện toàn màn hình
- Giao diện desktop rộng và bàn cờ tự căn theo cửa sổ.
- Nhấn **⛶ Toàn màn hình** ở góc trên bên phải để ẩn thanh tab/trình duyệt; bấm **Thu nhỏ** hoặc **Esc** để thoát.
- Có thể nhấn **F11** trong Chrome/Edge để sử dụng chế độ toàn màn hình của chính trình duyệt.
- Vẫn giữ dấu đánh giá nước đi của người chơi tới khi người chơi đi nước kế tiếp, cả khi Bot đáp trả.
- Thay đổi mà không mất ván: chỉ thay `index.html`, `src/main.js`, `src/style.css` vào dự án cũ rồi Ctrl+F5.
