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
import { Gradebook } from './gradebook.js';
import { CloudSync } from './cloud-sync.js';
import { InteractiveVideo } from './interactive-video.js';

if (typeof window !== 'undefined') {
  window.Auth = Auth;
  window.Storage = Storage;
  window.Exam = Exam;
  window.Proctor = Proctor;
  window.ExamRooms = ExamRooms;
  window.Gradebook = Gradebook;
  window.CloudSync = CloudSync;
  window.InteractiveVideo = InteractiveVideo;
}

class App {
  constructor() {
    this.manifest = null;
    this.currentGrade = '12';
    this.gradeCache = {};
    this.currentTab = 'home';
    this.pendingRoomParam = null;
  }

  async init() {
    window.App = this;
    window.AppInstance = this;
    // Đảm bảo dừng giám sát Proctor khi tải trang/khởi động
    Proctor.stop();
    this.initTheme();
    Auth.init();
    this.initAuthUI();
    this.bindGlobalEvents();

    // Khởi tạo Cloud Sync Engine chuyển đổi sang Web Động Đa Nền Tảng
    Storage.cloudSync = CloudSync;
    CloudSync.init();
    this.initCloudSyncUI();

    // Khóa giao diện và mở modal đăng nhập NGAY LẬP TỨC (không chờ nạp manifest / đề thi)
    this.enforceAuthentication();

    await this.loadManifest();
    await this.switchGrade(this.currentGrade);
    this.renderHome();

    // Tự động nhận diện mã phòng thi qua URL param (?room=XYZ hoặc ?phong=XYZ)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room') || urlParams.get('phong');
    if (roomParam) {
      this.pendingRoomParam = roomParam.trim().toUpperCase();
    }

    // Bắt buộc đăng ký / đăng nhập trước khi vào trang (đồng thời xử lý pendingRoomParam nếu đã đăng nhập)
    this.enforceAuthentication();

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

  // --- CLOUD SYNC UI & STATUS BADGE ---
  initCloudSyncUI() {
    const btnStatus = document.getElementById('btn-cloud-sync-status');
    const textStatus = document.getElementById('cloud-sync-status-text');

    const updateUI = (status) => {
      if (!btnStatus || !textStatus) return;
      if (status.isSyncing) {
        btnStatus.className = 'px-2.5 py-1.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 transition flex items-center gap-1.5 shadow-sm';
        textStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đồng bộ...';
      } else if (status.isConfigured) {
        btnStatus.className = 'px-2.5 py-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition flex items-center gap-1.5 shadow-sm';
        textStatus.innerHTML = '🟢 Cloud';
      } else {
        btnStatus.className = 'px-2.5 py-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5';
        textStatus.innerHTML = '⚪ Local';
      }
    };

    CloudSync.onStatusChange(updateUI);
    updateUI(CloudSync.getStatus());

    if (btnStatus) {
      btnStatus.onclick = () => {
        if (Auth.isAdmin()) {
          this.switchTab('admin-system');
          setTimeout(() => {
            document.getElementById('admin-cloud-sync-card')?.scrollIntoView({ behavior: 'smooth' });
          }, 200);
        } else {
          CloudSync.syncAll(true);
        }
      };
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
    } else if (this.currentTab === 'interactive-video') {
      InteractiveVideo.setGrade(grade);
    }
  }

  // --- ROUTING / TABS ---
  async switchTab(tab) {
    // Cảnh báo nếu thí sinh đang làm bài thi mà bấm chuyển sang tab khác
    if (this.currentTab === 'exam-room' && tab !== 'exam-room' && Exam.examState === 'taking') {
      const confirmLeave = confirm('Bạn đang trong quá trình làm bài thi thử. Nếu rời khỏi phòng thi lúc này, bài làm chưa nộp sẽ bị hủy.\nBạn có chắc chắn muốn thoát không?');
      if (!confirmLeave) return false;
      Exam.resetState();
    }

    // Tự động dọn dẹp phòng học video tương tác nếu rời tab
    if (this.currentTab === 'interactive-video' && tab !== 'interactive-video') {
      if (typeof InteractiveVideo !== 'undefined' && InteractiveVideo.activeLesson) {
        InteractiveVideo.cleanupActivePlayer();
        InteractiveVideo.activeLesson = null;
      }
    }

    // Proctor CHỈ được hoạt động trong phòng thi (exam-room) hoặc video tương tác (interactive-video)
    if (tab !== 'exam-room' && tab !== 'interactive-video') {
      Proctor.stop();
    }

    // Kiểm tra đăng nhập bắt buộc khi truy cập các tính năng
    if (!Auth.isLoggedIn() && tab !== 'home') {
      if (typeof window.openLoginModal === 'function') {
        window.openLoginModal('login');
      } else {
        document.getElementById('modal-login')?.classList.remove('hidden');
      }
      alert('Vui lòng Đăng nhập hoặc Đăng ký tài khoản để sử dụng tính năng này!');
      return false;
    }

    // Kiểm tra hoàn tất hồ sơ
    if (Auth.isLoggedIn() && !Auth.isProfileComplete() && tab !== 'home') {
      Auth.openRequiredProfileModal();
      alert('Vui lòng hoàn tất thông tin Họ và tên, Lớp, Trường để tiếp tục!');
      return false;
    }

    // Kiểm tra quyền truy cập theo vai trò (RBAC)
    if (tab === 'admin-system' && !Auth.isAdmin()) {
      alert('Chức năng Quản Trị Hệ Thống chỉ dành riêng cho Quản trị viên (Admin)!');
      return false;
    }
    if ((tab === 'questions-manage' || tab === 'gradebook' || tab === 'exam-rooms' || tab === 'print') && !Auth.isTeacher()) {
      alert('Chức năng này dành cho Giáo viên (GV) & Quản trị viên (Admin)!\nHọc sinh vui lòng tham gia thi thử và xem bảng vinh danh.');
      return false;
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
      'view-exam-rooms', 'view-interactive-video'
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
        ExamRooms.init(document.getElementById('exam-rooms-list-area'), this.manifest);
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
      case 'interactive-video':
        document.getElementById('view-interactive-video')?.classList.remove('hidden');
        await InteractiveVideo.init(
          document.getElementById('view-interactive-video'),
          this.manifest,
          (g) => this.loadGradeData(g),
          this.currentGrade
        );
        break;
      case 'questions-manage':
        document.getElementById('view-questions-manage')?.classList.remove('hidden');
        QuestionsManager.init(document.getElementById('questions-manage-area'), this.manifest, (g) => this.loadGradeData(g));
        break;
      case 'admin-system':
        document.getElementById('view-admin-system')?.classList.remove('hidden');
        AdminManager.init(document.getElementById('admin-system-area'), this.manifest);
        break;
    }
  }

  // --- HOME VIEW ---
  renderHome() {
    const stats = Storage.getPracticeStats();
    const history = Storage.getExamHistory();
    const bookmarks = Storage.getBookmarks();
    const wrongQuestions = Storage.getWrongQuestions();
    const streakInfo = Storage.getStudyStreak();
    const activeSession = Storage.getActiveExamSession();

    const validHistory = history.filter(h => !h.isDisqualified);
    const avgScore = validHistory.length > 0
      ? (validHistory.reduce((sum, h) => sum + (Number(h.score) || 0), 0) / validHistory.length).toFixed(2)
      : null;
    const maxScore = validHistory.length > 0
      ? Math.max(...validHistory.map(h => Number(h.score) || 0)).toFixed(2)
      : null;

    let homeTrendBadge = '';
    if (validHistory.length >= 2) {
      const latestScore = Number(validHistory[0].score) || 0;
      const prevScore = Number(validHistory[1].score) || 0;
      const scoreDiff = Math.round((latestScore - prevScore) * 100) / 100;
      if (scoreDiff >= 0.5) {
        homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Đang tiến bộ 🚀 (+${scoreDiff > 0 ? scoreDiff : 0.5}đ)</span></div>`;
      } else if (Number(avgScore) >= 8.5 && latestScore >= 8.0) {
        homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">Xuất sắc 🏆</span></div>`;
      } else if (latestScore < 5.0 || Number(avgScore) < 5.0 || scoreDiff <= -1.0) {
        homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Cần cố gắng ⚠️</span></div>`;
      } else if (Number(avgScore) >= 6.5) {
        homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">Khá & Ổn định ⚡</span></div>`;
      } else {
        homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Trung bình 📊</span></div>`;
      }
    } else if (validHistory.length === 1) {
      homeTrendBadge = `<div class="mt-1"><span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">Mới bắt đầu 🔄</span></div>`;
    }

    const homeStatsContainer = document.getElementById('home-user-stats');
    if (homeStatsContainer) {
      homeStatsContainer.innerHTML = `
        <div class="space-y-4">
          ${activeSession ? this.getActiveSessionBannerHtml(activeSession) : ''}

          <!-- Hàng 1: 4 chỉ số tổng quan -->
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
                <span class="text-xs text-slate-400 block font-medium">Đề đã thi / Điểm TB</span>
                <span class="text-xl font-black text-purple-600 dark:text-purple-400">${history.length} đề ${avgScore !== null ? `<span class="text-xs font-bold text-slate-400">(${avgScore}đ)</span>` : ''}</span>
                ${homeTrendBadge}
              </div>
            </div>

            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xl shrink-0">
                <i class="fa-solid fa-fire-flame-curved"></i>
              </div>
              <div>
                <span class="text-xs text-slate-400 block font-medium">Chuỗi ngày học</span>
                <span class="text-xl font-black text-orange-600 dark:text-orange-400">${streakInfo.streak} ngày 🔥</span>
              </div>
            </div>
          </div>

          <!-- Hàng 2: Luyện Câu Hay Sai & Năng Lực Cá Nhân -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-4">
              <div class="flex items-center gap-3.5">
                <div class="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg shrink-0">
                  <i class="fa-solid fa-rotate"></i>
                </div>
                <div>
                  <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">
                    Ngân Hàng Câu Hỏi Hay Sai (${wrongQuestions.length} câu)
                  </h4>
                  <p class="text-[11px] text-slate-400 mt-0.5">
                    Tập trung rèn luyện các câu hỏi chưa làm đúng để củng cố kiến thức nhanh chóng
                  </p>
                </div>
              </div>
              <button type="button" id="btn-home-practice-wrong" ${wrongQuestions.length === 0 ? 'disabled' : ''} class="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 text-xs font-bold transition shrink-0 shadow-sm">
                Ôn câu sai ngay
              </button>
            </div>

            <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between gap-4">
              <div class="flex items-center gap-3.5">
                <div class="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
                  <i class="fa-solid fa-bookmark"></i>
                </div>
                <div>
                  <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">
                    Đã lưu ${bookmarks.length} câu hỏi • Kỷ lục: ${maxScore !== null ? maxScore + ' điểm' : 'Chưa thi'}
                  </h4>
                  <p class="text-[11px] text-slate-400 mt-0.5">
                    Lưu các câu hỏi trọng tâm để ôn lại bất cứ lúc nào và nắm chắc bài học
                  </p>
                </div>
              </div>
              <button type="button" id="btn-home-open-bookmarks" class="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold transition shrink-0">
                Xem câu đã lưu
              </button>
            </div>
          </div>
        </div>
      `;

      this.bindActiveSessionBannerEvents(homeStatsContainer);

      homeStatsContainer.querySelector('#btn-home-practice-wrong')?.addEventListener('click', async () => {
        if (wrongQuestions.length === 0) return;
        await this.switchTab('practice');
        const practiceArea = document.getElementById('practice-question-area');
        Practice.init(practiceArea, wrongQuestions, this.manifest);
        Practice.setQuestions(wrongQuestions);
      });

      homeStatsContainer.querySelector('#btn-home-open-bookmarks')?.addEventListener('click', () => {
        this.switchTab('bookmarks');
      });
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
          btn.addEventListener('click', async () => {
            const topic = btn.getAttribute('data-practice-topic');
            await this.switchTab('practice');
            const topicSelect = document.getElementById('practice-topic-select');
            if (topicSelect) {
              topicSelect.value = topic;
              topicSelect.dispatchEvent(new Event('change'));
            }
          });
        });
      }
    }
  }

  getActiveSessionBannerHtml(activeSession) {
    const mins = Math.floor((activeSession.remainingSeconds || 0) / 60);
    const secs = (activeSession.remainingSeconds || 0) % 60;
    const answered = Object.keys(activeSession.userAnswers || {}).length;
    const total = (activeSession.examQuestions || []).length;
    const title = activeSession.examConfig?.title || 'Đề thi thử Tin học';

    return `
      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0 mt-0.5">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div>
            <span class="text-[10px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded">Phát hiện bài thi đang làm dở</span>
            <h4 class="text-sm font-black mt-1">${escapeHtml(title)}</h4>
            <p class="text-xs text-amber-100 mt-0.5">
              Đã làm: <b>${answered}/${total} câu</b> • Thời gian còn lại: <b>${mins} phút ${secs} giây</b>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" data-resume-exam-session class="px-4 py-2.5 bg-white text-orange-600 hover:bg-orange-50 font-black rounded-xl text-xs transition shadow-sm flex items-center gap-1.5">
            <i class="fa-solid fa-play"></i> Tiếp tục làm bài
          </button>
          <button type="button" data-discard-exam-session class="px-3 py-2.5 bg-black/20 hover:bg-black/30 text-white font-bold rounded-xl text-xs transition">
            Hủy nháp
          </button>
        </div>
      </div>
    `;
  }

  bindActiveSessionBannerEvents(containerEl) {
    if (!containerEl) return;
    const resumeBtn = containerEl.querySelector('[data-resume-exam-session]');
    const discardBtn = containerEl.querySelector('[data-discard-exam-session]');

    if (resumeBtn) {
      resumeBtn.onclick = async () => {
        const session = Storage.getActiveExamSession();
        if (!session) return;
        const grade = session.examConfig?.grade || this.currentGrade;
        await this.loadGradeData(grade);
        const questions = [...(this.gradeCache[grade] || [])];
        await this.switchTab('exam-room');
        const roomEl = document.getElementById('view-exam-room');
        Exam.init(roomEl, questions, this.manifest);
        Exam.resumeSavedSession(session);
      };
    }

    if (discardBtn) {
      discardBtn.onclick = () => {
        if (confirm('Bạn có chắc chắn muốn hủy bỏ bài thi đang làm dở này không?')) {
          Storage.clearActiveExamSession();
          if (this.currentTab === 'home') this.renderHome();
          else if (this.currentTab === 'exam-setup') this.renderExamSetup();
        }
      };
    }
  }

  // --- PRACTICE VIEW ---
  async initPracticeView() {
    const questions = await this.loadGradeData(this.currentGrade);
    const container = document.getElementById('practice-question-area');
    Practice.init(container, questions, this.manifest);
    this.populatePracticeFilters();
    Practice.setQuestions(questions);

    // Cập nhật số lượng câu hay sai trên thanh công cụ Luyện tập
    const wrongCountEl = document.getElementById('practice-wrong-count');
    const wrongBtn = document.getElementById('btn-practice-wrong-questions');
    const wrongList = Storage.getWrongQuestions();
    if (wrongCountEl) wrongCountEl.textContent = wrongList.length;
    if (wrongBtn) {
      wrongBtn.onclick = () => {
        const latestWrong = Storage.getWrongQuestions();
        if (latestWrong.length === 0) {
          alert('Tuyệt vời! Hiện tại bạn không có câu hỏi nào trong danh sách làm sai.');
          return;
        }
        Practice.setQuestions(latestWrong);
      };
    }

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
        topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${gradeData.topics[t].total} câu)</option>`).join('');
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
            lessons.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
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

    // Hiển thị banner khôi phục bài thi đang làm dở (nếu có)
    const recoveryBannerEl = document.getElementById('active-exam-recovery-banner');
    if (recoveryBannerEl) {
      const activeSession = Storage.getActiveExamSession();
      recoveryBannerEl.innerHTML = activeSession ? this.getActiveSessionBannerHtml(activeSession) : '';
      this.bindActiveSessionBannerEvents(recoveryBannerEl);
    }

    // Thiết lập trạng thái toggle theo Storage
    const settings = Storage.getSettings();
    const shuffleQCheckbox = document.getElementById('exam-cfg-shuffle-questions');
    const shuffleOptCheckbox = document.getElementById('exam-cfg-shuffle-options');
    const antiCheatCheckbox = document.getElementById('exam-cfg-anticheat');
    if (shuffleQCheckbox) shuffleQCheckbox.checked = settings.shuffleQuestions ?? true;
    if (shuffleOptCheckbox) shuffleOptCheckbox.checked = settings.shuffleOptions ?? true;
    if (antiCheatCheckbox) antiCheatCheckbox.checked = settings.proctorPracticeExam ?? true;

    // Ẩn bảng cấu hình đảo đề & giám sát đối với Học sinh (mặc định luôn bật cả 3 tính năng)
    const shuffleConfigPanel = document.getElementById('exam-shuffle-config-panel');
    if (shuffleConfigPanel) {
      const isTeacherOrAdmin = Auth.isTeacher() || Auth.isAdmin();
      shuffleConfigPanel.classList.toggle('hidden', !isTeacherOrAdmin);
    }

    const getExamShuffleConfig = () => {
      // Học sinh mặc định luôn bật cả 3 tính năng: Đảo câu hỏi, Đảo phương án, Giám sát chống gian lận
      const isTeacherOrAdmin = Auth.isTeacher() || Auth.isAdmin();
      const shuffleQuestions = (shuffleQCheckbox && isTeacherOrAdmin) ? shuffleQCheckbox.checked : true;
      const shuffleOptions = (shuffleOptCheckbox && isTeacherOrAdmin) ? shuffleOptCheckbox.checked : true;
      const proctorPracticeExam = (antiCheatCheckbox && isTeacherOrAdmin) ? antiCheatCheckbox.checked : true;
      Storage.saveSettings({ shuffleQuestions, shuffleOptions, proctorPracticeExam });
      return {
        shuffleQuestions,
        shuffleOptions,
        antiCheat: {
          enabled: proctorPracticeExam,
          maxViolations: 3,
          enforceFullscreen: true,
          preventTabSwitch: true,
          disableCopyPaste: true,
          blockDevTools: true,
          detectSplitScreen: true
        }
      };
    };

    // Chuyển đổi giữa 4 chế độ tạo đề thi (Tabs)
    const modeTabs = document.querySelectorAll('[data-exam-tab]');
    const panels = {
      bgd: document.getElementById('panel-exam-bgd'),
      topic: document.getElementById('panel-exam-topic'),
      lesson: document.getElementById('panel-exam-lesson'),
      matrix: document.getElementById('panel-exam-matrix')
    };

    modeTabs.forEach(tab => {
      tab.onclick = () => {
        const targetMode = tab.getAttribute('data-exam-tab');
        modeTabs.forEach(t => {
          const isSelected = (t === tab);
          t.classList.toggle('bg-white', isSelected);
          t.classList.toggle('dark:bg-slate-800', isSelected);
          t.classList.toggle('text-blue-600', isSelected);
          t.classList.toggle('dark:text-blue-400', isSelected);
          t.classList.toggle('shadow-sm', isSelected);
          t.classList.toggle('font-bold', isSelected);
          t.classList.toggle('font-semibold', !isSelected);
          t.classList.toggle('text-slate-600', !isSelected);
          t.classList.toggle('dark:text-slate-300', !isSelected);
        });

        Object.keys(panels).forEach(key => {
          if (panels[key]) {
            panels[key].classList.toggle('hidden', key !== targetMode);
          }
        });
      };
    });

    // Hàm điền dữ liệu Chủ đề & Bài học theo Khối
    const populateExamSetupDropdowns = (grade) => {
      if (!this.manifest || !this.manifest.grades[grade]) return;
      const gradeData = this.manifest.grades[grade];
      const topics = Object.keys(gradeData.topics || {});

      // 1. Panel Theo Chủ đề
      const topicSelect = document.getElementById('exam-topic-select');
      if (topicSelect) {
        let tHtml = `<option value="all">-- Tất cả các chủ đề trong Khối ${grade} (${gradeData.total} câu) --</option>`;
        topics.forEach(t => {
          tHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${gradeData.topics[t].total} câu)</option>`;
        });
        topicSelect.innerHTML = tHtml;
      }

      // 2. Panel Theo Bài học
      const lessonTopicSelect = document.getElementById('exam-lesson-topic-select');
      const lessonSelect = document.getElementById('exam-lesson-select');
      if (lessonTopicSelect) {
        let ltHtml = `<option value="">-- Vui lòng chọn chủ đề --</option>`;
        topics.forEach(t => {
          ltHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`;
        });
        lessonTopicSelect.innerHTML = ltHtml;
      }

      const updateExamLessons = () => {
        if (!lessonSelect) return;
        const selTopic = lessonTopicSelect ? lessonTopicSelect.value : '';
        if (!selTopic || !gradeData.topics[selTopic]) {
          lessonSelect.innerHTML = `<option value="">-- Vui lòng chọn chủ đề trước --</option>`;
        } else {
          const lessons = Object.keys(gradeData.topics[selTopic].lessons || {});
          let lHtml = `<option value="">-- Chọn bài học cụ thể (${lessons.length} bài) --</option>`;
          lessons.forEach(l => {
            const count = gradeData.topics[selTopic].lessons[l].total;
            lHtml += `<option value="${escapeHtml(l)}">${escapeHtml(l)} (${count} câu)</option>`;
          });
          lessonSelect.innerHTML = lHtml;
        }
      };

      if (lessonTopicSelect) {
        lessonTopicSelect.onchange = updateExamLessons;
      }
      updateExamLessons();

      // Cập nhật gợi ý mã đề chuẩn BGD
      const bgdCodeEl = document.getElementById('bgd-suggested-code');
      if (bgdCodeEl) {
        bgdCodeEl.textContent = `Mã đề ${Math.floor(100 + Math.random() * 900)}`;
      }
    };

    populateExamSetupDropdowns(gradeSelect ? gradeSelect.value : this.currentGrade);

    if (gradeSelect) {
      gradeSelect.onchange = async (e) => {
        await this.switchGrade(e.target.value);
        populateExamSetupDropdowns(e.target.value);
      };
    }

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

        // Nếu phòng thi chưa có trong máy, tự động kéo trực tiếp từ Cloud về
        if (!Storage.getExamRoom(roomId) && CloudSync.isConfigured()) {
          await CloudSync.fetchRoomFromCloud(roomId);
        }

        // Xác thực đối tượng vào thi (Trường, Khối, Lớp, Mật khẩu, Khung giờ)
        const access = Storage.validateRoomAccess(roomId, pwd, Auth.currentUser);
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
          topic: room.topic || null,
          lesson: room.lesson || null,
          contentScope: room.contentScope || (room.selectedLessons?.length ? 'custom' : 'all'),
          selectedTopics: room.selectedTopics || null,
          selectedLessons: room.selectedLessons || null,
          count: room.questionCount || (room.type === 'bgd_2025' ? 28 : 30),
          shuffleQuestions: room.shuffleQuestions ?? true,
          shuffleOptions: room.shuffleOptions ?? true,
          examCode: room.randomExamCode ? String(Math.floor(100 + Math.random() * 900)) : (room.examCode || '101'),
          antiCheat: room.antiCheat || { enabled: false }
        });
      };
    }

    // 1. Nút thi Đề chuẩn Bộ GD&ĐT 2025
    const btnStartBgd = document.getElementById('btn-start-bgd-exam');
    if (btnStartBgd) {
      btnStartBgd.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));
        await this.startExam({
          type: 'bgd_2025',
          title: `Đề thi thử Tốt nghiệp THPT 2025 môn Tin học - Khối ${grade}`,
          grade,
          duration: 50,
          count: 28,
          examCode,
          shuffleQuestions,
          shuffleOptions,
          antiCheat
        });
      };
    }

    // 2. Nút thi Trộn theo Chủ đề
    const btnStartTopic = document.getElementById('btn-start-topic-exam');
    if (btnStartTopic) {
      btnStartTopic.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const topic = document.getElementById('exam-topic-select')?.value || 'all';
        const count = parseInt(document.getElementById('exam-topic-count')?.value || '20', 10);
        const duration = parseInt(document.getElementById('exam-topic-duration')?.value || '30', 10);
        const customTitle = document.getElementById('exam-topic-custom-title')?.value.trim();
        const title = customTitle || (topic === 'all' ? `Kiểm tra tổng hợp các chủ đề - Khối ${grade}` : `Kiểm tra ${topic} - Khối ${grade}`);
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));

        await this.startExam({
          type: 'by_topic',
          title,
          grade,
          topic: topic === 'all' ? null : topic,
          count,
          duration,
          examCode,
          shuffleQuestions,
          shuffleOptions,
          antiCheat
        });
      };
    }

    // 3. Nút thi Trộn theo Bài học (15 phút)
    const btnStartLesson = document.getElementById('btn-start-lesson-exam');
    if (btnStartLesson) {
      btnStartLesson.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const topic = document.getElementById('exam-lesson-topic-select')?.value;
        const lesson = document.getElementById('exam-lesson-select')?.value;

        if (!topic) {
          alert('Vui lòng chọn Chủ đề trước!');
          document.getElementById('exam-lesson-topic-select')?.focus();
          return;
        }
        if (!lesson) {
          alert('Vui lòng chọn Bài học cụ thể cần kiểm tra!');
          document.getElementById('exam-lesson-select')?.focus();
          return;
        }

        const count = parseInt(document.getElementById('exam-lesson-count')?.value || '10', 10);
        const duration = parseInt(document.getElementById('exam-lesson-duration')?.value || '15', 10);
        const title = `Kiểm tra 15 phút: ${lesson} - Khối ${grade}`;
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));

        await this.startExam({
          type: 'by_lesson',
          title,
          grade,
          topic,
          lesson,
          count,
          duration,
          examCode,
          shuffleQuestions,
          shuffleOptions,
          antiCheat
        });
      };
    }

    // 4. Nút thi Ma trận tự do
    const btnStartMatrix = document.getElementById('btn-start-matrix-exam');
    if (btnStartMatrix) {
      btnStartMatrix.onclick = async () => {
        const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const level = document.getElementById('exam-matrix-level')?.value || 'all';
        const count = parseInt(document.getElementById('exam-matrix-count')?.value || '30', 10);
        const duration = parseInt(document.getElementById('exam-matrix-duration')?.value || '45', 10);

        const levelNames = {
          '1': 'Mức 1: Nhận biết',
          '2': 'Mức 2: Thông hiểu',
          '3': 'Mức 3: Vận dụng',
          '4': 'Mức 4: Vận dụng cao',
          'DS': 'Dạng Đúng / Sai'
        };
        const levelSuffix = levelNames[level] ? ` (${levelNames[level]})` : '';
        const title = `Kiểm tra Tin học ${duration} phút - Khối ${grade}${levelSuffix}`;
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));

        await this.startExam({
          type: 'custom',
          title,
          grade,
          level,
          count,
          duration,
          examCode,
          shuffleQuestions,
          shuffleOptions,
          antiCheat
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
                  Khối ${escapeHtml(q.grade)}
                </span>
                <span class="text-xs text-slate-400">${escapeHtml(q.lesson || '')}</span>
              </div>

              <button data-remove-bm="${escapeHtml(q.id)}" class="text-xs text-rose-500 hover:text-rose-700 font-bold p-1">
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
                    <div class="p-2 rounded-lg border ${isCorrect ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">
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
              <div class="text-xs text-emerald-600 font-bold">Đáp án: ${escapeHtml(q.answer)}</div>
            `)}
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
      practiceBmBtn.addEventListener('click', async () => {
        await this.switchTab('practice');
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

    const validHistory = history.filter(h => !h.isDisqualified);
    const validScores = validHistory.map(h => Number(h.score) || 0);
    const maxScore = validScores.length > 0 ? Math.max(...validScores).toFixed(1) : '0.0';
    const avgScore = validScores.length > 0 ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2) : '0.00';
    const latestScore = validScores[0] ?? 0;
    const prevScore = validScores.length > 1 ? validScores[1] : null;
    const scoreDiff = prevScore !== null ? Math.round((latestScore - prevScore) * 100) / 100 : 0;

    let trendBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-slate-300';
    let trendLabel = 'Mới bắt đầu 🔄';
    let trendMsg = 'Bạn đã hoàn thành bài thi đầu tiên. Hãy làm thêm các đề thi để hệ thống đo lường tiến trình nhé!';

    if (validHistory.length >= 2) {
      if (scoreDiff >= 0.5 || (latestScore >= Number(avgScore) + 0.3 && latestScore >= 6.0)) {
        trendBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
        trendLabel = `Đang tiến bộ rất tốt 🚀 (+${scoreDiff > 0 ? scoreDiff : 0.5}đ)`;
        trendMsg = 'Xuất sắc! Điểm số bài thi gần nhất của bạn đã có bước nhảy vọt so với bài trước. Hãy tiếp tục giữ vững đà tiến bộ này!';
      } else if (Number(avgScore) >= 8.5 && latestScore >= 8.0) {
        trendBadge = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
        trendLabel = 'Phong độ Xuất sắc 🏆';
        trendMsg = 'Tuyệt vời! Bạn đang duy trì kết quả trên 8.5 điểm một cách liên tục và chắc chắn.';
      } else if (latestScore < 5.0 || Number(avgScore) < 5.0 || scoreDiff <= -1.0) {
        trendBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
        trendLabel = `Cần nỗ lực cố gắng thêm ⚠️ ${scoreDiff < 0 ? `(${scoreDiff}đ)` : ''}`;
        trendMsg = 'Kết quả bài thi gần đây đang ở mức cần cố gắng. Hãy vào mục "Luyện Câu Hay Sai" và làm các đề 15 phút theo bài học để củng cố lại lý thuyết nhé!';
      } else if (Number(avgScore) >= 6.5) {
        trendBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
        trendLabel = 'Khá & Ổn định ⚡';
        trendMsg = 'Bạn đang giữ phong độ khá ổn định. Cố gắng thêm một chút ở phần Đúng/Sai để nâng điểm lên mốc 8.5+!';
      } else {
        trendBadge = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
        trendLabel = 'Trung bình 📊';
        trendMsg = 'Cần luyện tập đều đặn mỗi ngày để bứt phá lên nhóm khá giỏi.';
      }
    } else {
      if (latestScore >= 8.5) {
        trendBadge = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
        trendLabel = 'Khởi đầu Xuất sắc 🏆';
      } else if (latestScore < 5.0) {
        trendBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
        trendLabel = 'Cần cố gắng ⚠️';
      }
    }

    // Lấy tối đa 8 bài gần nhất để vẽ mini chart
    const recentScores = [...validHistory].slice(0, 8).reverse();

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Bảng Tổng Hợp Tiến Trình Cá Nhân Của Bạn -->
        <div class="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-800/60 space-y-6 relative overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                  Học bạ cá nhân
                </span>
                <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${trendBadge}">
                  ${trendLabel}
                </span>
              </div>
              <h3 class="text-xl font-black text-white">
                Tiến Trình & Năng Lực Học Tập Của Bạn
              </h3>
              <p class="text-xs text-blue-200 mt-1">
                ${escapeHtml(trendMsg)}
              </p>
            </div>

            <button id="btn-clear-history" class="text-xs text-rose-300 hover:text-white font-bold px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/60 rounded-xl transition self-start sm:self-auto shrink-0 flex items-center gap-1.5">
              <i class="fa-solid fa-trash-can text-[11px]"></i> Xóa lịch sử
            </button>
          </div>

          <!-- 4 KPI cá nhân -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <span class="text-blue-200 block text-[11px] font-bold mb-1">Điểm Cao Nhất (Max)</span>
              <span class="text-2xl font-black text-amber-400 font-mono">${maxScore} đ</span>
              <span class="text-[10px] text-blue-300 block mt-0.5">Kỷ lục của bạn</span>
            </div>
            <div class="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <span class="text-blue-200 block text-[11px] font-bold mb-1">Điểm Trung Bình</span>
              <span class="text-2xl font-black text-emerald-400 font-mono">${avgScore} đ</span>
              <span class="text-[10px] text-blue-300 block mt-0.5">Qua ${history.length} bài thi</span>
            </div>
            <div class="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <span class="text-blue-200 block text-[11px] font-bold mb-1">Bài Thi Gần Nhất</span>
              <span class="text-2xl font-black text-white font-mono">${latestScore} đ</span>
              <span class="text-[10px] ${scoreDiff > 0 ? 'text-emerald-400 font-bold' : (scoreDiff < 0 ? 'text-rose-400 font-bold' : 'text-blue-300')} block mt-0.5">
                ${scoreDiff > 0 ? `Tăng +${scoreDiff}đ` : (scoreDiff < 0 ? `Giảm ${scoreDiff}đ` : 'Không đổi')}
              </span>
            </div>
            <div class="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-center">
              <span class="text-blue-200 block text-[11px] font-bold mb-1">Tổng Số Đề Đã Thi</span>
              <span class="text-2xl font-black text-indigo-300 font-mono">${history.length} đề</span>
              <span class="text-[10px] text-blue-300 block mt-0.5">Đã lưu kết quả</span>
            </div>
          </div>

          <!-- Mini Biểu Đồ Cột Tiến Trình Các Bài Thi Gần Nhất -->
          ${recentScores.length > 1 ? `
            <div class="pt-2">
              <span class="text-[11px] font-bold text-blue-200 block mb-2 flex items-center gap-1.5">
                <i class="fa-solid fa-chart-column text-emerald-400"></i> Xu hướng điểm qua các bài thi gần đây:
              </span>
              <div class="flex items-end gap-2.5 h-24 bg-black/25 p-3 rounded-2xl border border-white/10 overflow-x-auto">
                ${recentScores.map((h, i) => {
                  const s = Number(h.score) || 0;
                  const pct = Math.max(15, Math.round((s / 10) * 100));
                  let c = 'bg-blue-500';
                  if (s >= 8.5) c = 'bg-emerald-400';
                  else if (s < 5.0) c = 'bg-rose-400';
                  else if (s >= 6.5) c = 'bg-teal-400';
                  return `
                    <div class="flex-1 flex flex-col items-center justify-end h-full min-w-[28px] group relative">
                      <span class="text-[9px] font-bold text-blue-200 font-mono mb-0.5">${s}</span>
                      <div style="height: ${pct}%" class="w-full rounded-t-md ${c} shadow-sm group-hover:brightness-125 transition"></div>
                      <span class="text-[8px] text-blue-300 mt-1 font-mono">#${i+1}</span>
                      <div class="hidden group-hover:block absolute -top-8 bg-slate-900 text-white text-[10px] py-0.5 px-2 rounded whitespace-nowrap z-30 shadow-md">
                        ${escapeHtml(h.title)}: ${s}đ
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Danh Sách Toàn Bộ Lịch Sử Thi Thử -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h3 class="text-sm font-bold text-slate-800 dark:text-white flex items-center justify-between">
            <span>Chi Tiết Từng Lần Thi Thử (${history.length} bài)</span>
            <span class="text-xs text-slate-400 font-normal">Bấm "Xem chi tiết" để đối chiếu đáp án</span>
          </h3>

          <div class="space-y-3">
            ${history.map(item => {
              const date = new Date(item.date).toLocaleString('vi-VN');
              const mins = Math.floor(item.timeSpentSeconds / 60);
              const secs = item.timeSpentSeconds % 60;

              return `
                <div class="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-400 dark:hover:border-blue-500 transition">
                  <div>
                    <span class="text-xs text-slate-400 block mb-1">${date} • Khối ${escapeHtml(item.grade)}</span>
                    <h4 class="text-sm font-bold text-slate-800 dark:text-white">
                      ${escapeHtml(item.title)}
                    </h4>
                    <div class="flex items-center gap-2.5 text-xs text-slate-500 mt-2 flex-wrap">
                      ${item.examCode ? `<span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">Mã đề: ${escapeHtml(item.examCode)}</span>` : ''}
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
                    ${item.details && item.details.length > 0 ? `
                      <button data-review-history="${escapeHtml(item.id)}" class="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-eye"></i> Xem bài làm
                      </button>
                    ` : ''}
                    <div class="text-right shrink-0">
                      <span class="text-2xl font-black ${item.score >= 8 ? 'text-emerald-600 dark:text-emerald-400' : (item.score < 5 ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400')} font-mono">${item.score}</span>
                      <span class="text-[10px] text-slate-400 block font-bold uppercase">Điểm số</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-review-history]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-review-history');
        const target = history.find(h => h.id === id);
        if (!target) return;
        const grade = target.grade || this.currentGrade;
        await this.loadGradeData(grade);
        let questions = [...(this.gradeCache[grade] || [])];
        if (grade === '11') {
          await this.loadGradeData('12');
          const ds12 = (this.gradeCache['12'] || []).filter(q => q.level === 'DS');
          questions = [...questions, ...ds12];
        }
        await this.switchTab('exam-room');
        const roomEl = document.getElementById('view-exam-room');
        Exam.init(roomEl, questions, this.manifest);
        Exam.viewSavedResult(target);
      });
    });

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

  // --- QUẢN LÝ BẢNG ĐIỂM HỌC SINH & TIẾN TRÌNH (GRADEBOOK) ---
  renderGradebook() {
    const container = document.getElementById('gradebook-list-area');
    if (!container) return;
    Gradebook.init(container);
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
      this.enforceAuthentication();
    });

    // Mở modal đăng nhập
    document.querySelectorAll('[data-open-login-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modal-login');
        if (modal) {
          modal.classList.remove('hidden');
          modal.style.display = 'flex';
        }
        this.renderSavedAccountsInLoginModal();
        Auth.initGoogleIdentity();
      });
    });

    // Chuyển tab giữa Đăng Nhập & Đăng Ký trong modal
    const tabLoginBtn = document.getElementById('tab-btn-auth-login');
    const tabRegBtn = document.getElementById('tab-btn-auth-register');
    const panelLogin = document.getElementById('auth-panel-login');
    const panelRegister = document.getElementById('auth-panel-register');
    const btnSwitchToReg = document.getElementById('btn-switch-to-register');
    const btnSwitchToLogin = document.getElementById('btn-switch-to-login');

    const switchAuthTab = (tab) => {
      if (tab === 'register') {
        panelLogin?.classList.add('hidden');
        panelRegister?.classList.remove('hidden');
        tabLoginBtn?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        tabLoginBtn?.classList.add('text-slate-500', 'dark:text-slate-400');
        tabRegBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        tabRegBtn?.classList.remove('text-slate-500', 'dark:text-slate-400');
        Auth.initGoogleIdentity();
        Auth.setupSchoolClassSync({
          schoolSelectId: 'reg-input-school',
          customSchoolInputId: 'reg-input-school-custom',
          gradeSelectId: 'reg-input-grade',
          classSelectId: 'reg-input-class',
          customClassInputId: 'reg-input-class-custom',
          initialSchool: document.getElementById('reg-input-school')?.value || 'TT GDNN GDTX Chu Văn An',
          initialGrade: document.getElementById('reg-input-grade')?.value || '12',
          initialClass: document.getElementById('reg-input-class')?.value || '12A1'
        });
      } else {
        panelRegister?.classList.add('hidden');
        panelLogin?.classList.remove('hidden');
        tabRegBtn?.classList.remove('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        tabRegBtn?.classList.add('text-slate-500', 'dark:text-slate-400');
        tabLoginBtn?.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        tabLoginBtn?.classList.remove('text-slate-500', 'dark:text-slate-400');
        this.renderSavedAccountsInLoginModal();
        Auth.initGoogleIdentity();
      }
    };

    tabLoginBtn?.addEventListener('click', () => switchAuthTab('login'));
    tabRegBtn?.addEventListener('click', () => switchAuthTab('register'));
    btnSwitchToReg?.addEventListener('click', () => switchAuthTab('register'));
    btnSwitchToLogin?.addEventListener('click', () => switchAuthTab('login'));

    // Chuyển quyền trong form Đăng Ký
    const regRoleSelect = document.getElementById('reg-input-role');
    const regSecretWrapper = document.getElementById('reg-secret-code-wrapper');
    if (regRoleSelect && regSecretWrapper) {
      regRoleSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'teacher' || val === 'admin') {
          regSecretWrapper.classList.remove('hidden');
        } else {
          regSecretWrapper.classList.add('hidden');
        }
      });
    }

    // Submit Form Đăng Ký Tài Khoản
    const formRegister = document.getElementById('form-register-account');
    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('reg-input-fullname')?.value || '';
        const grade = document.getElementById('reg-input-grade')?.value || '12';
        const schoolSelectVal = document.getElementById('reg-input-school')?.value || '';
        const school = (schoolSelectVal === '__other__' ? document.getElementById('reg-input-school-custom')?.value?.trim() : schoolSelectVal) || '';
        const classSelectVal = document.getElementById('reg-input-class')?.value || '';
        const className = (classSelectVal === '__other__' ? document.getElementById('reg-input-class-custom')?.value?.trim() : classSelectVal) || '';
        const email = document.getElementById('reg-input-email')?.value || '';
        const password = document.getElementById('reg-input-password')?.value || '';
        const passwordConfirm = document.getElementById('reg-input-password-confirm')?.value || '';
        const role = document.getElementById('reg-input-role')?.value || 'student';
        const secretCode = document.getElementById('reg-input-secret')?.value || '';

        if (!school) {
          alert('Vui lòng chọn hoặc nhập tên Trường của bạn!');
          return;
        }
        if (!className) {
          alert('Vui lòng chọn hoặc nhập Lớp học của bạn!');
          return;
        }
        if (!email) {
          alert('Vui lòng nhập Email của bạn để phân biệt và định danh tài khoản duy nhất!');
          document.getElementById('reg-input-email')?.focus();
          return;
        }
        if (!password || password.length < 6) {
          alert('Mật khẩu cá nhân phải có tối thiểu 6 ký tự để bảo mật tài khoản!');
          document.getElementById('reg-input-password')?.focus();
          return;
        }
        if (password !== passwordConfirm) {
          alert('Mật khẩu xác nhận không khớp! Vui lòng nhập lại.');
          document.getElementById('reg-input-password-confirm')?.focus();
          return;
        }

        const res = Auth.registerUser({ fullName, grade, className, school, email, password, role, secretCode });
        if (!res.success) {
          alert(res.message);
          return;
        }

        alert(`🎉 Chúc mừng bạn ${res.user.fullName} đã đăng ký tài khoản thành công!`);
        if (grade !== this.currentGrade) {
          await this.switchGrade(grade);
        }
        this.enforceAuthentication();
      });
    }

    // Đóng các modal (ngăn không cho đóng nếu chưa xác thực)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        if (modalId === 'modal-login' && !Auth.isLoggedIn()) {
          alert('Hệ thống yêu cầu Đăng ký hoặc Đăng nhập để truy cập trang web!');
          return;
        }
        if (modalId === 'modal-required-profile' && !Auth.isProfileComplete()) {
          alert('Bạn bắt buộc phải điền đầy đủ Họ và tên, Lớp, Trường để tiếp tục!');
          return;
        }
        document.getElementById(modalId)?.classList.add('hidden');
      });
    });

    // Ngăn chặn tắt modal khi click ra backdrop nếu chưa đăng nhập
    const modalLoginEl = document.getElementById('modal-login');
    if (modalLoginEl) {
      modalLoginEl.addEventListener('click', (e) => {
        if (e.target === modalLoginEl && !Auth.isLoggedIn()) {
          e.stopPropagation();
        }
      });
    }
    const modalProfileEl = document.getElementById('modal-required-profile');
    if (modalProfileEl) {
      modalProfileEl.addEventListener('click', (e) => {
        if (e.target === modalProfileEl && !Auth.isProfileComplete()) {
          e.stopPropagation();
        }
      });
    }

    // 3 Nút đăng nhập trải nghiệm theo vai trò (HS, GV, Admin)
    document.getElementById('btn-demo-login-student')?.addEventListener('click', () => {
      Auth.loginWithGoogleDemo({ role: 'student' });
    });

    document.getElementById('btn-demo-login-teacher')?.addEventListener('click', () => {
      Auth.loginWithGoogleDemo({ role: 'teacher' });
    });

    document.getElementById('btn-demo-login-admin')?.addEventListener('click', () => {
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
        const schoolSelectVal = document.getElementById('profile-input-school')?.value || '';
        const school = (schoolSelectVal === '__other__' ? document.getElementById('profile-input-school-custom')?.value?.trim() : schoolSelectVal) || '';
        const classSelectVal = document.getElementById('profile-input-class')?.value || '';
        const className = (classSelectVal === '__other__' ? document.getElementById('profile-input-class-custom')?.value?.trim() : classSelectVal) || '';

        if (!fullName.trim()) {
          alert('Vui lòng nhập Họ và tên của bạn!');
          return;
        }
        if (!school) {
          alert('Vui lòng chọn hoặc nhập tên Trường của bạn!');
          return;
        }
        if (!className) {
          alert('Vui lòng chọn hoặc nhập Lớp của bạn!');
          return;
        }

        Auth.updateProfile({ fullName, grade, className, school });
        Auth.closeRequiredProfileModal();
        alert('Cập nhật thông tin học sinh thành công! Chúc bạn ôn tập tốt.');
        this.enforceAuthentication();
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

    // Form đăng nhập / đăng ký nhanh bằng Google (Gmail)
    const formGoogleQuick = document.getElementById('form-google-quick-signin');
    const modalGoogleQuick = document.getElementById('modal-google-quick-prompt');
    const btnQuickOpenOAuthCfg = document.getElementById('btn-google-quick-open-oauth-cfg');

    if (formGoogleQuick) {
      formGoogleQuick.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('google-quick-email')?.value || '';
        const fullName = document.getElementById('google-quick-name')?.value || '';
        if (!email.trim()) {
          alert('Vui lòng nhập địa chỉ Email Google của bạn!');
          return;
        }
        modalGoogleQuick?.classList.add('hidden');
        Auth.loginOrRegisterWithGoogleInfo({ email, fullName });
        this.enforceAuthentication();
      });
    }

    if (btnQuickOpenOAuthCfg) {
      btnQuickOpenOAuthCfg.addEventListener('click', () => {
        modalGoogleQuick?.classList.add('hidden');
        if (inputClientId) inputClientId.value = Auth.getGoogleClientId();
        modalGoogleConfig?.classList.remove('hidden');
      });
    }

    // Form đăng nhập bảo mật bằng Email / Tên tài khoản + Mật khẩu
    const formLoginDirect = document.getElementById('form-login-direct');
    if (formLoginDirect) {
      formLoginDirect.addEventListener('submit', (e) => {
        e.preventDefault();
        const identity = document.getElementById('login-input-identity')?.value?.trim();
        const password = document.getElementById('login-input-password')?.value?.trim();
        if (!identity) {
          alert('Vui lòng nhập Email hoặc Tên tài khoản của bạn!');
          document.getElementById('login-input-identity')?.focus();
          return;
        }
        if (!password) {
          alert('Vui lòng nhập Mật khẩu cá nhân để xác thực!');
          document.getElementById('login-input-password')?.focus();
          return;
        }
        const res = Auth.loginWithCredentials(identity, password);
        if (res.success) {
          alert(`Xin chào ${res.user.fullName}! Đăng nhập thành công.`);
          this.enforceAuthentication();
        } else {
          alert(res.message || 'Email hoặc mật khẩu không chính xác!');
        }
      });
    }

    // Nút bật/tắt xem mật khẩu trên form đăng nhập & đăng ký
    const btnToggleLoginPwd = document.getElementById('btn-toggle-login-pwd');
    if (btnToggleLoginPwd) {
      btnToggleLoginPwd.onclick = () => {
        const inp = document.getElementById('login-input-password');
        if (inp) {
          inp.type = inp.type === 'password' ? 'text' : 'password';
          btnToggleLoginPwd.innerHTML = inp.type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        }
      };
    }
    const btnToggleRegPwd = document.getElementById('btn-toggle-reg-pwd');
    if (btnToggleRegPwd) {
      btnToggleRegPwd.onclick = () => {
        const inp = document.getElementById('reg-input-password');
        if (inp) {
          inp.type = inp.type === 'password' ? 'text' : 'password';
          btnToggleRegPwd.innerHTML = inp.type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        }
      };
    }

    // Nút hủy/đổi tài khoản khác trên modal hoàn tất hồ sơ
    const btnCancelProfile = document.getElementById('btn-cancel-profile-logout');
    if (btnCancelProfile) {
      btnCancelProfile.addEventListener('click', () => {
        Auth.closeRequiredProfileModal();
        Auth.logout();
        this.enforceAuthentication();
      });
    }
  }

  // --- BẮT BUỘC ĐĂNG KÝ / ĐĂNG NHẬP TRƯỚC KHI VÀO TRANG ---
  enforceAuthentication() {
    const mainEl = document.getElementById('app-main');
    const headerEl = document.getElementById('app-header');
    const mobileBarEl = document.getElementById('mobile-bottom-nav');
    const loginModal = document.getElementById('modal-login');
    const closeBtn = document.getElementById('btn-close-login-modal');
    const gatekeeperOverlay = document.getElementById('auth-gatekeeper-overlay');
    const desktopNav = document.getElementById('desktop-nav');
    const authBtnLogin = document.getElementById('auth-btn-login');

    if (!Auth.isLoggedIn()) {
      document.documentElement.classList.remove('is-authenticated');
      document.documentElement.classList.remove('has-incomplete-profile');
      // Chưa đăng nhập -> KHÔNG khóa header để nút Đăng nhập trên navbar luôn bấm được!
      if (headerEl) headerEl.classList.remove('pointer-events-none');
      if (authBtnLogin) authBtnLogin.classList.remove('hidden');

      // Vô hiệu hóa thanh điều hướng tab trang
      if (desktopNav) {
        desktopNav.querySelectorAll('button').forEach(b => {
          b.classList.add('pointer-events-none', 'opacity-40');
        });
      }
      if (mobileBarEl) mobileBarEl.classList.add('hidden');
      if (closeBtn) closeBtn.classList.add('hidden');

      // Khóa vùng nội dung chính
      if (mainEl) mainEl.classList.add('pointer-events-none', 'select-none', 'filter', 'blur-sm');

      // Hiển thị modal đăng nhập và thanh nhắc nhở
      if (loginModal) {
        loginModal.classList.remove('hidden');
        loginModal.style.setProperty('display', 'flex', 'important');
        this.renderSavedAccountsInLoginModal();
        Auth.initGoogleIdentity();
      }
      if (gatekeeperOverlay) gatekeeperOverlay.classList.remove('hidden');
    } else if (!Auth.isProfileComplete()) {
      document.documentElement.classList.remove('is-authenticated');
      document.documentElement.classList.add('has-incomplete-profile');
      // Đã đăng nhập nhưng chưa hoàn tất Họ tên, Lớp, Trường
      if (headerEl) headerEl.classList.remove('pointer-events-none');
      if (desktopNav) {
        desktopNav.querySelectorAll('button').forEach(b => {
          b.classList.add('pointer-events-none', 'opacity-40');
        });
      }
      if (mainEl) mainEl.classList.add('pointer-events-none', 'select-none', 'filter', 'blur-sm');
      if (mobileBarEl) mobileBarEl.classList.add('hidden');
      if (loginModal) {
        loginModal.classList.add('hidden');
        loginModal.style.setProperty('display', 'none', 'important');
      }
      if (gatekeeperOverlay) gatekeeperOverlay.classList.remove('hidden');
      Auth.openRequiredProfileModal();
    } else {
      document.documentElement.classList.add('is-authenticated');
      document.documentElement.classList.remove('has-incomplete-profile');
      // Đã đăng nhập và hoàn tất hồ sơ -> Mở khóa toàn bộ hệ thống
      if (mainEl) mainEl.classList.remove('pointer-events-none', 'select-none', 'filter', 'blur-sm');
      if (headerEl) headerEl.classList.remove('pointer-events-none');
      if (desktopNav) {
        desktopNav.querySelectorAll('button').forEach(b => {
          b.classList.remove('pointer-events-none', 'opacity-40');
        });
      }
      if (mobileBarEl) mobileBarEl.classList.remove('hidden');
      if (loginModal) {
        loginModal.classList.add('hidden');
        loginModal.style.setProperty('display', 'none', 'important');
      }
      if (closeBtn) closeBtn.classList.remove('hidden');
      if (gatekeeperOverlay) gatekeeperOverlay.classList.add('hidden');
      Auth.closeRequiredProfileModal();

      // Nếu học sinh truy cập qua link phòng thi trực tiếp (?room=XYZ), tự động mở màn hình vào phòng thi
      if (this.pendingRoomParam) {
        const roomCode = this.pendingRoomParam;
        this.pendingRoomParam = null;
        this.switchTab('exam-setup');
        setTimeout(() => {
          const input = document.getElementById('input-enter-room-id');
          if (input) {
            input.value = roomCode;
            document.getElementById('input-enter-room-pwd')?.focus();
          }
        }, 150);
      }
    }
  }

  renderSavedAccountsInLoginModal() {
    const section = document.getElementById('saved-accounts-section');
    const listEl = document.getElementById('saved-accounts-list');
    if (!section || !listEl) return;

    const accounts = Storage.getAccountsList();
    if (accounts.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    listEl.innerHTML = accounts.slice(0, 5).map(acc => {
      const avatar = acc.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(acc.fullName || 'HS')}&background=${acc.role === 'admin' ? 'ef4444' : (acc.role === 'teacher' ? '8b5cf6' : '3b82f6')}&color=fff`;
      let roleLabel = 'Học sinh';
      let roleBg = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      if (acc.role === 'admin') {
        roleLabel = 'Admin';
        roleBg = 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
      } else if (acc.role === 'teacher') {
        roleLabel = 'Giáo viên';
        roleBg = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      }

      const idAttr = acc.uid ? `data-login-uid="${escapeHtml(acc.uid)}"` : `data-login-email="${escapeHtml(acc.email)}"`;

      return `
        <button type="button" ${idAttr} class="w-full p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-800 text-left flex items-center justify-between gap-3 transition shadow-sm hover:scale-[1.01]">
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="${avatar}" alt="avatar" class="w-8 h-8 rounded-xl object-cover shrink-0" />
            <div class="min-w-0">
              <span class="block text-xs font-bold text-slate-800 dark:text-white truncate">${escapeHtml(acc.fullName)}</span>
              <span class="block text-[10px] text-slate-400 truncate">${escapeHtml(acc.className ? `Lớp ${acc.className}` : '')} ${escapeHtml(acc.school ? `• ${acc.school}` : '')}</span>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-1.5">
            <span class="text-[9px] font-bold px-2 py-0.5 rounded ${roleBg}">${roleLabel}</span>
            <i class="fa-solid fa-chevron-right text-[10px] text-slate-400"></i>
          </div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('[data-login-uid], [data-login-email]').forEach(btn => {
      btn.onclick = () => {
        const uid = btn.getAttribute('data-login-uid');
        const email = btn.getAttribute('data-login-email');
        const res = Auth.loginWithSavedAccount(uid || email);
        if (res.success) {
          this.enforceAuthentication();
        }
      };
    });
  }

  updateRolePermissionsUI(user) {
    const isTeacher = Auth.isTeacher();
    const isAdmin = Auth.isAdmin();
    const isStudent = Auth.isStudent();

    // Ẩn/hiển thị các tab & nút theo quyền yêu cầu
    document.querySelectorAll('[data-role-req="teacher"]').forEach(el => {
      el.classList.toggle('hidden', !isTeacher);
    });

    document.querySelectorAll('[data-role-req="admin"]').forEach(el => {
      el.classList.toggle('hidden', !isAdmin);
    });

    document.querySelectorAll('[data-role-req="student"]').forEach(el => {
      el.classList.toggle('hidden', !isStudent);
    });

    // Cập nhật nhãn vai trò tại Hub Giáo viên trên Home (nếu có)
    const hubRoleLabel = document.getElementById('home-teacher-role-label');
    if (hubRoleLabel) {
      hubRoleLabel.textContent = Auth.getRoleLabel();
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

// Khởi tạo ứng dụng an toàn cho cả khi DOM đã sẵn sàng hoặc đang nạp
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.AppInstance = new App();
      window.AppInstance.init();
    });
  } else {
    window.AppInstance = new App();
    window.AppInstance.init();
  }
}

