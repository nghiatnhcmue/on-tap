/**
 * tinhoc-hub: Admin Manager (Quản Trị Hệ Thống)
 * Chỉ dành riêng cho Quản trị viên (Admin).
 * Quản lý: Phân quyền tài khoản (HS <-> GV <-> Admin), Cấu hình mã bảo mật, Google OAuth, Dọn dẹp/Sao lưu.
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';
import { CloudSync } from './cloud-sync.js';

export const AdminManager = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();
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
    const history = Storage.getExamHistory();
    const examRooms = Storage.getExamRooms();
    const customQuestions12 = Storage.getCustomQuestions('12');
    const customQuestions11 = Storage.getCustomQuestions('11');
    const customQuestions10 = Storage.getCustomQuestions('10');
    const totalCustomQs = customQuestions12.length + customQuestions11.length + customQuestions10.length;
    const cloudStatus = CloudSync.getStatus();

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
              Toàn quyền cấu hình máy chủ, phân bổ vai trò thành viên (Admin, GV, HS), giám sát phòng thi và bảo trì hệ thống.
            </p>
          </div>

          <div class="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold text-amber-300">
            <i class="fa-solid fa-user-shield text-base"></i>
            <span>Đang đăng nhập: ${escapeHtml(Auth.currentUser?.fullName || 'Admin')}</span>
          </div>
        </div>

        <!-- Thống Kê Nhanh -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-xs text-slate-400 font-bold block mb-1">TÀI KHOẢN ĐÃ LƯU</span>
            <span class="text-2xl font-black text-slate-800 dark:text-white">${accounts.length}</span>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-xs text-slate-400 font-bold block mb-1">PHÒNG THI / GIAO ĐỀ</span>
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400">${examRooms.length}</span>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-xs text-slate-400 font-bold block mb-1">BÀI THI HOÀN THÀNH</span>
            <span class="text-2xl font-black text-blue-600 dark:text-blue-400">${history.length}</span>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-xs text-slate-400 font-bold block mb-1">CÂU HỎI TỰ TẠO (GV)</span>
            <span class="text-2xl font-black text-purple-600 dark:text-purple-400">${totalCustomQs}</span>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span class="text-xs text-slate-400 font-bold block mb-1">CƠ SỞ DỮ LIỆU</span>
            ${cloudStatus.isConfigured ? `
              <span class="text-xs font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 inline-block mt-1">
                🟢 Cloud Active
              </span>
            ` : `
              <span class="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 inline-block mt-1">
                ⚪ Cục bộ (Local)
              </span>
            `}
          </div>
        </div>

        <!-- 1. QUẢN LÝ PHÂN QUYỀN TÀI KHOẢN (USER ROLES RBAC) -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <h3 class="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-users-gear text-indigo-600"></i> Phân Quyền Thành Viên (Học Sinh, Giáo Viên, Admin)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Chỉ Admin có quyền chỉ định ai là Giáo viên (được can thiệp câu hỏi) hoặc Admin (toàn quyền).
              </p>
            </div>
            <button id="btn-admin-refresh-users" class="text-xs font-bold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40">
              <i class="fa-solid fa-rotate-right mr-1"></i> Làm mới danh sách
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900/50 text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
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
                Chuyển đổi TinHocHub thành Web Động: Học sinh ở nhà đăng ký & nộp bài trên điện thoại sẽ tự động bay về máy Thầy tức thì.
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
                <label for="cloud-cfg-enabled" class="text-xs font-bold text-slate-800 dark:text-white block cursor-pointer">
                  Kích hoạt Đồng bộ Đám mây (Cloud Sync)
                </label>
                <span class="text-[11px] text-slate-500 dark:text-slate-400">Bật tính năng này để mọi thiết bị (laptop của Thầy, điện thoại của HS) cùng chung 1 cơ sở dữ liệu.</span>
              </div>
              <input type="checkbox" id="cloud-cfg-enabled" ${cloudStatus.enabled ? 'checked' : ''} class="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="sm:col-span-2">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  URL Cơ Sở Dữ Liệu Đám Mây (Google Firebase Realtime Database) *
                </label>
                <div class="flex gap-2">
                  <input type="url" id="cloud-cfg-url" value="${escapeHtml(cloudStatus.databaseUrl || '')}" placeholder="https://tinhoc-thpt-default-rtdb.firebaseio.com" class="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500" />
                  <button type="button" id="btn-cloud-test-conn" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0">
                    <i class="fa-solid fa-bolt"></i> Kiểm tra kết nối
                  </button>
                </div>
                <span class="text-[11px] text-slate-400 mt-1 block">
                  Đường dẫn Realtime Database miễn phí 100% của Google (hoặc endpoint REST API).
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

          <!-- Hướng Dẫn Kích Hoạt Firebase 2 Phút Miễn Phí -->
          <div class="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-2">
            <h4 class="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2 text-xs">
              <i class="fa-brands fa-google text-amber-600"></i> Hướng dẫn kích hoạt Google Firebase Database miễn phí (2 phút):
            </h4>
            <ol class="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">
              <li>Truy cập <a href="https://console.firebase.google.com/" target="_blank" class="text-blue-600 font-bold underline">Firebase Console</a> bằng tài khoản Google của Thầy.</li>
              <li>Bấm <b>"Thêm dự án" (Add project)</b> & đặt tên (ví dụ: <code class="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono">tinhoc-hub</code>).</li>
              <li>Tại menu bên trái, chọn <b>Build -> Realtime Database</b> -> Bấm <b>"Tạo cơ sở dữ liệu" (Create Database)</b> -> Chọn chế độ <b>"Bắt đầu ở chế độ thử nghiệm" (Start in test mode)</b>.</li>
              <li>Sao chép đường link URL (dạng: <code class="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono">https://tinhoc-hub-default-rtdb.firebaseio.com</code>) rồi dán vào ô URL bên trên và bấm <b>"Lưu Cấu Hình Cloud"</b>. XONG! Mọi học sinh ở nhà sẽ tự động kết nối chung 1 cơ sở dữ liệu!</li>
            </ol>
          </div>
        </div>

        <!-- 2. CÀI ĐẶT BẢO MẬT & MÃ XÁC THỰC -->
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
                Google OAuth Client ID
              </label>
              <input type="text" id="admin-input-client-id" value="${escapeHtml(Auth.getGoogleClientId())}" placeholder="123456789-xxx.apps.googleusercontent.com" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-white" />
              <span class="text-[10px] text-slate-400">Client ID tạo từ Google Cloud Console cho miền Cloudflare.</span>
            </div>

            <div class="sm:col-span-2 pt-2">
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Hệ Thống
              </button>
            </div>
          </form>
        </div>

        <!-- 3. BẢO TRÌ & DỌN DẸP DỮ LIỆU -->
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

  bindEvents() {
    // 1. Cấu hình Cơ sở dữ liệu Đám mây (Cloud Database)
    const formCloud = document.getElementById('form-cloud-config');
    if (formCloud) {
      formCloud.onsubmit = async (e) => {
        e.preventDefault();
        const enabled = document.getElementById('cloud-cfg-enabled')?.checked ?? true;
        const url = document.getElementById('cloud-cfg-url')?.value.trim() || '';
        const interval = parseFloat(document.getElementById('cloud-cfg-interval')?.value || '1');

        CloudSync.saveConfig({
          enabled,
          databaseUrl: url,
          intervalMinutes: interval
        });

        alert('Đã lưu cấu hình Cơ sở dữ liệu Đám mây thành công!');
        this.render();

        if (enabled && url) {
          await CloudSync.syncAll(true);
          this.render();
        }
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

    // Lưu cấu hình Admin & Security codes
    const form = document.getElementById('form-admin-config');
    if (form) {
      form.onsubmit = (e) => {
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
          Auth.setGoogleClientId(clientId.trim());
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

    // Nhập / Phục hồi backup
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
  }
};
