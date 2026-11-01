/**
 * TIN HỌC HUB - REAL-TIME INTERACTIVE CLASSROOM VIDEO CONTROLLER (js/live-video.js)
 * Nền tảng Chiếu Phim & Học Video Tương Tác Trực Tuyến Thời Gian Thực:
 * - Giáo viên tạo phòng Live cho Trường, Khối, Lớp và Bài giảng video cụ thể.
 * - Điều khiển phát đồng bộ (Master Sync): GV bấm Play/Pause/Seek, tất cả học sinh phát cùng giây.
 * - Màn hình Học sinh (Student Cinema View): Tự động toàn màn hình (Fullscreen / iOS Safe Mode), chống tua tự do.
 * - Mốc dừng đồng loạt (Synchronous Checkpoints): Dừng cùng lúc cả lớp, hiển thị câu hỏi trắc nghiệm đếm ngược.
 * - Bảng khảo sát thời gian thực (Live Polling & Voting Breakdown): Cập nhật từng giây tỉ lệ chọn A, B, C, D của cả lớp.
 * - Công bố đáp án tức thì: Báo đúng/sai cho từng học sinh kèm hiệu ứng pháo hoa Confetti và phổ bình chọn lớp.
 * - Tổng kết buổi học: Bục vinh danh Podium Top 1-2-3, lưu vào Sổ điểm lớp (Gradebook) và xuất Excel BOM tiếng Việt.
 */

import { DEFAULT_FIREBASE_DB_URL } from './cloud-sync.js?v=20261101_54';
import { Storage } from './storage.js?v=20261101_54';
import { Auth, SCHOOLS_DATA } from './auth.js?v=20261101_54';
import { escapeHtml } from './utils.js?v=20261101_54';
import { Proctor } from './proctor.js?v=20261101_54';
import { Gradebook } from './gradebook.js?v=20261101_54';

export const LiveVideo = {
  manifest: null,
  activeRoom: null,
  isHost: false,
  studentInfo: null,
  eventSource: null,
  pollTimer: null,
  heartbeatTimer: null,
  videoElem: null,
  localVideoMap: {},
  questionsList: [],
  checkpointsMap: {},
  sortedCheckpoints: [],
  selectedAnswer: null,
  hasSubmittedCurrentQuestion: false,
  remoteState: null,
  lastSyncedTime: 0,
  countdownInterval: null,
  remainingSeconds: 0,

  init(manifest = null) {
    this.manifest = manifest;
    this.bindGlobalEvents();
  },

  getBaseDbUrl() {
    return DEFAULT_FIREBASE_DB_URL.trim().replace(/\/+$/, '');
  },

  // =========================================================================
  // 1. DIALOG: TẠO PHÒNG LIVE VIDEO CHO GIÁO VIÊN
  // =========================================================================
  async openCreateModal() {
    if (!Auth.isTeacher() && !Auth.isAdmin()) {
      alert('Chức năng này dành riêng cho Giáo viên và Ban Quản Trị để điều phối tiết học trực tuyến!');
      return;
    }

    // Đảm bảo manifest đã được nạp
    if (!this.manifest) {
      if (window.App && window.App.manifest) {
        this.manifest = window.App.manifest;
      } else {
        try {
          const res = await fetch('data/manifest.json', { cache: 'no-cache' });
          if (res.ok) this.manifest = await res.json();
        } catch (e) {
          console.warn('Lỗi nạp manifest trong LiveVideo:', e);
        }
      }
    }

    const modal = document.getElementById('modal-create-live-video-room');
    if (!modal) {
      this.injectLiveVideoModals();
    }

    const modalEl = document.getElementById('modal-create-live-video-room');
    if (!modalEl) return;

    this.populateCreateModalData();
    modalEl.classList.remove('hidden');
  },

  populateCreateModalData() {
    const schoolSel = document.getElementById('live-input-school');
    const gradeSel = document.getElementById('live-input-grade');
    const classSel = document.getElementById('live-input-class');
    const lessonSel = document.getElementById('live-input-lesson');
    const codeInput = document.getElementById('live-input-room-code');

    // Tự sinh mã phòng ngẫu nhiên dễ đọc (vd: LIVE-12E-892)
    if (codeInput) {
      const rnd = Math.floor(100 + Math.random() * 900);
      codeInput.value = `LIVE-${rnd}`;
    }

    // Trường học
    if (schoolSel) {
      const schools = Object.keys(SCHOOLS_DATA);
      schoolSel.innerHTML = `
        <option value="all">🌐 Tất cả các trường (Mở tự do)</option>
        ${schools.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
      `;
      schoolSel.value = Auth.getCurrentUser()?.school || 'all';
    }

    // Cập nhật lớp học đồng bộ theo Trường & Khối
    const updateClasses = () => {
      const curSchool = schoolSel?.value || 'all';
      const curGrade = gradeSel?.value || '12';
      if (!classSel) return;

      if (curSchool === 'all' || !SCHOOLS_DATA[curSchool]) {
        classSel.innerHTML = `<option value="all">Tất cả các lớp trong khối ${curGrade}</option>`;
        return;
      }

      const schoolInfo = SCHOOLS_DATA[curSchool];
      const classesForGrade = schoolInfo.classes?.[curGrade] || [];

      if (classesForGrade.length === 0) {
        classSel.innerHTML = `<option value="all">Tất cả các lớp (Không giới hạn)</option>`;
      } else {
        classSel.innerHTML = `
          <option value="all">Tất cả các lớp (Toàn khối ${curGrade})</option>
          ${classesForGrade.map(c => `<option value="${escapeHtml(c)}">Lớp ${escapeHtml(c)}</option>`).join('')}
        `;
      }
    };

    // Tự động điền tiêu đề buổi học theo bài và lớp
    const autoFillTitle = () => {
      const titleInput = document.getElementById('live-input-title');
      const selectedOption = lessonSel?.selectedOptions?.[0];
      const lessonTitle = selectedOption?.getAttribute('data-lesson');
      const curClass = classSel?.value;
      const classText = (curClass && curClass !== 'all') ? ` (Lớp ${curClass})` : '';
      if (titleInput && lessonTitle) {
        titleInput.value = `Tiết học: ${lessonTitle}${classText}`;
      }
    };

    // Cập nhật danh sách bài học video theo Khối (Đọc chính xác từ grade.interactive_videos)
    const updateLessons = () => {
      const curGrade = gradeSel?.value || '12';
      if (!lessonSel) return;

      const manifest = this.manifest || window.App?.manifest;
      const gData = manifest?.grades?.[curGrade]?.interactive_videos || {};
      const lessonsList = [];

      Object.keys(gData).forEach(vname => {
        const v = gData[vname];
        const videoFileName = v.video || vname;
        const cps = Array.isArray(v.checkpoints) ? v.checkpoints : [];
        lessonsList.push({
          topic: v.topic || '',
          lesson: v.lesson || vname,
          video: videoFileName,
          checkpoints: cps.length
        });
      });

      if (lessonsList.length === 0) {
        lessonSel.innerHTML = `<option value="">Không tìm thấy bài giảng video cho khối ${curGrade}</option>`;
      } else {
        lessonSel.innerHTML = lessonsList.map(l => `
          <option value="${escapeHtml(l.video)}" data-topic="${escapeHtml(l.topic)}" data-lesson="${escapeHtml(l.lesson)}">
            ${escapeHtml(l.lesson)} (${l.checkpoints} câu hỏi dừng)
          </option>
        `).join('');
      }
      autoFillTitle();
    };

    if (lessonSel) lessonSel.onchange = autoFillTitle;
    if (classSel) classSel.onchange = autoFillTitle;

    if (schoolSel) schoolSel.onchange = updateClasses;
    if (gradeSel) {
      gradeSel.onchange = () => {
        updateClasses();
        updateLessons();
      };
    }

    updateClasses();
    updateLessons();
  },

  // =========================================================================
  // 2. TẠO PHÒNG TRÊN FIREBASE DATABASE
  // =========================================================================
  async handleCreateRoomSubmit() {
    const codeInput = document.getElementById('live-input-room-code');
    const titleInput = document.getElementById('live-input-title');
    const schoolSel = document.getElementById('live-input-school');
    const gradeSel = document.getElementById('live-input-grade');
    const classSel = document.getElementById('live-input-class');
    const lessonSel = document.getElementById('live-input-lesson');
    const countdownSel = document.getElementById('live-input-countdown');
    const submitBtn = document.getElementById('btn-confirm-create-live-room');

    const roomId = (codeInput?.value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!roomId || roomId.length < 3) {
      alert('Vui lòng nhập Mã phòng hợp lệ (từ 3 ký tự chữ và số, ví dụ LIVE-12E-01)');
      codeInput?.focus();
      return;
    }

    const selectedOption = lessonSel?.selectedOptions?.[0];
    const videoFileName = lessonSel?.value;
    if (!videoFileName) {
      alert('Vui lòng chọn bài giảng video cho phòng học!');
      return;
    }

    const lessonTitle = selectedOption?.getAttribute('data-lesson') || 'Bài học Tin học';
    const topicTitle = selectedOption?.getAttribute('data-topic') || 'Chủ đề Tin học';
    const school = schoolSel?.value || 'all';
    const grade = gradeSel?.value || '12';
    const className = classSel?.value || 'all';
    const countdownSec = parseInt(countdownSel?.value || '20', 10);
    const title = (titleInput?.value || '').trim() || `Lớp học trực tuyến: ${lessonTitle}`;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo phòng...';
    }

    try {
      const user = Auth.getCurrentUser();
      const dbUrl = this.getBaseDbUrl();

      // Nạp danh sách câu hỏi dừng của video này
      let questions = [];
      try {
        // 1. Ưu tiên câu hỏi tùy biến của giáo viên nếu có
        const customQ = Storage.getCustomVideoQuestions(grade, videoFileName);
        if (customQ && Array.isArray(customQ) && customQ.length > 0) {
          questions = customQ;
        } else {
          // 2. Nạp từ ngân hàng câu hỏi gốc của khối
          if (window.App && typeof window.App.loadGradeData === 'function') {
            await window.App.loadGradeData(grade);
            const allGradeQ = window.App.gradeCache?.[grade] || [];
            questions = allGradeQ.filter(q => q.video && q.video.toLowerCase() === videoFileName.toLowerCase() && q.video_stop !== undefined);
          }
          if (questions.length === 0) {
            const gRes = await fetch(`data/grade_${grade}.json`);
            if (gRes.ok) {
              const gAll = await gRes.json();
              questions = gAll.filter(q => q.video && q.video.toLowerCase() === videoFileName.toLowerCase() && q.video_stop !== undefined);
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi nạp câu hỏi cho Live Room:', e);
      }

      // Xây dựng checkpoints
      const checkpoints = questions.map((q, idx) => ({
        index: idx,
        id: q.id || `q_${idx}`,
        sec: parseInt(q.video_stop || '0', 10),
        question: q.question,
        options: q.options || [],
        answer: q.answer,
        level: q.level || '1',
        timeLimit: parseInt(q.video_time || countdownSec || '20', 10)
      })).sort((a, b) => a.sec - b.sec);

      const roomPayload = {
        roomId,
        title,
        hostEmail: user?.email || 'giaovien@tinhoc.edu.vn',
        hostName: user?.name || 'Thầy/Cô Giáo Viên',
        school,
        grade,
        className,
        videoFileName,
        lessonTitle,
        topicTitle,
        countdownSec,
        totalQuestions: checkpoints.length,
        checkpoints,
        state: 'waiting', // 'waiting' | 'playing' | 'paused' | 'question' | 'finished'
        currentTime: 0,
        currentQuestionIdx: null,
        currentQuestion: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Ghi lên Firebase RTDB
      const res = await fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomPayload)
      });

      if (!res.ok) {
        throw new Error(`Firebase RTDB phản hồi HTTP ${res.status}`);
      }

      // Đóng modal tạo
      document.getElementById('modal-create-live-video-room')?.classList.add('hidden');

      // Giáo viên chính thức gia nhập phòng với tư cách Host
      this.isHost = true;
      this.activeRoom = roomPayload;
      this.questionsList = checkpoints;

      // Mở Giao diện Điều khiển Master của Giáo viên
      this.openHostMasterConsole(roomPayload);
    } catch (err) {
      console.error('Lỗi tạo phòng Live Video:', err);
      alert(`Không thể kết nối đến máy chủ trực tuyến: ${err.message}\nVui lòng kiểm tra kết nối mạng Internet.`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> Khởi Tạo & Mở Phòng Ngay';
      }
    }
  },

  // =========================================================================
  // 3. DIALOG: HỌC SINH NHẬP MÃ THAM GIA PHÒNG
  // =========================================================================
  openJoinModal(defaultCode = '') {
    const modal = document.getElementById('modal-join-live-video-room');
    if (!modal) {
      this.injectLiveVideoModals();
    }

    const modalEl = document.getElementById('modal-join-live-video-room');
    if (!modalEl) return;

    const input = document.getElementById('live-join-input-code');
    if (input) {
      input.value = defaultCode || '';
      setTimeout(() => input.focus(), 150);
    }

    modalEl.classList.remove('hidden');
  },

  async handleJoinRoomSubmit(customCode = null) {
    const input = document.getElementById('live-join-input-code');
    const submitBtn = document.getElementById('btn-confirm-join-live-room');
    const roomId = (customCode || input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    if (!roomId) {
      alert('Vui lòng nhập Mã phòng live trực tuyến của Thầy/Cô!');
      input?.focus();
      return;
    }

    if (!Auth.isLoggedIn()) {
      alert('Vui lòng đăng nhập hoặc cập nhật thông tin học sinh để vào lớp học trực tuyến!');
      Auth.openLoginModal();
      return;
    }

    const user = Auth.getCurrentUser();
    if (!Auth.isProfileComplete()) {
      Auth.openRequiredProfileModal();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang vào lớp...';
    }

    try {
      const dbUrl = this.getBaseDbUrl();
      const res = await fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Không thể kết nối máy chủ');

      const roomData = await res.json();
      if (!roomData || !roomData.roomId) {
        alert(`Không tìm thấy phòng trực tuyến "${roomId}"!\nEm vui lòng kiểm tra lại mã phòng do Thầy/Cô cung cấp.`);
        return;
      }

      // Kiểm tra đối tượng tham gia (Trường & Lớp)
      if (roomData.school !== 'all' && user.school && roomData.school.toLowerCase() !== user.school.toLowerCase()) {
        const confirmJoin = confirm(`Phòng học này được Thầy/Cô giao riêng cho trường "${roomData.school}".\nTài khoản của em đang thuộc trường "${user.school}".\nEm có chắc chắn muốn tham gia không?`);
        if (!confirmJoin) return;
      }

      if (roomData.className !== 'all' && user.className && roomData.className.toLowerCase() !== user.className.toLowerCase()) {
        const confirmJoin = confirm(`Phòng học này được Thầy/Cô giao cho lớp "${roomData.className}".\nLớp của em là "${user.className}".\nEm có muốn tiếp tục tham gia không?`);
        if (!confirmJoin) return;
      }

      // Đóng modal join
      document.getElementById('modal-join-live-video-room')?.classList.add('hidden');

      // Đăng ký học sinh vào danh sách điểm danh Firebase
      const studentUid = (user.email || user.username || `hs_${Date.now()}`).replace(/[.#$\[\]\/]/g, '_');
      const studentRecord = {
        uid: studentUid,
        name: user.name || 'Học sinh',
        email: user.email || '',
        avatar: user.avatar || '',
        school: user.school || '',
        className: user.className || '',
        grade: user.grade || '',
        online: true,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        score: 0,
        correctCount: 0
      };

      await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${studentUid}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentRecord)
      });

      this.isHost = false;
      this.activeRoom = roomData;
      this.studentInfo = studentRecord;
      this.questionsList = roomData.checkpoints || [];

      // Mở Rạp Chiếu Phim Trực Tuyến Toàn Màn Hình của Học Sinh
      this.openStudentCinemaStage(roomData);
    } catch (err) {
      console.error('Lỗi vào phòng Live Video:', err);
      alert(`Không thể tham gia phòng: ${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Tham Gia Ngay';
      }
    }
  },

  // =========================================================================
  // 4. BẢNG ĐIỀU KHIỂN MASTER CỦA GIÁO VIÊN (TEACHER MASTER CONSOLE)
  // =========================================================================
  openHostMasterConsole(room) {
    const container = document.getElementById('view-interactive-video');
    if (!container) return;

    if (window.App && typeof window.App.switchTab === 'function') {
      window.App.switchTab('interactive-video');
    }

    const origin = window.location.origin + window.location.pathname;
    const shareLink = `${origin}?live_video=${encodeURIComponent(room.roomId)}`;
    const videoUrl = this.resolveVideoStreamingUrl(room.videoFileName);

    container.innerHTML = `
      <div id="live-master-console" class="space-y-6 animate-fadeIn pb-12">
        
        <!-- Top Master Header Bar -->
        <div class="bg-gradient-to-r from-slate-900 via-rose-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-rose-500/30 relative overflow-hidden">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <span class="px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-rose-600/50 animate-pulse">
                  <i class="fa-solid fa-tower-broadcast"></i> MASTER CONSOLE (TRỰC TIẾP)
                </span>
                <span class="px-3 py-1 rounded-full bg-white/10 text-white text-xs font-bold font-mono">
                  MÃ PHÒNG: <strong class="text-amber-400 font-black text-sm">${escapeHtml(room.roomId)}</strong>
                </span>
                <span class="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-bold border border-indigo-400/30">
                  Lớp: ${escapeHtml(room.className === 'all' ? `Toàn khối ${room.grade}` : room.className)} • ${escapeHtml(room.school === 'all' ? 'Mở tự do' : room.school)}
                </span>
              </div>
              <h2 class="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
                ${escapeHtml(room.title)}
              </h2>
              <p class="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                <span><i class="fa-solid fa-book-open text-rose-400"></i> ${escapeHtml(room.lessonTitle)}</span>
                <span>•</span>
                <span><i class="fa-solid fa-list-check text-blue-400"></i> ${room.totalQuestions} câu hỏi tương tác</span>
              </p>
            </div>

            <!-- Cụm công cụ Copy Link & Kết thúc -->
            <div class="flex items-center gap-2.5 flex-wrap">
              <button type="button" id="btn-master-copy-invite" class="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition flex items-center gap-2 border border-white/20">
                <i class="fa-solid fa-copy text-amber-300"></i> Copy Mẫu Mời Lớp Zalo
              </button>
              <button type="button" id="btn-master-end-session" class="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-rose-600/30">
                <i class="fa-solid fa-flag-checkered"></i> Tổng Kết & Kết Thúc
              </button>
            </div>
          </div>
        </div>

        <!-- Main 2-Column Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- Cột Trái (8/12): Sân khấu Video & Bộ Điều Phối Lớp Học -->
          <div class="lg:col-span-8 space-y-4">
            
            <!-- Video Stage Card -->
            <div class="bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 relative group aspect-video flex items-center justify-center">
              <video id="live-master-video" src="${videoUrl}" playsinline preload="metadata" class="w-full h-full object-contain"></video>

              <!-- Màn chắn câu hỏi đang diễn ra -->
              <div id="master-question-active-overlay" class="absolute inset-0 bg-slate-950/90 backdrop-blur-md p-6 flex flex-col justify-between hidden z-20">
                <div class="flex items-center justify-between">
                  <span class="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 flex items-center gap-1.5">
                    <i class="fa-solid fa-circle-question"></i> ĐANG DIỄN RA CÂU HỎI SỐ <span id="master-q-number">1</span>
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-300 font-mono">Đếm ngược:</span>
                    <span id="master-q-countdown" class="px-3 py-1 rounded-full bg-rose-600 text-white text-sm font-black font-mono">20s</span>
                  </div>
                </div>

                <div class="max-w-2xl mx-auto text-center space-y-3 py-4">
                  <h3 id="master-q-text" class="text-base sm:text-lg font-bold text-white leading-relaxed">
                    Đang tải câu hỏi...
                  </h3>

                  <!-- Biểu đồ Live Polling A-B-C-D theo thời gian thực -->
                  <div id="master-poll-bars" class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                    <!-- Sẽ render động 4 cột A, B, C, D -->
                  </div>
                </div>

                <div class="flex items-center justify-between border-t border-slate-800 pt-3">
                  <div class="text-xs text-slate-400">
                    Đã nộp: <strong id="master-q-submitted-count" class="text-emerald-400 font-bold">0</strong>/<span id="master-q-total-students">0</span> học sinh
                  </div>
                  <div class="flex items-center gap-2">
                    <button type="button" id="btn-master-reveal-answer" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30">
                      <i class="fa-solid fa-eye"></i> Mở Đáp Án Cho Cả Lớp
                    </button>
                    <button type="button" id="btn-master-resume-video" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-600/30 hidden">
                      <i class="fa-solid fa-play"></i> Tiếp Tục Bài Giảng
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Master Playback Control Deck -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <!-- Timeline Seekbar with Pins -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span id="master-time-current">00:00</span>
                  <span class="text-[11px] font-sans font-bold text-rose-500">
                    <i class="fa-solid fa-arrows-spin"></i> Lệnh tua/phát sẽ đồng bộ tức thì lên màn hình cả lớp
                  </span>
                  <span id="master-time-duration">00:00</span>
                </div>
                <div id="master-timeline-track" class="relative w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full cursor-pointer overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div id="master-timeline-fill" class="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-rose-500 to-indigo-600 rounded-full w-0 transition-all duration-100"></div>
                  <div id="master-timeline-pins" class="absolute inset-0 pointer-events-none"></div>
                </div>
              </div>

              <!-- Control Buttons Bar -->
              <div class="flex items-center justify-between gap-3 flex-wrap pt-1">
                <div class="flex items-center gap-2">
                  <button type="button" id="btn-master-play-pause" class="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition shadow-lg shadow-rose-600/30 flex items-center gap-2">
                    <i class="fa-solid fa-play"></i> BẮT ĐẦU PHÁT (CẢ LỚP CÙNG XEM)
                  </button>
                  <button type="button" id="btn-master-rewind-10" class="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition">
                    <i class="fa-solid fa-rotate-left"></i> -10s
                  </button>
                  <button type="button" id="btn-master-forward-10" class="px-3.5 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition">
                    +10s <i class="fa-solid fa-rotate-right"></i>
                  </button>
                </div>

                <div class="flex items-center gap-2">
                  <button type="button" id="btn-master-trigger-current-q" class="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition shadow-lg shadow-amber-500/25 flex items-center gap-1.5" title="Dừng video và đặt câu hỏi tại mốc này cho cả lớp">
                    <i class="fa-solid fa-circle-question"></i> Đặt Câu Hỏi Ngay
                  </button>
                  <button type="button" id="btn-master-next-checkpoint" class="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition shadow-lg shadow-indigo-600/25 flex items-center gap-1.5" title="Tua nhanh tới mốc câu hỏi kế tiếp">
                    Mốc Kế Tiếp <i class="fa-solid fa-forward-step"></i>
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Cột Phải (4/12): Danh sách Điểm danh Học sinh Trực tuyến & Xếp hạng điểm -->
          <div class="lg:col-span-4 space-y-4">
            
            <!-- Attendance Card -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                  <h4 class="font-black text-sm text-slate-800 dark:text-white">
                    SĨ SỐ TRỰC TUYẾN
                  </h4>
                </div>
                <span id="master-online-counter" class="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-black text-xs font-mono">
                  0 học sinh
                </span>
              </div>

              <!-- Danh sách học sinh đang có mặt -->
              <div id="master-students-list" class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                <div class="p-6 text-center text-xs text-slate-400">
                  <i class="fa-solid fa-users text-2xl mb-2 opacity-50 block"></i>
                  Chưa có học sinh nào vào phòng.<br />
                  Thầy Cô gửi mã <strong>${escapeHtml(room.roomId)}</strong> để học sinh tham gia nhé!
                </div>
              </div>
            </div>

            <!-- Bảng Vinh Danh Mini Điểm Số Lớp -->
            <div class="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent rounded-3xl p-5 border border-amber-500/20 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="font-black text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i class="fa-solid fa-trophy"></i> BẢNG XẾP HẠNG TRỰC TIẾP
                </h4>
                <span class="text-[10px] text-slate-400">Tự động cập nhật</span>
              </div>
              <div id="master-mini-leaderboard" class="space-y-1.5 text-xs">
                <div class="text-center py-2 text-slate-400 text-[11px]">
                  Điểm số sẽ xuất hiện sau khi cả lớp trả lời câu hỏi đầu tiên.
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    `;

    this.bindMasterConsoleEvents(room);
    this.startRealtimeSync(room.roomId);
  },

  // =========================================================================
  // 5. MÀN HÌNH RẠP CHIẾU TOÀN MÀN HÌNH CỦA HỌC SINH (STUDENT CINEMA STAGE)
  // =========================================================================
  openStudentCinemaStage(room) {
    const container = document.getElementById('view-interactive-video');
    if (!container) return;

    if (window.App && typeof window.App.switchTab === 'function') {
      window.App.switchTab('interactive-video');
    }

    const videoUrl = this.resolveVideoStreamingUrl(room.videoFileName);

    container.innerHTML = `
      <div id="live-student-cinema" class="fixed inset-0 z-50 bg-black text-white flex flex-col justify-between overflow-hidden select-none">
        
        <!-- Top Status Pill (Đồng bộ với Thầy/Cô) -->
        <div class="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
          <div class="flex items-center gap-2 pointer-events-auto">
            <span class="px-3.5 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-xs font-bold border border-white/20 flex items-center gap-2 shadow-xl">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>LỚP HỌC TRỰC TUYẾN: <strong class="text-rose-400">${escapeHtml(room.className || room.roomId)}</strong></span>
            </span>
            <span class="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-slate-300 text-xs font-medium border border-white/10 hidden sm:inline-flex items-center gap-1.5">
              <i class="fa-solid fa-chalkboard-user text-amber-400"></i> ${escapeHtml(room.hostName)}
            </span>
          </div>

          <div class="flex items-center gap-2 pointer-events-auto">
            <button type="button" id="btn-student-toggle-fullscreen" class="w-9 h-9 rounded-full bg-slate-900/80 backdrop-blur-md text-white hover:bg-slate-800 transition flex items-center justify-center text-sm border border-white/20 shadow-xl" title="Bật/Tắt Toàn màn hình">
              <i class="fa-solid fa-expand"></i>
            </button>
            <button type="button" id="btn-student-leave-room" class="px-3.5 py-1.5 rounded-full bg-rose-600/80 hover:bg-rose-700 backdrop-blur-md text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xl">
              <i class="fa-solid fa-arrow-right-from-bracket"></i> Thoát
            </button>
          </div>
        </div>

        <!-- Sân khấu Video chính (KHÔNG có thanh điều khiển tua cá nhân) -->
        <div class="relative w-full h-full flex items-center justify-center bg-black">
          <video id="live-student-video" src="${videoUrl}" playsinline preload="auto" class="w-full h-full object-contain pointer-events-none"></video>

          <!-- Trạng thái chờ giáo viên bắt đầu -->
          <div id="student-waiting-overlay" class="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 space-y-4">
            <div class="w-20 h-20 rounded-3xl bg-rose-600/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-4xl shadow-inner animate-pulse">
              <i class="fa-solid fa-clapperboard"></i>
            </div>
            <div class="space-y-1.5 max-w-md">
              <h3 class="text-xl font-black text-white">
                Chào em, ${escapeHtml(this.studentInfo?.name || 'Học sinh')}!
              </h3>
              <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Em đã vào phòng học trực tuyến. Video sẽ tự động phát khi Thầy/Cô bắt đầu tiết học nhé!
              </p>
            </div>
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 text-xs font-bold text-emerald-400 border border-emerald-500/30 font-mono">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> ĐÃ KẾT NỐI VỚI THẦY CÔ
            </div>
          </div>

          <!-- Popup Câu hỏi Tương tác Toàn màn hình (Kahoot Style) -->
          <div id="student-question-modal" class="absolute inset-0 bg-slate-950/95 backdrop-blur-xl p-6 sm:p-10 flex flex-col justify-between hidden z-40 animate-fadeIn">
            <!-- Header câu hỏi -->
            <div class="flex items-center justify-between max-w-4xl mx-auto w-full">
              <span class="px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-600/40">
                <i class="fa-solid fa-circle-question"></i> CÂU HỎI TƯƠNG TÁC
              </span>
              <div class="flex items-center gap-3">
                <span class="text-xs text-slate-400 font-medium">Thời gian còn lại:</span>
                <span id="student-q-countdown" class="px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 text-base font-black font-mono shadow-lg shadow-amber-500/30">
                  20s
                </span>
              </div>
            </div>

            <!-- Nội dung câu hỏi -->
            <div class="max-w-4xl mx-auto w-full my-auto py-6 space-y-6 text-center">
              <h2 id="student-q-text" class="text-lg sm:text-2xl md:text-3xl font-black text-white leading-snug">
                Nội dung câu hỏi đang tải...
              </h2>

              <!-- 4 Nút Lựa Chọn Khổng Lồ A, B, C, D (Màu sắc sống động) -->
              <div id="student-options-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-2">
                <!-- Option A: Đỏ / Rose -->
                <button type="button" data-student-option="A" class="student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-rose-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">A</span>
                  <span class="student-opt-label flex-1">Phương án A</span>
                </button>

                <!-- Option B: Xanh Dương / Indigo -->
                <button type="button" data-student-option="B" class="student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-indigo-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">B</span>
                  <span class="student-opt-label flex-1">Phương án B</span>
                </button>

                <!-- Option C: Vàng Hổ Phách / Amber -->
                <button type="button" data-student-option="C" class="student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm sm:text-base transition shadow-lg shadow-amber-500/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-black/20 text-slate-950 flex items-center justify-center font-black text-base shrink-0">C</span>
                  <span class="student-opt-label flex-1 text-slate-950 font-extrabold">Phương án C</span>
                </button>

                <!-- Option D: Xanh Lục / Emerald -->
                <button type="button" data-student-option="D" class="student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-emerald-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">D</span>
                  <span class="student-opt-label flex-1">Phương án D</span>
                </button>
              </div>

              <!-- Trạng thái đã gửi đáp án -->
              <div id="student-submitted-banner" class="hidden p-3 rounded-2xl bg-white/10 text-emerald-400 font-bold text-xs sm:text-sm animate-pulse border border-emerald-500/30">
                <i class="fa-solid fa-circle-check"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô công bố kết quả...
              </div>

              <!-- Kết quả câu hỏi sau khi Thầy/Cô mở đáp án -->
              <div id="student-result-banner" class="hidden space-y-4">
                <div id="student-result-badge" class="p-4 rounded-2xl text-center font-black text-lg sm:text-xl">
                  <!-- Thông báo Đúng/Sai -->
                </div>

                <!-- Biểu đồ Live Poll Phổ Bình Chọn Cả Lớp -->
                <div class="bg-white/5 rounded-2xl p-4 border border-white/10 text-left space-y-2">
                  <div class="text-xs text-slate-300 font-bold flex items-center justify-between">
                    <span><i class="fa-solid fa-chart-simple text-blue-400"></i> Phổ bình chọn của cả lớp:</span>
                    <span id="student-class-accuracy" class="text-emerald-400 font-mono font-bold"></span>
                  </div>
                  <div id="student-poll-bars-class" class="grid grid-cols-4 gap-2 pt-1">
                    <!-- 4 cột poll -->
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer trạng thái kết nối -->
            <div class="text-center text-xs text-slate-500 pb-2">
              Lớp học tương tác thời gian thực TinHocHub • Chuẩn GDPT 2018
            </div>
          </div>

        </div>

      </div>
    `;

    // Tự động yêu cầu Fullscreen nếu thiết bị hỗ trợ
    this.requestFullscreenSafe(document.getElementById('live-student-cinema'));

    this.bindStudentCinemaEvents(room);
    this.startRealtimeSync(room.roomId);
  },

  // =========================================================================
  // 6. THUẬT TOÁN ĐỒNG BỘ THỜI GIAN THỰC (REAL-TIME ENGINE)
  // =========================================================================
  startRealtimeSync(roomId) {
    this.cleanupSync();

    const dbUrl = this.getBaseDbUrl();
    const roomUrl = `${dbUrl}/live_video_rooms/${roomId}.json`;

    // 1. Kết nối Server-Sent Events (SSE) để nhận thay đổi tức thời từ Firebase
    try {
      this.eventSource = new EventSource(roomUrl);
      this.eventSource.addEventListener('put', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.data) {
            this.handleRemoteStateUpdate(payload.data);
          } else if (payload && payload.path === '/') {
            this.handleRemoteStateUpdate(payload.data);
          }
        } catch (err) {}
      });
      this.eventSource.addEventListener('patch', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload && payload.data) {
            this.handleRemotePatchUpdate(payload.data);
          }
        } catch (err) {}
      });
      this.eventSource.onerror = () => {
        // Nếu SSE ngắt quãng, polling dự phòng sẽ tự động đảm nhiệm
      };
    } catch (e) {
      console.warn('LiveVideo: SSE không được hỗ trợ, sử dụng short polling 1.2s:', e);
    }

    // 2. Short Polling dự phòng 1.2 giây (Bảo đảm không bao giờ mất kết nối)
    this.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(roomUrl, { cache: 'no-cache' });
        if (res.ok) {
          const remote = await res.json();
          if (remote) this.handleRemoteStateUpdate(remote);
        }
      } catch (err) {}
    }, 1200);

    // 3. Heartbeat điểm danh học sinh online mỗi 5 giây
    if (!this.isHost && this.studentInfo) {
      this.heartbeatTimer = setInterval(async () => {
        try {
          const uid = this.studentInfo.uid;
          await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}/lastSeen.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
          });
        } catch (e) {}
      }, 5000);
    }
  },

  handleRemoteStateUpdate(remote) {
    if (!remote || !remote.roomId) return;
    this.remoteState = remote;

    if (this.isHost) {
      this.updateMasterUI(remote);
    } else {
      this.updateStudentUI(remote);
    }
  },

  handleRemotePatchUpdate(patch) {
    if (!patch) return;
    this.remoteState = { ...(this.remoteState || {}), ...patch };
    if (this.isHost) {
      this.updateMasterUI(this.remoteState);
    } else {
      this.updateStudentUI(this.remoteState);
    }
  },

  // =========================================================================
  // 7. CẬP NHẬT GIAO DIỆN HỌC SINH THEO TÍN HIỆU ĐIỀU PHỐI CỦA GIÁO VIÊN
  // =========================================================================
  updateStudentUI(remote) {
    const video = document.getElementById('live-student-video');
    const waitingOverlay = document.getElementById('student-waiting-overlay');
    const questionModal = document.getElementById('student-question-modal');

    if (!video) return;

    // 1. Trạng thái kết thúc buổi học
    if (remote.state === 'finished') {
      this.renderStudentEndSessionPodium(remote);
      return;
    }

    // 2. Trạng thái chờ bắt đầu
    if (remote.state === 'waiting') {
      if (waitingOverlay) waitingOverlay.classList.remove('hidden');
      if (questionModal) questionModal.classList.add('hidden');
      if (!video.paused) video.pause();
      return;
    } else {
      if (waitingOverlay) waitingOverlay.classList.add('hidden');
    }

    // 3. Trạng thái đang hỏi câu hỏi mốc dừng
    if (remote.state === 'question' && remote.currentQuestion) {
      if (!video.paused) video.pause();
      this.renderStudentQuestion(remote.currentQuestion, remote.responses?.[remote.currentQuestion.index]);
      return;
    } else {
      if (questionModal) questionModal.classList.add('hidden');
      this.hasSubmittedCurrentQuestion = false;
      this.selectedAnswer = null;
    }

    // 4. Đồng bộ video phát / tạm dừng
    if (remote.state === 'playing') {
      // Bù độ lệch thời gian (time delta sync)
      const targetTime = Number(remote.currentTime || 0);
      if (Math.abs(video.currentTime - targetTime) > 1.8) {
        video.currentTime = targetTime;
      }
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else if (remote.state === 'paused') {
      if (!video.paused) video.pause();
      const targetTime = Number(remote.currentTime || 0);
      if (Math.abs(video.currentTime - targetTime) > 1.5) {
        video.currentTime = targetTime;
      }
    }
  },

  renderStudentQuestion(q, responsesForQ = {}) {
    const modal = document.getElementById('student-question-modal');
    const qText = document.getElementById('student-q-text');
    const countdownEl = document.getElementById('student-q-countdown');
    const submittedBanner = document.getElementById('student-submitted-banner');
    const resultBanner = document.getElementById('student-result-banner');
    const resultBadge = document.getElementById('student-result-badge');
    const optionsGrid = document.getElementById('student-options-grid');
    if (!modal || !qText || !optionsGrid) return;

    modal.classList.remove('hidden');
    qText.textContent = q.question;

    // Gán nhãn cho 4 phương án A, B, C, D
    const optionBtns = optionsGrid.querySelectorAll('.student-opt-btn');
    const opts = q.options || [];

    optionBtns.forEach((btn, idx) => {
      const letter = btn.getAttribute('data-student-option');
      const label = btn.querySelector('.student-opt-label');
      let text = opts[idx] || '';
      // Loại bỏ tiền tố A., B., C., D. nếu có
      text = text.replace(/^[A-Da-d][\.\:\)\s]+/, '').trim();
      if (label) label.textContent = text || `Phương án ${letter}`;

      // Xử lý click chọn phương án
      btn.onclick = () => {
        if (q.revealed || this.hasSubmittedCurrentQuestion) return;
        this.submitStudentAnswer(q.index, letter, q.answer);
      };
    });

    // Nếu Giáo viên đã công bố kết quả (Revealed)
    if (q.revealed) {
      if (countdownEl) countdownEl.textContent = 'HẾT GIỜ';
      if (submittedBanner) submittedBanner.classList.add('hidden');
      if (resultBanner) resultBanner.classList.remove('hidden');

      const myUid = this.studentInfo?.uid;
      const myAnswer = responsesForQ?.[myUid]?.selected;
      const isCorrect = (myAnswer === q.answer);

      if (resultBadge) {
        if (isCorrect) {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-2xl mb-1">🎉 CHÍNH XÁC! (+100 ĐIỂM)</div>
            <div class="text-xs font-medium text-emerald-200">Em đã chọn đúng đáp án <strong>${q.answer}</strong>. Giỏi lắm!</div>
          `;
          // Kích hoạt Confetti pháo hoa
          if (typeof window.confetti === 'function') {
            window.confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
          }
        } else {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-rose-600/30 text-rose-300 border border-rose-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-2xl mb-1">❌ CHƯA CHÍNH XÁC</div>
            <div class="text-xs font-medium text-rose-200">Đáp án chính xác là <strong>${q.answer}</strong>. Cố gắng ở câu tiếp theo nhé!</div>
          `;
        }
      }

      // Tô sáng nút đúng và mờ nút sai
      optionBtns.forEach(btn => {
        const letter = btn.getAttribute('data-student-option');
        if (letter === q.answer) {
          btn.classList.add('ring-4', 'ring-emerald-400', 'scale-[1.02]');
        } else {
          btn.classList.add('opacity-40');
        }
      });

      // Hiển thị phổ bình chọn của cả lớp
      this.renderLivePollChart('student-poll-bars-class', responsesForQ, q.answer);
    } else {
      // Chưa công bố kết quả
      if (resultBanner) resultBanner.classList.add('hidden');
      optionBtns.forEach(btn => {
        btn.classList.remove('ring-4', 'ring-emerald-400', 'scale-[1.02]', 'opacity-40');
      });

      if (this.hasSubmittedCurrentQuestion) {
        if (submittedBanner) submittedBanner.classList.remove('hidden');
      } else {
        if (submittedBanner) submittedBanner.classList.add('hidden');
      }
    }
  },

  async submitStudentAnswer(qIndex, selectedOption, correctAnswer) {
    if (this.hasSubmittedCurrentQuestion || !this.activeRoom || !this.studentInfo) return;

    this.hasSubmittedCurrentQuestion = true;
    this.selectedAnswer = selectedOption;

    const isCorrect = (selectedOption === correctAnswer);
    const dbUrl = this.getBaseDbUrl();
    const roomId = this.activeRoom.roomId;
    const uid = this.studentInfo.uid;

    // Highlight nút vừa chọn
    const optionsGrid = document.getElementById('student-options-grid');
    if (optionsGrid) {
      optionsGrid.querySelectorAll('.student-opt-btn').forEach(btn => {
        if (btn.getAttribute('data-student-option') === selectedOption) {
          btn.classList.add('ring-4', 'ring-white', 'shadow-2xl');
        } else {
          btn.classList.add('opacity-50');
        }
      });
    }

    const banner = document.getElementById('student-submitted-banner');
    if (banner) banner.classList.remove('hidden');

    try {
      const responsePayload = {
        studentUid: uid,
        studentName: this.studentInfo.name || 'Học sinh',
        className: this.studentInfo.className || '',
        school: this.studentInfo.school || '',
        selected: selectedOption,
        isCorrect,
        timestamp: Date.now()
      };

      await fetch(`${dbUrl}/live_video_rooms/${roomId}/responses/${qIndex}/${uid}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responsePayload)
      });

      // Cập nhật điểm của học sinh trên Firebase
      if (isCorrect) {
        const curScore = (this.studentInfo.score || 0) + 100;
        const curCorrect = (this.studentInfo.correctCount || 0) + 1;
        this.studentInfo.score = curScore;
        this.studentInfo.correctCount = curCorrect;

        await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: curScore, correctCount: curCorrect })
        });
      }
    } catch (err) {
      console.warn('Lỗi gửi đáp án học sinh:', err);
    }
  },

  // =========================================================================
  // 8. CẬP NHẬT GIAO DIỆN BẢNG ĐIỀU KHIỂN CỦA GIÁO VIÊN (MASTER CONSOLE UI)
  // =========================================================================
  updateMasterUI(remote) {
    const video = document.getElementById('live-master-video');
    const onlineCounter = document.getElementById('master-online-counter');
    const studentsList = document.getElementById('master-students-list');
    const questionOverlay = document.getElementById('master-question-active-overlay');
    const btnPlay = document.getElementById('btn-master-play-pause');

    // 1. Cập nhật danh sách học sinh online
    const students = remote.students || {};
    const studentEntries = Object.values(students);
    const now = Date.now();

    // Lọc học sinh hoạt động trong vòng 20 giây gần nhất
    const activeStudents = studentEntries.filter(s => (now - (s.lastSeen || s.joinedAt || 0)) < 25000);

    if (onlineCounter) {
      onlineCounter.textContent = `${activeStudents.length} học sinh`;
    }

    if (studentsList) {
      if (activeStudents.length === 0) {
        studentsList.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400">
            <i class="fa-solid fa-users text-2xl mb-2 opacity-50 block"></i>
            Chưa có học sinh nào vào phòng.<br />
            Thầy Cô gửi mã <strong>${escapeHtml(remote.roomId)}</strong> để học sinh tham gia nhé!
          </div>
        `;
      } else {
        studentsList.innerHTML = activeStudents.map((s, idx) => `
          <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span class="font-bold text-slate-800 dark:text-white truncate">${escapeHtml(s.name)}</span>
              <span class="text-[10px] text-slate-400">(${escapeHtml(s.className || 'HS')})</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-black text-[11px] font-mono">
                ${s.score || 0}đ
              </span>
            </div>
          </div>
        `).join('');
      }
    }

    // 2. Cập nhật Mini Leaderboard của Giáo viên
    const miniLeaderboard = document.getElementById('master-mini-leaderboard');
    if (miniLeaderboard && activeStudents.length > 0) {
      const sorted = [...activeStudents].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
      miniLeaderboard.innerHTML = sorted.map((s, idx) => {
        const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `${idx + 1}.`));
        return `
          <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/40 dark:bg-slate-800/40 border border-amber-500/10 text-xs">
            <div class="flex items-center gap-1.5 truncate">
              <span>${medal}</span>
              <span class="font-bold truncate text-slate-800 dark:text-slate-200">${escapeHtml(s.name)}</span>
            </div>
            <span class="font-mono font-black text-amber-600 dark:text-amber-400">${s.score || 0}đ</span>
          </div>
        `;
      }).join('');
    }

    // 3. Cập nhật Question Overlay của Master
    if (remote.state === 'question' && remote.currentQuestion) {
      if (questionOverlay) questionOverlay.classList.remove('hidden');
      const q = remote.currentQuestion;
      const responses = remote.responses?.[q.index] || {};
      const submittedCount = Object.keys(responses).length;

      document.getElementById('master-q-number').textContent = (q.index + 1);
      document.getElementById('master-q-text').textContent = q.question;
      document.getElementById('master-q-submitted-count').textContent = submittedCount;
      document.getElementById('master-q-total-students').textContent = activeStudents.length;

      // Render biểu đồ 4 cột Live Poll
      this.renderLivePollChart('master-poll-bars', responses, q.revealed ? q.answer : null);

      const btnReveal = document.getElementById('btn-master-reveal-answer');
      const btnResume = document.getElementById('btn-master-resume-video');

      if (q.revealed) {
        if (btnReveal) btnReveal.classList.add('hidden');
        if (btnResume) btnResume.classList.remove('hidden');
      } else {
        if (btnReveal) btnReveal.classList.remove('hidden');
        if (btnResume) btnResume.classList.add('hidden');
      }
    } else {
      if (questionOverlay) questionOverlay.classList.add('hidden');
    }

    // 4. Cập nhật nút Play/Pause
    if (btnPlay) {
      if (remote.state === 'playing') {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition shadow-lg shadow-amber-600/30 flex items-center gap-2';
        btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i> TẠM DỪNG CẢ LỚP (ĐỂ GIẢNG BÀI)';
      } else {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition shadow-lg shadow-rose-600/30 flex items-center gap-2';
        btnPlay.innerHTML = '<i class="fa-solid fa-play"></i> BẮT ĐẦU PHÁT (CẢ LỚP CÙNG XEM)';
      }
    }
  },

  // =========================================================================
  // 9. BIỂU ĐỒ LIVE POLLING 4 CỘT A, B, C, D THEO THỜI GIAN THỰC
  // =========================================================================
  renderLivePollChart(containerId, responses = {}, correctAnswer = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tally = { A: 0, B: 0, C: 0, D: 0 };
    const list = Object.values(responses || {});
    list.forEach(r => {
      const opt = (r.selected || '').toUpperCase();
      if (tally[opt] !== undefined) tally[opt]++;
    });

    const total = list.length || 1;
    const colors = {
      A: { bar: 'from-rose-500 to-rose-600', text: 'text-rose-400' },
      B: { bar: 'from-blue-500 to-indigo-600', text: 'text-blue-400' },
      C: { bar: 'from-amber-400 to-amber-500', text: 'text-amber-400' },
      D: { bar: 'from-emerald-500 to-teal-600', text: 'text-emerald-400' }
    };

    container.innerHTML = ['A', 'B', 'C', 'D'].map(opt => {
      const count = tally[opt] || 0;
      const pct = list.length > 0 ? Math.round((count / list.length) * 100) : 0;
      const isCorrect = (correctAnswer && opt === correctAnswer);

      return `
        <div class="p-3 rounded-2xl ${isCorrect ? 'bg-emerald-500/20 border-2 border-emerald-400' : 'bg-slate-900/60 border border-slate-800'} text-center space-y-1.5 transition">
          <div class="flex items-center justify-between text-xs font-bold font-mono">
            <span class="${colors[opt].text} text-sm">${opt}</span>
            <span class="text-white">${count} em (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r ${colors[opt].bar} transition-all duration-300 rounded-full" style="width: ${pct}%"></div>
          </div>
          ${isCorrect ? '<span class="inline-block text-[10px] font-black text-emerald-300 uppercase">Đáp Án Đúng ✅</span>' : ''}
        </div>
      `;
    }).join('');
  },

  // =========================================================================
  // 10. BỤC VINH DANH PODIUM TOP 1-2-3 & TỔNG KẾT TIẾT HỌC
  // =========================================================================
  renderStudentEndSessionPodium(remote) {
    const cinema = document.getElementById('live-student-cinema');
    if (!cinema) return;

    const students = Object.values(remote.students || {}).sort((a, b) => (b.score || 0) - (a.score || 0));
    const myUid = this.studentInfo?.uid;
    const myRankIdx = students.findIndex(s => s.uid === myUid);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : '-';
    const myRecord = myRankIdx >= 0 ? students[myRankIdx] : this.studentInfo;

    const top1 = students[0];
    const top2 = students[1];
    const top3 = students[2];

    // Bắn Confetti chúc mừng
    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
    }

    cinema.innerHTML = `
      <div class="min-h-screen bg-slate-950 text-white p-6 sm:p-10 flex flex-col items-center justify-center space-y-8 animate-fadeIn overflow-y-auto">
        
        <div class="text-center space-y-2 max-w-xl">
          <span class="px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider border border-amber-500/30">
            <i class="fa-solid fa-trophy"></i> TỔNG KẾT TIẾT HỌC TRỰC TUYẾN
          </span>
          <h2 class="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Vinh Danh Học Sinh Xuất Sắc!
          </h2>
          <p class="text-xs sm:text-sm text-slate-300">
            ${escapeHtml(remote.title)} • Lớp: ${escapeHtml(remote.className)}
          </p>
        </div>

        <!-- 3D Podium Top 1-2-3 -->
        <div class="flex items-end justify-center gap-3 sm:gap-6 pt-4 max-w-2xl w-full">
          
          <!-- Hạng 2 -->
          <div class="flex-1 flex flex-col items-center space-y-2">
            <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-800 border-2 border-slate-300 flex items-center justify-center text-xl sm:text-2xl shadow-xl">
              🥈
            </div>
            <div class="text-center">
              <div class="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[100px] sm:max-w-[130px]">
                ${escapeHtml(top2?.name || 'Đang cập nhật')}
              </div>
              <div class="text-xs font-mono font-black text-amber-400">${top2?.score || 0}đ</div>
            </div>
            <div class="w-full h-24 sm:h-32 bg-gradient-to-t from-slate-800 to-slate-700 rounded-t-2xl flex items-center justify-center font-black text-xl text-slate-300">
              2
            </div>
          </div>

          <!-- Hạng 1 (Đỉnh cao) -->
          <div class="flex-1 flex flex-col items-center space-y-2">
            <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 border-4 border-amber-400 flex items-center justify-center text-3xl sm:text-4xl shadow-2xl shadow-amber-500/40 animate-bounce">
              👑
            </div>
            <div class="text-center">
              <div class="font-black text-sm sm:text-base text-amber-300 truncate max-w-[120px] sm:max-w-[160px]">
                ${escapeHtml(top1?.name || 'Đang cập nhật')}
              </div>
              <div class="text-sm font-mono font-black text-amber-400">${top1?.score || 0}đ</div>
            </div>
            <div class="w-full h-36 sm:h-48 bg-gradient-to-t from-amber-600 to-amber-500 rounded-t-2xl flex items-center justify-center font-black text-2xl text-slate-950 shadow-2xl">
              1
            </div>
          </div>

          <!-- Hạng 3 -->
          <div class="flex-1 flex flex-col items-center space-y-2">
            <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-orange-950 border-2 border-amber-700 flex items-center justify-center text-xl sm:text-2xl shadow-xl">
              🥉
            </div>
            <div class="text-center">
              <div class="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[100px] sm:max-w-[130px]">
                ${escapeHtml(top3?.name || 'Đang cập nhật')}
              </div>
              <div class="text-xs font-mono font-black text-amber-400">${top3?.score || 0}đ</div>
            </div>
            <div class="w-full h-20 sm:h-24 bg-gradient-to-t from-orange-900 to-orange-800 rounded-t-2xl flex items-center justify-center font-black text-xl text-amber-200">
              3
            </div>
          </div>

        </div>

        <!-- Thẻ Thành Tích Cá Nhân Của Học Sinh Này -->
        <div class="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/20 text-center space-y-3">
          <div class="text-xs text-slate-300 font-medium">THÀNH TÍCH CỦA EM TRONG TIẾT HỌC NÀY:</div>
          <div class="flex items-center justify-around">
            <div>
              <div class="text-xs text-slate-400">Xếp hạng</div>
              <div class="text-xl sm:text-2xl font-black text-amber-400">#${myRank}</div>
            </div>
            <div class="h-8 w-px bg-white/20"></div>
            <div>
              <div class="text-xs text-slate-400">Số câu đúng</div>
              <div class="text-xl sm:text-2xl font-black text-emerald-400">${myRecord?.correctCount || 0}/${remote.totalQuestions || 0}</div>
            </div>
            <div class="h-8 w-px bg-white/20"></div>
            <div>
              <div class="text-xs text-slate-400">Tổng điểm</div>
              <div class="text-xl sm:text-2xl font-black text-rose-400">${myRecord?.score || 0}đ</div>
            </div>
          </div>
        </div>

        <!-- Nút Trở Về -->
        <button type="button" id="btn-podium-close" class="px-8 py-3 rounded-2xl bg-white text-slate-900 font-black text-xs sm:text-sm hover:bg-slate-100 transition shadow-xl">
          <i class="fa-solid fa-arrow-left"></i> Rời Phòng & Về Trang Chủ
        </button>

      </div>
    `;

    document.getElementById('btn-podium-close')?.addEventListener('click', () => {
      this.cleanupSession();
      if (window.App && typeof window.App.switchTab === 'function') {
        window.App.switchTab('interactive-video');
      }
    });
  },

  // =========================================================================
  // 11. BINDING CÁC SỰ KIỆN MASTER CỦA GIÁO VIÊN
  // =========================================================================
  bindMasterConsoleEvents(room) {
    const video = document.getElementById('live-master-video');
    this.videoElem = video;

    const dbUrl = this.getBaseDbUrl();
    const roomId = room.roomId;

    // 1. Nút Copy Mẫu Mời Lớp Zalo
    const btnCopy = document.getElementById('btn-master-copy-invite');
    if (btnCopy) {
      btnCopy.onclick = () => {
        const origin = window.location.origin + window.location.pathname;
        const link = `${origin}?live_video=${encodeURIComponent(roomId)}`;
        const text = `📢 [THÔNG BÁO TIẾT HỌC TIN HỌC TRỰC TUYẾN]\nThầy/Cô mời các em lớp ${room.className} tham gia phòng chiếu phim bài giảng tương tác:\n🎬 Bài học: ${room.lessonTitle}\n🎟️ Mã phòng: ${roomId}\n👉 Link vào thẳng: ${link}\n(Các em mở link để vào rạp chiếu trực tuyến cùng lớp nhé!)`;
        navigator.clipboard.writeText(text).then(() => {
          alert('Đã sao chép mẫu thông báo lớp vào clipboard!\nThầy/Cô dán vào nhóm Zalo/Facebook của lớp nhé.');
        }).catch(() => {
          prompt('Mời Thầy/Cô sao chép liên kết:', link);
        });
      };
    }

    // 2. Play / Pause đồng bộ cả lớp
    const btnPlayPause = document.getElementById('btn-master-play-pause');
    if (btnPlayPause && video) {
      btnPlayPause.onclick = async () => {
        if (video.paused) {
          video.play().then(() => {
            fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                state: 'playing',
                currentTime: video.currentTime,
                updatedAt: Date.now()
              })
            });
          }).catch(() => {});
        } else {
          video.pause();
          fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: 'paused',
              currentTime: video.currentTime,
              updatedAt: Date.now()
            })
          });
        }
      };
    }

    // 3. Tua Seekbar đồng bộ
    const timeline = document.getElementById('master-timeline-track');
    if (timeline && video) {
      timeline.onclick = (e) => {
        if (!video.duration) return;
        const rect = timeline.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const target = pct * video.duration;
        video.currentTime = target;

        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentTime: target,
            updatedAt: Date.now()
          })
        });
      };
    }

    // Cập nhật timeline fill và đồng hồ
    if (video) {
      video.ontimeupdate = () => {
        const cur = video.currentTime;
        const dur = video.duration || 1;
        const pct = (cur / dur) * 100;
        const fill = document.getElementById('master-timeline-fill');
        const curTimeText = document.getElementById('master-time-current');
        const durTimeText = document.getElementById('master-time-duration');

        if (fill) fill.style.width = `${pct}%`;
        if (curTimeText) curTimeText.textContent = this.formatTime(cur);
        if (durTimeText) durTimeText.textContent = this.formatTime(dur);

        // Bắt mốc dừng tự động nếu video chạy qua checkpoint
        const nextQ = this.questionsList.find(q => Math.abs(cur - q.sec) < 0.6 && !q.triggered);
        if (nextQ && !video.paused) {
          nextQ.triggered = true;
          this.triggerMasterQuestion(nextQ);
        }
      };

      video.onloadedmetadata = () => {
        this.renderMasterTimelinePins();
      };
    }

    // 4. Nút Đặt Câu Hỏi Ngay Tại Mốc Hiện Tại
    const btnTriggerQ = document.getElementById('btn-master-trigger-current-q');
    if (btnTriggerQ && video) {
      btnTriggerQ.onclick = () => {
        const cur = video.currentTime;
        // Tìm câu hỏi gần nhất hoặc câu đầu tiên
        let targetQ = this.questionsList.find(q => Math.abs(cur - q.sec) < 5) || this.questionsList[0];
        if (!targetQ) {
          alert('Không tìm thấy câu hỏi tương tác nào trong bài học này!');
          return;
        }
        this.triggerMasterQuestion(targetQ);
      };
    }

    // 5. Nút Mốc Kế Tiếp
    const btnNextCp = document.getElementById('btn-master-next-checkpoint');
    if (btnNextCp && video) {
      btnNextCp.onclick = () => {
        const cur = video.currentTime;
        const next = this.questionsList.find(q => q.sec > cur + 1);
        if (next) {
          video.currentTime = next.sec;
          this.triggerMasterQuestion(next);
        } else {
          alert('Đã xem đến mốc câu hỏi cuối cùng của bài giảng!');
        }
      };
    }

    // 6. Nút Mở Đáp Án Cho Cả Lớp
    const btnReveal = document.getElementById('btn-master-reveal-answer');
    if (btnReveal) {
      btnReveal.onclick = () => {
        fetch(`${dbUrl}/live_video_rooms/${roomId}/currentQuestion/revealed.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(true)
        });
      };
    }

    // 7. Nút Tiếp Tục Bài Giảng Sau Câu Hỏi
    const btnResume = document.getElementById('btn-master-resume-video');
    if (btnResume && video) {
      btnResume.onclick = () => {
        video.play().then(() => {
          fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: 'playing',
              currentQuestion: null,
              currentTime: video.currentTime,
              updatedAt: Date.now()
            })
          });
        }).catch(() => {});
      };
    }

    // 8. Nút Tổng Kết & Kết Thúc Tiết Học
    const btnEnd = document.getElementById('btn-master-end-session');
    if (btnEnd) {
      btnEnd.onclick = async () => {
        const confirmEnd = confirm('Thầy/Cô có chắc chắn muốn kết thúc buổi học trực tuyến này?\nHệ thống sẽ hiển thị Bục Vinh Danh Podium và xuất báo cáo kết quả.');
        if (!confirmEnd) return;

        await fetch(`${dbUrl}/live_video_rooms/${roomId}/state.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify('finished')
        });

        // Hiển thị Podium tổng kết cho Master
        this.renderMasterEndSessionReport(this.remoteState || room);
      };
    }
  },

  renderMasterTimelinePins() {
    const pinsContainer = document.getElementById('master-timeline-pins');
    const video = this.videoElem;
    if (!pinsContainer || !video || !video.duration) return;

    const dur = video.duration;
    pinsContainer.innerHTML = this.questionsList.map((q, idx) => {
      const pct = Math.min(100, Math.max(0, (q.sec / dur) * 100));
      return `
        <div class="absolute top-0 bottom-0 w-1.5 bg-amber-400 rounded-full cursor-pointer hover:w-2 hover:bg-white transition" style="left: ${pct}%" title="Câu hỏi số ${idx + 1} (${this.formatTime(q.sec)})">
          <span class="absolute -top-3 -translate-x-1/2 text-[9px]">🚩</span>
        </div>
      `;
    }).join('');
  },

  triggerMasterQuestion(q) {
    const video = this.videoElem;
    const dbUrl = this.getBaseDbUrl();
    const roomId = this.activeRoom?.roomId;
    if (!roomId) return;

    if (video && !video.paused) video.pause();

    const questionPayload = {
      index: q.index,
      id: q.id,
      sec: q.sec,
      question: q.question,
      options: q.options || [],
      answer: q.answer,
      revealed: false,
      countdown: q.timeLimit || 20,
      timestamp: Date.now()
    };

    fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'question',
        currentTime: video?.currentTime || q.sec,
        currentQuestion: questionPayload,
        updatedAt: Date.now()
      })
    });
  },

  // =========================================================================
  // 12. BÁO CÁO TỔNG KẾT & XUẤT EXCEL CHO GIÁO VIÊN
  // =========================================================================
  renderMasterEndSessionReport(remote) {
    const container = document.getElementById('live-master-console');
    if (!container) return;

    const students = Object.values(remote.students || {}).sort((a, b) => (b.score || 0) - (a.score || 0));

    // Confetti
    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 } });
    }

    container.innerHTML = `
      <div class="space-y-6 animate-fadeIn pb-12">
        <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-rose-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-indigo-500/30">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <span class="px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-500/30">
                <i class="fa-solid fa-flag-checkered"></i> KẾT THÚC TIẾT HỌC THÀNH CÔNG
              </span>
              <h2 class="text-2xl sm:text-3xl font-black text-white mt-2">
                Báo Cáo Kết Quả: ${escapeHtml(remote.title)}
              </h2>
              <p class="text-xs sm:text-sm text-slate-300 mt-1">
                Lớp: ${escapeHtml(remote.className)} • Sĩ số tham gia: <strong>${students.length} học sinh</strong>
              </p>
            </div>

            <div class="flex items-center gap-3 flex-wrap">
              <button type="button" id="btn-export-live-excel" class="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-600/30">
                <i class="fa-solid fa-file-excel"></i> Xuất Báo Cáo Excel (BOM)
              </button>
              <button type="button" id="btn-save-to-gradebook" class="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-blue-600/30">
                <i class="fa-solid fa-book-bookmark"></i> Lưu Vào Sổ Điểm Lớp
              </button>
              <button type="button" id="btn-master-exit" class="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition">
                Thoát
              </button>
            </div>
          </div>
        </div>

        <!-- Bảng xếp hạng chi tiết cả lớp -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 class="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-ranking-star text-amber-500"></i> BẢNG ĐIỂM CHI TIẾT CẢ LỚP
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                  <th class="py-3 px-3">Hạng</th>
                  <th class="py-3 px-3">Học sinh</th>
                  <th class="py-3 px-3">Trường / Lớp</th>
                  <th class="py-3 px-3 text-center">Số câu đúng</th>
                  <th class="py-3 px-3 text-right">Tổng điểm</th>
                  <th class="py-3 px-3 text-center">Đánh giá</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${students.map((s, idx) => {
                  const medal = idx === 0 ? '🥇 Hạng 1' : (idx === 1 ? '🥈 Hạng 2' : (idx === 2 ? '🥉 Hạng 3' : `#${idx + 1}`));
                  const totalQ = remote.totalQuestions || 1;
                  const correct = s.correctCount || 0;
                  const pct = Math.round((correct / totalQ) * 100);
                  const badge = pct >= 80 ? 'Xuất sắc 🚀' : (pct >= 50 ? 'Đạt chuẩn ✅' : 'Cần cố gắng ⚠️');
                  return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td class="py-3 px-3 font-bold ${idx < 3 ? 'text-amber-500 font-black' : 'text-slate-500'}">${medal}</td>
                      <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">${escapeHtml(s.name)}</td>
                      <td class="py-3 px-3 text-slate-500">${escapeHtml(s.school || '')} • ${escapeHtml(s.className || '')}</td>
                      <td class="py-3 px-3 text-center font-mono font-bold">${correct}/${totalQ} (${pct}%)</td>
                      <td class="py-3 px-3 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-sm">${s.score || 0}đ</td>
                      <td class="py-3 px-3 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${pct >= 80 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300' : (pct >= 50 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300')}">
                          ${badge}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Export CSV Excel
    document.getElementById('btn-export-live-excel')?.addEventListener('click', () => {
      this.exportLiveSessionToExcel(remote, students);
    });

    // Save to Gradebook
    document.getElementById('btn-save-to-gradebook')?.addEventListener('click', () => {
      students.forEach(s => {
        const record = {
          id: `live_${Date.now()}_${s.uid}`,
          studentName: s.name,
          studentEmail: s.email || `${s.uid}@tinhoc.edu.vn`,
          school: s.school || remote.school || '',
          className: s.className || remote.className || '',
          grade: remote.grade || '12',
          examTitle: `[Live Video] ${remote.lessonTitle}`,
          score: (s.score ? (s.score / (remote.totalQuestions * 100)) * 10 : 0).toFixed(1),
          correctCount: s.correctCount || 0,
          totalQuestions: remote.totalQuestions || 0,
          timeSpent: 1200,
          submittedAt: new Date().toISOString(),
          status: 'valid'
        };
        Storage.saveExamResult(record);
      });
      alert('Đã lưu toàn bộ kết quả của học sinh vào Sổ Điểm Điện Tử!');
    });

    document.getElementById('btn-master-exit')?.addEventListener('click', () => {
      this.cleanupSession();
      if (window.App && typeof window.App.switchTab === 'function') {
        window.App.switchTab('interactive-video');
      }
    });
  },

  exportLiveSessionToExcel(remote, students) {
    const headers = ['Hạng', 'Họ và Tên', 'Trường Học', 'Lớp', 'Số Câu Đúng', 'Tổng Số Câu', 'Tỷ Lệ Đúng (%)', 'Tổng Điểm', 'Thời Gian Ghi Nhận'];
    const rows = students.map((s, idx) => {
      const totalQ = remote.totalQuestions || 1;
      const correct = s.correctCount || 0;
      const pct = Math.round((correct / totalQ) * 100);
      return [
        idx + 1,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.school || remote.school || '').replace(/"/g, '""')}"`,
        `"${(s.className || remote.className || '').replace(/"/g, '""')}"`,
        correct,
        totalQ,
        `${pct}%`,
        s.score || 0,
        `"${new Date().toLocaleString('vi-VN')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ket_Qua_Tiet_Hoc_Live_${remote.roomId}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // =========================================================================
  // 13. TIỆN ÍCH HỆ THỐNG & DỌN DẸP
  // =========================================================================
  bindStudentCinemaEvents(room) {
    const btnFullscreen = document.getElementById('btn-student-toggle-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        const cinema = document.getElementById('live-student-cinema');
        this.toggleFullscreenSafe(cinema);
      };
    }

    const btnLeave = document.getElementById('btn-student-leave-room');
    if (btnLeave) {
      btnLeave.onclick = () => {
        if (confirm('Em có chắc chắn muốn rời khỏi phòng học trực tuyến của Thầy/Cô không?')) {
          this.cleanupSession();
          if (window.App && typeof window.App.switchTab === 'function') {
            window.App.switchTab('interactive-video');
          }
        }
      };
    }
  },

  requestFullscreenSafe(elem) {
    if (!elem) return;
    try {
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } catch (e) {}
  },

  toggleFullscreenSafe(elem) {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      this.requestFullscreenSafe(elem);
    } else {
      try {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {}
    }
  },

  resolveVideoStreamingUrl(fileName) {
    if (!fileName) return '';
    // Thử tìm trong kho video máy tính giáo viên đã nạp trước
    if (window.InteractiveVideo && window.InteractiveVideo.localVideoMap) {
      if (window.InteractiveVideo.localVideoMap[fileName]) {
        return window.InteractiveVideo.localVideoMap[fileName];
      }
    }
    // Mặc định stream qua Archive CORS trực tiếp chống chặn mạng
    return `https://archive.org/cors/tinhoc-hub-thpt/${fileName}`;
  },

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  },

  cleanupSync() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  },

  cleanupSession() {
    this.cleanupSync();
    if (this.videoElem) {
      this.videoElem.pause();
      this.videoElem = null;
    }
    this.activeRoom = null;
    this.isHost = false;
    this.studentInfo = null;
    const studentCinema = document.getElementById('live-student-cinema');
    if (studentCinema) studentCinema.remove();
  },

  // =========================================================================
  // 14. INJECT HTML MODALS: TẠO PHÒNG & NHẬP MÃ VÀO TRANG
  // =========================================================================
  injectLiveVideoModals() {
    if (document.getElementById('modal-create-live-video-room')) return;

    const div = document.createElement('div');
    div.innerHTML = `
      <!-- MODAL TẠO PHÒNG LIVE VIDEO DÀNH CHO GIÁO VIÊN -->
      <div id="modal-create-live-video-room" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 hidden">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-scaleUp max-h-[92vh] overflow-y-auto">
          
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-rose-600/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl">
                <i class="fa-solid fa-tower-broadcast"></i>
              </div>
              <div>
                <h3 class="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                  Tạo Phòng Học Video Trực Tuyến
                </h3>
                <p class="text-xs text-slate-400">
                  Điều phối phát video đồng bộ và cho cả lớp làm câu hỏi mốc dừng theo thời gian thực
                </p>
              </div>
            </div>
            <button type="button" id="btn-close-create-live-modal" class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form id="form-create-live-room" class="space-y-4">
            
            <!-- Tiêu đề buổi học -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tên Tiết Học / Buổi Học Trực Tuyến *
              </label>
              <input type="text" id="live-input-title" placeholder="Ví dụ: Tiết 12 - Ôn tập Trí tuệ nhân tạo (Lớp 12E)" required class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:ring-2 focus:ring-rose-500" />
            </div>

            <!-- Mã phòng -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Mã Phòng Live (Học sinh sẽ nhập mã này để vào) *
              </label>
              <input type="text" id="live-input-room-code" placeholder="LIVE-12E-01" required class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black font-mono tracking-wider text-rose-600 dark:text-rose-400 uppercase focus:ring-2 focus:ring-rose-500" />
            </div>

            <!-- Trường & Khối Lớp -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Trường Học Áp Dụng
                </label>
                <select id="live-input-school" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <!-- JS populate -->
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Khối Lớp
                </label>
                <select id="live-input-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="12">Khối 12</option>
                  <option value="11">Khối 11</option>
                  <option value="10">Khối 10</option>
                </select>
              </div>
            </div>

            <!-- Lớp Học Cụ Thể -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Lớp Học Cụ Thể
              </label>
              <select id="live-input-class" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <!-- JS populate -->
              </select>
            </div>

            <!-- Bài học video -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Chọn Bài Giảng Video *
              </label>
              <select id="live-input-lesson" class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:ring-2 focus:ring-rose-500">
                <!-- JS populate -->
              </select>
            </div>

            <!-- Cài đặt thời gian làm câu hỏi -->
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Thời Gian Làm Mỗi Câu Hỏi Tương Tác
              </label>
              <select id="live-input-countdown" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="15">15 giây (Nhanh - Tạo phản xạ)</option>
                <option value="20" selected>20 giây (Chuẩn cân đối)</option>
                <option value="30">30 giây (Thoải mái đọc kỹ)</option>
                <option value="45">45 giây (Dành cho câu hỏi dài)</option>
              </select>
            </div>

            <div class="pt-3">
              <button type="button" id="btn-confirm-create-live-room" class="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-black transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2">
                <i class="fa-solid fa-tower-broadcast"></i> Khởi Tạo & Mở Phòng Ngay
              </button>
            </div>

          </form>

        </div>
      </div>

      <!-- MODAL HỌC SINH NHẬP MÃ THAM GIA PHÒNG LIVE -->
      <div id="modal-join-live-video-room" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 hidden">
        <div class="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-scaleUp text-center">
          
          <div class="w-14 h-14 rounded-3xl bg-rose-600/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-2xl mx-auto shadow-inner">
            <i class="fa-solid fa-ticket"></i>
          </div>

          <div>
            <h3 class="text-lg font-black text-slate-800 dark:text-white">
              Vào Lớp Học Trực Tuyến
            </h3>
            <p class="text-xs text-slate-400 mt-1">
              Nhập mã phòng do Thầy/Cô cung cấp để vào rạp chiếu bài giảng tương tác
            </p>
          </div>

          <div class="space-y-3">
            <input type="text" id="live-join-input-code" placeholder="VD: LIVE-12E-01" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-center text-base font-black font-mono tracking-widest text-rose-600 dark:text-rose-400 uppercase focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 outline-none" />

            <button type="button" id="btn-confirm-join-live-room" class="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2">
              <i class="fa-solid fa-arrow-right-to-bracket"></i> Tham Gia Ngay
            </button>
            <button type="button" id="btn-close-join-live-modal" class="w-full py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 text-xs font-semibold transition">
              Đóng
            </button>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(div);
    this.bindModalEvents();
  },

  bindModalEvents() {
    document.getElementById('btn-close-create-live-modal')?.addEventListener('click', () => {
      document.getElementById('modal-create-live-video-room')?.classList.add('hidden');
    });

    document.getElementById('btn-confirm-create-live-room')?.addEventListener('click', () => {
      this.handleCreateRoomSubmit();
    });

    document.getElementById('btn-close-join-live-modal')?.addEventListener('click', () => {
      document.getElementById('modal-join-live-video-room')?.classList.add('hidden');
    });

    document.getElementById('btn-confirm-join-live-room')?.addEventListener('click', () => {
      this.handleJoinRoomSubmit();
    });

    // Enter key submit in join modal
    document.getElementById('live-join-input-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleJoinRoomSubmit();
      }
    });
  },

  bindGlobalEvents() {
    this.injectLiveVideoModals();

    // Lắng nghe sự kiện mở phòng live từ URL hoặc custom event
    window.addEventListener('join-live-video-room', (e) => {
      const code = e.detail?.roomCode;
      if (code) {
        this.handleJoinRoomSubmit(code);
      }
    });
  }
};
