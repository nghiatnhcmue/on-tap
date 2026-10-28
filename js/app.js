/**
 * TIN HỌC HUB - MASTER APP CONTROLLER
 * Hệ thống Ôn tập & Thi thử Tin học THPT - Chuẩn GDPT 2018
 */

import { Storage } from './storage.js';
import { Practice } from './practice.js';
import { Exam } from './exam.js';
import { Search } from './search.js';
import { PrintManager } from './print.js';

class App {
  constructor() {
    this.manifest = null;
    this.currentGrade = '12';
    this.gradeCache = {};
    this.currentTab = 'home';
  }

  async init() {
    this.initTheme();
    this.bindGlobalEvents();
    await this.loadManifest();
    await this.switchGrade(this.currentGrade);
    this.renderHome();
  }

  // --- THEME ---
  initTheme() {
    const settings = Storage.getSettings();
    if (settings.theme === 'dark' || (!settings.theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const themeToggleBtn = document.getElementById('btn-toggle-theme');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        Storage.saveSettings({ theme: isDark ? 'dark' : 'light' });
      });
    }
  }

  // --- DATA LOADING ---
  async loadManifest() {
    try {
      const res = await fetch('data/manifest.json');
      this.manifest = await res.json();
      this.updateManifestBadges();
    } catch (e) {
      console.error('Không thể nạp file manifest.json', e);
    }
  }

  async loadGradeData(grade) {
    if (this.gradeCache[grade]) {
      return this.gradeCache[grade];
    }
    this.showGlobalLoading(true);
    try {
      const res = await fetch(`data/grade_${grade}.json`);
      const data = await res.json();
      this.gradeCache[grade] = data;
      this.showGlobalLoading(false);
      return data;
    } catch (e) {
      this.showGlobalLoading(false);
      console.error(`Không thể nạp dữ liệu Khối ${grade}`, e);
      return [];
    }
  }

  showGlobalLoading(show) {
    const loader = document.getElementById('global-loading');
    if (loader) {
      loader.classList.toggle('hidden', !show);
    }
  }

  updateManifestBadges() {
    if (!this.manifest) return;
    const totalEl = document.getElementById('stat-total-q');
    if (totalEl) totalEl.textContent = this.manifest.total_questions.toLocaleString('vi-VN');

    const k10 = document.getElementById('stat-k10-q');
    if (k10 && this.manifest.grades['10']) k10.textContent = this.manifest.grades['10'].total;

    const k11 = document.getElementById('stat-k11-q');
    if (k11 && this.manifest.grades['11']) k11.textContent = this.manifest.grades['11'].total;

    const k12 = document.getElementById('stat-k12-q');
    if (k12 && this.manifest.grades['12']) k12.textContent = this.manifest.grades['12'].total;
  }

  async switchGrade(grade) {
    this.currentGrade = grade;

    // Cập nhật giao diện nút chọn khối trên navbar
    document.querySelectorAll('[data-nav-grade]').forEach(btn => {
      const g = btn.getAttribute('data-nav-grade');
      if (g === grade) {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-sm';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
      }
    });

    const questions = await this.loadGradeData(grade);

    // Cập nhật cho các module
    if (this.currentTab === 'practice') {
      this.initPracticeView();
    } else if (this.currentTab === 'home') {
      this.renderHome();
    }
  }

  // --- ROUTING / TABS ---
  async switchTab(tab) {
    this.currentTab = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Cập nhật trạng thái active của menu
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const target = btn.getAttribute('data-tab-target');
      if (target === tab) {
        btn.classList.add('text-blue-600', 'dark:text-blue-400', 'font-bold');
        btn.classList.remove('text-slate-600', 'dark:text-slate-300', 'font-medium');
      } else {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400', 'font-bold');
        btn.classList.add('text-slate-600', 'dark:text-slate-300', 'font-medium');
      }
    });

    // Ẩn tất cả view
    const views = ['view-home', 'view-practice', 'view-exam-setup', 'view-exam-room', 'view-search', 'view-bookmarks', 'view-history', 'view-print'];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    // Hiển thị view tương ứng
    switch (tab) {
      case 'home':
        document.getElementById('view-home')?.classList.remove('hidden');
        this.renderHome();
        break;
      case 'practice':
        document.getElementById('view-practice')?.classList.remove('hidden');
        await this.initPracticeView();
        break;
      case 'exam-setup':
        document.getElementById('view-exam-setup')?.classList.remove('hidden');
        this.renderExamSetup();
        break;
      case 'exam-room':
        document.getElementById('view-exam-room')?.classList.remove('hidden');
        break;
      case 'search':
        document.getElementById('view-search')?.classList.remove('hidden');
        await this.initSearchView();
        break;
      case 'bookmarks':
        document.getElementById('view-bookmarks')?.classList.remove('hidden');
        this.renderBookmarks();
        break;
      case 'history':
        document.getElementById('view-history')?.classList.remove('hidden');
        this.renderHistory();
        break;
      case 'print':
        document.getElementById('view-print')?.classList.remove('hidden');
        this.renderPrintSetup();
        break;
    }
  }

  // --- HOME VIEW ---
  renderHome() {
    const stats = Storage.getPracticeStats();
    const history = Storage.getExamHistory();
    const bookmarks = Storage.getBookmarks();

    const homeStatsContainer = document.getElementById('home-user-stats');
    if (homeStatsContainer) {
      homeStatsContainer.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-list-check"></i>
            </div>
            <div>
              <span class="text-xs text-slate-400 block font-medium">Đã luyện tập</span>
              <span class="text-xl font-black text-slate-800 dark:text-white">${stats.total} câu</span>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-bullseye"></i>
            </div>
            <div>
              <span class="text-xs text-slate-400 block font-medium">Tỷ lệ đúng</span>
              <span class="text-xl font-black text-emerald-600 dark:text-emerald-400">
                ${stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%
              </span>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-graduation-cap"></i>
            </div>
            <div>
              <span class="text-xs text-slate-400 block font-medium">Đề đã thi</span>
              <span class="text-xl font-black text-purple-600 dark:text-purple-400">${history.length} đề</span>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-bookmark"></i>
            </div>
            <div>
              <span class="text-xs text-slate-400 block font-medium">Câu đã lưu</span>
              <span class="text-xl font-black text-amber-600 dark:text-amber-400">${bookmarks.length} câu</span>
            </div>
          </div>
        </div>
      `;
    }

    // Render danh sách chủ đề nổi bật của khối hiện tại
    if (this.manifest && this.manifest.grades[this.currentGrade]) {
      const gradeInfo = this.manifest.grades[this.currentGrade];
      const topicsList = Object.values(gradeInfo.topics || {});
      const topicGrid = document.getElementById('home-topics-grid');
      if (topicGrid) {
        topicGrid.innerHTML = topicsList.map(t => `
          <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 transition group flex flex-col justify-between">
            <div>
              <span class="inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 mb-2">
                ${Object.keys(t.lessons || {}).length} bài học
              </span>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-2 mb-2">
                ${t.name}
              </h4>
            </div>
            <div class="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium">${t.total} câu hỏi</span>
              <button data-practice-topic="${t.name}" class="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition flex items-center gap-1">
                Luyện ngay <i class="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
          </div>
        `).join('');

        topicGrid.querySelectorAll('[data-practice-topic]').forEach(btn => {
          btn.addEventListener('click', () => {
            const topic = btn.getAttribute('data-practice-topic');
            this.switchTab('practice');
            setTimeout(() => {
              const topicSelect = document.getElementById('practice-topic-select');
              if (topicSelect) {
                topicSelect.value = topic;
                topicSelect.dispatchEvent(new Event('change'));
              }
            }, 100);
          });
        });
      }
    }
  }

  // --- PRACTICE VIEW ---
  async initPracticeView() {
    const questions = await this.loadGradeData(this.currentGrade);
    const container = document.getElementById('practice-question-area');
    Practice.init(container, questions, this.manifest);
    this.populatePracticeFilters();
    Practice.setQuestions(questions);
  }

  populatePracticeFilters() {
    const topicSelect = document.getElementById('practice-topic-select');
    const lessonSelect = document.getElementById('practice-lesson-select');
    const gradeSelect = document.getElementById('practice-grade-select');
    const levelSelect = document.getElementById('practice-level-select');

    if (!this.manifest || !this.manifest.grades[this.currentGrade]) return;

    if (gradeSelect) gradeSelect.value = this.currentGrade;

    const gradeData = this.manifest.grades[this.currentGrade];
    const topics = Object.keys(gradeData.topics || {});

    if (topicSelect) {
      topicSelect.innerHTML = `<option value="all">Tất cả chủ đề (${gradeData.total} câu)</option>` +
        topics.map(t => `<option value="${t}">${t} (${gradeData.topics[t].total} câu)</option>`).join('');
    }

    const updateLessons = () => {
      const selTopic = topicSelect ? topicSelect.value : 'all';
      if (lessonSelect) {
        if (selTopic === 'all') {
          lessonSelect.innerHTML = `<option value="all">Tất cả bài học</option>`;
          lessonSelect.disabled = true;
        } else {
          lessonSelect.disabled = false;
          const lessons = Object.keys(gradeData.topics[selTopic]?.lessons || {});
          lessonSelect.innerHTML = `<option value="all">Tất cả bài trong chủ đề này</option>` +
            lessons.map(l => `<option value="${l}">${l}</option>`).join('');
        }
      }
    };

    updateLessons();

    const doFilter = () => {
      const g = gradeSelect ? gradeSelect.value : this.currentGrade;
      const t = topicSelect ? topicSelect.value : 'all';
      const l = lessonSelect ? lessonSelect.value : 'all';
      const lvl = levelSelect ? levelSelect.value : 'all';
      Practice.filter(g, t, l, lvl);
    };

    if (topicSelect) topicSelect.onchange = () => { updateLessons(); doFilter(); };
    if (lessonSelect) lessonSelect.onchange = doFilter;
    if (levelSelect) levelSelect.onchange = doFilter;
    if (gradeSelect) {
      gradeSelect.onchange = async (e) => {
        await this.switchGrade(e.target.value);
        this.populatePracticeFilters();
      };
    }
  }

  // --- EXAM SETUP VIEW ---
  renderExamSetup() {
    const gradeSelect = document.getElementById('exam-cfg-grade');
    if (gradeSelect) gradeSelect.value = this.currentGrade;

    const btnStartBgd = document.getElementById('btn-start-bgd-exam');
    if (btnStartBgd) {
      btnStartBgd.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        await this.startExam({
          type: 'bgd_2025',
          title: `Đề thi thử Tốt nghiệp THPT 2025 môn Tin học - Khối ${grade}`,
          grade,
          duration: 50
        });
      };
    }

    const btnStartCustom = document.getElementById('btn-start-custom-exam');
    if (btnStartCustom) {
      btnStartCustom.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const count = parseInt(document.getElementById('exam-cfg-count')?.value || '30', 10);
        const duration = parseInt(document.getElementById('exam-cfg-duration')?.value || '45', 10);
        const title = `Đề kiểm tra Tin học ${duration} phút - Khối ${grade}`;

        await this.startExam({
          type: 'custom',
          title,
          grade,
          count,
          duration
        });
      };
    }
  }

  async startExam(config) {
    await this.loadGradeData(config.grade);
    const questions = this.gradeCache[config.grade] || [];
    this.switchTab('exam-room');
    const roomEl = document.getElementById('view-exam-room');
    Exam.init(roomEl, questions, this.manifest);
    Exam.generateExam(config);
  }

  // --- SEARCH VIEW ---
  async initSearchView() {
    // Nạp tất cả câu hỏi của 3 khối nếu chưa nạp
    this.showGlobalLoading(true);
    for (const g of ['10', '11', '12']) {
      if (!this.gradeCache[g]) {
        await this.loadGradeData(g);
      }
    }
    this.showGlobalLoading(false);

    const allQ = [
      ...(this.gradeCache['10'] || []),
      ...(this.gradeCache['11'] || []),
      ...(this.gradeCache['12'] || [])
    ];

    const container = document.getElementById('search-results-area');
    Search.init(container, allQ);
    Search.render();
  }

  // --- BOOKMARKS VIEW ---
  renderBookmarks() {
    const bookmarks = Storage.getBookmarks();
    const container = document.getElementById('bookmarks-list-area');
    if (!container) return;

    if (bookmarks.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
          <i class="fa-regular fa-bookmark text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">Chưa có câu hỏi nào được lưu</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Trong quá trình ôn tập hoặc thi thử, bấm vào biểu tượng Bookmark trên câu hỏi để lưu vào đây xem lại.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-base font-bold text-slate-800 dark:text-white">
          Danh sách câu hỏi đã lưu (${bookmarks.length} câu)
        </h3>
        <button id="btn-practice-bookmarks" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
          <i class="fa-solid fa-play"></i> Luyện tập ngay các câu này
        </button>
      </div>

      <div class="space-y-4">
        ${bookmarks.map((q, idx) => `
          <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
            <div class="flex items-center justify-between gap-3 mb-2">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-md bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">
                  ${idx + 1}
                </span>
                <span class="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                  Khối ${q.grade}
                </span>
                <span class="text-xs text-slate-400">${q.lesson}</span>
              </div>

              <button data-remove-bm="${q.id}" class="text-xs text-rose-500 hover:text-rose-700 font-bold p-1">
                <i class="fa-solid fa-trash-can mr-1"></i>Xóa
              </button>
            </div>

            <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-3">
              ${q.question}
            </h4>

            ${['1', '2', '3', '4'].includes(q.level) && q.options ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                ${q.options.map((opt, oIdx) => {
                  const letter = ['A', 'B', 'C', 'D'][oIdx];
                  const isCorrect = (letter === q.answer);
                  return `
                    <div class="p-2 rounded-lg border ${isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 text-slate-600'}">
                      ${letter}. ${opt}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="text-xs text-emerald-600 font-bold">Đáp án: ${q.answer}</div>
            `}
          </div>
        `).join('')}
      </div>
    `;

    // Remove buttons
    container.querySelectorAll('[data-remove-bm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-remove-bm');
        Storage.removeBookmark(id);
        this.renderBookmarks();
      });
    });

    // Practice bookmarks
    const practiceBmBtn = container.querySelector('#btn-practice-bookmarks');
    if (practiceBmBtn) {
      practiceBmBtn.addEventListener('click', () => {
        this.switchTab('practice');
        const practiceArea = document.getElementById('practice-question-area');
        Practice.init(practiceArea, bookmarks, this.manifest);
        Practice.setQuestions(bookmarks);
      });
    }
  }

  // --- HISTORY VIEW ---
  renderHistory() {
    const history = Storage.getExamHistory();
    const container = document.getElementById('history-list-area');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
          <i class="fa-regular fa-clock text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">Chưa có lịch sử thi thử nào</h3>
          <p class="text-xs text-slate-400 mt-1">
            Sau khi hoàn thành bài thi thử, kết quả và phân tích chi tiết sẽ được lưu tự động tại đây.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-base font-bold text-slate-800 dark:text-white">
          Lịch sử thi thử (${history.length} bài thi)
        </h3>
        <button id="btn-clear-history" class="text-xs text-rose-500 hover:text-rose-700 font-bold">
          <i class="fa-solid fa-trash-can mr-1"></i>Xóa lịch sử
        </button>
      </div>

      <div class="space-y-4">
        ${history.map(item => {
          const date = new Date(item.date).toLocaleString('vi-VN');
          const mins = Math.floor(item.timeSpentSeconds / 60);
          const secs = item.timeSpentSeconds % 60;

          return `
            <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span class="text-xs text-slate-400 block mb-1">${date} • Khối ${item.grade}</span>
                <h4 class="text-sm font-bold text-slate-800 dark:text-white">
                  ${item.title}
                </h4>
                <div class="flex items-center gap-3 text-xs text-slate-500 mt-2">
                  <span><i class="fa-regular fa-clock mr-1"></i>${mins}p ${secs}s</span>
                  <span><i class="fa-solid fa-check mr-1 text-emerald-500"></i>${item.correctCount}/${item.totalQuestions} câu đúng</span>
                </div>
              </div>

              <div class="flex items-center gap-4 self-end sm:self-center">
                <div class="text-right">
                  <span class="text-2xl font-black text-blue-600 dark:text-blue-400">${item.score}</span>
                  <span class="text-xs text-slate-400 block font-bold">Điểm</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const clearBtn = container.querySelector('#btn-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thi thử không?')) {
          Storage.clearExamHistory();
          this.renderHistory();
        }
      });
    }
  }

  // --- PRINT EXAM SETUP VIEW ---
  renderPrintSetup() {
    const gradeSelect = document.getElementById('print-cfg-grade');
    if (gradeSelect) gradeSelect.value = this.currentGrade;

    const btnGeneratePrint = document.getElementById('btn-generate-print');
    if (btnGeneratePrint) {
      btnGeneratePrint.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const count = parseInt(document.getElementById('print-cfg-count')?.value || '30', 10);
        const title = document.getElementById('print-cfg-title')?.value || 'ĐỀ THI THỬ MÔN TIN HỌC';
        const school = document.getElementById('print-cfg-school')?.value || 'TRƯỜNG THPT................................';
        const duration = document.getElementById('print-cfg-duration')?.value || '45';
        const includeKey = document.getElementById('print-cfg-include-key')?.checked ?? true;

        await this.loadGradeData(grade);
        const pool = this.gradeCache[grade] || [];
        const sample = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

        PrintManager.generatePrintView({
          title,
          school,
          grade,
          duration,
          questions: sample,
          includeAnswerKey: includeKey
        });
      };
    }
  }

  // --- GLOBAL EVENTS ---
  bindGlobalEvents() {
    // Navigation items
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = btn.getAttribute('data-tab-target');
        this.switchTab(tab);
      });
    });

    // Grade switcher pills
    document.querySelectorAll('[data-nav-grade]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const grade = btn.getAttribute('data-nav-grade');
        await this.switchGrade(grade);
      });
    });

    // Custom nav event
    window.addEventListener('nav-to-tab', (e) => {
      if (e.detail) this.switchTab(e.detail);
    });

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const mobileMenu = document.getElementById('mobile-nav-drawer');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
      mobileMenu.querySelectorAll('[data-tab-target]').forEach(btn => {
        btn.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
        });
      });
    }
  }
}

// Chạy khởi tạo ứng dụng khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  window.AppInstance = new App();
  window.AppInstance.init();
});

