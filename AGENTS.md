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
│   ├── gradebook.js        # Sổ điểm & Phân tích Tiến trình: theo học sinh, theo lớp, học bạ điện tử, xuất Excel BOM
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
├── _headers                # Header tối ưu cache và bảo mật cho Cloudflare Workers / Pages
└── AGENTS.md               # Tài liệu này (Hướng dẫn dành riêng cho AI Agent)
```

> **Lưu ý quan trọng về Cloudflare Workers Static Assets (`on-tap.nghiaedu.workers.dev`):**
> Hệ thống tự động build qua GitHub App `Workers Builds: on-tap`. **Tuyệt đối KHÔNG tạo file `_redirects` có mã trạng thái `200` (như `/* /index.html 200`)**, vì Cloudflare Workers Static Assets sẽ báo lỗi cấu hình proxy và làm hỏng bản build. Do ứng dụng điều hướng hoàn toàn tại `/` và dùng query string `?room=XYZ`, không cần file `_redirects`.

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
  - Tích hợp Google Identity Services (nút đăng nhập Google chính thức + nút Google Nhanh `#modal-google-quick-prompt` hoạt động ngay cả khi chưa cấu hình Google Cloud Client ID).
  - Khung **"Tài khoản trên thiết bị này"** (`#saved-accounts-section`): Liệt kê tối đa 5 tài khoản gần nhất lưu trong `Storage.getAccountsList()`. Bấm 1 chạm để đăng nhập tức thì.
  - 3 nút Đăng nhập trải nghiệm nhanh: Học sinh (HS), Giáo viên (GV), Admin.
  - Nút cài đặt Google Client ID cho giáo viên/admin.
- **Tab Đăng Ký Mới (`#auth-panel-register`) & Cập nhật Hồ sơ (`#modal-required-profile`)**:
  - Hỗ trợ nút **"Đăng ký nhanh với Google"** (`#google-signup-btn-container`) tự động điền Email & Họ tên hoặc tạo tài khoản lập tức.
  - Form nhập thông tin dạng danh sách chuẩn hóa (`SCHOOLS_DATA` trong `js/auth.js`):
    - **EMASI**: Khối 10 (`10E`, `10I1`, `10I2`), Khối 11 (`11E`), Khối 12 (`12E`).
    - **Phổ thông Năng khiếu**: Khối 12 (`12TOAN`, `12LI`, `12HOA`, `12SINH`, `12VAN`).
    - **TT GDNN GDTX Chu Văn An**: Khối 10 (`10TN`, `10A1` đến `10A12`), Khối 11 (`11A1` đến `11A5`), Khối 12 (`12A1` đến `12A10`).
    - Hỗ trợ tùy chọn **"Trường khác (Tự nhập)..."** và **"Lớp khác (Tự nhập)..."** mở ô nhập liệu linh hoạt khi cần.
    - Cơ chế đồng bộ thông minh (`Auth.setupSchoolClassSync`): Chọn Lớp tự động nhận diện và chuyển Khối lớp tương ứng.
  - Nếu chọn vai trò Giáo viên hoặc Admin -> Hiển thị trường nhập mã kích hoạt bí mật (`GV2025` hoặc `ADMIN2025`).
  - Nút **"Đăng Ký & Vào Học Ngay"** xử lý bằng `Auth.registerUser()`.

---

## 4. Quy tắc Nghiệp vụ Đề thi, Ôn tập & Chống Gian Lận Đa Nền Tảng

### 4.1. Bộ Công Cụ Trộn Đề & Tạo Bài Kiểm Tra Chuẩn (`js/exam.js`)
Hỗ trợ 4 chế độ sinh đề và trộn đề tự động từ ngân hàng câu hỏi chuẩn GDPT 2018:
1. **🏛️ Đề Chuẩn Bộ GD&ĐT 2025 (`bgd_2025`):**
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
2. **📁 Trộn Đề Theo Chủ Đề (`by_topic`):**
   - Lọc ngân hàng câu hỏi theo Chủ đề cụ thể trong khối lớp (`q.topic`).
   - Tùy chỉnh số lượng câu (10, 15, 20, 25, 30, 40 câu) và thời lượng (15, 20, 30, 45, 50 phút).
3. **📖 Trộn Đề Theo Bài Học - Kiểm Tra 15 Phút (`by_lesson`):**
   - Lọc chính xác theo Chủ đề và Bài học cụ thể (`q.topic` & `q.lesson`).
   - Tùy chỉnh số lượng câu (10, 15, 20, 25 câu) và thời lượng (10, 15, 20, 30 phút).
4. **⚙️ Ma Trận Nhận Thức Tự Chọn (`custom`):**
   - Lọc theo cấp độ nhận thức GDPT 2018: Mức 1 (Nhận biết), Mức 2 (Thông hiểu), Mức 3 (Vận dụng), Mức 4 (Vận dụng cao), DS hoặc TLN.
   - Tùy chỉnh số câu (10–50 câu) và thời gian làm bài (15–90 phút).
- **Cơ chế Xáo Trộn & Chống Nhìn Bài Toàn Diện:**
  - **Đảo thứ tự câu hỏi (`shuffleQuestions`):** Xáo trộn ngẫu nhiên thứ tự các câu trong đề.
  - **Đảo phương án trả lời (`shuffleOptions`):** Xáo trộn độc lập các phương án A, B, C, D của từng câu MCQ, tự động cập nhật lại vị trí đáp án đúng (`item.displayOptions`, `item.displayAnswer`).
  - **Cấp Mã Đề Thi (`examCode`):** Tự động sinh mã đề ngẫu nhiên 3 chữ số (vd: 102, 204, 305) hiển thị trực quan trên thanh phòng thi, kết quả thi và lưu trữ trong bảng điểm.

### 4.2. Chế độ Luyện tập Thông minh (`js/practice.js`)
- Hỗ trợ 2 chế độ hiển thị: **Thẻ đơn (Single Card)** và **Danh sách (List View)**.
- Xử lý trọn vẹn cả 3 dạng câu hỏi:
  - Trắc nghiệm 4 phương án (`1`, `2`, `3`, `4`).
  - Đúng / Sai (`DS`): 4 ý a, b, c, d độc lập, chấm điểm theo barem Bộ GD.
  - Trả lời ngắn (`TLN`): Chuẩn hóa chuỗi (bỏ khoảng trắng thừa, so sánh không phân biệt hoa/thường).
- **Ngân hàng Câu hỏi Hay Sai (`Storage.getWrongQuestions()`)**: Tự động lưu câu trả lời sai trong cả Ôn tập và Thi thử để học sinh ôn tập lại (`Practice.startWrongQuestionsPractice()`), và tự động xóa khỏi danh sách khi học sinh trả lời đúng.
- **Sổ tay Ghi chú Cá nhân (`Storage.getQuestionNote()`)**: Cho phép học sinh gắn ghi chú/mẹo giải riêng vào từng câu hỏi.
- **Chuỗi Ngày Học Liên Tiếp (`Storage.getStudyStreak()` 🔥)**: Ghi nhận streak học tập mỗi ngày trên trang chủ.
- Hỗ trợ phím tắt điều hướng: Mũi tên Trái (<kbd>←</kbd>) và Phải (<kbd>→</kbd>).

### 4.3. Giám sát Chống gian lận Đa Nền Tảng (`js/proctor.js`)
Hệ thống tự động nhận diện nền tảng (`Proctor.detectPlatform()`) gồm **Windows, macOS, Android, iOS (iPhone), iPadOS, Linux** để áp dụng cơ chế giám sát tương thích:
- **Toàn màn hình & Chế độ Tập trung (Fullscreen / iOS Safe Mode):**
  - Trên Windows, macOS, Android, iPadOS: Kích hoạt Fullscreen API (`requestFullscreen` / `webkitRequestFullscreen`) ngay trong luồng click của người dùng.
  - Trên iPhone iOS (trình duyệt không hỗ trợ Fullscreen API cho thẻ `<html>`): Tự động chuyển sang **iOS Safe Viewport Mode** (khóa chạm giữ `-webkit-touch-callout: none`, khóa kéo nảy trang, giám sát `visibilitychange`/`blur` và cử chỉ đa điểm) mà không gây lỗi phạt oan.
- **Phát hiện Chia đôi màn hình / Cửa sổ nổi (Split-Screen & Picture-in-Picture):**
  - Theo dõi tỷ lệ `window.innerWidth` / `window.innerHeight` so với `screen.availWidth` / `availHeight` trên Android, iPadOS và Desktop.
  - Tự động loại trừ trường hợp bàn phím ảo (`isVirtualKeyboardOpen()`) bật lên khi học sinh nhập đáp án câu Trả lời ngắn (`TLN`).
- **Màn chắn Chống chụp màn hình (Privacy Blur Shield):**
  - Tự động làm mờ tức thì toàn bộ đề thi (`body.proctor-privacy-shield`) khi cửa sổ mất tiêu điểm (`blur`), ẩn tab (`visibilitychange`), chạm >= 3 ngón tay trên màn hình cảm ứng, hoặc nhấn phím chụp màn hình (`PrintScreen`, `Win+Shift+S`, `⌘+Shift+3/4/5`).
- **Chặn phím tắt hệ thống trên cả Windows & macOS:**
  - Chặn DevTools, Xem mã nguồn, In, Lưu trang, Tìm kiếm, Sao chép/Dán với cả `Ctrl` (Windows/Linux) và `⌘ Command` / `Option` (macOS).
- **Giữ sáng màn hình (`navigator.wakeLock`) & Cảnh báo Rung/Âm thanh:**
  - Giữ màn hình điện thoại không tự tắt khi đang đọc đề; phát âm thanh cảnh báo Web Audio API kèm rung phản hồi (`navigator.vibrate`) trên thiết bị di động.
- **Tự động lưu phiên thi (`Storage.saveActiveExamSession()`):**
  - Lưu trạng thái bài thi và số lần vi phạm mỗi 5 giây và sau mỗi thao tác chọn đáp án. Nếu trình duyệt bị tắt đột ngột hoặc tải lại trang, học sinh có thể khôi phục bài thi đang làm dở mà không thể xóa lịch sử vi phạm.

### 4.4. Quản Lý Phòng Thi & Giao Bài Theo Trường, Khối, Lớp (`js/exam-rooms.js`)
- **Phân phối giao bài chuẩn theo đối tượng (`targetSchool`, `targetGrade`, `targetClass`):**
  - **Trường học:** Chọn từ danh mục chuẩn hóa (`EMASI`, `Phổ thông Năng khiếu`, `TT GDNN GDTX Chu Văn An`), hoặc mở tự do (`all`), hoặc tự nhập tên trường (`__other__`).
  - **Khối lớp:** Khối 10, Khối 11, Khối 12.
  - **Lớp học:** Dropdown lớp học tự động đồng bộ theo Trường và Khối tương ứng (vd: EMASI có 10E, 10I1, 10I2...; PTNK có 12TOAN, 12LI...; Chu Văn An có 10TN, 10A1-10A12...), hỗ trợ tùy chọn "Tất cả các lớp" hoặc nhập lớp tự do.
- **Cấu hình hình thức đề phòng thi:**
  - Hỗ trợ cả 4 hình thức: Đề chuẩn Bộ GD 2025, Trộn theo Chủ đề, Trộn theo Bài học (15p), hoặc Ma trận tự chọn.
  - Tùy chọn đảo câu hỏi, đảo phương án A,B,C,D, và tùy chọn cấp Mã đề thi riêng chống nhìn bài nhau trong phòng thi (`randomExamCode`).
- **Kiểm soát bảo mật khi vào phòng thi (`Storage.validateRoomAccess`):**
  - Bắt buộc kiểm tra: Mã phòng thi, Mật khẩu, Khung giờ mở/đóng.
  - Kiểm tra điều kiện học sinh: So khớp Trường (`user.school`), Khối (`user.grade`), và Lớp (`user.className`) của tài khoản học sinh với cấu hình giao bài của phòng. Nếu không thuộc đối tượng được giao, hệ thống hiển thị thông báo sư phạm từ chối truy cập.
- **Bộ lọc & Điều phối cho Giáo viên:**
  - Thanh bộ lọc nhanh theo Khối, theo Trường và ô tìm kiếm tức thì theo tên/mã phòng.
  - Nút **"Copy thông báo lớp"** tự động định dạng mẫu tin nhắn chuyên nghiệp (gồm Tên bài, Trường, Lớp, Hình thức đề, Thời lượng, Khung giờ, Mật khẩu, Link trực tiếp `${origin}?room=${roomId}`) để Thầy Cô gửi ngay vào Zalo/Facebook của lớp.

### 4.5. Sổ Điểm Điện Tử & Theo Dõi Tiến Trình Học Sinh Toàn Diện (`js/gradebook.js`)
Phục vụ nhu cầu theo dõi tiến độ, đánh giá năng lực học tập và xuất báo cáo kết quả thi của Giáo viên và Học sinh:
- **Theo dõi tiến trình từng Học sinh (`getStudentsProgress`):**
  - Tự động nhóm lịch sử làm bài theo tài khoản học sinh (`studentEmail` hoặc `Họ tên + Lớp`).
  - Tính toán các chỉ số cá nhân cốt lõi: Số đề đã thi, Điểm cao nhất (`maxScore`), Điểm trung bình (`avgScore`), Điểm bài gần nhất (`latestScore`), Độ chênh lệch so với bài trước (`scoreDiff = latestScore - previousScore`).
  - **Thuật toán đánh giá xu hướng tiến độ (Trend Badges):**
    - 🚀 **Đang tiến bộ:** `scoreDiff >= 0.5` hoặc tăng mạnh so với điểm TB (`latestScore >= avgScore + 0.3`).
    - 🏆 **Xuất sắc:** Duy trì phong độ đỉnh cao (`avgScore >= 8.5` và `latestScore >= 8.0`).
    - ⚡ **Khá & Ổn định:** Kết quả duy trì chắc chắn ở mức khá (`avgScore >= 6.5`).
    - ⚠️ **Cần cố gắng:** Điểm dưới chuẩn (`latestScore < 5.0` hoặc `avgScore < 5.0` hoặc sụt giảm `scoreDiff <= -1.0`).
    - 🔄 **Mới bắt đầu:** Hoàn thành bài thi đầu tiên.
- **Học bạ Điện tử Cá nhân (Modal `#modal-student-progress` & View Lịch sử):**
  - Hiển thị hồ sơ học sinh (Avatar, Họ tên, Email, Trường, Lớp).
  - 4 thẻ KPI động (Kỷ lục cao nhất, Điểm TB, Điểm gần nhất, Tổng lượt thi).
  - Lời nhận xét sư phạm tự động dựa trên độ tăng trưởng điểm số.
  - Biểu đồ cột trực quan (`sp-modal-bars-container`) theo dõi tiến trình điểm qua từng đợt thi theo dòng thời gian.
  - Bảng danh sách chi tiết từng bài thi kèm mã đề, thời gian làm bài và kiểm toán giám sát.
- **Phân tích Tiến trình Theo Lớp (`getClassAnalytics`):**
  - Bộ lọc đa chiều: Theo Trường (`EMASI`, `Phổ thông Năng khiếu`, `Chu Văn An`...), Theo Khối (10, 11, 12), và Theo Lớp (`10E`, `12TOAN`, `10A1`...).
  - Thống kê toàn diện: Sĩ số tham gia, Tổng lượt nộp bài, Điểm trung bình lớp, Điểm kỷ lục lớp, Tỷ lệ đạt chuẩn (>= 5.0đ), Tỷ lệ học sinh đang tiến bộ vs cần nỗ lực.
  - Biểu đồ phổ điểm trực quan (Xuất sắc 9-10đ, Giỏi 8-8.9đ, Khá 6.5-7.9đ, Trung bình 5-6.4đ, Cần cố gắng <5đ).
  - Bảng xếp hạng học sinh trong lớp theo điểm TB hoặc điểm cao nhất.
- **Xuất Báo Cáo Excel Chuẩn Quốc Tế (UTF-8 with BOM):**
  - Hỗ trợ xuất 2 loại file báo cáo:
    1. **Báo Cáo Tiến Trình Học Sinh (`Bao_Cao_Tien_Trinh_Hoc_Sinh_*.csv`)**: Thống kê danh sách học sinh, trường, lớp, email, số đề thi, max, TB, bài gần nhất, xu hướng tiến độ, lời nhận xét.
    2. **Chi Tiết Toàn Bộ Bài Thi (`Chi_Tiet_Bai_Thi_Tin_Hoc_*.csv`)**: Bảng điểm nhật ký từng lượt thi gồm ngày giờ, học sinh, trường, lớp, phòng thi, mã đề, điểm số, số câu đúng/tổng câu, thời gian làm bài, tỷ lệ đúng, trạng thái giám sát (Hợp lệ / Bị đình chỉ).
  - **Bảo đảm không lỗi font tiếng Việt trong Microsoft Excel:** Tất cả file xuất ra đều được thêm byte order mark UTF-8 (`\uFEFF`) ở đầu chuỗi, mở xem trực tiếp trên Excel của Windows và macOS trọn vẹn dấu tiếng Việt mà không cần thao tác import thủ công.

---

## 5. Kiến trúc Bố cục Lỏng Thích Ứng Toàn Diện (Fluid & Adaptive Architecture)

Hệ thống được thiết kế theo tiêu chuẩn bao trùm **100% mọi phân khúc thiết bị trên thị trường**:
1. **Container Queries (`container-type: inline-size`)**: Chuyển từ screen-based sang container-based, giúp giao diện tự co giãn mượt mà khi người dùng **chia đôi màn hình (Split View / Slide Over)** trên iPad hoặc **gập/mở điện thoại (Foldables)**.
2. **Fluid Tokens (`clamp()`)**: Tự động điều chỉnh khoảng cách (`--fluid-space-*`) và cỡ chữ (`--fluid-font-*`) theo cả chiều rộng và chiều cao khung nhìn mà không dùng "magic numbers" cố định.
3. **Màn hình siêu rộng (Ultrawide 21:9 & 32:9)**: Khống chế độ rộng tối đa (Golden Reading Zone) và căn giữa (`margin-inline: auto`), giới hạn dòng đọc 65–80 ký tự để người học không bị mỏi cổ.
4. **Smart TV & Màn hình 4K/8K (Ten-Foot UI)**: Vòng tiêu điểm tương phản cao (`:focus-visible`), hỗ trợ điều hướng bàn phím / remote D-pad, tự động phóng to font chữ từ khoảng cách 2–3 mét.
5. **Đồng hồ thông minh & Màn hình phụ (< 320px tròn/vuông)**: Padding hình tròn (`@supports (shape-inside: circle())`), co gọn modal (`.modal-box-adaptive`) và thu nhỏ phím bấm chống cắt góc.
6. **Điện thoại dài (19.5:9 đến 21:9, Dynamic Island, Tai thỏ)**: Hỗ trợ triệt để Safe Area Insets (`--sat`, `--sab`, `--sal`, `--sar`), `interactive-widget=resizes-content` tránh bàn phím ảo che khuất, và bố trí thanh điều hướng trong vùng với của ngón tay cái (Thumb Zone).

---

## 6. Schema Dữ liệu Câu hỏi

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

## 7. Quy ước Bắt buộc Khi Chỉnh sửa Code

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

## 8. Các Lệnh Kiểm tra Nhanh (Cheat Sheet)

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
