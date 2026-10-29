# Hướng dẫn cho Agent

## Tổng quan

TinHocHub là website tiếng Việt để ôn tập và thi thử Tin học THPT (khối 10–12), triển khai như một ứng dụng web tĩnh. Giao diện chính ở `index.html`, CSS ở `css/style.css`, JavaScript thuần dùng ES modules trong `js/`, dữ liệu câu hỏi tĩnh ở `data/`. Đọc `README.md` để biết hướng dẫn sử dụng, triển khai và cập nhật ngân hàng câu hỏi.

Không có backend ứng dụng, cấu hình bundler, `package.json` hay bộ test tự động trong repo hiện tại. Các tài khoản, kết quả, phòng thi và cấu hình được lưu trong trình duyệt bằng `localStorage`; Google Identity Services cung cấp luồng đăng nhập nhưng không đồng nghĩa với xác thực quyền ở máy chủ.

## Kiến trúc chính

- `js/app.js`: khởi tạo ứng dụng, điều hướng các tab, nạp manifest và dữ liệu từng khối, kết nối các màn hình.
- `js/practice.js`, `js/exam.js`: logic ôn tập, tạo đề, làm bài và chấm điểm.
- `js/search.js`, `js/print.js`: tìm kiếm ngân hàng câu hỏi và định dạng in.
- `js/auth.js`, `js/storage.js`: thông tin đăng nhập/phân vai phía trình duyệt và lưu trữ dữ liệu cục bộ.
- `js/exam-rooms.js`, `js/proctor.js`: quản lý phòng thi và phát hiện vi phạm ở phía trình duyệt.
- `js/leaderboard.js`, `js/questions-manager.js`, `js/admin-manager.js`: bảng điểm, quản lý câu hỏi và giao diện quản trị.
- `js/utils.js`: tiện ích dùng chung, bao gồm `escapeHtml`.
- `data/manifest.json` là metadata thống kê; `data/grade_10.json`, `grade_11.json`, `grade_12.json` chứa câu hỏi tương ứng. `js/app.js` tải các tệp này qua `fetch()` và giữ cache trong phiên chạy.
- `convert_bank.py` tạo các JSON trên từ `Ngan Hang de.xlsx`. Khi sửa ngân hàng câu hỏi, cập nhật nguồn Excel rồi chạy script thay vì sửa thủ công các tệp JSON được sinh.
- `_headers` chứa cấu hình header/cache cho Cloudflare Pages. Đây là site tĩnh; không giả định có API hay dịch vụ lưu trữ dùng chung.

## Quy ước khi thay đổi

- Giữ cách tổ chức và cú pháp JavaScript ES modules hiện có; tránh thêm framework hoặc bước build nếu yêu cầu không cần.
- Giữ tương thích với schema câu hỏi hiện có: `id`, `stt`, `grade`, `topic`, `lesson`, `level`, `question`, `options`, `answer`, `video`. `level` gồm `1`–`4`, `DS`, `TLN`; đáp án MCQ là chữ cái, Đúng/Sai là chuỗi các ý, Trả lời ngắn là nội dung đáp án.
- Nếu đổi schema hoặc hành vi câu hỏi, kiểm tra đồng bộ bộ chuyển đổi, các JSON/manifest được sinh, và các màn hình ôn tập, thi, tìm kiếm, in, quản lý câu hỏi có liên quan.
- Ưu tiên dùng `Storage` trong `js/storage.js` cho dữ liệu ứng dụng để không tạo thêm cách lưu trữ hoặc khóa `localStorage` không nhất quán.
- Nội dung câu hỏi và dữ liệu người dùng có thể được đưa vào HTML động. Dùng `escapeHtml` từ `js/utils.js` cho giá trị văn bản; không nội suy dữ liệu chưa tin cậy như HTML.
- Các kiểm tra vai trò, mã quản trị, kết quả và cơ chế chống gian lận chạy phía client, có thể bị người dùng kiểm soát. Không dựa vào chúng để bảo vệ bí mật, dữ liệu nhạy cảm hoặc quyền truy cập cần được cưỡng chế ở máy chủ.
- Giữ giao diện và thông báo bằng tiếng Việt, theo phong cách đang dùng trong các module liên quan.

## Chạy và kiểm tra

- Chạy site qua HTTP server tĩnh từ thư mục gốc, ví dụ `python -m http.server 8080`, rồi mở `http://localhost:8080/`. Không mở trực tiếp `index.html` bằng `file://` vì ứng dụng nạp module và JSON bằng HTTP.
- Repo hiện chưa có lệnh test/lint/build chuẩn. Với thay đổi giao diện hoặc luồng nghiệp vụ, kiểm tra thủ công các màn hình bị ảnh hưởng trên site chạy cục bộ; với thay đổi dữ liệu, kiểm tra JSON và manifest sau khi chạy `convert_bank.py`.
- `convert_bank.py` cần Python và thư viện `openpyxl`.
