/**
 * tinhoc-hub: Questions Manager (Quản Lý Câu Hỏi)
 * Dành cho Giáo viên (GV) & Quản trị viên (Admin)
 * Cho phép: Thêm, Sửa, Xóa câu hỏi trong ngân hàng đề, lọc và tìm kiếm trực quan.
 */

import { Storage } from './storage.js?v=20261030_44';
import { Auth } from './auth.js?v=20261030_44';
import { escapeHtml } from './utils.js?v=20261030_44';

export const QuestionsManager = {
  container: null,
  manifest: null,
  loadGradeDataCallback: null,
  currentGrade: '12',
  currentTopic: 'all',
  currentLevel: 'all',
  searchKeyword: '',
  currentPage: 1,
  pageSize: 20,
  cachedRawQuestions: {},

  init(containerEl, manifest, loadGradeDataFn) {
    this.container = containerEl;
    this.manifest = manifest;
    this.loadGradeDataCallback = loadGradeDataFn;
    this.render();
    if (typeof window !== 'undefined' && window.CloudSync) {
      window.CloudSync.syncCustomQuestions().then(() => this.render()).catch(() => {});
    }
  },

  async findAndEditQuestion(qId) {
    if (!this.loadGradeDataCallback) return false;
    for (const g of ['12', '11', '10']) {
      const questions = await this.loadGradeDataCallback(g);
      const found = questions.find(q => String(q.id) === String(qId));
      if (found) {
        this.currentGrade = g;
        this.searchKeyword = String(found.id);
        await this.render();
        this.openEditModal(found);
        return true;
      }
    }
    return false;
  },

  async render() {
    if (!this.container) return;

    // Kiểm tra quyền hạn
    if (!Auth.isTeacher()) {
      this.container.innerHTML = `
        <div class="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
          <div class="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Khu Vực Dành Cho Giáo Viên & Quản Trị Viên
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            Học sinh chỉ có quyền tham gia ôn tập và thi thử. Nếu Thầy/Cô là Giáo viên môn Tin học, vui lòng nhập mã xác thực Giáo viên để được cấp quyền quản lý ngân hàng câu hỏi.
          </p>
          <button id="btn-qm-open-upgrade" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20">
            <i class="fa-solid fa-key mr-1.5"></i> Nhập mã kích hoạt Giáo viên
          </button>
        </div>
      `;

      this.container.querySelector('#btn-qm-open-upgrade')?.addEventListener('click', () => {
        const code = prompt('Vui lòng nhập mã kích hoạt Giáo viên (Mặc định: GV2025):');
        if (code) {
          const res = Auth.upgradeRoleWithCode(code);
          alert(res.message);
          if (res.success) this.render();
        }
      });
      return;
    }

    // Tải dữ liệu câu hỏi của khối hiện tại (đã được áp dụng tùy chỉnh thêm/sửa/xóa)
    let questions = [];
    if (this.loadGradeDataCallback) {
      questions = await this.loadGradeDataCallback(this.currentGrade);
    }

    // Lọc danh sách câu hỏi
    let filtered = [...questions];
    if (this.currentTopic !== 'all') {
      filtered = filtered.filter(q => q.topic === this.currentTopic);
    }
    if (this.currentLevel !== 'all') {
      filtered = filtered.filter(q => q.level === this.currentLevel);
    }
    if (this.searchKeyword.trim()) {
      const kw = this.searchKeyword.trim().toLowerCase();
      filtered = filtered.filter(q => {
        return (q.question && q.question.toLowerCase().includes(kw)) ||
               (q.lesson && q.lesson.toLowerCase().includes(kw)) ||
               (q.topic && q.topic.toLowerCase().includes(kw));
      });
    }

    const totalQuestions = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalQuestions / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageQuestions = filtered.slice(startIdx, startIdx + this.pageSize);

    // Lấy danh sách chủ đề theo khối từ manifest
    const topicsList = (this.manifest && this.manifest.grades[this.currentGrade])
      ? Object.keys(this.manifest.grades[this.currentGrade].topics || {})
      : [];

    const activeEl = document.activeElement;
    const isKwFocused = activeEl && activeEl.id === 'qm-filter-keyword';
    const selStart = isKwFocused ? activeEl.selectionStart : null;
    const selEnd = isKwFocused ? activeEl.selectionEnd : null;

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn">
        
        <!-- Header Quản Lý Câu Hỏi -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-2">
              <i class="fa-solid fa-database"></i> Quản Lý Ngân Hàng Đề
            </div>
            <h2 class="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
              Ngân Hàng Câu Hỏi Khối ${this.currentGrade}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Thầy/Cô có toàn quyền Thêm mới, Sửa nội dung hoặc Xóa câu hỏi. Các thay đổi sẽ có hiệu lực ngay trong Ôn tập & Thi thử.
            </p>
          </div>

          <!-- Nút hành động nhanh -->
          <div class="flex items-center flex-wrap gap-2.5">
            <button id="btn-qm-add-new" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Thêm câu hỏi mới
            </button>
            <button id="btn-qm-reset-default" class="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition" title="Khôi phục lại ngân hàng gốc">
              <i class="fa-solid fa-rotate-left mr-1"></i> Khôi phục gốc
            </button>
            <button id="btn-qm-export-custom" class="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition" title="Xuất dữ liệu ra file JSON">
              <i class="fa-solid fa-file-arrow-down mr-1"></i> Xuất JSON
            </button>
            <button id="btn-qm-import-custom" class="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition" title="Nhập câu hỏi từ file JSON">
              <i class="fa-solid fa-file-arrow-up mr-1"></i> Nhập JSON
            </button>
            <input type="file" id="input-qm-import-json" accept=".json,application/json" class="hidden" />
          </div>
        </div>

        <!-- Thanh Tìm Kiếm & Bộ Lọc Nâng Cao -->
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            <!-- Khối lớp -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Khối lớp</label>
              <select id="qm-filter-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="12" ${this.currentGrade === '12' ? 'selected' : ''}>Khối 12</option>
                <option value="11" ${this.currentGrade === '11' ? 'selected' : ''}>Khối 11</option>
                <option value="10" ${this.currentGrade === '10' ? 'selected' : ''}>Khối 10</option>
              </select>
            </div>

            <!-- Mức độ -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Loại / Mức độ</label>
              <select id="qm-filter-level" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="all" ${this.currentLevel === 'all' ? 'selected' : ''}>Tất cả mức độ</option>
                <option value="1" ${this.currentLevel === '1' ? 'selected' : ''}>Mức 1 (Nhận biết)</option>
                <option value="2" ${this.currentLevel === '2' ? 'selected' : ''}>Mức 2 (Thông hiểu)</option>
                <option value="3" ${this.currentLevel === '3' ? 'selected' : ''}>Mức 3 (Vận dụng)</option>
                <option value="4" ${this.currentLevel === '4' ? 'selected' : ''}>Mức 4 (Vận dụng cao)</option>
                <option value="DS" ${this.currentLevel === 'DS' ? 'selected' : ''}>Phần II: Đúng / Sai</option>
              </select>
            </div>

            <!-- Chủ đề -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Chủ đề</label>
              <select id="qm-filter-topic" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="all">Tất cả chủ đề</option>
                ${topicsList.map(t => `<option value="${escapeHtml(t)}" ${this.currentTopic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </div>

            <!-- Tìm kiếm từ khóa -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Tìm kiếm từ khóa</label>
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input type="text" id="qm-filter-keyword" value="${escapeHtml(this.searchKeyword)}" placeholder="Nội dung, bài học..." class="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

          </div>

          <div class="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <span>Tìm thấy <strong>${totalQuestions}</strong> câu hỏi phù hợp</span>
            <span>Trang <strong>${this.currentPage}</strong> / ${totalPages}</span>
          </div>
        </div>

        <!-- Danh Sách Các Thẻ Câu Hỏi -->
        <div class="space-y-4">
          ${pageQuestions.length === 0 ? `
            <div class="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
              <i class="fa-solid fa-filter-circle-xmark text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
              <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy câu hỏi nào</h4>
              <p class="text-xs text-slate-400 mt-1">Thử đổi điều kiện lọc hoặc bấm "Thêm câu hỏi mới" để bổ sung.</p>
            </div>
          ` : pageQuestions.map((q, idx) => this.renderQuestionRow(q, startIdx + idx)).join('')}
        </div>

        <!-- Phân trang (Pagination) -->
        ${totalPages > 1 ? `
          <div class="flex items-center justify-center gap-2 pt-4">
            <button id="btn-qm-prev-page" ${this.currentPage <= 1 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
              <i class="fa-solid fa-arrow-left mr-1"></i> Trang trước
            </button>

            <span class="text-xs font-bold text-slate-600 dark:text-slate-300 px-3">
              ${this.currentPage} / ${totalPages}
            </span>

            <button id="btn-qm-next-page" ${this.currentPage >= totalPages ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
              Trang sau <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
          </div>
        ` : ''}

      </div>

      <!-- MODAL: THÊM / SỬA CÂU HỎI -->
      <div id="modal-qm-edit" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 relative max-h-[90dvh] overflow-y-auto">
          <button id="btn-qm-close-modal" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center text-sm transition">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-pen-to-square"></i>
            </div>
            <div>
              <h3 id="modal-qm-title" class="text-base font-bold text-slate-800 dark:text-white">
                Thêm Câu Hỏi Mới
              </h3>
              <p class="text-xs text-slate-400">Ngân hàng câu hỏi Tin học chuẩn GDPT 2018</p>
            </div>
          </div>

          <form id="form-qm-question" class="space-y-4">
            <input type="hidden" id="qm-input-id" value="" />

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Khối lớp *</label>
                <select id="qm-input-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="12">Khối 12</option>
                  <option value="11">Khối 11</option>
                  <option value="10">Khối 10</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Dạng câu hỏi *</label>
                <select id="qm-input-level" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="1">1 - Nhận biết (MCQ)</option>
                  <option value="2">2 - Thông hiểu (MCQ)</option>
                  <option value="3">3 - Vận dụng (MCQ)</option>
                  <option value="4">4 - Vận dụng cao (MCQ)</option>
                  <option value="DS">DS - Đúng / Sai (4 ý)</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Chủ đề</label>
                <input type="text" id="qm-input-topic" placeholder="Ví dụ: 7. ỨNG DỤNG TIN HỌC" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tên bài học</label>
              <input type="text" id="qm-input-lesson" placeholder="Ví dụ: Bài 25. Phần thân và chân trang web" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nội dung câu hỏi *</label>
              <textarea id="qm-input-question" required rows="3" placeholder="Nhập câu hỏi tại đây..." class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
            </div>

            <!-- Khu vực các phương án nhập liệu động (MCQ / DS / TLN) -->
            <div id="qm-options-container" class="space-y-3 pt-2">
              <!-- Được JS render tùy theo level -->
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Giải thích / Ghi chú</label>
              <input type="text" id="qm-input-note" placeholder="Lời giải thích ngắn gọn khi xem đáp án..." class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>

            <div class="pt-3 flex items-center justify-end gap-3">
              <button type="button" id="btn-qm-cancel" class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition">
                Hủy bỏ
              </button>
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5">
                <i class="fa-solid fa-floppy-disk"></i> Lưu câu hỏi
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (isKwFocused) {
      const newKwInput = this.container.querySelector('#qm-filter-keyword');
      if (newKwInput) {
        newKwInput.focus();
        if (selStart !== null && selEnd !== null) {
          try { newKwInput.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }

    this.bindEvents(questions);
  },

  renderQuestionRow(q, index) {
    let levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Biết</span>`;
    if (q.level === '2') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Hiểu</span>`;
    else if (q.level === '3') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Vận dụng</span>`;
    else if (q.level === '4') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">VD Cao</span>`;
    else if (q.level === 'DS') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Đúng/Sai</span>`;
    else if (q.level === 'TLN') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">Trả lời ngắn</span>`;

    let customBadge = '';
    if (q.isCustom) {
      customBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white">Thêm mới</span>`;
    } else if (q.isModified) {
      customBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500 text-white">Đã sửa</span>`;
    }

    return `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-slate-300 transition">
        <div class="flex items-center justify-between gap-3 mb-2.5">
          <div class="flex items-center flex-wrap gap-2">
            <span class="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
              ${index + 1}
            </span>
            ${levelBadge}
            ${customBadge}
            <span class="text-xs text-slate-400 font-medium">${escapeHtml(q.lesson || q.topic || '')}</span>
          </div>

          <!-- Nút Sửa & Xóa -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button data-qm-edit="${q.id}" class="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center gap-1">
              <i class="fa-solid fa-pen"></i> Sửa
            </button>
            <button data-qm-delete="${q.id}" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition" title="Xóa câu hỏi">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-3 leading-relaxed">
          ${escapeHtml(q.question)}
        </h4>

        ${['1', '2', '3', '4'].includes(q.level) && q.options ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            ${q.options.map((opt, oIdx) => {
              const letter = ['A', 'B', 'C', 'D'][oIdx];
              const isCorrect = (letter === q.answer);
              return `
                <div class="p-2 rounded-xl border ${isCorrect ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">
                  ${letter}. ${escapeHtml(opt)}
                </div>
              `;
            }).join('')}
          </div>
        ` : (q.level === 'DS' && q.options ? `
          <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            ${q.options.map((opt, oIdx) => {
              const subL = ['a', 'b', 'c', 'd'][oIdx];
              const ansVal = (q.answer && q.answer.split(',')[oIdx]) || '';
              return `
                <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-750 flex items-center justify-between">
                  <span><strong>${subL})</strong> ${escapeHtml(opt)}</span>
                  <span class="px-2 py-0.5 rounded font-bold text-[11px] ${ansVal === 'Đ' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">${ansVal === 'Đ' ? 'Đúng' : 'Sai'}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
            Đáp án: ${escapeHtml(q.answer)}
          </div>
        `)}
      </div>
    `;
  },

  renderOptionsForm(level, existingQ = null) {
    const container = document.getElementById('qm-options-container');
    if (!container) return;

    if (['1', '2', '3', '4'].includes(level)) {
      const opts = existingQ?.options || ['', '', '', ''];
      const curAns = existingQ?.answer || 'A';
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          4 Phương án trả lời & Chọn đáp án đúng:
        </label>
        <div class="space-y-2">
          ${['A', 'B', 'C', 'D'].map((letter, idx) => `
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer ${curAns === letter ? 'bg-blue-50 border-blue-500 font-bold text-blue-600' : 'text-slate-600'}">
                <input type="radio" name="qm-mcq-correct" value="${letter}" ${curAns === letter ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600" />
                <span>${letter}</span>
              </label>
              <input type="text" id="qm-opt-${idx}" required value="${escapeHtml(opts[idx] || '')}" placeholder="Nội dung phương án ${letter}..." class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>
          `).join('')}
        </div>
      `;
    } else if (level === 'DS') {
      const opts = existingQ?.options || ['', '', '', ''];
      const ansArr = (existingQ?.answer || 'Đ,S,Đ,S').split(',');
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          4 Ý con (a, b, c, d) & Chọn Đúng/Sai cho từng ý:
        </label>
        <div class="space-y-2">
          ${['a', 'b', 'c', 'd'].map((letter, idx) => `
            <div class="flex items-center gap-2">
              <span class="w-6 text-xs font-bold text-blue-600 text-center">${letter})</span>
              <input type="text" id="qm-ds-opt-${idx}" required value="${escapeHtml(opts[idx] || '')}" placeholder="Nội dung ý ${letter}..." class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
              <select id="qm-ds-val-${idx}" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold">
                <option value="Đ" ${ansArr[idx] === 'Đ' ? 'selected' : ''}>Đúng</option>
                <option value="S" ${ansArr[idx] === 'S' ? 'selected' : ''}>Sai</option>
              </select>
            </div>
          `).join('')}
        </div>
      `;
    } else if (level === 'TLN') {
      const curAns = existingQ?.answer || '';
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          Đáp án ngắn:
        </label>
        <input type="text" id="qm-tln-ans" required value="${escapeHtml(curAns)}" placeholder="Ví dụ: 1024, print, True..." class="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white" />
      `;
    }
  },

  openEditModal(question = null) {
    const modal = document.getElementById('modal-qm-edit');
    if (!modal) return;

    const titleEl = document.getElementById('modal-qm-title');
    const idInput = document.getElementById('qm-input-id');
    const gradeSelect = document.getElementById('qm-input-grade');
    const levelSelect = document.getElementById('qm-input-level');
    const topicInput = document.getElementById('qm-input-topic');
    const lessonInput = document.getElementById('qm-input-lesson');
    const questionTextarea = document.getElementById('qm-input-question');
    const noteInput = document.getElementById('qm-input-note');

    if (question) {
      if (titleEl) titleEl.textContent = 'Chỉnh Sửa Câu Hỏi';
      if (idInput) idInput.value = question.id;
      if (gradeSelect) gradeSelect.value = question.grade || this.currentGrade;
      if (levelSelect) levelSelect.value = question.level || '1';
      if (topicInput) topicInput.value = question.topic || '';
      if (lessonInput) lessonInput.value = question.lesson || '';
      if (questionTextarea) questionTextarea.value = question.question || '';
      if (noteInput) noteInput.value = question.note || '';

      this.renderOptionsForm(question.level || '1', question);
    } else {
      if (titleEl) titleEl.textContent = 'Thêm Câu Hỏi Mới';
      if (idInput) idInput.value = '';
      if (gradeSelect) gradeSelect.value = this.currentGrade;
      if (levelSelect) levelSelect.value = '1';
      if (topicInput) topicInput.value = this.currentTopic !== 'all' ? this.currentTopic : '';
      if (lessonInput) lessonInput.value = '';
      if (questionTextarea) questionTextarea.value = '';
      if (noteInput) noteInput.value = '';

      this.renderOptionsForm('1', null);
    }

    modal.classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-qm-edit')?.classList.add('hidden');
  },

  bindEvents(currentQuestionsList) {
    // Lọc Khối
    const gradeFilter = this.container.querySelector('#qm-filter-grade');
    if (gradeFilter) {
      gradeFilter.addEventListener('change', (e) => {
        this.currentGrade = e.target.value;
        this.currentTopic = 'all';
        this.currentPage = 1;
        this.render();
      });
    }

    // Lọc Mức độ
    const levelFilter = this.container.querySelector('#qm-filter-level');
    if (levelFilter) {
      levelFilter.addEventListener('change', (e) => {
        this.currentLevel = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    // Lọc Chủ đề
    const topicFilter = this.container.querySelector('#qm-filter-topic');
    if (topicFilter) {
      topicFilter.addEventListener('change', (e) => {
        this.currentTopic = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    // Tìm kiếm từ khóa (Debounce 300ms)
    const kwInput = this.container.querySelector('#qm-filter-keyword');
    if (kwInput) {
      let timer;
      kwInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.searchKeyword = e.target.value;
          this.currentPage = 1;
          this.render();
        }, 300);
      });
    }

    // Chuyển trang
    this.container.querySelector('#btn-qm-prev-page')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.render();
      }
    });

    this.container.querySelector('#btn-qm-next-page')?.addEventListener('click', () => {
      this.currentPage++;
      this.render();
    });

    // Mở modal Thêm mới
    this.container.querySelector('#btn-qm-add-new')?.addEventListener('click', () => {
      this.openEditModal(null);
    });

    // Mở modal Sửa
    this.container.querySelectorAll('[data-qm-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qm-edit');
        const q = currentQuestionsList.find(item => item.id === id);
        if (q) this.openEditModal(q);
      });
    });

    // Nút Xóa câu hỏi
    this.container.querySelectorAll('[data-qm-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qm-delete');
        if (confirm('Thầy/Cô có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng đề?')) {
          Storage.deleteQuestion(id, this.currentGrade);
          alert('Đã xóa câu hỏi thành công!');
          this.render();
        }
      });
    });

    // Nút Khôi phục dữ liệu gốc
    this.container.querySelector('#btn-qm-reset-default')?.addEventListener('click', () => {
      if (confirm(`Khôi phục ngân hàng câu hỏi Khối ${this.currentGrade} về mặc định ban đầu? Mọi câu hỏi Thầy/Cô đã thêm hoặc sửa của khối này sẽ bị hủy bỏ.`)) {
        Storage.resetQuestionsToDefault(this.currentGrade);
        alert('Đã khôi phục ngân hàng câu hỏi về dữ liệu gốc ban đầu!');
        this.render();
      }
    });

    // Nút Xuất JSON
    this.container.querySelector('#btn-qm-export-custom')?.addEventListener('click', () => {
      const customQuestions = Storage.getCustomQuestions(this.currentGrade);
      const blob = new Blob([JSON.stringify(customQuestions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cau_Hoi_TinHoc_${this.currentGrade}_Custom.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Nút Nhập JSON
    const importBtn = this.container.querySelector('#btn-qm-import-custom');
    const importFileInput = this.container.querySelector('#input-qm-import-json');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            const list = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            if (!Array.isArray(list) || list.length === 0) {
              alert('Tệp JSON không hợp lệ hoặc không chứa danh sách câu hỏi!');
              return;
            }
            let added = 0;
            list.forEach(q => {
              if (q && q.question) {
                Storage.saveQuestion({
                  grade: String(q.grade || this.currentGrade),
                  level: String(q.level || '1'),
                  topic: q.topic || 'Chủ đề nhập từ JSON',
                  lesson: q.lesson || 'Bài học nhập từ JSON',
                  question: q.question,
                  options: Array.isArray(q.options) ? q.options : [],
                  answer: String(q.answer || 'A'),
                  note: q.note || ''
                });
                added++;
              }
            });
            alert(`Đã nhập thành công ${added} câu hỏi vào ngân hàng đề!`);
            this.render();
          } catch (err) {
            alert('Không thể đọc tệp JSON! Vui lòng kiểm tra định dạng tệp.');
          }
        };
        reader.readAsText(file);
      });
    }

    // Đóng Modal
    this.container.querySelector('#btn-qm-close-modal')?.addEventListener('click', () => this.closeEditModal());
    this.container.querySelector('#btn-qm-cancel')?.addEventListener('click', () => this.closeEditModal());

    // Đổi loại câu hỏi trong form modal
    const modalLevelSelect = document.getElementById('qm-input-level');
    if (modalLevelSelect) {
      modalLevelSelect.addEventListener('change', (e) => {
        this.renderOptionsForm(e.target.value, null);
      });
    }

    // Submit Form Lưu câu hỏi (Thêm mới hoặc Sửa)
    const form = document.getElementById('form-qm-question');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('qm-input-id')?.value || '';
        const grade = document.getElementById('qm-input-grade')?.value || this.currentGrade;
        const level = document.getElementById('qm-input-level')?.value || '1';
        const topic = document.getElementById('qm-input-topic')?.value || 'Chủ đề tùy biến';
        const lesson = document.getElementById('qm-input-lesson')?.value || 'Bài học tùy biến';
        const questionText = document.getElementById('qm-input-question')?.value || '';
        const note = document.getElementById('qm-input-note')?.value || '';

        let options = [];
        let answer = '';

        if (['1', '2', '3', '4'].includes(level)) {
          options = [
            document.getElementById('qm-opt-0')?.value || '',
            document.getElementById('qm-opt-1')?.value || '',
            document.getElementById('qm-opt-2')?.value || '',
            document.getElementById('qm-opt-3')?.value || ''
          ];
          const checkedRadio = document.querySelector('input[name="qm-mcq-correct"]:checked');
          answer = checkedRadio ? checkedRadio.value : 'A';
        } else if (level === 'DS') {
          options = [
            document.getElementById('qm-ds-opt-0')?.value || '',
            document.getElementById('qm-ds-opt-1')?.value || '',
            document.getElementById('qm-ds-opt-2')?.value || '',
            document.getElementById('qm-ds-opt-3')?.value || ''
          ];
          const vals = [
            document.getElementById('qm-ds-val-0')?.value || 'Đ',
            document.getElementById('qm-ds-val-1')?.value || 'S',
            document.getElementById('qm-ds-val-2')?.value || 'Đ',
            document.getElementById('qm-ds-val-3')?.value || 'S'
          ];
          answer = vals.join(',');
        } else if (level === 'TLN') {
          answer = document.getElementById('qm-tln-ans')?.value || '';
          options = [];
        }

        const questionPayload = {
          id: id || undefined,
          grade,
          level,
          topic,
          lesson,
          question: questionText,
          options,
          answer,
          note
        };

        Storage.saveQuestion(questionPayload);
        this.closeEditModal();
        alert('Đã lưu câu hỏi thành công!');
        this.render();
      };
    }
  }
};
