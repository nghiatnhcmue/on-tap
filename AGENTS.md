# Hướng dẫn Toàn diện cho Agent (TinHocHub)

Tài liệu này được biên soạn nhằm giúp các Agent AI kế nhiệm nắm bắt trọn vẹn kiến trúc, trạng thái hiện tại, quy tắc nghiệp vụ, luồng bảo mật và quy trình triển khai của dự án **TinHocHub**.

---

## 1. Tổng quan Dự án

- **Tên dự án:** TinHocHub – Website Ôn tập & Thi thử môn Tin học THPT (Khối 10, 11, 12).
- **Mục tiêu:** Cung cấp nền tảng ôn thi theo chương trình GDPT 2018 và cấu trúc định dạng đề thi Tốt nghiệp THPT 2025 của Bộ Giáo dục & Đào tạo.
- **Mô hình kiến trúc:** Ứng dụng web tĩnh (Static Web App / SPA) thuần JavaScript ES Modules.
- **Không sử dụng:** Backend máy chủ riêng, Node.js runtime khi chạy, bundler (Webpack/Vite), framework (React/Vue).
- **Lưu trữ dữ liệu:** Phía client thông qua trình duyệt (`localStorage`), được đóng gói thống nhất qua module `js/storage.js`.
- **Dữ liệu ngân hàng câu hỏi:** 4.449 câu hỏi tĩnh lưu tại thư mục `data/` (`grade_10.json`, `grade_11.json`, `grade_12.json`, `manifest.json`), được trích xuất từ file Excel gốc `Ngan Hang de.xlsx`.
- **Triển khai & Hosting:** Cloudflare Pages kết nối tự động với GitHub Repository:
  - GitHub Repo: `https://github.com/nghiatnhcmue/on-tap.git` (nhánh `main`).
  - Production URL 1: `https://on-tap.nghiaedu.workers.dev/`
  - Production URL 2: `https://tinhoc-thpt.pages.dev/`

---

## 2. Kiến trúc Thư mục & Chi tiết các Module

```text
D:\app-on-tap/
├── index.html              # Toàn bộ cấu trúc DOM SPA, tất cả modal và phân vùng giao diện
├── css/
│   └── style.css           # Toàn bộ CSS bổ trợ Tailwind, animations, in ấn A4, viewport safe-area
├── js/
│   ├── app.js              # Controller trung tâm: routing tab, load dữ liệu, Auth Gatekeeper, Gradebook
│   ├── auth.js             # Quản lý xác thực: Google Sign-In (GIS), Đăng ký tài khoản, phân quyền RBAC
│   ├── storage.js          # Lớp truy xuất LocalStorage: tài khoản, lịch sử thi, phòng thi, tùy biến câu hỏi
│   ├── practice.js         # Màn hình Ôn tập: hỗ trợ MCQ, Đúng/Sai (DS), Trả lời ngắn (TLN), Single & List mode
│   ├── exam.js             # Màn hình Thi thử: đề chuẩn Bộ GD 2025 (28 câu = 10đ), đề tự chọn, timer, nộp bài
│   ├── proctor.js          # Hệ thống Giám sát Chống gian lận: fullscreen, tab blur, chống copy/devtools
│   ├── exam-rooms.js       # Quản lý Phòng thi & Giao đề: tạo phòng, cấp mật khẩu, link trực tiếp ?room=XYZ
│   ├── leaderboard.js      # Bảng Vinh Danh Học Sinh: Podium Top 1-2-3, xếp hạng theo ngày/tuần/tháng/năm
│   ├── questions-manager.js# Quản lý Ngân hàng đề cho Giáo viên: Thêm, Sửa, Xóa câu hỏi, Xuất/Nhập JSON
│   ├── admin-manager.js    # Bảng điều khiển Quản trị viên (Admin): đổi mã bảo mật, phân vai, dọn dẹp hệ thống
│   ├── search.js           # Tìm kiếm tức thì 4.449 câu hỏi theo từ khóa, khối, chủ đề, cấp độ
│   ├── print.js            # Xuất đề thi in ấn chuẩn A4 kèm bảng đáp án và hướng dẫn chấm
│   └── utils.js            # Tiện ích chung, trọng tâm là hàm chống XSS escapeHtml()
├── data/
│   ├── manifest.json       # Thống kê metadata (tổng 4.449 câu, số câu theo từng khối và chủ đề)
│   ├── grade_10.json       # 1.700 câu hỏi Khối 10 (gồm 1, 2, 3, 4, DS, TLN)
│   ├── grade_11.json       # 1.240 câu hỏi Khối 11 (gồm 1, 2, 3, 4 MCQ)
│   └── grade_12.json       # 1.509 câu hỏi Khối 12 (gồm 1, 2, 3, 4, DS, TLN)
├── convert_bank.py         # Script Python chuyển đổi Excel sang JSON đồng bộ chuẩn schema
├── Ngan Hang de.xlsx       # File Excel ngân hàng câu hỏi gốc
├── _headers                # Header tối ưu cache và bảo mật cho Cloudflare Pages
├── _redirects              # Cấu hình rewrite SPA routing cho Cloudflare (/* /index.html 200)
└── AGENTS.md               # Tài liệu này (Hướng dẫn dành riêng cho AI Agent)
```

---

## 3. Cơ chế Xác thực & Cổng Bắt Buộc (Auth Gatekeeper)

Dự án áp dụng chính sách **bắt buộc đăng ký / đăng nhập trước khi vào trang**.

### 3.1. Luồng khóa giao diện (`enforceAuthentication()`)
1. Khi khởi động (`App.init()`) hoặc khi trạng thái user thay đổi (`Auth.onAuthChange`):
   - Nếu `!Auth.isLoggedIn()`:
     - Thẻ `#app-main` nhận class `pointer-events-none select-none filter blur-sm`.
     - Thẻ `#app-header` nhận class `pointer-events-none`.
     - Thanh điều hướng di động `#mobile-bottom-nav` bị ẩn (`hidden`).
     - Hộp thoại `#modal-login` mở ra và **nút đóng (X) bị ẩn**, sự kiện click backdrop bị chặn không cho đóng.
   - Nếu `Auth.isLoggedIn()` nhưng `!Auth.isProfileComplete()`:
     - Giao diện chính vẫn bị khóa làm mờ.
     - Tự động mở `#modal-required-profile` yêu cầu học sinh bổ sung: **Họ và tên, Lớp, Trường**.
   - Nếu `Auth.isLoggedIn()` và `Auth.isProfileComplete()`:
     - Mở khóa toàn bộ giao diện, xóa hiệu ứng mờ, khôi phục tương tác bình thường.
2. Khi người dùng bấm **Đăng xuất** (`Auth.logout()`):
   - Xóa `tinhoc_user` khỏi `localStorage`.
   - Gọi `notifyAuthChange()` -> Kích hoạt `enforceAuthentication()` lập tức khóa lại trang.

### 3.2. Cấu trúc Modal Auth Portal (`#modal-login`)
Gồm 2 tab chuyển đổi:
- **Tab Đăng Nhập (`#auth-panel-login`)**:
  - Tích hợp Google Identity Services (nút đăng nhập Google chính thức).
  - Khung **"Tài khoản trên thiết bị này"** (`#saved-accounts-section`): Liệt kê tối đa 5 tài khoản gần nhất lưu trong `Storage.getAccountsList()`. Bấm 1 chạm để đăng nhập tức thì.
  - 3 nút Đăng nhập trải nghiệm nhanh: Học sinh (HS), Giáo viên (GV), Admin.
  - Nút cài đặt Google Client ID cho giáo viên/admin.
- **Tab Đăng Ký Mới (`#auth-panel-register`)**:
  - Form nhập thông tin: Họ tên (\*), Khối lớp (\*), Lớp học (\*), Trường (\*), Email (tùy chọn), Vai trò (Học sinh / Giáo viên / Admin).
  - Nếu chọn vai trò Giáo viên hoặc Admin -> Hiển thị trường nhập mã kích hoạt bí mật (`GV2025` hoặc `ADMIN2025`).
  - Nút **"Đăng Ký & Vào Học Ngay"** xử lý bằng `Auth.registerUser()`.

---

## 4. Quy tắc Nghiệp vụ Đề thi & Ôn tập

### 4.1. Cấu trúc Đề chuẩn Bộ GD&ĐT 2025 (`bgd_2025`)
- Thời gian làm bài: **50 phút**.
- Tổng số câu hỏi: **Đúng 28 câu = 10.0 điểm**, chia làm 2 phần:
  - **Phần I (MCQ):** 24 câu hỏi trắc nghiệm 4 lựa chọn (mỗi câu 0.25 điểm = 6.0 điểm).
  - **Phần II (Đúng/Sai - DS):** 4 câu hỏi trắc nghiệm Đúng/Sai (mỗi câu tối đa 1.0 điểm = 4.0 điểm).
- **Thang điểm chấm câu Đúng/Sai chuẩn Bộ GD&ĐT:**
  - Đúng 1 ý: **0.1 điểm**.
  - Đúng 2 ý: **0.25 điểm**.
  - Đúng 3 ý: **0.5 điểm**.
  - Đúng 4 ý: **1.0 điểm**.
- **Quy tắc đặc thù Khối 11:** Trong ngân hàng câu hỏi gốc, Khối 11 chỉ có câu hỏi MCQ (cấp độ 1–4) và không có câu hỏi Đúng/Sai (DS). Để đảm bảo luôn tạo được đề chuẩn 28 câu cho học sinh Khối 11, hàm `App.startExam()` trong `js/app.js` tự động bổ sung 4 câu DS từ Khối 12.

### 4.2. Chế độ Luyện tập (`js/practice.js`)
- Hỗ trợ 2 chế độ hiển thị: **Thẻ đơn (Single Card)** và **Danh sách (List View)**.
- Xử lý trọn vẹn cả 3 dạng câu hỏi:
  - Trắc nghiệm 4 phương án (`1`, `2`, `3`, `4`).
  - Đúng / Sai (`DS`): 4 ý a, b, c, d độc lập, chấm điểm theo barem Bộ GD.
  - Trả lời ngắn (`TLN`): Chuẩn hóa chuỗi (bỏ khoảng trắng thừa, so sánh không phân biệt hoa/thường).
- Hỗ trợ phím tắt điều hướng: Mũi tên Trái (<kbd>←</kbd>) và Phải (<kbd>→</kbd>).

### 4.3. Giám sát Chống gian lận (`js/proctor.js`)
- Tự động phát hiện và ghi nhật ký mốc thời gian vi phạm:
  - Chuyển tab hoặc ẩn cửa sổ trình duyệt (`visibilitychange`, `blur`).
  - Thoát chế độ toàn màn hình (`fullscreenchange`).
  - Cố tình mở phím tắt DevTools (<kbd>F12</kbd>, <kbd>Ctrl+Shift+I</kbd>).
  - Cố tình bôi đen, sao chép nội dung (`copy`, `contextmenu`, `selectstart`).
- Khi vi phạm vượt quá ngưỡng quy định (mặc định: 3 lần), hệ thống tự động đình chỉ thi và nộp bài với điểm số tại thời điểm vi phạm.

### 4.4. Phòng thi Trực tuyến (`js/exam-rooms.js`)
- Giáo viên có thể tạo phòng thi với: Tên phòng, Khối, Thời lượng, Mật khẩu, Khung giờ mở/đóng, Cấu hình bật/tắt giám sát chống gian lận.
- Nút "Copy thông báo lớp" tự động xuất đường link trực tiếp `${origin}?room=${roomId}` để gửi học sinh vào thẳng phòng thi mà không cần gõ mã thủ công.

---

## 5. Schema Dữ liệu Câu hỏi

Mỗi câu hỏi tuân thủ cấu trúc đối tượng JSON:
```json
{
  "id": "12_0001",
  "stt": 1,
  "grade": "12",
  "topic": "Chủ đề A: Máy tính và xã hội tri thức",
  "lesson": "Bài 1: Làm quen với học máy",
  "level": "1",
  "question": "Nội dung câu hỏi...",
  "options": ["Phương án A", "Phương án B", "Phương án C", "Phương án D"],
  "answer": "A",
  "video": ""
}
```
- `level`: Nhận giá trị `1`, `2`, `3`, `4`, `DS` (Đúng/Sai), `TLN` (Trả lời ngắn).
- `answer`:
  - MCQ: Một ký tự chữ cái hoa đại diện (`A`, `B`, `C`, hoặc `D`).
  - Đúng/Sai: Chuỗi 4 giá trị phân cách bởi dấu phẩy, ví dụ: `"Đ,S,Đ,S"`.
  - Trả lời ngắn: Chuỗi đáp số hoặc từ khóa, ví dụ: `"1024"`, `"print"`.

---

## 6. Quy ước Bắt buộc Khi Chỉnh sửa Code

1. **Bảo tồn ES Modules thuần:**
   - Không thêm bước bundler (Webpack/Vite/Rollup) hoặc framework nặng (React/Vue/Svelte) nếu không có yêu cầu rõ ràng.
   - Giữ nguyên các lệnh `import / export` và cú pháp tương thích trình duyệt hiện đại.
2. **Chống tấn công XSS:**
   - Mọi giá trị do người dùng nhập hoặc dữ liệu động (`studentName`, `studentClass`, `studentSchool`, `title`, `roomId`, đáp án, nội dung ghi chú) khi đưa vào `innerHTML` đều **BẮT BUỘC** phải bọc qua hàm `escapeHtml()` từ `js/utils.js`.
3. **Quản lý Lưu trữ (`localStorage`):**
   - Không tự ý tạo khóa `localStorage` tự do; luôn tận dụng và mở rộng đối tượng `Storage` trong `js/storage.js`.
4. **Ngôn ngữ Giao diện:**
   - Giữ toàn bộ văn bản UI, thông báo, nút bấm và alert bằng **tiếng Việt chuẩn mực, sư phạm, chuyên nghiệp**.
5. **Cân bằng Thẻ DOM:**
   - File `index.html` chứa nhiều cấu trúc modal lồng nhau. Sau khi sửa `index.html`, luôn chạy script kiểm tra độ cân bằng thẻ và kiểm tra định danh ID không bị trùng lặp.

---

## 7. Các Lệnh Kiểm tra Nhanh (Cheat Sheet)

Chạy trong môi trường dòng lệnh (PowerShell / Command Prompt):

- **Kiểm tra cú pháp JavaScript toàn dự án:**
  ```powershell
  Get-ChildItem -Path js\*.js | ForEach-Object { node --check $_.FullName }
  ```
- **Kiểm tra tính hợp lệ của dữ liệu JSON:**
  ```powershell
  node -e "['manifest.json', 'grade_10.json', 'grade_11.json', 'grade_12.json'].forEach(f => { const d = JSON.parse(require('fs').readFileSync('data/' + f, 'utf8')); console.log(f + ': OK (' + (Array.isArray(d) ? d.length + ' items' : 'Object') + ')'); });"
  ```
- **Chạy server kiểm thử cục bộ:**
  ```powershell
  python -m http.server 8080
  # Sau đó truy cập: http://localhost:8080/
  ```
- **Cập nhật ngân hàng đề sau khi sửa Excel `Ngan Hang de.xlsx`:**
  ```powershell
  python convert_bank.py
  ```
- **Kiểm tra Git status trước khi commit:**
  ```powershell
  git status
  ```
- **Đẩy mã nguồn lên GitHub để Cloudflare Pages tự động phát hành:**
  ```powershell
  git add -A
  git commit -m "your commit message"
  git push origin main
  ```
