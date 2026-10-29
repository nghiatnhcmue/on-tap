/**
 * TIN HỌC HUB - MASTER APP CONTROLLER
 * Hệ thống Ôn tập & Thi thử Tin học THPT - Chuẩn GDPT 2018
 */

import { Storage } from './storage.js';
import { Practice } from './practice.js';
import { Exam } from './exam.js';
import { Search } from './search.js';
import { PrintManager } from './print.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';
import { Leaderboard } from './leaderboard.js';
import { QuestionsManager } from './questions-manager.js';
import { AdminManager } from './admin-manager.js';
import { ExamRooms } from './exam-rooms.js';
import { Proctor } from './proctor.js';

if (typeof window !== 'undefined') {
  window.Storage = Storage;
  window.Exam = Exam;
  window.Proctor = Proctor;
  window.ExamRooms = ExamRooms;
}

class App {
  constructor() {
    this.manifest = null;
    this.currentGrade = '12';
    this.gradeCache = {};
    this.currentTab = 'home';
  }

  async init() {
    this.initTheme();
    Auth.init();
    this.initAuthUI();
    this.bindGlobalEvents();
    await this.loadManifest();
    await this.switchGrade(this.currentGrade);
    this.renderHome();

    // Tự động nhận diện mã phòng thi qua URL param (?room=XYZ hoặc ?phong=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || urlParams.get('phong');
    if (roomParam) {
      setTimeout(() => {
        this.switchTab('exam-setup');
        const input = document.getElementById('input-enter-room-id');
        if (input) {
          input.value = roomParam.toUpperCase();
          document.getElementById('input-enter-room-pwd')?.focus();
        }
      }, 400);
    }

    // Lắng nghe sự kiện lọc bảng điểm theo phòng thi
    window.addEventListener('filter-gradebook-by-room', async (e) => {
      const roomId = e.detail?.roomId;
      await this.switchTab('gradebook');
      const roomSelect = document.getElementById('gb-filter-room');
      if (roomSelect && roomId) {
        roomSelect.value = roomId;
        roomSelect.dispatchEvent(new Event('change'));
      }
    });
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
    if (!this.rawGradeCache) this.rawGradeCache = {};
    if (this.rawGradeCache[grade]) {
      const customized = Storage.applyCustomizations(grade, this.rawGradeCache[grade]);
      this.gradeCache[grade] = customized;
      return customized;
    }
    this.showGlobalLoading(true);
    try {
      const res = await fetch(`data/grade_${grade}.json`);
      const data = await res.json();
      this.rawGradeCache[grade] = data;
      this.showGlobalLoading(false);
      const customized = Storage.applyCustomizations(grade, data);
      this.gradeCache[grade] = customized;
      return customized;
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
    // Kiểm tra quyền truy cập theo vai trò (RBAC)
    if (tab === 'admin-system' && !Auth.isAdmin()) {
      alert('Chức năng Quản Trị Hệ Thống chỉ dành riêng cho Quản trị viên (Admin)!');
      return;
    }
    if ((tab === 'questions-manage' || tab === 'gradebook' || tab === 'exam-rooms') && !Auth.isTeacher()) {
      alert('Chức năng này dành cho Giáo viên (GV) & Quản trị viên (Admin)!\nHọc sinh vui lòng tham gia thi thử và xem bảng vinh danh.');
      return;
    }

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
    const views = [
      'view-home', 'view-practice', 'view-exam-setup', 'view-exam-room',
      'view-search', 'view-bookmarks', 'view-history', 'view-print',
      'view-gradebook', 'view-leaderboard', 'view-questions-manage', 'view-admin-system',
      'view-exam-rooms'
    ];
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
      case 'exam-rooms':
        document.getElementById('view-exam-rooms')?.classList.remove('hidden');
        ExamRooms.init(document.getElementById('exam-rooms-list-area'));
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
      case 'gradebook':
        document.getElementById('view-gradebook')?.classList.remove('hidden');
        this.renderGradebook();
        break;
      case 'leaderboard':
        document.getElementById('view-leaderboard')?.classList.remove('hidden');
        Leaderboard.init(document.getElementById('leaderboard-area'));
        break;
      case 'questions-manage':
        document.getElementById('view-questions-manage')?.classList.remove('hidden');
        QuestionsManager.init(document.getElementById('questions-manage-area'), this.manifest, (g) => this.loadGradeData(g));
        break;
      case 'admin-system':
        document.getElementById('view-admin-system')?.classList.remove('hidden');
        AdminManager.init(document.getElementById('admin-system-area'));
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

    // Bật tắt xáo trộn câu hỏi và phương án trong Luyện tập
    const pShuffleQ = document.getElementById('practice-cfg-shuffle-questions');
    const pShuffleOpt = document.getElementById('practice-cfg-shuffle-options');
    if (pShuffleQ && pShuffleOpt) {
      const onPracticeShuffleChange = () => {
        Practice.setShuffle(pShuffleQ.checked, pShuffleOpt.checked);
      };
      pShuffleQ.onchange = onPracticeShuffleChange;
      pShuffleOpt.onchange = onPracticeShuffleChange;
    }
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

    // Thiết lập trạng thái toggle theo Storage
    const settings = Storage.getSettings();
    const shuffleQCheckbox = document.getElementById('exam-cfg-shuffle-questions');
    const shuffleOptCheckbox = document.getElementById('exam-cfg-shuffle-options');
    if (shuffleQCheckbox) shuffleQCheckbox.checked = settings.shuffleQuestions ?? true;
    if (shuffleOptCheckbox) shuffleOptCheckbox.checked = settings.shuffleOptions ?? true;

    const getExamShuffleConfig = () => {
      const shuffleQuestions = shuffleQCheckbox ? shuffleQCheckbox.checked : true;
      const shuffleOptions = shuffleOptCheckbox ? shuffleOptCheckbox.checked : true;
      Storage.saveSettings({ shuffleQuestions, shuffleOptions });
      return { shuffleQuestions, shuffleOptions };
    };

    // Vào phòng thi theo mã & mật khẩu (Đợt thi được giao)
    const btnEnterRoom = document.getElementById('btn-enter-room-exam');
    if (btnEnterRoom) {
      btnEnterRoom.onclick = async () => {
        const roomIdInput = document.getElementById('input-enter-room-id');
        const roomPwdInput = document.getElementById('input-enter-room-pwd');
        const roomId = roomIdInput?.value.trim().toUpperCase();
        const pwd = roomPwdInput?.value.trim() || '';

        if (!roomId) {
          alert('Vui lòng nhập Mã phòng thi do Giáo viên cấp!');
          roomIdInput?.focus();
          return;
        }

        const access = Storage.validateRoomAccess(roomId, pwd);
        if (!access.valid) {
          alert(`⚠️ KHÔNG THỂ VÀO THI:\n${access.message}`);
          return;
        }

        const room = access.room;

        // Bắt đầu làm bài thi của phòng
        await this.startExam({
          type: room.type || 'bgd_2025',
          title: room.title,
          grade: room.grade,
          duration: room.duration || 50,
          roomId: room.id,
          roomTitle: room.title,
          shuffleQuestions: room.shuffleQuestions ?? true,
          shuffleOptions: room.shuffleOptions ?? true,
          antiCheat: room.antiCheat || { enabled: false }
        });
      };
    }

    const btnStartBgd = document.getElementById('btn-start-bgd-exam');
    if (btnStartBgd) {
      btnStartBgd.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const { shuffleQuestions, shuffleOptions } = getExamShuffleConfig();
        await this.startExam({
          type: 'bgd_2025',
          title: `Đề thi thử Tốt nghiệp THPT 2025 môn Tin học - Khối ${grade}`,
          grade,
          duration: 50,
          shuffleQuestions,
          shuffleOptions
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
        const { shuffleQuestions, shuffleOptions } = getExamShuffleConfig();

        await this.startExam({
          type: 'custom',
          title,
          grade,
          count,
          duration,
          shuffleQuestions,
          shuffleOptions
        });
      };
    }
  }

  async startExam(config) {
    // Kiểm tra đăng nhập và hồ sơ học sinh bắt buộc
    if (!Auth.isLoggedIn()) {
      alert('Quy định: Vui lòng đăng nhập bằng Google để hệ thống ghi nhận Họ tên, Lớp và Trường của bạn!');
      document.getElementById('modal-login')?.classList.remove('hidden');
      return;
    }
    if (!Auth.isProfileComplete()) {
      alert('Hồ sơ học sinh chưa hoàn tất! Bạn bắt buộc phải điền Họ và tên, Lớp, Trường để tham gia thi.');
      Auth.openRequiredProfileModal();
      return;
    }

    await this.loadGradeData(config.grade);
    let questions = [...(this.gradeCache[config.grade] || [])];

    // Đối với đề chuẩn Bộ GD&ĐT (BGD 2025): Cần 24 câu MCQ + 4 câu Đúng/Sai.
    // Nếu khối đang chọn thiếu câu Đúng/Sai (ví dụ K11), tự động bổ sung câu Đúng/Sai từ K12/K10.
    if (config.type === 'bgd_2025') {
      const dsCount = questions.filter(q => q.level === 'DS').length;
      if (dsCount < 4) {
        await this.loadGradeData('12');
        const ds12 = (this.gradeCache['12'] || []).filter(q => q.level === 'DS');
        if (ds12.length > 0) {
          questions = [...questions, ...ds12];
        }
      }
    }

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
              ${escapeHtml(q.question)}
            </h4>

            ${['1', '2', '3', '4'].includes(q.level) && q.options ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                ${q.options.map((opt, oIdx) => {
                  const letter = ['A', 'B', 'C', 'D'][oIdx];
                  const isCorrect = (letter === q.answer);
                  return `
                    <div class="p-2 rounded-lg border ${isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 text-slate-600'}">
                      ${letter}. ${escapeHtml(opt)}
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="text-xs text-emerald-600 font-bold">Đáp án: ${escapeHtml(q.answer)}</div>
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
                <span class="text-xs text-slate-400 block mb-1">${date} • Khối ${escapeHtml(item.grade)}</span>
                <h4 class="text-sm font-bold text-slate-800 dark:text-white">
                  ${escapeHtml(item.title)}
                </h4>
                <div class="flex items-center gap-3 text-xs text-slate-500 mt-2 flex-wrap">
                  ${item.roomId ? `<span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">Phòng: ${escapeHtml(item.roomId)}</span>` : ''}
                  <span><i class="fa-regular fa-clock mr-1"></i>${mins}p ${secs}s</span>
                  <span><i class="fa-solid fa-check mr-1 text-emerald-500"></i>${item.correctCount}/${item.totalQuestions} câu đúng</span>
                  ${item.isDisqualified ? `
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      <i class="fa-solid fa-ban mr-1"></i>Đình chỉ (${item.violationCount || 0} lần vi phạm)
                    </span>
                  ` : (item.violationCount > 0 ? `
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      <i class="fa-solid fa-triangle-exclamation mr-1"></i>${item.violationCount} lần cảnh báo
                    </span>
                  ` : '')}
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
        const school = document.getElementById('print-cfg-school')?.value || (Auth.currentUser?.school || 'TRƯỜNG THPT................................');
        const duration = document.getElementById('print-cfg-duration')?.value || '45';
        const includeKey = document.getElementById('print-cfg-include-key')?.checked ?? true;
        const shuffleQuestions = document.getElementById('print-cfg-shuffle-questions')?.checked ?? true;
        const shuffleOptions = document.getElementById('print-cfg-shuffle-options')?.checked ?? true;

        await this.loadGradeData(grade);
        const pool = this.gradeCache[grade] || [];
        const sample = shuffleQuestions
          ? [...pool].sort(() => Math.random() - 0.5).slice(0, count)
          : [...pool].slice(0, count);

        PrintManager.generatePrintView({
          title,
          school,
          grade,
          duration,
          studentName: Auth.currentUser?.fullName || '',
          studentClass: Auth.currentUser?.className || '',
          questions: sample,
          includeAnswerKey: includeKey,
          shuffleOptions
        });
      };
    }
  }

  // --- QUẢN LÝ BẢNG ĐIỂM HỌC SINH (GRADEBOOK) ---
  renderGradebook() {
    const history = Storage.getExamHistory();
    const container = document.getElementById('gradebook-list-area');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
          <i class="fa-solid fa-clipboard-list text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
          <h3 class="text-base font-bold text-slate-700 dark:text-slate-300">Chưa có kết quả thi nào trong hệ thống</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Khi học sinh hoàn thành các bài thi thử, điểm số cùng Họ tên, Lớp và Trường sẽ tự động được tổng hợp tại đây.
          </p>
        </div>
      `;
      return;
    }

    // Lấy danh sách lớp, trường và phòng thi duy nhất để làm bộ lọc
    const classes = [...new Set(history.map(item => item.studentClass).filter(Boolean))];
    const schools = [...new Set(history.map(item => item.studentSchool).filter(Boolean))];
    const roomsList = [...new Set(history.map(item => item.roomId).filter(Boolean))];

    container.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-6">
        
        <!-- Header & Action -->
        <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-graduation-cap text-blue-600"></i>
              Bảng Điểm & Quản Lý Kết Quả Học Sinh
            </h3>
            <p class="text-xs text-slate-400">
              Tổng số ${history.length} bài thi đã hoàn thành
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button id="btn-export-gradebook-csv" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
              <i class="fa-solid fa-file-excel"></i> Xuất file Excel (CSV)
            </button>
          </div>
        </div>

        <!-- Bộ lọc lớp & trường & tìm kiếm & phòng thi -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <input type="text" id="gb-filter-search" placeholder="Tìm theo tên học sinh..." class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-medium focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <select id="gb-filter-class" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
              <option value="all">Tất cả các lớp</option>
              ${classes.map(c => `<option value="${c}">Lớp ${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <select id="gb-filter-school" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold">
              <option value="all">Tất cả các trường</option>
              ${schools.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <select id="gb-filter-room" class="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold font-mono">
              <option value="all">Tất cả phòng & tự do</option>
              ${roomsList.map(r => `<option value="${r}">Phòng: ${r}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Bảng danh sách kết quả -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs" id="gradebook-table">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-bold uppercase tracking-wider">
                <th class="py-3 px-3">STT</th>
                <th class="py-3 px-3">Họ và Tên</th>
                <th class="py-3 px-3">Lớp</th>
                <th class="py-3 px-3">Trường</th>
                <th class="py-3 px-3">Phòng thi</th>
                <th class="py-3 px-3">Bài thi</th>
                <th class="py-3 px-3 text-center">Điểm</th>
                <th class="py-3 px-3 text-center">Giám sát vi phạm</th>
                <th class="py-3 px-3">Thời gian</th>
                <th class="py-3 px-3">Ngày thi</th>
              </tr>
            </thead>
            <tbody id="gradebook-table-body" class="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
              ${this.renderGradebookRows(history)}
            </tbody>
          </table>
        </div>

      </div>
    `;

    // Bind filters
    const searchInput = container.querySelector('#gb-filter-search');
    const classSelect = container.querySelector('#gb-filter-class');
    const schoolSelect = container.querySelector('#gb-filter-school');
    const roomSelect = container.querySelector('#gb-filter-room');

    const bindAuditButtons = () => {
      container.querySelectorAll('[data-view-audit]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-view-audit');
          const target = history.find(h => h.id === id);
          if (target) this.openViolationAuditModal(target);
        };
      });
    };

    const applyTableFilter = () => {
      const q = searchInput.value.toLowerCase().trim();
      const c = classSelect.value;
      const s = schoolSelect.value;
      const r = roomSelect.value;

      const filtered = history.filter(item => {
        if (q) {
          const matchName = (item.studentName || '').toLowerCase().includes(q);
          const matchRoom = (item.roomId || '').toLowerCase().includes(q);
          const matchTitle = (item.title || '').toLowerCase().includes(q);
          if (!matchName && !matchRoom && !matchTitle) return false;
        }
        if (c !== 'all' && item.studentClass !== c) return false;
        if (s !== 'all' && item.studentSchool !== s) return false;
        if (r !== 'all' && item.roomId !== r) return false;
        return true;
      });

      const tbody = container.querySelector('#gradebook-table-body');
      if (tbody) {
        tbody.innerHTML = this.renderGradebookRows(filtered);
        bindAuditButtons();
      }
    };

    if (searchInput) searchInput.oninput = applyTableFilter;
    if (classSelect) classSelect.onchange = applyTableFilter;
    if (schoolSelect) schoolSelect.onchange = applyTableFilter;
    if (roomSelect) roomSelect.onchange = applyTableFilter;

    bindAuditButtons();

    // Export CSV
    const exportBtn = container.querySelector('#btn-export-gradebook-csv');
    if (exportBtn) {
      exportBtn.onclick = () => this.exportGradebookToCSV(history);
    }
  }

  renderGradebookRows(list) {
    if (list.length === 0) {
      return `<tr><td colspan="10" class="text-center py-8 text-slate-400">Không tìm thấy kết quả phù hợp.</td></tr>`;
    }

    return list.map((item, idx) => {
      const date = new Date(item.date).toLocaleString('vi-VN');
      const mins = Math.floor(item.timeSpentSeconds / 60);
      const secs = item.timeSpentSeconds % 60;

      let scoreColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      if (item.score < 5.0) scoreColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
      else if (item.score < 6.5) scoreColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
      else if (item.score < 8.0) scoreColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';

      const proctorBadge = item.isDisqualified ? `
        <button type="button" data-view-audit="${item.id}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:scale-105 transition" title="Bấm để xem chi tiết mốc thời gian vi phạm">
          <i class="fa-solid fa-ban text-[9px]"></i> Đình chỉ (${item.violationCount || 0}) <i class="fa-solid fa-magnifying-glass text-[8px] ml-0.5"></i>
        </button>
      ` : (item.violationCount > 0 ? `
        <button type="button" data-view-audit="${item.id}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:scale-105 transition" title="Bấm để xem mốc thời gian cảnh báo">
          <i class="fa-solid fa-triangle-exclamation text-[9px]"></i> Cảnh báo (${item.violationCount}) <i class="fa-solid fa-magnifying-glass text-[8px] ml-0.5"></i>
        </button>
      ` : (item.isProctored ? `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <i class="fa-solid fa-check text-[9px]"></i> 0 vi phạm
        </span>
      ` : `<span class="text-slate-400 font-mono text-[11px]">Tự do</span>`));

      return `
        <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
          <td class="py-3 px-3 text-slate-400">${idx + 1}</td>
          <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">
            ${escapeHtml(item.studentName || 'Thí sinh tự do')}
          </td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold">
              ${escapeHtml(item.studentClass || 'Tự do')}
            </span>
          </td>
          <td class="py-3 px-3 text-slate-600 dark:text-slate-300">${escapeHtml(item.studentSchool || '-')}</td>
          <td class="py-3 px-3">
            ${item.roomId ? `
              <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                ${escapeHtml(item.roomId)}
              </span>
            ` : `<span class="text-slate-400 italic">Tự do</span>`}
          </td>
          <td class="py-3 px-3 max-w-[180px] truncate text-slate-700 dark:text-slate-300" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</td>
          <td class="py-3 px-3 text-center">
            <span class="px-2.5 py-1 rounded-lg font-black ${scoreColor}">
              ${item.score}
            </span>
          </td>
          <td class="py-3 px-3">${proctorBadge}</td>
          <td class="py-3 px-3 text-slate-400 font-mono">${mins}p ${secs}s</td>
          <td class="py-3 px-3 text-slate-400">${date}</td>
        </tr>
      `;
    }).join('');
  }

  exportGradebookToCSV(history) {
    const headers = ['STT', 'Họ và tên', 'Lớp', 'Trường', 'Email', 'Mã phòng thi', 'Tên đề thi', 'Khối', 'Điểm số (Thang 10)', 'Số câu đúng', 'Tổng số câu', 'Thời gian làm bài', 'Giám sát chống gian lận', 'Số lần vi phạm', 'Trạng thái', 'Thời điểm nộp'];
    const rows = history.map((item, idx) => {
      const mins = Math.floor(item.timeSpentSeconds / 60);
      const secs = item.timeSpentSeconds % 60;
      const statusText = item.isDisqualified ? 'Bị đình chỉ thi' : (item.violationCount > 0 ? `Cảnh báo (${item.violationCount} lần)` : 'Hợp lệ');
      return [
        idx + 1,
        `"${(item.studentName || '').replace(/"/g, '""')}"`,
        `"${(item.studentClass || '').replace(/"/g, '""')}"`,
        `"${(item.studentSchool || '').replace(/"/g, '""')}"`,
        `"${(item.studentEmail || '').replace(/"/g, '""')}"`,
        `"${(item.roomId || 'Tự do').replace(/"/g, '""')}"`,
        `"${(item.title || '').replace(/"/g, '""')}"`,
        item.grade || '12',
        item.score,
        item.correctCount,
        item.totalQuestions,
        `"${mins}p ${secs}s"`,
        item.isProctored ? 'Bật' : 'Tắt',
        item.violationCount || 0,
        `"${statusText}"`,
        `"${new Date(item.date).toLocaleString('vi-VN')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bang_Diem_Tin_Hoc_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- MODAL XEM BIÊN BẢN VI PHẠM (AUDIT LOGS) ---
  openViolationAuditModal(item) {
    const modal = document.getElementById('modal-violation-audit');
    if (!modal) return;

    const subtitleEl = document.getElementById('audit-student-subtitle');
    const infoEl = document.getElementById('audit-student-info');
    const listEl = document.getElementById('audit-violations-list');

    if (subtitleEl) {
      subtitleEl.textContent = `Bài thi: ${item.title || 'Đề thi'} • Thời điểm nộp: ${new Date(item.date).toLocaleString('vi-VN')}`;
    }

    if (infoEl) {
      infoEl.innerHTML = `
        <div class="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
          <div><span class="text-slate-400">Thí sinh:</span> <b>${escapeHtml(item.studentName || '')}</b></div>
          <div><span class="text-slate-400">Email:</span> <b>${escapeHtml(item.studentEmail || 'Chưa có')}</b></div>
          <div><span class="text-slate-400">Lớp:</span> <b>${escapeHtml(item.studentClass || '-')}</b></div>
          <div><span class="text-slate-400">Trường:</span> <b>${escapeHtml(item.studentSchool || '-')}</b></div>
          <div><span class="text-slate-400">Phòng thi:</span> <b class="font-mono text-blue-600">${escapeHtml(item.roomId || 'Tự do')}</b></div>
          <div><span class="text-slate-400">Điểm số:</span> <b class="text-base ${item.isDisqualified ? 'text-rose-600' : 'text-emerald-600'}">${item.score}/10</b></div>
        </div>
        <div class="pt-2 border-t border-slate-200 dark:border-slate-700 font-bold ${item.isDisqualified ? 'text-rose-600' : 'text-amber-600'}">
          Trạng thái: ${item.isDisqualified ? `⛔ BỊ ĐÌNH CHỈ THI (${escapeHtml(item.disqualifiedReason || 'Vi phạm quá số lần cho phép')})` : `⚠️ Hoàn thành với ${item.violationCount} lần cảnh báo`}
        </div>
      `;
    }

    if (listEl) {
      const logs = item.violationLogs || [];
      if (logs.length === 0) {
        listEl.innerHTML = `<p class="text-slate-400 italic text-center py-4">Không có nhật ký vi phạm nào.</p>`;
      } else {
        listEl.innerHTML = logs.map((log, i) => `
          <div class="p-3 bg-rose-50/80 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs font-mono">
            <span class="text-rose-700 dark:text-rose-300 font-bold">
              <i class="fa-solid fa-triangle-exclamation mr-1 text-rose-500"></i> Lần ${i + 1}: ${escapeHtml(log.reason)}
            </span>
            <span class="text-slate-500 dark:text-slate-400 font-semibold shrink-0 ml-2">
              ${log.time}
            </span>
          </div>
        `).join('');
      }
    }

    modal.classList.remove('hidden');

    modal.querySelectorAll('[data-close-modal="modal-violation-audit"]').forEach(btn => {
      btn.onclick = () => modal.classList.add('hidden');
    });
  }

  // --- AUTH UI & PROFILE MANAGEMENT ---
  initAuthUI() {
    // Lắng nghe thay đổi trạng thái user
    Auth.onAuthChange((user) => {
      const loginBtn = document.getElementById('auth-btn-login');
      const profileMenu = document.getElementById('auth-profile-menu');
      const userNameEl = document.getElementById('auth-user-name');
      const userBadgeEl = document.getElementById('auth-user-badge');
      const userAvatarEl = document.getElementById('auth-user-avatar');
      const dropdownRoleBadge = document.getElementById('dropdown-user-role-badge');
      const dropdownEmail = document.getElementById('dropdown-user-email');

      if (user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (profileMenu) profileMenu.classList.remove('hidden');
        if (userNameEl) userNameEl.textContent = user.fullName || 'Người dùng';

        let roleName = 'Học sinh';
        let roleBadgeColor = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
        if (user.role === 'admin') {
          roleName = 'Quản trị viên (Admin)';
          roleBadgeColor = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-bold';
        } else if (user.role === 'teacher') {
          roleName = 'Giáo viên (GV)';
          roleBadgeColor = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-bold';
        } else if (user.className) {
          roleName = `Lớp ${user.className}`;
        }

        if (userBadgeEl) {
          userBadgeEl.textContent = roleName;
          if (user.role === 'admin') userBadgeEl.className = 'text-[10px] text-rose-600 dark:text-rose-400 font-bold block';
          else if (user.role === 'teacher') userBadgeEl.className = 'text-[10px] text-purple-600 dark:text-purple-400 font-bold block';
          else userBadgeEl.className = 'text-[10px] text-blue-600 dark:text-blue-400 font-semibold block';
        }

        if (dropdownRoleBadge) {
          dropdownRoleBadge.textContent = Auth.getRoleLabel();
          dropdownRoleBadge.className = `px-2 py-0.5 rounded text-[10px] ${roleBadgeColor}`;
        }
        if (dropdownEmail) {
          dropdownEmail.textContent = user.email || '';
        }
        if (userAvatarEl && user.avatar) userAvatarEl.src = user.avatar;
      } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (profileMenu) profileMenu.classList.add('hidden');
      }

      this.updateRolePermissionsUI(user);
    });

    // Mở modal đăng nhập
    document.querySelectorAll('[data-open-login-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('modal-login')?.classList.remove('hidden');
        Auth.initGoogleIdentity();
      });
    });

    // Đóng các modal
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        document.getElementById(modalId)?.classList.add('hidden');
      });
    });

    // 3 Nút đăng nhập trải nghiệm theo vai trò (HS, GV, Admin)
    document.getElementById('btn-demo-login-student')?.addEventListener('click', () => {
      document.getElementById('modal-login')?.classList.add('hidden');
      Auth.loginWithGoogleDemo({ role: 'student' });
    });

    document.getElementById('btn-demo-login-teacher')?.addEventListener('click', () => {
      document.getElementById('modal-login')?.classList.add('hidden');
      Auth.loginWithGoogleDemo({ role: 'teacher' });
    });

    document.getElementById('btn-demo-login-admin')?.addEventListener('click', () => {
      document.getElementById('modal-login')?.classList.add('hidden');
      Auth.loginWithGoogleDemo({ role: 'admin' });
    });

    // Nút mở modal nâng cấp vai trò bằng mã xác thực
    const btnOpenUpgrade = document.getElementById('btn-open-upgrade-role');
    const modalUpgrade = document.getElementById('modal-upgrade-role');
    const formUpgrade = document.getElementById('form-upgrade-role');
    const inputSecretCode = document.getElementById('input-upgrade-secret-code');

    if (btnOpenUpgrade) {
      btnOpenUpgrade.addEventListener('click', () => {
        if (!Auth.isLoggedIn()) {
          alert('Vui lòng đăng nhập trước khi kích hoạt vai trò!');
          document.getElementById('modal-login')?.classList.remove('hidden');
          return;
        }
        modalUpgrade?.classList.remove('hidden');
        if (inputSecretCode) inputSecretCode.value = '';
      });
    }

    if (formUpgrade) {
      formUpgrade.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = inputSecretCode?.value || '';
        const res = Auth.upgradeRoleWithCode(code);
        alert(res.message);
        if (res.success) {
          modalUpgrade?.classList.add('hidden');
          this.switchTab(res.role === 'admin' ? 'admin-system' : 'questions-manage');
        }
      });
    }

    // Toggle dropdown profile menu
    const profilePillBtn = document.getElementById('btn-user-profile-pill');
    const profileDropdown = document.getElementById('user-profile-dropdown');
    if (profilePillBtn && profileDropdown) {
      profilePillBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => {
        profileDropdown.classList.add('hidden');
      });
    }

    // Nút Đăng xuất
    const logoutBtn = document.getElementById('btn-auth-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản?')) {
          Auth.logout();
          this.switchTab('home');
        }
      });
    }

    // Nút Sửa hồ sơ học sinh
    const editProfileBtn = document.getElementById('btn-edit-profile');
    if (editProfileBtn) {
      editProfileBtn.addEventListener('click', () => {
        Auth.openRequiredProfileModal();
      });
    }

    // Form lưu thông tin bắt buộc: Họ và tên, Lớp, Trường
    const formProfile = document.getElementById('form-required-profile');
    if (formProfile) {
      formProfile.addEventListener('submit', (e) => {
        e.preventDefault();
        const fullName = document.getElementById('profile-input-fullname')?.value || '';
        const grade = document.getElementById('profile-input-grade')?.value || '12';
        const className = document.getElementById('profile-input-class')?.value || '';
        const school = document.getElementById('profile-input-school')?.value || '';

        if (!fullName.trim()) {
          alert('Vui lòng nhập Họ và tên của bạn!');
          return;
        }
        if (!className.trim()) {
          alert('Vui lòng nhập Lớp của bạn (Ví dụ: 12A1)!');
          return;
        }
        if (!school.trim()) {
          alert('Vui lòng nhập tên Trường của bạn (Ví dụ: THPT Nguyễn Huệ)!');
          return;
        }

        Auth.updateProfile({ fullName, grade, className, school });
        Auth.closeRequiredProfileModal();
        alert('Cập nhật thông tin học sinh thành công! Chúc bạn ôn tập tốt.');
      });
    }

    // Modal cấu hình Google Client ID cho giáo viên
    const btnOpenGoogleConfig = document.getElementById('btn-open-google-config');
    const modalGoogleConfig = document.getElementById('modal-google-config');
    const inputClientId = document.getElementById('input-google-client-id');
    const btnSaveClientId = document.getElementById('btn-save-client-id');

    if (btnOpenGoogleConfig) {
      btnOpenGoogleConfig.addEventListener('click', () => {
        if (inputClientId) inputClientId.value = Auth.getGoogleClientId();
        modalGoogleConfig?.classList.remove('hidden');
      });
    }

    if (btnSaveClientId && inputClientId) {
      btnSaveClientId.addEventListener('click', () => {
        Auth.setGoogleClientId(inputClientId.value);
        modalGoogleConfig?.classList.add('hidden');
        alert('Đã lưu Google Client ID thành công!');
      });
    }
  }

  updateRolePermissionsUI(user) {
    const isTeacher = Auth.isTeacher();
    const isAdmin = Auth.isAdmin();

    // Ẩn/hiển thị các tab & nút theo quyền yêu cầu
    document.querySelectorAll('[data-role-req="teacher"]').forEach(el => {
      el.classList.toggle('hidden', !isTeacher);
    });

    document.querySelectorAll('[data-role-req="admin"]').forEach(el => {
      el.classList.toggle('hidden', !isAdmin);
    });
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

// Khởi tạo ứng dụng an toàn cho cả khi DOM đã sẵn sàng hoặc đang nạp
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.AppInstance = new App();
    window.AppInstance.init();
  });
} else {
  window.AppInstance = new App();
  window.AppInstance.init();
}

