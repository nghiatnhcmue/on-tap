/**
 * tinhoc-hub: Interactive Video Module (js/interactive-video.js)
 * Học Tin học qua Video Bài Giảng Tương Tác Đa Nền Tảng:
 * - Tự động dừng tại các mốc thời gian trong ngân hàng đề.
 * - Hiển thị câu hỏi tương tác với đồng hồ đếm ngược (Countdown Timer).
 * - Chấm điểm tức thì, truyền điểm về Sổ điểm Đám mây (Cloud Real-Time) cho Giáo viên.
 * - HỖ TRỢ CHỌN/TẢI VIDEO TRỰC TIẾP TRÊN WEB: Chọn thư mục/file MP4 từ máy tính phát tức thì mà không cần chờ tải lên mạng.
 * - HỖ TRỢ THIẾT LẬP CÂU HỎI & MỐC DỪNG (Question & Checkpoint Editor): Cho phép Giáo viên & Admin tạo, sửa, xóa mốc dừng và câu hỏi trực tiếp trên web, tự động đồng bộ đám mây realtime!
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

  // Bộ nhớ đệm tệp video cục bộ (Offline / Local File Streaming)
  localVideoMap: {}, // filename -> { file, url, name }
  currentCustomUrlLesson: null,

  // Trạng thái Trình Chỉnh Sửa Câu Hỏi & Mốc Dừng (Question Editor)
  editingLesson: null,
  editingQuestions: [],
  editingQuestionId: null,
  grabbedVideoTime: 0,

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

    this.setupGlobalModalListeners();
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

  // Lấy danh sách video bài giảng của khối lớp hiện tại (kèm thông tin mốc dừng tùy biến nếu có)
  getLessonVideosForCurrentGrade() {
    const list = [];
    const gData = this.manifest?.grades?.[this.currentGrade]?.interactive_videos || {};
    
    Object.keys(gData).forEach(vname => {
      const v = gData[vname];
      const videoFileName = v.video || vname;

      // Kiểm tra xem giáo viên đã tạo câu hỏi tùy biến cho bài này chưa
      const customQ = Storage.getCustomVideoQuestions(this.currentGrade, videoFileName);
      let cps = Array.isArray(v.checkpoints) ? [...v.checkpoints] : [];
      if (customQ && Array.isArray(customQ)) {
        cps = Array.from(new Set(customQ.map(q => Math.floor(Number(q.video_stop))))).sort((a, b) => a - b);
      }

      const hasLocal = !!(this.localVideoMap[videoFileName] || this.localVideoMap[videoFileName.toLowerCase()]);
      const hasCustomUrl = !!Storage.getCustomVideoUrl(videoFileName);

      list.push({
        grade: this.currentGrade,
        video: videoFileName,
        lesson: v.lesson || '',
        topic: v.topic || '',
        checkpoints: cps,
        hasCustomQuestions: !!customQ,
        hasLocalVideo: hasLocal,
        hasCustomUrl: hasCustomUrl
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

  // Xác định đường dẫn phát video (Ưu tiên: 1. File local đã nạp -> 2. Custom URL -> 3. Archive.org S3 Base URL)
  getVideoUrl(videoFile) {
    if (!videoFile) return '';
    const vLower = videoFile.toLowerCase();

    // 1. Tệp video cục bộ chọn từ máy tính
    if (this.localVideoMap[videoFile]) {
      return this.localVideoMap[videoFile].url;
    }
    if (this.localVideoMap[vLower]) {
      return this.localVideoMap[vLower].url;
    }

    // 2. Đường link URL trực tiếp do người dùng/giáo viên cài đặt
    const customUrl = Storage.getCustomVideoUrl(videoFile);
    if (customUrl) {
      return customUrl;
    }

    // 3. Mặc định tải từ Archive.org
    const baseUrl = Storage.getVideoBaseUrl();
    return `${baseUrl}${videoFile}`;
  },

  getLocalVideoFile(videoFile) {
    if (!videoFile) return null;
    return this.localVideoMap[videoFile]?.file || this.localVideoMap[videoFile.toLowerCase()]?.file || null;
  },

  formatTime(sec) {
    sec = Math.floor(Number(sec) || 0);
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  },

  parseStopSec(val) {
    if (!val) return 0;
    val = String(val).trim();
    if (val.includes(':')) {
      const parts = val.split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return m * 60 + s;
    }
    return Math.max(0, parseInt(val, 10) || 0);
  },

  render() {
    if (!this.container) return;

    if (this.activeLesson) {
      this.renderPlayerView();
    } else {
      this.renderListView();
    }
  },

  // ==========================================
  // 1. GIAO DIỆN DANH SÁCH BÀI GIẢNG VIDEO
  // ==========================================
  renderListView() {
    const videos = this.getLessonVideosForCurrentGrade();
    const topics = this.getTopicsList();
    const progressMap = Storage.getAllVideoProgress();
    const q = (this.searchQuery || '').toLowerCase().trim();
    const isTeacher = Auth.isTeacher() || Auth.isAdmin();
    const isAdmin = Auth.isAdmin();

    const localCount = Object.keys(this.localVideoMap).length;

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
              Vừa xem video bài giảng vừa trả lời các câu hỏi dừng. Hỗ trợ <b>phát video trực tiếp từ máy tính</b> hoặc qua đám mây Archive.org, tự động truyền điểm số về Sổ điểm thời gian thực!
            </p>

            <!-- Bộ công cụ tải/nạp video offline nhanh -->
            <div class="pt-4 flex items-center gap-2 flex-wrap">
              <label class="cursor-pointer px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold transition flex items-center gap-2 border border-white/20">
                <i class="fa-solid fa-folder-open text-amber-300"></i> Nạp Thư Mục Video Từ Máy
                <input type="file" id="video-batch-folder-input" webkitdirectory directory multiple accept="video/mp4,video/*" class="hidden" />
              </label>

              <label class="cursor-pointer px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs font-bold transition flex items-center gap-2 border border-white/20">
                <i class="fa-solid fa-file-video"></i> Chọn Từng File MP4
                <input type="file" id="video-batch-files-input" multiple accept="video/mp4,video/*" class="hidden" />
              </label>

              ${localCount > 0 ? `
                <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/30 text-emerald-200 text-xs font-bold border border-emerald-400/40">
                  <i class="fa-solid fa-circle-check text-emerald-300"></i> Đã nạp sẵn ${localCount} file từ máy tính
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Nút chuyển khối lớp -->
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
            const hasLocal = v.hasLocalVideo;
            const hasCustom = v.hasCustomQuestions;
            const hasUrl = v.hasCustomUrl;

            return `
              <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col overflow-hidden group">
                <!-- Top Card Media Header -->
                <div class="bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white relative flex items-center justify-between">
                  <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-xl text-rose-400 group-hover:scale-110 transition shrink-0 shadow-inner">
                    <i class="fa-solid fa-play"></i>
                  </div>
                  <div class="text-right">
                    <div class="flex items-center gap-1.5 justify-end flex-wrap">
                      ${hasLocal ? `
                        <span class="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm" title="Đã nạp file video từ máy tính">
                          <i class="fa-solid fa-hard-drive"></i> Local File
                        </span>
                      ` : ''}
                      ${hasCustom ? `
                        <span class="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-500 text-white shadow-sm" title="Có câu hỏi do Thầy/Cô tùy biến">
                          <i class="fa-solid fa-sliders"></i> Tùy biến
                        </span>
                      ` : ''}
                      ${hasUrl ? `
                        <span class="inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-500 text-white shadow-sm" title="Đang dùng link URL tùy chỉnh">
                          <i class="fa-solid fa-link"></i> Link riêng
                        </span>
                      ` : ''}
                      <span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white backdrop-blur-md">
                        Khối ${v.grade}
                      </span>
                    </div>
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

                  <!-- Hành động cho Học sinh & Giáo viên -->
                  <div class="space-y-2 pt-1">
                    <button type="button" data-start-lesson="${escapeHtml(v.video)}" class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2">
                      <i class="fa-solid fa-circle-play"></i> Bắt đầu học tương tác
                    </button>

                    <div class="flex items-center gap-1.5">
                      <!-- Nút chọn video từ máy tính -->
                      <label class="flex-1 cursor-pointer py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition flex items-center justify-center gap-1.5 text-center">
                        <i class="fa-solid fa-folder-open text-amber-500"></i> ${hasLocal ? 'Đổi video máy' : 'Chọn video máy'}
                        <input type="file" accept="video/mp4,video/*" class="hidden" data-pick-single-video="${escapeHtml(v.video)}" />
                      </label>

                      <!-- Nút Cài đặt câu hỏi (Dành cho GV và Admin) -->
                      ${isTeacher ? `
                        <button type="button" data-open-question-editor="${escapeHtml(v.video)}" class="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold transition flex items-center gap-1" title="Cài đặt câu hỏi dừng cho bài giảng này">
                          <i class="fa-solid fa-sliders"></i> Cài đặt câu hỏi
                        </button>
                      ` : ''}

                      <!-- Nút Tải lên Archive.org (Dành cho Admin khi đã có file) -->
                      ${isAdmin && hasLocal ? `
                        <button type="button" data-admin-upload-archive="${escapeHtml(v.video)}" class="py-1.5 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 text-[11px] font-bold transition" title="Tải file video này lên Archive.org">
                          <i class="fa-solid fa-cloud-arrow-up"></i>
                        </button>
                      ` : ''}
                    </div>
                  </div>
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

    // Chọn cả thư mục video từ máy tính
    const batchFolderInput = document.getElementById('video-batch-folder-input');
    if (batchFolderInput) {
      batchFolderInput.onchange = (e) => {
        this.handleBatchFilesSelected(e.target.files);
      };
    }

    // Chọn nhiều file MP4 từ máy tính
    const batchFilesInput = document.getElementById('video-batch-files-input');
    if (batchFilesInput) {
      batchFilesInput.onchange = (e) => {
        this.handleBatchFilesSelected(e.target.files);
      };
    }

    // Chọn video riêng lẻ cho từng card bài học
    this.container.querySelectorAll('[data-pick-single-video]').forEach(input => {
      input.onchange = (e) => {
        const targetVideoName = input.getAttribute('data-pick-single-video');
        const file = e.target.files?.[0];
        if (file) {
          this.registerLocalVideoFile(targetVideoName, file);
          this.renderListView();
        }
      };
    });

    // Mở bảng Thiết Lập Câu Hỏi Dừng (Question Editor)
    this.container.querySelectorAll('[data-open-question-editor]').forEach(btn => {
      btn.onclick = () => {
        const videoName = btn.getAttribute('data-open-question-editor');
        const lesson = this.getLessonVideosForCurrentGrade().find(v => v.video.toLowerCase() === videoName.toLowerCase());
        if (lesson) {
          this.openQuestionEditor(lesson);
        }
      };
    });

    // Admin tải video lên Archive.org
    this.container.querySelectorAll('[data-admin-upload-archive]').forEach(btn => {
      btn.onclick = () => {
        const videoName = btn.getAttribute('data-admin-upload-archive');
        const lesson = this.getLessonVideosForCurrentGrade().find(v => v.video.toLowerCase() === videoName.toLowerCase());
        const file = this.getLocalVideoFile(videoName);
        if (file && lesson) {
          this.uploadVideoToArchive(lesson, file);
        }
      };
    });
  },

  // Đăng ký tệp video cục bộ vào bộ nhớ map
  registerLocalVideoFile(targetVideoName, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const entry = { file, url, name: file.name };
    this.localVideoMap[targetVideoName] = entry;
    this.localVideoMap[targetVideoName.toLowerCase()] = entry;
    if (file.name) {
      this.localVideoMap[file.name] = entry;
      this.localVideoMap[file.name.toLowerCase()] = entry;
    }
  },

  // Xử lý nạp nhiều file / nạp thư mục từ máy tính
  handleBatchFilesSelected(files) {
    if (!files || files.length === 0) return;
    let matchedCount = 0;
    const allVideos = this.getLessonVideosForCurrentGrade();
    const videoNameMap = new Map();
    allVideos.forEach(v => {
      videoNameMap.set(v.video.toLowerCase(), v.video);
    });

    Array.from(files).forEach(file => {
      if (!file.name.match(/\.(mp4|webm|mkv|mov|avi)$/i)) return;
      const fNameLower = file.name.toLowerCase();
      
      // Khớp chính xác hoặc khớp tên bài giảng
      if (videoNameMap.has(fNameLower)) {
        const canonicalName = videoNameMap.get(fNameLower);
        this.registerLocalVideoFile(canonicalName, file);
        matchedCount++;
      } else {
        // Cho phép lưu theo tên file gốc để tra cứu linh hoạt
        this.registerLocalVideoFile(file.name, file);
      }
    });

    alert(`✅ Đã nạp thành công các tệp video từ máy tính!\nKhớp tự động với ${matchedCount} bài giảng trong khối lớp ${this.currentGrade}.\nBạn có thể nhấn "Bắt đầu học" để phát ngay lập tức không cần mạng internet.`);
    this.render();
  },

  // ==========================================
  // 2. BẮT ĐẦU PHIÊN HỌC VIDEO TƯƠNG TÁC
  // ==========================================
  async startLesson(videoName) {
    const videos = this.getLessonVideosForCurrentGrade();
    const lesson = videos.find(v => v.video.toLowerCase() === videoName.toLowerCase());
    if (!lesson) {
      alert('Không tìm thấy thông tin bài giảng!');
      return;
    }

    // 1. Kiểm tra xem đã có câu hỏi tùy biến trong Storage chưa
    let videoQuestions = Storage.getCustomVideoQuestions(this.currentGrade, lesson.video);

    if (!videoQuestions || !Array.isArray(videoQuestions) || videoQuestions.length === 0) {
      // 2. Nếu chưa có, nạp câu hỏi gốc từ ngân hàng
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

      videoQuestions = questions.filter(q => {
        return q.video && q.video.toLowerCase() === lesson.video.toLowerCase() && q.video_stop !== undefined && q.video_stop !== null;
      });
    }

    if (videoQuestions.length === 0) {
      const isTeacher = Auth.isTeacher() || Auth.isAdmin();
      if (isTeacher) {
        if (confirm(`Bài giảng này chưa có câu hỏi dừng tương tác nào!\nBạn có muốn mở bảng Cài Đặt Câu Hỏi để thiết lập câu hỏi và mốc dừng ngay bây giờ không?`)) {
          this.openQuestionEditor(lesson);
          return;
        }
      } else {
        alert(`Bài giảng này chưa có câu hỏi dừng tương tác trong ngân hàng câu hỏi!`);
      }
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

  // ==========================================
  // 3. GIAO DIỆN PHÁT VIDEO & TƯƠNG TÁC
  // ==========================================
  renderPlayerView() {
    const lesson = this.activeLesson;
    const videoUrl = this.getVideoUrl(lesson.video);
    const sortedCheckpoints = Object.keys(this.checkpointsMap).map(Number).sort((a, b) => a - b);
    const isTeacher = Auth.isTeacher() || Auth.isAdmin();
    const isAdmin = Auth.isAdmin();
    const hasLocal = lesson.hasLocalVideo || !!this.localVideoMap[lesson.video];

    let sourceBadge = 'Archive.org Cloud';
    let badgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
    if (this.localVideoMap[lesson.video]) {
      sourceBadge = `File máy tính: ${this.localVideoMap[lesson.video].name}`;
      badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    } else if (Storage.getCustomVideoUrl(lesson.video)) {
      sourceBadge = 'Link URL riêng';
      badgeClass = 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300';
    }

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn">
        
        <!-- Top Action Bar -->
        <div class="flex items-center justify-between gap-4 flex-wrap bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center gap-2">
            <button type="button" id="btn-back-to-lessons" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2">
              <i class="fa-solid fa-arrow-left"></i> Quay lại
            </button>

            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${badgeClass}" id="player-video-source-badge">
              <i class="fa-solid fa-video"></i> ${escapeHtml(sourceBadge)}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <!-- Nút chọn video từ máy tính -->
            <label class="cursor-pointer px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-folder-open text-amber-500"></i> Chọn video từ máy
              <input type="file" id="input-player-choose-file" accept="video/mp4,video/*" class="hidden" />
            </label>

            <!-- Nút đổi link URL trực tiếp -->
            <button type="button" id="btn-player-custom-url" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5" title="Nhập URL video riêng">
              <i class="fa-solid fa-link text-blue-500"></i> Đổi link URL
            </button>

            <!-- Nút Cài đặt câu hỏi (Dành cho Giáo viên & Admin) -->
            ${isTeacher ? `
              <button type="button" id="btn-player-edit-questions" class="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-sliders"></i> Cài đặt câu hỏi
              </button>
            ` : ''}

            <!-- Nút Tải lên Archive.org cho Admin nếu đã có file local -->
            ${isAdmin && hasLocal ? `
              <button type="button" id="btn-player-admin-upload" class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-bold transition flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-arrow-up"></i> Up Archive.org
              </button>
            ` : ''}

            <!-- Mốc dừng & Điểm số trực tiếp -->
            <div class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
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
        </div>

        <!-- Video Player Main Viewport -->
        <div class="relative w-full aspect-video rounded-3xl overflow-hidden bg-black shadow-2xl border border-slate-800">
          <video id="interactive-video-elem" class="w-full h-full object-contain" controls playsinline preload="metadata" src="${escapeHtml(videoUrl)}">
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
              <i class="fa-solid fa-timeline text-blue-600"></i> Các mốc câu hỏi dừng trong bài giảng (${sortedCheckpoints.length} mốc)
            </span>
            <span class="text-slate-400 font-mono text-[11px]" id="player-video-time-text">00:00 / 00:00</span>
          </div>

          <!-- Mốc dừng trực quan -->
          <div class="flex items-center gap-2 flex-wrap" id="player-timeline-chips-container">
            ${sortedCheckpoints.map(sec => {
              const timeText = this.formatTime(sec);
              const qCount = this.checkpointsMap[sec]?.length || 0;
              return `
                <button type="button" data-jump-to-sec="${sec}" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
                  <i class="fa-solid fa-flag text-[10px] text-rose-500"></i>
                  <span>${timeText}</span>
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
              Tệp video: <code class="font-mono text-blue-500">${escapeHtml(lesson.video)}</code>
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <a href="${escapeHtml(videoUrl)}" target="_blank" download="${escapeHtml(lesson.video)}" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-download"></i> Tải MP4
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
      // Cập nhật mốc thời gian hiển thị & kiểm tra mốc dừng
      video.ontimeupdate = () => {
        this.handleVideoTimeUpdate(video);
      };

      // Khi video kết thúc
      video.onended = () => {
        this.handleVideoEnded();
      };

      // Xử lý khi video bị lỗi tải (ví dụ chưa upload lên Archive.org và chưa chọn file local)
      video.onerror = () => {
        console.warn('InteractiveVideo: Video không phát được từ URL:', video.src);
        this.renderVideoErrorFallback();
      };
    }

    // Nút chọn video từ máy tính trên thanh player
    const inputChooseFile = document.getElementById('input-player-choose-file');
    if (inputChooseFile) {
      inputChooseFile.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file && this.activeLesson) {
          this.registerLocalVideoFile(this.activeLesson.video, file);
          const newUrl = URL.createObjectURL(file);
          if (this.videoElem) {
            this.videoElem.src = newUrl;
            this.videoElem.load();
            this.videoElem.play().catch(() => {});
          }
          this.removeVideoErrorFallback();
          const badge = document.getElementById('player-video-source-badge');
          if (badge) {
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
            badge.innerHTML = `<i class="fa-solid fa-hard-drive"></i> File máy tính: ${escapeHtml(file.name)}`;
          }
        }
      };
    }

    // Nút đổi link URL video riêng
    const btnCustomUrl = document.getElementById('btn-player-custom-url');
    if (btnCustomUrl) {
      btnCustomUrl.onclick = () => {
        if (this.activeLesson) {
          this.openCustomUrlModal(this.activeLesson);
        }
      };
    }

    // Nút Cài đặt câu hỏi dừng (Dành cho GV & Admin)
    const btnEditQuestions = document.getElementById('btn-player-edit-questions');
    if (btnEditQuestions) {
      btnEditQuestions.onclick = () => {
        if (this.activeLesson) {
          this.openQuestionEditor(this.activeLesson);
        }
      };
    }

    // Nút Admin upload lên Archive.org
    const btnAdminUpload = document.getElementById('btn-player-admin-upload');
    if (btnAdminUpload) {
      btnAdminUpload.onclick = () => {
        if (this.activeLesson) {
          const file = this.getLocalVideoFile(this.activeLesson.video);
          if (file) {
            this.uploadVideoToArchive(this.activeLesson, file);
          } else {
            alert('Vui lòng chọn file video từ máy trước khi tải lên Archive.org!');
          }
        }
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

  // Hiển thị khung thông báo khi video chưa có trên Archive.org
  renderVideoErrorFallback() {
    if (!this.videoElem || !this.activeLesson) return;
    const parent = this.videoElem.parentElement;
    if (!parent) return;

    let fallback = document.getElementById('video-error-fallback');
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.id = 'video-error-fallback';
      fallback.className = 'absolute inset-0 bg-slate-950/90 backdrop-blur-md z-20 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-fadeIn';
      parent.appendChild(fallback);
    }

    fallback.innerHTML = `
      <div class="w-16 h-16 rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl shadow-inner">
        <i class="fa-solid fa-cloud-arrow-up"></i>
      </div>
      <div>
        <h4 class="text-base sm:text-lg font-black text-white">
          Chưa tìm thấy video trên đám mây Archive.org
        </h4>
        <p class="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
          Tệp <code class="font-mono text-amber-300">${escapeHtml(this.activeLesson.video)}</code> đang chờ tải lên Archive.org. Bạn có thể <b>chọn ngay file MP4 từ máy tính</b> để phát ngay lập tức và thử sức với các câu hỏi tương tác!
        </p>
      </div>
      <div class="flex items-center gap-3 flex-wrap justify-center pt-2">
        <label class="cursor-pointer px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-lg shadow-blue-500/30 flex items-center gap-2">
          <i class="fa-solid fa-folder-open"></i> Chọn tệp video MP4 từ máy tính để phát ngay
          <input type="file" id="input-fallback-choose-video" accept="video/mp4,video/*" class="hidden" />
        </label>
        <button type="button" id="btn-fallback-enter-url" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition border border-slate-700 flex items-center gap-2">
          <i class="fa-solid fa-link"></i> Nhập link URL khác
        </button>
      </div>
    `;

    const inputFallback = document.getElementById('input-fallback-choose-video');
    if (inputFallback) {
      inputFallback.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file && this.activeLesson) {
          this.registerLocalVideoFile(this.activeLesson.video, file);
          const newUrl = URL.createObjectURL(file);
          if (this.videoElem) {
            this.videoElem.src = newUrl;
            this.videoElem.load();
            this.videoElem.play().catch(() => {});
          }
          this.removeVideoErrorFallback();
        }
      };
    }

    const btnFallbackUrl = document.getElementById('btn-fallback-enter-url');
    if (btnFallbackUrl) {
      btnFallbackUrl.onclick = () => {
        if (this.activeLesson) {
          this.openCustomUrlModal(this.activeLesson);
        }
      };
    }
  },

  removeVideoErrorFallback() {
    const el = document.getElementById('video-error-fallback');
    if (el) el.remove();
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
      timeText.textContent = `${this.formatTime(curTime)} / ${this.formatTime(duration)}`;
    }

    // Kiểm tra xem giây hiện tại có trùng với mốc câu hỏi dừng chưa hoàn thành hay không
    if (this.checkpointsMap[curTime] && !this.completedCheckpoints.has(curTime)) {
      video.pause();
      this.triggerCheckpointQuiz(curTime);
    }
  },

  // ==========================================
  // 4. KÍCH HOẠT LỚP CÂU HỎI TƯƠNG TÁC TẠI MỐC DỪNG
  // ==========================================
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

    const timeFormatted = this.formatTime(this.currentCheckpointSec);

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
                Mốc Tương Tác: ${timeFormatted}
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
          ${(q.options || []).map((opt, i) => {
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
  },

  // ==========================================
  // 5. KẾT THÚC BÀI GIẢNG VÀ TRUYỀN ĐIỂM THỜI GIAN THỰC LÊN CLOUD
  // ==========================================
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
  },

  // ==========================================
  // 6. THIẾT LẬP CÂU HỎI & MỐC DỪNG (QUESTION & CHECKPOINT EDITOR)
  // ==========================================
  async openQuestionEditor(lesson) {
    if (!lesson) return;
    this.editingLesson = lesson;

    // Tạm dừng video nếu đang phát
    if (this.videoElem) {
      this.grabbedVideoTime = Math.floor(this.videoElem.currentTime || 0);
      this.videoElem.pause();
    } else {
      this.grabbedVideoTime = 0;
    }

    // Nạp danh sách câu hỏi hiện tại của bài học này
    let questions = Storage.getCustomVideoQuestions(this.currentGrade, lesson.video);
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      let allQ = [];
      if (typeof this.loadGradeFn === 'function') {
        allQ = await this.loadGradeFn(this.currentGrade);
      } else {
        try {
          const res = await fetch(`data/grade_${this.currentGrade}.json`);
          if (res.ok) allQ = await res.json();
        } catch (e) {}
      }
      questions = allQ.filter(q => q.video && q.video.toLowerCase() === lesson.video.toLowerCase() && q.video_stop != null);
    }

    // Sao chép sâu để chỉnh sửa
    this.editingQuestions = JSON.parse(JSON.stringify(questions || []));

    // Mở modal
    const modal = document.getElementById('modal-video-question-editor');
    if (!modal) return;
    modal.classList.remove('hidden');

    // Cập nhật tiêu đề modal
    const titleEl = document.getElementById('vqe-modal-title');
    const badgeEl = document.getElementById('vqe-modal-badge');
    const subEl = document.getElementById('vqe-modal-subtitle');
    if (titleEl) titleEl.textContent = `Thiết Lập Câu Hỏi Dừng: ${lesson.lesson}`;
    if (badgeEl) badgeEl.textContent = `Khối ${this.currentGrade}`;
    if (subEl) subEl.textContent = `${lesson.topic} • Tệp video: ${lesson.video}`;

    // Đóng form thêm/sửa câu hỏi nếu đang mở
    this.hideQuestionEditForm();

    // Render danh sách câu hỏi
    this.renderEditorQuestionsList();
    this.bindEditorEvents();
  },

  renderEditorQuestionsList() {
    const listContainer = document.getElementById('vqe-questions-list');
    const statCps = document.getElementById('vqe-stat-checkpoints');
    const statQs = document.getElementById('vqe-stat-questions');
    if (!listContainer) return;

    // Nhóm câu hỏi theo từng mốc giây
    const grouped = {};
    this.editingQuestions.forEach((q, idx) => {
      const sec = Math.floor(Number(q.video_stop) || 0);
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push({ question: q, originalIndex: idx });
    });

    const sortedSecs = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    if (statCps) statCps.textContent = `${sortedSecs.length} mốc dừng`;
    if (statQs) statQs.textContent = `${this.editingQuestions.length} câu hỏi`;

    if (sortedSecs.length === 0) {
      listContainer.innerHTML = `
        <div class="py-12 text-center bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-2">
          <i class="fa-solid fa-circle-question text-3xl text-slate-300 dark:text-slate-600"></i>
          <h5 class="text-sm font-bold text-slate-700 dark:text-slate-300">Chưa có câu hỏi dừng nào</h5>
          <p class="text-xs text-slate-400">Hãy nhấn nút <b>"Thêm câu hỏi dừng mới"</b> ở trên để tạo câu hỏi đầu tiên!</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = sortedSecs.map(sec => {
      const items = grouped[sec];
      const timeStr = this.formatTime(sec);

      return `
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-mono font-black text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-flag text-[10px]"></i> Mốc: ${timeStr} (${sec}s)
              </span>
              <span class="text-xs text-slate-400 font-bold">
                ${items.length} câu hỏi
              </span>
            </div>

            <button type="button" data-vqe-add-at-sec="${sec}" class="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-blue-50 text-blue-600 dark:hover:bg-slate-700 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition flex items-center gap-1">
              <i class="fa-solid fa-plus"></i> Thêm vào mốc này
            </button>
          </div>

          <div class="space-y-3">
            ${items.map(({ question: q, originalIndex: idx }) => {
              const levelLabel = q.level === 'DS' ? 'Đúng / Sai' : `Mức ${q.level}`;
              const timeLimit = q.video_time || 15;

              return `
                <div class="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 group">
                  <div class="flex-1 space-y-1.5">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="px-2 py-0.5 rounded text-[10px] font-black ${q.level === 'DS' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'}">
                        ${levelLabel}
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono">
                        ${timeLimit}s
                      </span>
                      <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Đáp án: ${escapeHtml(q.answer)}
                      </span>
                    </div>

                    <p class="text-xs font-bold text-slate-800 dark:text-white leading-relaxed">
                      ${escapeHtml(q.question)}
                    </p>

                    <!-- Danh sách đáp án rút gọn -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] pt-1">
                      ${(q.options || []).map((opt, oIdx) => {
                        const letter = ['A', 'B', 'C', 'D'][oIdx];
                        const isAns = letter === q.answer;
                        return `
                          <div class="flex items-center gap-1.5 ${isAns ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'}">
                            <span class="w-4 h-4 rounded text-[9px] font-black flex items-center justify-center ${isAns ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">${letter}</span>
                            <span class="truncate">${escapeHtml(opt)}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- Nút sửa và xóa -->
                  <div class="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                    <button type="button" data-vqe-edit-idx="${idx}" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1">
                      <i class="fa-solid fa-pen-to-square text-blue-500"></i> Sửa
                    </button>
                    <button type="button" data-vqe-delete-idx="${idx}" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 text-xs font-bold transition flex items-center gap-1" title="Xóa câu hỏi này">
                      <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Gắn sự kiện sửa / xóa / thêm tại mốc
    listContainer.querySelectorAll('[data-vqe-edit-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-vqe-edit-idx'));
        this.showQuestionEditForm(idx);
      };
    });

    listContainer.querySelectorAll('[data-vqe-delete-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute('data-vqe-delete-idx'));
        this.deleteQuestionFromEditor(idx);
      };
    });

    listContainer.querySelectorAll('[data-vqe-add-at-sec]').forEach(btn => {
      btn.onclick = () => {
        const sec = Number(btn.getAttribute('data-vqe-add-at-sec'));
        this.showQuestionEditForm(null, sec);
      };
    });
  },

  bindEditorEvents() {
    // Nút mở form thêm câu hỏi mới
    const btnOpenAdd = document.getElementById('btn-vqe-open-add');
    if (btnOpenAdd) {
      btnOpenAdd.onclick = () => {
        const defaultSec = this.grabbedVideoTime > 0 ? this.grabbedVideoTime : '';
        this.showQuestionEditForm(null, defaultSec);
      };
    }

    // Nút khôi phục câu hỏi ban đầu từ ngân hàng
    const btnReset = document.getElementById('btn-vqe-reset-default');
    if (btnReset) {
      btnReset.onclick = () => {
        this.resetQuestionsToBankDefault();
      };
    }

    // Nút đóng form thêm/sửa
    const btnCloseForm = document.getElementById('btn-vqe-close-form');
    const btnCancelForm = document.getElementById('btn-vqe-cancel-form');
    if (btnCloseForm) btnCloseForm.onclick = () => this.hideQuestionEditForm();
    if (btnCancelForm) btnCancelForm.onclick = () => this.hideQuestionEditForm();

    // Nút lấy mốc thời gian hiện tại của video
    const btnGrabTime = document.getElementById('btn-vqe-grab-video-time');
    if (btnGrabTime) {
      btnGrabTime.onclick = () => {
        let sec = 0;
        if (this.videoElem && !isNaN(this.videoElem.currentTime)) {
          sec = Math.floor(this.videoElem.currentTime);
        } else if (this.grabbedVideoTime > 0) {
          sec = this.grabbedVideoTime;
        }
        const inputSec = document.getElementById('vqe-input-stop-sec');
        if (inputSec) {
          inputSec.value = sec;
        }
      };
    }

    // Submit form thêm / sửa câu hỏi
    const form = document.getElementById('vqe-question-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        this.saveQuestionFromEditor();
      };
    }
  },

  showQuestionEditForm(idx = null, prefillSec = '') {
    const formBox = document.getElementById('vqe-form-container');
    const formTitle = document.getElementById('vqe-form-title');
    if (!formBox) return;

    formBox.classList.remove('hidden');

    const inputId = document.getElementById('vqe-edit-q-id');
    const inputStopSec = document.getElementById('vqe-input-stop-sec');
    const inputTimeLimit = document.getElementById('vqe-input-time-limit');
    const inputLevel = document.getElementById('vqe-input-level');
    const inputQText = document.getElementById('vqe-input-question-text');
    const optA = document.getElementById('vqe-opt-A');
    const optB = document.getElementById('vqe-opt-B');
    const optC = document.getElementById('vqe-opt-C');
    const optD = document.getElementById('vqe-opt-D');

    if (idx !== null && this.editingQuestions[idx]) {
      // Chế độ chỉnh sửa
      const q = this.editingQuestions[idx];
      this.editingQuestionId = idx;
      if (inputId) inputId.value = String(idx);
      if (formTitle) formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Chỉnh Sửa Câu Hỏi (Mốc ${q.video_stop}s)`;
      if (inputStopSec) inputStopSec.value = q.video_stop;
      if (inputTimeLimit) inputTimeLimit.value = q.video_time || 15;
      if (inputLevel) inputLevel.value = q.level || '1';
      if (inputQText) inputQText.value = q.question || '';
      if (optA) optA.value = q.options?.[0] || '';
      if (optB) optB.value = q.options?.[1] || '';
      if (optC) optC.value = q.options?.[2] || '';
      if (optD) optD.value = q.options?.[3] || '';

      const rad = document.querySelector(`input[name="vqe-correct-choice"][value="${q.answer || 'A'}"]`);
      if (rad) rad.checked = true;
    } else {
      // Chế độ thêm mới
      this.editingQuestionId = null;
      if (inputId) inputId.value = '';
      if (formTitle) formTitle.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Thêm Câu Hỏi Dừng Mới`;
      if (inputStopSec) inputStopSec.value = prefillSec !== '' ? prefillSec : (this.grabbedVideoTime > 0 ? this.grabbedVideoTime : '');
      if (inputTimeLimit) inputTimeLimit.value = '15';
      if (inputLevel) inputLevel.value = '1';
      if (inputQText) inputQText.value = '';
      if (optA) optA.value = '';
      if (optB) optB.value = '';
      if (optC) optC.value = '';
      if (optD) optD.value = '';
      const radA = document.getElementById('vqe-radio-A');
      if (radA) radA.checked = true;
    }

    formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    inputStopSec?.focus();
  },

  hideQuestionEditForm() {
    const formBox = document.getElementById('vqe-form-container');
    if (formBox) formBox.classList.add('hidden');
    this.editingQuestionId = null;
  },

  saveQuestionFromEditor() {
    const stopSecRaw = document.getElementById('vqe-input-stop-sec')?.value;
    const timeLimit = parseInt(document.getElementById('vqe-input-time-limit')?.value, 10) || 15;
    const level = document.getElementById('vqe-input-level')?.value || '1';
    const questionText = document.getElementById('vqe-input-question-text')?.value.trim();
    const optA = document.getElementById('vqe-opt-A')?.value.trim();
    const optB = document.getElementById('vqe-opt-B')?.value.trim();
    const optC = document.getElementById('vqe-opt-C')?.value.trim();
    const optD = document.getElementById('vqe-opt-D')?.value.trim();
    const answer = document.querySelector('input[name="vqe-correct-choice"]:checked')?.value || 'A';

    if (!stopSecRaw || isNaN(this.parseStopSec(stopSecRaw))) {
      alert('Vui lòng nhập mốc thời gian dừng hợp lệ (ví dụ: 120 hoặc 02:00)!');
      document.getElementById('vqe-input-stop-sec')?.focus();
      return;
    }

    if (!questionText) {
      alert('Vui lòng nhập nội dung câu hỏi dừng!');
      document.getElementById('vqe-input-question-text')?.focus();
      return;
    }

    if (!optA || !optB || !optC || !optD) {
      alert('Vui lòng nhập đầy đủ cả 4 phương án A, B, C, D!');
      return;
    }

    const stopSec = this.parseStopSec(stopSecRaw);

    const questionObj = {
      id: (this.editingQuestionId !== null && this.editingQuestions[this.editingQuestionId]?.id) 
        ? this.editingQuestions[this.editingQuestionId].id 
        : `vq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      grade: String(this.currentGrade),
      topic: this.editingLesson.topic,
      lesson: this.editingLesson.lesson,
      level,
      question: questionText,
      options: [optA, optB, optC, optD],
      answer,
      video: this.editingLesson.video,
      video_stop: stopSec,
      video_quiz: '1',
      video_time: timeLimit
    };

    if (this.editingQuestionId !== null && this.editingQuestions[this.editingQuestionId]) {
      // Cập nhật câu hỏi hiện có
      this.editingQuestions[this.editingQuestionId] = questionObj;
    } else {
      // Thêm câu hỏi mới
      this.editingQuestions.push(questionObj);
    }

    // Sắp xếp lại theo mốc giây
    this.editingQuestions.sort((a, b) => Number(a.video_stop) - Number(b.video_stop));

    // Lưu vào Storage và tự động đồng bộ Cloud Database
    Storage.saveCustomVideoQuestions(this.currentGrade, this.editingLesson.video, this.editingQuestions);

    // Nếu bài giảng này đang phát trên player, cập nhật ngay lập tức
    if (this.activeLesson && this.activeLesson.video.toLowerCase() === this.editingLesson.video.toLowerCase()) {
      this.activeQuestions = [...this.editingQuestions];
      const newMap = {};
      this.activeQuestions.forEach(q => {
        const s = Math.floor(Number(q.video_stop));
        if (!newMap[s]) newMap[s] = [];
        newMap[s].push(q);
      });
      this.checkpointsMap = newMap;
      this.totalQuestionsInLesson = this.activeQuestions.length;
      this.refreshPlayerTimelineChips();
    }

    this.hideQuestionEditForm();
    this.renderEditorQuestionsList();
  },

  deleteQuestionFromEditor(idx) {
    if (idx < 0 || idx >= this.editingQuestions.length) return;
    const q = this.editingQuestions[idx];
    if (!confirm(`Bạn có chắc chắn muốn xóa câu hỏi này khỏi mốc ${q.video_stop}s?`)) return;

    this.editingQuestions.splice(idx, 1);

    // Lưu vào Storage và đồng bộ Cloud
    Storage.saveCustomVideoQuestions(this.currentGrade, this.editingLesson.video, this.editingQuestions);

    // Cập nhật player nếu đang chạy
    if (this.activeLesson && this.activeLesson.video.toLowerCase() === this.editingLesson.video.toLowerCase()) {
      this.activeQuestions = [...this.editingQuestions];
      const newMap = {};
      this.activeQuestions.forEach(item => {
        const s = Math.floor(Number(item.video_stop));
        if (!newMap[s]) newMap[s] = [];
        newMap[s].push(item);
      });
      this.checkpointsMap = newMap;
      this.totalQuestionsInLesson = this.activeQuestions.length;
      this.refreshPlayerTimelineChips();
    }

    this.renderEditorQuestionsList();
  },

  async resetQuestionsToBankDefault() {
    if (!this.editingLesson) return;
    if (!confirm(`Khôi phục lại toàn bộ câu hỏi mặc định từ ngân hàng đề cho bài giảng này?\nMọi câu hỏi và mốc dừng do bạn tự thêm/sửa sẽ được khôi phục về trạng thái ban đầu.`)) {
      return;
    }

    Storage.resetCustomVideoQuestions(this.currentGrade, this.editingLesson.video);

    // Nạp lại câu hỏi gốc từ file json
    let questions = [];
    if (typeof this.loadGradeFn === 'function') {
      questions = await this.loadGradeFn(this.currentGrade);
    } else {
      try {
        const res = await fetch(`data/grade_${this.currentGrade}.json`);
        if (res.ok) questions = await res.json();
      } catch (e) {}
    }

    const filtered = questions.filter(q => q.video && q.video.toLowerCase() === this.editingLesson.video.toLowerCase() && q.video_stop != null);
    this.editingQuestions = JSON.parse(JSON.stringify(filtered));

    if (this.activeLesson && this.activeLesson.video.toLowerCase() === this.editingLesson.video.toLowerCase()) {
      this.activeQuestions = [...this.editingQuestions];
      const newMap = {};
      this.activeQuestions.forEach(item => {
        const s = Math.floor(Number(item.video_stop));
        if (!newMap[s]) newMap[s] = [];
        newMap[s].push(item);
      });
      this.checkpointsMap = newMap;
      this.totalQuestionsInLesson = this.activeQuestions.length;
      this.refreshPlayerTimelineChips();
    }

    this.renderEditorQuestionsList();
    alert('✅ Đã khôi phục câu hỏi mặc định cho bài giảng thành công!');
  },

  // Cập nhật các chip mốc dừng trên player view thời gian thực
  refreshPlayerTimelineChips() {
    const chipsContainer = document.getElementById('player-timeline-chips-container');
    const sortedSecs = Object.keys(this.checkpointsMap).map(Number).sort((a, b) => a - b);
    const statusEl = document.getElementById('player-checkpoints-status');

    if (statusEl) {
      statusEl.textContent = `${this.completedCheckpoints.size} / ${sortedSecs.length} điểm dừng`;
    }

    if (chipsContainer) {
      chipsContainer.innerHTML = sortedSecs.map(sec => {
        const timeText = this.formatTime(sec);
        const qCount = this.checkpointsMap[sec]?.length || 0;
        return `
          <button type="button" data-jump-to-sec="${sec}" class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 dark:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600">
            <i class="fa-solid fa-flag text-[10px] text-rose-500"></i>
            <span>${timeText}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
              ${qCount} câu
            </span>
          </button>
        `;
      }).join('');

      chipsContainer.querySelectorAll('[data-jump-to-sec]').forEach(btn => {
        btn.onclick = () => {
          const sec = Number(btn.getAttribute('data-jump-to-sec'));
          if (this.videoElem) {
            this.videoElem.currentTime = Math.max(0, sec - 2);
            this.videoElem.play().catch(() => {});
          }
        };
      });
    }
  },

  // ==========================================
  // 7. CẤU HÌNH ĐƯỜNG LINK VIDEO TÙY CHỈNH
  // ==========================================
  openCustomUrlModal(lesson) {
    this.currentCustomUrlLesson = lesson;
    const modal = document.getElementById('modal-video-custom-url');
    if (!modal) return;

    modal.classList.remove('hidden');

    const nameEl = document.getElementById('modal-custom-url-lesson-name');
    const inputUrl = document.getElementById('input-custom-video-url');
    if (nameEl) nameEl.textContent = `${lesson.lesson} (${lesson.video})`;
    if (inputUrl) {
      inputUrl.value = Storage.getCustomVideoUrl(lesson.video) || '';
      inputUrl.focus();
    }
  },

  setupGlobalModalListeners() {
    // Xử lý lưu URL video tùy chỉnh
    const formUrl = document.getElementById('form-custom-video-url');
    if (formUrl) {
      formUrl.onsubmit = (e) => {
        e.preventDefault();
        if (!this.currentCustomUrlLesson) return;
        const url = document.getElementById('input-custom-video-url')?.value.trim();
        if (url) {
          Storage.saveCustomVideoUrl(this.currentCustomUrlLesson.video, url);
          if (this.videoElem && this.activeLesson && this.activeLesson.video === this.currentCustomUrlLesson.video) {
            this.videoElem.src = url;
            this.videoElem.load();
            this.videoElem.play().catch(() => {});
            this.removeVideoErrorFallback();
          }
          alert('✅ Đã lưu URL tùy chỉnh và đồng bộ lên Cloud Database thành công!');
        }
        document.getElementById('modal-video-custom-url')?.classList.add('hidden');
        this.render();
      };
    }

    // Xử lý xóa URL video tùy chỉnh
    const btnDelUrl = document.getElementById('btn-delete-custom-video-url');
    if (btnDelUrl) {
      btnDelUrl.onclick = () => {
        if (!this.currentCustomUrlLesson) return;
        Storage.saveCustomVideoUrl(this.currentCustomUrlLesson.video, '');
        alert('Đã xóa link URL tùy chỉnh. Hệ thống sẽ dùng nguồn Archive.org mặc định.');
        document.getElementById('modal-video-custom-url')?.classList.add('hidden');
        this.render();
      };
    }
  },

  // ==========================================
  // 8. TẢI VIDEO LÊN ARCHIVE.ORG S3 TRỰC TIẾP TỪ APP (ADMIN)
  // ==========================================
  async uploadVideoToArchive(lesson, file) {
    const config = Storage.getVideoConfig();
    if (!config.archiveAccessKey || !config.archiveSecretKey) {
      alert('Vui lòng nhập Archive.org Access Key và Secret Key trong tab "Quản Trị" trước khi tải lên!');
      return;
    }

    const identifier = config.archiveIdentifier || 'tinhoc-hub-thpt';
    const confirmUpload = confirm(`Tải file "${file.name}" lên Archive.org (${identifier})?\nQuá trình có thể mất từ 1-3 phút tùy dung lượng video.`);
    if (!confirmUpload) return;

    const targetUrl = `https://s3.us.archive.org/${encodeURIComponent(identifier)}/${encodeURIComponent(lesson.video)}`;

    // Tạo thông báo tiến trình tải
    let toast = document.getElementById('archive-single-upload-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'archive-single-upload-toast';
      toast.className = 'fixed bottom-6 right-6 z-50 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 max-w-sm space-y-2 animate-fadeIn';
      document.body.appendChild(toast);
    }

    toast.classList.remove('hidden');
    toast.innerHTML = `
      <div class="flex items-center justify-between text-xs font-bold">
        <span class="flex items-center gap-1.5"><i class="fa-solid fa-spinner fa-spin text-rose-500"></i> Đang tải lên Archive.org...</span>
        <span id="toast-upload-percent" class="font-mono text-blue-400">0%</span>
      </div>
      <p class="text-[11px] text-slate-400 truncate">${escapeHtml(lesson.video)}</p>
      <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div id="toast-upload-bar" class="bg-blue-600 h-1.5 rounded-full transition-all duration-200" style="width: 0%"></div>
      </div>
    `;

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', targetUrl, true);
        xhr.setRequestHeader('Authorization', `LOW ${config.archiveAccessKey}:${config.archiveSecretKey}`);
        xhr.setRequestHeader('x-archive-meta-mediatype', 'movies');
        xhr.setRequestHeader('x-archive-meta-collection', 'opensource_movies');
        xhr.setRequestHeader('x-archive-meta-title', `Bài giảng Tin học THPT - ${lesson.lesson || lesson.video}`);
        xhr.setRequestHeader('x-archive-ignore-preexisting-bucket', '1');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            const percentEl = document.getElementById('toast-upload-percent');
            const barEl = document.getElementById('toast-upload-bar');
            if (percentEl) percentEl.textContent = `${percent}%`;
            if (barEl) barEl.style.width = `${percent}%`;
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải lên Archive.org!'));
        xhr.send(file);
      });

      // Lưu trạng thái đã upload
      if (!config.uploadedVideos) config.uploadedVideos = {};
      config.uploadedVideos[lesson.video] = {
        uploadedAt: new Date().toISOString(),
        size: file.size
      };
      Storage.saveVideoConfig(config);

      toast.innerHTML = `
        <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-check"></i> Đã tải lên Archive.org thành công!
        </div>
        <p class="text-[11px] text-slate-300">Video hiện đã sẵn sàng phục vụ toàn trường.</p>
      `;
      setTimeout(() => toast?.classList.add('hidden'), 4000);
      alert(`🎉 Chúc mừng! Tệp "${lesson.video}" đã được lưu trữ vĩnh viễn trên Archive.org và đồng bộ cho học sinh.`);
      this.render();
    } catch (err) {
      toast.innerHTML = `
        <div class="text-xs font-bold text-rose-400 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-xmark"></i> Lỗi tải lên: ${escapeHtml(err.message)}
        </div>
      `;
      setTimeout(() => toast?.classList.add('hidden'), 5000);
      alert(`⚠️ Lỗi khi tải lên Archive.org: ${err.message}`);
    }
  }
};
