/**
 * tinhoc-hub: Interactive Video Module (js/interactive-video.js)
 * Học Tin học qua Video Bài Giảng Tương Tác:
 * - Tự động dừng tại các mốc thời gian trong ngân hàng đề.
 * - Hiển thị câu hỏi tương tác với đồng hồ đếm ngược (Countdown Timer).
 * - Chấm điểm tức thì, truyền điểm về Sổ điểm Đám mây (Cloud Real-Time) cho Giáo viên.
 */

import { Storage } from './storage.js';
import { Auth } from './auth.js';
import { escapeHtml } from './utils.js';

export const InteractiveVideo = {
  container: null,
  manifest: null,
  loadGradeFn: null,
  currentGrade: '12',
  selectedTopic: 'all',
  searchQuery: '',
  activeLesson: null,
  activeQuestions: [],
  checkpointsMap: {}, // stop_sec -> [questionObj]
  completedCheckpoints: new Set(),
  currentCheckpointSec: null,
  currentCheckpointQuestions: [],
  currentQuestionIdx: 0,
  countdownInterval: null,
  countdownSeconds: 15,
  scoreEarned: 0,
  totalQuestionsInLesson: 0,
  correctCount: 0,
  sessionDetails: [],
  videoElem: null,

  async init(containerEl, manifest = null, loadGradeFn = null, initialGrade = '12') {
    this.container = containerEl;
    this.manifest = manifest;
    this.loadGradeFn = loadGradeFn;
    this.currentGrade = initialGrade || '12';

    if (!this.manifest) {
      try {
        const res = await fetch('data/manifest.json');
        if (res.ok) this.manifest = await res.json();
      } catch (e) {
        console.warn('InteractiveVideo: Không tải được manifest.json', e);
      }
    }

    this.render();
  },

  setGrade(grade) {
    if (this.currentGrade !== grade) {
      this.currentGrade = grade;
      this.selectedTopic = 'all';
      this.searchQuery = '';
      this.activeLesson = null;
      this.render();
    }
  },

  getLessonVideosForCurrentGrade() {
    const list = [];
    const gData = this.manifest?.grades?.[this.currentGrade]?.interactive_videos || {};
    Object.keys(gData).forEach(vname => {
      const v = gData[vname];
      list.push({
        grade: this.currentGrade,
        video: v.video || vname,
        lesson: v.lesson || '',
        topic: v.topic || '',
        checkpoints: Array.isArray(v.checkpoints) ? v.checkpoints : []
      });
    });
    return list;
  },

  getTopicsList() {
    const videos = this.getLessonVideosForCurrentGrade();
    const set = new Set();
    videos.forEach(v => {
      if (v.topic) set.add(v.topic);
    });
    return Array.from(set);
  },

  render() {
    if (!this.container) return;

    if (this.activeLesson) {
      this.renderPlayerView();
    } else {
      this.renderListView();
    }
  },

  // 1. GIAO DIỆN DANH SÁCH BÀI GIẢNG VIDEO
  renderListView() {
    const videos = this.getLessonVideosForCurrentGrade();
    const topics = this.getTopicsList();
    const progressMap = Storage.getAllVideoProgress();
    const q = (this.searchQuery || '').toLowerCase().trim();

    const filtered = videos.filter(v => {
      if (this.selectedTopic !== 'all' && v.topic !== this.selectedTopic) return false;
      if (q) {
        const text = `${v.lesson} ${v.topic} ${v.video}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn">
        
        <!-- Header Banner -->
        <div class="bg-gradient-to-r from-rose-600 via-indigo-600 to-blue-600 text-white rounded-3xl p-6 sm:p-10 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="relative z-10 max-w-2xl">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider mb-2">
              <i class="fa-solid fa-play"></i> Bài Giảng Tương Tác Thông Minh
            </div>
            <h2 class="text-2xl sm:text-3xl font-black tracking-tight">
              Video Bài Giảng Tương Tác - Khối ${this.currentGrade}
            </h2>
            <p class="text-xs sm:text-sm text-white/90 mt-1 leading-relaxed">
              Vừa xem video bài giảng vừa thử sức với các câu hỏi điểm dừng. Hệ thống tự động chấm điểm và truyền điểm về Sổ điểm của Giáo viên trong thời gian thực!
            </p>
          </div>

          <div class="relative z-10 flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/20 shrink-0">
            <button type="button" data-video-grade="10" class="px-4 py-2 rounded-xl text-xs font-bold transition ${this.currentGrade === '10' ? 'bg-white text-rose-600 shadow-sm' : 'text-white hover:bg-white/10'}">
              Khối 10
            </button>
            <button type="button" data-video-grade="11" class="px-4 py-2 rounded-xl text-xs font-bold transition ${this.currentGrade === '11' ? 'bg-white text-indigo-600 shadow-sm' : 'text-white hover:bg-white/10'}">
              Khối 11
            </button>
            <button type="button" data-video-grade="12" class="px-4 py-2 rounded-xl text-xs font-bold transition ${this.currentGrade === '12' ? 'bg-white text-blue-600 shadow-sm' : 'text-white hover:bg-white/10'}">
              Khối 12
            </button>
          </div>

          <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        <!-- Filter & Search Controls -->
        <div class="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="w-full sm:w-auto flex-1 flex flex-col sm:flex-row items-center gap-3">
            <!-- Topic Filter -->
            <div class="w-full sm:w-72">
              <select id="video-filter-topic" class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="all">Tất cả chủ đề (${videos.length} bài)</option>
                ${topics.map(t => `<option value="${escapeHtml(t)}" ${this.selectedTopic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </div>

            <!-- Search input -->
            <div class="w-full sm:flex-1 relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" id="video-search-input" value="${escapeHtml(this.searchQuery)}" placeholder="Tìm kiếm bài giảng..." class="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white" />
            </div>
          </div>

          <div class="text-xs font-bold text-slate-500 shrink-0">
            Hiển thị: <span class="text-blue-600">${filtered.length}</span> bài học
          </div>
        </div>

        <!-- Lesson Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${filtered.length === 0 ? `
            <div class="col-span-full py-16 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6">
              <i class="fa-solid fa-film text-3xl text-slate-300 dark:text-slate-600 mb-2"></i>
              <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy bài giảng nào</h4>
              <p class="text-xs text-slate-400 mt-1">Hãy thử tìm với từ khóa khác hoặc chuyển sang chủ đề khác.</p>
            </div>
          ` : filtered.map((v, i) => {
            const prog = progressMap[v.video];
            const hasCompleted = prog && prog.completed;
            const highest = prog ? Number(prog.highestScore).toFixed(1) : null;

            return `
              <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col overflow-hidden group">
                <!-- Top Card Media Header -->
                <div class="bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white relative flex items-center justify-between">
                  <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl text-rose-400 group-hover:scale-110 transition shrink-0 shadow-inner">
                    <i class="fa-solid fa-play"></i>
                  </div>
                  <div class="text-right">
                    <span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white backdrop-blur-md">
                      Khối ${v.grade}
                    </span>
                    <span class="block text-[11px] font-mono text-slate-300 mt-1">
                      ${escapeHtml(v.video)}
                    </span>
                  </div>
                </div>

                <!-- Card Body -->
                <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <span class="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                      ${escapeHtml(v.topic)}
                    </span>
                    <h3 class="text-sm font-black text-slate-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug line-clamp-2">
                      ${escapeHtml(v.lesson)}
                    </h3>
                  </div>

                  <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold">
                      <i class="fa-solid fa-stopwatch text-rose-500"></i>
                      <span>${v.checkpoints.length} điểm dừng</span>
                    </div>

                    ${hasCompleted ? `
                      <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <i class="fa-solid fa-star text-amber-500"></i> ${highest}/10đ
                      </span>
                    ` : `
                      <span class="text-[11px] font-medium text-slate-400">
                        Chưa học
                      </span>
                    `}
                  </div>

                  <button type="button" data-start-lesson="${escapeHtml(v.video)}" class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2">
                    <i class="fa-solid fa-circle-play"></i> Bắt đầu học tương tác
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

      </div>
    `;

    this.bindListEvents();
  },

  bindListEvents() {
    // Chuyển khối lớp
    this.container.querySelectorAll('[data-video-grade]').forEach(btn => {
      btn.onclick = () => {
        const grade = btn.getAttribute('data-video-grade');
        this.setGrade(grade);
      };
    });

    // Lọc theo chủ đề
    const topicSelect = document.getElementById('video-filter-topic');
    if (topicSelect) {
      topicSelect.onchange = (e) => {
        this.selectedTopic = e.target.value;
        this.renderListView();
      };
    }

    // Tìm kiếm bài học
    const searchInput = document.getElementById('video-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value;
        this.renderListView();
      };
    }

    // Bắt đầu học bài giảng
    this.container.querySelectorAll('[data-start-lesson]').forEach(btn => {
      btn.onclick = () => {
        const vname = btn.getAttribute('data-start-lesson');
        this.startLesson(vname);
      };
    });
  },

  // 2. BẮT ĐẦU PHIÊN HỌC VIDEO TƯƠNG TÁC
  async startLesson(videoName) {
    const videos = this.getLessonVideosForCurrentGrade();
    const lesson = videos.find(v => v.video.toLowerCase() === videoName.toLowerCase());
    if (!lesson) {
      alert('Không tìm thấy thông tin bài giảng!');
      return;
    }

    // Nạp câu hỏi của khối lớp
    let questions = [];
    if (typeof this.loadGradeFn === 'function') {
      questions = await this.loadGradeFn(this.currentGrade);
    } else {
      try {
        const res = await fetch(`data/grade_${this.currentGrade}.json`);
        if (res.ok) questions = await res.json();
      } catch (e) {
        console.warn('Lỗi nạp câu hỏi:', e);
      }
    }

    // Lọc các câu hỏi có video_stop thuộc video này
    const videoQuestions = questions.filter(q => {
      return q.video && q.video.toLowerCase() === videoName.toLowerCase() && q.video_stop !== undefined && q.video_stop !== null;
    });

    if (videoQuestions.length === 0) {
      alert(`Bài giảng này chưa có câu hỏi dừng tương tác trong ngân hàng câu hỏi!`);
      return;
    }

    // Nhóm câu hỏi theo từng mốc giây (stop_sec)
    const checkpointsMap = {};
    videoQuestions.forEach(q => {
      const sec = Math.floor(Number(q.video_stop));
      if (!checkpointsMap[sec]) checkpointsMap[sec] = [];
      checkpointsMap[sec].push(q);
    });

    this.activeLesson = lesson;
    this.activeQuestions = videoQuestions;
    this.checkpointsMap = checkpointsMap;
    this.completedCheckpoints = new Set();
    this.currentCheckpointSec = null;
    this.scoreEarned = 0;
    this.totalQuestionsInLesson = videoQuestions.length;
    this.correctCount = 0;
    this.sessionDetails = [];

    this.renderPlayerView();
  },

  // 3. GIAO DIỆN PHÁT VIDEO & TƯƠNG TÁC
  renderPlayerView() {
    const lesson = this.activeLesson;
    const baseUrl = Storage.getVideoBaseUrl();
    const videoUrl = `${baseUrl}${lesson.video}`;
    const sortedCheckpoints = Object.keys(this.checkpointsMap).map(Number).sort((a, b) => a - b);

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn">
        
        <!-- Top Action Bar -->
        <div class="flex items-center justify-between gap-4 flex-wrap bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <button type="button" id="btn-back-to-lessons" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách
          </button>

          <div class="flex items-center gap-3">
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold">
              <i class="fa-solid fa-stopwatch text-xs"></i>
              <span id="player-checkpoints-status">0 / ${sortedCheckpoints.length} điểm dừng</span>
            </span>

            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-xs font-black">
              <i class="fa-solid fa-award text-amber-500"></i>
              <span id="player-live-score">0.0 / 10.0 đ</span>
            </span>
          </div>
        </div>

        <!-- Video Player Main Viewport -->
        <div class="relative w-full aspect-video rounded-3xl overflow-hidden bg-black shadow-2xl border border-slate-800">
          <video id="interactive-video-elem" class="w-full h-full object-contain" controls playsinline preload="metadata">
            <source src="${videoUrl}" type="video/mp4" />
            Trình duyệt của bạn không hỗ trợ thẻ video HTML5.
          </video>

          <!-- Checkpoint Question Modal Overlay -->
          <div id="video-quiz-overlay" class="hidden absolute inset-0 bg-slate-950/80 backdrop-blur-md z-30 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div id="video-quiz-content" class="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 animate-scaleUp">
              <!-- Nội dung câu hỏi tương tác được sinh động tại đây -->
            </div>
          </div>
        </div>

        <!-- Checkpoints Timeline Visual Track -->
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div class="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-white">
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-timeline text-blue-600"></i> Các mốc câu hỏi dừng trong bài giảng
            </span>
            <span class="text-slate-400 font-mono text-[11px]" id="player-video-time-text">00:00 / 00:00</span>
          </div>

          <!-- Mốc dừng trực quan -->
          <div class="flex items-center gap-2 flex-wrap">
            ${sortedCheckpoints.map(sec => {
              const mm = Math.floor(sec / 60).toString().padStart(2, '0');
              const ss = (sec % 60).toString().padStart(2, '0');
              const qCount = this.checkpointsMap[sec]?.length || 0;
              return `
                <button type="button" data-jump-to-sec="${sec}" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                  <i class="fa-solid fa-flag text-[10px] text-rose-500"></i>
                  <span>${mm}:${ss}</span>
                  <span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
                    ${qCount} câu
                  </span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Lesson Meta Info Card -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span class="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
              ${escapeHtml(lesson.topic)} • Khối ${lesson.grade}
            </span>
            <h3 class="text-lg font-black text-slate-800 dark:text-white">
              ${escapeHtml(lesson.lesson)}
            </h3>
            <p class="text-xs text-slate-400 mt-1">
              Tệp nguồn: <code class="font-mono text-blue-500">${escapeHtml(lesson.video)}</code>
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <a href="${videoUrl}" target="_blank" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-download"></i> Tải video MP4
            </a>
          </div>
        </div>

      </div>
    `;

    this.bindPlayerEvents();
  },

  bindPlayerEvents() {
    const btnBack = document.getElementById('btn-back-to-lessons');
    if (btnBack) {
      btnBack.onclick = () => {
        if (confirm('Bạn có muốn dừng phiên học này và quay về danh sách bài giảng?')) {
          this.cleanupActivePlayer();
          this.activeLesson = null;
          this.render();
        }
      };
    }

    const video = document.getElementById('interactive-video-elem');
    this.videoElem = video;

    if (video) {
      // Cập nhật mốc thời gian hiển thị
      video.ontimeupdate = () => {
        this.handleVideoTimeUpdate(video);
      };

      // Khi video kết thúc
      video.onended = () => {
        this.handleVideoEnded();
      };

      // Xử lý khi video bị lỗi tải (ví dụ chưa upload lên Archive.org)
      video.onerror = () => {
        console.warn('Lỗi tải video bài giảng:', video.src);
      };
    }

    // Nút nhảy đến mốc thời gian
    this.container.querySelectorAll('[data-jump-to-sec]').forEach(btn => {
      btn.onclick = () => {
        const sec = Number(btn.getAttribute('data-jump-to-sec'));
        if (this.videoElem) {
          this.videoElem.currentTime = Math.max(0, sec - 2);
          this.videoElem.play().catch(() => {});
        }
      };
    });
  },

  cleanupActivePlayer() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.videoElem) {
      this.videoElem.pause();
      this.videoElem = null;
    }
  },

  handleVideoTimeUpdate(video) {
    const curTime = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration || 0);

    const timeText = document.getElementById('player-video-time-text');
    if (timeText) {
      const curM = Math.floor(curTime / 60).toString().padStart(2, '0');
      const curS = (curTime % 60).toString().padStart(2, '0');
      const durM = Math.floor(duration / 60).toString().padStart(2, '0');
      const durS = (duration % 60).toString().padStart(2, '0');
      timeText.textContent = `${curM}:${curS} / ${durM}:${durS}`;
    }

    // Kiểm tra xem giây hiện tại có trùng với mốc câu hỏi dừng chưa hoàn thành hay không
    if (this.checkpointsMap[curTime] && !this.completedCheckpoints.has(curTime)) {
      video.pause();
      this.triggerCheckpointQuiz(curTime);
    }
  },

  // 4. KÍCH HOẠT LỚP CÂU HỎI TƯƠNG TÁC TẠI MỐC DỪNG
  triggerCheckpointQuiz(stopSec) {
    this.currentCheckpointSec = stopSec;
    this.currentCheckpointQuestions = this.checkpointsMap[stopSec] || [];
    this.currentQuestionIdx = 0;

    const overlay = document.getElementById('video-quiz-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }

    this.renderCurrentCheckpointQuestion();
  },

  renderCurrentCheckpointQuestion() {
    const q = this.currentCheckpointQuestions[this.currentQuestionIdx];
    if (!q) {
      this.finishCurrentCheckpoint();
      return;
    }

    const overlayContent = document.getElementById('video-quiz-content');
    if (!overlayContent) return;

    // Reset countdown timer
    const timeLimit = Math.max(10, Number(q.video_time) || 15);
    this.countdownSeconds = timeLimit;

    const mm = Math.floor(this.currentCheckpointSec / 60).toString().padStart(2, '0');
    const ss = (this.currentCheckpointSec % 60).toString().padStart(2, '0');

    overlayContent.innerHTML = `
      <div class="space-y-5 animate-fadeIn">
        <!-- Header mốc dừng & Đồng hồ đếm ngược -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm">
              <i class="fa-solid fa-bullseye"></i>
            </span>
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                Mốc Tương Tác: ${mm}:${ss}
              </h4>
              <span class="text-[11px] text-slate-400">
                Câu hỏi ${this.currentQuestionIdx + 1} / ${this.currentCheckpointQuestions.length}
              </span>
            </div>
          </div>

          <!-- Countdown timer ring -->
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-mono text-xs font-black">
            <i class="fa-solid fa-stopwatch animate-pulse"></i>
            <span id="quiz-countdown-display">${this.countdownSeconds}s</span>
          </div>
        </div>

        <!-- Nội dung câu hỏi -->
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${q.level === 'DS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
              ${q.level === 'DS' ? 'Đúng / Sai' : `Mức ${q.level}`}
            </span>
            <span class="text-[11px] text-slate-400">Trả lời nhanh để ghi điểm bài giảng</span>
          </div>

          <h3 class="text-sm sm:text-base font-black text-slate-800 dark:text-white leading-relaxed">
            ${escapeHtml(q.question)}
          </h3>
        </div>

        <!-- Phương án trả lời -->
        <div id="quiz-options-container" class="space-y-2.5 pt-1">
          ${q.options.map((opt, i) => {
            const letter = ['A', 'B', 'C', 'D'][i];
            return `
              <button type="button" data-quiz-choice="${letter}" class="w-full text-left p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition flex items-start gap-3 group">
                <span class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-xs flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition">
                  ${letter}
                </span>
                <span class="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 leading-normal">
                  ${escapeHtml(opt)}
                </span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Khung phản hồi đáp án (ẩn ban đầu) -->
        <div id="quiz-feedback-box" class="hidden p-4 rounded-2xl border text-xs space-y-2 animate-fadeIn">
          <!-- Hiển thị kết quả đúng/sai -->
        </div>

        <!-- Nút hành động tiếp tục -->
        <div id="quiz-action-area" class="hidden pt-2 flex justify-end">
          <button type="button" id="btn-next-quiz-step" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
            Tiếp tục bài giảng <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;

    this.startCountdownTimer();
    this.bindQuizOptionEvents(q);
  },

  startCountdownTimer() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const display = document.getElementById('quiz-countdown-display');
    this.countdownInterval = setInterval(() => {
      this.countdownSeconds--;
      if (display) {
        display.textContent = `${this.countdownSeconds}s`;
        if (this.countdownSeconds <= 3) {
          display.parentElement?.classList.add('bg-rose-100', 'text-rose-700', 'border-rose-300');
        }
      }

      if (this.countdownSeconds <= 0) {
        clearInterval(this.countdownInterval);
        this.handleQuizAnswer(null); // Hết giờ: coi như chưa chọn
      }
    }, 1000);
  },

  bindQuizOptionEvents(question) {
    const container = document.getElementById('quiz-options-container');
    if (!container) return;

    container.querySelectorAll('[data-quiz-choice]').forEach(btn => {
      btn.onclick = () => {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        const choice = btn.getAttribute('data-quiz-choice');
        this.handleQuizAnswer(choice, question);
      };
    });
  },

  handleQuizAnswer(userChoice, question) {
    const q = question || this.currentCheckpointQuestions[this.currentQuestionIdx];
    if (!q) return;

    // Vô hiệu hóa các nút lựa chọn
    const container = document.getElementById('quiz-options-container');
    if (container) {
      container.querySelectorAll('button').forEach(b => {
        b.disabled = true;
        b.classList.add('cursor-default');
      });
    }

    const isCorrect = userChoice && q.answer && userChoice.toUpperCase() === q.answer.toUpperCase();

    // Điểm cộng mỗi câu = 10.0 / totalQuestions
    const pointPerQuestion = 10.0 / Math.max(1, this.totalQuestionsInLesson);
    if (isCorrect) {
      this.scoreEarned += pointPerQuestion;
      this.correctCount++;
    }

    // Cập nhật live score trên thanh action bar
    const liveScoreEl = document.getElementById('player-live-score');
    if (liveScoreEl) {
      liveScoreEl.textContent = `${this.scoreEarned.toFixed(1)} / 10.0 đ`;
    }

    // Highlight các phương án đúng / sai
    if (container) {
      container.querySelectorAll('[data-quiz-choice]').forEach(btn => {
        const choice = btn.getAttribute('data-quiz-choice');
        if (choice === q.answer) {
          btn.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/40', 'text-emerald-800', 'dark:text-emerald-300');
          btn.querySelector('span')?.classList.add('bg-emerald-600', 'text-white');
        } else if (choice === userChoice && !isCorrect) {
          btn.classList.add('border-rose-500', 'bg-rose-50', 'dark:bg-rose-950/40', 'text-rose-800', 'dark:text-rose-300');
          btn.querySelector('span')?.classList.add('bg-rose-600', 'text-white');
        }
      });
    }

    // Hiển thị khung phản hồi
    const feedbackBox = document.getElementById('quiz-feedback-box');
    if (feedbackBox) {
      feedbackBox.classList.remove('hidden');
      if (isCorrect) {
        feedbackBox.className = 'p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-xs space-y-1';
        feedbackBox.innerHTML = `
          <div class="font-black flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <i class="fa-solid fa-circle-check text-base"></i> Chính xác! (+${pointPerQuestion.toFixed(1)} điểm)
          </div>
          <p class="leading-relaxed">Bạn đã nắm vững kiến thức mốc này rất tốt!</p>
        `;
      } else {
        feedbackBox.className = 'p-4 rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 text-xs space-y-1';
        feedbackBox.innerHTML = `
          <div class="font-black flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
            <i class="fa-solid fa-circle-xmark text-base"></i> ${userChoice ? 'Chưa chính xác!' : 'Hết thời gian trả lời!'}
          </div>
          <p class="leading-relaxed">Đáp án đúng là <b>${escapeHtml(q.answer)}</b>.</p>
        `;
      }
    }

    // Ghi nhận nhật ký phiên làm bài
    this.sessionDetails.push({
      question: q,
      userAnswer: userChoice,
      correctAnswer: q.answer,
      isCorrect: !!isCorrect
    });

    // Hiện nút tiếp tục
    const actionArea = document.getElementById('quiz-action-area');
    if (actionArea) {
      actionArea.classList.remove('hidden');
      const btnNext = document.getElementById('btn-next-quiz-step');
      if (btnNext) {
        btnNext.onclick = () => {
          this.currentQuestionIdx++;
          if (this.currentQuestionIdx < this.currentCheckpointQuestions.length) {
            this.renderCurrentCheckpointQuestion();
          } else {
            this.finishCurrentCheckpoint();
          }
        };
      }
    }
  },

  finishCurrentCheckpoint() {
    this.completedCheckpoints.add(this.currentCheckpointSec);

    // Ẩn overlay
    const overlay = document.getElementById('video-quiz-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }

    // Cập nhật trạng thái mốc dừng
    const statusEl = document.getElementById('player-checkpoints-status');
    const sortedCheckpoints = Object.keys(this.checkpointsMap).map(Number).sort((a, b) => a - b);
    if (statusEl) {
      statusEl.textContent = `${this.completedCheckpoints.size} / ${sortedCheckpoints.length} điểm dừng`;
    }

    // Tiếp tục phát video
    if (this.videoElem) {
      this.videoElem.play().catch(() => {});
    }

    // Nếu đã hoàn thành tất cả các mốc
    if (this.completedCheckpoints.size >= sortedCheckpoints.length) {
      // Có thể hiển thị tổng kết hoặc chờ video kết thúc
    }
  },

  // 5. KẾT THÚC BÀI GIẢNG VÀ TRUYỀN ĐIỂM THỜI GIAN THỰC LÊN CLOUD
  handleVideoEnded() {
    const finalScore = Math.min(10.0, Math.round(this.scoreEarned * 10) / 10);
    const lesson = this.activeLesson;

    // Lưu điểm vào Storage & tự động bắn lên Firebase Cloud Database
    const examResult = {
      title: `Video tương tác: ${lesson.lesson}`,
      grade: String(this.currentGrade),
      score: finalScore,
      totalQuestions: this.totalQuestionsInLesson,
      correctCount: this.correctCount,
      timeSpentSeconds: Math.round(this.videoElem?.currentTime || 0),
      examType: 'interactive_video',
      lesson: lesson.lesson,
      topic: lesson.topic,
      details: this.sessionDetails
    };

    Storage.saveExamResult(examResult);
    Storage.recordVideoProgress(lesson.video, finalScore, this.totalQuestionsInLesson, this.sessionDetails);

    // Hiển thị modal chúc mừng hoàn thành bài giảng
    this.showCompletionModal(finalScore);
  },

  showCompletionModal(score) {
    const overlay = document.getElementById('video-quiz-overlay');
    const content = document.getElementById('video-quiz-content');
    if (!overlay || !content) return;

    overlay.classList.remove('hidden');

    let badgeText = 'Xuất sắc! 🏆';
    let badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    if (score < 5.0) {
      badgeText = 'Cần cố gắng thêm ⚠️';
      badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    } else if (score < 8.0) {
      badgeText = 'Đạt yêu cầu ✨';
      badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
    }

    content.innerHTML = `
      <div class="text-center py-4 space-y-6 animate-scaleUp">
        <div class="w-20 h-20 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center text-4xl mx-auto shadow-inner">
          <i class="fa-solid fa-trophy"></i>
        </div>

        <div>
          <span class="inline-block px-3 py-1 rounded-full text-xs font-bold ${badgeColor} mb-2">
            ${badgeText}
          </span>
          <h3 class="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            Hoàn Thành Bài Giảng Tương Tác!
          </h3>
          <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Điểm số đã được tự động lưu vào Sổ điểm cá nhân và truyền về máy Thầy Cô qua Cơ Sở Dữ Liệu Đám Mây.
          </p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700 max-w-md mx-auto">
          <div>
            <span class="text-[11px] text-slate-400 font-medium block">Điểm số</span>
            <span class="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">${score.toFixed(1)}/10</span>
          </div>
          <div>
            <span class="text-[11px] text-slate-400 font-medium block">Trả lời đúng</span>
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">${this.correctCount}/${this.totalQuestionsInLesson}</span>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <span class="text-[11px] text-slate-400 font-medium block">Đồng bộ Cloud</span>
            <span class="text-2xl font-black text-rose-500 font-mono"><i class="fa-solid fa-check"></i> OK</span>
          </div>
        </div>

        <div class="flex items-center justify-center gap-3 flex-wrap pt-2">
          <button type="button" id="btn-replay-lesson" class="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2">
            <i class="fa-solid fa-rotate-left"></i> Học lại bài này
          </button>
          <button type="button" id="btn-finish-and-exit" class="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Về danh sách bài giảng
          </button>
        </div>
      </div>
    `;

    const btnReplay = document.getElementById('btn-replay-lesson');
    if (btnReplay) {
      btnReplay.onclick = () => {
        this.startLesson(this.activeLesson.video);
      };
    }

    const btnExit = document.getElementById('btn-finish-and-exit');
    if (btnExit) {
      btnExit.onclick = () => {
        this.cleanupActivePlayer();
        this.activeLesson = null;
        this.render();
      };
    }
  }
};
