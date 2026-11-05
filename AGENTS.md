# Hướng dẫn Toàn diện cho Agent (TinHocHub)

Tài liệu này được biên soạn nhằm giúp các Agent AI kế nhiệm nắm bắt trọn vẹn kiến trúc, trạng thái hiện tại, quy tắc nghiệp vụ, luồng bảo mật và quy trình triển khai của dự án **TinHocHub**.

---

## 1. Tổng quan Dự án

- **Tên dự án:** TinHocHub – Website Ôn tập & Thi thử môn Tin học THPT (Khối 10, 11, 12).
- **Mục tiêu:** Cung cấp nền tảng ôn thi theo chương trình GDPT 2018 và cấu trúc định dạng đề thi Tốt nghiệp THPT 2025 của Bộ Giáo dục & Đào tạo.
- **Mô hình kiến trúc:** Ứng dụng Web Động Đa Nền Tảng (Dynamic Realtime Web App) theo kiến trúc Local-First kết hợp Cơ Sở Dữ Liệu Đám Mây (Google Firebase Realtime Database / REST API).
- **Lưu trữ dữ liệu:** Cơ chế 2 tầng (Two-Tier Data Layer): Phía client siêu tốc qua `localStorage` (offline-first) và tự động đồng bộ thời gian thực đa thiết bị thông qua `CloudSync` (`js/cloud-sync.js`).
- **Dữ liệu ngân hàng câu hỏi:** 4.098 câu hỏi chuẩn trắc nghiệm 4 lựa chọn (MCQ) và Đúng/Sai (DS) lưu tại thư mục `data/` (`grade_10.json`, `grade_11.json`, `grade_12.json`, `manifest.json`), được trích xuất và chuẩn hóa từ file Excel gốc `Ngan Hang de.xlsx`.
- **Triển khai & Hosting:** Cloudflare Pages / Workers kết nối tự động với GitHub Repository:
  - GitHub Repo: `https://github.com/nghiatnhcmue/on-tap.git` (nhánh `main`).
  - **Production URL DUY NHẤT:** https://on-tap.nghiaedu.workers.dev/ (Tập trung toàn bộ vào domain này).
  - **Bản phát hành chuẩn hóa:** 20261102_99 (Đồng bộ toàn diện Live Video, Trường Lớp Dropdown, Gamification).

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
│   ├── cloud-sync.js       # Hệ thống Đồng bộ Cơ sở Dữ liệu Đám mây Real-time (Firebase / REST API)
│   ├── storage.js          # Lớp truy xuất LocalStorage & điều phối CloudSync: tài khoản, lịch sử thi, phòng thi
│   ├── practice.js         # Màn hình Ôn tập: hỗ trợ MCQ, Đúng/Sai (DS), Trả lời ngắn (TLN), Single & List mode
│   ├── exam.js             # Màn hình Thi thử: đề chuẩn Bộ GD 2025 (28 câu = 10đ), đề tự chọn, timer, nộp bài
│   ├── proctor.js          # Hệ thống Giám sát Chống gian lận: fullscreen, tab blur, chống copy/devtools
│   ├── exam-rooms.js       # Quản lý Phòng thi & Giao đề: tạo phòng, cấp mật khẩu, link trực tiếp ?room=XYZ
│   ├── leaderboard.js      # Bảng Vinh Danh Học Sinh: Podium Top 1-2-3, xếp hạng theo ngày/tuần/tháng/năm
│   ├── gradebook.js        # Sổ điểm & Phân tích Tiến trình: theo học sinh, theo lớp, học bạ điện tử, xuất Excel BOM
│   ├── questions-manager.js# Quản lý Ngân hàng đề cho Giáo viên: Thêm, Sửa, Xóa câu hỏi, Xuất/Nhập JSON
│   ├── admin-manager.js    # Bảng điều khiển Quản trị viên (Admin): đổi mã bảo mật, phân vai, Archive.org Uploader
│   ├── interactive-video.js# Bài Giảng Video Tương Tác: điểm dừng, câu hỏi đếm ngược, truyền điểm realtime
│   ├── search.js           # Tìm kiếm tức thì 4.098 câu hỏi theo từ khóa, khối, chủ đề, cấp độ
│   ├── print.js            # Xuất đề thi in ấn chuẩn A4 kèm bảng đáp án và hướng dẫn chấm
│   └── utils.js            # Tiện ích chung, trọng tâm là hàm chống XSS escapeHtml()
├── data/
│   ├── manifest.json       # Thống kê metadata (tổng 4.098 câu, 93 video bài giảng, checkpoints điểm dừng)
│   ├── grade_10.json       # 1.379 câu hỏi Khối 10 (gồm MCQ 1, 2, 3, 4 và Đúng/Sai DS)
│   ├── grade_11.json       # 1.240 câu hỏi Khối 11 (gồm MCQ 1, 2, 3, 4)
│   └── grade_12.json       # 1.479 câu hỏi Khối 12 (gồm MCQ 1, 2, 3, 4 và Đúng/Sai DS)
├── upload_archive.py       # Công cụ CLI tải hàng loạt 93 video bài giảng lên Archive.org S3
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
     - Thẻ `#app-header` **luôn mở tương tác (`remove pointer-events-none`)** để nút `#auth-btn-login` luôn bấm được mọi lúc.
     - Thanh điều hướng tab `#desktop-nav button` bị vô hiệu hóa (`pointer-events-none opacity-40`).
     - Thanh điều hướng di động `#mobile-bottom-nav` bị ẩn (`hidden`).
     - Hộp thoại `#modal-login` mở ra và **nút đóng (X) bị ẩn**, sự kiện click backdrop bị chặn không cho đóng.
     - Hiển thị thanh cố định `#auth-gatekeeper-overlay` nhắc nhở đăng nhập ngay trên giao diện với nút bấm 1 chạm.
   - Nếu `Auth.isLoggedIn()` nhưng `!Auth.isProfileComplete()`:
     - Giao diện chính vẫn bị khóa làm mờ.
     - Tự động mở `#modal-required-profile` yêu cầu học sinh bổ sung: **Họ và tên, Lớp, Trường** (chỉ áp dụng duy nhất trong lần đầu tiên học sinh mới đăng nhập vào hệ thống; nếu học sinh đã có thông tin trong hệ thống thì không hiện lại, học sinh có thể tự bấm nút "Cập nhật hồ sơ" hoặc "Đổi Lớp/Trường" bất cứ lúc nào).
   - Nếu `Auth.isLoggedIn()` và `Auth.isProfileComplete()`:
     - Mở khóa toàn bộ giao diện, xóa hiệu ứng mờ, ẩn banner nhắc nhở, khôi phục tương tác bình thường.
2. Khi người dùng bấm **Đăng xuất** (`Auth.logout()`):
   - Xóa `tinhoc_user` khỏi `localStorage`.
   - Gọi `notifyAuthChange()` -> Kích hoạt `enforceAuthentication()` lập tức khóa lại trang.

### 3.2. Cấu trúc Modal Auth Portal (`#modal-login`)
Gồm 2 tab chuyển đổi:
- **Tab Đăng Nhập (`#auth-panel-login`)**:
  - Tích hợp **Google Firebase Authentication** (nút đăng nhập Google qua Firebase Popup `signInWithPopup(GoogleAuthProvider)` + cơ chế tự phục hồi nếu API key sai).
  - Form **"Đăng nhập bảo mật bằng Email/Tài khoản + Mật khẩu"** (`#form-login-direct`): Định danh duy nhất theo Email/Username và xác thực bắt buộc bằng **Mật khẩu cá nhân** (Password) để chống mạo danh và chống trùng tên học sinh.
  - Khung **"Tài khoản trên thiết bị này"** (`#saved-accounts-section`): Liệt kê tối đa 5 tài khoản gần nhất lưu trong `Storage.getAccountsList()`. Bấm 1 chạm để đăng nhập tức thì trên thiết bị riêng.
  - 3 nút Đăng nhập trải nghiệm nhanh: Học sinh (HS), Giáo viên (GV), Admin.
  - Nút cài đặt Firebase Web API Key (`#btn-open-firebase-config`) cho giáo viên/admin.
- **Tab Đăng Ký Mới (`#auth-panel-register`) & Cập nhật Hồ sơ (`#modal-required-profile`)**:
  - Bắt buộc nhập **Email định danh duy nhất**, **Mật khẩu cá nhân** (tối thiểu 6 ký tự) và **Xác nhận mật khẩu** để ngăn chặn hoàn toàn việc người khác biết email mạo danh vào tài khoản.
  - Hỗ trợ nút **"Đăng ký nhanh với Google (Firebase)"** (`#google-signup-btn-container`) tự động lấy Email, Họ tên & Avatar qua Firebase Auth (bảo mật đa nhân tố của Google).
  - Form nhập thông tin dạng danh sách chuẩn hóa (`SCHOOLS_DATA` trong `js/auth.js`):
    - **EMASI**: Khối 10 (`10E`, `10I1`, `10I2`), Khối 11 (`11E`), Khối 12 (`12E`).
    - **Phổ thông Năng khiếu**: Khối 12 (`12TOAN`, `12LI`, `12HOA`, `12SINH`, `12VAN`, `12ANH`).
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
3. **📖 Luyện Tập Theo Bài Học & Thi Thử Tự Chọn (`by_lesson`):**
   - Hỗ trợ 2 chế độ linh hoạt: **1 Bài Cụ Thể** hoặc **Chọn Nhiều Bài Học (Multi-lessons Checklist)** để tạo đề ôn thi giữa kỳ/học kỳ.
   - **Ôn trọn vẹn toàn bộ câu hỏi:** Không giới hạn cứng ở 25 câu; tự động nhận diện chính xác tổng số câu của bài (ví dụ 44/44 câu) và cho phép học sinh ôn toàn bộ hoặc chọn các mốc (10, 15, 20, 25, 30, 40...).
   - **Chế độ Học Thông Minh (Mastery Learning):** Tự động ghi nhận câu đã trả lời đúng vào `Storage.recordMasteredQuestion` và gỡ khỏi danh sách câu sai. Tùy chọn **"Bỏ qua câu đã làm đúng"** giúp học sinh chỉ ôn các câu chưa thuộc hoặc từng làm sai, kèm thanh tiến trình thành thạo trực quan và nút **"Ôn lại từ đầu"** (`clearMasteredQuestions`).
   - **Thời gian làm bài tự do:** Hỗ trợ tùy chọn **"Tự do (Không giới hạn thời gian)"** với timer đếm xuôi, không tự nộp bài khi hết giờ, phù hợp để học sinh nghiền ngẫm toàn bộ câu hỏi.
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
- **Cấu hình hình thức đề phòng thi & Ma trận bài học tùy biến:**
  - Hỗ trợ cả 4 hình thức: Đề chuẩn Bộ GD 2025, Trộn theo Chủ đề, Trộn theo Bài học (15p), hoặc Ma trận tự chọn.
  - **Phạm vi nội dung kiểm tra (`contentScope`):**
    - `Toàn bộ khối lớp`: Trộn ngẫu nhiên từ toàn bộ ngân hàng câu hỏi của khối.
    - `Chọn chủ đề / Nhiều bài học cụ thể & Tỉ lệ số câu`: Cho phép Giáo viên tích chọn nhiều Chủ đề và nhiều Bài học cụ thể cho một bài kiểm tra. Giáo viên có thể điều chỉnh số lượng câu hỏi hoặc tỉ lệ (%) cho từng bài học độc lập, có phím tắt "Chia đều số câu", thanh kiểm tra khớp tổng câu thời gian thực.
    - Khi học sinh vào thi, hệ thống phân bổ câu hỏi chính xác theo ma trận bài học đã cấu hình (với Đề chuẩn Bộ GD 2025: phân bổ 24 câu MCQ theo tỉ lệ các bài và bổ sung đúng 4 câu Đúng/Sai).
    - `Tự Soạn Từng Câu Hỏi & Tùy Biến Đề Thi (Manual Question Builder)`: Cho phép Giáo viên tự soạn từng câu hỏi mới trực tiếp vào đề thi (`#modal-manual-add-question`). Hỗ trợ đầy đủ cả 3 dạng câu hỏi: MCQ (4 phương án, chọn đáp án đúng), Đúng/Sai (DS 4 nhận định độc lập theo barem Bộ GD), và Trả lời ngắn (TLN chuẩn hóa chuỗi). Giáo viên có thể chỉnh sửa (`[ ✏️ Sửa ]`) hoặc xóa (`[ 🗑️ Xóa ]`) câu hỏi trực tiếp trên danh sách, có tùy chọn lưu câu hỏi vào Ngân hàng chung của trường, hoặc kết hợp linh hoạt giữa câu tự soạn, câu chọn lọc từ ngân hàng 4.098 câu và câu nhập từ Word/Excel.
  - Tùy chọn đảo câu hỏi, đảo phương án A,B,C,D, và tùy chọn cấp Mã đề thi riêng chống nhìn bài nhau trong phòng thi (`randomExamCode`).
- **Kiểm soát bảo mật khi vào phòng thi (`Storage.validateRoomAccess`):**
  - Bắt buộc kiểm tra: Mã phòng thi, Mật khẩu, Khung giờ mở/đóng.
  - Kiểm tra điều kiện học sinh: So khớp Trường (`user.school`), Khối (`user.grade`), và Lớp (`user.className`) của tài khoản học sinh với cấu hình giao bài của phòng. Nếu không thuộc đối tượng được giao, hệ thống hiển thị thông báo sư phạm từ chối truy cập.
- **Bộ lọc & Điều phối cho Giáo viên:**
  - Thanh bộ lọc nhanh theo Khối, theo Trường và ô tìm kiếm tức thì theo tên/mã phòng.
  - Nút **"Copy thông báo lớp"** tự động định dạng mẫu tin nhắn chuyên nghiệp (gồm Tên bài, Trường, Lớp, Hình thức đề, Thời lượng, Khung giờ, Mật khẩu, Link trực tiếp `${origin}?room=${roomId}`) để Thầy Cô gửi ngay vào Zalo/Facebook của lớp.
- **Bảng Nhiệm Vụ & Bài Tập Học Sinh Được Giao Trên Trang Chủ (`#home-student-assigned-tasks`):**
  - Hiển thị trực quan ngay đầu trang chủ cho học sinh, tự động lọc bài tập/đề thi theo đúng **Trường (`user.school`)**, **Khối (`user.grade`)** và **Lớp (`user.className`)**.
  - **Phân loại 4 trạng thái nhiệm vụ rõ ràng:**
    - 🔴 **Cần làm ngay (`pending`):** Bài thi đang mở và học sinh chưa làm (viền phát sáng, nhấp nháy, kèm hạn chót và nút **`[ 🚀 Vào Làm Bài Ngay ]`** 1 chạm tự điền mã phòng và mật khẩu).
    - 🟢 **Đã hoàn thành (`completed`):** Bài thi học sinh đã nộp (hiển thị điểm số, số câu đúng/tổng câu và nút **`[ 👁️ Xem Lại Kết Quả & Đáp Án ]`**).
    - 🟡 **Sắp mở đề (`upcoming`):** Chưa đến khung giờ làm bài (hiển thị thời gian mở đề).
    - ⚫ **Đã hết hạn (`expired`):** Quá hạn nộp bài.
  - **Tích hợp thông báo Tiết học Live Video trực tuyến:** Tự động phát hiện nếu có phòng Live Video của lớp đang mở, hiển thị banner động **`🔴 Đang phát trực tiếp`** kèm nút **`[ 🎟️ Vào Lớp Trực Tuyến Ngay ]`**.

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

### 4.6. Bài Giảng Video Tương Tác, Chọn/Tải Video Trực Tiếp, Chống Gian Lận & Trình Thiết Lập Câu Hỏi (`js/interactive-video.js`)
- **Giao diện Rạp Chiếu & Lớp Học Tương Tác Hiện Đại (Cinema Classroom 2-Column View):**
  - **Sân khấu Video chính (70% Desktop / 100% Mobile):** Aspect 16:9 sắc nét, thanh Seekbar tùy biến gắn cờ mốc dừng (🚩 Pins) trực quan tại đúng tọa độ phần trăm, đèn pulse xanh báo hiệu mốc kế tiếp, cờ xanh báo đã hoàn thành. Bộ điều khiển tùy chỉnh: Play/Pause, Tua lại 10s, Volume, Tốc độ phát (tối đa 1.25x), Toàn màn hình stage.
  - **Bảng Lộ Trình Mốc Dừng (Checkpoints Roadmap) & Sổ Tay Ghi Chú:** Cột bên phải hiển thị danh sách từng mốc kiến thức, thời lượng và trạng thái; tích hợp ô Sổ tay ghi chú bài học tự động lưu (`localStorage`) thời gian thực cho học sinh.
- **Cơ Chế Bắt Chặn Mốc Dừng Chuẩn Xác Tuyệt Đối (Không Bỏ Sót Frame):**
  - Thuật toán `getNextUncompletedCheckpoint()` kết hợp điều kiện `curTime >= nextCp`: Tự động dừng video ngay tức khắc khi chạm hoặc vượt qua mốc dừng, ghim chính xác `video.currentTime = nextCp` và kích hoạt hộp thoại câu hỏi tương tác.
  - Đồng hồ đếm ngược vòng tròn chuyển động SVG (`SVG Circular Timer`) và hỗ trợ phím tắt trả lời nhanh <kbd>A</kbd>, <kbd>B</kbd>, <kbd>C</kbd>, <kbd>D</kbd> hoặc <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>4</kbd>, <kbd>Enter</kbd>.
- **Hệ Thống Giám Sát Chống Gian Lận Đa Nền Tảng (Proctor Anti-Cheat Engine):**
  - Tích hợp động cơ `Proctor`: Giám sát chuyển tab, vuốt màn hình sang ứng dụng khác, chia đôi màn hình (Split-Screen), phím tắt F12, DevTools, chụp màn hình.
  - Màn chắn làm mờ tức thì (`body.proctor-privacy-shield #view-interactive-video`).
  - **Chống tua bài (Anti-Skip / Anti-Scrubbing Guard):** Bắt sự kiện `seeking` để ngăn chặn hoàn toàn việc học sinh tua qua các mốc câu hỏi chưa hoàn thành.
  - **Giới hạn tốc độ phát (Anti-Speed Hack):** Giới hạn tối đa 1.25x trên sự kiện `ratechange`.
  - Cảnh báo vi phạm tối đa 3 lần kèm chuông báo động Web Audio API trước khi tự động đình chỉ bài học và lưu biên bản giám sát.
- **Tải / Chọn Video Trực Tiếp Trên Web (Local Video Streaming & Fallback):**
  - Học sinh và Giáo viên có thể nạp cả thư mục video hoặc chọn từng file video `.mp4` trực tiếp từ máy tính (`InteractiveVideo.localVideoMap`).
  - Video được stream tức thời qua Blob Object URL (`URL.createObjectURL(file)`), xem và làm câu hỏi dừng trơn tru mà không cần internet hay chờ video tải lên server.
  - Khi video từ đám mây Archive.org chưa sẵn sàng, hệ thống hiển thị màn chắn thông minh với nút chọn video máy tính 1 chạm để tiếp tục học.
  - Hỗ trợ đổi đường link URL video trực tiếp (`customVideoUrl`) và tích hợp nút tải lên Archive.org S3 cho Admin.
- **Trình Thiết Lập Mốc Dừng & Câu Hỏi Video (Question & Checkpoint Editor):**
  - Dành riêng cho Giáo viên & Admin (`Auth.isTeacher() || Auth.isAdmin()`).
  - Giao diện quản lý trực quan: Xem toàn bộ timeline mốc dừng, thời lượng đếm ngược (10s, 15s, 20s, 30s, 45s, 60s), cấp độ nhận thức (Mức 1-4, Đúng/Sai), câu hỏi và 4 phương án A/B/C/D.
  - Nút thông minh **"⏱️ Lấy mốc"**: Tự động lấy giây video hiện tại đang dừng để điền vào mốc câu hỏi mới.
  - Thao tác Thêm, Sửa, Xóa và Khôi phục mặc định từ ngân hàng đề gốc.
  - Tự động lưu vào `Storage` và đồng bộ thời gian thực lên Firebase Cloud Database (`/custom_video_questions`) qua `CloudSync`.

### 4.7. Lớp Học Video Tương Tác Thời Gian Thực (Live Interactive Classroom Video - Kahoot/Edpuzzle Style) (`js/live-video.js`)
- **Kiến trúc Đồng bộ Thời gian thực Đám mây (Firebase RTDB + SSE + Short Polling):**
  - Node đám mây: `/live_video_rooms/{roomId}`.
  - Hỗ trợ luồng dữ liệu hai chiều: Server-Sent Events (`EventSource`) kết hợp heartbeat và short-polling 1.2s đảm bảo hoạt động ổn định trên 100% mạng trường học, WiFi, 4G/5G mà không bị chặn tường lửa WebSocket.
- **Cơ Chế Bật/Tắt Video Trên Máy Học Sinh (`streamVideoToStudents`):**
  - **Chế độ Máy Chiếu Lớp Học (Mặc định khuyến nghị - `streamVideoToStudents = false`):**
    - Phù hợp với mô hình lớp học phổ thông tại Việt Nam (Thầy/Cô chiếu video lên TV/Máy chiếu lớn đầu lớp cho cả lớp 40 học sinh cùng xem).
    - Máy học sinh **hoàn toàn KHÔNG tải file video nặng và KHÔNG phát âm thanh**, giúp tiết kiệm 100% băng thông Wifi trường học và tránh tiếng ồn hỗn loạn.
    - Màn hình học sinh hiển thị **Bảng Đồng Hành Lớp Học (Projector Companion Screen)**: hiển thị hướng dẫn nhìn máy chiếu, tiến trình mốc dừng, STT hàng đợi và thành tích cá nhân.
    - **Khi đến mốc dừng câu hỏi:** Màn hình học sinh **tự động bung popup câu hỏi trắc nghiệm A, B, C, D toàn màn hình** để học sinh bấm chọn và nộp bài!
  - **Chế độ Trực Tuyến Độc Lập (`streamVideoToStudents = true`):**
    - Phù hợp khi học sinh học online tại nhà hoặc trên máy tính riêng.
    - Video phát trên từng máy học sinh, tự động tắt tiếng (`muted = true`) để chống vọng âm.
  - **Nút Chuyển Đổi Tức Thời 1 Chạm:** Nút `[ 🖥️ Máy Chiếu / 🎬 Video máy HS ]` trên Header Bảng Điều Khiển Master cho phép Giáo viên chuyển đổi trạng thái bất cứ lúc nào trong buổi học mà không cần tạo lại phòng.
- **Cơ Chế Đồng Bộ Khung Hình Siêu Chính Xác (Frame-Precision Synchronization):**
  - Khi Giáo viên bấm **Tạm dừng (Pause)** hoặc **Seek (Tua Seekbar / ±10s)**: Lập tức truyền `currentTime` và `state: 'paused'` lên Firebase.
  - Máy học sinh áp dụng thuật toán `applyPreciseSync`: cưỡng chế seek đúng vị trí `currentTime` của Giáo viên (sai số < 0.3s) ngay cả khi video chưa load xong metadata qua listener `loadedmetadata`/`canplay`, triệt tiêu hoàn toàn hiện tượng lệch slide/khung hình giữa máy Thầy/Cô và máy Học sinh.
  - Tần suất phát sóng thời gian của Giáo viên được tối ưu còn 1.8s/lần khi đang phát.
- **Bảng Điều Khiển Master Của Giáo Viên (Teacher Master Cockpit):**
  - **Tạo phòng:** Phân quyền theo Trường, Khối (10, 11, 12), Lớp cụ thể (vd: EMASI 12E, PTNK 12TOAN, Chu Văn An 10A1...) và chọn bài giảng video từ ngân hàng 93 bài học.
  - Cấp mã phòng ngắn gọn (vd: `LIVE-892`) và link mời trực tiếp (`${origin}?live_video=LIVE-892`).
  - **Sĩ số & Điểm danh trực tiếp:** Badge nhấp nháy đèn xanh hiển thị số lượng học sinh đang online, danh sách từng em kèm lớp và điểm số.
  - **Điều khiển phát đồng bộ (Master Sync):** Nút `▶ Bắt đầu phát (Cả lớp cùng xem)` và `⏸ Tạm dừng cả lớp (Để giảng bài)` phát lệnh đồng loạt lên toàn bộ màn hình học sinh.
  - **Chuyển mốc & Bắt mốc tự động:** Tự động bắt dừng khi video đến checkpoint hoặc bấm nút `❓ Đặt câu hỏi ngay` / `⏩ Mốc kế tiếp`.
  - **Khảo sát Trực tiếp (Live Polling Chart):** Cập nhật từng giây biểu đồ 4 cột A, B, C, D tỉ lệ học sinh chọn theo thời gian thực và số em đã nộp bài (`28/30 HS`).
  - **Công bố đáp án:** Nút `📢 Mở đáp án cho cả lớp` khóa nộp bài, tô xanh đáp án đúng và phân tích tỉ lệ đúng của lớp. Nút `▶ Tiếp tục bài giảng` đưa cả lớp xem tiếp đoạn sau.
- **Màn Hình Rạp Chiếu Phim Của Học Sinh (Student Cinema Stage):**
  - Tự động chuyển chế độ **Toàn Màn Hình (Fullscreen)** / iOS Focus Mode.
  - **Khóa tua tự do (Locked Controls):** Học sinh không tự ý tua hay play/pause; video chạy hoàn toàn theo điều phối của Giáo viên.
  - **Giao diện Câu hỏi Trực quan (Kahoot-Style):** 4 thẻ phương án A (Đỏ), B (Xanh dương), C (Vàng), D (Xanh lục) to rõ ràng, dễ bấm trên cả điện thoại và máy tính.
  - **Phản hồi Tức thời:** Khi Thầy/Cô mở đáp án, nếu đúng nhận ngay chuông reo và pháo hoa Confetti 🎉 (`+100 điểm`), nếu sai nhận giải thích và xem phổ bình chọn của cả lớp.
- **Tổng Kết Cuối Buổi Học & Xuất Báo Cáo:**
  - **Bục Vinh Danh 3D (Podium Top 1 - 2 - 3):** Xếp hạng 3 học sinh xuất sắc nhất tiết học với Cúp Vàng, Bạc, Đồng và hiệu ứng Confetti rực rỡ.
  - **Học bạ cá nhân:** Mỗi học sinh xem được thứ hạng, số câu đúng và tổng điểm của bản thân.
  - **Lưu Sổ Điểm:** Nút `💾 Lưu vào Sổ Điểm Lớp` tự động ghi nhận kết quả vào `Gradebook` và `CloudSync`.
  - **Xuất Báo Cáo Excel Chuẩn Quốc Tế:** Nút `📥 Xuất Báo Cáo Excel` tải file `.csv` có byte order mark UTF-8 (`\uFEFF`), mở trực tiếp trên Excel tiếng Việt không lỗi font.

### 4.8. Đóng Góp Câu Hỏi Excel, Video Mở Rộng & Quy Trình Phê Duyệt Của Admin (`js/questions-manager.js`, `js/interactive-video.js`, `js/admin-manager.js`)
Hệ thống cho phép giáo viên đóng góp câu hỏi từ Excel và đăng tải video bài giảng mở rộng tự do, được quản lý chặt chẽ qua quy trình kiểm duyệt của Ban Quản Trị (Admin):
- **1. Thêm Câu Hỏi Bằng Excel (.xlsx, .xls, .csv):**
  - **File mẫu chuẩn 2 Sheet (`data/Mau_Nhap_Cau_Hoi_TinHocHub.xlsx`):** Sheet 1 gồm 14 cột chuẩn (STT, Môn học/Lĩnh vực, Khối lớp, Chủ đề, Bài học, Loại câu MCQ/DS/TLN, Mức độ 1/2/3/4/DS/TLN, Nội dung câu hỏi, Phương án A, B, C, D, Đáp án đúng, Giải thích). Sheet 2 hướng dẫn chi tiết quy tắc điền dữ liệu.
  - Tải file mẫu động bằng SheetJS ngay trên trình duyệt qua nút `Tải file Excel mẫu (.xlsx)` hoặc tải trực tiếp file mẫu từ thư mục `data/`.
  - Phân tích và nhận diện tự động cấu trúc cột, mở **Modal Xem trước (Excel Preview Modal)** phân loại số câu MCQ, Đúng/Sai, Trả lời ngắn trước khi lưu.
- **2. Kho Câu Hỏi Đóng Góp Của Giáo Viên & Vòng Đời Duyệt (`tinhoc_teacher_contributions`):**
  - Lưu trữ theo tài khoản của từng giáo viên: Tab `Kho câu hỏi đóng góp của tôi` trong Quản lý câu hỏi.
  - Vòng đời trạng thái: Bản nháp (`draft`) -> Chờ duyệt (`pending`) -> Đã phê duyệt (`approved`) hoặc Từ chối (`rejected` kèm lý do góp ý của Admin).
  - Nút **`[ 🚀 Gửi Lên Kho Chung (Yêu Cầu Duyệt) ]`** đẩy trạng thái sang `pending` và tự động đồng bộ lên Firebase `/teacher_contributions`.
- **3. Đóng Góp Video Bài Giảng & Chuyên Đề Tự Do Của Giáo Viên (`tinhoc_teacher_videos`):**
  - Không giới hạn môn Tin học: Giáo viên có thể đóng góp bài giảng mọi môn học (Toán, Lý, Hóa, Sinh, Ngoại ngữ, AI, Lập trình Game, Chuyên đề tự chọn...) và chọn Khối lớp linh hoạt (10, 11, 12, Đại trà/Tất cả).
  - Hỗ trợ nguồn phát video đa dạng: Google Drive (tự động chuyển sang link stream CDN `lh3.googleusercontent.com/d/`), Dropbox raw stream, Archive.org CORS stream, và link MP4/WebM trực tiếp.
  - Thiết lập các mốc dừng tương tác (Checkpoints) kèm câu hỏi, đáp án, thời gian dừng (phút:giây) và giải thích chi tiết.
  - Phân loại 3 tab chuyên nghiệp trong Video Tương Tác: `[ 📚 Video Theo SGK ]`, `[ 🎬 Chuyên Đề & Video Mở Rộng ]`, `[ 👤 Video Đóng Góp Của Tôi ]`.
- **4. Trung Tâm Phê Duyệt Của Quản Trị Viên (Admin Dashboard - Section 1B):**
  - Thẻ KPI hiển thị số lượng đóng góp đang chờ duyệt kèm hiệu ứng cảnh báo trực quan.
  - Bảng kiểm duyệt gói câu hỏi Excel: Xem toàn bộ nội dung câu hỏi trong modal chi tiết, nút **`[ ✅ Phê Duyệt ]`** (tự động nạp toàn bộ câu hỏi vào ngân hàng chung của trường) và nút **`[ ❌ Từ Chối ]`** (nhập lý do phản hồi cho Giáo viên).
  - Bảng kiểm duyệt video bài giảng: Xem trước video trực tiếp, nút **`[ ✅ Duyệt Phát Hành ]`** (công khai vào Tab Chuyên đề mở rộng cho toàn bộ học sinh và giáo viên cùng học) và nút **`[ ❌ Từ Chối ]`**.
  - Tự động đồng bộ thời gian thực đa chiều qua `CloudSync.syncTeacherContributions()` và `CloudSync.syncTeacherVideos()`.

### 4.9. Đấu Trường Game Trí Tuệ Gamification (Blooket & Wayground Style) & Kiến Trúc Pluggable Engine (`js/arena.js`, `js/game-engine.js`)
Hệ thống tích hợp mô hình Đấu trường Gamification học tập đỉnh cao kết hợp giữa **Blooket** và **Wayground (Quizizz)**, kết nối trực tiếp với LMS Sổ điểm điện tử theo kiến trúc **"Pluggable Game Modes over Decoupled Question Sets"**:
- **1. Tách biệt Data Layer (Data Layer Decoupling):**
  - Ngân hàng đề thi giáo dục (`QuizQuestion`) hoàn toàn độc lập với các thuộc tính của game loop.
  - Normalized Session Container: `SessionState { id, hostId, quizId, gameMode, status, currentQuestionIndex, totalQuestions, questions, players, settings, metadata, updatedAt }`.
  - Universal Player State: Mỗi học sinh sở hữu các thuộc tính cơ bản (`score`, `streak`, `correctCount`) kèm dữ liệu mở rộng (`metadata` và `inventory`) phục vụ cho từng game mode riêng biệt.
- **2. Kiến trúc Strategy Adapter (`GameModeHandler`):**
  - Khai báo chuẩn hóa TypeScript tại `js/types/game-engine.d.ts` và triển khai tại `js/game-engine.js`:
    - `BaseGameModeHandler`: Lớp nền tảng quản lý ranking và hooks chung.
    - `ResourceQuestHandler` (Blooket Gold Quest): Mở 3 rương báu bí mật sau mỗi câu đúng, x2 Vàng, Khiên thần, Cướp vàng từ đối thủ.
    - `SpeedRaceHandler` (Wayground Speed & Combo): Tính điểm time-decay, chuỗi streak nhân điểm x1.5/x2/x3, mở khóa power-up Đóng băng đối thủ, x2 điểm câu kế.
    - `BossRaidHandler` (Co-op Boss Hunt): Cả lớp hợp lực đánh Siêu Trùm Bug khổng lồ.
    - `ClassicKahootHandler` (Classic Speed): Độ chính xác và tốc độ truyền thống kèm biểu đồ cột phân tích đáp án A, B, C, D.
- **3. Authoritative Event Pipeline & Giao Dịch Nguyên Tử (Atomic Transactions):**
  - `SUBMIT_ANSWER`: Máy chủ/Host thẩm định câu trả lời authoritatively, ngăn chặn hoàn toàn gian lận điểm từ client.
  - `TRIGGER_ACTION`: Xử lý nguyên tử các thao tác tương tác đa người chơi (mở rương, cướp vàng có kiểm tra khiên bảo vệ). Nếu nạn nhân có Khiên Thần, khiên sẽ tự động tiêu hao để chặn đòn cướp vàng.
  - `SYNC_STATE`: Tạo delta cập nhật thu gọn (Lightweight Leaderboard Delta) truyền qua WebSocket / Firebase RTDB, tránh nghẽn băng thông mạng.
- **4. Quy Trình Tạo Trận Đấu 3 Bước Dành Cho Giáo Viên (Host Flow):**
  - **Bước 1 (Quiz Set & Question Selector tương tự Phòng thi):**
    - Chọn ngân hàng câu hỏi (Khối 10, 11, 12 hoặc Gói Đề Excel đóng góp) và số câu hỏi (10, 15, 20, 25, 30, 40 câu hoặc toàn bộ).
    - Hỗ trợ 4 chế độ phạm vi câu hỏi linh hoạt:
      - 🌐 **Toàn khối:** Trộn ngẫu nhiên từ toàn bộ ngân hàng câu hỏi của khối.
      - 📁 **Theo Chủ đề:** Lọc câu hỏi theo từng Chủ đề cụ thể trong chương trình.
      - 📖 **Theo Bài học (Multi-lessons Checklist):** Danh sách tích chọn nhiều bài học độc lập kèm thống kê số câu của từng bài, nút "Chọn tất cả" / "Bỏ chọn".
      - 📝 **Chọn từng câu cụ thể:** Bảng duyệt trực tiếp câu hỏi kèm bộ lọc từ khóa, lọc bài học, lọc mức độ nhận thức (Biết, Hiểu, Vận dụng, Vận dụng cao), xem trước 4 phương án A, B, C, D kèm đáp án đúng, tích chọn từng câu hoặc chọn tất cả câu đang lọc.
  - **Bước 2 (Game Mode):** Chọn chế độ chơi (Resource Quest, Speed Race, Boss Raid, Classic Kahoot).
  - **Bước 3 (Mode Parameters):** Thiết lập thời gian mỗi câu (15s-45s), Mục tiêu kết thúc (Goal Cap: 500-2500 vàng hoặc thi hết câu hỏi), Tần suất phần thưởng (Thấp, Tiêu chuẩn, Cao) và Phân lớp ghi sổ điểm tự động.
- **5. Phía Học Sinh (Student HUD & Action Dynamic Injection):**
  - Khung câu hỏi hiển thị câu hỏi và 4 phương án A, B, C, D chuẩn GDPT 2018 mà không bị can thiệp.
  - Dynamic Game HUD tiêm tự động lên trên cùng (Vàng, Khiên, Streak Combo, Điểm số, Thẻ bài).
  - Hộp thoại chọn 3 rương báu và Bảng chọn đối thủ cướp vàng bật lên tự nhiên khi học sinh trả lời đúng.
- **6. Bộ Linh Thú Blooks (12 Blook Avatars):**
  - Danh mục 12 linh thú hoạt họa SVG rực rỡ: Cyber Bot (🤖), Ninja Neko (🐱), Rồng Lửa (🐉), Pháp Sư (🧙‍♂️), Phi Hành Gia (🚀), Cáo Tinh Anh (🦊), Cú Thông Thái (🦉), Kỳ Lân (🦄), Pixel Alien (👾), Sư Tử Chúa (🦁), Kungfu Panda (🐼), Cá Mập Tech (🦈).
- **7. Bộ Tổng Hợp Âm Thanh Web Audio API Động (Sound Synthesizer):**
  - Âm thanh không phụ thuộc file ngoài: Tiếng chuông đúng (`playChime`), tiếng còi sai (`playWrong`), tiếng mở rương báu (`playChest`), tiếng cướp vàng (`playSteal`), tiếng nổ sát thương Boss (`playBossHit`), tiếng đếm ngược (`playTick`), tiếng kèn chiến thắng (`playFanfare`).
- **8. Tích Hợp LMS Sổ Điểm Điện Tử & Báo Cáo Sư Phạm:**
  - Nút **`[ 💾 Lưu Vào Sổ Điểm Lớp ]`**: Tự động chuyển đổi điểm số / số câu đúng thành thang điểm 10.0 và lưu vào Sổ điểm lớp học tương ứng trên `Gradebook` và `CloudSync`.
  - Phân tích sư phạm chuyên sâu: Tỷ lệ chính xác toàn lớp, thống kê câu hỏi hóc búa nhất (Hardest Questions).
  - Nút **`[ 📥 Xuất Báo Cáo Excel ]`**: Xuất file CSV chuẩn UTF-8 BOM (`\uFEFF`), mở trực tiếp bằng Excel tiếng Việt không lỗi font.
  - Kết nối phòng tức thì qua **Mã PIN 6 số**, **Mã QR Code động** và link trực tiếp `?game=XYZ`.

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
