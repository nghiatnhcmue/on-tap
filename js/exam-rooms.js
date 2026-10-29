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

        const schoolDesc = (!room.targetSchool || room.targetSchool === 'all') ? 'Tất cả các trường' : room.targetSchool;
        const classDesc = (!room.targetClass || room.targetClass === 'all') ? `Tất cả các lớp Khối ${room.grade}` : `Lớp ${room.targetClass} (Khối ${room.grade})`;

        const msg = `📢 THÔNG BÁO KIỂM TRA MÔN TIN HỌC THPT
🏫 Trường áp dụng: ${schoolDesc}
🎓 Đối tượng: ${classDesc}
📝 Bài thi: ${room.title}
📑 Cấu trúc: ${typeDesc}
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

  populateModalTopicsAndLessons(grade, selectedTopic = 'all', selectedLesson = 'all') {
    const topicSelect = document.getElementById('room-input-topic');
    const lessonSelect = document.getElementById('room-input-lesson');
    if (!this.manifest || !this.manifest.grades[grade]) return;

    const gradeData = this.manifest.grades[grade];
    const topics = Object.keys(gradeData.topics || {});

    if (topicSelect) {
      let tHtml = '<option value="all">-- Tất cả chủ đề --</option>';
      topics.forEach(t => {
        tHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`;
      });
      topicSelect.innerHTML = tHtml;
      if (selectedTopic && topics.includes(selectedTopic)) {
        topicSelect.value = selectedTopic;
      } else {
        topicSelect.value = 'all';
      }
    }

    const updateLessons = () => {
      if (!lessonSelect) return;
      const curTopic = topicSelect ? topicSelect.value : 'all';
      if (curTopic === 'all' || !gradeData.topics[curTopic]) {
        lessonSelect.innerHTML = '<option value="all">-- Tất cả bài trong khối --</option>';
      } else {
        const lessons = Object.keys(gradeData.topics[curTopic].lessons || {});
        let lHtml = '<option value="all">-- Tất cả bài trong chủ đề này --</option>';
        lessons.forEach(l => {
          lHtml += `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`;
        });
        lessonSelect.innerHTML = lHtml;
        if (selectedLesson && lessons.includes(selectedLesson)) {
          lessonSelect.value = selectedLesson;
        } else {
          lessonSelect.value = 'all';
        }
      }
    };

    updateLessons();
    if (topicSelect) {
      topicSelect.onchange = () => updateLessons();
    }
  },

  openCreateModal(existingRoom = null) {
    const modal = document.getElementById('modal-create-exam-room');
    if (!modal) return;

    const titleInput = document.getElementById('room-input-title');
    const idInput = document.getElementById('room-input-id');
    const schoolSelect = document.getElementById('room-input-target-school');
    const customSchoolInput = document.getElementById('room-input-target-school-custom');
    const gradeSelect = document.getElementById('room-input-grade');
    const classSelect = document.getElementById('room-input-target-class');
    const customClassInput = document.getElementById('room-input-target-class-custom');
    const durationInput = document.getElementById('room-input-duration');
    const pwdInput = document.getElementById('room-input-pwd');
    const startInput = document.getElementById('room-input-start');
    const endInput = document.getElementById('room-input-end');
    const antiCheatToggle = document.getElementById('room-input-anticheat');
    const maxViolationsInput = document.getElementById('room-input-max-violations');
    const examTypeSelect = document.getElementById('room-input-type');
    const topicLessonContainer = document.getElementById('room-topic-lesson-container');
    const lessonWrapper = document.getElementById('room-lesson-select-wrapper');
    const countSelect = document.getElementById('room-input-count');
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

    // Populate Schools
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

    // Populate Classes
    this.populateModalClasses(schoolSelect?.value || 'all', targetGrade, targetClass);

    // Populate Topics & Lessons
    this.populateModalTopicsAndLessons(targetGrade, existingRoom?.topic || 'all', existingRoom?.lesson || 'all');

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
      if (countSelect) countSelect.value = String(existingRoom.questionCount || (existingRoom.type === 'bgd_2025' ? 28 : 30));
      if (shuffleQCheckbox) shuffleQCheckbox.checked = existingRoom.shuffleQuestions ?? true;
      if (shuffleOptCheckbox) shuffleOptCheckbox.checked = existingRoom.shuffleOptions ?? true;
      if (randomCodeCheckbox) randomCodeCheckbox.checked = existingRoom.randomExamCode ?? true;
    } else {
      // Giá trị mặc định
      if (titleInput) titleInput.value = 'Kiểm tra 1 tiết Tin học ' + targetGrade;
      if (idInput) idInput.value = 'TIN' + targetGrade + '-' + Math.floor(1000 + Math.random() * 9000);
      if (durationInput) durationInput.value = '50';
      if (pwdInput) pwdInput.value = String(Math.floor(1000 + Math.random() * 9000));
      if (examTypeSelect) examTypeSelect.value = 'bgd_2025';
      if (countSelect) countSelect.value = '28';
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

    // Cập nhật hiển thị trường chọn chủ đề/bài học theo dạng đề
    const curType = examTypeSelect ? examTypeSelect.value : 'bgd_2025';
    if (topicLessonContainer) {
      if (curType === 'bgd_2025') {
        topicLessonContainer.classList.add('hidden');
      } else {
        topicLessonContainer.classList.remove('hidden');
        if (lessonWrapper) {
          lessonWrapper.classList.toggle('hidden', curType !== 'by_lesson');
        }
      }
    }

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
    const topicLessonContainer = document.getElementById('room-topic-lesson-container');
    const lessonWrapper = document.getElementById('room-lesson-select-wrapper');
    const durationInput = document.getElementById('room-input-duration');
    const countSelect = document.getElementById('room-input-count');

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

    // Sự kiện đổi khối lớp
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

    // Sự kiện đổi hình thức đề
    if (examTypeSelect) {
      examTypeSelect.onchange = () => {
        const t = examTypeSelect.value;
        if (t === 'bgd_2025') {
          if (topicLessonContainer) topicLessonContainer.classList.add('hidden');
          if (durationInput) durationInput.value = '50';
          if (countSelect) countSelect.value = '28';
        } else if (t === 'by_topic') {
          if (topicLessonContainer) topicLessonContainer.classList.remove('hidden');
          if (lessonWrapper) lessonWrapper.classList.add('hidden');
          if (durationInput) durationInput.value = '30';
          if (countSelect) countSelect.value = '20';
        } else if (t === 'by_lesson') {
          if (topicLessonContainer) topicLessonContainer.classList.remove('hidden');
          if (lessonWrapper) lessonWrapper.classList.remove('hidden');
          if (durationInput) durationInput.value = '15';
          if (countSelect) countSelect.value = '10';
        } else {
          if (topicLessonContainer) topicLessonContainer.classList.remove('hidden');
          if (lessonWrapper) lessonWrapper.classList.add('hidden');
          if (durationInput) durationInput.value = '45';
          if (countSelect) countSelect.value = '30';
        }
      };
    }

    // Nút lưu phòng thi
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

        // Lấy thông tin Trường & Lớp
        let targetSchool = document.getElementById('room-input-target-school')?.value || 'all';
        if (targetSchool === '__other__') {
          targetSchool = document.getElementById('room-input-target-school-custom')?.value.trim() || 'all';
        }

        let targetClass = document.getElementById('room-input-target-class')?.value || 'all';
        if (targetClass === '__other__') {
          targetClass = document.getElementById('room-input-target-class-custom')?.value.trim() || 'all';
        }

        // Lấy chi tiết dạng đề
        const topic = document.getElementById('room-input-topic')?.value || 'all';
        const lesson = document.getElementById('room-input-lesson')?.value || 'all';
        const questionCount = parseInt(document.getElementById('room-input-count')?.value || (examType === 'bgd_2025' ? '28' : '30'), 10);
        const shuffleQuestions = document.getElementById('room-input-shuffle-q')?.checked ?? true;
        const shuffleOptions = document.getElementById('room-input-shuffle-opt')?.checked ?? true;
        const randomExamCode = document.getElementById('room-input-random-code')?.checked ?? true;

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
          targetSchool,
          targetClass,
          duration,
          password,
          startTime: startTime ? new Date(startTime).toISOString() : null,
          endTime: endTime ? new Date(endTime).toISOString() : null,
          type: examType,
          topic: (examType === 'by_topic' || examType === 'by_lesson') ? topic : null,
          lesson: (examType === 'by_lesson') ? lesson : null,
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
        alert(`Tạo phòng thi [${id}] thành công!\nĐã áp dụng đối tượng giao bài: ${targetSchool === 'all' ? 'Mọi trường' : targetSchool} - Khối ${grade} (${targetClass === 'all' ? 'Tất cả các lớp' : targetClass}).\nThầy Cô hãy bấm nút "Copy thông báo lớp" để gửi mã và link cho học sinh.`);
      };
    }
  }
};
