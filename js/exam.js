/**
 * tinhoc-hub: Exam Controller (Thi thử trực tuyến)
 * Hỗ trợ đề chuẩn Bộ GD&ĐT 2025, kiểm tra định kỳ 15p, 45p và tùy biến đề thi
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';
import { Proctor } from './proctor.js';

export const Exam = {
  questions: [],
  examQuestions: [], // Danh sách câu đã chọn cho đề thi
  userAnswers: {},   // key: question id -> answer object
  flaggedQuestions: new Set(),
  currentIndex: 0,
  timerInterval: null,
  totalSeconds: 0,
  remainingSeconds: 0,
  examConfig: null,
  examState: 'idle', // 'idle' | 'taking' | 'submitted'
  examResult: null,
  isProctored: false,
  isDisqualified: false,
  disqualifiedReason: '',

  init(containerEl, allQuestions, manifest) {
    this.container = containerEl;
    this.allQuestions = allQuestions;
    this.manifest = manifest;
    this.resetState();
  },

  resetState() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    document.body.classList.remove('in-exam');
    if (this.isProctored) Proctor.stop();
    this.examQuestions = [];
    this.userAnswers = {};
    this.flaggedQuestions = new Set();
    this.currentIndex = 0;
    this.totalSeconds = 0;
    this.remainingSeconds = 0;
    this.examConfig = null;
    this.examState = 'idle';
    this.examResult = null;
    this.isProctored = false;
    this.isDisqualified = false;
    this.disqualifiedReason = '';
  },

  // --- TẠO ĐỀ THI ---
  generateExam(config) {
    this.resetState();
    this.examConfig = config;
    const grade = config.grade || '12';
    const gradePool = this.allQuestions.filter(q => q.grade === grade);

    const settings = Storage.getSettings();
    const shouldShuffleQuestions = (config.shuffleQuestions !== undefined) ? !!config.shuffleQuestions : (settings.shuffleQuestions ?? true);
    const shouldShuffleOptions = (config.shuffleOptions !== undefined) ? !!config.shuffleOptions : (settings.shuffleOptions ?? true);

    const antiCheatCfg = config.antiCheat || config.room?.antiCheat || { enabled: false };
    this.isProctored = !!antiCheatCfg.enabled;
    this.maxViolations = antiCheatCfg.maxViolations || 3;
    this.isDisqualified = false;
    this.disqualifiedReason = '';

    this.examConfig = {
      ...config,
      shuffleQuestions: shouldShuffleQuestions,
      shuffleOptions: shouldShuffleOptions,
      antiCheat: antiCheatCfg
    };

    if (this.isProctored) {
      Proctor.init(antiCheatCfg,
        (record, remaining, total) => {
          const badgeEl = document.getElementById('proctor-violation-badge');
          if (badgeEl) {
            badgeEl.innerHTML = `Vi phạm: <strong class="text-white">${total}</strong>/${this.maxViolations}`;
            badgeEl.className = 'text-[11px] font-mono px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold animate-pulse';
          }
        },
        (logs) => {
          this.terminateExamDueToCheating(logs);
        }
      );
      setTimeout(() => Proctor.start(), 400);
    }

    if (gradePool.length === 0) {
      alert('Không có dữ liệu câu hỏi cho khối lớp này!');
      return false;
    }

    let selectedQuestions = [];

    if (config.type === 'bgd_2025') {
      // Đề chuẩn Bộ GD&ĐT môn Tin học (Kỳ thi Tốt nghiệp THPT):
      // Gồm ĐÚNG 2 phần, tổng cộng 28 câu = 10 điểm (Thời gian: 50 phút)
      // - Phần I: 24 câu trắc nghiệm nhiều lựa chọn = 6.0 điểm (mỗi câu 0.25đ)
      // - Phần II: 4 câu hỏi trắc nghiệm Đúng/Sai = 4.0 điểm (mỗi câu tối đa 1.0đ)
      const mcqPool = gradePool.filter(q => ['1', '2', '3', '4'].includes(q.level));
      let dsPool = gradePool.filter(q => q.level === 'DS');

      // Nếu khối đang chọn thiếu câu Đúng/Sai (ví dụ K11), lấy thêm từ ngân hàng DS của khối 12/10 để đảm bảo đủ 4 câu
      if (dsPool.length < 4) {
        const extraDs = this.allQuestions.filter(q => q.level === 'DS');
        dsPool = [...dsPool, ...extraDs];
      }

      // Lấy chính xác 24 câu MCQ (có hoặc không xáo trộn ngẫu nhiên)
      const mcqSelected = this.sampleQuestions(mcqPool, Math.min(24, mcqPool.length), shouldShuffleQuestions);
      // Lấy chính xác 4 câu Đúng/Sai
      const dsSelected = this.sampleQuestions(dsPool, Math.min(4, dsPool.length), shouldShuffleQuestions);

      selectedQuestions = [...mcqSelected, ...dsSelected];
      this.totalSeconds = (config.duration || 50) * 60;
    } else {
      // Đề kiểm tra định kỳ hoặc tự chọn
      let pool = gradePool;
      if (config.topic && config.topic !== 'all') {
        pool = pool.filter(q => q.topic === config.topic);
      }
      const count = Math.min(config.count || 30, pool.length);
      selectedQuestions = this.sampleQuestions(pool, count, shouldShuffleQuestions);
      this.totalSeconds = (config.duration || 45) * 60;
    }

    // Chuẩn bị dữ liệu câu hỏi & xử lý xáo trộn phương án
    this.examQuestions = selectedQuestions.map((q, index) => {
      const item = { ...q, examIndex: index + 1 };
      
      // Xáo trộn đáp án cho MCQ nếu tùy chọn bật
      if (shouldShuffleOptions && ['1', '2', '3', '4'].includes(item.level) && item.options && item.options.length === 4) {
        const correctLetter = item.answer || 'A';
        const correctIdx = ['A', 'B', 'C', 'D'].indexOf(correctLetter);
        const correctText = item.options[correctIdx];

        // Tạo mảng chỉ số ngẫu nhiên
        const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const shuffledOptions = indices.map(i => item.options[i]);
        const newCorrectIdx = shuffledOptions.indexOf(correctText);
        const newAnswerLetter = ['A', 'B', 'C', 'D'][newCorrectIdx];

        item.displayOptions = shuffledOptions;
        item.displayAnswer = newAnswerLetter;
      } else {
        item.displayOptions = item.options || [];
        item.displayAnswer = item.answer || 'A';
      }

      return item;
    });

    this.remainingSeconds = this.totalSeconds;
    this.examState = 'taking';
    document.body.classList.add('in-exam');
    this.startTimer();
    this.renderExamInterface();
    return true;
  },

  sampleQuestions(pool, count, shouldShuffle = true) {
    if (shouldShuffle) {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
    return pool.slice(0, count);
  },

  // --- TIMER ---
  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.remainingSeconds--;
      this.updateTimerDisplay();

      if (this.remainingSeconds <= 0) {
        clearInterval(this.timerInterval);
        alert('Hết giờ làm bài! Hệ thống sẽ tự động nộp bài.');
        this.submitExam();
      }
    }, 1000);
  },

  updateTimerDisplay() {
    const timerEl = document.getElementById('exam-timer');
    if (!timerEl) return;

    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timerEl.textContent = formatted;

    // Cảnh báo màu khi còn ít thời gian
    if (this.remainingSeconds <= 60) {
      timerEl.className = 'text-rose-600 dark:text-rose-400 font-extrabold text-xl animate-pulse';
    } else if (this.remainingSeconds <= 300) {
      timerEl.className = 'text-amber-600 dark:text-amber-400 font-bold text-xl';
    } else {
      timerEl.className = 'text-blue-600 dark:text-blue-400 font-bold text-xl';
    }
  },

  // --- RENDER GIAO DIỆN PHÒNG THI ---
  renderExamInterface() {
    const total = this.examQuestions.length;
    const currentQ = this.examQuestions[this.currentIndex];
    const isFlagged = this.flaggedQuestions.has(currentQ.id);

    this.container.innerHTML = `
      <!-- Thanh công cụ phòng thi -->
      <div class="sticky top-16 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">
              TIN
            </span>
            <div>
              <h2 class="text-sm font-bold text-slate-800 dark:text-white leading-tight">
                ${this.examConfig.title || 'Đề thi thử Tin học THPT'}
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                Khối ${this.examConfig.grade} • Tổng số ${total} câu hỏi
              </p>
              <div class="flex items-center gap-1.5 flex-wrap mt-1">
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${this.examConfig.shuffleQuestions ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">
                  <i class="fa-solid fa-shuffle text-[9px]"></i> Đảo câu: ${this.examConfig.shuffleQuestions ? 'Bật' : 'Tắt'}
                </span>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${this.examConfig.shuffleOptions ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">
                  <i class="fa-solid fa-list-check text-[9px]"></i> Đảo phương án: ${this.examConfig.shuffleOptions ? 'Bật' : 'Tắt'}
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Nút mở bảng câu hỏi trên điện thoại -->
            <button id="btn-open-mobile-palette" class="lg:hidden px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-table-cells"></i>
              <span>${Object.keys(this.userAnswers).length}/${total}</span>
            </button>

            <!-- Đồng hồ bấm giờ -->
            <div class="flex items-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800 px-3 sm:px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <i class="fa-regular fa-clock text-slate-400 text-xs sm:text-sm"></i>
              <span id="exam-timer" class="text-blue-600 dark:text-blue-400 font-bold text-base sm:text-xl font-mono">00:00</span>
            </div>

            <!-- Nút nộp bài -->
            <button id="btn-submit-exam" class="px-3.5 sm:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5">
              <i class="fa-solid fa-cloud-arrow-up"></i> <span class="hidden sm:inline">Nộp bài</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Khu vực nội dung bài thi: 2 Cột (Câu hỏi + Ma trận câu hỏi) -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        <!-- Cột 1: Câu hỏi đang hiển thị (3 phần) -->
        <div class="lg:col-span-3 space-y-6">

          <!-- Banner Giám Sát Chống Gian Lận (Nếu có bật) -->
          ${this.isProctored ? `
            <div class="p-3.5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm border border-slate-700/80">
              <div class="flex items-center gap-2.5">
                <span class="w-3 h-3 rounded-full ${Proctor.violationCount > 0 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}"></span>
                <div>
                  <span class="font-bold text-xs flex items-center gap-1.5 text-white">
                    <i class="fa-solid fa-shield-halved text-blue-400"></i> Phòng thi được giám sát chống gian lận
                  </span>
                  <span class="text-[10px] text-slate-400 block">Nghiêm cấm chuyển tab, thu nhỏ hoặc rời khỏi cửa sổ thi</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <span id="proctor-violation-badge" class="text-[11px] font-mono px-3 py-1 rounded-xl ${Proctor.violationCount > 0 ? 'bg-rose-600 text-white font-bold animate-pulse' : 'bg-white/10 text-slate-300'}">
                  Vi phạm: <strong class="text-white">${Proctor.violationCount}</strong>/${this.maxViolations || 3}
                </span>
                <button type="button" id="btn-toggle-fullscreen" class="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl text-xs font-semibold transition border border-white/10 flex items-center gap-1">
                  <i class="fa-solid fa-expand text-[10px]"></i> Toàn màn hình
                </button>
              </div>
            </div>
          ` : ''}

          <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
            
            <!-- Header câu hỏi -->
            <div class="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100 dark:border-slate-700">
              <div class="flex items-center gap-2">
                <span class="text-base font-extrabold text-blue-600 dark:text-blue-400">
                  Câu ${this.currentIndex + 1}
                </span>
                <span class="text-xs text-slate-400">/ ${total} câu</span>
                ${this.getSectionBadge(currentQ)}
              </div>

              <button id="btn-flag-q" class="text-xs px-3 py-1.5 rounded-xl border transition flex items-center gap-1.5 ${isFlagged ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600 hover:text-amber-500'}">
                <i class="${isFlagged ? 'fa-solid' : 'fa-regular'} fa-flag"></i>
                <span>${isFlagged ? 'Đã gắn cờ' : 'Gắn cờ xem lại'}</span>
              </button>
            </div>

            <!-- Nội dung câu hỏi -->
            <h3 class="text-base sm:text-lg font-bold text-slate-800 dark:text-white leading-relaxed mb-6">
              ${escapeHtml(currentQ.question)}
            </h3>

            <!-- Phương án trả lời -->
            <div id="exam-options-container">
              ${this.renderExamOptions(currentQ)}
            </div>

            <!-- Nút chuyển câu Trước / Sau -->
            <div class="mt-8 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <button id="btn-exam-prev" ${this.currentIndex === 0 ? 'disabled' : ''} class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                <i class="fa-solid fa-arrow-left mr-1"></i>Câu trước
              </button>

              <button id="btn-exam-next" ${this.currentIndex === total - 1 ? 'disabled' : ''} class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-40 transition shadow-md shadow-blue-500/20">
                Câu sau<i class="fa-solid fa-arrow-right ml-1"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Cột 2: Ma trận điều hướng câu hỏi (Palette) -->
        <div class="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sticky top-36">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span>Danh sách câu hỏi</span>
            <span class="text-blue-600 font-mono">${Object.keys(this.userAnswers).length}/${total}</span>
          </h4>

          <!-- Chú giải -->
          <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-500 mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded bg-blue-600 shrink-0"></span> Đã làm
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-slate-700 shrink-0"></span> Chưa làm
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded border-2 border-amber-500 shrink-0"></span> Gắn cờ
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded ring-2 ring-blue-500 shrink-0"></span> Đang xem
            </div>
          </div>

          <!-- Lưới các ô câu hỏi trên máy tính / tablet -->
          <div class="grid grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1">
            ${this.renderPaletteButtons()}
          </div>
        </div>

      </div>

      <!-- Mobile Bottom Sheet Drawer cho danh sách câu hỏi (Điện thoại 16:9 đến 21:9) -->
      <div id="mobile-palette-drawer" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end lg:hidden">
        <div class="bg-white dark:bg-slate-800 w-full max-h-[75dvh] rounded-t-3xl p-5 overflow-y-auto border-t border-slate-200 dark:border-slate-700 shadow-2xl">
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-list-ol text-blue-600"></i> Bảng điều hướng (${total} câu)
              </h4>
              <span class="text-[11px] text-slate-400">Đã làm: ${Object.keys(this.userAnswers).length}/${total}</span>
            </div>
            <button id="btn-close-mobile-palette" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 flex items-center justify-center text-xs">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="grid grid-cols-7 sm:grid-cols-10 gap-2 mb-2">
            ${this.renderPaletteButtons()}
          </div>
        </div>
      </div>
    `;

    this.updateTimerDisplay();
    this.bindExamEvents(currentQ);
  },

  renderPaletteButtons() {
    return this.examQuestions.map((q, idx) => {
      const isAnswered = !!this.userAnswers[q.id];
      const isCurrent = (idx === this.currentIndex);
      const flagged = this.flaggedQuestions.has(q.id);

      let cls = isAnswered ? 'answered' : 'unanswered';
      if (flagged) cls += ' flagged';
      if (isCurrent) cls += ' active';

      return `
        <button type="button" data-jump-idx="${idx}" class="palette-btn w-full aspect-square rounded-xl text-xs font-bold flex items-center justify-center ${cls}">
          ${idx + 1}
        </button>
      `;
    }).join('');
  },

  renderExamOptions(q) {
    const letters = ['A', 'B', 'C', 'D'];
    const userAns = this.userAnswers[q.id];

    if (['1', '2', '3', '4'].includes(q.level)) {
      // MCQ
      const options = q.displayOptions || q.options;
      return `
        <div class="space-y-3 w-full">
          ${options.map((opt, idx) => {
            const letter = letters[idx];
            const isChosen = (userAns && userAns.chosen === letter);

            return `
              <button type="button" data-exam-mcq="${letter}" class="option-btn w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 flex items-start ${isChosen ? 'selected' : ''}">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${isChosen ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'} shrink-0 mr-3">
                  ${letter}
                </span>
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200 pt-0.5 break-words">
                  ${escapeHtml(opt)}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;
    } else if (q.level === 'DS') {
      // Đúng / Sai
      const subLetters = ['a', 'b', 'c', 'd'];
      const choices = (userAns && userAns.choices) ? userAns.choices : ['', '', '', ''];

      return `
        <div class="space-y-3.5 w-full">
          <p class="text-xs text-slate-500 italic mb-2">Đánh dấu Đúng hoặc Sai cho mỗi ý:</p>
          ${q.options.map((opt, idx) => {
            const letter = subLetters[idx];
            const chosen = choices[idx];

            return `
              <div class="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-start gap-2.5 flex-1 pr-2">
                  <span class="font-bold text-blue-600 dark:text-blue-400 shrink-0">${letter})</span>
                  <span class="break-words leading-relaxed">${escapeHtml(opt)}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button type="button" data-exam-tf="${idx}" data-val="Đ" class="px-4 py-2 rounded-xl text-xs font-bold border transition ${chosen === 'Đ' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400'}">
                    Đúng
                  </button>
                  <button type="button" data-exam-tf="${idx}" data-val="S" class="px-4 py-2 rounded-xl text-xs font-bold border transition ${chosen === 'S' ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-rose-400'}">
                    Sai
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (q.level === 'TLN') {
      // Trả lời ngắn
      const currentVal = (userAns && userAns.input) ? userAns.input : '';
      return `
        <div class="space-y-3 w-full">
          <p class="text-xs text-slate-500 italic mb-2">Nhập kết quả ngắn gọn vào ô bên dưới:</p>
          <input type="text" id="exam-tln-input" value="${escapeHtml(currentVal)}" placeholder="Điền đáp án của bạn..." class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-white" />
        </div>
      `;
    }
  },

  getSectionBadge(q) {
    if (['1', '2', '3', '4'].includes(q.level)) {
      return `<span class="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Phần I: Trắc nghiệm</span>`;
    } else if (q.level === 'DS') {
      return `<span class="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Phần II: Đúng / Sai</span>`;
    } else if (q.level === 'TLN') {
      return `<span class="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">Phần III: Trả lời ngắn</span>`;
    }
    return '';
  },

  bindExamEvents(currentQ) {
    // Fullscreen Toggle in Proctor mode
    const fsBtn = this.container.querySelector('#btn-toggle-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        Proctor.requestFullscreen();
      });
    }

    // Mobile Drawer Open / Close
    const openMobilePaletteBtn = this.container.querySelector('#btn-open-mobile-palette');
    const closeMobilePaletteBtn = this.container.querySelector('#btn-close-mobile-palette');
    const mobilePaletteDrawer = this.container.querySelector('#mobile-palette-drawer');

    if (openMobilePaletteBtn && mobilePaletteDrawer) {
      openMobilePaletteBtn.addEventListener('click', () => {
        mobilePaletteDrawer.classList.remove('hidden');
      });
    }

    if (closeMobilePaletteBtn && mobilePaletteDrawer) {
      closeMobilePaletteBtn.addEventListener('click', () => {
        mobilePaletteDrawer.classList.add('hidden');
      });
    }

    if (mobilePaletteDrawer) {
      mobilePaletteDrawer.addEventListener('click', (e) => {
        if (e.target === mobilePaletteDrawer) {
          mobilePaletteDrawer.classList.add('hidden');
        }
      });
    }

    // Jump Palette
    this.container.querySelectorAll('[data-jump-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-jump-idx'), 10);
        this.currentIndex = idx;
        this.renderExamInterface();
      });
    });

    // Prev / Next
    const prevBtn = this.container.querySelector('#btn-exam-prev');
    const nextBtn = this.container.querySelector('#btn-exam-next');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.renderExamInterface();
      }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (this.currentIndex < this.examQuestions.length - 1) {
        this.currentIndex++;
        this.renderExamInterface();
      }
    });

    // Flag toggle
    const flagBtn = this.container.querySelector('#btn-flag-q');
    if (flagBtn) {
      flagBtn.addEventListener('click', () => {
        if (this.flaggedQuestions.has(currentQ.id)) {
          this.flaggedQuestions.delete(currentQ.id);
        } else {
          this.flaggedQuestions.add(currentQ.id);
        }
        this.renderExamInterface();
      });
    }

    // MCQ select
    const mcqBtns = this.container.querySelectorAll('[data-exam-mcq]');
    mcqBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const letter = btn.getAttribute('data-exam-mcq');
        this.userAnswers[currentQ.id] = { chosen: letter };
        this.renderExamInterface();
      });
    });

    // TF select
    const tfBtns = this.container.querySelectorAll('[data-exam-tf]');
    tfBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-exam-tf'), 10);
        const val = btn.getAttribute('data-val');
        
        let existing = this.userAnswers[currentQ.id] ? this.userAnswers[currentQ.id].choices : ['', '', '', ''];
        existing[idx] = val;
        this.userAnswers[currentQ.id] = { choices: [...existing] };
        this.renderExamInterface();
      });
    });

    // TLN input
    const tlnInput = this.container.querySelector('#exam-tln-input');
    if (tlnInput) {
      tlnInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.trim()) {
          this.userAnswers[currentQ.id] = { input: val };
        } else {
          delete this.userAnswers[currentQ.id];
        }
      });
    }

    // Nộp bài
    const submitBtn = this.container.querySelector('#btn-submit-exam');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const total = this.examQuestions.length;
        const answeredCount = Object.keys(this.userAnswers).length;
        const unansweredCount = total - answeredCount;

        let confirmMsg = `Bạn đã hoàn thành ${answeredCount}/${total} câu hỏi.`;
        if (unansweredCount > 0) {
          confirmMsg += `\nCòn ${unansweredCount} câu chưa trả lời!\nBạn có chắc chắn muốn nộp bài ngay bây giờ?`;
        } else {
          confirmMsg += `\nBạn có muốn nộp bài để xem kết quả không?`;
        }

        if (confirm(confirmMsg)) {
          this.submitExam();
        }
      });
    }
  },

  terminateExamDueToCheating(logs) {
    this.isDisqualified = true;
    this.disqualifiedReason = `Đình chỉ thi do vi phạm quy chế quá ${this.maxViolations} lần cho phép (rời khỏi màn hình làm bài)`;
    this.submitExam(true, this.disqualifiedReason, logs);
  },

  // --- NỘP BÀI & CHẤM ĐIỂM ---
  submitExam(isForced = false, forceReason = '', forcedLogs = null) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    document.body.classList.remove('in-exam');
    this.examState = 'submitted';

    if (this.isProctored) {
      Proctor.stop();
    }

    const timeSpent = this.totalSeconds - Math.max(0, this.remainingSeconds);
    let totalScore = 0;
    let part1Score = 0;
    let part2Score = 0;
    let correctCount = 0;
    const details = [];

    // Tính điểm dựa theo cấu trúc đề
    const isBgdFormat = (this.examConfig.type === 'bgd_2025');

    this.examQuestions.forEach(q => {
      const userAns = this.userAnswers[q.id];
      let itemScore = 0;
      let isCorrect = false;

      if (['1', '2', '3', '4'].includes(q.level)) {
        // Trắc nghiệm nhiều lựa chọn: 24 câu = 6.0 điểm (mỗi câu 0.25đ)
        const correctAns = q.displayAnswer || q.answer;
        const chosen = userAns ? userAns.chosen : null;
        if (chosen === correctAns) {
          isCorrect = true;
          correctCount++;
          itemScore = isBgdFormat ? 0.25 : (10 / this.examQuestions.length);
        }
        part1Score += itemScore;
        details.push({
          question: q,
          userChoice: chosen,
          correctAnswer: correctAns,
          isCorrect,
          score: itemScore
        });
      } else if (q.level === 'DS') {
        // Đúng / Sai: 4 câu = 4.0 điểm
        // Quy chế chuẩn Bộ GD&ĐT: 1 ý = 0.1đ | 2 ý = 0.25đ | 3 ý = 0.5đ | 4 ý = 1.0đ
        const correctParts = (q.answer || 'Đ,Đ,Đ,Đ').split(',');
        const choices = (userAns && userAns.choices) ? userAns.choices : ['', '', '', ''];
        let correctSub = 0;
        for (let i = 0; i < 4; i++) {
          if (choices[i] && choices[i] === correctParts[i]) {
            correctSub++;
          }
        }
        const pointMap = [0, 0.1, 0.25, 0.5, 1.0];
        itemScore = pointMap[correctSub];
        isCorrect = (correctSub === 4);
        if (correctSub >= 2) correctCount += (correctSub / 4);
        part2Score += itemScore;

        details.push({
          question: q,
          choices,
          correctParts,
          correctSub,
          isCorrect,
          score: itemScore
        });
      } else if (q.level === 'TLN') {
        // Trả lời ngắn (dành cho kiểm tra riêng nếu có)
        const inputVal = (userAns && userAns.input) ? userAns.input.trim() : '';
        const normUser = inputVal.toLowerCase().replace(/\s+/g, '');
        const normAns = (q.answer || '').toLowerCase().replace(/\s+/g, '');
        if (normUser && normUser === normAns) {
          isCorrect = true;
          correctCount++;
          itemScore = isBgdFormat ? 0.25 : (10 / this.examQuestions.length);
        }
        details.push({
          question: q,
          userInput: inputVal,
          correctAnswer: q.answer,
          isCorrect,
          score: itemScore
        });
      }

      totalScore += itemScore;
    });

    // Giới hạn điểm từ 0 đến 10, làm tròn 2 chữ số thập phân
    totalScore = Math.min(10, Math.max(0, Math.round(totalScore * 100) / 100));

    const isDisqualified = this.isDisqualified || isForced;
    const disqualifiedReason = this.disqualifiedReason || forceReason || '';
    const violationLogs = forcedLogs || (this.isProctored ? Proctor.violationLogs : []);
    const violationCount = this.isProctored ? Proctor.violationCount : 0;

    const user = Auth.currentUser;

    this.examResult = {
      title: this.examConfig.title,
      type: this.examConfig.type,
      grade: this.examConfig.grade,
      score: isDisqualified ? 0.0 : totalScore,
      rawScore: totalScore,
      part1Score: Math.round(part1Score * 100) / 100,
      part2Score: Math.round(part2Score * 100) / 100,
      totalQuestions: this.examQuestions.length,
      correctCount: Math.round(correctCount),
      timeSpentSeconds: timeSpent,
      studentName: user?.fullName || 'Thí sinh tự do',
      studentClass: user?.className || '',
      studentSchool: user?.school || '',
      studentEmail: user?.email || '',
      roomId: this.examConfig.roomId || null,
      roomTitle: this.examConfig.roomTitle || null,
      isProctored: this.isProctored,
      violationCount,
      violationLogs,
      isDisqualified,
      disqualifiedReason,
      details
    };

    // Lưu vào LocalStorage
    Storage.saveExamResult(this.examResult);

    // Kích hoạt pháo hoa chúc mừng nếu đạt điểm cao và không bị đình chỉ
    if (!isDisqualified && totalScore >= 8.0 && window.confetti) {
      window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    this.renderResultView();
  },

  // --- HIỂN THỊ KẾT QUẢ & PHÂN TÍCH ĐỀ THI ---
  renderResultView() {
    const res = this.examResult;
    const mins = Math.floor(res.timeSpentSeconds / 60);
    const secs = res.timeSpentSeconds % 60;
    const timeFormatted = `${mins} phút ${secs} giây`;

    let rankBadge = { text: 'Xuất sắc', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
    if (res.score < 5.0) {
      rankBadge = { text: 'Cần cố gắng', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' };
    } else if (res.score < 6.5) {
      rankBadge = { text: 'Trung bình', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
    } else if (res.score < 8.0) {
      rankBadge = { text: 'Khá', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' };
    } else if (res.score < 9.0) {
      rankBadge = { text: 'Giỏi', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' };
    }

    this.container.innerHTML = `
      <div class="max-w-4xl mx-auto space-y-8">
        
        <!-- Bảng tổng kết điểm số -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center relative overflow-hidden">
          <div class="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"></div>
          
          <span class="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest ${rankBadge.cls} mb-3">
            Xếp loại: ${rankBadge.text}
          </span>

          <!-- Thẻ thông tin học sinh -->
          <div class="mb-4 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs px-4 py-2 bg-slate-100 dark:bg-slate-700/60 rounded-2xl text-slate-700 dark:text-slate-200 font-medium">
            <span><i class="fa-solid fa-user-graduate text-blue-600 mr-1.5"></i>Thí sinh: <b>${res.studentName}</b></span>
            ${res.studentClass ? `<span>•</span><span>Lớp: <b>${res.studentClass}</b></span>` : ''}
            ${res.studentSchool ? `<span>•</span><span>Trường: <b>${res.studentSchool}</b></span>` : ''}
            ${res.roomId ? `<span>•</span><span class="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold font-mono">Phòng: ${res.roomId}</span>` : ''}
          </div>

          <!-- Thông báo kết quả giám sát chống gian lận -->
          ${res.isDisqualified ? `
            <div class="p-5 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-500 rounded-3xl text-center space-y-3 mb-6 shadow-sm max-w-lg mx-auto">
              <div class="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center text-2xl mx-auto shadow-lg shadow-rose-600/30">
                <i class="fa-solid fa-ban"></i>
              </div>
              <h3 class="text-base font-black text-rose-700 dark:text-rose-300">
                BÀI THI BỊ ĐÌNH CHỈ DO GIAN LẬN
              </h3>
              <p class="text-xs text-rose-600 dark:text-rose-400 font-bold leading-relaxed">
                ${escapeHtml(res.disqualifiedReason || 'Vi phạm quy chế quá số lần cho phép')}
              </p>
              <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-rose-200 dark:border-rose-900 text-left text-xs space-y-1">
                <p class="font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-1.5">
                  <i class="fa-solid fa-clipboard-list text-rose-500"></i> Biên bản mốc thời gian vi phạm:
                </p>
                ${(res.violationLogs || []).map((l, i) => `
                  <p class="text-rose-600 dark:text-rose-400 font-mono text-[11px] leading-snug">
                    • [${l.time}] Lần ${i+1}: ${escapeHtml(l.reason)}
                  </p>
                `).join('')}
              </div>
            </div>
          ` : (res.violationCount > 0 ? `
            <div class="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl text-left text-xs mb-6 max-w-lg mx-auto flex items-start gap-2.5">
              <i class="fa-solid fa-triangle-exclamation text-amber-500 text-base mt-0.5 shrink-0"></i>
              <div>
                <strong class="text-amber-800 dark:text-amber-300 block mb-0.5">Cảnh báo giám sát phòng thi:</strong>
                <span class="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                  Hệ thống ghi nhận thí sinh có <b>${res.violationCount} lần</b> rời màn hình hoặc chuyển tab. Mốc thời gian vi phạm đã được ghi vào biên bản nộp cho Thầy Cô.
                </span>
              </div>
            </div>
          ` : '')}

          <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white mb-2">
            Kết Quả Bài Thi Thử
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-8">
            ${res.title} • Khối ${res.grade}
          </p>

          <!-- Điểm số lớn -->
          <div class="inline-flex flex-col items-center justify-center w-36 h-36 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/25 mb-6">
            <span class="text-4xl sm:text-5xl font-black">${res.score}</span>
            <span class="text-xs uppercase tracking-widest text-blue-200 font-bold">Thang điểm 10</span>
          </div>

          <!-- Phân tích điểm theo cấu trúc đề chuẩn THPTQG -->
          ${res.type === 'bgd_2025' ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-6 text-left">
              <div class="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                <div>
                  <span class="text-xs font-bold text-blue-700 dark:text-blue-300 block">Phần I: Trắc nghiệm (24 câu)</span>
                  <span class="text-[11px] text-slate-400">Mỗi câu 0.25 điểm</span>
                </div>
                <span class="text-xl font-black text-blue-700 dark:text-blue-300 font-mono">${res.part1Score ?? 0} <span class="text-xs font-semibold text-slate-400">/ 6.0đ</span></span>
              </div>
              <div class="p-4 rounded-2xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                <div>
                  <span class="text-xs font-bold text-purple-700 dark:text-purple-300 block">Phần II: Đúng / Sai (4 câu)</span>
                  <span class="text-[11px] text-slate-400">Thang điểm 0.1 - 0.25 - 0.5 - 1.0</span>
                </div>
                <span class="text-xl font-black text-purple-700 dark:text-purple-300 font-mono">${res.part2Score ?? 0} <span class="text-xs font-semibold text-slate-400">/ 4.0đ</span></span>
              </div>
            </div>
          ` : ''}

          <!-- Các chỉ số thống kê -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
            <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span class="text-xs text-slate-400 block mb-1">Thời gian làm bài</span>
              <span class="text-sm font-bold text-slate-800 dark:text-white">${timeFormatted}</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span class="text-xs text-slate-400 block mb-1">Số câu đúng</span>
              <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400">${res.correctCount} / ${res.totalQuestions}</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span class="text-xs text-slate-400 block mb-1">Tỷ lệ chính xác</span>
              <span class="text-sm font-bold text-blue-600 dark:text-blue-400">${Math.round((res.score / 10) * 100)}%</span>
            </div>
            <div class="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
              <span class="text-xs text-slate-400 block mb-1">Trạng thái</span>
              <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">Đã lưu bài</span>
            </div>
          </div>

          <!-- Các nút hành động -->
          <div class="flex flex-wrap items-center justify-center gap-3 mt-8">
            <button id="btn-retake-exam" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-blue-500/20 flex items-center gap-2">
              <i class="fa-solid fa-arrows-rotate"></i> Làm lại đề này
            </button>
            <button id="btn-view-leaderboard" class="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/25 flex items-center gap-2">
              <i class="fa-solid fa-crown text-yellow-300"></i> Xem Bảng Vinh Danh
            </button>
            <button id="btn-new-exam" class="px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition flex items-center gap-2">
              <i class="fa-solid fa-plus"></i> Tạo đề thi mới
            </button>
          </div>
        </div>

        <!-- Chi tiết đáp án và lời giải -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
          <div class="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h3 class="text-lg font-bold text-slate-800 dark:text-white">
                Xem Lại Chi Tiết Toàn Bộ Bài Thi
              </h3>
              <p class="text-xs text-slate-400">
                Đối chiếu câu trả lời của bạn với đáp án chuẩn
              </p>
            </div>

            <!-- Bộ lọc xem lại -->
            <div class="flex items-center gap-2 text-xs">
              <button data-review-filter="all" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">Tất cả</button>
              <button data-review-filter="wrong" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:text-rose-500">Chỉ câu sai</button>
              <button data-review-filter="correct" class="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:text-emerald-500">Chỉ câu đúng</button>
            </div>
          </div>

          <!-- Danh sách câu hỏi xem lại -->
          <div id="review-list" class="space-y-6">
            ${this.renderReviewItems(res.details, 'all')}
          </div>
        </div>

      </div>
    `;

    this.bindResultEvents();
  },

  renderReviewItems(details, filter) {
    let list = details;
    if (filter === 'wrong') list = details.filter(d => !d.isCorrect);
    if (filter === 'correct') list = details.filter(d => d.isCorrect);

    if (list.length === 0) {
      return `
        <div class="text-center py-10 text-slate-400 text-sm">
          Không có câu hỏi nào thuộc phân loại này.
        </div>
      `;
    }

    return list.map((item, idx) => {
      const q = item.question;
      const letters = ['A', 'B', 'C', 'D'];

      return `
        <div class="p-6 rounded-2xl border ${item.isCorrect ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20' : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/20'}">
          <div class="flex items-center justify-between gap-3 mb-3">
            <span class="text-xs font-bold px-2.5 py-1 rounded-lg ${item.isCorrect ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'}">
              Câu ${q.examIndex || idx + 1}: ${item.isCorrect ? 'Đúng (+ ' + item.score + 'đ)' : 'Sai (' + item.score + 'đ)'}
            </span>
            <span class="text-xs text-slate-400">${q.lesson}</span>
          </div>

          <h4 class="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-4">
            ${escapeHtml(q.question)}
          </h4>

          ${['1', '2', '3', '4'].includes(q.level) ? `
            <div class="space-y-2 mb-3">
              ${(q.displayOptions || q.options).map((opt, oIdx) => {
                const letter = letters[oIdx];
                const isCorrectAns = (letter === (q.displayAnswer || q.answer));
                const isUserChoice = (letter === item.userChoice);

                let optClass = 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400';
                if (isCorrectAns) optClass = 'border-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold';
                else if (isUserChoice) optClass = 'border-rose-500 bg-rose-100/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200';

                return `
                  <div class="p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between ${optClass}">
                    <div class="flex items-center gap-2">
                      <span class="font-bold">${letter}.</span>
                      <span>${escapeHtml(opt)}</span>
                    </div>
                    ${isCorrectAns ? '<span class="text-emerald-600 font-bold shrink-0 text-xs">Đáp án đúng</span>' : ''}
                    ${isUserChoice && !isCorrectAns ? '<span class="text-rose-600 font-bold shrink-0 text-xs">Bạn đã chọn</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : (q.level === 'DS' ? `
            <div class="text-xs space-y-1.5 mb-3">
              ${q.options.map((opt, oIdx) => {
                const subL = ['a', 'b', 'c', 'd'][oIdx];
                const userVal = item.choices ? item.choices[oIdx] : 'Chưa chọn';
                const correctVal = item.correctParts ? item.correctParts[oIdx] : '';
                const match = (userVal === correctVal);

                return `
                  <div class="p-2.5 rounded-lg border ${match ? 'border-emerald-300 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/40'} flex items-center justify-between">
                    <div><b>${subL})</b> ${escapeHtml(opt)}</div>
                    <div class="shrink-0 ml-2">
                      Bạn chọn: <b>${userVal || 'Bỏ qua'}</b> | Đ/A: <b class="text-blue-600">${correctVal}</b>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="text-xs p-3 rounded-lg bg-slate-100 dark:bg-slate-700/60 space-y-1">
              <div>Câu trả lời của bạn: <b>${escapeHtml(item.userInput || 'Chưa nhập')}</b></div>
              <div>Đáp án chính xác: <b class="text-emerald-600">${escapeHtml(item.correctAnswer)}</b></div>
            </div>
          `)}
        </div>
      `;
    }).join('');
  },

  bindResultEvents() {
    const retakeBtn = this.container.querySelector('#btn-retake-exam');
    const newExamBtn = this.container.querySelector('#btn-new-exam');
    const lbBtn = this.container.querySelector('#btn-view-leaderboard');

    if (lbBtn) {
      lbBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'leaderboard' }));
      });
    }

    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        this.generateExam(this.examConfig);
      });
    }

    if (newExamBtn) {
      newExamBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'exam-setup' }));
      });
    }

    // Filter review items
    this.container.querySelectorAll('[data-review-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-review-filter');
        this.container.querySelectorAll('[data-review-filter]').forEach(b => {
          b.className = 'px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium';
        });
        btn.className = 'px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold';

        const listEl = this.container.querySelector('#review-list');
        if (listEl) {
          listEl.innerHTML = this.renderReviewItems(this.examResult.details, f);
        }
      });
    });
  }
};

