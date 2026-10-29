/**
 * tinhoc-hub: Practice Mode Controller
 * Quản lý tính năng Ôn tập chuyên đề, luyện tập trắc nghiệm, đúng/sai, trả lời ngắn
 */

import { Storage } from './storage.js';
import { escapeHtml } from './utils.js';

export const Practice = {
  questions: [],
  rawFilteredQuestions: [],
  filteredQuestions: [],
  currentIndex: 0,
  viewMode: 'single', // 'single' | 'list'
  sessionStats: { answered: 0, correct: 0, wrong: 0 },
  userAnswers: {}, // key: question.id -> answer state
  tempTfChoices: {},
  tempTlnInputs: {},
  shuffleQuestions: false,
  shuffleOptions: true,

  init(containerEl, allQuestions, manifest) {
    this.container = containerEl;
    this.allQuestions = allQuestions;
    this.manifest = manifest;
    this.sessionStats = { answered: 0, correct: 0, wrong: 0 };
    this.userAnswers = {};
    this.tempTfChoices = {};
    this.tempTlnInputs = {};
    this.currentIndex = 0;
    const settings = Storage.getSettings();
    this.shuffleQuestions = false;
    this.shuffleOptions = settings.shuffleOptions ?? true;
  },

  setQuestions(questions) {
    this.questions = questions;
    this.rawFilteredQuestions = [...questions];
    this.applyShuffle();
    this.currentIndex = 0;
    this.userAnswers = {};
    this.tempTfChoices = {};
    this.tempTlnInputs = {};
    this.render();
  },

  filter(grade, topic, lesson, level) {
    let result = this.questions;

    if (grade && grade !== 'all') {
      result = result.filter(q => q.grade === grade);
    }
    if (topic && topic !== 'all') {
      result = result.filter(q => q.topic === topic);
    }
    if (lesson && lesson !== 'all') {
      result = result.filter(q => q.lesson === lesson);
    }
    if (level && level !== 'all') {
      result = result.filter(q => q.level === level);
    }

    this.rawFilteredQuestions = result;
    this.applyShuffle();
    this.currentIndex = 0;
    this.render();
  },

  setShuffle(shuffleQuestions, shuffleOptions) {
    this.shuffleQuestions = !!shuffleQuestions;
    this.shuffleOptions = !!shuffleOptions;
    this.applyShuffle();
    this.currentIndex = 0;
    this.userAnswers = {};
    this.tempTfChoices = {};
    this.tempTlnInputs = {};
    this.render();
  },

  applyShuffle() {
    let list = [...(this.rawFilteredQuestions || this.questions || [])];
    if (this.shuffleQuestions) {
      list.sort(() => Math.random() - 0.5);
    }

    this.filteredQuestions = list.map(q => {
      if (this.shuffleOptions && ['1', '2', '3', '4'].includes(q.level) && Array.isArray(q.options) && q.options.length === 4) {
        const correctLetter = q.answer || 'A';
        const correctIdx = ['A', 'B', 'C', 'D'].indexOf(correctLetter);
        const correctText = q.options[correctIdx];

        const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const displayOptions = indices.map(i => q.options[i]);
        const newCorrectIdx = displayOptions.indexOf(correctText);
        const displayAnswer = ['A', 'B', 'C', 'D'][newCorrectIdx];
        return {
          ...q,
          displayOptions,
          displayAnswer
        };
      } else {
        return {
          ...q,
          displayOptions: q.options || [],
          displayAnswer: q.answer || 'A'
        };
      }
    });
  },

  render() {
    if (!this.container) return;

    if (this.filteredQuestions.length === 0) {
      this.container.innerHTML = `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-8">
          <div class="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            <i class="fa-solid fa-filter-circle-xmark"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">Không tìm thấy câu hỏi phù hợp</h3>
          <p class="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto mb-6">
            Không có câu hỏi nào thỏa mãn bộ lọc hiện tại. Vui lòng chọn lại khối, chủ đề hoặc mức độ khác.
          </p>
          <button id="btn-reset-filter" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition">
            <i class="fa-solid fa-arrows-rotate mr-2"></i>Đặt lại bộ lọc
          </button>
        </div>
      `;
      const resetBtn = this.container.querySelector('#btn-reset-filter');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('reset-practice-filter'));
        });
      }
      return;
    }

    if (this.viewMode === 'single') {
      this.renderSingleQuestion();
    } else {
      this.renderListQuestions();
    }
  },

  renderSingleQuestion() {
    const q = this.filteredQuestions[this.currentIndex];
    const total = this.filteredQuestions.length;
    const isBookmarked = Storage.isBookmarked(q.id);
    const userAns = this.userAnswers[q.id];

    const levelBadge = this.getLevelBadge(q.level);

    let contentHtml = '';

    if (q.level in { '1': 1, '2': 1, '3': 1, '4': 1 }) {
      contentHtml = this.renderMCQOptions(q, userAns);
    } else if (q.level === 'DS') {
      contentHtml = this.renderTrueFalseOptions(q, userAns);
    } else if (q.level === 'TLN') {
      contentHtml = this.renderShortAnswerInput(q, userAns);
    }

    this.container.innerHTML = `
      <!-- Header điều khiển câu hỏi -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/60">
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold uppercase tracking-wider">
              Khối ${q.grade}
            </span>
            ${levelBadge}
            <span class="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline-block">
              <i class="fa-regular fa-folder-open mr-1"></i>${q.topic}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-toggle-bookmark" class="p-2 rounded-xl transition ${isBookmarked ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-500' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-amber-500'}" title="${isBookmarked ? 'Bỏ lưu' : 'Lưu câu hỏi này'}">
              <i class="${isBookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
            </button>
            <div class="flex items-center bg-slate-100 dark:bg-slate-700 rounded-xl p-1 text-xs">
              <button id="btn-view-single" class="px-2.5 py-1 rounded-lg ${this.viewMode === 'single' ? 'bg-white dark:bg-slate-800 shadow text-blue-600 font-bold' : 'text-slate-500'}" title="Từng câu">
                <i class="fa-regular fa-square mr-1"></i>Thẻ
              </button>
              <button id="btn-view-list" class="px-2.5 py-1 rounded-lg ${this.viewMode === 'list' ? 'bg-white dark:bg-slate-800 shadow text-blue-600 font-bold' : 'text-slate-500'}" title="Danh sách">
                <i class="fa-solid fa-list mr-1"></i>Danh sách
              </button>
            </div>
          </div>
        </div>

        <!-- Tiến độ & Điều hướng nhanh -->
        <div class="pt-4 flex items-center justify-between gap-4">
          <div class="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Câu <span class="text-blue-600 dark:text-blue-400 text-base font-extrabold">${this.currentIndex + 1}</span> / ${total}
          </div>
          
          <div class="flex items-center gap-3 text-xs">
            <span class="text-emerald-600 dark:text-emerald-400 font-medium">
              <i class="fa-solid fa-check mr-1"></i>${this.sessionStats.correct} đúng
            </span>
            <span class="text-rose-600 dark:text-rose-400 font-medium">
              <i class="fa-solid fa-xmark mr-1"></i>${this.sessionStats.wrong} sai
            </span>
          </div>

          <div class="w-1/3 max-w-[200px] bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div class="bg-blue-600 h-full transition-all duration-300" style="width: ${((this.currentIndex + 1) / total) * 100}%"></div>
          </div>
        </div>
      </div>

      <!-- Khung nội dung câu hỏi -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 mb-6">
        <div class="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
          ${q.lesson}
        </div>
        <h2 class="text-base sm:text-lg font-bold text-slate-800 dark:text-white leading-relaxed mb-6">
          ${escapeHtml(q.question)}
        </h2>

        <!-- Khu vực phương án hoặc nhập liệu -->
        ${contentHtml}

        <!-- Khu vực Ghi chú cá nhân cho câu hỏi -->
        ${this.renderPersonalNoteBox(q)}
      </div>

      <!-- Điều hướng Trước / Sau -->
      <div class="flex items-center justify-between gap-4">
        <button id="btn-prev-q" ${this.currentIndex === 0 ? 'disabled' : ''} class="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium text-slate-700 dark:text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2">
          <i class="fa-solid fa-arrow-left"></i> Câu trước
        </button>

        <div class="text-xs text-slate-400 hidden sm:block">
          Dùng phím <kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-mono">←</kbd> và <kbd class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-mono">→</kbd> để chuyển câu
        </div>

        <button id="btn-next-q" ${this.currentIndex === total - 1 ? 'disabled' : ''} class="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 font-medium text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md shadow-blue-500/20 flex items-center gap-2">
          Câu tiếp <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    `;

    this.bindEventsSingle(q);
  },

  renderMCQOptions(q, userAns) {
    const letters = ['A', 'B', 'C', 'D'];
    const isAnswered = !!userAns;
    const options = q.displayOptions || q.options || [];
    const answer = q.displayAnswer || q.answer || 'A';

    return `
      <div class="space-y-3 mb-6 w-full">
        ${options.map((opt, idx) => {
          const letter = letters[idx];
          let extraClass = 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/60';
          let iconHtml = `<span class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0 mr-3">${letter}</span>`;

          if (isAnswered) {
            const isCorrectAnswer = (letter === answer);
            const isUserChoice = (userAns.chosen === letter);

            if (isCorrectAnswer) {
              extraClass = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200';
              iconHtml = `<span class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-emerald-500 text-white shrink-0 mr-3"><i class="fa-solid fa-check"></i></span>`;
            } else if (isUserChoice && !isCorrectAnswer) {
              extraClass = 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200';
              iconHtml = `<span class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs bg-rose-500 text-white shrink-0 mr-3"><i class="fa-solid fa-xmark"></i></span>`;
            } else {
              extraClass = 'opacity-60 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30';
            }
          }

          return `
            <button data-opt="${letter}" ${isAnswered ? 'disabled' : ''} class="mcq-option-btn w-full text-left p-4 rounded-xl border transition flex items-start ${extraClass}">
              ${iconHtml}
              <div class="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed pt-1 break-words">
                ${escapeHtml(opt)}
              </div>
            </button>
          `;
        }).join('')}
      </div>

      ${isAnswered ? `
        <div class="p-4 rounded-xl ${userAns.isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'} text-sm animate-pulse-subtle">
          <div class="font-bold flex items-center gap-2 mb-1">
            <i class="${userAns.isCorrect ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-xmark text-rose-500'}"></i>
            ${userAns.isCorrect ? 'Chính xác!' : `Chưa chính xác! Đáp án đúng là: ${escapeHtml(answer)}`}
          </div>
          <div class="text-xs opacity-90">
            ${userAns.isCorrect ? 'Bạn đã nắm vững kiến thức câu hỏi này.' : 'Hãy xem lại lý thuyết trong bài để khắc sâu kiến thức.'}
          </div>
        </div>
      ` : ''}
    `;
  },

  renderTrueFalseOptions(q, userAns) {
    const letters = ['a', 'b', 'c', 'd'];
    const isAnswered = !!userAns;
    const correctParts = (q.answer || 'Đ,Đ,Đ,Đ').split(',');

    return `
      <div class="mb-6 space-y-4 w-full">
        <p class="text-xs text-slate-500 dark:text-slate-400 italic">
          * Chọn Đúng (Đ) hoặc Sai (S) cho từng ý dưới đây:
        </p>

        <div class="space-y-3.5 w-full">
          ${q.options.map((opt, idx) => {
            const letter = letters[idx];
            const correctVal = correctParts[idx] || 'Đ';
            const userChoice = userAns ? userAns.choices[idx] : (this.tempTfChoices?.[q.id]?.[idx] || null);

            return `
              <div class="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-start gap-2.5 flex-1 pr-2">
                  <span class="font-bold text-blue-600 dark:text-blue-400 shrink-0">${letter})</span>
                  <span class="break-words leading-relaxed">${escapeHtml(opt)}</span>
                </div>
                
                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button data-tf-qid="${q.id}" data-tf-idx="${idx}" data-val="Đ" ${isAnswered ? 'disabled' : ''} class="tf-btn px-4 py-1.5 rounded-lg text-xs font-bold transition border ${userChoice === 'Đ' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-blue-400'}">
                    Đúng
                  </button>
                  <button data-tf-qid="${q.id}" data-tf-idx="${idx}" data-val="S" ${isAnswered ? 'disabled' : ''} class="tf-btn px-4 py-1.5 rounded-lg text-xs font-bold transition border ${userChoice === 'S' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-rose-400'}">
                    Sai
                  </button>

                  ${isAnswered ? `
                    <span class="ml-2 text-xs font-bold ${userChoice === correctVal ? 'text-emerald-500' : 'text-rose-500'}">
                      (Đ/A: ${correctVal})
                    </span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${!isAnswered ? `
          <div class="pt-2 flex justify-end">
            <button data-check-tf="${q.id}" class="btn-check-tf px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition">
              <i class="fa-solid fa-check-double mr-1.5"></i>Kiểm tra đáp án
            </button>
          </div>
        ` : `
          <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 text-sm">
            <span class="font-bold">Kết quả:</span> Bạn trả lời đúng ${userAns.correctSubCount} / 4 ý. 
            Điểm theo quy chế Bộ GD&ĐT: <span class="font-bold text-blue-600 dark:text-blue-400">${userAns.points} / 1.0 điểm</span>.
          </div>
        `}
      </div>
    `;
  },

  renderShortAnswerInput(q, userAns) {
    const isAnswered = !!userAns;

    return `
      <div class="mb-6 space-y-4">
        <p class="text-xs text-slate-500 dark:text-slate-400 italic">
          * Nhập câu trả lời ngắn (số hoặc từ khóa chính xác):
        </p>

        <div class="flex items-center gap-3">
          <input type="text" data-tln-input="${q.id}" ${isAnswered ? 'disabled' : ''} value="${escapeHtml(userAns ? userAns.input : (this.tempTlnInputs?.[q.id] || ''))}" placeholder="Nhập câu trả lời của bạn..." class="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          
          ${!isAnswered ? `
            <button data-check-tln="${q.id}" class="btn-check-tln px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition">
              Kiểm tra
            </button>
          ` : ''}
        </div>

        ${isAnswered ? `
          <div class="p-4 rounded-xl ${userAns.isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'} text-sm">
            <div class="font-bold flex items-center gap-2 mb-1">
              <i class="${userAns.isCorrect ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-xmark text-rose-500'}"></i>
              ${userAns.isCorrect ? 'Chính xác tuyệt đối!' : `Chưa chính xác!`}
            </div>
            <div>Đáp án chuẩn là: <span class="font-bold font-mono px-2 py-0.5 bg-black/10 rounded">${escapeHtml(q.answer)}</span></div>
          </div>
        ` : ''}
      </div>
    `;
  },

  renderListQuestions() {
    const total = this.filteredQuestions.length;
    // Hiển thị dạng danh sách (phân trang 25 câu)
    const pageSize = 25;
    const pageCount = Math.ceil(total / pageSize);
    const currentPage = Math.floor(this.currentIndex / pageSize);
    const start = currentPage * pageSize;
    const end = Math.min(start + pageSize, total);
    const pageQuestions = this.filteredQuestions.slice(start, end);

    this.container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 class="text-base font-bold text-slate-800 dark:text-white">
            Danh sách câu hỏi ôn tập (${total} câu)
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Hiển thị từ câu ${start + 1} đến ${end}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center bg-slate-100 dark:bg-slate-700 rounded-xl p-1 text-xs">
            <button id="btn-view-single" class="px-2.5 py-1 rounded-lg ${this.viewMode === 'single' ? 'bg-white dark:bg-slate-800 shadow text-blue-600 font-bold' : 'text-slate-500'}">
              <i class="fa-regular fa-square mr-1"></i>Thẻ
            </button>
            <button id="btn-view-list" class="px-2.5 py-1 rounded-lg ${this.viewMode === 'list' ? 'bg-white dark:bg-slate-800 shadow text-blue-600 font-bold' : 'text-slate-500'}">
              <i class="fa-solid fa-list mr-1"></i>Danh sách
            </button>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        ${pageQuestions.map((q, idx) => {
          const globalIdx = start + idx;
          const userAns = this.userAnswers[q.id];
          const isBookmarked = Storage.isBookmarked(q.id);

          return `
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6" id="q-card-${q.id}">
              <div class="flex items-center justify-between gap-3 mb-3">
                <div class="flex items-center gap-2">
                  <span class="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    ${globalIdx + 1}
                  </span>
                  <span class="text-xs px-2.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-medium">
                    Khối ${q.grade}
                  </span>
                  ${this.getLevelBadge(q.level)}
                </div>

                <button data-bookmark-id="${q.id}" class="btn-list-bookmark p-1.5 rounded-lg text-slate-400 hover:text-amber-500">
                  <i class="${isBookmarked ? 'fa-solid text-amber-500' : 'fa-regular'} fa-bookmark"></i>
                </button>
              </div>

              <h3 class="text-sm sm:text-base font-bold text-slate-800 dark:text-white mb-4">
                ${escapeHtml(q.question)}
              </h3>

              ${q.level in { '1': 1, '2': 1, '3': 1, '4': 1 } ? this.renderMCQOptions(q, userAns) : (q.level === 'DS' ? this.renderTrueFalseOptions(q, userAns) : this.renderShortAnswerInput(q, userAns))}
              ${this.renderPersonalNoteBox(q)}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Phân trang -->
      ${pageCount > 1 ? `
        <div class="mt-8 flex items-center justify-center gap-2">
          <button id="btn-list-prev-page" ${currentPage === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40">
            <i class="fa-solid fa-chevron-left mr-1"></i>Trang trước
          </button>
          <span class="text-xs text-slate-500 font-medium px-3">
            Trang ${currentPage + 1} / ${pageCount}
          </span>
          <button id="btn-list-next-page" ${currentPage === pageCount - 1 ? 'disabled' : ''} class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40">
            Trang sau <i class="fa-solid fa-chevron-right ml-1"></i>
          </button>
        </div>
      ` : ''}
    `;

    this.bindEventsList(pageQuestions, currentPage, pageSize);
  },

  renderPersonalNoteBox(q) {
    const note = Storage.getQuestionNote(q.id);
    return `
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400 font-medium flex items-center gap-1.5">
            <i class="fa-regular fa-note-sticky text-amber-500"></i>
            ${note ? `<span class="text-slate-700 dark:text-slate-200 font-semibold">Ghi chú của tôi:</span> <span class="italic text-amber-700 dark:text-amber-300">${escapeHtml(note)}</span>` : 'Chưa có ghi chú cá nhân cho câu này'}
          </span>
          <button type="button" data-edit-note="${escapeHtml(q.id)}" class="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 ml-2">
            <i class="fa-solid fa-pen-clip mr-1"></i>${note ? 'Sửa ghi chú' : 'Thêm ghi chú'}
          </button>
        </div>
      </div>
    `;
  },

  bindNoteButtons() {
    if (!this.container) return;
    this.container.querySelectorAll('[data-edit-note]').forEach(btn => {
      btn.onclick = () => {
        const qId = btn.getAttribute('data-edit-note');
        const currentNote = Storage.getQuestionNote(qId);
        const updated = prompt('Nhập ghi chú cá nhân / mẹo nhớ nhanh cho câu hỏi này (để trống nếu muốn xóa):', currentNote);
        if (updated !== null) {
          Storage.saveQuestionNote(qId, updated);
          this.render();
        }
      };
    });
  },

  getLevelBadge(level) {
    const map = {
      '1': { label: 'Nhận biết', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
      '2': { label: 'Thông hiểu', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
      '3': { label: 'Vận dụng', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
      '4': { label: 'Vận dụng cao', cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
      'DS': { label: 'Đúng / Sai', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
      'TLN': { label: 'Trả lời ngắn', cls: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300' }
    };
    const item = map[level] || { label: 'Mức ' + level, cls: 'bg-slate-100 text-slate-700' };
    return `<span class="px-2.5 py-0.5 rounded-lg text-xs font-semibold ${item.cls}">${item.label}</span>`;
  },

  handleCheckTf(qId) {
    const q = this.filteredQuestions.find(item => item.id === qId);
    if (!q || this.userAnswers[qId]) return;

    const choices = this.tempTfChoices[qId] || ['', '', '', ''];
    const correctParts = (q.answer || 'Đ,Đ,Đ,Đ').split(',');
    let correctSubCount = 0;
    for (let i = 0; i < 4; i++) {
      if (choices[i] && choices[i] === correctParts[i]) {
        correctSubCount++;
      }
    }
    // Thang điểm Bộ GD: 1 ý = 0.1, 2 ý = 0.25, 3 ý = 0.5, 4 ý = 1.0
    const pointMap = [0, 0.1, 0.25, 0.5, 1.0];
    const points = pointMap[correctSubCount];

    this.userAnswers[qId] = {
      choices: [...choices],
      correctSubCount,
      points,
      isCorrect: correctSubCount === 4
    };

    this.sessionStats.answered++;
    if (correctSubCount >= 3) this.sessionStats.correct++;
    else this.sessionStats.wrong++;
    Storage.recordPracticeResult(correctSubCount === 4, q);

    this.render();
  },

  handleCheckTln(qId) {
    const q = this.filteredQuestions.find(item => item.id === qId);
    if (!q || this.userAnswers[qId]) return;

    const inputEl = this.container.querySelector(`[data-tln-input="${qId}"]`);
    const val = inputEl ? inputEl.value.trim() : (this.tempTlnInputs?.[qId]?.trim() || '');
    if (!val) return;
    const normUser = val.toLowerCase().replace(/\s+/g, '');
    const normAns = (q.answer || '').toLowerCase().replace(/\s+/g, '');
    const isCorrect = (normUser === normAns);

    this.userAnswers[qId] = { input: val, isCorrect };
    this.sessionStats.answered++;
    if (isCorrect) this.sessionStats.correct++;
    else this.sessionStats.wrong++;
    Storage.recordPracticeResult(isCorrect, q);

    this.render();
  },

  bindEventsSingle(q) {
    // Bookmark
    const bmBtn = this.container.querySelector('#btn-toggle-bookmark');
    if (bmBtn) {
      bmBtn.addEventListener('click', () => {
        Storage.toggleBookmark(q);
        this.render();
      });
    }

    // View toggle
    const btnSingle = this.container.querySelector('#btn-view-single');
    const btnList = this.container.querySelector('#btn-view-list');
    if (btnSingle) btnSingle.addEventListener('click', () => { this.viewMode = 'single'; this.render(); });
    if (btnList) btnList.addEventListener('click', () => { this.viewMode = 'list'; this.render(); });

    // Prev / Next buttons
    const prevBtn = this.container.querySelector('#btn-prev-q');
    const nextBtn = this.container.querySelector('#btn-next-q');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (this.currentIndex > 0) { this.currentIndex--; this.render(); } });
    if (nextBtn) nextBtn.addEventListener('click', () => { if (this.currentIndex < this.filteredQuestions.length - 1) { this.currentIndex++; this.render(); } });

    // Phím tắt mũi tên Trái / Phải để chuyển câu
    if (!this._onPracticeKeyDown) {
      this._onPracticeKeyDown = (e) => {
        if (this.viewMode !== 'single') return;
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;

        if (e.key === 'ArrowLeft') {
          if (this.currentIndex > 0) {
            e.preventDefault();
            this.currentIndex--;
            this.render();
          }
        } else if (e.key === 'ArrowRight') {
          if (this.currentIndex < this.filteredQuestions.length - 1) {
            e.preventDefault();
            this.currentIndex++;
            this.render();
          }
        }
      };
      window.addEventListener('keydown', this._onPracticeKeyDown);
    }

    // MCQ answer choice
    const mcqBtns = this.container.querySelectorAll('.mcq-option-btn');
    mcqBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = btn.getAttribute('data-opt');
        const correctAns = q.displayAnswer || q.answer || 'A';
        const isCorrect = (chosen === correctAns);
        this.userAnswers[q.id] = { chosen, isCorrect };
        
        this.sessionStats.answered++;
        if (isCorrect) this.sessionStats.correct++;
        else this.sessionStats.wrong++;
        Storage.recordPracticeResult(isCorrect, q);

        this.render();
      });
    });

    // True / False mode
    this.container.querySelectorAll('[data-tf-qid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-tf-qid');
        const idx = parseInt(btn.getAttribute('data-tf-idx'), 10);
        const val = btn.getAttribute('data-val');
        if (!this.tempTfChoices[qid]) this.tempTfChoices[qid] = ['', '', '', ''];
        this.tempTfChoices[qid][idx] = val;

        this.container.querySelectorAll(`[data-tf-qid="${qid}"][data-tf-idx="${idx}"]`).forEach(b => {
          b.classList.remove('bg-blue-600', 'bg-rose-600', 'text-white');
          b.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
        });
        btn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
        btn.classList.add(val === 'Đ' ? 'bg-blue-600' : 'bg-rose-600', 'text-white');
      });
    });

    const checkTfBtn = this.container.querySelector(`[data-check-tf="${q.id}"]`);
    if (checkTfBtn) {
      checkTfBtn.addEventListener('click', () => {
        this.handleCheckTf(q.id);
      });
    }

    // Short answer check
    const checkTlnBtn = this.container.querySelector(`[data-check-tln="${q.id}"]`);
    const tlnInput = this.container.querySelector(`[data-tln-input="${q.id}"]`);
    if (tlnInput) {
      tlnInput.addEventListener('input', (e) => {
        if (!this.tempTlnInputs) this.tempTlnInputs = {};
        this.tempTlnInputs[q.id] = e.target.value;
      });
      tlnInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleCheckTln(q.id);
      });
    }
    if (checkTlnBtn) {
      checkTlnBtn.addEventListener('click', () => {
        this.handleCheckTln(q.id);
      });
    }

    this.bindNoteButtons();
  },

  bindEventsList(questions, currentPage, pageSize) {
    const btnSingle = this.container.querySelector('#btn-view-single');
    const btnList = this.container.querySelector('#btn-view-list');
    if (btnSingle) btnSingle.addEventListener('click', () => { this.viewMode = 'single'; this.render(); });
    if (btnList) btnList.addEventListener('click', () => { this.viewMode = 'list'; this.render(); });

    const prevPageBtn = this.container.querySelector('#btn-list-prev-page');
    const nextPageBtn = this.container.querySelector('#btn-list-next-page');
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => {
      this.currentIndex = Math.max(0, (currentPage - 1) * pageSize);
      this.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => {
      this.currentIndex = Math.min(this.filteredQuestions.length - 1, (currentPage + 1) * pageSize);
      this.render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bookmarks in list
    this.container.querySelectorAll('.btn-list-bookmark').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-bookmark-id');
        const targetQ = questions.find(item => item.id === qId);
        if (targetQ) {
          Storage.toggleBookmark(targetQ);
          this.render();
        }
      });
    });

    // MCQ clicks in list
    this.container.querySelectorAll('.mcq-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[id^="q-card-"]');
        if (!card) return;
        const qId = card.id.replace('q-card-', '');
        const targetQ = this.filteredQuestions.find(item => item.id === qId);
        if (!targetQ || this.userAnswers[qId]) return;

        const chosen = btn.getAttribute('data-opt');
        const correctAns = targetQ.displayAnswer || targetQ.answer || 'A';
        const isCorrect = (chosen === correctAns);
        this.userAnswers[qId] = { chosen, isCorrect };

        this.sessionStats.answered++;
        if (isCorrect) this.sessionStats.correct++;
        else this.sessionStats.wrong++;
        Storage.recordPracticeResult(isCorrect, targetQ);

        this.render();
      });
    });

    // True / False mode in list
    this.container.querySelectorAll('[data-tf-qid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-tf-qid');
        const idx = parseInt(btn.getAttribute('data-tf-idx'), 10);
        const val = btn.getAttribute('data-val');
        if (!this.tempTfChoices[qid]) this.tempTfChoices[qid] = ['', '', '', ''];
        this.tempTfChoices[qid][idx] = val;

        const card = btn.closest(`[id="q-card-${qid}"]`);
        if (card) {
          card.querySelectorAll(`[data-tf-qid="${qid}"][data-tf-idx="${idx}"]`).forEach(b => {
            b.classList.remove('bg-blue-600', 'bg-rose-600', 'text-white');
            b.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
          });
          btn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
          btn.classList.add(val === 'Đ' ? 'bg-blue-600' : 'bg-rose-600', 'text-white');
        }
      });
    });

    this.container.querySelectorAll('[data-check-tf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-check-tf');
        this.handleCheckTf(qid);
      });
    });

    // Short answer check in list
    this.container.querySelectorAll('[data-tln-input]').forEach(input => {
      const qid = input.getAttribute('data-tln-input');
      input.addEventListener('input', (e) => {
        if (!this.tempTlnInputs) this.tempTlnInputs = {};
        this.tempTlnInputs[qid] = e.target.value;
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleCheckTln(qid);
      });
    });

    this.container.querySelectorAll('[data-check-tln]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-check-tln');
        this.handleCheckTln(qid);
      });
    });

    this.bindNoteButtons();
  }
};

