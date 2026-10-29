/**
 * TIN HỌC HUB - EXAM ROOMS & ASSIGNMENT CONTROLLER
 * Quản lý giao đề thi theo khung giờ, trường học, lớp học, mật khẩu và chống gian lận cho Giáo viên & Admin
 */

import { Storage } from './storage.js';
import { Auth, SCHOOLS_DATA } from './auth.js';
import { escapeHtml } from './utils.js';

export const ExamRooms = {
  container: null,
  manifest: null,
  filterGrade: 'all',
  filterSchool: 'all',
  filterSearch: '',

  init(containerEl, manifest = null) {
    this.container = containerEl;
    if (manifest) this.manifest = manifest;
    this.render();
    this.bindGlobalEvents();
  },

  setManifest(manifest) {
    this.manifest = manifest;
  },

  render() {
    if (!this.container) return;
    const allRooms = Storage.getExamRooms();
    const now = new Date();

    // Lọc phòng thi theo bộ lọc của giáo viên
    const filteredRooms = allRooms.filter(room => {
      if (this.filterGrade !== 'all' && room.grade !== this.filterGrade) {
        return false;
      }
      if (this.filterSchool !== 'all') {
        const target = room.targetSchool || 'all';
        if (target !== 'all' && target !== this.filterSchool) {
          return false;
        }
      }
      if (this.filterSearch) {
        const query = this.filterSearch.toLowerCase();
        const matchTitle = (room.title || '').toLowerCase().includes(query);
        const matchId = (room.id || '').toLowerCase().includes(query);
        if (!matchTitle && !matchId) return false;
      }
      return true;
    });

    this.container.innerHTML = `
      <div class="space-y-6">
        <!-- Top Action Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-chalkboard-user text-emerald-600"></i> Quản Lý Phòng Thi & Giao Đề Chuẩn
            </h2>
            <p class="text-xs text-slate-400 mt-1">
              Giao bài theo từng trường, khối lớp và lớp học cụ thể • Cấp mật khẩu và kích hoạt giám sát chống gian lận
            </p>
          </div>

          <button id="btn-create-room" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-2 self-start sm:self-auto shrink-0">
            <i class="fa-solid fa-plus"></i> Tạo Phòng Thi Mới
          </button>
        </div>

        <!-- Filter Bar -->
        <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            <!-- Lọc theo Khối -->
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400 font-bold">Khối:</span>
              <select id="rooms-filter-grade" class="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all" ${this.filterGrade === 'all' ? 'selected' : ''}>Tất cả khối</option>
                <option value="12" ${this.filterGrade === '12' ? 'selected' : ''}>Khối 12</option>
                <option value="11" ${this.filterGrade === '11' ? 'selected' : ''}>Khối 11</option>
                <option value="10" ${this.filterGrade === '10' ? 'selected' : ''}>Khối 10</option>
              </select>
            </div>

            <!-- Lọc theo Trường -->
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400 font-bold">Trường:</span>
              <select id="rooms-filter-school" class="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all" ${this.filterSchool === 'all' ? 'selected' : ''}>Tất cả trường</option>
                <option value="EMASI" ${this.filterSchool === 'EMASI' ? 'selected' : ''}>EMASI</option>
                <option value="Phổ thông Năng khiếu" ${this.filterSchool === 'Phổ thông Năng khiếu' ? 'selected' : ''}>Phổ thông Năng khiếu</option>
                <option value="TT GDNN GDTX Chu Văn An" ${this.filterSchool === 'TT GDNN GDTX Chu Văn An' ? 'selected' : ''}>TT GDNN GDTX Chu Văn An</option>
              </select>
            </div>

            <!-- Tìm kiếm -->
            <div class="relative flex-1 min-w-[180px]">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
              <input type="text" id="rooms-filter-search" value="${escapeHtml(this.filterSearch)}" placeholder="Tìm theo tên bài hoặc mã phòng..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>

          <div class="text-slate-400 font-mono text-[11px] shrink-0">
            Hiển thị <b>${filteredRooms.length}</b> / ${allRooms.length} phòng thi
          </div>
        </div>

        <!-- Room Cards List -->
        ${filteredRooms.length === 0 ? `
          <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
            <i class="fa-solid fa-folder-open text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">
              ${allRooms.length === 0 ? 'Chưa có phòng thi nào được tạo' : 'Không tìm thấy phòng thi phù hợp với bộ lọc'}
            </h3>
            <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              ${allRooms.length === 0 ? 'Hãy nhấn nút "Tạo Phòng Thi Mới" để giao đề thi kèm mật khẩu và đối tượng học sinh nhận bài.' : 'Thử đổi lựa chọn Khối lớp, Trường học hoặc xóa từ khóa tìm kiếm.'}
            </p>
            ${allRooms.length === 0 ? `
              <button id="btn-create-room-empty" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm">
                Tạo phòng thi đầu tiên
              </button>
            ` : ''}
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            ${filteredRooms.map(room => {
              const start = room.startTime ? new Date(room.startTime) : null;
              const end = room.endTime ? new Date(room.endTime) : null;
              
              let statusBadge = { text: 'Đang mở đề', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' };
              if (start && now < start) {
                statusBadge = { text: 'Sắp mở đề', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' };
              } else if (end && now > end) {
                statusBadge = { text: 'Đã đóng đề', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-300' };
              }

              const antiCheat = room.antiCheat || { enabled: false };

              // Dạng đề thi
              let examTypeLabel = '🏛️ Chuẩn Bộ GD 2025 (28 câu = 10đ)';
              if (room.type === 'by_topic') {
                examTypeLabel = `📁 Theo Chủ đề: ${room.topic || 'Tổng hợp'}`;
              } else if (room.type === 'by_lesson') {
                examTypeLabel = `📖 Theo Bài: ${room.lesson || 'Tổng hợp'}`;
              } else if (room.type === 'custom') {
                examTypeLabel = `⚙️ Ma trận tự chọn (${room.questionCount || 30} câu)`;
              }

              // Đối tượng trường & lớp
              const schoolLabel = (!room.targetSchool || room.targetSchool === 'all')
                ? 'Mọi trường (Công khai)'
                : room.targetSchool;

              const classLabel = (!room.targetClass || room.targetClass === 'all')
                ? 'Tất cả các lớp'
                : `Lớp ${room.targetClass}`;

              return `
                <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition space-y-4 relative flex flex-col justify-between">
                  <div>
                    <!-- Header Card -->
                    <div class="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
                          <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${statusBadge.cls}">
                            ${statusBadge.text}
                          </span>
                          <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            Khối ${escapeHtml(room.grade)}
                          </span>
                        </div>
                        <h3 class="text-base font-bold text-slate-800 dark:text-white leading-snug">
                          ${escapeHtml(room.title)}
                        </h3>
                        <p class="text-xs text-slate-400 mt-0.5">
                          Thời lượng: <b>${room.duration} phút</b> • ${escapeHtml(examTypeLabel)}
                        </p>
                        ${(room.contentScope === 'custom' && room.selectedLessons && room.selectedLessons.length > 0) ? `
                          <div class="mt-2 flex flex-wrap items-center gap-1.5">
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200 dark:border-emerald-800">
                              <i class="fa-solid fa-layer-group text-[10px]"></i> ${room.selectedLessons.length} bài học (${room.questionCount || 28} câu)
                            </span>
                            <span class="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              ${escapeHtml(room.selectedLessons.slice(0, 2).map(l => (l.lesson.split(':')[0] || l.lesson) + ` (${l.count}c)`).join(', '))}${room.selectedLessons.length > 2 ? ` + ${room.selectedLessons.length - 2} bài khác` : ''}
                            </span>
                          </div>
                        ` : ''}
                      </div>

                      <!-- Room ID Badge -->
                      <div class="text-right shrink-0">
                        <span class="text-[10px] text-slate-400 block uppercase font-bold">Mã phòng</span>
                        <div class="flex items-center gap-1.5 mt-0.5">
                          <code class="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-black text-sm rounded-xl border border-blue-200 dark:border-blue-800">
                            ${escapeHtml(room.id)}
                          </code>
                          <button data-copy-room="${escapeHtml(room.id)}" class="p-1.5 text-slate-400 hover:text-blue-600 transition" title="Sao chép mã phòng">
                            <i class="fa-regular fa-copy text-xs"></i>
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Room Assignment & Security Grid -->
                    <div class="p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-700/60 space-y-2 text-xs">
                      <!-- Trường & Lớp áp dụng -->
                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300 pb-2 border-b border-slate-200/50 dark:border-slate-800">
                        <span class="text-slate-400 flex items-center gap-1.5">
                          <i class="fa-solid fa-school text-emerald-500"></i> Đối tượng giao bài:
                        </span>
                        <span class="font-bold text-slate-800 dark:text-white text-right">
                          <span class="text-emerald-600 dark:text-emerald-400">${escapeHtml(schoolLabel)}</span>
                          <span class="text-slate-400 mx-1">•</span>
                          <span class="text-blue-600 dark:text-blue-400">${escapeHtml(classLabel)}</span>
                        </span>
                      </div>

                      <!-- Mật khẩu vào thi -->
                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400 flex items-center gap-1.5">
                          <i class="fa-solid fa-key text-amber-500"></i> Mật khẩu:
                        </span>
                        <span class="font-mono font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                          <span class="room-pwd-masked" id="pwd-${escapeHtml(room.id)}">••••••</span>
                          <span class="room-pwd-plain hidden text-emerald-600 font-bold" id="pwd-plain-${escapeHtml(room.id)}">${escapeHtml(room.password || '(Không có)')}</span>
                          <button type="button" data-toggle-pwd="${escapeHtml(room.id)}" class="text-slate-400 hover:text-slate-600 text-[11px]">
                            <i class="fa-regular fa-eye"></i>
                          </button>
                        </span>
                      </div>

                      <!-- Thời gian mở / đóng -->
                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400 flex items-center gap-1.5">
                          <i class="fa-regular fa-clock text-blue-500"></i> Thời gian mở:
                        </span>
                        <span class="font-medium">${start ? start.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Không giới hạn'}</span>
                      </div>

                      <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
                        <span class="text-slate-400 flex items-center gap-1.5">
                          <i class="fa-regular fa-calendar-xmark text-rose-500"></i> Thời gian đóng:
                        </span>
                        <span class="font-medium">${end ? end.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Không giới hạn'}</span>
                      </div>

                      <!-- Chống liếc bài & Chống gian lận -->
                      <div class="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800 text-[11px]">
                        <span class="text-slate-400 flex items-center gap-1.5">
                          <i class="fa-solid fa-shield-halved text-indigo-500"></i> Bảo vệ bài thi:
                        </span>
                        <div class="flex items-center gap-1.5 flex-wrap justify-end">
                          <span class="px-2 py-0.5 rounded font-bold ${antiCheat.enabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-slate-100 text-slate-500'}">
                            ${antiCheat.enabled ? `Giám sát: Bật (Tối đa ${antiCheat.maxViolations || 3})` : 'Giám sát: Tắt'}
                          </span>
                          <span class="px-2 py-0.5 rounded font-bold ${room.randomExamCode ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-slate-100 text-slate-500'}">
                            ${room.randomExamCode ? '🎲 Mã đề riêng' : 'Mã đề chung'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                    <button data-share-room="${escapeHtml(room.id)}" class="px-3.5 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-300 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm">
                      <i class="fa-solid fa-share-nodes text-[11px]"></i> Copy thông báo lớp
                    </button>

                    <div class="flex items-center gap-1.5">
                      <button data-edit-room="${escapeHtml(room.id)}" class="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-600 dark:text-amber-300 text-xs font-bold rounded-xl transition flex items-center gap-1" title="Chỉnh sửa phòng thi">
                        <i class="fa-solid fa-pen text-[11px]"></i> Sửa
                      </button>
                      <button data-view-results="${escapeHtml(room.id)}" class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1">
                        <i class="fa-solid fa-chart-simple text-[11px]"></i> Điểm số
                      </button>
                      <button data-delete-room="${escapeHtml(room.id)}" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition" title="Xóa phòng thi này">
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
    // Bộ lọc
    const filterGradeSel = this.container.querySelector('#rooms-filter-grade');
    const filterSchoolSel = this.container.querySelector('#rooms-filter-school');
    const filterSearchInput = this.container.querySelector('#rooms-filter-search');

    if (filterGradeSel) {
      filterGradeSel.onchange = (e) => {
        this.filterGrade = e.target.value;
        this.render();
      };
    }
    if (filterSchoolSel) {
      filterSchoolSel.onchange = (e) => {
        this.filterSchool = e.target.value;
        this.render();
      };
    }
    if (filterSearchInput) {
      filterSearchInput.oninput = (e) => {
        this.filterSearch = e.target.value.trim();
        this.render();
      };
    }

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

        let typeDesc = 'Đề chuẩn Bộ GD&ĐT 2025 (28 câu = 10.0đ)';
        if (room.type === 'by_topic') typeDesc = `Trộn đề theo Chủ đề: ${room.topic || 'Tổng hợp'}`;
        else if (room.type === 'by_lesson') typeDesc = `Kiểm tra 15 phút theo Bài: ${room.lesson || 'Tổng hợp'}`;
        else if (room.type === 'custom') typeDesc = `Kiểm tra định kỳ (${room.questionCount || 30} câu)`;

        let scopeDesc = '';
        if (room.contentScope === 'custom' && room.selectedLessons && room.selectedLessons.length > 0) {
          scopeDesc = `\n📚 Nội dung bài học kiểm tra (${room.selectedLessons.length} bài):\n` +
            room.selectedLessons.map((l, i) => `   ${i+1}. ${l.lesson} (${l.count} câu - ${l.weight || 0}%)`).join('\n');
        }

        const schoolDesc = (!room.targetSchool || room.targetSchool === 'all') ? 'Tất cả các trường' : room.targetSchool;
        const classDesc = (!room.targetClass || room.targetClass === 'all') ? `Tất cả các lớp Khối ${room.grade}` : `Lớp ${room.targetClass} (Khối ${room.grade})`;

        const msg = `📢 THÔNG BÁO KIỂM TRA MÔN TIN HỌC THPT
🏫 Trường áp dụng: ${schoolDesc}
🎓 Đối tượng: ${classDesc}
📝 Bài thi: ${room.title}
📑 Cấu trúc: ${typeDesc}${scopeDesc}
⏱ Thời gian làm bài: ${room.duration} phút
📅 Thời gian mở đề: ${start}
📅 Thời gian đóng đề: ${end}
🔑 MÃ PHÒNG THI: ${room.id}
🔒 MẬT KHẨU: ${room.password || 'Không có (vào tự do)'}
🛡 Giám sát chống gian lận: ${room.antiCheat?.enabled ? 'BẬT (Khóa chuyển tab/thoát toàn màn hình)' : 'Không'}
🎲 Chống liếc bài: ${room.randomExamCode ? 'Cấp mã đề riêng cho mỗi học sinh' : 'Mã đề tiêu chuẩn'}
👉 Link vào thi trực tiếp: ${directUrl}
(Hoặc vào https://on-tap.nghiaedu.workers.dev/ -> Chọn mục "Thi Thử" -> Nhập Mã phòng & Mật khẩu)`;

        navigator.clipboard.writeText(msg).then(() => {
          alert('Đã sao chép toàn bộ thông tin phòng thi vào bộ nhớ tạm!\nThầy Cô có thể dán (Paste) ngay vào nhóm Zalo hoặc Facebook của lớp.');
        });
      };
    });

    // Sửa phòng
    this.container.querySelectorAll('[data-edit-room]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-edit-room');
        const room = Storage.getExamRoom(id);
        if (room) this.openCreateModal(room);
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

  populateModalClasses(school, grade, selectedClass = 'all') {
    const classSelect = document.getElementById('room-input-target-class');
    const customClassInput = document.getElementById('room-input-target-class-custom');
    if (!classSelect) return;

    let availableClasses = [];
    if (SCHOOLS_DATA[school] && SCHOOLS_DATA[school].classes[grade]) {
      availableClasses = SCHOOLS_DATA[school].classes[grade];
    }

    let html = `<option value="all">Tất cả các lớp thuộc Khối ${grade}</option>`;
    availableClasses.forEach(cls => {
      html += `<option value="${cls}">${cls}</option>`;
    });
    html += `<option value="__other__">Lớp khác (Tự nhập)...</option>`;
    classSelect.innerHTML = html;

    if (selectedClass && availableClasses.includes(selectedClass)) {
      classSelect.value = selectedClass;
      if (customClassInput) customClassInput.classList.add('hidden');
    } else if (selectedClass && selectedClass !== 'all') {
      classSelect.value = '__other__';
      if (customClassInput) {
        customClassInput.classList.remove('hidden');
        customClassInput.value = selectedClass;
      }
    } else {
      classSelect.value = 'all';
      if (customClassInput) customClassInput.classList.add('hidden');
    }
  },

  // --- BỘ CẤU HÌNH MA TRẬN BÀI HỌC & ĐIỀU CHỈNH TỈ LỆ ---
  currentScope: 'all',

  setupScopeSwitcher(activeScope = 'all') {
    const btnScopeAll = document.getElementById('btn-scope-all');
    const btnScopeCustom = document.getElementById('btn-scope-custom');
    const matrixPanel = document.getElementById('room-lessons-matrix-panel');

    const setScope = (scope) => {
      this.currentScope = scope;
      if (scope === 'custom') {
        matrixPanel?.classList.remove('hidden');
        btnScopeCustom?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-600', 'dark:text-emerald-400', 'shadow-sm');
        btnScopeCustom?.classList.remove('text-slate-500', 'dark:text-slate-400');
        btnScopeAll?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-emerald-600', 'dark:text-emerald-400', 'shadow-sm');
        btnScopeAll?.classList.add('text-slate-500', 'dark:text-slate-400');
        this.updateMatrixSummary();
      } else {
        matrixPanel?.classList.add('hidden');
        btnScopeAll?.classList.add('bg-white', 'dark:bg-slate-800', 'text-emerald-600', 'dark:text-emerald-400', 'shadow-sm');
        btnScopeAll?.classList.remove('text-slate-500', 'dark:text-slate-400');
        btnScopeCustom?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-emerald-600', 'dark:text-emerald-400', 'shadow-sm');
        btnScopeCustom?.classList.add('text-slate-500', 'dark:text-slate-400');
      }
    };

    if (btnScopeAll) btnScopeAll.onclick = () => setScope('all');
    if (btnScopeCustom) btnScopeCustom.onclick = () => setScope('custom');

    setScope(activeScope);
  },

  populateModalTopicsAndLessons(grade, existingRoom = null) {
    const listContainer = document.getElementById('room-lessons-matrix-list');
    const countInput = document.getElementById('room-input-count');
    if (!listContainer) return;

    if (!this.manifest || !this.manifest.grades || !this.manifest.grades[grade]) {
      listContainer.innerHTML = '<div class="text-xs text-slate-400 p-3">Đang nạp cấu trúc ngân hàng đề...</div>';
      return;
    }

    const gradeData = this.manifest.grades[grade];
    const topics = Object.entries(gradeData.topics || {});

    // Bản đồ các bài học đã chọn trước đó (nếu đang sửa phòng thi)
    const existingLessonsMap = new Map();
    if (existingRoom && existingRoom.selectedLessons && Array.isArray(existingRoom.selectedLessons)) {
      existingRoom.selectedLessons.forEach(item => {
        existingLessonsMap.set(`${item.topic}__SEP__${item.lesson}`, item.count || 1);
      });
    }

    const targetTotal = parseInt(countInput?.value || '28', 10);
    let html = '';

    topics.forEach(([topicName, topicData], tIdx) => {
      const lessons = Object.entries(topicData.lessons || {});
      const topicTotalQ = topicData.total || 0;

      html += `
        <div class="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/30">
          <!-- Header Chủ Đề -->
          <div class="px-3.5 py-2.5 bg-slate-100/90 dark:bg-slate-800 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700">
            <label class="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-white select-none">
              <input type="checkbox" data-matrix-topic-toggle="${tIdx}" class="w-4 h-4 rounded text-emerald-600 cursor-pointer" />
              <span>${escapeHtml(topicName)}</span>
            </label>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300">
              ${topicTotalQ} câu • ${lessons.length} bài
            </span>
          </div>

          <!-- Danh sách Bài Học Trong Chủ Đề -->
          <div class="p-2 space-y-1.5" data-matrix-topic-group="${tIdx}">
      `;

      lessons.forEach(([lessonName, lessonData]) => {
        const key = `${topicName}__SEP__${lessonName}`;
        const isChecked = existingLessonsMap.has(key);
        const allocatedCount = isChecked ? existingLessonsMap.get(key) : 5;
        const availableQ = lessonData.total || 0;

        html += `
          <div class="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-white dark:hover:bg-slate-800 transition border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <label class="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300 flex-1 min-w-0 select-none">
              <input type="checkbox" data-matrix-lesson-check 
                data-topic="${escapeHtml(topicName)}" 
                data-lesson="${escapeHtml(lessonName)}" 
                ${isChecked ? 'checked' : ''} 
                class="w-4 h-4 rounded text-emerald-600 cursor-pointer shrink-0" />
              <div class="truncate">
                <span class="font-medium">${escapeHtml(lessonName)}</span>
                <span class="text-[10px] text-slate-400 ml-1.5">(${availableQ} câu)</span>
              </div>
            </label>

            <!-- Ô nhập số lượng câu hỏi cần lấy từ bài này -->
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] text-slate-400">Lấy:</span>
              <input type="number" 
                data-matrix-lesson-count 
                data-topic="${escapeHtml(topicName)}" 
                data-lesson="${escapeHtml(lessonName)}" 
                data-available="${availableQ}"
                value="${allocatedCount}" 
                min="1" 
                max="${availableQ}" 
                ${!isChecked ? 'disabled' : ''}
                class="w-14 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-center text-slate-800 dark:text-white disabled:opacity-40 focus:ring-2 focus:ring-emerald-500" />
              <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">câu</span>
              <span data-matrix-percent class="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 min-w-[34px] text-right"></span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;

    this.bindMatrixListeners();
    this.updateMatrixSummary();
  },

  bindMatrixListeners() {
    const listContainer = document.getElementById('room-lessons-matrix-list');
    if (!listContainer) return;

    // Tích header chủ đề -> bật/tắt toàn bộ bài trong chủ đề đó
    listContainer.querySelectorAll('[data-matrix-topic-toggle]').forEach(topicToggle => {
      topicToggle.onchange = () => {
        const tIdx = topicToggle.getAttribute('data-matrix-topic-toggle');
        const group = listContainer.querySelector(`[data-matrix-topic-group="${tIdx}"]`);
        if (!group) return;
        const checks = group.querySelectorAll('[data-matrix-lesson-check]');
        checks.forEach(chk => {
          chk.checked = topicToggle.checked;
          const countInput = chk.closest('.flex').querySelector('[data-matrix-lesson-count]');
          if (countInput) countInput.disabled = !chk.checked;
        });
        this.updateMatrixSummary();
      };
    });

    // Tích từng bài học -> bật/tắt ô nhập số câu
    listContainer.querySelectorAll('[data-matrix-lesson-check]').forEach(chk => {
      chk.onchange = () => {
        const countInput = chk.closest('.flex').querySelector('[data-matrix-lesson-count]');
        if (countInput) countInput.disabled = !chk.checked;
        this.updateMatrixSummary();
      };
    });

    // Thay đổi số câu của bài
    listContainer.querySelectorAll('[data-matrix-lesson-count]').forEach(inp => {
      inp.oninput = () => {
        const val = parseInt(inp.value, 10);
        const max = parseInt(inp.getAttribute('data-available'), 10) || 50;
        if (val < 1) inp.value = 1;
        if (val > max) inp.value = max;
        this.updateMatrixSummary();
      };
    });
  },

  updateMatrixSummary() {
    const listContainer = document.getElementById('room-lessons-matrix-list');
    const summaryBadge = document.getElementById('room-matrix-selected-summary');
    const countInput = document.getElementById('room-input-count');
    if (!listContainer || !summaryBadge) return;

    const targetTotal = parseInt(countInput?.value || '28', 10);
    const checks = listContainer.querySelectorAll('[data-matrix-lesson-check]:checked');
    let totalAllocated = 0;

    checks.forEach(chk => {
      const row = chk.closest('.flex');
      const countInputEl = row.querySelector('[data-matrix-lesson-count]');
      const cnt = parseInt(countInputEl?.value || '0', 10);
      totalAllocated += cnt;
    });

    // Cập nhật nhãn phần trăm cho từng dòng bài học
    checks.forEach(chk => {
      const row = chk.closest('.flex');
      const countInputEl = row.querySelector('[data-matrix-lesson-count]');
      const percentEl = row.querySelector('[data-matrix-percent]');
      const cnt = parseInt(countInputEl?.value || '0', 10);
      const pct = targetTotal > 0 ? ((cnt / targetTotal) * 100).toFixed(0) : 0;
      if (percentEl) percentEl.textContent = `${pct}%`;
    });

    listContainer.querySelectorAll('[data-matrix-lesson-check]:not(:checked)').forEach(chk => {
      const row = chk.closest('.flex');
      const percentEl = row.querySelector('[data-matrix-percent]');
      if (percentEl) percentEl.textContent = '';
    });

    const isMatch = (totalAllocated === targetTotal);
    summaryBadge.innerHTML = `Đã chọn: <strong>${checks.length}</strong> bài • <strong>${totalAllocated}</strong>/${targetTotal} câu ${isMatch ? '✅ (Khớp 100%)' : (totalAllocated < targetTotal ? `⚠️ (Thiếu ${targetTotal - totalAllocated}c)` : `⚠️ (Vượt ${totalAllocated - targetTotal}c)`)}`;
    summaryBadge.className = `px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isMatch ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}`;
  },

  distributeQuestionsEvenly() {
    const listContainer = document.getElementById('room-lessons-matrix-list');
    const countInput = document.getElementById('room-input-count');
    if (!listContainer) return;

    const targetTotal = parseInt(countInput?.value || '28', 10);
    const checkedRows = [...listContainer.querySelectorAll('[data-matrix-lesson-check]:checked')];
    if (checkedRows.length === 0) {
      alert('Vui lòng tích chọn ít nhất 1 bài học để phân bổ số câu!');
      return;
    }

    const n = checkedRows.length;
    const baseCount = Math.floor(targetTotal / n);
    const remainder = targetTotal % n;

    checkedRows.forEach((chk, idx) => {
      const row = chk.closest('.flex');
      const countInputEl = row.querySelector('[data-matrix-lesson-count]');
      const available = parseInt(countInputEl?.getAttribute('data-available') || '50', 10);
      let count = baseCount + (idx < remainder ? 1 : 0);
      if (count === 0 && targetTotal > 0) count = 1;
      if (count > available) count = available;
      if (countInputEl) countInputEl.value = count;
    });

    this.updateMatrixSummary();
  },

  openCreateModal(existingRoom = null) {
    const modal = document.getElementById('modal-create-exam-room');
    if (!modal) return;

    const titleInput = document.getElementById('room-input-title');
    const idInput = document.getElementById('room-input-id');
    const schoolSelect = document.getElementById('room-input-target-school');
    const customSchoolInput = document.getElementById('room-input-target-school-custom');
    const gradeSelect = document.getElementById('room-input-grade');
    const durationInput = document.getElementById('room-input-duration');
    const pwdInput = document.getElementById('room-input-pwd');
    const startInput = document.getElementById('room-input-start');
    const endInput = document.getElementById('room-input-end');
    const antiCheatToggle = document.getElementById('room-input-anticheat');
    const maxViolationsInput = document.getElementById('room-input-max-violations');
    const examTypeSelect = document.getElementById('room-input-type');
    const countInput = document.getElementById('room-input-count');
    const shuffleQCheckbox = document.getElementById('room-input-shuffle-q');
    const shuffleOptCheckbox = document.getElementById('room-input-shuffle-opt');
    const randomCodeCheckbox = document.getElementById('room-input-random-code');

    const toInputVal = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const targetGrade = existingRoom ? (existingRoom.grade || '12') : (gradeSelect ? gradeSelect.value : '12');
    const targetSchool = existingRoom ? (existingRoom.targetSchool || 'all') : 'all';
    const targetClass = existingRoom ? (existingRoom.targetClass || 'all') : 'all';

    // Populate Trường học
    if (schoolSelect) {
      if (['EMASI', 'Phổ thông Năng khiếu', 'TT GDNN GDTX Chu Văn An', 'all'].includes(targetSchool)) {
        schoolSelect.value = targetSchool;
        if (customSchoolInput) customSchoolInput.classList.add('hidden');
      } else {
        schoolSelect.value = '__other__';
        if (customSchoolInput) {
          customSchoolInput.classList.remove('hidden');
          customSchoolInput.value = targetSchool;
        }
      }
    }

    if (gradeSelect) gradeSelect.value = targetGrade;

    // Populate Lớp học
    this.populateModalClasses(schoolSelect?.value || 'all', targetGrade, targetClass);

    // Thiết lập số câu & dạng đề
    if (existingRoom) {
      if (titleInput) titleInput.value = existingRoom.title || '';
      if (idInput) idInput.value = existingRoom.id || '';
      if (durationInput) durationInput.value = String(existingRoom.duration || 45);
      if (pwdInput) pwdInput.value = existingRoom.password || '';
      if (startInput) startInput.value = existingRoom.startTime ? toInputVal(new Date(existingRoom.startTime)) : '';
      if (endInput) endInput.value = existingRoom.endTime ? toInputVal(new Date(existingRoom.endTime)) : '';
      if (antiCheatToggle) antiCheatToggle.checked = existingRoom.antiCheat?.enabled ?? true;
      if (maxViolationsInput) maxViolationsInput.value = String(existingRoom.antiCheat?.maxViolations || 3);
      if (examTypeSelect) examTypeSelect.value = existingRoom.type || 'bgd_2025';
      if (countInput) countInput.value = String(existingRoom.questionCount || (existingRoom.type === 'bgd_2025' ? 28 : 30));
      if (shuffleQCheckbox) shuffleQCheckbox.checked = existingRoom.shuffleQuestions ?? true;
      if (shuffleOptCheckbox) shuffleOptCheckbox.checked = existingRoom.shuffleOptions ?? true;
      if (randomCodeCheckbox) randomCodeCheckbox.checked = existingRoom.randomExamCode ?? true;
    } else {
      if (titleInput) titleInput.value = 'Kiểm tra Tin học ' + targetGrade;
      if (idInput) idInput.value = 'TIN' + targetGrade + '-' + Math.floor(1000 + Math.random() * 9000);
      if (durationInput) durationInput.value = '50';
      if (pwdInput) pwdInput.value = String(Math.floor(1000 + Math.random() * 9000));
      if (examTypeSelect) examTypeSelect.value = 'bgd_2025';
      if (countInput) countInput.value = '28';
      if (shuffleQCheckbox) shuffleQCheckbox.checked = true;
      if (shuffleOptCheckbox) shuffleOptCheckbox.checked = true;
      if (randomCodeCheckbox) randomCodeCheckbox.checked = true;

      const now = new Date();
      const nextWeek = new Date(Date.now() + 7 * 86400000);
      if (startInput) startInput.value = toInputVal(now);
      if (endInput) endInput.value = toInputVal(nextWeek);
      if (antiCheatToggle) antiCheatToggle.checked = true;
      if (maxViolationsInput) maxViolationsInput.value = '3';
    }

    // Populate Ma trận Bài học & Chủ đề
    this.populateModalTopicsAndLessons(targetGrade, existingRoom);

    // Kích hoạt Scope Switcher (all vs custom)
    const initialScope = (existingRoom && existingRoom.contentScope) ? existingRoom.contentScope : (existingRoom?.selectedLessons?.length ? 'custom' : 'all');
    this.setupScopeSwitcher(initialScope);

    modal.classList.remove('hidden');
  },

  bindGlobalEvents() {
    const modal = document.getElementById('modal-create-exam-room');
    if (!modal) return;

    const closeBtn = document.getElementById('btn-close-room-modal');
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

    const schoolSelect = document.getElementById('room-input-target-school');
    const customSchoolInput = document.getElementById('room-input-target-school-custom');
    const gradeSelect = document.getElementById('room-input-grade');
    const classSelect = document.getElementById('room-input-target-class');
    const customClassInput = document.getElementById('room-input-target-class-custom');
    const examTypeSelect = document.getElementById('room-input-type');
    const durationInput = document.getElementById('room-input-duration');
    const countInput = document.getElementById('room-input-count');

    // Sự kiện đổi trường học
    if (schoolSelect) {
      schoolSelect.onchange = () => {
        const isOther = (schoolSelect.value === '__other__');
        if (customSchoolInput) {
          customSchoolInput.classList.toggle('hidden', !isOther);
          if (isOther) customSchoolInput.focus();
        }
        const curGrade = gradeSelect ? gradeSelect.value : '12';
        this.populateModalClasses(schoolSelect.value, curGrade, 'all');
      };
    }

    // Sự kiện đổi khối lớp -> nạp lại Lớp và nạp lại Ma trận bài học của khối mới
    if (gradeSelect) {
      gradeSelect.onchange = () => {
        const curGrade = gradeSelect.value;
        const curSchool = schoolSelect ? schoolSelect.value : 'all';
        this.populateModalClasses(curSchool, curGrade, 'all');
        this.populateModalTopicsAndLessons(curGrade);
      };
    }

    // Sự kiện đổi lớp
    if (classSelect) {
      classSelect.onchange = () => {
        const isOther = (classSelect.value === '__other__');
        if (customClassInput) {
          customClassInput.classList.toggle('hidden', !isOther);
          if (isOther) customClassInput.focus();
        }
      };
    }

    // Nút Chọn tất cả & Bỏ chọn trong ma trận bài học
    const btnSelectAll = document.getElementById('btn-matrix-select-all');
    const btnDeselectAll = document.getElementById('btn-matrix-deselect-all');
    const btnDistribute = document.getElementById('btn-matrix-distribute-even');
    const listContainer = document.getElementById('room-lessons-matrix-list');

    if (btnSelectAll) {
      btnSelectAll.onclick = () => {
        if (!listContainer) return;
        listContainer.querySelectorAll('[data-matrix-lesson-check]').forEach(chk => {
          chk.checked = true;
          const row = chk.closest('.flex');
          const countInp = row.querySelector('[data-matrix-lesson-count]');
          if (countInp) countInp.disabled = false;
        });
        listContainer.querySelectorAll('[data-matrix-topic-toggle]').forEach(t => t.checked = true);
        this.distributeQuestionsEvenly();
      };
    }

    if (btnDeselectAll) {
      btnDeselectAll.onclick = () => {
        if (!listContainer) return;
        listContainer.querySelectorAll('[data-matrix-lesson-check]').forEach(chk => {
          chk.checked = false;
          const row = chk.closest('.flex');
          const countInp = row.querySelector('[data-matrix-lesson-count]');
          if (countInp) countInp.disabled = true;
        });
        listContainer.querySelectorAll('[data-matrix-topic-toggle]').forEach(t => t.checked = false);
        this.updateMatrixSummary();
      };
    }

    if (btnDistribute) {
      btnDistribute.onclick = () => this.distributeQuestionsEvenly();
    }

    // Các nút preset số câu hỏi nhanh
    document.querySelectorAll('[data-preset-count]').forEach(btn => {
      btn.onclick = () => {
        const val = btn.getAttribute('data-preset-count');
        if (countInput) {
          countInput.value = val;
          if (this.currentScope === 'custom') {
            this.distributeQuestionsEvenly();
          }
        }
      };
    });

    if (countInput) {
      countInput.oninput = () => {
        if (this.currentScope === 'custom') {
          this.updateMatrixSummary();
        }
      };
    }

    // Sự kiện đổi hình thức đề thi
    if (examTypeSelect) {
      examTypeSelect.onchange = () => {
        const t = examTypeSelect.value;
        if (t === 'bgd_2025') {
          if (durationInput) durationInput.value = '50';
          if (countInput) countInput.value = '28';
        } else if (t === 'by_topic') {
          if (durationInput) durationInput.value = '30';
          if (countInput) countInput.value = '20';
        } else if (t === 'by_lesson') {
          if (durationInput) durationInput.value = '15';
          if (countInput) countInput.value = '10';
        } else {
          if (durationInput) durationInput.value = '45';
          if (countInput) countInput.value = '30';
        }
        if (this.currentScope === 'custom') {
          this.distributeQuestionsEvenly();
        }
      };
    }

    // Nút Lưu phòng thi
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
        const questionCount = parseInt(document.getElementById('room-input-count')?.value || (examType === 'bgd_2025' ? '28' : '30'), 10);
        const shuffleQuestions = document.getElementById('room-input-shuffle-q')?.checked ?? true;
        const shuffleOptions = document.getElementById('room-input-shuffle-opt')?.checked ?? true;
        const randomExamCode = document.getElementById('room-input-random-code')?.checked ?? true;

        // Lấy thông tin Trường & Lớp
        let targetSchool = document.getElementById('room-input-target-school')?.value || 'all';
        if (targetSchool === '__other__') {
          targetSchool = document.getElementById('room-input-target-school-custom')?.value.trim() || 'all';
        }

        let targetClass = document.getElementById('room-input-target-class')?.value || 'all';
        if (targetClass === '__other__') {
          targetClass = document.getElementById('room-input-target-class-custom')?.value.trim() || 'all';
        }

        if (!title) {
          alert('Vui lòng nhập Tên bài kiểm tra / Phòng thi!');
          return;
        }
        if (!id) {
          alert('Vui lòng nhập Mã phòng thi!');
          return;
        }

        // Xử lý Ma Trận Bài Học & Tỉ Lệ nếu chọn Scope Custom
        const isCustomScope = (this.currentScope === 'custom');
        let selectedLessons = [];
        let selectedTopics = [];

        if (isCustomScope) {
          const matrixList = document.getElementById('room-lessons-matrix-list');
          if (matrixList) {
            const checks = matrixList.querySelectorAll('[data-matrix-lesson-check]:checked');
            if (checks.length === 0) {
              alert('⚠️ Bạn đang ở chế độ "Chọn bài & Tỉ lệ" nhưng chưa tích chọn bài học nào!\nVui lòng chọn ít nhất 1 bài học hoặc bấm chuyển sang "Toàn bộ khối".');
              return;
            }

            let sumCount = 0;
            checks.forEach(chk => {
              const topic = chk.getAttribute('data-topic');
              const lesson = chk.getAttribute('data-lesson');
              const row = chk.closest('.flex');
              const countInputEl = row.querySelector('[data-matrix-lesson-count]');
              const count = parseInt(countInputEl?.value || '1', 10);
              sumCount += count;

              if (!selectedTopics.includes(topic)) selectedTopics.push(topic);
              selectedLessons.push({
                topic,
                lesson,
                count,
                weight: questionCount > 0 ? Math.round((count / questionCount) * 100) : 0
              });
            });

            // Nếu tổng số câu phân bổ khác tổng số câu của đề, tự động cân bằng
            if (sumCount !== questionCount) {
              const autoFix = confirm(`Tổng số câu phân bổ cho các bài (${sumCount} câu) chưa khớp với Tổng số câu của đề thi (${questionCount} câu).\nBạn có muốn hệ thống tự động phân bổ đều lại cho khớp đúng ${questionCount} câu không?`);
              if (autoFix) {
                this.distributeQuestionsEvenly();
                selectedLessons = [];
                checks.forEach(chk => {
                  const topic = chk.getAttribute('data-topic');
                  const lesson = chk.getAttribute('data-lesson');
                  const row = chk.closest('.flex');
                  const countInputEl = row.querySelector('[data-matrix-lesson-count]');
                  const count = parseInt(countInputEl?.value || '1', 10);
                  selectedLessons.push({
                    topic,
                    lesson,
                    count,
                    weight: questionCount > 0 ? Math.round((count / questionCount) * 100) : 0
                  });
                });
              }
            }
          }
        }

        const user = Auth.currentUser;

        const roomData = {
          id,
          title,
          grade,
          targetSchool,
          targetClass,
          duration,
          password,
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          type: examType,
          contentScope: isCustomScope ? 'custom' : 'all',
          selectedTopics: isCustomScope ? selectedTopics : null,
          selectedLessons: isCustomScope ? selectedLessons : null,
          questionCount,
          shuffleQuestions,
          shuffleOptions,
          randomExamCode,
          createdBy: user?.email || '',
          creatorName: user?.fullName || 'Giáo viên',
          antiCheat: {
            enabled: antiCheatEnabled,
            maxViolations,
            enforceFullscreen: true,
            preventTabSwitch: true,
            disableCopyPaste: true,
            blockDevTools: true,
            detectSplitScreen: true
          },
          status: 'active'
        };

        Storage.saveExamRoom(roomData);
        modal.classList.add('hidden');
        this.render();
        const scopeDesc = isCustomScope ? `${selectedLessons.length} bài học cụ thể` : 'Toàn bộ chương trình';
        alert(`Tạo phòng thi [${id}] thành công!\n• Nội dung: ${scopeDesc}\n• Đối tượng: ${targetSchool === 'all' ? 'Mọi trường' : targetSchool} - Khối ${grade} (${targetClass === 'all' ? 'Tất cả các lớp' : targetClass}).\nThầy Cô hãy bấm nút "Copy thông báo lớp" để gửi thông tin cho học sinh.`);
      };
    }
  }
};
