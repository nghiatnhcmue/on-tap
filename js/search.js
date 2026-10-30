/**
 * tinhoc-hub: Search & Question Bank Explorer
 * Tra cứu nhanh từ khóa trong toàn bộ 4.400+ câu hỏi ngân hàng đề Tin học
 */

import { Storage } from './storage.js?v=20261030_47';
import { escapeHtml } from './utils.js?v=20261030_47';

export const Search = {
  allQuestions: [],
  filteredQuestions: [],
  currentPage: 0,
  pageSize: 20,
  currentQuery: '',
  currentGrade: 'all',
  currentLevel: 'all',

  init(containerEl, allQuestions) {
    this.container = containerEl;
    this.allQuestions = allQuestions;
    this.filteredQuestions = [...allQuestions];
    this.currentPage = 0;
  },

  setQuestions(questions) {
    this.allQuestions = questions;
    this.applyFilter();
  },

  applyFilter() {
    let result = this.allQuestions;

    // Filter Grade
    if (this.currentGrade !== 'all') {
      result = result.filter(q => q.grade === this.currentGrade);
    }

    // Filter Level
    if (this.currentLevel !== 'all') {
      result = result.filter(q => q.level === this.currentLevel);
    }

    // Filter Keyword Query
    if (this.currentQuery.trim()) {
      const qLower = this.currentQuery.toLowerCase().trim();
      result = result.filter(q => {
        if (q.question.toLowerCase().includes(qLower)) return true;
        if (q.options && q.options.some(opt => opt && opt.toLowerCase().includes(qLower))) return true;
        if (q.lesson && q.lesson.toLowerCase().includes(qLower)) return true;
        if (q.topic && q.topic.toLowerCase().includes(qLower)) return true;
        return false;
      });
    }

    this.filteredQuestions = result;
    this.currentPage = 0;
    this.render();
  },

  render() {
    if (!this.container) return;

    const activeEl = document.activeElement;
    const isSearchFocused = activeEl && activeEl.id === 'search-input';
    const selStart = isSearchFocused ? activeEl.selectionStart : null;
    const selEnd = isSearchFocused ? activeEl.selectionEnd : null;

    const total = this.filteredQuestions.length;
    const pageCount = Math.ceil(total / this.pageSize);
    const start = this.currentPage * this.pageSize;
    const end = Math.min(start + this.pageSize, total);
    const pageItems = this.filteredQuestions.slice(start, end);

    this.container.innerHTML = `
      <!-- Thanh tìm kiếm & bộ lọc -->
      <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <div class="max-w-3xl mx-auto space-y-4">
          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-input" value="${escapeHtml(this.currentQuery)}" placeholder="Tìm kiếm từ khóa (ví dụ: Python, HTML, nhị phân, thuật toán, biến...)" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" />
            ${this.currentQuery ? `
              <button id="btn-clear-search" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div class="flex flex-wrap items-center gap-3">
              <!-- Lọc khối -->
              <select id="search-grade-select" class="px-3.5 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500">
                <option value="all" ${this.currentGrade === 'all' ? 'selected' : ''}>Tất cả các khối</option>
                <option value="10" ${this.currentGrade === '10' ? 'selected' : ''}>Tin học Lớp 10</option>
                <option value="11" ${this.currentGrade === '11' ? 'selected' : ''}>Tin học Lớp 11</option>
                <option value="12" ${this.currentGrade === '12' ? 'selected' : ''}>Tin học Lớp 12</option>
              </select>

              <!-- Lọc mức độ -->
              <select id="search-level-select" class="px-3.5 py-2 bg-slate-100 dark:bg-slate-700 border-none rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500">
                <option value="all" ${this.currentLevel === 'all' ? 'selected' : ''}>Tất cả mức độ</option>
                <option value="1" ${this.currentLevel === '1' ? 'selected' : ''}>Nhận biết</option>
                <option value="2" ${this.currentLevel === '2' ? 'selected' : ''}>Thông hiểu</option>
                <option value="3" ${this.currentLevel === '3' ? 'selected' : ''}>Vận dụng</option>
                <option value="4" ${this.currentLevel === '4' ? 'selected' : ''}>Vận dụng cao</option>
                <option value="DS" ${this.currentLevel === 'DS' ? 'selected' : ''}>Đúng / Sai</option>
              </select>
            </div>

            <div class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Tìm thấy <span class="text-blue-600 dark:text-blue-400 font-bold">${total}</span> câu hỏi
            </div>
          </div>
        </div>
      </div>

      <!-- Danh sách kết quả -->
      ${total === 0 ? `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
          <i class="fa-solid fa-file-circle-question text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">Không tìm thấy câu hỏi nào</h3>
          <p class="text-xs text-slate-400 mt-1">Hãy thử tìm với từ khóa khác hoặc bỏ bớt các bộ lọc.</p>
        </div>
      ` : `
        <div class="space-y-4 mb-8">
          ${pageItems.map((q, idx) => {
            const globalIdx = start + idx + 1;
            const isBookmarked = Storage.isBookmarked(q.id);

            return `
              <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 transition">
                <div class="flex items-center justify-between gap-3 mb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center">
                      ${globalIdx}
                    </span>
                    <span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                      Khối ${escapeHtml(q.grade)}
                    </span>
                    <span class="text-xs text-slate-400 hidden sm:inline-block">${escapeHtml(q.lesson || '')}</span>
                  </div>

                  <button data-search-bm="${escapeHtml(q.id)}" class="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 transition">
                    <i class="${isBookmarked ? 'fa-solid text-amber-500' : 'fa-regular'} fa-bookmark"></i>
                  </button>
                </div>

                <h4 class="text-sm sm:text-base font-bold text-slate-800 dark:text-white leading-relaxed mb-3">
                  ${this.highlightKeyword(q.question, this.currentQuery)}
                </h4>

                <!-- Tùy loại câu hỏi -->
                ${['1', '2', '3', '4'].includes(q.level) ? `
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${q.options.map((opt, oIdx) => {
                      const letter = ['A', 'B', 'C', 'D'][oIdx];
                      const isCorrect = (letter === q.answer);
                      return `
                        <div class="p-2.5 rounded-xl border ${isCorrect ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'} flex items-start gap-2">
                          <span class="font-bold">${letter}.</span>
                          <span>${this.highlightKeyword(opt, this.currentQuery)}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : (q.level === 'DS' ? `
                  <div class="text-xs space-y-1 bg-slate-50 dark:bg-slate-750 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span class="font-bold text-purple-600 dark:text-purple-400 block mb-1">Đáp án Đúng/Sai: ${escapeHtml(q.answer)}</span>
                    ${q.options.map((opt, oIdx) => `
                      <div><b>${['a', 'b', 'c', 'd'][oIdx]})</b> ${this.highlightKeyword(opt, this.currentQuery)}</div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700">
                    <span class="text-slate-500">Đáp án chuẩn:</span> <b class="text-emerald-600 font-mono">${escapeHtml(q.answer)}</b>
                  </div>
                `)}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Phân trang -->
        ${pageCount > 1 ? `
          <div class="flex items-center justify-center gap-2">
            <button id="btn-search-prev" ${this.currentPage === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40">
              <i class="fa-solid fa-chevron-left mr-1"></i>Trang trước
            </button>
            <span class="text-xs text-slate-500 font-medium px-3">
              Trang ${this.currentPage + 1} / ${pageCount}
            </span>
            <button id="btn-search-next" ${this.currentPage === pageCount - 1 ? 'disabled' : ''} class="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40">
              Trang sau <i class="fa-solid fa-chevron-right ml-1"></i>
            </button>
          </div>
        ` : ''}
      `}
    `;

    if (isSearchFocused) {
      const newSearchInput = this.container.querySelector('#search-input');
      if (newSearchInput) {
        newSearchInput.focus();
        if (selStart !== null && selEnd !== null) {
          try { newSearchInput.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }

    this.bindEvents();
  },

  highlightKeyword(text, kw) {
    if (!text) return '';
    const safeText = escapeHtml(text);
    if (!kw || !kw.trim()) return safeText;
    try {
      const safeKw = escapeHtml(kw.trim());
      const escaped = safeKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      return safeText.replace(regex, '<mark class="bg-amber-200 dark:bg-amber-900/60 text-slate-900 dark:text-white px-0.5 rounded">$1</mark>');
    } catch (e) {
      return safeText;
    }
  },

  bindEvents() {
    const input = this.container.querySelector('#search-input');
    if (input) {
      let timer = null;
      input.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.currentQuery = e.target.value;
          this.applyFilter();
        }, 250);
      });
    }

    const clearBtn = this.container.querySelector('#btn-clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.currentQuery = '';
        this.applyFilter();
      });
    }

    const gradeSelect = this.container.querySelector('#search-grade-select');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', (e) => {
        this.currentGrade = e.target.value;
        this.applyFilter();
      });
    }

    const levelSelect = this.container.querySelector('#search-level-select');
    if (levelSelect) {
      levelSelect.addEventListener('change', (e) => {
        this.currentLevel = e.target.value;
        this.applyFilter();
      });
    }

    const prevBtn = this.container.querySelector('#btn-search-prev');
    const nextBtn = this.container.querySelector('#btn-search-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 0) {
          this.currentPage--;
          this.render();
          window.scrollTo({ top: 100, behavior: 'smooth' });
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const total = this.filteredQuestions.length;
        const pageCount = Math.ceil(total / this.pageSize);
        if (this.currentPage < pageCount - 1) {
          this.currentPage++;
          this.render();
          window.scrollTo({ top: 100, behavior: 'smooth' });
        }
      });
    }

    // Bookmark toggles
    this.container.querySelectorAll('[data-search-bm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-search-bm');
        const q = this.allQuestions.find(item => item.id === qId);
        if (q) {
          Storage.toggleBookmark(q);
          this.render();
        }
      });
    });
  }
};

