# TinHocHub — Đặc tả Khắc phục Bảo mật & Nâng cấp (spec.md)

> **Phiên bản:** 1.0 · **Ngày:** 2026-11-10 · **Người lập:** Rà soát mã nguồn bản `20261102_103`
> **Dự án:** TinHocHub — https://on-tap.nghiaedu.workers.dev/ · Repo: `github.com/nghiatnhcmue/on-tap` (`main`)
> **Hosting:** Cloudflare Workers Static Assets · **Backend dữ liệu:** Firebase Realtime Database (`asia-southeast1`)

Tài liệu này là **đặc tả công việc** để agent (Antigravity) thực thi, chia theo giai đoạn ưu tiên. Mỗi hạng mục có: *bối cảnh → việc cần làm → tiêu chí nghiệm thu*. Đọc kèm `AGENTS.md` (quy tắc bắt buộc) và `prompt-antigravity.md` (prompt giao việc).

**Nguyên tắc tối cao:** Phần lớn người dùng là học sinh dưới 18 tuổi. Mọi thay đổi phải ưu tiên bảo vệ dữ liệu cá nhân (họ tên, trường, lớp, mật khẩu, điểm số) của các em.

---

## 0. Tóm tắt hiện trạng (vì sao cần làm)

Kiến trúc hiện tại là **"local-first + client-authoritative"**: toàn bộ logic xác thực, phân quyền, chấm điểm và chống gian lận chạy trên trình duyệt; Firebase Realtime Database được truy cập trực tiếp từ client **không kèm token xác thực**. Hệ quả:

| # | Lỗ hổng | Vị trí trong mã | Mức độ |
|---|---------|-----------------|--------|
| V1 | Realtime Database cho đọc/ghi/xóa mà không cần đăng nhập (các request `fetch` tới `*.firebasedatabase.app/*.json` không có tham số `?auth=`) | `js/cloud-sync.js`, `js/arena.js`, `js/live-video.js`, `js/exam-rooms.js` | 🔴 Nghiêm trọng |
| V2 | Mật khẩu lưu **dạng chữ thường (plaintext)** trong node `accounts`; mỗi client tải toàn bộ `accounts.json` về `localStorage` | `js/cloud-sync.js` (`pushAccountToCloud`), `js/auth.js` (`registerUser`) | 🔴 Nghiêm trọng |
| V3 | Mật khẩu vạn năng `123456` mở được **mọi** tài khoản; đăng nhập được bằng **họ tên** | `js/auth.js` dòng ~920 và ~934–938 | 🔴 Nghiêm trọng |
| V4 | Nút "Vào nhanh không cần mật khẩu" (demo login) cấp quyền **bất kỳ vai trò nào kể cả admin** mà không cần thông tin đăng nhập | `index.html` (`demoLoginQuick`), `js/auth.js` (`switchRoleDemo`, `loginWithGoogleDemo`) | 🔴 Nghiêm trọng |
| V5 | Mã phân quyền `GV2025`/`ADMIN2025` hiện công khai trong HTML và chỉ được kiểm tra ở client; đổi mã trong trang Admin chỉ lưu `localStorage` máy đó | `index.html`, `js/auth.js` (`upgradeRoleWithCode`), `js/storage.js` (`getAdminConfig`), `js/admin-manager.js`, `js/questions-manager.js` | 🔴 Nghiêm trọng |
| V6 | Khóa S3 Archive.org lưu ở node công khai `config/s3_keys` | `js/cloud-sync.js` (`syncVideoConfig`) | 🔴 Nghiêm trọng |
| V7 | Đáp án đề thi nằm trong `exam_rooms` (client đọc được); điểm do client tự chấm rồi ghi thẳng vào `exam_history` | `js/exam.js` (chấm điểm), `js/exam-rooms.js`, `js/cloud-sync.js` | 🔴 Nghiêm trọng |
| V8 | XSS lưu trữ: tên lớp lấy từ `school_structure` (node ai cũng ghi được) chèn vào `innerHTML` không qua `escapeHtml()` | `js/auth.js` dòng ~1288–1297 | 🟠 Cao |
| V9 | Lớp khóa đăng nhập chỉ là CSS `blur`; DOM của khu vực Admin vẫn gửi tới mọi khách | `index.html`, gatekeeper ở `<head>` | 🟠 Cao |
| V10 | Tài liệu nội bộ phục vụ công khai: `AGENTS.md`, `README.md`, `wrangler.jsonc`, `upload_archive.py` | Cấu hình `assets.directory="."` trong `wrangler.jsonc` | 🟠 Cao |

> **Lưu ý về Firebase API key (`AIza...`):** Việc API key xuất hiện trong mã client là **bình thường** với Firebase Web — nó chỉ định danh project, không phải bí mật. Rủi ro nằm ở **Security Rules đang mở**, không phải ở key. Không cần "giấu" key; cần siết Rules.

---

## 1. Kiến trúc đích (target architecture)

Chuyển từ *client-authoritative* sang **server-authoritative cho mọi thứ nhạy cảm**, giữ nguyên trải nghiệm local-first cho dữ liệu không nhạy cảm.

```
┌─────────────┐    Firebase Auth (ID token)     ┌──────────────────────┐
│  Trình duyệt │ ──────────────────────────────▶ │ Firebase RTDB         │
│  (client)    │    mọi request .json kèm ?auth= │ + Security Rules siết │
│              │                                  └──────────────────────┘
│              │    POST bài thi, chấm điểm,      ┌──────────────────────┐
│              │ ──────────────────────────────▶ │ Cloudflare Worker API │
│              │    lấy đáp án, thao tác S3        │ (giữ secret: S3 key,  │
└─────────────┘                                  │  đáp án, service acct)│
                                                 └──────────────────────┘
```

Thành phần mới:
1. **Firebase Authentication** làm nguồn danh tính duy nhất — cho cả Google Sign-In *và* email/mật khẩu (dùng Email/Password provider của Firebase, **không** tự quản mật khẩu nữa).
2. **Firebase Security Rules** — mọi node yêu cầu `auth != null`; vai trò đọc từ node `/roles/$uid` do admin kiểm soát; node chứa bí mật/đáp án **không** cho client đọc.
3. **Cloudflare Worker API** (`/api/*`) — một Worker cùng domain, giữ các secret (`ARCHIVE_S3_ACCESS`, `ARCHIVE_S3_SECRET`, `FIREBASE_SERVICE_ACCOUNT`), đảm nhận: chấm điểm đề thi, trả đáp án sau khi nộp, thao tác upload Archive.org, và (tùy chọn) đặt custom claims vai trò.

> Repo hiện cấu hình `wrangler.jsonc` ở chế độ **Static Assets** (`assets.directory="."`). Để thêm Worker API, bổ sung `main` trỏ tới `worker/index.js` và cấu hình `assets` với `run_worker_first` hoặc tách route `/api/*`. Chi tiết ở Giai đoạn 2.

---

## 2. GIAI ĐOẠN 0 — Khẩn cấp (hoàn thành trong 24h, không cần đổi kiến trúc)

Mục tiêu: chặn các đường khai thác dễ nhất **ngay lập tức**, chấp nhận giải pháp tạm.

### 0.1. Thu hồi & luân chuyển bí mật đã lộ
- Vào Archive.org → tạo **cặp khóa S3 mới**, thu hồi cặp cũ.
- Trong Firebase Console → **xóa node `config/s3_keys`** và `config/video` (nếu chứa khóa). Khóa mới chỉ đặt ở Worker secret (Giai đoạn 2), **không** ghi lại vào RTDB.
- **Nghiệm thu:** node `config/s3_keys` không còn tồn tại; không còn khóa S3 trong bất kỳ node RTDB nào; `js/cloud-sync.js` không còn đọc `config/s3_keys`.

### 0.2. Gỡ mật khẩu vạn năng và đăng nhập bằng họ tên
- `js/auth.js`, hàm `loginWithCredentials`: xóa các nhánh chấp nhận `123456`, `ADMIN2025`, `GV2025` làm mật khẩu (các dòng `else if ... isPwdValid = true`). Chỉ còn so khớp mật khẩu thật.
- Bỏ nhánh tìm tài khoản theo `fullName` khi đăng nhập (chỉ cho đăng nhập bằng email/username/uid).
- Bỏ cơ chế "tài khoản chưa có mật khẩu thì người đăng nhập đầu tiên đặt luôn" — thay bằng buộc đặt lại mật khẩu qua email.
- **Nghiệm thu:** không chuỗi `'123456'`/`'ADMIN2025'`/`'GV2025'` nào còn được dùng làm điều kiện hợp lệ mật khẩu trong `js/auth.js`; đăng nhập bằng họ tên thất bại.

### 0.3. Vô hiệu hóa nút "Vào nhanh không cần mật khẩu"
- Gỡ toàn bộ nút demo trong `index.html` và các hàm `demoLoginQuick`, `switchRoleDemo`, `loginWithGoogleDemo`, `demoLogin` trong `js/auth.js`.
- Gỡ nhánh `confirm(...)` ở `js/auth.js` (~dòng 715) tự đăng nhập demo khi domain chưa được Google ủy quyền. Thay bằng hướng dẫn cấu hình, không tự cấp quyền.
- **Nghiệm thu:** không có cách nào vào hệ thống với vai trò teacher/admin mà không qua xác thực thật; grep `demo` trong `js/*.js` và `index.html` không còn hàm cấp quyền.

### 0.4. Gỡ mã bí mật khỏi giao diện
- `index.html`: xóa chữ "Mặc định: GV2025 hoặc ADMIN2025", "Giáo viên nhập GV2025...", và khối liệt kê mã mặc định.
- `js/admin-manager.js` (~dòng 144), `js/questions-manager.js` (~dòng 532): xóa mã mặc định khỏi `prompt(...)`.
- **Nghiệm thu:** grep `GV2025`/`ADMIN2025` trong `index.html` và toàn bộ `js/` trả về rỗng (trừ khi đã chuyển thành cấu hình server).

### 0.5. Vá XSS tại render dropdown lớp
- `js/auth.js` ~dòng 1297: bọc `escapeHtml()` quanh `c.name`, `cls`, và mọi giá trị từ `school_structure` khi nối vào chuỗi `innerHTML`.
- **Nghiệm thu:** mọi biến động trong template tại `js/auth.js` 1280–1310 đều đi qua `escapeHtml()`.

### 0.6. Ẩn tài liệu nội bộ khỏi hosting
- Thêm `.assetsignore` (hoặc cơ chế loại trừ tương đương của Workers Static Assets) để **không** phục vụ: `AGENTS.md`, `README.md`, `spec.md`, `prompt-antigravity.md`, `*.py`, `Ngan Hang de.xlsx`, `wrangler.jsonc`, `.git/`.
- **Nghiệm thu:** `curl -I https://on-tap.nghiaedu.workers.dev/AGENTS.md` và `/upload_archive.py` trả **404**.

### 0.7. Thông báo & đặt lại mật khẩu
- Coi **toàn bộ** mật khẩu hiện có là đã lộ. Lên kịch bản buộc đặt lại mật khẩu ở lần đăng nhập kế tiếp (sau khi Firebase Auth sẵn sàng ở Giai đoạn 1).
- Thông báo cho giáo viên/học sinh về sự cố dữ liệu. **Việc thông báo có thể là nghĩa vụ pháp lý** theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân — cần người có chuyên môn pháp lý tư vấn (ngoài phạm vi agent).
- **Nghiệm thu:** có bản ghi quyết định về thời điểm và cách thông báo; cờ buộc đổi mật khẩu được thiết kế.

> ⚠️ **Chưa siết Firebase Rules ở Giai đoạn 0.** Siết Rules khi client chưa gửi token sẽ làm hỏng toàn bộ web. Rules thuộc Giai đoạn 1, bắt buộc test trên DB staging trước.

---

## 3. GIAI ĐOẠN 1 — Danh tính & Phân quyền thật (vài ngày)

### 1.1. Chuyển xác thực sang Firebase Authentication
- Bật **Email/Password** và **Google** provider trong Firebase Console.
- `js/auth.js`: thay cơ chế tự quản tài khoản bằng `firebase.auth()`:
  - Đăng ký → `createUserWithEmailAndPassword`.
  - Đăng nhập → `signInWithEmailAndPassword` / `signInWithPopup(google)`.
  - Khôi phục mật khẩu → `sendPasswordResetEmail`.
- **Ngừng ghi mật khẩu vào RTDB.** Node `accounts/$uid` chỉ còn hồ sơ phi bí mật: `fullName`, `school`, `className`, `grade`, `role` (chỉ đọc với client), `avatar`.
- Mỗi request RTDB phải kèm ID token: `fetch(`${url}/path.json?auth=${idToken}`)` (lấy qua `firebase.auth().currentUser.getIdToken()`). Tạo một hàm `authedFetch()` dùng chung thay cho mọi `fetch` tới RTDB hiện tại.
- **Nghiệm thu:** không còn trường `password` ghi lên RTDB; mọi request tới `*.firebasedatabase.app` đều có `?auth=`; đăng nhập/đăng ký/quên mật khẩu chạy qua Firebase Auth.

### 1.2. Mô hình vai trò do server kiểm soát
- Tạo node `/roles/$uid = { role: "student|teacher|admin" }`.
- Quyền ghi `/roles` **chỉ** dành cho admin (qua Rules — xem 1.3). Bootstrap: admin đầu tiên đặt tay trong Console.
- Việc "kích hoạt GV/Admin bằng mã" được thay bằng: người dùng gửi yêu cầu → admin duyệt và ghi `/roles/$uid`. (Hoặc: Worker xác thực mã rồi set custom claim — Giai đoạn 2.)
- Client đọc vai trò từ `/roles/$uid` hoặc từ custom claim trong token, **không** tự đặt `role` trong `localStorage` nữa.
- **Nghiệm thu:** sửa `role` trong `localStorage` không mở được chức năng teacher/admin (vì chức năng đó được Rules/Worker kiểm, không chỉ CSS).

### 1.3. Firebase Security Rules (bản khởi điểm — test trên staging)

Đây là **điểm xuất phát an toàn-mặc-định**, cần tinh chỉnh theo quyết định nghiệp vụ. Triển khai trên một **RTDB staging** rồi chạy bộ test đọc/ghi cho cả 3 vai trò trước khi áp lên production.

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "roles": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'",
        "role": { ".validate": "newData.isString() && newData.val().matches(/^(student|teacher|admin)$/)" }
      }
    },

    "accounts": {
      ".read": "auth != null && root.child('roles').child(auth.uid).child('role').val() !== 'student'",
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('role').val() !== 'student')",
        ".write": "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('role').val() === 'admin')",
        "password": { ".validate": false },
        "role":     { ".validate": false }
      }
    },

    "exam_rooms": {
      ".read": "auth != null",
      "$roomId": {
        ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() !== 'student'",
        "answerKey": { ".read": false, ".write": false }
      }
    },

    "exam_history": {
      "$key": {
        ".read": "auth != null && (data.child('uid').val() === auth.uid || root.child('roles').child(auth.uid).child('role').val() !== 'student')",
        ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() !== 'student'"
      }
    },

    "user_progress": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('roles').child(auth.uid).child('role').val() !== 'student')",
        ".write": "auth != null && auth.uid === $uid"
      }
    },

    "school_structure":   { ".read": "auth != null", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'" },
    "subjects_list":      { ".read": "auth != null", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'" },
    "custom_questions":   { ".read": "auth != null", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() !== 'student'" },

    "live_video_rooms":   { ".read": "auth != null", ".write": "auth != null" },
    "arena_rooms":        { ".read": "auth != null", ".write": "auth != null" },

    "config": {
      "auth":    { ".read": "auth != null", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'" },
      "video":   { ".read": "auth != null", ".write": "auth != null && root.child('roles').child(auth.uid).child('role').val() === 'admin'" },
      "s3_keys": { ".read": false, ".write": false }
    },

    "system_ping": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Ghi chú thiết kế:
- **Đáp án không để trong node client đọc được.** Rule trên chặn `exam_rooms/$roomId/answerKey`, nhưng cách chắc chắn là **không lưu đáp án trong RTDB** mà giữ ở Worker (Giai đoạn 2). Rule chỉ là lớp phòng thủ bổ sung.
- `live_video_rooms` và `arena_rooms` tạm để mọi người đã đăng nhập ghi (vì gameplay realtime nhiều nhánh con); về sau nên siết theo `hostUid` và `players/$uid === auth.uid`.
- Khóa `accounts` theo `$uid` (Firebase Auth UID), **không** theo email đã chuẩn hóa như hiện tại — cần migration (1.4).
- **Nghiệm thu:** trên staging, học sinh A không đọc được `accounts` của người khác, không ghi được `/roles`, không ghi được `exam_history` của người khác; teacher/admin đọc được theo đúng phạm vi; request không token bị từ chối.

### 1.4. Di trú dữ liệu (migration)
- Viết script (chạy bằng tài khoản admin/service account, **không** phải client) để:
  - Tạo tài khoản Firebase Auth cho người dùng hiện có (hoặc mời họ đăng ký lại / đặt lại mật khẩu).
  - Chuyển hồ sơ `accounts` sang khóa theo `uid` thật của Firebase Auth.
  - **Loại bỏ trường `password`** khỏi mọi bản ghi.
  - Khởi tạo `/roles/$uid` từ `role` cũ (rà soát thủ công danh sách teacher/admin để tránh kế thừa quyền sai).
- **Nghiệm thu:** không bản ghi `accounts` nào còn `password`; mọi teacher/admin trong `/roles` đã được rà soát thủ công.

---

## 4. GIAI ĐOẠN 2 — Worker API cho tính toàn vẹn (1–2 tuần)

### 2.1. Khởi tạo Cloudflare Worker cùng domain
- Thêm thư mục `worker/`, cập nhật `wrangler.jsonc`: `main = "worker/index.js"`, giữ `assets.directory="."`, định tuyến `/api/*` vào Worker (phần còn lại phục vụ tĩnh).
- Secrets (đặt bằng `wrangler secret put`, **không** commit): `ARCHIVE_S3_ACCESS`, `ARCHIVE_S3_SECRET`, `FIREBASE_SERVICE_ACCOUNT` (JSON), `FIREBASE_DB_URL`.
- Mọi endpoint xác minh **ID token Firebase** gửi kèm (verify chữ ký bằng public keys của Google) trước khi xử lý.
- **Nghiệm thu:** `/api/health` trả 200; endpoint từ chối request không có token hợp lệ (401).

### 2.2. Chấm điểm server-authoritative
- Endpoint `POST /api/exam/submit`: nhận `{ roomId, answers }`, Worker tự lấy đáp án (từ store riêng mà client không đọc được), chấm theo đúng barem Bộ GD (MCQ 0.25đ/câu; DS theo thang 0.1/0.25/0.5/1.0 — giữ đúng `pointMap = [0,0.1,0.25,0.5,1.0]` như `js/exam.js`), ghi `exam_history` qua service account.
- Endpoint `GET /api/exam/:roomId/answers`: chỉ trả đáp án **sau khi** người dùng đã nộp (hoặc hết giờ), để phục vụ xem lại.
- Client bỏ việc tự chấm và tự ghi điểm; chỉ hiển thị kết quả Worker trả về.
- **Nghiệm thu:** sửa payload để "ăn gian" điểm bị Worker bỏ qua; đáp án không tải được trước khi nộp; điểm trong `exam_history` khớp với chấm độc lập.

### 2.3. Thao tác Archive.org qua Worker
- Mọi upload/sửa/xóa video đi qua `/api/archive/*`; Worker ký request S3 bằng secret. Client **không bao giờ** thấy khóa.
- **Nghiệm thu:** grep khóa S3 trong toàn bộ `js/` và RTDB trả rỗng; upload video vẫn hoạt động qua Worker.

### 2.4. (Tùy chọn) Kích hoạt vai trò qua Worker + custom claims
- `POST /api/role/activate` nhận mã GV/Admin, Worker so với secret `ROLE_CODE_TEACHER`/`ROLE_CODE_ADMIN`, nếu đúng thì set custom claim và ghi `/roles/$uid` bằng service account.
- **Nghiệm thu:** mã không còn ở client; nhập sai mã không nâng quyền; claim phản ánh đúng trong token.

---

## 5. GIAI ĐOẠN 3 — Hiệu năng, Nội dung, Tiếp cận (song song, không chặn bảo mật)

### 3.1. Hiệu năng tải trang
- **Tailwind:** thay `cdn.tailwindcss.com` (biên dịch trong trình duyệt) bằng CSS build sẵn qua Tailwind CLI (`npx tailwindcss -o css/tailwind.css --minify`). Giảm vài trăm KB và xóa cảnh báo "không dùng CDN cho production".
- **Tải trễ thư viện nặng:** `SheetJS` (~276KB) và `Mammoth` (~117KB) chỉ cần khi nhập đề → chuyển sang `import()` động khi người dùng bấm nút nhập file, bỏ khỏi `<head>`.
- **Chia tách module:** `import()` động cho các module lớn chỉ dùng theo khu vực: `live-video.js` (~229KB), `admin-manager.js` (~198KB), `arena.js` (~172KB), `interactive-video.js` (~160KB), `random-picker.js` (~102KB). Hiện cả 20 module nạp ngay từ đầu.
- **Thêm `defer`** cho script không cần chặn render ở `<head>`.
- **Nghiệm thu:** JS tải ban đầu (first load) giảm rõ rệt; Lighthouse Performance mobile tăng; các module lớn chỉ tải khi mở đúng mục (kiểm trong tab Network).

### 3.2. Thống nhất phiên bản cache-busting
- `js/app.js` dùng `?v=20261102_103` nhưng import các module với `?v=20261102_100`. Chuẩn hóa về **một** hằng phiên bản duy nhất (có thể sinh khi build) để cache-buster áp dụng đồng đều.
- **Nghiệm thu:** mọi tham chiếu `?v=` trong `index.html` và `js/*.js` dùng cùng một giá trị.

### 3.3. Sửa dữ liệu không nhất quán
- Số câu: giao diện ghi **4.098**, `data/manifest.json` ghi **4.062** (và AGENTS.md ghi 4.098). Chốt con số đúng theo dữ liệu thật và cập nhật mọi nơi hiển thị.
- Đề in (`index.html` ~dòng 1614): mặc định "40 câu (chuẩn)" trong khi đề chuẩn Bộ GD là 28 câu. Làm rõ nhãn: "40 câu (tổng ôn)" ≠ "chuẩn Bộ GD". Thống nhất 28 câu/50 phút cho định dạng chuẩn.
- Gỡ chuỗi dành cho lập trình viên lọt ra UI (vd "tinhoc-hub ~ exam-engine", "Mã đề 102", "Live" dạng nhãn kỹ thuật) hoặc chuyển thành nhãn thân thiện.
- **Nghiệm thu:** một con số câu hỏi duy nhất xuất hiện nhất quán; nhãn đề in không gọi 40 câu là "chuẩn Bộ GD"; không còn chuỗi kỹ thuật trong UI.

### 3.4. Tiếp cận (accessibility)
- Gắn `<label for=...>` hoặc `aria-label` cho ~98 ô nhập (hiện chỉ ~5 label có `for`).
- Thêm `aria-label` cho ~13 nút chỉ-biểu-tượng.
- Rà soát 113 chỗ cỡ chữ 9–11px: nâng cỡ tối thiểu dễ đọc trên di động (≥12–14px cho nội dung chính).
- Việc chặn `Ctrl+C`/`F12`/devtools trong proctor gây khó cho người dùng trình đọc màn hình và dễ bị vượt qua — giữ như lớp **răn đe**, không coi là kiểm soát bảo mật; đảm bảo không chặn thao tác trợ năng thiết yếu.
- **Nghiệm thu:** mọi input có nhãn liên kết; nút biểu tượng có `aria-label`; kiểm Lighthouse Accessibility tăng.

### 3.5. Quyền riêng tư của học sinh
- Ngừng gửi họ tên học sinh sang dịch vụ bên thứ ba `ui-avatars.com` (gửi tên qua URL). Dự án đã có `js/avatars.js` vẽ avatar SVG tại chỗ — dùng nó.
- **Nghiệm thu:** grep `ui-avatars.com` trong `js/*.js` trả rỗng; avatar sinh cục bộ.

### 3.6. SEO & trang công khai
- Thêm `sitemap.xml` và `manifest.json`/`site.webmanifest` (hiện trả 404) nếu muốn cài đặt PWA và lập chỉ mục.
- Khách chưa đăng nhập hầu như không thấy nội dung. Cân nhắc trang giới thiệu công khai hoặc cho làm thử vài câu không cần tài khoản, để vừa marketing vừa cho phép đánh giá công cụ.
- **Nghiệm thu:** `/sitemap.xml` và manifest trả 200; có nội dung công khai tối thiểu cho khách.

---

## 6. Thứ tự thực thi & cổng kiểm soát

1. **Giai đoạn 0** (khẩn, 24h) — làm trước, có thể phát hành ngay từng mục.
2. **Giai đoạn 1** (danh tính + Rules) — **bắt buộc test trên staging**; chỉ áp Rules production khi mọi client đã gửi token.
3. **Giai đoạn 2** (Worker) — sau khi Auth ổn định.
4. **Giai đoạn 3** (perf/UX/a11y) — song song, không chặn.

**Không được** siết Firebase Rules (Giai đoạn 1.3) trước khi client gửi ID token (Giai đoạn 1.1) — sẽ làm hỏng toàn bộ chức năng. Luôn giữ một **DB staging** riêng để thử Rules.

## 7. Checklist nghiệm thu tổng (Definition of Done)

- [ ] Không node RTDB nào đọc/ghi được khi **không** có token hợp lệ.
- [ ] Không còn mật khẩu plaintext ở RTDB hay localStorage; xác thực qua Firebase Auth.
- [ ] Không còn mật khẩu vạn năng, đăng nhập-bằng-tên, hay nút demo cấp quyền.
- [ ] Vai trò do server kiểm soát; sửa `localStorage` không nâng quyền.
- [ ] Đáp án & khóa S3 không bao giờ tới client trước khi hợp lệ; chấm điểm ở Worker.
- [ ] Mọi giá trị động vào `innerHTML` đều qua `escapeHtml()`.
- [ ] Tài liệu nội bộ & khóa không phục vụ công khai.
- [ ] First-load JS giảm; số liệu nội dung nhất quán; input có nhãn; avatar cục bộ.
```
