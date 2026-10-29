/**
 * tinhoc-hub: Admin Manager (Quản Trị Hệ Thống)
 * Chỉ dành riêng cho Quản trị viên (Admin).
 * Quản lý: Phân quyền tài khoản (HS <-> GV <-> Admin), Cấu hình mã bảo mật, Google OAuth, Dọn dẹp/Sao lưu.
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';

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
            <span class="text-xs text-slate-400 font-bold block mb-1">TRẠNG THÁI MÁY CHỦ</span>
            <span class="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 inline-block mt-1">
              Cloudflare Pages OK
            </span>
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
