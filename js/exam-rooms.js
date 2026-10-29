/**
 * TIN HỌC HUB - EXAM ROOMS & ASSIGNMENT CONTROLLER
 * Quản lý giao đề thi theo khung giờ, mật khẩu và chống gian lận cho Giáo viên & Admin
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';

export const ExamRooms = {
  container: null,

  init(containerEl) {
    this.container = containerEl;
    this.render();
    this.bindGlobalEvents();
  },

  render() {
    if (!this.container) return;
    const rooms = Storage.getExamRooms();
    const now = new Date();

    this.container.innerHTML = `
      <div class="space-y-6">
        <!-- Top Action Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-chalkboard-user text-emerald-600"></i> Quản Lý Phòng Thi & Giao Đề
            </h2>
            <p class="text-xs text-slate-400 mt-1">
              Tạo phòng thi theo thời gian, cấp mật khẩu cho lớp và kích hoạt giám sát chống gian lận
            </p>
          </div>

          <button id="btn-create-room" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-2 self-start sm:self-auto shrink-0">
            <i class="fa-solid fa-plus"></i> Tạo Phòng Thi Mới
          </button>
        </div>

        <!-- Room Cards List -->
        ${rooms.length === 0 ? `
          <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
            <i class="fa-solid fa-folder-open text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">Chưa có phòng thi nào</h3>
            <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              Hãy nhấn nút "Tạo Phòng Thi Mới" để giao đề thi kèm mật khẩu và thời gian làm bài cho học sinh.
            </p>
            <button id="btn-create-room-empty" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition">
              Tạo phòng thi đầu tiên
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            ${rooms.map(room => {
              const start = room.startTime ? new Date(room.startTime) : null;
              const end = room.endTime ? new Date(room.endTime) : null;
              
              let statusBadge = { text: 'Đang diễn ra', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' };
              if (start && now < start) {
                statusBadge = { text: 'Sắp mở đề', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' };
              } else if (end && now > end) {
                statusBadge = { text: 'Đã đóng đề', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-300' };
              }

              const antiCheat = room.antiCheat || { enabled: false };

              return `
                <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition space-y-4 relative flex flex-col justify-between">
                  <div>
                    <!-- Header Card -->
                    <div class="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${statusBadge.cls} mb-1.5">
                          ${statusBadge.text}
                        </span>
                        <h3 class="text-base font-bold text-slate-800 dark:text-white leading-snug">
                          ${escapeHtml(room.title)}
                        </h3>
                        <p class="text-xs text-slate-400 mt-0.5">Khối ${room.grade} • Thời lượng: ${room.duration} phút</p>
                      </div>

                      <!-- Room ID Badge -->
                      <div class="text-right shrink-0">
                        <span class="text-[10px] text-slate-400 block uppercase font-bold">Mã phòng</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <code class="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-black text-sm rounded-xl border border-blue-200 dark:border-blue-800">
                            ${room.id}
                          </code>
                          <button data-copy-room="${room.id}" class="p-1.5 text-slate-400 hover:text-blue-600 transition" title="Sao chép mã">
                            <i class="fa-regular fa-copy text-xs"></i>
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Room Parameters Grid -->
                    <div class="p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400"><i class="fa-solid fa-key mr-1.5 text-amber-500"></i>Mật khẩu vào thi:</span>
                        <span class="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                          <span class="room-pwd-masked" id="pwd-${room.id}">••••••</span>
                          <span class="room-pwd-plain hidden text-emerald-600 font-bold" id="pwd-plain-${room.id}">${room.password || '(Không có)'}</span>
                          <button type="button" data-toggle-pwd="${room.id}" class="text-slate-400 hover:text-slate-600 text-[11px]">
                            <i class="fa-regular fa-eye"></i>
                          </button>
                        </span>
                      </div>

                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400"><i class="fa-regular fa-clock mr-1.5 text-blue-500"></i>Thời gian mở:</span>
                        <span class="font-medium">${start ? start.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Không giới hạn'}</span>
                      </div>

                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400"><i class="fa-regular fa-calendar-xmark mr-1.5 text-rose-500"></i>Thời gian đóng:</span>
                        <span class="font-medium">${end ? end.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Không giới hạn'}</span>
                      </div>

                      <div class="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                        <span class="text-slate-400"><i class="fa-solid fa-shield-halved mr-1.5 text-indigo-500"></i>Giám sát chống gian lận:</span>
                        <span class="font-bold ${antiCheat.enabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}">
                          ${antiCheat.enabled ? `Bật (Tối đa ${antiCheat.maxViolations || 3} lần vi phạm)` : 'Tắt'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                    <button data-share-room="${room.id}" class="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-300 text-xs font-bold rounded-xl transition flex items-center gap-1.5">
                      <i class="fa-solid fa-share-nodes text-[11px]"></i> Copy thông báo lớp
                    </button>

                    <div class="flex items-center gap-1.5">
                      <button data-view-results="${room.id}" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1">
                        <i class="fa-solid fa-chart-simple text-[11px]"></i> Điểm số
                      </button>
                      <button data-delete-room="${room.id}" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition" title="Xóa phòng thi này">
                        <i class="fa-regular fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    this.bindCardEvents();
  },

  bindCardEvents() {
    // Nút tạo phòng thi
    const btnCreate = this.container.querySelector('#btn-create-room');
    const btnCreateEmpty = this.container.querySelector('#btn-create-room-empty');
    if (btnCreate) btnCreate.onclick = () => this.openCreateModal();
    if (btnCreateEmpty) btnCreateEmpty.onclick = () => this.openCreateModal();

    // Toggle ẩn / hiện password
    this.container.querySelectorAll('[data-toggle-pwd]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-toggle-pwd');
        const masked = document.getElementById(`pwd-${id}`);
        const plain = document.getElementById(`pwd-plain-${id}`);
        if (masked && plain) {
          const isMaskedHidden = masked.classList.toggle('hidden');
          plain.classList.toggle('hidden', !isMaskedHidden);
          btn.innerHTML = isMaskedHidden ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
        }
      };
    });

    // Copy mã phòng
    this.container.querySelectorAll('[data-copy-room]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-copy-room');
        navigator.clipboard.writeText(id).then(() => {
          alert(`Đã sao chép mã phòng thi: ${id}`);
        });
      };
    });

    // Copy thông báo gửi nhóm lớp
    this.container.querySelectorAll('[data-share-room]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-share-room');
        const room = Storage.getExamRoom(id);
        if (!room) return;

        const start = room.startTime ? new Date(room.startTime).toLocaleString('vi-VN') : 'Mở tự do';
        const end = room.endTime ? new Date(room.endTime).toLocaleString('vi-VN') : 'Không giới hạn';
        const directUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
        const msg = `📢 THÔNG BÁO KIỂM TRA MÔN TIN HỌC THPT
📝 Bài thi: ${room.title} (Khối ${room.grade})
⏱ Thời gian làm bài: ${room.duration} phút
📅 Thời gian mở: ${start}
📅 Thời gian đóng: ${end}
🔑 MÃ PHÒNG THI: ${room.id}
🔒 MẬT KHẨU: ${room.password || 'Không có'}
🛡 Giám sát chống gian lận: ${room.antiCheat?.enabled ? 'Có (Cấm chuyển tab/thoát toàn màn hình)' : 'Không'}
👉 Link vào thi trực tiếp: ${directUrl}
(Hoặc vào https://on-tap.nghiaedu.workers.dev/ -> Chọn Thi Thử -> Nhập Mã & Mật khẩu)`;

        navigator.clipboard.writeText(msg).then(() => {
          alert('Đã sao chép toàn bộ thông tin phòng thi vào bộ nhớ tạm!\nThầy Cô có thể dán (Paste) ngay vào nhóm Zalo hoặc Facebook của lớp.');
        });
      };
    });

    // Xem kết quả của phòng
    this.container.querySelectorAll('[data-view-results]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-view-results');
        window.dispatchEvent(new CustomEvent('filter-gradebook-by-room', { detail: { roomId: id } }));
      };
    });

    // Xóa phòng
    this.container.querySelectorAll('[data-delete-room]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-delete-room');
        if (confirm(`Bạn có chắc chắn muốn xóa phòng thi [${id}] không?`)) {
          Storage.deleteExamRoom(id);
          this.render();
        }
      };
    });
  },

  openCreateModal() {
    const modal = document.getElementById('modal-create-exam-room');
    if (!modal) return;

    // Reset form với giá trị gợi ý
    const titleInput = document.getElementById('room-input-title');
    const idInput = document.getElementById('room-input-id');
    const gradeSelect = document.getElementById('room-input-grade');
    const durationInput = document.getElementById('room-input-duration');
    const pwdInput = document.getElementById('room-input-pwd');
    const startInput = document.getElementById('room-input-start');
    const endInput = document.getElementById('room-input-end');
    const antiCheatToggle = document.getElementById('room-input-anticheat');
    const maxViolationsInput = document.getElementById('room-input-max-violations');

    if (titleInput) titleInput.value = 'Kiểm tra 1 tiết Tin học ' + (gradeSelect ? gradeSelect.value : '12');
    if (idInput) idInput.value = 'TIN' + (gradeSelect ? gradeSelect.value : '12') + '-' + Math.floor(1000 + Math.random() * 9000);
    if (durationInput) durationInput.value = '45';
    if (pwdInput) pwdInput.value = String(Math.floor(1000 + Math.random() * 9000));
    
    // Gợi ý giờ: Từ hiện tại đến 7 ngày sau (định dạng YYYY-MM-DDTHH:mm)
    const now = new Date();
    const nextWeek = new Date(Date.now() + 7 * 86400000);
    const toInputVal = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (startInput) startInput.value = toInputVal(now);
    if (endInput) endInput.value = toInputVal(nextWeek);
    if (antiCheatToggle) antiCheatToggle.checked = true;
    if (maxViolationsInput) maxViolationsInput.value = '3';

    modal.classList.remove('hidden');
  },

  bindGlobalEvents() {
    const modal = document.getElementById('modal-create-exam-room');
    if (!modal) return;

    const closeBtn = document.getElementById('btn-close-room-modal');
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

    const saveBtn = document.getElementById('btn-save-exam-room');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const title = document.getElementById('room-input-title')?.value.trim();
        const id = document.getElementById('room-input-id')?.value.trim().toUpperCase();
        const grade = document.getElementById('room-input-grade')?.value || '12';
        const duration = parseInt(document.getElementById('room-input-duration')?.value || '45', 10);
        const password = document.getElementById('room-input-pwd')?.value.trim();
        const startTime = document.getElementById('room-input-start')?.value;
        const endTime = document.getElementById('room-input-end')?.value;
        const antiCheatEnabled = document.getElementById('room-input-anticheat')?.checked ?? true;
        const maxViolations = parseInt(document.getElementById('room-input-max-violations')?.value || '3', 10);
        const examType = document.getElementById('room-input-type')?.value || 'bgd_2025';

        if (!title) {
          alert('Vui lòng nhập Tên bài kiểm tra / Phòng thi!');
          return;
        }
        if (!id) {
          alert('Vui lòng nhập Mã phòng thi!');
          return;
        }

        const user = Auth.currentUser;

        const roomData = {
          id,
          title,
          grade,
          duration,
          password,
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          type: examType,
          shuffleQuestions: true,
          shuffleOptions: true,
          createdBy: user?.email || '',
          creatorName: user?.fullName || 'Giáo viên',
          antiCheat: {
            enabled: antiCheatEnabled,
            maxViolations,
            enforceFullscreen: true,
            preventTabSwitch: true,
            disableCopyPaste: true,
            blockDevTools: true
          },
          status: 'active'
        };

        Storage.saveExamRoom(roomData);
        modal.classList.add('hidden');
        this.render();
        alert(`Tạo phòng thi [${id}] thành công!\nThầy Cô có thể bấm nút "Copy thông báo lớp" để gửi mã và mật khẩu cho học sinh.`);
      };
    }
  }
};
