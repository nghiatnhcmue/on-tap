/**
 * tinhoc-hub: Admin Manager (Quản Trị Hệ Thống)
 * Chỉ dành riêng cho Quản trị viên (Admin).
 * Quản lý: Phân quyền tài khoản (HS <-> GV <-> Admin), Cấu hình mã bảo mật, 
 * Cơ sở dữ liệu đám mây, Tải lên Video bài giảng Archive.org S3, Dọn dẹp/Sao lưu.
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';
import { CloudSync, DEFAULT_FIREBASE_DB_URL } from './cloud-sync.js';

export const AdminManager = {
  container: null,
  manifest: null,
  _manifestVideos: null,
  selectedLocalFiles: new Map(), // standardLowerFilename -> File
  uploadQueue: [],
  isUploading: false,
  isPaused: false,
  currentXhr: null,
  currentUploadingName: null,
  remoteArchiveFiles: new Set(),
  videoGradeFilter: 'all',
  videoSearchQuery: '',
  uploadProgressStats: { totalBytes: 0, loadedBytes: 0, startTime: 0 },

  async init(containerEl, manifest = null) {
    this.container = containerEl;
    if (manifest) {
      this.manifest = manifest;
    } else if (!this.manifest) {
      try {
        const res = await fetch('data/manifest.json');
        if (res.ok) this.manifest = await res.json();
      } catch (e) {
        console.warn('AdminManager: Không thể tải manifest.json', e);
      }
    }
    this.render();
  },

  getManifestVideos() {
    if (this._manifestVideos && this._manifestVideos.length > 0) {
      return this._manifestVideos;
    }
    const list = [];
    const manifest = this.manifest;
    if (manifest && manifest.grades) {
      ['10', '11', '12'].forEach(grade => {
        const vids = manifest.grades[grade]?.interactive_videos || {};
        Object.keys(vids).forEach(vname => {
          const v = vids[vname];
          list.push({
            grade,
            video: v.video || vname,
            lesson: v.lesson || '',
            topic: v.topic || '',
            checkpoints: Array.isArray(v.checkpoints) ? v.checkpoints : []
          });
        });
      });
    }
    this._manifestVideos = list;
    return list;
  },

  render() {
    if (!this.container) return;

    // Kiểm tra quyền hạn nghiêm ngặt: Chỉ ADMIN
    if (!Auth.isAdmin()) {
      this.container.innerHTML = `
        <div class="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
          <div class="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Khu Vực Quản Trị Hệ Thống (Admin Only)
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            Giáo viên và Học sinh không được phép can thiệp vào cài đặt cốt lõi của hệ thống. Nếu Thầy/Cô là Quản trị viên cấp cao, vui lòng nhập mã xác thực Admin.
          </p>
          <button id="btn-admin-verify" class="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-rose-500/20">
            <i class="fa-solid fa-key mr-1.5"></i> Nhập mã xác thực Admin
          </button>
        </div>
      `;

      this.container.querySelector('#btn-admin-verify')?.addEventListener('click', () => {
        const code = prompt('Vui lòng nhập mã bảo mật Admin (Mặc định: ADMIN2025):');
        if (code) {
          const res = Auth.upgradeRoleWithCode(code);
          alert(res.message);
          if (res.success) this.render();
        }
      });
      return;
    }

    const accounts = Storage.getAccountsList();
    const adminConfig = Storage.getAdminConfig();
    const videoConfig = Storage.getVideoConfig();
    const history = Storage.getExamHistory();
    const examRooms = Storage.getExamRooms();
    const customQuestions12 = Storage.getCustomQuestions('12');
    const customQuestions11 = Storage.getCustomQuestions('11');
    const customQuestions10 = Storage.getCustomQuestions('10');
    const totalCustomQs = customQuestions12.length + customQuestions11.length + customQuestions10.length;
    const cloudStatus = CloudSync.getStatus();
    const manifestVideos = this.getManifestVideos();

    // Thống kê video đã ghép khớp và đã tải lên
    let matchedCount = 0;
    manifestVideos.forEach(v => {
      if (this.selectedLocalFiles.has(v.video.toLowerCase())) matchedCount++;
    });
    const uploadedRecord = videoConfig.uploadedVideos || {};
    let uploadedCount = 0;
    manifestVideos.forEach(v => {
      const isUp = !!uploadedRecord[v.video] || this.remoteArchiveFiles.has(v.video.toLowerCase());
      if (isUp) uploadedCount++;
    });

    this.container.innerHTML = `
      <div class="space-y-8 animate-fadeIn">
        
        <!-- Header Admin Panel -->
        <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase tracking-wider mb-2">
              <i class="fa-solid fa-shield-halved"></i> Trung Tâm Quản Trị Hệ Thống
            </div>
            <h2 class="text-2xl sm:text-3xl font-black tracking-tight">
              Bảng Điều Khiển Quản Trị Viên (Admin)
            </h2>
            <p class="text-xs sm:text-sm text-slate-400 mt-1">
              Toàn quyền cấu hình máy chủ, đồng bộ đám mây, tải lên video Archive.org, giám sát thi và bảo trì dữ liệu.
            </p>
          </div>

          <div class="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold text-amber-300">
            <i class="fa-solid fa-user-shield"></i>
            <span>Đang đăng nhập: ${escapeHtml(Auth.currentUser?.fullName || (typeof Auth.getCurrentUser === 'function' ? Auth.getCurrentUser()?.fullName : null) || 'Admin')}</span>
          </div>
        </div>

        <!-- KPI Thống Kê Nhanh -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-slate-400 text-xs font-medium block">Tài khoản đã lưu</span>
            <span class="text-2xl font-black text-slate-800 dark:text-white mt-1 block">${accounts.length}</span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-slate-400 text-xs font-medium block">Phòng thi / Giao đề</span>
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">${examRooms.length}</span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-slate-400 text-xs font-medium block">Bài thi hoàn thành</span>
            <span class="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">${history.length}</span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-slate-400 text-xs font-medium block">Video bài giảng</span>
            <span class="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 block">${uploadedCount}/${manifestVideos.length}</span>
          </div>
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-slate-400 text-xs font-medium block">Trạng thái máy chủ</span>
            <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Cloudflare Pages OK
            </span>
          </div>
        </div>

        <!-- 1. QUẢN LÝ THÀNH VIÊN VÀ PHÂN QUYỀN -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-users-gear text-blue-600"></i> Phân Quyền Thành Viên (Học Sinh, Giáo Viên, Admin)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Chỉ Admin có quyền chỉ định ai là Giáo viên (được can thiệp câu hỏi) hoặc Admin (toàn quyền).
              </p>
            </div>
            <button id="btn-admin-refresh-users" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5 self-start">
              <i class="fa-solid fa-rotate-right"></i> Làm mới danh sách
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-semibold uppercase tracking-wider">
                  <th class="py-3 px-3">Họ và tên</th>
                  <th class="py-3 px-3">Email</th>
                  <th class="py-3 px-3">Lớp & Trường</th>
                  <th class="py-3 px-3">Vai trò hiện tại</th>
                  <th class="py-3 px-3 text-right">Phân quyền trực tiếp</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700/60">
                ${accounts.length === 0 ? `
                  <tr>
                    <td colspan="5" class="py-8 text-center text-slate-400">
                      Chưa có tài khoản nào được ghi nhận. Hãy đăng nhập tài khoản Google để xuất hiện tại đây.
                    </td>
                  </tr>
                ` : accounts.map(user => {
                  let badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Học sinh (HS)</span>';
                  if (user.role === 'teacher') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Giáo viên (GV)</span>';
                  else if (user.role === 'admin') badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Quản trị viên (Admin)</span>';

                  return `
                    <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
                      <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">
                        ${escapeHtml(user.fullName)}
                      </td>
                      <td class="py-3 px-3 text-slate-500 font-mono">${user.email ? escapeHtml(user.email) : '<span class="italic text-slate-400">Đăng ký trực tiếp</span>'}</td>
                      <td class="py-3 px-3 text-slate-500">${escapeHtml(user.className || '-')} • ${escapeHtml(user.school || '-')}</td>
                      <td class="py-3 px-3">${badge}</td>
                      <td class="py-3 px-3 text-right">
                        <select data-user-role-select="${escapeHtml(user.email || user.uid)}" class="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-800 dark:text-white">
                          <option value="student" ${user.role === 'student' ? 'selected' : ''}>Học sinh</option>
                          <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>Giáo viên</option>
                          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. KẾT NỐI CƠ SỞ DỮ LIỆU ĐÁM MÂY (CLOUD DATABASE / REALTIME BACKEND) -->
        <div id="admin-cloud-sync-card" class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-cloud-arrow-up text-blue-600"></i> Cơ Sở Dữ Liệu Đám Mây (Cloud Real-Time Sync)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Chuyển đổi TinHocHub thành Web Động: Học sinh ở nhà làm bài & nộp điểm sẽ tự động cập nhật về Sổ điểm tức thì.
              </p>
            </div>
            <div>
              ${cloudStatus.isConfigured ? `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Đã kết nối Đám mây
                </span>
              ` : `
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                  Chưa kết nối (Chế độ Local)
                </span>
              `}
            </div>
          </div>

          <!-- Form Cấu Hình Cloud Database -->
          <form id="form-cloud-config" class="space-y-4">
            <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-700">
              <div>
                <label for="cloud-cfg-enabled" class="text-xs font-bold text-slate-800 dark:text-white block">
                  Kích hoạt Đồng bộ Đám mây (Cloud Sync)
                </label>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Hệ thống luôn tự động kích hoạt đồng bộ đám mây thời gian thực đa thiết bị.</span>
              </div>
              <input type="checkbox" id="cloud-cfg-enabled" checked disabled class="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-not-allowed opacity-90" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  URL Cơ Sở Dữ Liệu Đám Mây (Google Firebase Realtime Database) *
                </label>
                <div class="flex gap-2">
                  <input type="url" id="cloud-cfg-url" value="${escapeHtml(cloudStatus.databaseUrl || DEFAULT_FIREBASE_DB_URL)}" placeholder="${DEFAULT_FIREBASE_DB_URL}" class="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                  <button type="button" id="btn-cloud-test-conn" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0">
                    <i class="fa-solid fa-bolt"></i> Kiểm tra kết nối
                  </button>
                </div>
                <span class="text-[11px] text-slate-400 mt-1 block">
                  Đường dẫn Firebase Realtime Database dùng để đồng bộ dữ liệu thời gian thực.
                </span>
              </div>

              <div class="sm:col-span-2">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Firebase Web API Key (Bắt buộc để kích hoạt Google Sign-In)
                </label>
                <input type="text" id="cloud-cfg-api-key" value="${escapeHtml(Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig().apiKey : '')}" placeholder="Ví dụ: AIzaSyA1B2C3D4E5..." class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500" />
                <span class="text-[11px] text-slate-400 mt-1 block">
                  Lấy từ Firebase Console (Project Settings -> General -> Web API Key). Dùng để học sinh đăng nhập Google bằng Firebase.
                </span>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tần suất tự động đồng bộ ngầm
                </label>
                <select id="cloud-cfg-interval" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="0.5" ${CloudSync.config?.intervalMinutes === 0.5 ? 'selected' : ''}>Mỗi 30 giây (Nhanh nhất)</option>
                  <option value="1" ${(!CloudSync.config?.intervalMinutes || CloudSync.config?.intervalMinutes === 1) ? 'selected' : ''}>Mỗi 1 phút (Chuẩn khuyến nghị)</option>
                  <option value="2" ${CloudSync.config?.intervalMinutes === 2 ? 'selected' : ''}>Mỗi 2 phút</option>
                  <option value="5" ${CloudSync.config?.intervalMinutes === 5 ? 'selected' : ''}>Mỗi 5 phút</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Thời gian đồng bộ gần nhất
                </label>
                <div class="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-500 dark:text-slate-400">
                  ${cloudStatus.lastSync ? new Date(cloudStatus.lastSync).toLocaleString('vi-VN') : 'Chưa đồng bộ lần nào'}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3 pt-2 flex-wrap">
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Cloud
              </button>
              <button type="button" id="btn-cloud-sync-now" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-2">
                <i class="fa-solid fa-arrows-rotate"></i> Đồng bộ ngay
              </button>
              <button type="button" id="btn-cloud-push-all" class="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-arrow-up"></i> Đẩy toàn bộ dữ liệu máy này lên Cloud
              </button>
              <button type="button" id="btn-cloud-pull-all" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-arrow-down"></i> Kéo toàn bộ từ Cloud về máy này
              </button>
            </div>
          </form>
        </div>

        <!-- 3. QUẢN LÝ & TẢI LÊN VIDEO BÀI GIẢNG ARCHIVE.ORG S3 (CHỈ DÀNH CHO ADMIN) -->
        <div id="admin-archive-uploader-card" class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-wider mb-1">
                <i class="fa-solid fa-film"></i> Lưu Trữ Video Miễn Phí Vĩnh Viễn
              </div>
              <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-cloud-arrow-up text-rose-600"></i> Trình Tải Video Lên Archive.org (Archive.org S3 Uploader)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Tải trực tiếp 93 video bài giảng MP4 (Khối 10, 11, 12) lên Archive.org ngay trong trình duyệt. Không tốn phí, không giới hạn băng thông.
              </p>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <span class="px-3 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <i class="fa-solid fa-check-double mr-1"></i> Đã có trên web: ${uploadedCount} / ${manifestVideos.length}
              </span>
            </div>
          </div>

          <!-- A. Form Cấu hình Archive.org S3 Keys -->
          <form id="form-archive-config" class="space-y-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <h4 class="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-key text-amber-500"></i> Cấu Hình Khóa S3 API Archive.org
              </h4>
              <a href="https://archive.org/account/s3.php" target="_blank" class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Lấy mã S3 Access/Secret Key miễn phí tại đây
              </a>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Archive.org S3 Access Key *
                </label>
                <input type="text" id="archive-cfg-access-key" value="${escapeHtml(videoConfig.archiveAccessKey || '')}" placeholder="Ví dụ: a1b2c3d4e5f6..." class="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Archive.org S3 Secret Key *
                </label>
                <div class="relative">
                  <input type="password" id="archive-cfg-secret-key" value="${escapeHtml(videoConfig.archiveSecretKey || '')}" placeholder="Ví dụ: z9y8x7w6v5u4..." class="w-full px-4 py-2.5 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                  <button type="button" id="btn-toggle-s3-secret" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Item Identifier (Tên Bucket lưu trữ)
                </label>
                <input type="text" id="archive-cfg-identifier" value="${escapeHtml(videoConfig.archiveIdentifier || 'tinhoc-hub-thpt')}" placeholder="tinhoc-hub-thpt" class="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                <span class="text-[10px] text-slate-400">Tên định danh gói lưu trữ trên Archive.org (chỉ viết chữ thường, số và dấu gạch nối).</span>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Direct Stream Base URL (Link phát video cho học sinh - Direct CORS)
                </label>
                <input type="url" id="archive-cfg-base-url" value="${escapeHtml(Storage.getVideoBaseUrl())}" placeholder="https://archive.org/cors/tinhoc-hub-thpt/" class="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                <span class="text-[10px] text-slate-400">Học sinh bấm phát video sẽ gọi trực tiếp từ địa chỉ này (dùng /cors/ để chống chặn đường truyền tại VN). Tự động đồng bộ tới mọi máy qua Cloud.</span>
              </div>
            </div>

            <div class="flex items-center gap-3 pt-2 flex-wrap">
              <button type="submit" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình S3 & Base URL
              </button>
              <button type="button" id="btn-test-archive-s3" class="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-amber-500/20 flex items-center gap-2">
                <i class="fa-solid fa-key"></i> Kiểm Tra Khóa S3
              </button>
              <button type="button" id="btn-archive-check-remote" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-2">
                <i class="fa-solid fa-magnifying-glass"></i> Quét File Đã Có Trên Archive.org
              </button>
            </div>
          </form>

          <!-- B. Khu Vực Kéo Thả & Chọn Thư Mục Chứa Video -->
          <div id="archive-dropzone" class="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-3xl p-8 text-center bg-slate-50/60 dark:bg-slate-900/40 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition cursor-pointer space-y-4">
            <div class="w-16 h-16 rounded-3xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xl mx-auto shadow-inner">
              <i class="fa-solid fa-photo-film"></i>
            </div>
            <div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white">
                Kéo thả các tệp video (.mp4) hoặc chọn toàn bộ thư mục video
              </h4>
              <p class="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
                Hệ thống tự động so khớp tên file video với 93 bài học chuẩn (Khối 10: 34 bài, Khối 11: 31 bài, Khối 12: 28 bài).
              </p>
            </div>

            <div class="flex items-center justify-center gap-3 flex-wrap pt-2">
              <button type="button" id="btn-pick-archive-folder" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
                <i class="fa-solid fa-folder-open"></i> Chọn Thư Mục Chứa 93 Video
              </button>
              <button type="button" id="btn-pick-archive-files" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2">
                <i class="fa-solid fa-file-video"></i> Chọn Từng File Video (.mp4)
              </button>
              <input type="file" id="input-archive-folder" webkitdirectory directory multiple accept="video/mp4" class="hidden" />
              <input type="file" id="input-archive-files" multiple accept="video/mp4" class="hidden" />
            </div>

            <div class="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Đã chọn: <b class="text-blue-600 font-black">${this.selectedLocalFiles.size}</b> file</span>
              <span>•</span>
              <span>Đã khớp chuẩn: <b class="text-emerald-600 font-black">${matchedCount} / ${manifestVideos.length}</b> video</span>
            </div>
          </div>

          <!-- C. Thanh Điều Khiển Tải Hàng Loạt & Thanh Tiến Trình Toàn Cục -->
          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700">
              <div class="flex items-center gap-2 flex-wrap">
                <button type="button" id="btn-start-batch-upload" ${this.isUploading ? 'disabled' : ''} class="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-md shadow-rose-500/20 flex items-center gap-2">
                  <i class="fa-solid fa-rocket"></i> Bắt Đầu Tải Lên Tất Cả (Batch Upload)
                </button>
                ${this.isUploading ? `
                  <button type="button" id="btn-pause-resume-upload" class="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-2">
                    <i class="fa-solid ${this.isPaused ? 'fa-play' : 'fa-pause'}"></i> ${this.isPaused ? 'Tiếp tục' : 'Tạm dừng'}
                  </button>
                  <button type="button" id="btn-cancel-upload" class="px-4 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2">
                    <i class="fa-solid fa-stop"></i> Hủy tiến trình
                  </button>
                ` : ''}
              </div>

              <!-- Filter Tabs Khối Lớp -->
              <div class="flex items-center gap-1.5 overflow-x-auto text-xs">
                <button type="button" data-video-filter-grade="all" class="px-3 py-1.5 rounded-lg font-bold transition ${this.videoGradeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                  Tất cả (93)
                </button>
                <button type="button" data-video-filter-grade="10" class="px-3 py-1.5 rounded-lg font-bold transition ${this.videoGradeFilter === '10' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                  Khối 10 (34)
                </button>
                <button type="button" data-video-filter-grade="11" class="px-3 py-1.5 rounded-lg font-bold transition ${this.videoGradeFilter === '11' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                  Khối 11 (31)
                </button>
                <button type="button" data-video-filter-grade="12" class="px-3 py-1.5 rounded-lg font-bold transition ${this.videoGradeFilter === '12' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                  Khối 12 (28)
                </button>
              </div>
            </div>

            <!-- Global Upload Progress Indicator (Hiện khi đang upload) -->
            <div id="archive-global-progress-bar" class="${this.isUploading ? '' : 'hidden'} p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-white">
                <span id="archive-global-status-text">
                  <i class="fa-solid fa-spinner fa-spin text-rose-600 mr-1.5"></i> Đang tải lên: ${escapeHtml(this.currentUploadingName || '')}
                </span>
                <span id="archive-global-percent-text" class="font-mono text-rose-600">0%</span>
              </div>
              <div class="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div id="archive-global-progress-fill" class="h-full bg-gradient-to-r from-rose-500 via-indigo-600 to-blue-500 transition-all duration-300" style="width: 0%"></div>
              </div>
              <div class="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span id="archive-global-speed-text">Tốc độ: 0 MB/s</span>
                <span id="archive-global-count-text">Hàng đợi: 0 file còn lại</span>
              </div>
            </div>

            <!-- Search box -->
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" id="input-archive-search" value="${escapeHtml(this.videoSearchQuery)}" placeholder="Tìm kiếm theo bài học, tên file (vd: TIN10-BAI1, K12Bai01)..." class="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white" />
            </div>
          </div>

          <!-- D. Bảng Danh Sách 93 Video Bài Giảng Chi Tiết -->
          <div class="overflow-x-auto max-h-[500px] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold z-10 shadow-sm">
                <tr>
                  <th class="py-2.5 px-3">#</th>
                  <th class="py-2.5 px-3">Khối</th>
                  <th class="py-2.5 px-3">Bài học & Chủ đề</th>
                  <th class="py-2.5 px-3">Tên file chuẩn</th>
                  <th class="py-2.5 px-3">Điểm dừng</th>
                  <th class="py-2.5 px-3">File trên máy</th>
                  <th class="py-2.5 px-3">Trạng thái</th>
                  <th class="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                ${this.renderVideoRowsHtml(manifestVideos, uploadedRecord)}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. CÀI ĐẶT BẢO MẬT & MÃ XÁC THỰC -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div class="border-b border-slate-100 dark:border-slate-700 pb-4">
            <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-lock text-amber-500"></i> Cấu Hình Mã Xác Thực Vai Trò & Google OAuth
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Cài đặt mã bí mật để cấp quyền nhanh cho giáo viên bộ môn Tin học hoặc quản trị viên.
            </p>
          </div>

          <form id="form-admin-config" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã xác thực Giáo viên (GV)
              </label>
              <input type="text" id="admin-input-teacher-code" value="${escapeHtml(adminConfig.teacherSecretCode || 'GV2025')}" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
              <span class="text-[10px] text-slate-400">Giáo viên nhập mã này để được cấp quyền thêm/sửa/xóa câu hỏi.</span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã xác thực Quản trị viên (Admin)
              </label>
              <input type="text" id="admin-input-admin-code" value="${escapeHtml(adminConfig.adminSecretCode || 'ADMIN2025')}" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-rose-500" />
              <span class="text-[10px] text-slate-400">Mã bí mật cấp quyền Admin tối cao cho toàn hệ thống.</span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email Quản trị viên chính thức (Auto-Admin)
              </label>
              <input type="email" id="admin-input-admin-email" value="${escapeHtml(adminConfig.adminEmail || 'nghiatnhcmue@gmail.com')}" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white" />
              <span class="text-[10px] text-slate-400">Email này đăng nhập bằng Google sẽ tự động trở thành Admin.</span>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Firebase Web API Key (Google Sign-In)
              </label>
              <input type="text" id="admin-input-client-id" value="${escapeHtml(Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig().apiKey : '')}" placeholder="Ví dụ: AIzaSyA1B2C3..." class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white" />
              <span class="text-[10px] text-slate-400">Web API Key lấy từ Firebase Console để kích hoạt xác thực Google.</span>
            </div>

            <div class="sm:col-span-2 pt-2">
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Hệ Thống
              </button>
            </div>
          </form>
        </div>

        <!-- 5. BẢO TRÌ & DỌN DẸP DỮ LIỆU -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="border-b border-slate-100 dark:border-slate-700 pb-4">
            <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-toolbox text-slate-500"></i> Sao Lưu, Phục Hồi & Bảo Trì Dữ Liệu
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Xuất tệp sao lưu hoặc thiết lập lại hệ thống khi chuyển giao năm học mới.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <button id="btn-admin-export-backup" class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-left transition group">
              <i class="fa-solid fa-download text-blue-600 text-lg mb-2 block"></i>
              <h4 class="text-xs font-bold text-slate-800 dark:text-white">Xuất File Sao Lưu (Backup)</h4>
              <p class="text-[11px] text-slate-400 mt-1">Tải về toàn bộ bảng điểm, câu hỏi tùy chỉnh và thiết lập.</p>
            </button>

            <button id="btn-admin-import-backup" class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-left transition group">
              <i class="fa-solid fa-upload text-emerald-600 text-lg mb-2 block"></i>
              <h4 class="text-xs font-bold text-slate-800 dark:text-white">Phục Hồi Sao Lưu (Restore)</h4>
              <p class="text-[11px] text-slate-400 mt-1">Khôi phục dữ liệu hệ thống từ tệp JSON sao lưu.</p>
            </button>
            <input type="file" id="input-admin-import-backup" accept=".json,application/json" class="hidden" />

            <button id="btn-admin-clear-history" class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-amber-500 text-left transition group">
              <i class="fa-solid fa-trash-can text-amber-600 text-lg mb-2 block"></i>
              <h4 class="text-xs font-bold text-slate-800 dark:text-white">Xóa Toàn Bộ Điểm Thi</h4>
              <p class="text-[11px] text-slate-400 mt-1">Dọn sạch lịch sử thi thử và bảng xếp hạng để đón đợt thi mới.</p>
            </button>

            <button id="btn-admin-reset-all" class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-rose-500 text-left transition group">
              <i class="fa-solid fa-triangle-exclamation text-rose-600 text-lg mb-2 block"></i>
              <h4 class="text-xs font-bold text-rose-600">Khôi Phục Gốc (Factory Reset)</h4>
              <p class="text-[11px] text-slate-400 mt-1">Đặt lại ngân hàng đề và hệ thống về trạng thái ban đầu.</p>
            </button>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
  },

  renderVideoRowsHtml(manifestVideos, uploadedRecord) {
    const q = (this.videoSearchQuery || '').toLowerCase().trim();
    const filtered = manifestVideos.filter(v => {
      if (this.videoGradeFilter !== 'all' && v.grade !== this.videoGradeFilter) return false;
      if (q) {
        const text = `${v.grade} ${v.video} ${v.lesson} ${v.topic}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      return `
        <tr>
          <td colspan="8" class="py-6 text-center text-slate-400 text-xs">
            Không tìm thấy video bài giảng nào khớp với điều kiện tìm kiếm.
          </td>
        </tr>
      `;
    }

    const baseUrl = Storage.getVideoBaseUrl();

    return filtered.map((v, idx) => {
      const vLower = v.video.toLowerCase();
      const localFile = this.selectedLocalFiles.get(vLower);
      const isUploaded = !!uploadedRecord[v.video] || this.remoteArchiveFiles.has(vLower);
      const isCurrentUploading = this.isUploading && this.currentUploadingName === v.video;

      let statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">⚪ Chưa chọn file</span>';
      if (isUploaded) {
        statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">🟢 Đã tải lên Archive</span>';
      } else if (isCurrentUploading) {
        statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse">🔵 Đang tải lên...</span>';
      } else if (localFile) {
        const sizeMb = (localFile.size / (1024 * 1024)).toFixed(1);
        statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">🟡 Sẵn sàng (${sizeMb} MB)</span>`;
      }

      const directUrl = `${baseUrl}${v.video}`;

      return `
        <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
          <td class="py-2.5 px-3 font-mono text-slate-400 text-[11px]">${idx + 1}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded font-black text-[10px] ${v.grade === '12' ? 'bg-rose-100 text-rose-700' : v.grade === '11' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">
              K${v.grade}
            </span>
          </td>
          <td class="py-2.5 px-3">
            <span class="font-bold text-slate-800 dark:text-white block truncate max-w-[220px]" title="${escapeHtml(v.lesson)}">
              ${escapeHtml(v.lesson)}
            </span>
            <span class="text-[10px] text-slate-400 block truncate max-w-[220px]" title="${escapeHtml(v.topic)}">
              ${escapeHtml(v.topic)}
            </span>
          </td>
          <td class="py-2.5 px-3 font-mono text-xs text-blue-600 dark:text-blue-400 font-bold">
            ${escapeHtml(v.video)}
          </td>
          <td class="py-2.5 px-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              <i class="fa-solid fa-stopwatch text-[9px]"></i> ${v.checkpoints.length} mốc
            </span>
          </td>
          <td class="py-2.5 px-3 text-[11px] text-slate-500 font-mono">
            ${localFile ? `${(localFile.size / (1024 * 1024)).toFixed(1)} MB` : '-'}
          </td>
          <td class="py-2.5 px-3" id="status-cell-${vLower.replace(/[^a-z0-9]/g, '_')}">
            ${statusBadge}
          </td>
          <td class="py-2.5 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              ${localFile && !isUploaded ? `
                <button type="button" data-single-upload-video="${escapeHtml(v.video)}" class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition shadow-sm">
                  <i class="fa-solid fa-arrow-up-from-bracket mr-1"></i> Tải
                </button>
              ` : ''}
              ${isUploaded ? `
                <a href="${directUrl}" target="_blank" class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition flex items-center gap-1" title="Mở link video trên Archive.org">
                  <i class="fa-solid fa-external-link"></i> Link
                </a>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  bindEvents() {
    // 1. Cấu hình Cơ sở dữ liệu Đám mây (Cloud Database)
    const formCloud = document.getElementById('form-cloud-config');
    if (formCloud) {
      formCloud.onsubmit = async (e) => {
        e.preventDefault();
        const url = document.getElementById('cloud-cfg-url')?.value.trim() || DEFAULT_FIREBASE_DB_URL;
        const apiKey = document.getElementById('cloud-cfg-api-key')?.value.trim() || '';
        const interval = parseFloat(document.getElementById('cloud-cfg-interval')?.value || '1');

        CloudSync.saveConfig({
          enabled: true,
          databaseUrl: url,
          apiKey: apiKey,
          intervalMinutes: interval
        });

        if (apiKey) {
          const authCfg = Storage.saveFirebaseAuthConfig({ apiKey, databaseURL: url });
          await CloudSync.pushAuthConfigToCloud(authCfg, url);
          if (window.Auth && typeof window.Auth.initFirebaseAuth === 'function') {
            window.Auth.initFirebaseAuth();
          }
        }

        alert(`✅ Đã lưu cấu hình Đám mây thành công!\nCơ sở dữ liệu đang kết nối: ${url}`);
        this.render();

        await CloudSync.syncAll(true);
        this.render();
      };
    }

    // Nút Kiểm tra kết nối Cloud
    const btnTest = document.getElementById('btn-cloud-test-conn');
    if (btnTest) {
      btnTest.onclick = async () => {
        const url = document.getElementById('cloud-cfg-url')?.value.trim() || '';
        if (!url) {
          alert('Vui lòng nhập URL Firebase Database trước khi kiểm tra!');
          return;
        }
        btnTest.disabled = true;
        btnTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang test...';
        const res = await CloudSync.testConnection(url);
        btnTest.disabled = false;
        btnTest.innerHTML = '<i class="fa-solid fa-bolt mr-1"></i> Kiểm tra kết nối';
        alert(res.message);
      };
    }

    // Nút Đồng bộ ngay
    const btnSyncNow = document.getElementById('btn-cloud-sync-now');
    if (btnSyncNow) {
      btnSyncNow.onclick = async () => {
        btnSyncNow.disabled = true;
        btnSyncNow.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang đồng bộ...';
        await CloudSync.syncAll(true);
        btnSyncNow.disabled = false;
        btnSyncNow.innerHTML = '<i class="fa-solid fa-arrows-rotate mr-1"></i> Đồng bộ ngay';
        this.render();
      };
    }

    // Nút Đẩy dữ liệu lên Cloud
    const btnPush = document.getElementById('btn-cloud-push-all');
    if (btnPush) {
      btnPush.onclick = async () => {
        await CloudSync.pushAllLocalToCloud();
        this.render();
      };
    }

    // Nút Kéo dữ liệu từ Cloud về
    const btnPull = document.getElementById('btn-cloud-pull-all');
    if (btnPull) {
      btnPull.onclick = async () => {
        await CloudSync.pullAllCloudToLocal();
        this.render();
      };
    }

    // 2. Cấu hình Archive.org S3
    const formArchive = document.getElementById('form-archive-config');
    if (formArchive) {
      formArchive.onsubmit = async (e) => {
        e.preventDefault();
        const accessKey = document.getElementById('archive-cfg-access-key')?.value.trim() || '';
        const secretKey = document.getElementById('archive-cfg-secret-key')?.value.trim() || '';
        const identifier = document.getElementById('archive-cfg-identifier')?.value.trim() || 'tinhoc-hub-thpt';
        let baseUrl = document.getElementById('archive-cfg-base-url')?.value.trim() || `https://archive.org/cors/${identifier}/`;

        if (baseUrl.includes('archive.org/download/')) {
          baseUrl = baseUrl.replace('archive.org/download/', 'archive.org/cors/');
        }
        if (!baseUrl.endsWith('/')) baseUrl += '/';

        const updated = Storage.saveVideoConfig({
          archiveAccessKey: accessKey,
          archiveSecretKey: secretKey,
          archiveIdentifier: identifier,
          videoBaseUrl: baseUrl
        });

        await CloudSync.pushVideoConfigToCloud(updated);

        alert(`✅ Đã lưu cấu hình Archive.org S3 lên máy chủ đám mây thành công!\n(Đã đồng bộ tại ${CloudSync.getBaseUrl()})`);
        this.render();
      };

      // Tự động lưu ngầm khi Admin nhập xong từng ô (tránh mất dữ liệu khi chuyển tab hoặc chưa kịp bấm Lưu)
      const saveS3InputsSilently = () => {
        const accessKey = document.getElementById('archive-cfg-access-key')?.value.trim() || '';
        const secretKey = document.getElementById('archive-cfg-secret-key')?.value.trim() || '';
        const identifier = document.getElementById('archive-cfg-identifier')?.value.trim() || 'tinhoc-hub-thpt';
        let baseUrl = document.getElementById('archive-cfg-base-url')?.value.trim() || `https://archive.org/cors/${identifier}/`;
        if (baseUrl.includes('archive.org/download/')) {
          baseUrl = baseUrl.replace('archive.org/download/', 'archive.org/cors/');
        }
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        if (accessKey || secretKey) {
          const cfg = Storage.saveVideoConfig({
            archiveAccessKey: accessKey,
            archiveSecretKey: secretKey,
            archiveIdentifier: identifier,
            videoBaseUrl: baseUrl
          });
          CloudSync.pushVideoConfigToCloud(cfg);
        }
      };
            archiveAccessKey: accessKey,
            archiveSecretKey: secretKey,
            archiveIdentifier: identifier,
            videoBaseUrl: baseUrl
          });
        }
      };

      ['archive-cfg-access-key', 'archive-cfg-secret-key', 'archive-cfg-identifier', 'archive-cfg-base-url'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', saveS3InputsSilently);
          el.addEventListener('blur', saveS3InputsSilently);
        }
      });
    }

    // Toggle hiện/ẩn S3 Secret Key
    const btnToggleSecret = document.getElementById('btn-toggle-s3-secret');
    if (btnToggleSecret) {
      btnToggleSecret.onclick = () => {
        const input = document.getElementById('archive-cfg-secret-key');
        if (input) {
          const isPass = input.type === 'password';
          input.type = isPass ? 'text' : 'password';
          btnToggleSecret.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        }
      };
    }

    // Kiểm tra tính hợp lệ của Khóa S3 API Archive.org
    const btnTestS3 = document.getElementById('btn-test-archive-s3');
    if (btnTestS3) {
      btnTestS3.onclick = async () => {
        const accessKey = document.getElementById('archive-cfg-access-key')?.value.trim() || '';
        const secretKey = document.getElementById('archive-cfg-secret-key')?.value.trim() || '';
        const identifier = document.getElementById('archive-cfg-identifier')?.value.trim() || 'tinhoc-hub-thpt';

        if (!accessKey || !secretKey) {
          alert('Vui lòng nhập cả Archive.org S3 Access Key và Secret Key trước khi kiểm tra!');
          document.getElementById('archive-cfg-access-key')?.focus();
          return;
        }

        btnTestS3.disabled = true;
        btnTestS3.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang test...';

        try {
          const testUrl = `https://s3.us.archive.org/${encodeURIComponent(identifier)}/_test_s3_connection.txt`;
          const res = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', testUrl, true);
            xhr.setRequestHeader('Authorization', `LOW ${accessKey}:${secretKey}`);
            xhr.setRequestHeader('x-amz-auto-make-bucket', '1');
            xhr.setRequestHeader('x-archive-meta-mediatype', 'texts');
            xhr.setRequestHeader('x-archive-meta-title', 'uri(TinHocHub%20S3%20Connection%20Test)');
            xhr.setRequestHeader('x-archive-ignore-preexisting-bucket', '1');
            xhr.setRequestHeader('Content-Type', 'text/plain');
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ ok: true, status: xhr.status });
              } else {
                let detail = xhr.statusText;
                try {
                  const xml = new DOMParser().parseFromString(xhr.responseText, 'text/xml');
                  const msg = xml.querySelector('Message')?.textContent;
                  const code = xml.querySelector('Code')?.textContent;
                  if (code || msg) detail = `${code || ''}: ${msg || ''}`.trim();
                } catch (e) {}
                resolve({ ok: false, status: xhr.status, detail });
              }
            };
            xhr.onerror = () => reject(new Error('Lỗi kết nối mạng đến s3.us.archive.org'));
            xhr.send('TinHocHub connection OK');
          });

          if (res.ok) {
            const updated = Storage.saveVideoConfig({
              archiveAccessKey: accessKey,
              archiveSecretKey: secretKey,
              archiveIdentifier: identifier
            });
            if (window.CloudSync && typeof window.CloudSync.pushVideoConfigToCloud === 'function') {
              await window.CloudSync.pushVideoConfigToCloud(updated);
            }
            alert(`🎉 CHÚC MỪNG!\nKhóa S3 Archive.org hoàn toàn HỢP LỆ (Mã ${res.status} OK)!\nBucket: [${identifier}]\nĐã tự động lưu cấu hình lên máy chủ đám mây. Bạn có thể bấm "Bắt Đầu Tải Lên Tất Cả" ngay.`);
          } else {
            alert(`❌ KHÓA S3 CHƯA HỢP LỆ!\nMã HTTP: ${res.status}\nChi tiết: ${res.detail}\n\n👉 Vui lòng đăng nhập https://archive.org/account/s3.php để lấy đúng S3 Access Key và Secret Key.`);
          }
        } catch (err) {
          alert(`⚠️ Lỗi kiểm tra kết nối S3: ${err.message}`);
        } finally {
          btnTestS3.disabled = false;
          btnTestS3.innerHTML = '<i class="fa-solid fa-key mr-1"></i> Kiểm Tra Khóa S3';
        }
      };
    }

    // Quét file đã có trên Archive.org qua REST API Metadata
    const btnCheckRemote = document.getElementById('btn-archive-check-remote');
    if (btnCheckRemote) {
      btnCheckRemote.onclick = async () => {
        const id = document.getElementById('archive-cfg-identifier')?.value.trim() || 'tinhoc-hub-thpt';
        btnCheckRemote.disabled = true;
        btnCheckRemote.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang quét...';

        try {
          const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/files`);
          if (!res.ok) {
            throw new Error(`Archive.org phản hồi HTTP ${res.status}`);
          }
          const data = await res.json();
          const files = Array.isArray(data.result) ? data.result : [];
          this.remoteArchiveFiles.clear();
          let count = 0;
          files.forEach(f => {
            if (f.name) {
              this.remoteArchiveFiles.add(f.name.toLowerCase());
              count++;
            }
          });

          alert(`✅ Đã quét xong Bucket [${id}]!\nTìm thấy ${count} file đã lưu trữ trên Archive.org.`);
        } catch (err) {
          alert(`⚠️ Không thể quét tệp từ Archive.org: ${err.message}\n(Lưu ý: Nếu đây là bucket mới toanh chưa tải file nào thì Archive.org sẽ chưa có metadata, bạn hãy bấm Tải Lên file đầu tiên để tự động khởi tạo bucket).`);
        } finally {
          btnCheckRemote.disabled = false;
          btnCheckRemote.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Quét File Đã Có Trên Archive.org';
          this.render();
        }
      };
    }

    // Xử lý chọn thư mục video
    const btnPickFolder = document.getElementById('btn-pick-archive-folder');
    const inputFolder = document.getElementById('input-archive-folder');
    if (btnPickFolder && inputFolder) {
      btnPickFolder.onclick = () => inputFolder.click();
      inputFolder.onchange = (e) => this.handleLocalFilesSelected(e.target.files);
    }

    // Xử lý chọn file video
    const btnPickFiles = document.getElementById('btn-pick-archive-files');
    const inputFiles = document.getElementById('input-archive-files');
    if (btnPickFiles && inputFiles) {
      btnPickFiles.onclick = () => inputFiles.click();
      inputFiles.onchange = (e) => this.handleLocalFilesSelected(e.target.files);
    }

    // Xử lý Drag & Drop trên dropzone
    const dropzone = document.getElementById('archive-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.add('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-950/40');
        });
      });
      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.remove('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-950/40');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleLocalFilesSelected(files);
        }
      });
    }

    // Filter khối lớp
    this.container.querySelectorAll('[data-video-filter-grade]').forEach(btn => {
      btn.onclick = () => {
        this.videoGradeFilter = btn.getAttribute('data-video-filter-grade');
        this.render();
      };
    });

    // Tìm kiếm video
    const inputSearch = document.getElementById('input-archive-search');
    if (inputSearch) {
      inputSearch.oninput = (e) => {
        this.videoSearchQuery = e.target.value;
        const tbody = this.container.querySelector('tbody');
        if (tbody) {
          const manifestVideos = this.getManifestVideos();
          const uploadedRecord = Storage.getVideoConfig().uploadedVideos || {};
          tbody.innerHTML = this.renderVideoRowsHtml(manifestVideos, uploadedRecord);
          this.bindRowEvents();
        }
      };
    }

    // Bắt đầu Batch Upload
    const btnBatch = document.getElementById('btn-start-batch-upload');
    if (btnBatch) {
      btnBatch.onclick = () => this.startBatchUpload();
    }

    // Tạm dừng / Tiếp tục
    const btnPauseResume = document.getElementById('btn-pause-resume-upload');
    if (btnPauseResume) {
      btnPauseResume.onclick = () => {
        this.isPaused = !this.isPaused;
        this.render();
        if (!this.isPaused && this.isUploading) {
          this.processNextInQueue();
        }
      };
    }

    // Hủy bỏ upload
    const btnCancel = document.getElementById('btn-cancel-upload');
    if (btnCancel) {
      btnCancel.onclick = () => {
        if (confirm('Bạn có chắc chắn muốn hủy bỏ tiến trình tải lên?')) {
          if (this.currentXhr) {
            this.currentXhr.abort();
            this.currentXhr = null;
          }
          this.isUploading = false;
          this.isPaused = false;
          this.uploadQueue = [];
          this.render();
        }
      };
    }

    this.bindRowEvents();

    // 3. Cấu hình bảo mật hệ thống
    const formAdmin = document.getElementById('form-admin-config');
    if (formAdmin) {
      formAdmin.onsubmit = (e) => {
        e.preventDefault();
        const teacherCode = document.getElementById('admin-input-teacher-code')?.value || 'GV2025';
        const adminCode = document.getElementById('admin-input-admin-code')?.value || 'ADMIN2025';
        const adminEmail = document.getElementById('admin-input-admin-email')?.value || '';
        const clientId = document.getElementById('admin-input-client-id')?.value || '';

        Storage.saveAdminConfig({
          teacherSecretCode: teacherCode.trim(),
          adminSecretCode: adminCode.trim(),
          adminEmail: adminEmail.trim()
        });

        if (clientId.trim()) {
          const val = clientId.trim();
          if (val.startsWith('AIza')) {
            const authCfg = Storage.saveFirebaseAuthConfig({ apiKey: val });
            if (window.CloudSync && typeof window.CloudSync.pushAuthConfigToCloud === 'function') {
              window.CloudSync.pushAuthConfigToCloud(authCfg);
            }
            if (Auth.initFirebaseAuth) Auth.initFirebaseAuth();
          } else if (val.includes('googleusercontent.com')) {
            Storage.saveAdminConfig({ googleClientId: val });
          } else {
            alert('Lưu ý: Mã Firebase Web API Key phải bắt đầu bằng "AIzaSy...". Vui lòng kiểm tra lại!');
          }
        }

        alert('Đã lưu cấu hình hệ thống thành công!');
        this.render();
      };
    }

    // Đổi vai trò thành viên từ dropdown
    this.container.querySelectorAll('[data-user-role-select]').forEach(select => {
      select.addEventListener('change', (e) => {
        const email = select.getAttribute('data-user-role-select');
        const newRole = e.target.value;
        Storage.updateAccountRole(email, newRole);
        alert(`Đã cập nhật vai trò của ${email} thành [${newRole.toUpperCase()}]!`);
        this.render();
      });
    });

    // Làm mới danh sách user
    this.container.querySelector('#btn-admin-refresh-users')?.addEventListener('click', () => {
      this.render();
    });

    // Xuất backup
    this.container.querySelector('#btn-admin-export-backup')?.addEventListener('click', () => {
      const backupData = Storage.exportBackup();
      const blob = new Blob([backupData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TinHocHub_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Nhập backup
    const importBtn = this.container.querySelector('#btn-admin-import-backup');
    const importFileInput = this.container.querySelector('#input-admin-import-backup');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const ok = Storage.importBackup(ev.target.result);
          if (ok) {
            alert('Đã phục hồi toàn bộ dữ liệu sao lưu thành công!');
            this.render();
          } else {
            alert('Tệp sao lưu không hợp lệ! Vui lòng chọn đúng tệp JSON sao lưu của TinHocHub.');
          }
        };
        reader.readAsText(file);
      });
    }

    // Xóa lịch sử thi
    this.container.querySelector('#btn-admin-clear-history')?.addEventListener('click', () => {
      if (confirm('CẢNH BÁO: Thầy/Cô có chắc chắn muốn xóa TOÀN BỘ lịch sử bài thi và bảng xếp hạng? Hành động này không thể hoàn tác.')) {
        Storage.clearExamHistory();
        alert('Đã xóa sạch lịch sử thi thử!');
        this.render();
      }
    });

    // Khôi phục gốc
    this.container.querySelector('#btn-admin-reset-all')?.addEventListener('click', () => {
      if (confirm('NGUY HIỂM: Thầy/Cô có chắc chắn muốn khôi phục toàn bộ hệ thống về mặc định ban đầu? Mọi câu hỏi thêm/sửa và bảng điểm sẽ được đặt lại.')) {
        Storage.resetQuestionsToDefault();
        Storage.clearExamHistory();
        alert('Đã đặt lại toàn bộ hệ thống về dữ liệu gốc ban đầu!');
        this.render();
      }
    });
  },

  bindRowEvents() {
    // Nút tải lên từng file riêng lẻ
    this.container.querySelectorAll('[data-single-upload-video]').forEach(btn => {
      btn.onclick = () => {
        const videoName = btn.getAttribute('data-single-upload-video');
        const file = this.selectedLocalFiles.get(videoName.toLowerCase());
        if (file) {
          this.uploadSingleFile(videoName, file);
        } else {
          alert(`Chưa chọn file ${videoName} từ máy tính! Vui lòng chọn file trước.`);
        }
      };
    });
  },

  handleLocalFilesSelected(fileList) {
    if (!fileList || fileList.length === 0) return;
    const manifestVideos = this.getManifestVideos();
    const manifestMap = new Map();
    manifestVideos.forEach(v => {
      const vLower = v.video.toLowerCase();
      manifestMap.set(vLower, vLower);
      // Hỗ trợ Bai01.mp4 <-> K12Bai01.mp4
      if (vLower.startsWith('k12bai')) {
        manifestMap.set(vLower.replace('k12bai', 'bai'), vLower);
      }
      // Hỗ trợ TIN10-BAI01.mp4 <-> TIN10-BAI1.mp4
      manifestMap.set(vLower.replace(/bai(\d+)/, (m, d) => `bai${d.padStart(2, '0')}`), vLower);
      manifestMap.set(vLower.replace(/bai0+(\d+)/, 'bai$1'), vLower);
    });

    let matched = 0;
    Array.from(fileList).forEach(file => {
      if (file.name.toLowerCase().endsWith('.mp4')) {
        const fNameLower = file.name.toLowerCase();
        const targetVideoName = manifestMap.get(fNameLower);
        if (targetVideoName) {
          this.selectedLocalFiles.set(targetVideoName, file);
          matched++;
        }
      }
    });

    alert(`📁 Đã duyệt ${fileList.length} tệp tin.\n✅ Đã ghép khớp thành công: ${matched} / ${manifestVideos.length} video bài giảng chuẩn!`);
    this.render();
  },

  async startBatchUpload() {
    let config = Storage.getVideoConfig();
    const inputAccess = document.getElementById('archive-cfg-access-key')?.value.trim();
    const inputSecret = document.getElementById('archive-cfg-secret-key')?.value.trim();
    const inputId = document.getElementById('archive-cfg-identifier')?.value.trim();

    if (inputAccess || inputSecret) {
      config = Storage.saveVideoConfig({
        archiveAccessKey: inputAccess || config.archiveAccessKey,
        archiveSecretKey: inputSecret || config.archiveSecretKey,
        archiveIdentifier: inputId || config.archiveIdentifier || 'tinhoc-hub-thpt'
      });
    }

    if (!config.archiveAccessKey || !config.archiveSecretKey) {
      alert('Vui lòng nhập Archive.org S3 Access Key và Secret Key trước khi tải lên!\n(Đăng nhập https://archive.org/account/s3.php để lấy khóa miễn phí).');
      document.getElementById('archive-cfg-access-key')?.focus();
      return;
    }

    const manifestVideos = this.getManifestVideos();
    const queue = [];

    manifestVideos.forEach(v => {
      const vLower = v.video.toLowerCase();
      const file = this.selectedLocalFiles.get(vLower);
      const isAlreadyUp = !!config.uploadedVideos?.[v.video] || this.remoteArchiveFiles.has(vLower);
      if (file && !isAlreadyUp) {
        queue.push({ videoName: v.video, file, lesson: v.lesson });
      }
    });

    if (queue.length === 0) {
      alert('Không có video nào cần tải lên (hoặc các video đã có trên Archive.org rồi)!');
      return;
    }

    const confirmMsg = `Chuẩn bị tải lên ${queue.length} video bài giảng lên Archive.org (${config.archiveIdentifier || 'tinhoc-hub-thpt'}).\nBạn có muốn bắt đầu ngay?`;
    if (!confirm(confirmMsg)) return;

    this.uploadQueue = queue;
    this.isUploading = true;
    this.isPaused = false;
    this.uploadProgressStats = {
      totalCount: queue.length,
      currentIdx: 0,
      successCount: 0,
      failedCount: 0,
      failures: [],
      startTime: Date.now()
    };

    this.render();
    this.processNextInQueue();
  },

  async processNextInQueue() {
    if (!this.isUploading || this.isPaused) return;

    if (this.uploadQueue.length === 0) {
      this.isUploading = false;
      this.currentUploadingName = null;
      const stats = this.uploadProgressStats;
      this.render();

      if (stats.successCount === 0) {
        const firstErr = stats.failures[0] || 'Lỗi mạng hoặc Archive.org từ chối xác thực';
        alert(`❌ TẢI LÊN THẤT BẠI!\n\nKhông có video nào được lưu trên Archive.org (${stats.failedCount} video lỗi).\nNguyên nhân: ${firstErr}\n\n👉 Vui lòng bấm nút "Kiểm Tra Khóa S3" trong bảng cấu hình để xác thực lại cặp khóa.`);
      } else if (stats.failedCount > 0) {
        alert(`⚠️ Đã tải lên thành công ${stats.successCount} / ${stats.totalCount} video.\nCó ${stats.failedCount} video bị lỗi (xem chi tiết ở cột Trạng thái bên dưới).`);
      } else {
        alert(`🎉 Chúc mừng! Đã tải lên thành công trọn vẹn ${stats.successCount} video bài giảng lên Archive.org!\nHọc sinh trên mọi thiết bị có thể bấm xem ngay bây giờ.`);
      }
      return;
    }

    const item = this.uploadQueue.shift();
    this.currentUploadingName = item.videoName;
    this.uploadProgressStats.currentIdx++;

    const fileSize = item.file ? item.file.size : 0;
    this.updateGlobalProgress(0, item.videoName, '0', 0, fileSize);
    this.updateRowStatus(item.videoName, 'uploading', '0%');

    try {
      await this.performS3Upload(item.videoName, item.file, item.lesson);
      // Ghi nhận thành công
      const cfg = Storage.getVideoConfig();
      if (!cfg.uploadedVideos) cfg.uploadedVideos = {};
      cfg.uploadedVideos[item.videoName] = {
        uploadedAt: new Date().toISOString(),
        size: fileSize
      };
      Storage.saveVideoConfig(cfg);
      this.remoteArchiveFiles.add(item.videoName.toLowerCase());
      this.uploadProgressStats.successCount++;
      this.updateRowStatus(item.videoName, 'success');
    } catch (err) {
      console.error(`Lỗi tải lên ${item.videoName}:`, err);
      this.uploadProgressStats.failedCount++;
      this.uploadProgressStats.failures.push(err.message);
      this.updateRowStatus(item.videoName, 'error', err.message);

      // Nếu lỗi từ chối xác thực khóa S3 (401 hoặc 403 Forbidden / InvalidAccessKeyId)
      const errStr = (err.message || '').toLowerCase();
      if (errStr.includes('403') || errStr.includes('401') || errStr.includes('invalidaccesskey') || errStr.includes('accessdenied')) {
        this.isUploading = false;
        this.currentUploadingName = null;
        this.uploadQueue = [];
        this.render();
        alert(`❌ LỖI XÁC THỰC S3 ARCHIVE.ORG!\n\nChi tiết: ${err.message}\n\nNguyên nhân: Khóa S3 Access Key hoặc Secret Key của bạn chưa hợp lệ hoặc bị Archive.org từ chối.\n👉 Hãy đăng nhập https://archive.org/account/s3.php để copy đúng Access Key và Secret Key, dán vào ô cấu hình rồi bấm "Kiểm Tra Khóa S3" trước khi tải lại.`);
        return;
      }
    }

    if (this.isUploading && !this.isPaused) {
      // Nghỉ 1.5 giây giữa các file để đường truyền ổn định
      setTimeout(() => this.processNextInQueue(), 1500);
    }
  },

  async uploadSingleFile(videoName, file) {
    let config = Storage.getVideoConfig();
    const inputAccess = document.getElementById('archive-cfg-access-key')?.value.trim();
    const inputSecret = document.getElementById('archive-cfg-secret-key')?.value.trim();
    const inputId = document.getElementById('archive-cfg-identifier')?.value.trim();
    if (inputAccess || inputSecret) {
      config = Storage.saveVideoConfig({
        archiveAccessKey: inputAccess || config.archiveAccessKey,
        archiveSecretKey: inputSecret || config.archiveSecretKey,
        archiveIdentifier: inputId || config.archiveIdentifier || 'tinhoc-hub-thpt'
      });
    }

    if (!config.archiveAccessKey || !config.archiveSecretKey) {
      alert('Vui lòng nhập Archive.org S3 Access Key và Secret Key trước khi tải lên!\n(Đăng nhập https://archive.org/account/s3.php để lấy khóa).');
      return;
    }

    this.isUploading = true;
    this.currentUploadingName = videoName;
    this.updateRowStatus(videoName, 'uploading');

    const globalProg = document.getElementById('archive-global-progress-bar');
    if (globalProg) globalProg.classList.remove('hidden');

    try {
      await this.performS3Upload(videoName, file);
      const cfg = Storage.getVideoConfig();
      if (!cfg.uploadedVideos) cfg.uploadedVideos = {};
      cfg.uploadedVideos[videoName] = {
        uploadedAt: new Date().toISOString(),
        size: file.size
      };
      Storage.saveVideoConfig(cfg);
      this.remoteArchiveFiles.add(videoName.toLowerCase());
      this.updateRowStatus(videoName, 'success');
      alert(`✅ Tải lên video ${videoName} thành công lên Archive.org!`);
    } catch (err) {
      this.updateRowStatus(videoName, 'error', err.message);
      alert(`❌ Lỗi tải lên: ${err.message}`);
    } finally {
      this.isUploading = false;
      this.currentUploadingName = null;
      this.render();
    }
  },

  performS3Upload(videoName, file, lessonName = '') {
    return new Promise((resolve, reject) => {
      const config = Storage.getVideoConfig();
      const identifier = config.archiveIdentifier || 'tinhoc-hub-thpt';
      const targetUrl = `https://s3.us.archive.org/${encodeURIComponent(identifier)}/${encodeURIComponent(videoName)}`;

      const xhr = new XMLHttpRequest();
      this.currentXhr = xhr;

      const startTime = Date.now();

      // Tiêu đề metadata trên Archive.org phải mã hóa dạng uri(...) để tuân thủ chuẩn ISO-8859-1 của HTTP Header
      const rawTitle = `Bài giảng Tin học THPT - ${lessonName || videoName}`;
      const safeTitle = `uri(${encodeURIComponent(rawTitle)})`;

      try {
        xhr.open('PUT', targetUrl, true);
        xhr.setRequestHeader('Authorization', `LOW ${config.archiveAccessKey}:${config.archiveSecretKey}`);
        xhr.setRequestHeader('x-amz-auto-make-bucket', '1');
        xhr.setRequestHeader('x-archive-meta-mediatype', 'movies');
        xhr.setRequestHeader('x-archive-meta-collection', 'opensource_movies');
        xhr.setRequestHeader('x-archive-meta-title', safeTitle);
        xhr.setRequestHeader('x-archive-ignore-preexisting-bucket', '1');
        xhr.setRequestHeader('Content-Type', 'video/mp4');
      } catch (headerErr) {
        return reject(new Error(`Lỗi tạo Header HTTP: ${headerErr.message}`));
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const elapsed = (Date.now() - startTime) / 1000;
          const speedBytes = elapsed > 0 ? e.loaded / elapsed : 0;
          const speedMb = (speedBytes / (1024 * 1024)).toFixed(1);
          this.updateGlobalProgress(percent, videoName, speedMb, e.loaded, e.total);
          this.updateRowStatus(videoName, 'uploading', `${percent}%`);
        }
      };

      xhr.onload = () => {
        this.currentXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true);
        } else {
          let detail = xhr.statusText || '';
          try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xhr.responseText, 'text/xml');
            const code = xmlDoc.querySelector('Code')?.textContent;
            const msg = xmlDoc.querySelector('Message')?.textContent;
            if (code || msg) {
              detail = `${code || ''}: ${msg || ''}`.trim();
            }
          } catch(e) {}
          reject(new Error(`Archive.org phản hồi HTTP ${xhr.status} (${detail || 'Không thành công'})`));
        }
      };

      xhr.onerror = () => {
        this.currentXhr = null;
        reject(new Error('Lỗi kết nối mạng đến s3.us.archive.org. Kiểm tra đường truyền Internet!'));
      };

      xhr.onabort = () => {
        this.currentXhr = null;
        reject(new Error('Tiến trình tải lên đã bị hủy'));
      };

      xhr.send(file);
    });
  },

  updateRowStatus(videoName, status, extra = '') {
    const vLower = (videoName || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const cell = document.getElementById(`status-cell-${vLower}`);
    if (cell) {
      if (status === 'success') {
        cell.innerHTML = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">🟢 Đã tải lên Archive</span>';
      } else if (status === 'error') {
        cell.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300" title="${escapeHtml(extra)}">🔴 Lỗi: ${escapeHtml(extra.slice(0, 35))}</span>`;
      } else if (status === 'uploading') {
        const pctStr = extra ? ` (${extra})` : '';
        cell.innerHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 animate-pulse">🔵 Đang tải lên...${pctStr}</span>`;
      }
    }
  },

  updateGlobalProgress(percent, videoName, speedMb = '0', loaded = 0, total = 0) {
    const textStatus = document.getElementById('archive-global-status-text');
    const textPercent = document.getElementById('archive-global-percent-text');
    const fillBar = document.getElementById('archive-global-progress-fill');
    const textSpeed = document.getElementById('archive-global-speed-text');
    const textCount = document.getElementById('archive-global-count-text');

    if (textStatus) {
      textStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-rose-600 mr-1.5"></i> Đang tải lên: <b>${escapeHtml(videoName)}</b> (${(loaded / (1024*1024)).toFixed(1)} / ${(total / (1024*1024)).toFixed(1)} MB)`;
    }
    if (textPercent) textPercent.textContent = `${percent}%`;
    if (fillBar) fillBar.style.width = `${percent}%`;
    if (textSpeed) textSpeed.textContent = `Tốc độ: ${speedMb} MB/s`;
    if (textCount) {
      const remaining = this.uploadQueue.length;
      textCount.textContent = `Còn ${remaining} video trong hàng đợi`;
    }
  }
};
