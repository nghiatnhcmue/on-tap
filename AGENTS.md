<!--
  AGENTS.md — Phần bổ sung BẢO MẬT cho dự án TinHocHub
  Mục đích: ràng buộc hành vi của agent (Antigravity) khi thực thi spec.md.
  Cách dùng: nối phần này vào CUỐI file AGENTS.md hiện có, HOẶC để agent đọc kèm.
  Khi có xung đột, các quy tắc trong phần "LÀN RANH ĐỎ" dưới đây được ƯU TIÊN CAO NHẤT.
-->

# AGENTS.md — Quy tắc Bảo mật & Khắc phục (TinHocHub)

> Đọc kèm `spec.md` (đặc tả công việc theo giai đoạn) và `prompt-antigravity.md` (prompt giao việc).
> Bối cảnh: người dùng chủ yếu là **học sinh THPT dưới 18 tuổi**. Mọi quyết định mặc định nghiêng về bảo vệ dữ liệu của các em.

---

## A. BỐI CẢNH BẮT BUỘC NẮM TRƯỚC KHI SỬA

Kiến trúc hiện tại là **client-authoritative**: xác thực, phân quyền, chấm điểm, giữ bí mật đều nằm ở trình duyệt; Firebase Realtime Database bị truy cập trực tiếp **không token**. Đây là gốc rễ của mọi lỗ hổng. Mọi thay đổi phải kéo logic nhạy cảm về phía **server** (Firebase Security Rules + Cloudflare Worker), không vá lặt vặt ở client rồi coi là xong.

Danh sách lỗ hổng (V1–V10) và vị trí mã: xem `spec.md` §0. Agent phải tra đúng dòng trong mã **thực tế** trước khi sửa, vì số dòng có thể đã đổi.

---

## B. LÀN RANH ĐỎ — KHÔNG BAO GIỜ VI PHẠM

1. **Không bao giờ ghi mật khẩu, khóa S3, service-account, hay bất kỳ bí mật nào vào Realtime Database hoặc vào mã client.** Bí mật chỉ sống trong Worker secret / Firebase Auth / Firebase Console.
2. **Không bao giờ tin dữ liệu từ client cho quyết định nhạy cảm.** Vai trò, điểm số, tính hợp lệ của đáp án phải do Rules hoặc Worker quyết định, không do `localStorage`, không do biến JS, không do tham số request.
3. **Không giữ lại bất kỳ "cửa sau tiện lợi" nào:** mật khẩu vạn năng (`123456`), đăng nhập bằng họ tên, nút "vào nhanh không cần mật khẩu", mã mặc định hiện trên UI, tự-đăng-nhập-demo khi lỗi. Gỡ sạch, không thay bằng biến thể khác.
4. **Không siết Firebase Security Rules trên production trước khi client đã gửi ID token trên mọi request.** Siết sớm = sập web. Luôn thử Rules trên **DB staging** trước.
5. **Không làm rò dữ liệu học sinh ra bên thứ ba** (vd gửi họ tên qua URL tới `ui-avatars.com`). Avatar sinh cục bộ bằng `js/avatars.js`.
6. **Không commit secret, `.env`, service-account JSON, hay khóa vào git.** Nếu cần, thêm vào `.gitignore` và dùng `wrangler secret put`.
7. **Không đổi kiến trúc sang bundler/framework nặng** (Webpack/Vite/React/Vue) trừ khi spec yêu cầu rõ. Giữ ES Modules thuần.

---

## C. QUY TẮC CODE (kế thừa & mở rộng quy ước dự án)

1. **Chống XSS — tuyệt đối:** mọi giá trị do người dùng nhập *hoặc* dữ liệu từ đám mây (`fullName`, `className`, `school`, `title`, `roomId`, tên lớp từ `school_structure`, đáp án, ghi chú, tên người chơi…) khi đưa vào `innerHTML` **BẮT BUỘC** bọc qua `escapeHtml()` từ `js/utils.js`. Khi sửa một template có nội suy chuỗi, kiểm tra **từng** biến trong đó.
2. **ES Modules thuần:** giữ `import/export`, cú pháp tương thích trình duyệt hiện đại. Khi tải trễ thư viện nặng, dùng `import()` động, không thêm bước build bắt buộc cho client.
3. **Lưu trữ:** không tạo khóa `localStorage` tự do; mở rộng đối tượng `Storage` trong `js/storage.js`. Không lưu dữ liệu nhạy cảm (mật khẩu, token dài hạn) vào `localStorage`.
4. **Gọi Realtime Database:** không `fetch` thẳng tới `*.firebasedatabase.app`. Dùng một hàm chung `authedFetch()` tự đính `?auth=<idToken>` (lấy từ `firebase.auth().currentUser.getIdToken()`). Thay thế **mọi** lệnh fetch RTDB hiện có bằng hàm này.
5. **Ngôn ngữ UI:** toàn bộ văn bản, thông báo, nút, alert bằng **tiếng Việt chuẩn mực, sư phạm**. Không để lọt chuỗi kỹ thuật (vd `exam-engine`, mã build) ra giao diện người dùng.
6. **Cân bằng DOM & ID:** sau khi sửa `index.html` (nhiều modal lồng nhau), chạy kiểm tra cân bằng thẻ và trùng `id`.
7. **Phiên bản cache-busting thống nhất:** một hằng phiên bản duy nhất cho mọi `?v=` trong `index.html` và `js/*.js`.

---

## D. QUY TRÌNH LÀM VIỆC BẮT BUỘC

1. **Mỗi lần chỉ một hạng mục** trong `spec.md`. Không gộp nhiều lỗ hổng vào một PR lớn khó rà.
2. **Trước khi sửa:** đọc đúng đoạn mã thực tế (grep theo tên hàm, không tin số dòng trong tài liệu). Nêu rõ sẽ sửa file/hàm nào.
3. **Sau khi sửa:** chạy cheat-sheet kiểm tra của dự án:
   - `node --check` cho mọi file JS đã đổi.
   - Kiểm JSON hợp lệ nếu đụng `data/*.json`.
   - Chạy thử cục bộ `python -m http.server 8080`.
4. **Nghiệm thu theo tiêu chí trong `spec.md`.** Mỗi hạng mục có mục "Nghiệm thu" — phải chứng minh đạt (vd `curl -I` trả 404, grep trả rỗng, request không token bị từ chối). **Không tự coi là xong nếu chưa chứng minh được.**
5. **Firebase Rules & migration:** chỉ chạy trên **staging** trước. Có bộ test đọc/ghi cho cả 3 vai trò (student/teacher/admin) và ca "không token". Chỉ lên production khi tất cả pass.
6. **Nếu gặp việc không thể hoàn tất an toàn** (vd cần khóa S3 mới từ Archive.org, cần quyết định pháp lý về thông báo sự cố, cần bật provider trong Firebase Console): **dừng lại và báo rõ** việc cần con người làm, không tự ý đi đường vòng kém an toàn.

---

## E. TRÌNH TỰ ƯU TIÊN (tóm tắt từ spec.md)

| Giai đoạn | Nội dung | Điều kiện |
|-----------|----------|-----------|
| **0 — Khẩn (24h)** | Thu hồi khóa S3; gỡ mật khẩu vạn năng/đăng-nhập-bằng-tên/nút demo; gỡ mã mặc định khỏi UI; vá XSS dropdown lớp; ẩn tài liệu nội bộ; lên kế hoạch đặt lại mật khẩu | Làm ngay, phát hành từng mục |
| **1 — Danh tính & Quyền** | Firebase Auth cho email/mật khẩu & Google; `authedFetch` gắn token; node `/roles` do admin kiểm soát; Security Rules; migration bỏ `password` | **Test staging trước** |
| **2 — Worker API** | Worker cùng domain giữ secret; chấm điểm & trả đáp án server-side; thao tác S3 qua Worker; (tùy chọn) kích hoạt vai trò + custom claims | Sau khi Auth ổn |
| **3 — Perf/UX/A11y** | Tailwind build sẵn; `import()` động thư viện nặng & module lớn; thống nhất số liệu; nhãn input & aria; avatar cục bộ; sitemap/manifest | Song song, không chặn |

---

## F. CÁC SAI LẦM CẦN TRÁNH (đã thấy trong bản hiện tại)

- "Đổi mã GV/Admin trong trang Admin" nhưng mã chỉ lưu `localStorage` máy đó → vô nghĩa. Vai trò phải ở server.
- "Giấu" Firebase API key → không giải quyết gì; vấn đề là Rules.
- Chặn `F12`/`Ctrl+C` rồi coi là "bảo mật" → chỉ là răn đe, dễ vượt, hại trợ năng. Không dựa vào nó.
- Thêm `escapeHtml()` ở chỗ này nhưng quên chỗ khác → XSS vẫn còn. Rà **mọi** điểm nội suy.
- Để đáp án trong `exam_rooms` rồi chỉ ẩn bằng CSS/JS → client vẫn đọc được payload. Đáp án phải rời khỏi dữ liệu client đọc được.
