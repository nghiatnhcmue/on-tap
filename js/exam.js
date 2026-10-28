/**
 * tinhoc-hub: Exam Controller (Thi thử trực tuyến)
 * Hỗ trợ đề chuẩn Bộ GD&ĐT 2025, kiểm tra định kỳ 15p, 45p và tùy biến đề thi
 */

import { Storage } from './storage.js';

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

  init(containerEl, allQuestions, manifest) {
    this.container = containerEl;
    this.allQuestions = allQuestions;
    this.manifest = manifest;
    this.resetState();
  },

  resetState() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.examQuestions = [];
    this.userAnswers = {};
    this.flaggedQuestions = new Set();
    this.currentIndex = 0;
    this.totalSeconds = 0;
    this.remainingSeconds = 0;
    this.examConfig = null;
    this.examState = 'idle';
    this.examResult = null;
  },

  // --- TẠO ĐỀ THI ---
  generateExam(config) {
    this.resetState();
    this.examConfig = config;
    const grade = config.grade || '12';
    const gradePool = this.allQuestions.filter(q => q.grade === grade);

    if (gradePool.length === 0) {
      alert('Không có dữ liệu câu hỏi cho khối lớp này!');
      return false;
    }

    let selectedQuestions = [];

    if (config.type === 'bgd_2025') {
      // Đề chuẩn Bộ GD&ĐT 2025:
      // Phần I: 24 câu trắc nghiệm nhiều lựa chọn (4 phương án)
      // Phần II: 4 câu trắc nghiệm Đúng/Sai
      // Phần III (nếu có TLN): 6 câu trả lời ngắn, hoặc tăng MCQ
      const mcqPool = gradePool.filter(q => ['1', '2', '3', '4'].includes(q.level));
      const dsPool = gradePool.filter(q => q.level === 'DS');
      const tlnPool = gradePool.filter(q => q.level === 'TLN');

      // Lấy 24 câu MCQ theo phân bổ
      const mcqSelected = this.sampleQuestions(mcqPool, 24);
      // Lấy 4 câu Đúng/Sai (nếu không đủ thì lấy tối đa)
      const dsSelected = this.sampleQuestions(dsPool, 4);
      // Lấy 6 câu TLN nếu khối có TLN
      const tlnSelected = this.sampleQuestions(tlnPool, 6);

      selectedQuestions = [...mcqSelected, ...dsSelected, ...tlnSelected];
      this.totalSeconds = (config.duration || 50) * 60;
    } else {
      // Đề kiểm tra định kỳ hoặc tự chọn
      let pool = gradePool;
      if (config.topic && config.topic !== 'all') {
        pool = pool.filter(q => q.topic === config.topic);
      }
      const count = Math.min(config.count || 30, pool.length);
      selectedQuestions = this.sampleQuestions(pool, count);
      this.totalSeconds = (config.duration || 45) * 60;
    }

    // Xáo trộn và chuẩn bị dữ liệu câu hỏi
    this.examQuestions = selectedQuestions.map((q, index) => {
      // Copy để không ảnh hưởng dữ liệu gốc
      const item = { ...q, examIndex: index + 1 };
      
      // Xáo trộn đáp án cho MCQ để tránh học vẹt
      if (['1', '2', '3', '4'].includes(item.level) && item.options && item.options.length === 4) {
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
        item.displayAnswer = item.answer;
      }

      return item;
    });

    this.remainingSeconds = this.totalSeconds;
    this.examState = 'taking';
    this.startTimer();
    this.renderExamInterface();
    return true;
  },

  sampleQuestions(pool, count) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
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
            </div>
          </div>

          <div class="flex items-center gap-4">
            <!-- Đồng hồ bấm giờ -->
            <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <i class="fa-regular fa-clock text-slate-400 text-sm"></i>
              <span id="exam-timer" class="text-blue-600 dark:text-blue-400 font-bold text-xl font-mono">00:00</span>
            </div>

            <!-- Nút nộp bài -->
            <button id="btn-submit-exam" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition flex items-center gap-1.5">
              <i class="fa-solid fa-cloud-arrow-up"></i> Nộp bài
            </button>
          </div>
        </div>
      </div>

      <!-- Khu vực nội dung bài thi: 2 Cột (Câu hỏi + Ma trận câu hỏi) -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        <!-- Cột 1: Câu hỏi đang hiển thị (3 phần) -->
        <div class="lg:col-span-3 space-y-6">
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
              ${currentQ.question}
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

          <!-- Lưới các ô câu hỏi -->
          <div class="grid grid-cols-5 gap-2 max-h-[380px] overflow-y-auto pr-1">
            ${this.examQuestions.map((q, idx) => {
              const isAnswered = !!this.userAnswers[q.id];
              const isCurrent = (idx === this.currentIndex);
              const flagged = this.flaggedQuestions.has(q.id);

              let cls = isAnswered ? 'answered' : 'unanswered';
              if (flagged) cls += ' flagged';
              if (isCurrent) cls += ' active';

              return `
                <button data-jump-idx="${idx}" class="palette-btn w-full aspect-square rounded-xl text-xs font-bold flex items-center justify-center ${cls}">
                  ${idx + 1}
                </button>
              `;
            }).join('')}
          </div>
        </div>

      </div>
    `;

    this.updateTimerDisplay();
    this.bindExamEvents(currentQ);
  },

  renderExamOptions(q) {
    const letters = ['A', 'B', 'C', 'D'];
    const userAns = this.userAnswers[q.id];

    if (['1', '2', '3', '4'].includes(q.level)) {
      // MCQ
      const options = q.displayOptions || q.options;
      return `
        <div class="space-y-3">
          ${options.map((opt, idx) => {
            const letter = letters[idx];
            const isChosen = (userAns && userAns.chosen === letter);

            return `
              <button data-exam-mcq="${letter}" class="option-btn w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 flex items-start ${isChosen ? 'selected' : ''}">
                <span class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${isChosen ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'} shrink-0 mr-3">
                  ${letter}
                </span>
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200 pt-0.5">
                  ${opt}
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
        <div class="space-y-3">
          <p class="text-xs text-slate-500 italic mb-2">Đánh dấu Đúng hoặc Sai cho mỗi ý:</p>
          ${q.options.map((opt, idx) => {
            const letter = subLetters[idx];
            const chosen = choices[idx];

            return `
              <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-start gap-2">
                  <span class="font-bold text-blue-600">${letter})</span>
                  <span>${opt}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button data-exam-tf="${idx}" data-val="Đ" class="px-4 py-1.5 rounded-lg text-xs font-bold border transition ${chosen === 'Đ' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300'}">
                    Đúng
                  </button>
                  <button data-exam-tf="${idx}" data-val="S" class="px-4 py-1.5 rounded-lg text-xs font-bold border transition ${chosen === 'S' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300'}">
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
        <div class="space-y-3">
          <p class="text-xs text-slate-500 italic mb-2">Nhập kết quả ngắn gọn vào ô bên dưới:</p>
          <input type="text" id="exam-tln-input" value="${currentVal}" placeholder="Điền đáp án của bạn..." class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-white" />
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

  // --- NỘP BÀI & CHẤM ĐIỂM ---
  submitExam() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.examState = 'submitted';

    const timeSpent = this.totalSeconds - Math.max(0, this.remainingSeconds);
    let totalScore = 0;
    let correctCount = 0;
    const details = [];

    // Tính điểm dựa theo cấu trúc đề
    const isBgdFormat = (this.examConfig.type === 'bgd_2025');

    this.examQuestions.forEach(q => {
      const userAns = this.userAnswers[q.id];
      let itemScore = 0;
      let isCorrect = false;

      if (['1', '2', '3', '4'].includes(q.level)) {
        // Trắc nghiệm nhiều lựa chọn
        const correctAns = q.displayAnswer || q.answer;
        const chosen = userAns ? userAns.chosen : null;
        if (chosen === correctAns) {
          isCorrect = true;
          correctCount++;
          // Nếu đề BGD 2025: 24 câu MCQ = 6.0 điểm (mỗi câu 0.25đ)
          itemScore = isBgdFormat ? 0.25 : (10 / this.examQuestions.length);
        }
        details.push({
          question: q,
          userChoice: chosen,
          correctAnswer: correctAns,
          isCorrect,
          score: itemScore
        });
      } else if (q.level === 'DS') {
        // Đúng / Sai
        const correctParts = (q.answer || 'Đ,Đ,Đ,Đ').split(',');
        const choices = (userAns && userAns.choices) ? userAns.choices : ['', '', '', ''];
        let correctSub = 0;
        for (let i = 0; i < 4; i++) {
          if (choices[i] && choices[i] === correctParts[i]) {
            correctSub++;
          }
        }
        // Thang điểm Bộ GD&ĐT: 1 ý = 0.1đ, 2 ý = 0.25đ, 3 ý = 0.5đ, 4 ý = 1.0đ
        const pointMap = [0, 0.1, 0.25, 0.5, 1.0];
        itemScore = pointMap[correctSub];
        isCorrect = (correctSub === 4);
        if (correctSub >= 2) correctCount += (correctSub / 4);

        details.push({
          question: q,
          choices,
          correctParts,
          correctSub,
          isCorrect,
          score: itemScore
        });
      } else if (q.level === 'TLN') {
        // Trả lời ngắn
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

    this.examResult = {
      title: this.examConfig.title,
      grade: this.examConfig.grade,
      score: totalScore,
      totalQuestions: this.examQuestions.length,
      correctCount: Math.round(correctCount),
      timeSpentSeconds: timeSpent,
      details
    };

    // Lưu vào LocalStorage
    Storage.saveExamResult(this.examResult);

    // Kích hoạt pháo hoa chúc mừng nếu đạt điểm cao
    if (totalScore >= 8.0 && window.confetti) {
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
          
          <span class="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest ${rankBadge.cls} mb-4">
            Xếp loại: ${rankBadge.text}
          </span>

          <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white mb-2">
            Kết Quả Bài Thi Thử
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-8">
            ${res.title} • Khối ${res.grade}
          </p>

          <!-- Điểm số lớn -->
          <div class="inline-flex flex-col items-center justify-center w-36 h-36 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/25 mb-8">
            <span class="text-4xl sm:text-5xl font-black">${res.score}</span>
            <span class="text-xs uppercase tracking-widest text-blue-200 font-bold">Thang điểm 10</span>
          </div>

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
            ${q.question}
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
                      <span>${opt}</span>
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
                    <div><b>${subL})</b> ${opt}</div>
                    <div class="shrink-0 ml-2">
                      Bạn chọn: <b>${userVal || 'Bỏ qua'}</b> | Đ/A: <b class="text-blue-600">${correctVal}</b>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="text-xs p-3 rounded-lg bg-slate-100 dark:bg-slate-700/60 space-y-1">
              <div>Câu trả lời của bạn: <b>${item.userInput || 'Chưa nhập'}</b></div>
              <div>Đáp án chính xác: <b class="text-emerald-600">${item.correctAnswer}</b></div>
            </div>
          `)}
        </div>
      `;
    }).join('');
  },

  bindResultEvents() {
    const retakeBtn = this.container.querySelector('#btn-retake-exam');
    const newExamBtn = this.container.querySelector('#btn-new-exam');

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

