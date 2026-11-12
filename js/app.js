/**
 * TIN HỌC HUB - MASTER APP CONTROLLER
 * Hệ thống Ôn tập & Thi thử Tin học THPT - Chuẩn GDPT 2018
 */

import { Storage, CURRENT_BUILD, getCachedJson, setCachedJson } from './storage.js?v=20261112_285';
import { getAvatarDataUrl } from './avatars.js?v=20261112_285';
import { authedFetch } from './api.js?v=20261112_285';
import { Practice } from './practice.js?v=20261112_285';
import { Exam } from './exam.js?v=20261112_285';
import { Search } from './search.js?v=20261112_285';
import { PrintManager } from './print.js?v=20261112_285';
import { Auth } from './auth.js?v=20261112_285';
import { escapeHtml } from './utils.js?v=20261112_285';
import { Leaderboard } from './leaderboard.js?v=20261112_285';
import { QuestionsManager } from './questions-manager.js?v=20261112_285';
import { ExamRooms } from './exam-rooms.js?v=20261112_285';
import { Proctor } from './proctor.js?v=20261112_285';
import { Gradebook } from './gradebook.js?v=20261112_285';
import { CloudSync } from './cloud-sync.js?v=20261112_285';

// Dynamic loaders cho các module đồ sộ (chỉ tải khi mở tính năng tương ứng)
async function getAdminManager() {
  if (window.AdminManager) return window.AdminManager;
  const mod = await import(`./admin-manager.js?v=${CURRENT_BUILD}`);
  window.AdminManager = mod.AdminManager;
  return mod.AdminManager;
}

async function getInteractiveVideo() {
  if (window.InteractiveVideo) return window.InteractiveVideo;
  const mod = await import(`./interactive-video.js?v=${CURRENT_BUILD}`);
  window.InteractiveVideo = mod.InteractiveVideo;
  return mod.InteractiveVideo;
}

async function getLiveVideo() {
  if (window.LiveVideo) return window.LiveVideo;
  const mod = await import(`./live-video.js?v=${CURRENT_BUILD}`);
  window.LiveVideo = mod.LiveVideo;
  return mod.LiveVideo;
}

async function getArena() {
  if (window.Arena) return window.Arena;
  const mod = await import(`./arena.js?v=${CURRENT_BUILD}`);
  window.Arena = mod.default || mod.Arena;
  return window.Arena;
}

async function getRandomPicker() {
  if (window.RandomPicker) return window.RandomPicker;
  const mod = await import(`./random-picker.js?v=${CURRENT_BUILD}`);
  window.RandomPicker = mod.default || mod.RandomPicker;
  return window.RandomPicker;
}

if (typeof window !== 'undefined') {
  window.CURRENT_BUILD = CURRENT_BUILD;
  window.Auth = Auth;
  window.Storage = Storage;
  window.Practice = Practice;
  window.Exam = Exam;
  window.Search = Search;
  window.PrintManager = PrintManager;
  window.Leaderboard = Leaderboard;
  window.QuestionsManager = QuestionsManager;
  window.Proctor = Proctor;
  window.ExamRooms = ExamRooms;
  window.Gradebook = Gradebook;
  window.CloudSync = CloudSync;
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

    // Lắng nghe sự kiện đồng bộ Cloud toàn cục để tự động re-render các màn hình đang mở
    window.addEventListener('tinhoc-cloud-synced', () => {
      if (this.currentTab === 'home') {
        this.renderHome();
      } else if (this.currentTab === 'gradebook') {
        this.renderGradebook();
      } else if (this.currentTab === 'leaderboard') {
        if (typeof Leaderboard !== 'undefined') Leaderboard.render();
      } else if (this.currentTab === 'exam-rooms') {
        if (typeof ExamRooms !== 'undefined') ExamRooms.render();
      } else if (this.currentTab === 'history') {
        this.renderHistory();
      } else if (this.currentTab === 'bookmarks') {
        this.renderBookmarks();
      } else if (this.currentTab === 'questions-manage') {
        if (typeof QuestionsManager !== 'undefined') QuestionsManager.render();
      } else if (this.currentTab === 'admin-system') {
        if (window.AdminManager && typeof window.AdminManager.syncS3InputsFromStorage === 'function') {
          window.AdminManager.syncS3InputsFromStorage();
        }
      }
      this.renderSavedAccountsInLoginModal();
    });

    // Tự động đẩy cấu hình Auth lên máy chủ nếu client này đã có API Key (từ tài khoản Admin)
    try {
      const localAuth = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : null;
      if (localAuth && localAuth.apiKey && String(localAuth.apiKey).startsWith('AIza')) {
        CloudSync.pushAuthConfigToCloud(localAuth);
      }
    } catch (e) {}


    // Khóa giao diện và mở modal đăng nhập NGAY LẬP TỨC (không chờ nạp manifest / đề thi)
    this.enforceAuthentication();

    await this.loadManifest();
    await this.switchGrade(this.currentGrade);
    this.renderHome();

    // Tự động nhận diện mã phòng thi hoặc đấu trường game qua URL param
    const urlParams = new URLSearchParams(window.location.search);
    const arenaParam = urlParams.get('game') || urlParams.get('pin');
    if (arenaParam) {
      setTimeout(() => this.switchTab('arena'), 300);
    }
    const roomParam = urlParams.get('room') || urlParams.get('phong');
    if (roomParam) {
      this.pendingRoomParam = roomParam.trim().toUpperCase();
    }

    const liveParam = urlParams.get('live_video') || urlParams.get('live_room');
    if (liveParam) {
      this.pendingLiveVideoParam = liveParam.trim().toUpperCase();
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

  // --- DATA LOADING & CLIENT PERSISTENT CACHE ---
  async loadManifest() {
    try {
      // 1. Kiểm tra cache IndexedDB trước (0ms latency, zero network bandwidth)
      const cached = await Storage.getCachedJson('manifest', CURRENT_BUILD);
      if (cached && typeof cached === 'object' && cached.grades) {
        this.manifest = cached;
        this.updateManifestBadges();
        if (window.LiveVideo) window.LiveVideo.manifest = this.manifest;
        return this.manifest;
      }

      // 2. Cache miss: tải qua mạng với cache-busting chuẩn
      const res = await fetch(`data/manifest.json?v=${CURRENT_BUILD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = await res.json();
      this.updateManifestBadges();
      if (window.LiveVideo) window.LiveVideo.manifest = this.manifest;

      // 3. Lưu vào IndexedDB cache chạy ngầm (không chặn flow)
      Storage.setCachedJson('manifest', CURRENT_BUILD, this.manifest).catch(() => {});
      return this.manifest;
    } catch (e) {
      console.error('Không thể nạp file manifest.json', e);
    }
  }

  async loadGradeData(grade) {
    if (!this.rawGradeCache) this.rawGradeCache = {};
    const cleanGrade = String(grade).replace(/^grade_/, '').replace(/\.json$/, '');
    if (this.rawGradeCache[grade] || this.rawGradeCache[cleanGrade]) {
      const raw = this.rawGradeCache[grade] || this.rawGradeCache[cleanGrade];
      const customized = Storage.applyCustomizations(cleanGrade, raw);
      this.gradeCache[grade] = customized;
      this.gradeCache[cleanGrade] = customized;
      return customized;
    }

    const cacheKey = `grade_${cleanGrade}`;

    // 1. Kiểm tra cache IndexedDB trước (0ms latency, zero network bandwidth!)
    try {
      const cached = await Storage.getCachedJson(cacheKey, CURRENT_BUILD);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        this.rawGradeCache[grade] = cached;
        this.rawGradeCache[cleanGrade] = cached;
        const customized = Storage.applyCustomizations(cleanGrade, cached);
        this.gradeCache[grade] = customized;
        this.gradeCache[cleanGrade] = customized;
        return customized;
      }
    } catch (cacheErr) {
      console.warn(`[Cache] Không thể đọc cache IndexedDB cho ${cacheKey}:`, cacheErr);
    }

    // 2. Cache miss: hiển thị loading và tải qua mạng với cache-busting
    this.showGlobalLoading(true);
    try {
      const res = await fetch(`data/grade_${cleanGrade}.json?v=${CURRENT_BUILD}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.rawGradeCache[grade] = data;
      this.rawGradeCache[cleanGrade] = data;
      this.showGlobalLoading(false);

      // Lưu vào cache IndexedDB chạy ngầm (không chặn flow)
      Storage.setCachedJson(cacheKey, CURRENT_BUILD, data).catch(() => {});

      const customized = Storage.applyCustomizations(cleanGrade, data);
      this.gradeCache[grade] = customized;
      this.gradeCache[cleanGrade] = customized;
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
      if (window.InteractiveVideo) window.InteractiveVideo.setGrade(grade);
    } else if (this.currentTab === 'exam-setup') {
      this.renderExamSetup();
    } else if (this.currentTab === 'search') {
      await this.initSearchView();
    } else if (this.currentTab === 'print') {
      this.renderPrintSetup();
    } else if (this.currentTab === 'questions-manage') {
      QuestionsManager.currentGrade = grade;
      await QuestionsManager.loadGrade(grade);
      QuestionsManager.render();
    }
  }

  // --- ROUTING / TABS ---
  async switchTab(tab, submode = null) {
    // Cảnh báo nếu thí sinh đang làm bài thi mà bấm chuyển sang tab khác
    if (this.currentTab === 'exam-room' && tab !== 'exam-room' && Exam.examState === 'taking') {
      const confirmLeave = confirm('Bạn đang trong quá trình làm bài thi thử. Nếu rời khỏi phòng thi lúc này, bài làm chưa nộp sẽ bị hủy.\nBạn có chắc chắn muốn thoát không?');
      if (!confirmLeave) return false;
      Exam.resetState();
    }

    // Tự động dọn dẹp phòng học video tương tác nếu rời tab
    if (this.currentTab === 'interactive-video' && tab !== 'interactive-video') {
      if (window.InteractiveVideo && window.InteractiveVideo.activeLesson) {
        window.InteractiveVideo.cleanupActivePlayer();
        window.InteractiveVideo.activeLesson = null;
      }
      if (window.LiveVideo && window.LiveVideo.activeRoom) {
        window.LiveVideo.cleanupSession();
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
    if (tab === 'gradebook' && !Auth.isTeacher()) {
      // Học sinh không xem được sổ điểm lớp -> Tự động chuyển hướng sang Lịch sử làm bài của chính học sinh
      this.switchTab('history');
      return false;
    }
    if (tab === 'exam-rooms' && !Auth.isTeacher()) {
      // Học sinh không quản lý phòng thi -> Tự động chuyển hướng sang màn hình Kiểm tra trực tuyến
      this.switchTab('exam-setup');
      return false;
    }
    if ((tab === 'questions-manage' || tab === 'print') && !Auth.isTeacher()) {
      alert('Chức năng này dành cho Giáo viên (GV) & Quản trị viên (Admin)!\nHọc sinh vui lòng tham gia thi thử và xem bảng vinh danh.');
      return false;
    }

    this.currentTab = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Tự động kéo dữ liệu mới nhất từ Cloud ngay khi chuyển sang các tab kết quả / phòng thi
    if (['home', 'gradebook', 'leaderboard', 'exam-rooms', 'history', 'questions-manage'].includes(tab)) {
      if (CloudSync && typeof CloudSync.syncAll === 'function') {
        CloudSync.syncAll(false);
      }
    }

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
      'view-exam-rooms', 'view-interactive-video', 'view-arena', 'view-random-picker'
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
        await this.initPracticeView(submode || 'questions');
        break;
      case 'exam-setup':
        document.getElementById('view-exam-setup')?.classList.remove('hidden');
        this.renderExamSetup();
        break;
      case 'exam-rooms':
        document.getElementById('view-exam-rooms')?.classList.remove('hidden');
        ExamRooms.init(document.getElementById('exam-rooms-list-area'), this.manifest);
        CloudSync.syncRooms().then(() => ExamRooms.render()).catch(() => {});
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
        CloudSync.syncHistory().then(() => this.renderHistory()).catch(() => {});
        break;
      case 'print':
        document.getElementById('view-print')?.classList.remove('hidden');
        this.renderPrintSetup();
        break;
      case 'gradebook':
        document.getElementById('view-gradebook')?.classList.remove('hidden');
        this.renderGradebook();
        CloudSync.syncHistory().then(() => this.renderGradebook()).catch(() => {});
        break;
      case 'leaderboard':
        document.getElementById('view-leaderboard')?.classList.remove('hidden');
        Leaderboard.init(document.getElementById('leaderboard-area'));
        CloudSync.syncHistory().then(() => Leaderboard.render()).catch(() => {});
        break;
      case 'interactive-video':
        document.getElementById('view-interactive-video')?.classList.remove('hidden');
        {
          const iv = await getInteractiveVideo();
          await iv.init(
            document.getElementById('view-interactive-video'),
            this.manifest,
            (g) => this.loadGradeData(g),
            this.currentGrade
          );
        }
        break;
      case 'arena':
        document.getElementById('view-arena')?.classList.remove('hidden');
        {
          const ar = await getArena();
          await ar.init(
            document.getElementById('view-arena'),
            this.manifest,
            (g) => this.loadGradeData(g)
          );
        }
        break;
      case 'random-picker':
        if (!Auth.isTeacher() && !Auth.isAdmin()) {
          alert('Tính năng Vòng quay gọi tên & Chia nhóm lớp học chỉ dành riêng cho Thầy/Cô Giáo viên tổ chức hoạt động lớp!');
          this.switchTab('home');
          return;
        }
        document.getElementById('view-random-picker')?.classList.remove('hidden');
        {
          const rp = await getRandomPicker();
          await rp.init(
            document.getElementById('view-random-picker'),
            this.manifest,
            (g) => this.loadGradeData(g)
          );
        }
        break;
      case 'questions-manage':
        document.getElementById('view-questions-manage')?.classList.remove('hidden');
        QuestionsManager.init(document.getElementById('questions-manage-area'), this.manifest, (g) => this.loadGradeData(g));
        CloudSync.syncCustomQuestions().then(() => QuestionsManager.render()).catch(() => {});
        break;
      case 'admin-system':
        document.getElementById('view-admin-system')?.classList.remove('hidden');
        {
          const am = await getAdminManager();
          am.init(document.getElementById('admin-system-area'), this.manifest);
        }
        break;
    }
  }

  // --- HOME VIEW ---
  renderHome() {
    const stats = Storage.getPracticeStats();
    const history = Auth.isStudent() ? Storage.getUserExamHistory(Auth.getCurrentUser()) : Storage.getExamHistory();
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

    // Hiển thị danh sách nhiệm vụ & bài tập Thầy/Cô đã giao cho lớp của học sinh này
    this.renderStudentAssignedTasks();

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

          <!-- Hàng 3: Mini-Game & Random Picker Lớp Học -->
          ${(Auth.isTeacher() || Auth.isAdmin()) ? `
<div class="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 rounded-3xl border border-white/10 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-amber-500/30 animate-bounce">
                🎲
              </div>
              <div>
                <h4 class="text-sm font-black text-white flex items-center gap-2">
                  <span>Trợ Giảng Thông Minh: Vòng Quay Gọi Tên & Chia Nhóm Học Tập</span>
                  <span class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">Mới</span>
                </h4>
                <p class="text-xs text-slate-300 mt-0.5">
                  Vòng quay may mắn, Máy quay xèng, Hộp quà bí ẩn, Bom nổ chậm & Chia nhóm ngẫu nhiên
                </p>
              </div>
            </div>
            <button type="button" id="btn-home-open-random-picker" class="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black transition shrink-0 shadow-lg flex items-center justify-center gap-2">
              <i class="fa-solid fa-play"></i> <span>Mở Trò Chơi Ngay</span>
            </button>
          </div>
` : ''}
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

      homeStatsContainer.querySelector('#btn-home-open-random-picker')?.addEventListener('click', () => {
        this.switchTab('random-picker');
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
                ${escapeHtml(t.name)}
              </h4>
            </div>
            <div class="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium">${t.total} câu hỏi</span>
              <button data-practice-topic="${escapeHtml(t.name)}" class="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition flex items-center gap-1">
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

  // --- NHIỆM VỤ & BÀI THI THẦY/CÔ GIAO CHO HỌC SINH (STUDENT ASSIGNED TASKS DASHBOARD) ---
  async renderStudentAssignedTasks() {
    const container = document.getElementById('home-student-assigned-tasks');
    if (!container) return;

    const user = Auth.getCurrentUser();
    const isStudent = Auth.isStudent();
    const isTeacher = Auth.isTeacher() || Auth.isAdmin();

    // 1. Nếu chưa đăng nhập: Hiển thị banner khuyến khích đăng nhập
    if (!Auth.isLoggedIn()) {
      container.innerHTML = `
        <div class="p-6 rounded-3xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/30 text-white flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
          <div class="flex items-center gap-3.5 text-center sm:text-left">
            <div class="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-300 flex items-center justify-center text-xl shrink-0 mx-auto sm:mx-0 shadow-inner">
              <i class="fa-solid fa-user-graduate"></i>
            </div>
            <div>
              <h4 class="text-sm sm:text-base font-bold">Xem bài tập & đề thi Thầy/Cô giao cho lớp em</h4>
              <p class="text-xs text-slate-300 mt-0.5">Đăng nhập tài khoản để nhận ngay các bài kiểm tra do Giáo viên trường em phân công.</p>
            </div>
          </div>
          <button type="button" id="btn-home-task-login" class="px-5 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-blue-50 text-xs font-black transition shadow-lg shrink-0 hover:scale-[1.02] active:scale-[0.98]">
            <i class="fa-solid fa-arrow-right-to-bracket text-blue-600"></i> Đăng Nhập Ngay
          </button>
        </div>
      `;
      container.querySelector('#btn-home-task-login')?.addEventListener('click', () => {
        Auth.openLoginModal();
      });
      return;
    }

    // 2. Kéo danh sách phòng thi mới nhất
    const rooms = Storage.getExamRooms();
    const history = isStudent ? Storage.getUserExamHistory(user) : Storage.getExamHistory();
    const now = new Date();

    // Lọc các phòng thi khớp với học sinh (theo Trường, Khối, Lớp)
    const matchingRooms = rooms.filter(room => {
      // Nếu là Giáo viên/Admin đang xem trang chủ, hiển thị tất cả bài thi đang mở
      if (isTeacher) return true;

      // Khớp Khối lớp
      const matchGrade = (!room.grade || room.grade === user?.grade);

      // Khớp Trường
      const matchSchool = (room.targetSchool === 'all' || !room.targetSchool || (user?.school && room.targetSchool.toLowerCase() === user.school.toLowerCase()));

      // Khớp Lớp
      const matchClass = (room.targetClass === 'all' || !room.targetClass || (user?.className && room.targetClass.toLowerCase() === user.className.toLowerCase()));

      return matchGrade && matchSchool && matchClass;
    });

    // 3. Kiểm tra tiết học Live Video đang diễn ra trên Firebase RTDB
    let activeLiveRoom = null;
    try {
      const dbUrl = CloudSync.getBaseUrl();
      const res = await authedFetch(`${dbUrl}/live_video_rooms.json`, { cache: 'no-cache' });
      if (res.ok) {
        const liveData = await res.json();
        if (liveData) {
          const list = Object.values(liveData);
          activeLiveRoom = list.find(r => {
            if (!r || r.state === 'finished' || r.state === 'closed') return false;
            const isActivelyLive = (window.LiveVideo && typeof window.LiveVideo.isRoomActivelyLive === 'function')
              ? window.LiveVideo.isRoomActivelyLive(r)
              : ((Date.now() - Number(r.updatedAt || r.createdAt || 0)) < 30 * 60 * 1000);
            if (!isActivelyLive) {
              // Tự động đóng ngầm phòng cũ bị treo để không bao giờ hiện nhầm là đang Live
              if (window.LiveVideo && typeof window.LiveVideo.closeOrDeleteRoom === 'function' && r.roomId) {
                window.LiveVideo.closeOrDeleteRoom(r.roomId, true);
              }
              return false;
            }
            if (isTeacher) return true;
            const matchGrade = (!r.grade || r.grade === user?.grade);
            const matchSchool = (r.school === 'all' || !r.school || (user?.school && r.school.toLowerCase() === user.school.toLowerCase()));
            const matchClass = (r.className === 'all' || !r.className || (user?.className && r.className.toLowerCase() === user.className.toLowerCase()));
            return matchGrade && matchSchool && matchClass;
          });
        }
      }
    } catch (e) {}

    // Phân loại phòng thi theo trạng thái đối với học sinh này
    const categorized = matchingRooms.map(room => {
      // Kiểm tra xem đã nộp bài chưa
      const record = history.find(h => (h.roomId && h.roomId.toUpperCase() === room.id.toUpperCase()) || (h.examTitle && h.examTitle.includes(room.id)));
      
      const start = room.startTime ? new Date(room.startTime) : null;
      const end = room.endTime ? new Date(room.endTime) : null;

      let status = 'pending'; // 'pending' | 'completed' | 'upcoming' | 'expired'
      if (record) {
        status = 'completed';
      } else if (start && now < start) {
        status = 'upcoming';
      } else if (end && now > end) {
        status = 'expired';
      } else {
        status = 'pending';
      }

      return { room, record, status, start, end };
    });

    // Sắp xếp: Cần làm ngay lên đầu -> Sắp mở -> Đã nộp -> Quá hạn
    const statusOrder = { pending: 1, upcoming: 2, completed: 3, expired: 4 };
    categorized.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

    const pendingCount = categorized.filter(c => c.status === 'pending').length;
    const completedCount = categorized.filter(c => c.status === 'completed').length;

    let html = `
      <div class="space-y-4 animate-fadeIn">
        
        <!-- BANNER TIẾT HỌC TRỰC TUYẾN LIVE VIDEO (NẾU CÓ PHÒNG ĐANG MỞ) -->
        ${activeLiveRoom ? `
          <div class="p-5 rounded-3xl bg-gradient-to-r from-rose-600 via-rose-700 to-indigo-800 text-white shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-rose-400/40 relative overflow-hidden group">
            <div class="relative z-10 flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl shrink-0 shadow-inner group-hover:scale-110 transition animate-pulse">
                <i class="fa-solid fa-tower-broadcast text-white"></i>
              </div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2.5 py-0.5 rounded-full bg-white text-rose-700 text-[10px] font-black uppercase tracking-wider shadow-sm animate-pulse">
                    🔴 Đang phát trực tiếp
                  </span>
                  <span class="text-xs font-mono text-rose-200">Mã: <strong>${escapeHtml(activeLiveRoom.roomId)}</strong></span>
                </div>
                <h4 class="text-sm sm:text-base font-black text-white leading-snug">
                  ${escapeHtml(activeLiveRoom.title || activeLiveRoom.lessonTitle)}
                </h4>
                <p class="text-xs text-rose-100 mt-0.5">
                  Thầy/Cô: <strong>${escapeHtml(activeLiveRoom.hostName || 'Giáo viên')}</strong> • Lớp: <strong>${escapeHtml(activeLiveRoom.className)}</strong>
                </p>
              </div>
            </div>

            <div class="relative z-10 flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button type="button" data-home-join-live="${escapeHtml(activeLiveRoom.roomId)}" class="flex-1 sm:flex-initial px-6 py-3 rounded-2xl bg-white text-rose-700 hover:bg-slate-100 font-black text-xs sm:text-sm shadow-xl transition flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]">
                <i class="fa-solid ${isTeacher ? 'fa-sliders' : 'fa-ticket'}"></i> ${isTeacher ? 'Vào Điều Khiển Phòng Live' : 'Vào Lớp Trực Tuyến Ngay'}
              </button>
              ${isTeacher ? `
                <button type="button" data-home-close-live="${escapeHtml(activeLiveRoom.roomId)}" class="px-4 py-3 rounded-2xl bg-rose-950/60 hover:bg-rose-900 text-rose-100 border border-rose-400/40 font-bold text-xs shadow-lg transition flex items-center justify-center gap-1.5" title="Đóng / Kết thúc phòng Live này">
                  <i class="fa-solid fa-power-off"></i> Đóng Phòng
                </button>
              ` : ''}
            </div>
            <div class="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
          </div>
        ` : ''}

        <!-- KHUNG NHIỆM VỤ CHÍNH -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-xs font-bold uppercase tracking-wider mb-1.5 border border-rose-200/60 dark:border-rose-900/60">
                <i class="fa-solid fa-list-check"></i> Nhiệm vụ & Bài tập Thầy / Cô giao
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg sm:text-xl font-black text-slate-800 dark:text-white">
                  Bài Kiểm Tra Của Lớp ${escapeHtml(user?.className || 'Của Em')} ${user?.school ? `• ${escapeHtml(user.school)}` : ''}
                </h3>
                <button type="button" onclick="window.openEditProfileModal()" class="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-[11px] font-bold border border-blue-200 dark:border-blue-800 transition flex items-center gap-1" title="Đổi Lớp hoặc Trường học">
                  <i class="fa-solid fa-pen-to-square"></i> Đổi Lớp / Trường
                </button>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">
                Các đề kiểm tra định kỳ, 15 phút và bài tập do Giáo viên phân công cho lớp
              </p>
            </div>

            <div class="flex items-center gap-2">
              ${pendingCount > 0 ? `
                <span class="px-3.5 py-1.5 rounded-full bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-500/30 flex items-center gap-1.5 animate-pulse">
                  <span class="w-2 h-2 rounded-full bg-white"></span> ${pendingCount} bài cần làm ngay
                </span>
              ` : `
                <span class="px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold text-xs border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-check"></i> ${completedCount > 0 ? `Đã hoàn thành ${completedCount} bài` : 'Chưa có bài tồn đọng'}
                </span>
              `}
            </div>
          </div>

          <!-- Danh sách thẻ bài tập -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${categorized.length === 0 ? `
              <div class="col-span-full py-8 text-center space-y-3">
                <div class="w-14 h-14 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl mx-auto shadow-inner">
                  <i class="fa-solid fa-circle-check"></i>
                </div>
                <div class="space-y-1">
                  <h4 class="text-sm font-bold text-slate-800 dark:text-white">Tuyệt vời! Lớp ${escapeHtml(user?.className || '')} không có bài tập nào tồn đọng</h4>
                  <p class="text-xs text-slate-400 max-w-md mx-auto">Em có thể luyện tập thêm các câu hỏi hay sai hoặc làm bài thi thử tự do để chuẩn bị tốt cho kỳ thi nhé.</p>
                </div>
                <div class="flex items-center justify-center gap-3 pt-2">
                  <button type="button" onclick="window.AppInstance.switchTab('practice', 'mockexam')" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm">
                    <i class="fa-solid fa-stopwatch"></i> Tự thi thử
                  </button>
                  <button type="button" data-tab-target="practice" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition">
                    <i class="fa-solid fa-book-open"></i> Ôn tập câu hỏi
                  </button>
                </div>
              </div>
            ` : categorized.map(item => this.renderAssignedTaskCard(item)).join('')}
          </div>

        </div>

      </div>
    `;

    container.innerHTML = html;
    this.bindStudentAssignedTasksEvents(container);
  }

  renderAssignedTaskCard({ room, record, status, start, end }) {
    const isPending = (status === 'pending');
    const isCompleted = (status === 'completed');
    const isUpcoming = (status === 'upcoming');
    const isExpired = (status === 'expired');

    const durationText = `${room.duration || 50} phút`;
    const questionCountText = `${room.questionCount || 28} câu`;
    const teacherName = room.creatorName || 'Thầy/Cô Giáo viên';

    let timeLabel = '';
    if (end) {
      const diffMs = end - new Date();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays > 0) timeLabel = `Còn ${diffDays} ngày (Hạn: ${end.toLocaleDateString('vi-VN')})`;
      else if (diffMs > 0) timeLabel = `Hạn chót: Hôm nay ${end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
      else timeLabel = `Hết hạn: ${end.toLocaleDateString('vi-VN')}`;
    }

    if (isPending) {
      return `
        <div class="p-5 rounded-2xl border-2 border-rose-500/50 bg-rose-50/30 dark:bg-rose-950/20 shadow-md hover:shadow-lg transition flex flex-col justify-between space-y-4 relative group">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1 shadow-sm">
                <i class="fa-solid fa-circle-exclamation"></i> CẦN LÀM NGAY
              </span>
              <span class="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                ${durationText} • ${questionCountText}
              </span>
            </div>

            <div>
              <h4 class="text-sm font-black text-slate-800 dark:text-white line-clamp-2 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                ${escapeHtml(room.title)}
              </h4>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <span><i class="fa-solid fa-chalkboard-user text-blue-500"></i> ${escapeHtml(teacherName)}</span>
                <span>•</span>
                <span class="font-mono text-slate-400">Mã: ${escapeHtml(room.id)}</span>
              </p>
            </div>
          </div>

          <div class="space-y-2 pt-2 border-t border-rose-200/40 dark:border-rose-900/40">
            ${timeLabel ? `<div class="text-[11px] text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1"><i class="fa-regular fa-clock"></i> ${timeLabel}</div>` : ''}
            <button type="button" data-enter-assigned-room="${escapeHtml(room.id)}" data-room-pwd="${escapeHtml(room.password || '')}" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs font-black transition shadow-lg shadow-rose-600/25 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.98]">
              <i class="fa-solid fa-rocket"></i> Vào Làm Bài Ngay
            </button>
          </div>
        </div>
      `;
    }

    if (isCompleted) {
      const score = Number(record.score) || 0;
      const scoreColor = score >= 8.0 ? 'text-emerald-600 dark:text-emerald-400' : (score >= 5.0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400');
      const displayMode = record.resultDisplayMode || room.resultDisplayMode || 'both';
      const isPrivileged = Auth.isTeacher() || Auth.isAdmin();
      const isHidden = !isPrivileged && displayMode === 'hidden';
      const isScoreOnly = !isPrivileged && displayMode === 'score_only';

      return `
        <div class="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 shadow-sm flex flex-col justify-between space-y-4">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <i class="fa-solid fa-circle-check text-emerald-500"></i> ĐÃ HOÀN THÀNH
              </span>
              ${isHidden ? `
                <span class="text-xs font-bold font-mono px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                  <i class="fa-solid fa-lock text-[10px] mr-1"></i>ĐÃ NỘP BÀI
                </span>
              ` : `
                <span class="text-sm font-black font-mono ${scoreColor}">
                  ${score.toFixed(1)} / 10đ
                </span>
              `}
            </div>

            <div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white line-clamp-2">
                ${escapeHtml(room.title)}
              </h4>
              <p class="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                ${isHidden ? `
                  <span>Đã lưu vào Sổ điểm</span>
                ` : `
                  <span>Đúng ${record.correctCount || 0}/${record.totalQuestions || 0} câu</span>
                `}
                <span>•</span>
                <span>${record.submittedAt ? new Date(record.submittedAt).toLocaleDateString('vi-VN') : ''}</span>
              </p>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" data-view-assigned-result="${escapeHtml(record.id || room.id)}" class="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5">
              ${isHidden ? `
                <i class="fa-solid fa-receipt text-purple-500"></i> Xem Biên Bản Nộp Bài
              ` : (isScoreOnly ? `
                <i class="fa-solid fa-chart-simple text-blue-500"></i> Xem Điểm Số Của Bạn
              ` : `
                <i class="fa-solid fa-eye text-blue-500"></i> Xem Lại Kết Quả & Đáp Án
              `)}
            </button>
          </div>
        </div>
      `;
    }

    if (isUpcoming) {
      return `
        <div class="p-5 rounded-2xl border border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm flex flex-col justify-between space-y-4 opacity-90">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1">
                <i class="fa-solid fa-clock"></i> SẮP MỞ ĐỀ
              </span>
              <span class="text-xs font-mono text-slate-400">${durationText}</span>
            </div>

            <div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white line-clamp-2">
                ${escapeHtml(room.title)}
              </h4>
              <p class="text-[11px] text-slate-400 mt-1">
                Thầy/Cô: ${escapeHtml(teacherName)}
              </p>
            </div>
          </div>

          <div class="space-y-2 pt-2 border-t border-amber-200/40 dark:border-amber-900/40">
            <div class="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              Mở lúc: ${start ? start.toLocaleString('vi-VN') : 'Đang cập nhật'}
            </div>
            <button type="button" disabled class="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-medium cursor-not-allowed">
              Chưa Đến Giờ Mở Thi
            </button>
          </div>
        </div>
      `;
    }

    // isExpired
    return `
      <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shadow-sm flex flex-col justify-between space-y-4 opacity-60">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
              ĐÃ HẾT HẠN
            </span>
            <span class="text-xs font-mono text-slate-400">Mã: ${escapeHtml(room.id)}</span>
          </div>

          <div>
            <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300 line-clamp-2">
              ${escapeHtml(room.title)}
            </h4>
            <p class="text-[11px] text-slate-400 mt-1">Đã đóng đề lúc: ${end ? end.toLocaleDateString('vi-VN') : ''}</p>
          </div>
        </div>

        <div class="pt-2 border-t border-slate-200 dark:border-slate-700">
          <button type="button" disabled class="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-medium cursor-not-allowed">
            Đã Kết Thúc Đợt Thi
          </button>
        </div>
      </div>
    `;
  }

  bindStudentAssignedTasksEvents(container) {
    // 1. Vào làm bài ngay 1 chạm
    container.querySelectorAll('[data-enter-assigned-room]').forEach(btn => {
      btn.onclick = () => {
        const roomId = btn.getAttribute('data-enter-assigned-room');
        const pwd = btn.getAttribute('data-room-pwd') || '';
        this.enterRoomDirectly(roomId, pwd);
      };
    });

    // 2. Xem lại kết quả bài đã thi
    container.querySelectorAll('[data-view-assigned-result]').forEach(btn => {
      btn.onclick = async () => {
        const targetId = btn.getAttribute('data-view-assigned-result');
        const history = Storage.getExamHistory();
        const record = history.find(h => h.id === targetId || h.roomId === targetId);
        if (record) {
          const grade = record.grade || this.currentGrade || '12';
          await this.loadGradeData(grade);
          const questions = [...(this.gradeCache[grade] || [])];
          await this.switchTab('exam-room');
          const roomEl = document.getElementById('view-exam-room');
          Exam.init(roomEl, questions, this.manifest);
          Exam.viewSavedResult(record);
        } else {
          this.switchTab('history');
        }
      };
    });

    // 3. Vào lớp Live Video trực tuyến
    container.querySelectorAll('[data-home-join-live]').forEach(btn => {
      btn.onclick = async () => {
        const liveId = btn.getAttribute('data-home-join-live');
        const lv = await getLiveVideo();
        await lv.handleJoinRoomSubmit(liveId);
      };
    });

    // 4. Đóng phòng Live Video trực tuyến (Dành cho Admin & GV)
    container.querySelectorAll('[data-home-close-live]').forEach(btn => {
      btn.onclick = async () => {
        const liveId = btn.getAttribute('data-home-close-live');
        if (confirm(`Bạn có chắc chắn muốn đóng / kết thúc phòng trực tuyến "${liveId}"?`)) {
          if (window.LiveVideo && typeof window.LiveVideo.closeOrDeleteRoom === 'function') {
            await window.LiveVideo.closeOrDeleteRoom(liveId, false);
            this.renderStudentAssignedTasks();
          }
        }
      };
    });
  }

  async enterRoomDirectly(roomId, defaultPassword = '') {
    if (!roomId) return;
    await this.switchTab('exam-setup');

    setTimeout(async () => {
      const idInput = document.getElementById('input-enter-room-id');
      const pwdInput = document.getElementById('input-enter-room-pwd');
      const btnEnter = document.getElementById('btn-enter-room-exam');

      if (idInput) idInput.value = roomId.trim().toUpperCase();
      if (pwdInput && defaultPassword) pwdInput.value = defaultPassword;

      // Kéo phòng từ Cloud
      if (CloudSync.isConfigured()) {
        try {
          await CloudSync.fetchRoomFromCloud(roomId);
        } catch (e) {}
      }

      if (btnEnter) {
        btnEnter.click();
      }
    }, 150);
  }

  // --- PRACTICE & MOCK EXAMS VIEW ---
  async initPracticeView(targetSubmode = 'questions') {
    // 1. Chuyển đổi giữa 2 phân khu: Ôn tập câu hỏi vs Tự thi thử
    const btnSubQuestions = document.getElementById('btn-practice-submode-questions');
    const btnSubMockexam = document.getElementById('btn-practice-submode-mockexam');
    const subviewQuestions = document.getElementById('practice-subview-questions');
    const subviewMockexam = document.getElementById('practice-subview-mockexam');

    const switchSubmode = (mode) => {
      const isMock = (mode === 'mockexam');
      if (subviewQuestions) subviewQuestions.classList.toggle('hidden', isMock);
      if (subviewMockexam) subviewMockexam.classList.toggle('hidden', !isMock);

      if (btnSubQuestions) {
        btnSubQuestions.classList.toggle('bg-white', !isMock);
        btnSubQuestions.classList.toggle('dark:bg-slate-800', !isMock);
        btnSubQuestions.classList.toggle('text-blue-600', !isMock);
        btnSubQuestions.classList.toggle('dark:text-blue-400', !isMock);
        btnSubQuestions.classList.toggle('shadow-sm', !isMock);
        btnSubQuestions.classList.toggle('text-slate-600', isMock);
        btnSubQuestions.classList.toggle('dark:text-slate-400', isMock);
      }

      if (btnSubMockexam) {
        btnSubMockexam.classList.toggle('bg-white', isMock);
        btnSubMockexam.classList.toggle('dark:bg-slate-800', isMock);
        btnSubMockexam.classList.toggle('text-blue-600', isMock);
        btnSubMockexam.classList.toggle('dark:text-blue-400', isMock);
        btnSubMockexam.classList.toggle('shadow-sm', isMock);
        btnSubMockexam.classList.toggle('text-slate-600', !isMock);
        btnSubMockexam.classList.toggle('dark:text-slate-400', !isMock);
      }

      if (isMock) {
        this.renderMockExamSetup();
      }
    };

    if (btnSubQuestions) btnSubQuestions.onclick = () => switchSubmode('questions');
    if (btnSubMockexam) btnSubMockexam.onclick = () => switchSubmode('mockexam');

    if (targetSubmode === 'mockexam') {
      switchSubmode('mockexam');
    } else {
      switchSubmode('questions');
    }

    // 2. Khởi tạo dữ liệu câu hỏi luyện tập
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
      const excludeMastered = !!document.getElementById('practice-cfg-exclude-mastered')?.checked;
      Practice.filter(g, t, l, lvl, excludeMastered);
    };

    if (topicSelect) topicSelect.onchange = () => { updateLessons(); doFilter(); };
    if (lessonSelect) lessonSelect.onchange = doFilter;
    if (levelSelect) levelSelect.onchange = doFilter;
    const pExcludeMastered = document.getElementById('practice-cfg-exclude-mastered');
    if (pExcludeMastered) pExcludeMastered.onchange = doFilter;
    if (gradeSelect) {
      gradeSelect.onchange = async (e) => {
        await this.switchGrade(e.target.value);
        this.populatePracticeFilters();
        if (typeof this.renderMockExamSetup === 'function') {
          this.renderMockExamSetup();
        }
      };
    }
  }

  // --- MOCK EXAM SETUP (BỘ CÔNG CỤ TỰ THI THỬ TRONG PHÂN KHU ÔN TẬP) ---
  renderMockExamSetup() {
    const gradeSelect = document.getElementById('exam-cfg-grade');
    if (gradeSelect) {
      gradeSelect.value = this.currentGrade;
      gradeSelect.onchange = (e) => {
        this.populateExamSetupDropdowns(e.target.value);
      };
    }

    const getExamShuffleConfig = () => {
      return {
        shuffleQuestions: true,
        shuffleOptions: true,
        antiCheat: {
          enabled: true,
          maxViolations: 3,
          enforceFullscreen: true,
          preventTabSwitch: true,
          disableCopyPaste: true,
          blockDevTools: true,
          detectSplitScreen: true
        }
      };
    };

    // Chuyển đổi giữa 4 chế độ tạo đề thi thử (Tabs)
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
          t.classList.toggle('border-blue-600', isSelected);
          t.classList.toggle('bg-blue-50/60', isSelected);
          t.classList.toggle('dark:bg-blue-950/40', isSelected);
          t.classList.toggle('ring-2', isSelected);
          t.classList.toggle('ring-blue-500/20', isSelected);
          t.classList.toggle('shadow-sm', isSelected);

          t.classList.toggle('border-slate-200', !isSelected);
          t.classList.toggle('dark:border-slate-700', !isSelected);
          t.classList.toggle('bg-white', !isSelected);
          t.classList.toggle('dark:bg-slate-800/80', !isSelected);

          const badge = t.querySelector('.mode-badge');
          if (badge) {
            badge.classList.toggle('bg-blue-600', isSelected);
            badge.classList.toggle('text-white', isSelected);
            badge.classList.toggle('bg-slate-100', !isSelected);
            badge.classList.toggle('dark:bg-slate-700', !isSelected);
            badge.classList.toggle('text-slate-600', !isSelected);
            badge.classList.toggle('dark:text-slate-300', !isSelected);
          }
        });

        Object.keys(panels).forEach(key => {
          if (panels[key]) {
            panels[key].classList.toggle('hidden', key !== targetMode);
          }
        });
      };
    });

    const grade = gradeSelect ? gradeSelect.value : this.currentGrade;
    this.populateExamSetupDropdowns(grade);

    // 1. Nút thi Đề chuẩn Bộ GD&ĐT 2025
    const btnStartBgd = document.getElementById('btn-start-bgd-exam');
    if (btnStartBgd) {
      btnStartBgd.onclick = async () => {
        const curGrade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));
        await this.startExam({
          type: 'bgd_2025',
          title: `Đề thi thử Tốt nghiệp THPT 2025 môn Tin học - Khối ${curGrade}`,
          grade: curGrade,
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
        const curGrade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const topic = document.getElementById('exam-topic-select')?.value || 'all';
        const count = parseInt(document.getElementById('exam-topic-count')?.value || '20', 10);
        const duration = parseInt(document.getElementById('exam-topic-duration')?.value || '30', 10);
        const customTitle = document.getElementById('exam-topic-custom-title')?.value.trim();
        const title = customTitle || (topic === 'all' ? `Thi thử tổng hợp các chủ đề - Khối ${curGrade}` : `Thi thử ${topic} - Khối ${curGrade}`);
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));

        await this.startExam({
          type: 'by_topic',
          title,
          grade: curGrade,
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

    // 3. Nút thi Trộn theo Bài học (1 hoặc nhiều bài, ôn toàn bộ hoặc tùy chọn)
    const btnStartLesson = document.getElementById('btn-start-lesson-exam');
    if (btnStartLesson) {
      btnStartLesson.onclick = async () => {
        const curGrade = gradeSelect ? gradeSelect.value : this.currentGrade;
        const isSingleMode = this.lessonSubMode !== 'multi';
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));
        const rawCount = document.getElementById('exam-lesson-count')?.value || 'all';
        const count = (rawCount === 'all') ? 'all' : parseInt(rawCount, 10);
        const duration = parseInt(document.getElementById('exam-lesson-duration')?.value || '15', 10);
        const excludeMastered = !!document.getElementById('exam-lesson-exclude-mastered')?.checked;
        const customTitle = document.getElementById('exam-lesson-custom-title')?.value.trim();

        if (count === 0) {
          alert('Không còn câu hỏi nào phù hợp với bộ lọc (tất cả câu đã làm đúng)! Hãy bỏ chọn "Bỏ qua các câu đã làm đúng" hoặc bấm "Ôn lại từ đầu".');
          return;
        }

        if (isSingleMode) {
          const topic = document.getElementById('exam-lesson-topic-select')?.value;
          const lesson = document.getElementById('exam-lesson-select')?.value;

          if (!topic) {
            alert('Vui lòng chọn Chủ đề trước!');
            document.getElementById('exam-lesson-topic-select')?.focus();
            return;
          }
          if (!lesson) {
            alert('Vui lòng chọn Bài học cụ thể cần ôn luyện!');
            document.getElementById('exam-lesson-select')?.focus();
            return;
          }

          const defaultTitle = duration === 0
            ? `Ôn tập toàn bộ: ${lesson} - Khối ${curGrade}`
            : `Thi thử: ${lesson} (${duration} phút) - Khối ${curGrade}`;
          const title = customTitle || defaultTitle;

          await this.startExam({
            type: 'by_lesson',
            title,
            grade: curGrade,
            topic,
            lesson,
            count,
            duration,
            excludeMastered,
            examCode,
            shuffleQuestions,
            shuffleOptions,
            antiCheat
          });
        } else {
          // Multi-lessons mode
          const checkedBoxes = Array.from(document.querySelectorAll('#exam-lesson-multi-checklist input[type="checkbox"]:checked'));
          if (checkedBoxes.length === 0) {
            alert('Vui lòng tích chọn ít nhất 1 bài học để tạo đề ôn luyện!');
            return;
          }

          const selectedLessons = checkedBoxes.map(cb => ({
            lesson: cb.value,
            topic: cb.getAttribute('data-topic')
          }));

          const defaultTitle = duration === 0
            ? `Ôn tập tổng hợp ${selectedLessons.length} bài học - Khối ${curGrade}`
            : `Thi thử tổng hợp ${selectedLessons.length} bài học (${duration} phút) - Khối ${curGrade}`;
          const title = customTitle || defaultTitle;

          await this.startExam({
            type: 'by_lesson',
            title,
            grade: curGrade,
            selectedLessons,
            count,
            duration,
            excludeMastered,
            examCode,
            shuffleQuestions,
            shuffleOptions,
            antiCheat
          });
        }
      };
    }

    // 4. Nút thi Ma trận tự do
    const btnStartMatrix = document.getElementById('btn-start-matrix-exam');
    if (btnStartMatrix) {
      btnStartMatrix.onclick = async () => {
        const curGrade = gradeSelect ? gradeSelect.value : this.currentGrade;
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
        const title = `Thi thử Tin học ${duration} phút - Khối ${curGrade}${levelSuffix}`;
        const { shuffleQuestions, shuffleOptions, antiCheat } = getExamShuffleConfig();
        const examCode = String(Math.floor(100 + Math.random() * 900));

        await this.startExam({
          type: 'custom',
          title,
          grade: curGrade,
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

  // Hàm điền dữ liệu Chủ đề & Bài học theo Khối
  populateExamSetupDropdowns(grade) {
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

    // 2. Panel Theo Bài học (1 bài hoặc kết hợp nhiều bài)
    this.setupLessonExamUI(grade, gradeData);

    // 3. Cập nhật mã đề thi ngẫu nhiên gợi ý
    const bgdCodeEl = document.getElementById('bgd-suggested-code');
    if (bgdCodeEl) {
      bgdCodeEl.textContent = `Mã đề ${Math.floor(100 + Math.random() * 900)}`;
    }
  }


  // Quản lý toàn bộ giao diện và logic Panel Luyện Theo Bài Học (1 bài hoặc nhiều bài, ôn toàn bộ, loại trừ câu đã làm đúng)
  setupLessonExamUI(grade, gradeData) {
    this.lessonSubMode = this.lessonSubMode || 'single';
    const topics = Object.keys(gradeData.topics || {});

    const btnSingle = document.getElementById('btn-lesson-mode-single');
    const btnMulti = document.getElementById('btn-lesson-mode-multi');
    const singleBox = document.getElementById('lesson-submode-single-box');
    const multiBox = document.getElementById('lesson-submode-multi-box');
    const topicSelect = document.getElementById('exam-lesson-topic-select');
    const lessonSelect = document.getElementById('exam-lesson-select');
    const multiTopicFilter = document.getElementById('exam-lesson-multi-topic-filter');
    const multiChecklist = document.getElementById('exam-lesson-multi-checklist');
    const btnCheckAll = document.getElementById('btn-lesson-multi-check-all');
    const btnUncheckAll = document.getElementById('btn-lesson-multi-uncheck-all');
    const multiSummaryText = document.getElementById('lesson-multi-summary-text');
    const excludeMasteredCb = document.getElementById('exam-lesson-exclude-mastered');
    const btnResetProgress = document.getElementById('btn-reset-lesson-progress');
    const masteredStatsText = document.getElementById('lesson-mastered-stats-text');
    const remainingStatsText = document.getElementById('lesson-remaining-stats-text');
    const progressBar = document.getElementById('lesson-mastered-progress-bar');
    const countSelect = document.getElementById('exam-lesson-count');

    // Helper: Cập nhật dropdown số lượng câu hỏi
    const updateCountDropdown = (availableCount, totalCount) => {
      if (!countSelect) return;
      if (availableCount <= 0) {
        countSelect.innerHTML = `<option value="0">Tất cả câu hỏi đã làm đúng! Bấm "Ôn lại từ đầu" để làm lại</option>`;
        return;
      }
      let html = `<option value="all" selected>Toàn bộ câu hỏi (${availableCount} câu - Ôn trọn vẹn)</option>`;
      const steps = [10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
      steps.forEach(s => {
        if (s < availableCount) {
          html += `<option value="${s}">${s} câu (${s <= 15 ? 'Kiểm tra 15p' : (s <= 25 ? 'Kiểm tra 1 tiết' : 'Luyện đề dài')})</option>`;
        }
      });
      countSelect.innerHTML = html;
    };

    // Helper: Cập nhật thống kê và dropdown cho Single Lesson
    const updateSingleStats = () => {
      const selTopic = topicSelect?.value;
      const selLesson = lessonSelect?.value;
      if (!selTopic || !selLesson || !gradeData.topics[selTopic]?.lessons[selLesson]) {
        if (masteredStatsText) masteredStatsText.textContent = '🎯 Đã nắm vững: 0/0 câu (0%)';
        if (remainingStatsText) remainingStatsText.textContent = 'Còn lại: 0 câu cần ôn';
        if (progressBar) progressBar.style.width = '0%';
        if (countSelect) countSelect.innerHTML = `<option value="all">Vui lòng chọn bài học ở trên</option>`;
        return;
      }

      const totalLessonQ = gradeData.topics[selTopic].lessons[selLesson].total || 0;
      const masteredIds = Storage.getMasteredQuestionIds(grade, selTopic, selLesson);
      const masteredCount = masteredIds.size;
      const remainingCount = Math.max(0, totalLessonQ - masteredCount);
      const pct = totalLessonQ > 0 ? Math.round((masteredCount / totalLessonQ) * 100) : 0;

      if (masteredStatsText) masteredStatsText.textContent = `🎯 Đã nắm vững: ${masteredCount}/${totalLessonQ} câu (${pct}%)`;
      if (remainingStatsText) remainingStatsText.textContent = `Còn lại: ${remainingCount} câu cần ôn`;
      if (progressBar) progressBar.style.width = `${pct}%`;

      const isExclude = excludeMasteredCb?.checked;
      const available = isExclude ? remainingCount : totalLessonQ;
      updateCountDropdown(available, totalLessonQ);
    };

    // Helper: Cập nhật thống kê và dropdown cho Multi Lessons
    const updateMultiStats = () => {
      if (!multiChecklist) return;
      const checkedBoxes = Array.from(multiChecklist.querySelectorAll('input[type="checkbox"]:checked'));
      if (checkedBoxes.length === 0) {
        if (multiSummaryText) multiSummaryText.textContent = 'Chưa chọn bài học nào. Vui lòng tích chọn các bài cần ôn.';
        if (masteredStatsText) masteredStatsText.textContent = '🎯 Đã nắm vững: 0/0 câu (0%)';
        if (remainingStatsText) remainingStatsText.textContent = 'Còn lại: 0 câu cần ôn';
        if (progressBar) progressBar.style.width = '0%';
        if (countSelect) countSelect.innerHTML = `<option value="all">Vui lòng tích chọn bài học ở trên</option>`;
        return;
      }

      let totalQ = 0;
      let totalMastered = 0;
      checkedBoxes.forEach(cb => {
        const c = parseInt(cb.getAttribute('data-count') || '0', 10);
        const t = cb.getAttribute('data-topic');
        const l = cb.value;
        totalQ += c;
        const m = Storage.getMasteredQuestionIds(grade, t, l);
        totalMastered += m.size;
      });

      const remainingQ = Math.max(0, totalQ - totalMastered);
      const pct = totalQ > 0 ? Math.round((totalMastered / totalQ) * 100) : 0;

      if (multiSummaryText) multiSummaryText.textContent = `Đã chọn: ${checkedBoxes.length} bài học • Tổng cộng: ${totalQ} câu hỏi`;
      if (masteredStatsText) masteredStatsText.textContent = `🎯 Đã nắm vững: ${totalMastered}/${totalQ} câu (${pct}%)`;
      if (remainingStatsText) remainingStatsText.textContent = `Còn lại: ${remainingQ} câu cần ôn`;
      if (progressBar) progressBar.style.width = `${pct}%`;

      const isExclude = excludeMasteredCb?.checked;
      const available = isExclude ? remainingQ : totalQ;
      updateCountDropdown(available, totalQ);
    };

    // Chuyển đổi tab Single vs Multi
    const switchSubMode = (mode) => {
      this.lessonSubMode = mode;
      const isSingle = (mode === 'single');
      if (singleBox) singleBox.classList.toggle('hidden', !isSingle);
      if (multiBox) multiBox.classList.toggle('hidden', isSingle);

      if (btnSingle) {
        btnSingle.className = isSingle
          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 text-white shadow-xs transition'
          : 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-teal-600 transition';
      }
      if (btnMulti) {
        btnMulti.className = !isSingle
          ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 text-white shadow-xs transition'
          : 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-teal-600 transition';
      }

      if (isSingle) {
        updateSingleStats();
      } else {
        updateMultiStats();
      }
    };

    if (btnSingle) btnSingle.onclick = () => switchSubMode('single');
    if (btnMulti) btnMulti.onclick = () => switchSubMode('multi');

    // 1. Setup Single Mode Dropdowns
    if (topicSelect) {
      let ltHtml = `<option value="">-- Vui lòng chọn chủ đề --</option>`;
      topics.forEach(t => {
        ltHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${gradeData.topics[t].total} câu)</option>`;
      });
      topicSelect.innerHTML = ltHtml;

      topicSelect.onchange = () => {
        const selTopic = topicSelect.value;
        if (!selTopic || !gradeData.topics[selTopic]) {
          lessonSelect.innerHTML = `<option value="">-- Vui lòng chọn chủ đề trước --</option>`;
          lessonSelect.disabled = true;
          updateSingleStats();
          return;
        }
        const lessons = Object.keys(gradeData.topics[selTopic].lessons || {});
        let lHtml = `<option value="">-- Chọn bài học --</option>`;
        lessons.forEach(l => {
          const count = gradeData.topics[selTopic].lessons[l].total;
          lHtml += `<option value="${escapeHtml(l)}">${escapeHtml(l)} (${count} câu)</option>`;
        });
        lessonSelect.innerHTML = lHtml;
        lessonSelect.disabled = false;
        updateSingleStats();
      };
    }

    if (lessonSelect) {
      lessonSelect.onchange = updateSingleStats;
    }

    // 2. Setup Multi Mode Checklist & Filter
    if (multiTopicFilter) {
      let mtfHtml = `<option value="all">Tất cả chủ đề trong Khối ${grade} (${gradeData.total} câu)</option>`;
      topics.forEach(t => {
        mtfHtml += `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${gradeData.topics[t].total} câu)</option>`;
      });
      multiTopicFilter.innerHTML = mtfHtml;

      const renderChecklist = () => {
        if (!multiChecklist) return;
        const filterTopic = multiTopicFilter.value;
        let html = '';

        topics.forEach(t => {
          if (filterTopic !== 'all' && filterTopic !== t) return;
          const lessons = Object.keys(gradeData.topics[t]?.lessons || {});
          if (lessons.length === 0) return;

          html += `
            <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5">
              <div class="text-[11px] font-bold text-teal-700 dark:text-teal-300 flex items-center justify-between">
                <span><i class="fa-solid fa-folder-open mr-1"></i> ${escapeHtml(t)}</span>
                <span class="text-[10px] text-slate-400 font-normal">${gradeData.topics[t].total} câu</span>
              </div>
              <div class="space-y-1 pl-1">
          `;

          lessons.forEach(l => {
            const count = gradeData.topics[t].lessons[l].total;
            const mastered = Storage.getMasteredQuestionIds(grade, t, l).size;
            const masteredBadge = mastered > 0
              ? `<span class="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded">Đã đúng ${mastered}/${count}</span>`
              : '';

            html += `
              <label class="flex items-center justify-between p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer text-xs transition">
                <div class="flex items-center gap-2 min-w-0 pr-2">
                  <input type="checkbox" name="exam-lesson-multi-item" value="${escapeHtml(l)}" data-topic="${escapeHtml(t)}" data-count="${count}" class="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer shrink-0" />
                  <span class="font-medium text-slate-700 dark:text-slate-200 truncate">${escapeHtml(l)}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  ${masteredBadge}
                  <span class="text-[10px] font-semibold text-slate-400">${count} câu</span>
                </div>
              </label>
            `;
          });

          html += `
              </div>
            </div>
          `;
        });

        multiChecklist.innerHTML = html;

        // Gắn listener change cho từng checkbox
        multiChecklist.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.onchange = updateMultiStats;
        });
        updateMultiStats();
      };

      multiTopicFilter.onchange = renderChecklist;
      renderChecklist();
    }

    if (btnCheckAll && multiChecklist) {
      btnCheckAll.onclick = () => {
        multiChecklist.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = true;
        });
        updateMultiStats();
      };
    }

    if (btnUncheckAll && multiChecklist) {
      btnUncheckAll.onclick = () => {
        multiChecklist.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = false;
        });
        updateMultiStats();
      };
    }

    // 3. Setup Checkbox Exclude Mastered
    if (excludeMasteredCb) {
      excludeMasteredCb.onchange = () => {
        if (this.lessonSubMode === 'single') {
          updateSingleStats();
        } else {
          updateMultiStats();
        }
      };
    }

    // 4. Setup Nút Reset Tiến Trình Bài Học
    if (btnResetProgress) {
      btnResetProgress.onclick = () => {
        if (this.lessonSubMode === 'single') {
          const selTopic = topicSelect?.value;
          const selLesson = lessonSelect?.value;
          if (!selTopic || !selLesson) {
            alert('Vui lòng chọn bài học cần đặt lại tiến trình!');
            return;
          }
          if (!confirm(`Bạn có chắc muốn đặt lại tiến trình nắm vững câu hỏi của "${selLesson}" để ôn lại từ đầu không?`)) {
            return;
          }
          Storage.clearMasteredQuestions(grade, selTopic, selLesson);
          updateSingleStats();
          alert(`Đã đặt lại tiến trình của "${selLesson}" thành công!`);
        } else {
          const checkedBoxes = Array.from(multiChecklist.querySelectorAll('input[type="checkbox"]:checked'));
          if (checkedBoxes.length === 0) {
            alert('Vui lòng chọn các bài học cần đặt lại tiến trình!');
            return;
          }
          if (!confirm(`Bạn có chắc muốn đặt lại tiến trình câu hỏi của ${checkedBoxes.length} bài học đã chọn để ôn lại từ đầu không?`)) {
            return;
          }
          checkedBoxes.forEach(cb => {
            const t = cb.getAttribute('data-topic');
            const l = cb.value;
            Storage.clearMasteredQuestions(grade, t, l);
          });
          if (multiTopicFilter) multiTopicFilter.dispatchEvent(new Event('change'));
          updateMultiStats();
          alert(`Đã đặt lại tiến trình của ${checkedBoxes.length} bài học thành công!`);
        }
      };
    }

    // Thiết lập trạng thái ban đầu
    switchSubMode(this.lessonSubMode);
  }

  // --- EXAM SETUP VIEW (PHÒNG KIỂM TRA TRỰC TUYẾN - CHỈ HIỆN KIỂM TRA CHÍNH THỨC) ---
  renderExamSetup() {
    // 1. Hiển thị banner khôi phục bài thi đang làm dở (nếu có)
    const recoveryBannerEl = document.getElementById('active-exam-recovery-banner');
    if (recoveryBannerEl) {
      const activeSession = Storage.getActiveExamSession();
      recoveryBannerEl.innerHTML = activeSession ? this.getActiveSessionBannerHtml(activeSession) : '';
      this.bindActiveSessionBannerEvents(recoveryBannerEl);
    }

    // 2. Nút Bắt đầu vào phòng kiểm tra của lớp
    const btnEnterRoom = document.getElementById('btn-enter-room-exam');
    if (btnEnterRoom) {
      btnEnterRoom.onclick = async () => {
        const roomIdInput = document.getElementById('input-enter-room-id');
        const pwdInput = document.getElementById('input-enter-room-pwd');
        const rawCode = roomIdInput ? roomIdInput.value : '';
        const roomId = String(rawCode || '').trim().toUpperCase();
        const pwd = pwdInput ? pwdInput.value.trim() : '';

        if (!roomId) {
          alert('Em vui lòng nhập Mã bài kiểm tra hoặc mã PIN do Thầy/Cô cung cấp nhé!');
          roomIdInput?.focus();
          return;
        }

        if (CloudSync.isConfigured()) {
          try {
            await CloudSync.fetchRoomFromCloud(roomId);
          } catch (e) {}
        }

        const access = Storage.validateRoomAccess(roomId, pwd, Auth.currentUser);
        if (!access.valid) {
          alert(`⚠️ KHÔNG THỂ VÀO KIỂM TRA:\n${access.message}`);
          return;
        }

        const room = access.room;

        await this.startExam({
          type: room.type || 'bgd_2025',
          title: room.title,
          grade: room.grade,
          duration: room.duration || 50,
          roomId: room.id,
          roomTitle: room.title,
          topic: room.topic || null,
          lesson: room.lesson || null,
          contentScope: room.contentScope || (room.fixedQuestions?.length ? 'questions' : (room.selectedLessons?.length ? 'custom' : 'all')),
          selectedTopics: room.selectedTopics || null,
          selectedLessons: room.selectedLessons || null,
          fixedQuestions: room.fixedQuestions || null,
          count: room.questionCount || (room.fixedQuestions?.length || (room.type === 'bgd_2025' ? 28 : 30)),
          shuffleQuestions: room.shuffleQuestions ?? true,
          shuffleOptions: room.shuffleOptions ?? true,
          examCode: room.randomExamCode ? String(Math.floor(100 + Math.random() * 900)) : (room.examCode || '101'),
          antiCheat: room.antiCheat || { enabled: false },
          resultDisplayMode: room.resultDisplayMode || 'both'
        });
      };
    }

    // 3. Hiển thị danh sách các bài kiểm tra được giao của lớp
    this.renderExamSetupAssignedTasks();
  }

  // --- DANH SÁCH BÀI KIỂM TRA ĐƯỢC GIAO TẠI TAB KIỂM TRA ---
  renderExamSetupAssignedTasks() {
    const container = document.getElementById('exam-setup-assigned-tasks-container');
    if (!container) return;

    const user = Auth.getCurrentUser();
    const isStudent = Auth.isStudent();
    const isTeacher = Auth.isTeacher() || Auth.isAdmin();

    if (!Auth.isLoggedIn()) {
      container.innerHTML = `
        <div class="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
          <p class="text-xs text-slate-500 dark:text-slate-400">Đăng nhập tài khoản học sinh để xem các bài kiểm tra được Giáo viên giao cho lớp bạn.</p>
        </div>
      `;
      return;
    }

    const rooms = Storage.getExamRooms();
    const history = isStudent ? Storage.getUserExamHistory(user) : Storage.getExamHistory();
    const now = new Date();

    const matchingRooms = rooms.filter(room => {
      if (isTeacher) return true;
      const matchGrade = (!room.grade || room.grade === user?.grade);
      const matchSchool = (room.targetSchool === 'all' || !room.targetSchool || (user?.school && room.targetSchool.toLowerCase() === user.school.toLowerCase()));
      const matchClass = (room.targetClass === 'all' || !room.targetClass || (user?.className && room.targetClass.toLowerCase() === user.className.toLowerCase()));
      return matchGrade && matchSchool && matchClass;
    });

    if (matchingRooms.length === 0) {
      container.innerHTML = `
        <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl mx-auto shadow-sm">
            <i class="fa-solid fa-clipboard-check"></i>
          </div>
          <h4 class="text-sm font-bold text-slate-800 dark:text-white">Hiện tại chưa có bài kiểm tra mới nào được giao cho lớp ${escapeHtml(user?.className || '')}</h4>
          <p class="text-xs text-slate-400 max-w-md mx-auto">Khi Thầy/Cô tạo bài kiểm tra cho lớp, danh sách sẽ hiển thị ngay tại đây. Em có thể sang tab Ôn tập để tự ôn luyện kiến thức hoặc tự thi thử nhé!</p>
          <div class="pt-2 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onclick="window.openEditProfileModal()" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition">
              <i class="fa-solid fa-pen-to-square mr-1"></i> Đổi Lớp / Trường (${escapeHtml(user?.className || '')})
            </button>
            <button type="button" data-tab-target="practice" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm">
              <i class="fa-solid fa-book-open mr-1"></i> Sang Tab Ôn Tập & Tự Thi Thử
            </button>
          </div>
        </div>
      `;
      container.querySelector('[data-tab-target="practice"]')?.addEventListener('click', () => {
        this.switchTab('practice');
      });
      return;
    }

    const categorized = matchingRooms.map(room => {
      const record = history.find(h => h.roomId === room.id);
      let status = 'pending';
      const start = room.startTime ? new Date(room.startTime) : null;
      const end = room.endTime ? new Date(room.endTime) : null;

      if (record) {
        status = 'completed';
      } else if (start && now < start) {
        status = 'upcoming';
      } else if (end && now > end) {
        status = 'expired';
      } else {
        status = 'pending';
      }

      return { room, record, status, start, end };
    });

    const statusPriority = { pending: 1, upcoming: 2, completed: 3, expired: 4 };
    categorized.sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-1">
          <h3 class="text-sm sm:text-base font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-list-check text-blue-600"></i> Bài Kiểm Tra Của Lớp Được Giao (${matchingRooms.length})
          </h3>
          <span class="text-xs text-slate-400">Đồng bộ theo Lớp ${escapeHtml(user?.className || '')}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${categorized.map(item => this.renderAssignedTaskCard(item)).join('')}
        </div>
      </div>
    `;

    this.bindStudentAssignedTasksEvents(container);
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
    const history = Auth.isStudent() ? Storage.getUserExamHistory(Auth.getCurrentUser()) : Storage.getExamHistory();
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

    const isStudentUser = Auth.isStudent();
    const isPrivilegedUser = Auth.isTeacher() || Auth.isAdmin();
    const validHistory = history.filter(h => !h.isDisqualified);
    const visibleScoresHistory = isStudentUser ? validHistory.filter(h => h.resultDisplayMode !== 'hidden') : validHistory;
    const validScores = visibleScoresHistory.map(h => Number(h.score) || 0);
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

            ${Auth.isAdmin() ? `
              <button id="btn-clear-history" class="text-xs text-rose-300 hover:text-white font-bold px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/60 rounded-xl transition self-start sm:self-auto shrink-0 flex items-center gap-1.5" title="Quyền Quản trị viên: Xóa dữ liệu lịch sử thi">
                <i class="fa-solid fa-trash-can text-[11px]"></i> Xóa lịch sử (Admin)
              </button>
            ` : ''}
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
              const isItemHidden = !isPrivilegedUser && item.resultDisplayMode === 'hidden';
              const isItemScoreOnly = !isPrivilegedUser && item.resultDisplayMode === 'score_only';

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
                      ${isItemHidden ? `
                        <span><i class="fa-solid fa-lock text-purple-500 mr-1"></i>Điểm số bảo mật theo quy định</span>
                      ` : `
                        <span><i class="fa-solid fa-check mr-1 text-emerald-500"></i>${item.correctCount}/${item.totalQuestions} câu đúng</span>
                      `}
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
                      <button data-review-history="${escapeHtml(item.id)}" class="px-3.5 py-2 ${isItemHidden ? 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-400' : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400'} rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                        ${isItemHidden ? `
                          <i class="fa-solid fa-receipt"></i> Xem biên nhận
                        ` : (isItemScoreOnly ? `
                          <i class="fa-solid fa-chart-simple"></i> Xem điểm số
                        ` : `
                          <i class="fa-solid fa-eye"></i> Xem bài làm
                        `)}
                      </button>
                    ` : ''}
                    <div class="text-right shrink-0">
                      ${isItemHidden ? `
                        <span class="text-xs font-bold font-mono px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 block"><i class="fa-solid fa-lock mr-1"></i>ĐÃ NỘP</span>
                        <span class="text-[10px] text-slate-400 block font-bold uppercase mt-1">Trạng thái</span>
                      ` : `
                        <span class="text-2xl font-black ${item.score >= 8 ? 'text-emerald-600 dark:text-emerald-400' : (item.score < 5 ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400')} font-mono">${item.score}</span>
                        <span class="text-[10px] text-slate-400 block font-bold uppercase">Điểm số</span>
                      `}
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
        if (!Auth.isAdmin() && !Auth.isTeacher()) {
          alert('Học sinh không có quyền xóa lịch sử thi!');
          return;
        }
        if (confirm('Thầy/Cô có chắc chắn muốn xóa toàn bộ lịch sử thi thử không?')) {
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

    const countSelect = document.getElementById('print-cfg-count');
    const durationInput = document.getElementById('print-cfg-duration');
    if (countSelect && durationInput) {
      countSelect.onchange = () => {
        if (countSelect.value === '28') durationInput.value = '50';
        else if (countSelect.value === '40') durationInput.value = '60';
        else if (countSelect.value === '30') durationInput.value = '45';
        else if (countSelect.value === '20') durationInput.value = '30';
        else if (countSelect.value === '50') durationInput.value = '90';
      };
    }

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

        const submitBtn = formRegister.querySelector('button[type="submit"]');
        const prevHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang đăng ký...';
        }

        const res = await Auth.registerUser({ fullName, grade, className, school, email, password, role, secretCode });

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevHtml;
        }

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
        if (modalId === 'modal-required-profile') {
          if (!Auth.isProfileComplete()) {
            alert('Bạn bắt buộc phải điền đầy đủ Họ và tên, Lớp, Trường để tiếp tục!');
            return;
          }
          Auth.closeRequiredProfileModal();
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

    // Nút mở modal nâng cấp vai trò
    const btnOpenUpgrade = document.getElementById('btn-open-upgrade-role');
    const modalUpgrade = document.getElementById('modal-upgrade-role');
    const formUpgrade = document.getElementById('form-upgrade-role');
    const formActivateCode = document.getElementById('form-activate-role-code');
    const inputRoleCode = document.getElementById('input-role-activation-code');
    const tabBtnCode = document.getElementById('tab-btn-upgrade-code');
    const tabBtnRequest = document.getElementById('tab-btn-upgrade-request');
    const btnToggleCode = document.getElementById('btn-toggle-role-code');

    if (btnToggleCode && inputRoleCode) {
      btnToggleCode.addEventListener('click', () => {
        const isPass = inputRoleCode.type === 'password';
        inputRoleCode.type = isPass ? 'text' : 'password';
        btnToggleCode.innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
      });
    }

    if (tabBtnCode && tabBtnRequest && formActivateCode && formUpgrade) {
      tabBtnCode.addEventListener('click', () => {
        tabBtnCode.className = 'pb-2.5 border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 px-3 flex items-center gap-1.5 transition';
        tabBtnRequest.className = 'pb-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-3 flex items-center gap-1.5 transition';
        formActivateCode.classList.remove('hidden');
        formUpgrade.classList.add('hidden');
      });

      tabBtnRequest.addEventListener('click', () => {
        tabBtnRequest.className = 'pb-2.5 border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 px-3 flex items-center gap-1.5 transition';
        tabBtnCode.className = 'pb-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-3 flex items-center gap-1.5 transition';
        formUpgrade.classList.remove('hidden');
        formActivateCode.classList.add('hidden');
      });
    }

    if (btnOpenUpgrade) {
      btnOpenUpgrade.addEventListener('click', () => {
        if (!Auth.isLoggedIn()) {
          alert('Vui lòng đăng nhập trước khi kích hoạt vai trò!');
          document.getElementById('modal-login')?.classList.remove('hidden');
          return;
        }
        modalUpgrade?.classList.remove('hidden');
        if (inputRoleCode) inputRoleCode.value = '';
      });
    }

    // Xử lý nộp mã kích hoạt vai trò qua Worker API
    if (formActivateCode) {
      formActivateCode.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = inputRoleCode?.value?.trim() || '';
        if (!code) {
          alert('Vui lòng nhập mã kích hoạt vai trò!');
          return;
        }

        const submitBtn = formActivateCode.querySelector('button[type="submit"]');
        const prevHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang xác thực qua Worker...';
        }

        const res = await Auth.activateRoleWithCode(code);

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevHtml;
        }

        alert(res.message);
        if (res.success) {
          modalUpgrade?.classList.add('hidden');
          if (inputRoleCode) inputRoleCode.value = '';
          this.updateRolePermissionsUI(Auth.currentUser);
        }
      });
    }

    if (formUpgrade) {
      formUpgrade.addEventListener('submit', async (e) => {
        e.preventDefault();
        const requestedRole = document.getElementById('input-upgrade-requested-role')?.value || 'teacher';
        const school = document.getElementById('input-upgrade-school')?.value || '';
        const reason = document.getElementById('input-upgrade-reason')?.value || '';

        const submitBtn = formUpgrade.querySelector('button[type="submit"]');
        const prevHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang gửi yêu cầu...';
        }

        const res = await Auth.requestRoleUpgrade({ requestedRole, school, reason });

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevHtml;
        }

        alert(res.message);
        if (res.success) {
          modalUpgrade?.classList.add('hidden');
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

    // Menu Nghiệp vụ Giáo viên: Hỗ trợ cả Rê chuột mượt (có trễ 280ms chống mất menu) lẫn Bấm Click ghim mở
    const teacherWrap = document.getElementById('teacher-nav-dropdown-wrap');
    const teacherBtn = document.getElementById('btn-teacher-nav-dropdown');
    const teacherMenu = document.getElementById('teacher-nav-dropdown-menu');
    const teacherChevron = document.getElementById('icon-teacher-nav-chevron');
    if (teacherWrap && teacherBtn && teacherMenu) {
      let closeTimer = null;
      let isPinnedByClick = false;

      const openTeacherMenu = () => {
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
        teacherMenu.classList.remove('hidden');
        teacherBtn.setAttribute('aria-expanded', 'true');
        if (teacherChevron) teacherChevron.classList.add('rotate-180');
      };

      const closeTeacherMenu = (force = false) => {
        if (isPinnedByClick && !force) return;
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
          teacherMenu.classList.add('hidden');
          teacherBtn.setAttribute('aria-expanded', 'false');
          if (teacherChevron) teacherChevron.classList.remove('rotate-180');
          isPinnedByClick = false;
        }, force ? 0 : 280);
      };

      teacherWrap.addEventListener('mouseenter', openTeacherMenu);
      teacherWrap.addEventListener('mouseleave', () => closeTeacherMenu(false));

      teacherBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!teacherMenu.classList.contains('hidden') && isPinnedByClick) {
          isPinnedByClick = false;
          closeTeacherMenu(true);
        } else {
          isPinnedByClick = true;
          openTeacherMenu();
        }
      });

      teacherMenu.querySelectorAll('[data-tab-target]').forEach(item => {
        item.addEventListener('click', () => {
          isPinnedByClick = false;
          closeTeacherMenu(true);
        });
      });

      document.addEventListener('click', (e) => {
        if (!teacherWrap.contains(e.target)) {
          isPinnedByClick = false;
          closeTeacherMenu(true);
        }
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
      editProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('user-profile-dropdown')?.classList.add('hidden');
        Auth.openRequiredProfileModal();
      });
    }

    // Form lưu thông tin bắt buộc: Họ và tên, Lớp, Trường
    const formProfile = document.getElementById('form-required-profile');
    if (formProfile) {
      formProfile.addEventListener('submit', async (e) => {
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

        if (grade && grade !== this.currentGrade) {
          await this.switchGrade(grade);
        }
        this.renderHome();
        if (this.currentTab === 'exam-setup') {
          this.renderExamSetup();
        }
        alert(`✅ Đã cập nhật thông tin học sinh thành công!\n• Họ tên: ${fullName.trim()}\n• Trường: ${school}\n• Khối ${grade} - Lớp: ${className}`);
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
      formLoginDirect.addEventListener('submit', async (e) => {
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
        const submitBtn = formLoginDirect.querySelector('button[type="submit"]');
        const prevBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang xác thực...';
        }
        const res = await Auth.loginWithCredentialsAsync(identity, password);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevBtnHtml;
        }
        if (res.success) {
          this.renderHome();
          this.enforceAuthentication();
        } else {
          if (res.code === 'NOT_FOUND') {
            const wantReg = confirm(`${res.message || 'Tài khoản chưa tồn tại!'}\n\n👉 Bấm OK để chuyển sang tab "Đăng Ký Mới" tạo tài khoản.`);
            if (wantReg) {
              const tabRegBtn = document.getElementById('tab-btn-auth-register');
              if (tabRegBtn) tabRegBtn.click();
              const regEmail = document.getElementById('reg-input-email');
              if (regEmail && identity) {
                regEmail.value = identity;
              }
              const regName = document.getElementById('reg-input-fullname');
              if (regName && identity && !identity.includes('@')) {
                regName.value = identity;
              }
              document.getElementById('reg-input-fullname')?.focus();
            }
          } else {
            alert(res.message || 'Email/Tài khoản hoặc mật khẩu không chính xác!');
          }
        }
      });
    }

    // Nút bật/tắt xem mật khẩu trên form đăng nhập & đăng ký
    // Nút Quên mật khẩu
    const btnForgot = document.getElementById('btn-forgot-password');
    if (btnForgot) {
      btnForgot.addEventListener('click', async () => {
        const currentEmail = document.getElementById('login-input-identity')?.value?.trim() || '';
        const email = prompt('Vui lòng nhập địa chỉ Email của bạn để nhận liên kết khôi phục mật khẩu:', currentEmail);
        if (email === null) return;
        if (!email.trim() || !email.includes('@')) {
          alert('Vui lòng nhập đúng định dạng email (ví dụ: hocsinh@gmail.com)!');
          return;
        }
        const res = await Auth.sendPasswordReset(email.trim());
        alert(res.message);
      });
    }

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
      if (!Auth.isEditingProfile) {
        Auth.closeRequiredProfileModal();
      }

      // Nếu học sinh truy cập qua link phòng live video (?live_video=XYZ)
      if (this.pendingLiveVideoParam) {
        const liveCode = this.pendingLiveVideoParam;
        this.pendingLiveVideoParam = null;
        setTimeout(async () => {
          await this.switchTab('interactive-video');
          const lv = await getLiveVideo();
          if (lv && typeof lv.handleJoinRoomSubmit === 'function') {
            lv.handleJoinRoomSubmit(liveCode);
          }
        }, 300);
      }

      // Nếu học sinh truy cập qua link phòng thi trực tiếp (?room=XYZ), tự động kéo phòng từ Cloud và mở màn hình vào phòng thi
      if (this.pendingRoomParam) {
        const roomCode = this.pendingRoomParam;
        this.pendingRoomParam = null;
        CloudSync.fetchRoomFromCloud(roomCode).finally(() => {
          this.switchTab('exam-setup');
          setTimeout(() => {
            const input = document.getElementById('input-enter-room-id');
            if (input) {
              input.value = roomCode;
              document.getElementById('input-enter-room-pwd')?.focus();
            }
          }, 150);
        });
      }
    }
  }

  renderSavedAccountsInLoginModal() {
    const section = document.getElementById('saved-accounts-section');
    const listEl = document.getElementById('saved-accounts-list');
    if (!section || !listEl) return;

    const rawAccounts = Storage.getAccountsList();
    if (rawAccounts.length === 0) {
      section.classList.add('hidden');
      return;
    }

    // Sắp xếp ưu tiên tài khoản Admin và Giáo viên lên đầu danh sách
    const accounts = [...rawAccounts].sort((a, b) => {
      const isAAdmin = a.role === 'admin' || (a.email && a.email.toLowerCase().includes('nghiatnhcmue'));
      const isBAdmin = b.role === 'admin' || (b.email && b.email.toLowerCase().includes('nghiatnhcmue'));
      const scoreA = isAAdmin ? 3 : (a.role === 'teacher' ? 2 : 1);
      const scoreB = isBAdmin ? 3 : (b.role === 'teacher' ? 2 : 1);
      return scoreB - scoreA;
    });

    section.classList.remove('hidden');
    listEl.innerHTML = accounts.slice(0, 15).map(acc => {
      const avatar = acc.avatar || getAvatarDataUrl(acc.fullName || 'HS', acc.role);
      let roleLabel = 'Học sinh';
      let roleBg = 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      if (acc.role === 'admin' || (acc.email && acc.email.toLowerCase().includes('nghiatnhcmue'))) {
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
          const modalLogin = document.getElementById('modal-login');
          if (modalLogin) {
            modalLogin.classList.add('hidden');
            modalLogin.style.setProperty('display', 'none', 'important');
          }
          this.renderHome();
          this.enforceAuthentication();
        }
      };
    });
  }

  updateRolePermissionsUI(user) {
    const isTeacher = Auth.isTeacher();
    const isAdmin = Auth.isAdmin();
    const isStudent = Auth.isStudent();

    // Ẩn/hiển thị các tab & nút theo quyền yêu cầu triệt để (ngăn chặn mọi class responsive như xl:flex override display)
    document.querySelectorAll('[data-role-req="teacher"]').forEach(el => {
      if (isTeacher) {
        el.classList.remove('hidden');
        el.style.removeProperty('display');
      } else {
        el.classList.add('hidden');
        el.style.setProperty('display', 'none', 'important');
      }
    });

    document.querySelectorAll('[data-role-req="admin"]').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
        el.style.removeProperty('display');
      } else {
        el.classList.add('hidden');
        el.style.setProperty('display', 'none', 'important');
      }
    });

    document.querySelectorAll('[data-role-req="student"]').forEach(el => {
      if (isStudent) {
        el.classList.remove('hidden');
        el.style.removeProperty('display');
      } else {
        el.classList.add('hidden');
        el.style.setProperty('display', 'none', 'important');
      }
    });

    // Cập nhật nhãn vai trò tại Hub Giáo viên trên Home (nếu có)
    const hubRoleLabel = document.getElementById('home-teacher-role-label');
    if (hubRoleLabel) {
      hubRoleLabel.textContent = Auth.getRoleLabel();
    }

    // Tự động làm mới và cập nhật giao diện Đấu trường nếu view đang mở
    if (typeof window !== 'undefined' && window.Arena && typeof window.Arena.renderMainView === 'function') {
      const arenaView = document.getElementById('view-arena');
      if (arenaView && !arenaView.classList.contains('hidden')) {
        window.Arena.renderMainView();
      }
    }
  }

  // --- GLOBAL EVENTS ---
  bindGlobalEvents() {
    // Event delegation cho toàn bộ nút điều hướng & đóng/mở modal (kể cả phần tử render động sau này)
    document.addEventListener('click', async (e) => {
      const tabBtn = e.target.closest('[data-tab-target]');
      if (tabBtn) {
        e.preventDefault();
        const tab = tabBtn.getAttribute('data-tab-target');
        const mobileMenu = document.getElementById('mobile-nav-drawer');
        if (mobileMenu && mobileMenu.contains(tabBtn)) {
          mobileMenu.classList.add('hidden');
        }
        await this.switchTab(tab);
        return;
      }

      const gradeBtn = e.target.closest('[data-nav-grade]');
      if (gradeBtn) {
        e.preventDefault();
        const grade = gradeBtn.getAttribute('data-nav-grade');
        await this.switchGrade(grade);
        return;
      }

      const closeModalBtn = e.target.closest('[data-close-modal]');
      if (closeModalBtn) {
        const modalId = closeModalBtn.getAttribute('data-close-modal');
        if (modalId === 'modal-login') {
          if (Auth.isLoggedIn() && Auth.isProfileComplete()) {
            this.closeLoginModal();
          }
          return;
        }
        const m = document.getElementById(modalId);
        if (m) {
          m.classList.add('hidden');
          m.style.removeProperty('display');
        }
        return;
      }

      const openLoginBtn = e.target.closest('[data-open-login-modal]');
      if (openLoginBtn) {
        e.preventDefault();
        const tab = openLoginBtn.getAttribute('data-open-login-modal') || 'login';
        this.openLoginModal();
        this.switchAuthModalTab(tab);
        return;
      }
    });

    // Custom nav event
    window.addEventListener('nav-to-tab', (e) => {
      if (e.detail) this.switchTab(e.detail);
    });

    // Nút tạo phòng live video tại Hub Giáo Viên ở trang chủ
    const homeLiveBtn = document.getElementById('btn-home-teacher-live-video');
    if (homeLiveBtn) {
      homeLiveBtn.addEventListener('click', async () => {
        const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
        let isPrivileged = false;
        if (authObj) {
          try {
            if (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) isPrivileged = true;
            if (!isPrivileged && typeof authObj.isTeacher === 'function' && authObj.isTeacher()) isPrivileged = true;
            if (!isPrivileged && typeof authObj.getUserRole === 'function') {
              const r = String(authObj.getUserRole() || '').trim().toLowerCase();
              if (r === 'admin' || r === 'teacher' || r === 'gv' || r === 'giao_vien' || r.includes('admin') || r.includes('quản trị') || r.includes('giáo viên')) {
                isPrivileged = true;
              }
            }
            if (!isPrivileged) {
              const curUser = (typeof authObj.getCurrentUser === 'function') ? authObj.getCurrentUser() : authObj.currentUser;
              if (curUser) {
                const r = String(curUser.role || '').trim().toLowerCase();
                const em = String(curUser.email || '').trim().toLowerCase();
                if (r === 'admin' || r === 'teacher' || r === 'gv' || r === 'giao_vien' || r.includes('admin') || r.includes('quản trị') || r.includes('giáo viên') || curUser.isAdmin) {
                  isPrivileged = true;
                }
                if (em.startsWith('admin') || em.includes('nghiatnhcmue') || em.includes('giaovien') || em.includes('gv')) {
                  isPrivileged = true;
                }
              }
            }
          } catch (e) {}
        }
        if (!isPrivileged) {
          try {
            const raw = localStorage.getItem('tinhoc_user') || localStorage.getItem('user');
            if (raw) {
              const u = JSON.parse(raw);
              const r = String(u.role || '').trim().toLowerCase();
              const em = String(u.email || '').trim().toLowerCase();
              if (r === 'admin' || r === 'teacher' || r === 'gv' || r === 'giao_vien' || r.includes('admin') || r.includes('quản trị') || r.includes('giáo viên') || u.isAdmin || em.startsWith('admin') || em.includes('nghiatnhcmue') || em.includes('giaovien') || em.includes('gv')) {
                isPrivileged = true;
              }
            }
          } catch (e) {}
        }
        if (!isPrivileged) {
          alert('Chức năng tạo phòng học video trực tuyến chỉ dành riêng cho Giáo viên (GV) và Quản trị viên (Admin)!\nHọc sinh chỉ có quyền tham gia phòng học do Thầy/Cô cung cấp.');
          return;
        }
        const lv = await getLiveVideo(); lv.openCreateModal();
      });
    }

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const mobileMenu = document.getElementById('mobile-nav-drawer');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
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

