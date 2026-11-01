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

import { DEFAULT_FIREBASE_DB_URL } from './cloud-sync.js?v=20261101_77';
import { Storage } from './storage.js?v=20261101_77';
import { Auth, SCHOOLS_DATA } from './auth.js?v=20261101_77';
import { escapeHtml } from './utils.js?v=20261101_77';
import { Proctor } from './proctor.js?v=20261101_77';
import { Gradebook } from './gradebook.js?v=20261101_77';

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
  activeQuestionIdx: null,
  confettiPlayedForQ: false,
  remoteState: null,
  lastSyncedTime: 0,
  countdownInterval: null,
  remainingSeconds: 0,
  lastBroadcastTime: 0,

  init(manifest = null) {
    this.manifest = manifest;
    this.bindGlobalEvents();
  },

  getBaseDbUrl() {
    if (typeof Storage !== 'undefined' && typeof Storage.getFirebaseDbUrl === 'function') {
      const customUrl = Storage.getFirebaseDbUrl();
      if (customUrl && customUrl.trim()) return customUrl.trim().replace(/\/+$/, '');
    }
    return DEFAULT_FIREBASE_DB_URL.trim().replace(/\/+$/, '');
  },

  // =========================================================================
  // 1. DIALOG: TẠO PHÒNG LIVE VIDEO CHO GIÁO VIÊN
  // =========================================================================
  async openCreateModal() {
    if (!Auth.isTeacher() && !Auth.isAdmin()) {
      alert('Chức năng tạo phòng học video trực tuyến chỉ dành riêng cho Giáo viên (GV) và Quản trị viên (Admin)!\nHọc sinh chỉ có quyền tham gia phòng học do Thầy/Cô cung cấp.');
      return;
    }

    // Đảm bảo manifest đã được nạp
    if (!this.manifest || !this.manifest.grades) {
      this.manifest = window.App?.manifest || window.AppInstance?.manifest;
    }
    if (!this.manifest || !this.manifest.grades) {
      try {
        const res = await fetch(`data/manifest.json?v=${Date.now()}`, { cache: 'no-cache' });
        if (res.ok) {
          this.manifest = await res.json();
          if (window.App) window.App.manifest = this.manifest;
          if (window.AppInstance) window.AppInstance.manifest = this.manifest;
        }
      } catch (e) {
        console.warn('Lỗi nạp manifest trong LiveVideo:', e);
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

    // Lấy thông tin phân công của Giáo viên (nếu là GV)
    const currentUser = Auth.getCurrentUser();
    const isTeacher = Auth.isTeacher() && !Auth.isAdmin();
    const assignedSchools = isTeacher ? Storage.getTeacherAssignedSchools(currentUser?.email) : [];
    const hasAssignments = isTeacher && assignedSchools.length > 0;

    // Trường học
    if (schoolSel) {
      const allSchools = Object.keys(SCHOOLS_DATA);
      const schools = hasAssignments ? assignedSchools : allSchools;
      let schoolHtml = '';
      if (!hasAssignments) {
        schoolHtml += `<option value="all">🌐 Tất cả các trường (Mở tự do)</option>`;
      }
      schools.forEach(s => {
        schoolHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
      });
      schoolSel.innerHTML = schoolHtml;
      
      const defaultSchool = (hasAssignments && schools[0]) ? schools[0] : (currentUser?.school || 'all');
      schoolSel.value = schools.includes(defaultSchool) ? defaultSchool : (schools[0] || 'all');
    }

    // Cập nhật Khối lớp theo phân công của GV
    const updateGrades = () => {
      if (!gradeSel) return;
      const curSchool = schoolSel?.value || 'all';
      let availableGrades = ['12', '11', '10'];
      if (hasAssignments) {
        const assignedGrades = Storage.getTeacherAssignedGrades(currentUser?.email, curSchool);
        if (assignedGrades.length > 0) availableGrades = assignedGrades;
      }
      gradeSel.innerHTML = availableGrades.map(g => `<option value="${g}">Khối ${g}</option>`).join('');
      if (availableGrades.length > 0) gradeSel.value = availableGrades[0];
    };

    // Cập nhật lớp học đồng bộ theo Trường & Khối & Phân công
    const updateClasses = () => {
      const curSchool = schoolSel?.value || 'all';
      const curGrade = gradeSel?.value || '12';
      if (!classSel) return;

      let classesForGrade = [];
      if (hasAssignments) {
        classesForGrade = Storage.getTeacherAssignedClasses(currentUser?.email, curSchool, curGrade);
      } else if (curSchool !== 'all' && SCHOOLS_DATA[curSchool]) {
        classesForGrade = SCHOOLS_DATA[curSchool].classes?.[curGrade] || [];
      }

      if (classesForGrade.length === 0) {
        if (!hasAssignments) {
          classSel.innerHTML = `<option value="all">Tất cả các lớp trong khối ${curGrade}</option>`;
        } else {
          classSel.innerHTML = `<option value="">Chưa có lớp nào được phân công</option>`;
        }
      } else {
        let html = '';
        if (!hasAssignments) {
          html += `<option value="all">Tất cả các lớp (Toàn khối ${curGrade})</option>`;
        }
        classesForGrade.forEach(c => {
          html += `<option value="${escapeHtml(c)}">Lớp ${escapeHtml(c)}</option>`;
        });
        classSel.innerHTML = html;
        if (classesForGrade.length > 0) classSel.value = classesForGrade[0];
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

      const manifest = this.manifest || window.App?.manifest || window.AppInstance?.manifest;
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
        lessonSel.innerHTML = `<option value="">⚠️ Không tìm thấy bài giảng video cho khối ${curGrade}</option>`;
      } else {
        let html = `<option value="">-- Chọn bài giảng video sẵn có (${lessonsList.length} bài) --</option>`;
        let curTopic = '';
        lessonsList.forEach(l => {
          if (l.topic && l.topic !== curTopic) {
            if (curTopic) html += `</optgroup>`;
            curTopic = l.topic;
            html += `<optgroup label="${escapeHtml(curTopic)}">`;
          }
          html += `
            <option value="${escapeHtml(l.video)}" data-topic="${escapeHtml(l.topic)}" data-lesson="${escapeHtml(l.lesson)}">
              ${escapeHtml(l.lesson)} (${l.checkpoints} câu hỏi dừng)
            </option>
          `;
        });
        if (curTopic) html += `</optgroup>`;
        lessonSel.innerHTML = html;
        if (lessonsList.length > 0) {
          lessonSel.value = lessonsList[0].video;
        }
      }
      autoFillTitle();
    };

    if (lessonSel) lessonSel.onchange = autoFillTitle;
    if (classSel) classSel.onchange = autoFillTitle;

    if (schoolSel) schoolSel.onchange = () => {
      updateGrades();
      updateClasses();
      updateLessons();
    };
    if (gradeSel) {
      gradeSel.onchange = () => {
        updateClasses();
        updateLessons();
      };
    }

    updateGrades();
    updateClasses();
    updateLessons();
  },

  // =========================================================================
  // 2. TẠO PHÒNG TRÊN FIREBASE DATABASE
  // =========================================================================
  async handleCreateRoomSubmit() {
    if (!Auth.isTeacher() && !Auth.isAdmin()) {
      alert('Chức năng tạo phòng học video trực tuyến chỉ dành riêng cho Giáo viên (GV) và Quản trị viên (Admin)!\nHọc sinh chỉ có quyền tham gia phòng học do Thầy/Cô cung cấp.');
      return;
    }

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
        name: user.fullName || user.name || 'Học sinh',
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

    this.isHost = true;
    this.activeRoom = room;
    this.questionsList = room.checkpoints || [];

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
          <video id="live-student-video" src="${videoUrl}" playsinline preload="auto" class="w-full h-full object-contain cursor-pointer"></video>

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
            <button type="button" id="btn-student-ready-confirm" class="mt-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm shadow-xl shadow-rose-600/30 flex items-center gap-2 transition hover:scale-105 active:scale-95 cursor-pointer">
              <i class="fa-solid fa-circle-check text-emerald-300"></i> EM ĐÃ SẴN SÀNG VÀO HỌC!
            </button>
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
  // 6. THUẬT TOÁN ĐỒNG BỘ THỜI GIAN THỰC ĐA THIẾT BỊ (REAL-TIME ENGINE)
  // =========================================================================
  startRealtimeSync(roomId) {
    this.cleanupSync();

    const dbUrl = this.getBaseDbUrl();
    const roomUrl = `${dbUrl}/live_video_rooms/${roomId}.json`;

    // Nạp trạng thái ban đầu tức thì
    fetch(roomUrl, { cache: 'no-cache' })
      .then(res => res.json())
      .then(remote => {
        if (remote && remote.roomId) {
          this.handleRemoteStateUpdate(remote);
        }
      })
      .catch(() => {});

    // 1. Kết nối Server-Sent Events (SSE) để nhận thay đổi tức thời từng mili-giây từ Firebase
    try {
      this.eventSource = new EventSource(roomUrl);
      this.eventSource.addEventListener('put', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload) {
            this.applyFirebaseStreamUpdate(payload.path, payload.data);
          }
        } catch (err) {}
      });
      this.eventSource.addEventListener('patch', (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload) {
            this.applyFirebaseStreamUpdate(payload.path, payload.data);
          }
        } catch (err) {}
      });
    } catch (e) {
      console.warn('LiveVideo: SSE không được hỗ trợ, sử dụng short polling:', e);
    }

    // 2. Short Polling liên tục (1.5s) đảm bảo 100% không bao giờ mất tín hiệu đồng bộ
    this.pollTimer = setInterval(async () => {
      try {
        const res = await fetch(roomUrl, { cache: 'no-cache' });
        if (res.ok) {
          const remote = await res.json();
          if (remote && remote.roomId) {
            this.handleRemoteStateUpdate(remote);
          }
        }
      } catch (err) {}
    }, 1500);

    // 3. Heartbeat điểm danh học sinh online mỗi 8 giây
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
      }, 8000);
    }
  },

  // Phân tích và ghép nối cây dữ liệu Firebase Stream thời gian thực
  applyFirebaseStreamUpdate(path, data) {
    if (!this.remoteState) this.remoteState = {};

    if (!path || path === '/') {
      if (data && typeof data === 'object') {
        this.remoteState = { ...this.remoteState, ...data };
      }
    } else {
      const parts = path.replace(/^\//, '').split('/');
      let curr = this.remoteState;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p] || typeof curr[p] !== 'object') {
          curr[p] = {};
        }
        curr = curr[p];
      }
      const lastKey = parts[parts.length - 1];
      if (data === null) {
        delete curr[lastKey];
      } else if (typeof data === 'object' && !Array.isArray(data) && typeof curr[lastKey] === 'object' && !Array.isArray(curr[lastKey])) {
        curr[lastKey] = { ...curr[lastKey], ...data };
      } else {
        curr[lastKey] = data;
      }
    }

    if (this.isHost) {
      this.updateMasterUI(this.remoteState);
    } else {
      this.updateStudentUI(this.remoteState);
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
      this.activeQuestionIdx = null;
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }

    // 4. Đồng bộ video phát / tạm dừng
    if (remote.state === 'playing') {
      if (waitingOverlay) waitingOverlay.classList.add('hidden');
      const tapOverlay = document.getElementById('student-tap-play-overlay');
      if (tapOverlay && !video.paused) tapOverlay.remove();

      // Tính toán mốc thời gian phát kỳ vọng theo thời gian thực (bù độ trôi mạng)
      let expectedTime = Number(remote.currentTime || 0);
      if (remote.updatedAt) {
        const elapsedSec = (Date.now() - remote.updatedAt) / 1000;
        if (elapsedSec > 0 && elapsedSec < 1800) {
          expectedTime += elapsedSec;
        }
      }

      // Chỉ bù độ lệch nếu lệch quá 2.5 giây để tránh giật lag hoặc giật lùi vô cớ
      if (Math.abs(video.currentTime - expectedTime) > 2.5) {
        video.currentTime = expectedTime;
      }

      if (video.paused) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Autoplay with sound prevented by browser policy, fallback to muted:', err);
            video.muted = true;
            video.play().then(() => {
              this.showStudentUnmutePill();
            }).catch((err2) => {
              console.error('Even muted play failed, showing tap to play overlay:', err2);
              this.showStudentTapToPlayOverlay();
            });
          });
        }
      }
    } else if (remote.state === 'paused') {
      if (!video.paused) video.pause();
      const targetTime = Number(remote.currentTime || 0);
      if (Math.abs(video.currentTime - targetTime) > 1.2) {
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

    // Khởi động đồng hồ đếm ngược nếu chưa chạy cho câu hỏi này
    if (this.activeQuestionIdx !== q.index || !this.countdownInterval) {
      this.activeQuestionIdx = q.index;
      this.startQuestionCountdown(q);
    }

    const optionBtns = optionsGrid.querySelectorAll('.student-opt-btn');
    const opts = q.options || [];

    // Kiểm tra xem học sinh này đã nộp bài trước đó chưa
    const myUid = this.studentInfo?.uid;
    const prevSub = responsesForQ?.[myUid];
    if (prevSub && prevSub.selected) {
      this.hasSubmittedCurrentQuestion = true;
      this.selectedAnswer = prevSub.selected;
    }

    optionBtns.forEach((btn, idx) => {
      const letter = btn.getAttribute('data-student-option');
      const label = btn.querySelector('.student-opt-label');
      let text = opts[idx] || '';
      text = text.replace(/^[A-Da-d][\.\:\)\s]+/, '').trim();
      if (label) label.textContent = text || `Phương án ${letter}`;

      // Reset trạng thái ban đầu của nút
      btn.disabled = !!(q.revealed || this.hasSubmittedCurrentQuestion);

      btn.onclick = () => {
        if (q.revealed || this.hasSubmittedCurrentQuestion) return;
        this.submitStudentAnswer(q.index, letter, q.answer);
      };
    });

    // Nếu Giáo viên đã công bố kết quả (Revealed)
    if (q.revealed) {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      if (countdownEl) {
        countdownEl.textContent = 'HẾT GIỜ';
        countdownEl.className = 'px-4 py-1.5 rounded-full bg-slate-700 text-white text-base font-black font-mono shadow-lg';
      }
      if (submittedBanner) submittedBanner.classList.add('hidden');
      if (resultBanner) resultBanner.classList.remove('hidden');

      const myAnswer = this.selectedAnswer || prevSub?.selected;
      const normAns = String(q.answer || '').trim().toUpperCase();
      const normMy = String(myAnswer || '').trim().toUpperCase();
      let isCorrect = (normMy === normAns);
      if (!isCorrect && ['A', 'B', 'C', 'D'].includes(normMy)) {
        const mapIdx = { 'A': '1', 'B': '2', 'C': '3', 'D': '4' };
        if (normAns === mapIdx[normMy]) isCorrect = true;
      }

      if (resultBadge) {
        if (isCorrect) {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-2xl mb-1">🎉 CHÍNH XÁC! (+100 ĐIỂM)</div>
            <div class="text-xs font-medium text-emerald-200">Em đã chọn đúng đáp án <strong>${escapeHtml(q.answer)}</strong>. Giỏi lắm!</div>
          `;
          if (typeof window.confetti === 'function' && !this.confettiPlayedForQ) {
            this.confettiPlayedForQ = true;
            window.confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
          }
        } else if (myAnswer) {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-rose-600/30 text-rose-300 border border-rose-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-2xl mb-1">❌ CHƯA CHÍNH XÁC</div>
            <div class="text-xs font-medium text-rose-200">Đáp án chính xác là <strong>${escapeHtml(q.answer)}</strong>. Cố gắng ở câu tiếp theo nhé!</div>
          `;
        } else {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-2xl mb-1">⏰ ĐÃ HẾT GIỜ LÀM BÀI</div>
            <div class="text-xs font-medium text-amber-200">Đáp án chính xác là <strong>${escapeHtml(q.answer)}</strong>. Hãy nhanh tay hơn ở câu sau nhé!</div>
          `;
        }
      }

      // Tô sáng nút đúng và mờ nút sai
      optionBtns.forEach(btn => {
        const letter = btn.getAttribute('data-student-option');
        btn.disabled = true;
        if (letter === normAns || (letter === 'A' && normAns === '1') || (letter === 'B' && normAns === '2') || (letter === 'C' && normAns === '3') || (letter === 'D' && normAns === '4')) {
          btn.className = 'student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-sm sm:text-base flex items-center gap-3.5 border-4 border-emerald-300 shadow-2xl scale-[1.02]';
        } else if (letter === normMy) {
          btn.className = 'student-opt-btn p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 text-white font-bold text-sm sm:text-base flex items-center gap-3.5 border-2 border-rose-400 opacity-60';
        } else {
          btn.className = 'student-opt-btn p-4 sm:p-5 rounded-2xl bg-slate-800 text-slate-400 font-bold text-sm sm:text-base flex items-center gap-3.5 opacity-30';
        }
      });

      // Hiển thị phổ bình chọn của cả lớp
      this.renderLivePollChart('student-poll-bars-class', responsesForQ, q.answer);
    } else {
      // Chưa công bố kết quả
      this.confettiPlayedForQ = false;
      if (resultBanner) resultBanner.classList.add('hidden');

      if (this.hasSubmittedCurrentQuestion) {
        if (submittedBanner) {
          submittedBanner.classList.remove('hidden');
          submittedBanner.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô công bố kết quả...';
          submittedBanner.className = 'p-3 rounded-2xl bg-white/10 text-emerald-400 font-bold text-xs sm:text-sm animate-pulse border border-emerald-500/30';
        }
        optionBtns.forEach(btn => {
          const letter = btn.getAttribute('data-student-option');
          btn.disabled = true;
          if (letter === this.selectedAnswer) {
            btn.classList.add('ring-4', 'ring-white', 'shadow-2xl');
            btn.classList.remove('opacity-40');
          } else {
            btn.classList.add('opacity-40');
            btn.classList.remove('ring-4', 'ring-white', 'shadow-2xl');
          }
        });
      } else {
        if (submittedBanner) submittedBanner.classList.add('hidden');
        optionBtns.forEach(btn => {
          btn.disabled = false;
          btn.classList.remove('ring-4', 'ring-white', 'ring-emerald-400', 'scale-[1.02]', 'opacity-40', 'opacity-50', 'opacity-60', 'opacity-30', 'border-4');
        });
      }
    }
  },

  async submitStudentAnswer(qIndex, selectedOption, correctAnswer) {
    if (this.hasSubmittedCurrentQuestion || !this.activeRoom || !this.studentInfo) return;

    this.hasSubmittedCurrentQuestion = true;
    this.selectedAnswer = selectedOption;

    const normAns = String(correctAnswer || '').trim().toUpperCase();
    const normSel = String(selectedOption || '').trim().toUpperCase();
    let isCorrect = (normSel === normAns);
    if (!isCorrect && ['A', 'B', 'C', 'D'].includes(normSel)) {
      const mapIdx = { 'A': '1', 'B': '2', 'C': '3', 'D': '4' };
      if (normAns === mapIdx[normSel]) isCorrect = true;
    }

    const dbUrl = this.getBaseDbUrl();
    const roomId = this.activeRoom.roomId;
    const uid = this.studentInfo.uid;

    // Highlight nút vừa chọn và khóa tất cả các nút
    const optionsGrid = document.getElementById('student-options-grid');
    if (optionsGrid) {
      optionsGrid.querySelectorAll('.student-opt-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.getAttribute('data-student-option') === selectedOption) {
          btn.classList.add('ring-4', 'ring-white', 'shadow-2xl');
          btn.classList.remove('opacity-40', 'opacity-50');
        } else {
          btn.classList.add('opacity-40');
          btn.classList.remove('ring-4', 'ring-white', 'shadow-2xl');
        }
      });
    }

    const banner = document.getElementById('student-submitted-banner');
    if (banner) {
      banner.classList.remove('hidden');
      banner.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô công bố kết quả...';
      banner.className = 'p-3 rounded-2xl bg-white/10 text-emerald-400 font-bold text-xs sm:text-sm animate-pulse border border-emerald-500/30';
    }

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

      // Khởi động đồng hồ đếm ngược trên máy Thầy Cô nếu chưa chạy
      if (this.activeQuestionIdx !== q.index || !this.countdownInterval) {
        this.activeQuestionIdx = q.index;
        this.startQuestionCountdown(q);
      }

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
      if (this.isHost && this.countdownInterval && remote.state !== 'question') {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }

    // 4. Cập nhật nút Play/Pause
    if (btnPlay) {
      if (remote.state === 'playing') {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition shadow-lg shadow-amber-600/30 flex items-center gap-2';
        btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i> TẠM DỪNG CẢ LỚP (ĐỂ GIẢNG BÀI)';
      } else if (remote.state === 'paused') {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition shadow-lg shadow-emerald-600/30 flex items-center gap-2';
        btnPlay.innerHTML = '<i class="fa-solid fa-play"></i> TIẾP TỤC PHÁT (CHO CẢ LỚP XEM)';
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
        const isPaused = video.paused;
        const curTime = Number(video.currentTime || 0);

        if (isPaused) {
          // Cập nhật giao diện nút ngay lập tức để giáo viên an tâm
          btnPlayPause.innerHTML = '<i class="fa-solid fa-pause"></i> TẠM DỪNG CẢ LỚP (ĐỂ GIẢNG BÀI)';
          btnPlayPause.className = 'px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition shadow-lg shadow-amber-600/30 flex items-center gap-2';

          // 1. Gửi lệnh phát đồng bộ cho cả lớp ngay lập tức lên Firebase
          fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: 'playing',
              currentTime: curTime,
              updatedAt: Date.now()
            })
          }).catch(err => console.warn('Lỗi gửi lệnh phát lên Firebase:', err));

          // 2. Kích hoạt phát video trên máy Thầy Cô
          try {
            await video.play();
          } catch (playErr) {
            console.warn('Browser policy blocked teacher video audio, attempting muted:', playErr);
            video.muted = true;
            try {
              await video.play();
            } catch (err2) {
              console.error('Không thể phát video máy Thầy Cô:', err2);
            }
          }
        } else {
          // Tạm dừng video
          btnPlayPause.innerHTML = '<i class="fa-solid fa-play"></i> TIẾP TỤC PHÁT (CHO CẢ LỚP XEM)';
          btnPlayPause.className = 'px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition shadow-lg shadow-emerald-600/30 flex items-center gap-2';

          video.pause();

          fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: 'paused',
              currentTime: curTime,
              updatedAt: Date.now()
            })
          }).catch(err => console.warn('Lỗi gửi lệnh tạm dừng lên Firebase:', err));
        }
      };
    }

    // Nút Tua -10s và +10s
    const btnRewind10 = document.getElementById('btn-master-rewind-10');
    if (btnRewind10 && video) {
      btnRewind10.onclick = () => {
        const target = Math.max(0, (video.currentTime || 0) - 10);
        video.currentTime = target;
        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentTime: target, updatedAt: Date.now() })
        }).catch(() => {});
      };
    }

    const btnForward10 = document.getElementById('btn-master-forward-10');
    if (btnForward10 && video) {
      btnForward10.onclick = () => {
        const dur = video.duration || 9999;
        const target = Math.min(dur, (video.currentTime || 0) + 10);
        video.currentTime = target;
        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentTime: target, updatedAt: Date.now() })
        }).catch(() => {});
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

    // Cập nhật timeline fill, đồng hồ và sự kiện video
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

        // Phát định kỳ mốc thời gian mỗi 4 giây lên Firebase để học sinh vào sau bắt kịp tức thì
        const now = Date.now();
        if (!video.paused && (!this.lastBroadcastTime || now - this.lastBroadcastTime > 4000)) {
          this.lastBroadcastTime = now;
          fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentTime: cur, updatedAt: now })
          }).catch(() => {});
        }

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

      video.onended = () => {
        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'paused', currentTime: video.duration || video.currentTime, updatedAt: Date.now() })
        }).catch(() => {});
      };

      video.onerror = () => {
        console.warn('Live Master Video load error for:', video.src);
        if (video.src && (video.src.includes('archive.org/download/') || video.src.includes('.us.archive.org/'))) {
          const corsUrl = `https://archive.org/cors/tinhoc-hub-thpt/${room.videoFileName}`;
          if (video.src !== corsUrl) {
            console.log('Chuyển Master sang nguồn Archive CORS trực tiếp:', corsUrl);
            video.src = corsUrl;
            video.load();
          }
        }
      };
    }

    // 4. Nút Đặt Câu Hỏi Ngay Tại Mốc Hiện Tại
    const btnTriggerQ = document.getElementById('btn-master-trigger-current-q');
    if (btnTriggerQ && video) {
      btnTriggerQ.onclick = () => {
        const cur = Number(video.currentTime || 0);
        let targetQ = this.questionsList.find(q => q.sec >= cur - 2 && !q.triggered);
        if (!targetQ) {
          targetQ = this.questionsList.find(q => !q.triggered) || this.questionsList[0];
        }
        if (!targetQ) {
          alert('Không tìm thấy câu hỏi tương tác nào trong bài học này!');
          return;
        }
        targetQ.triggered = true;
        this.triggerMasterQuestion(targetQ);
      };
    }

    // 5. Nút Mốc Kế Tiếp
    const btnNextCp = document.getElementById('btn-master-next-checkpoint');
    if (btnNextCp && video) {
      btnNextCp.onclick = () => {
        const cur = Number(video.currentTime || 0);
        const next = this.questionsList.find(q => q.sec > cur + 1 && !q.triggered) || this.questionsList.find(q => q.sec > cur + 1);
        if (next) {
          video.currentTime = next.sec;
          next.triggered = true;
          this.triggerMasterQuestion(next);
        } else {
          alert('Đã xem đến mốc câu hỏi cuối cùng của bài giảng!');
        }
      };
    }

    // 6. Nút Mở Đáp Án Cho Cả Lớp
    const btnReveal = document.getElementById('btn-master-reveal-answer');
    const btnResume = document.getElementById('btn-master-resume-video');
    if (btnReveal) {
      btnReveal.onclick = () => {
        btnReveal.classList.add('hidden');
        if (btnResume) btnResume.classList.remove('hidden');

        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        const masterCountdown = document.getElementById('master-q-countdown');
        if (masterCountdown) {
          masterCountdown.textContent = 'ĐÃ MỞ ĐÁP ÁN';
          masterCountdown.className = 'px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-black font-mono';
        }

        fetch(`${dbUrl}/live_video_rooms/${roomId}/currentQuestion/revealed.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(true)
        }).catch(err => console.warn('Lỗi công bố đáp án:', err));

        const currentQ = this.remoteState?.currentQuestion || this.activeRoom?.currentQuestion;
        if (currentQ) {
          currentQ.revealed = true;
          const responses = this.remoteState?.responses?.[currentQ.index] || {};
          this.renderLivePollChart('master-poll-bars', responses, currentQ.answer);
        }
      };
    }

    // 7. Nút Tiếp Tục Bài Giảng Sau Câu Hỏi
    if (btnResume && video) {
      btnResume.onclick = async () => {
        const curTime = Number(video.currentTime || 0);
        // Tua nhẹ qua mốc để không bị kích hoạt lại
        const nextTime = Math.min(video.duration || 9999, curTime + 0.8);
        video.currentTime = nextTime;

        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.activeQuestionIdx = null;

        const qOverlay = document.getElementById('master-question-active-overlay');
        if (qOverlay) qOverlay.classList.add('hidden');

        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: 'playing',
            currentQuestion: null,
            currentTime: nextTime,
            updatedAt: Date.now()
          })
        }).catch(err => console.warn('Lỗi tiếp tục bài giảng:', err));

        try {
          await video.play();
        } catch (playErr) {
          video.muted = true;
          try {
            await video.play();
          } catch (e2) {}
        }
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
    const video = this.videoElem || document.getElementById('live-master-video');
    const dbUrl = this.getBaseDbUrl();
    const roomId = this.activeRoom?.roomId;
    if (!roomId) return;

    if (video && !video.paused) video.pause();

    const totalSec = parseInt(q.timeLimit || q.countdown || this.activeRoom?.countdownSec || '20', 10);
    const now = Date.now();
    const questionPayload = {
      index: q.index !== undefined ? q.index : 0,
      id: q.id || `q_${q.index || 0}`,
      sec: q.sec || 0,
      question: q.question,
      options: q.options || [],
      answer: q.answer,
      revealed: false,
      countdown: totalSec,
      startTimestamp: now,
      timestamp: now
    };

    // Bắt đầu đếm ngược thời gian ngay lập tức
    this.activeQuestionIdx = questionPayload.index;
    this.startQuestionCountdown(questionPayload);

    fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'question',
        currentTime: Number(video?.currentTime || q.sec || 0),
        currentQuestion: questionPayload,
        updatedAt: now
      })
    }).catch(err => console.warn('Lỗi gửi câu hỏi lên Firebase:', err));
  },

  startQuestionCountdown(q) {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const startTs = Number(q.startTimestamp || q.timestamp || Date.now());
    const totalSec = Number(q.countdown || q.timeLimit || 20);

    const tick = () => {
      // Nếu câu hỏi đã được giáo viên công bố đáp án
      if (q.revealed || this.remoteState?.currentQuestion?.revealed) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        const masterEl = document.getElementById('master-q-countdown');
        if (masterEl) {
          masterEl.textContent = 'ĐÃ MỞ ĐÁP ÁN';
          masterEl.className = 'px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-black font-mono';
        }
        const studentEl = document.getElementById('student-q-countdown');
        if (studentEl) {
          studentEl.textContent = 'HẾT GIỜ';
          studentEl.className = 'px-4 py-1.5 rounded-full bg-slate-700 text-white text-base font-black font-mono shadow-lg';
        }
        return;
      }

      const elapsed = Math.floor((Date.now() - startTs) / 1000);
      const remaining = Math.max(0, totalSec - elapsed);

      // Cập nhật phía Thầy Cô (Master)
      const masterEl = document.getElementById('master-q-countdown');
      if (masterEl) {
        if (remaining > 0) {
          masterEl.textContent = `${remaining}s`;
          masterEl.className = remaining <= 5
            ? 'px-3 py-1 rounded-full bg-rose-600 text-white text-sm font-black font-mono animate-ping'
            : 'px-3 py-1 rounded-full bg-rose-600 text-white text-sm font-black font-mono';
        } else {
          masterEl.textContent = 'HẾT GIỜ';
          masterEl.className = 'px-3 py-1 rounded-full bg-slate-700 text-white text-sm font-black font-mono';
        }
      }

      // Cập nhật phía Học sinh (Student)
      const studentEl = document.getElementById('student-q-countdown');
      if (studentEl) {
        if (remaining > 0) {
          studentEl.textContent = `${remaining}s`;
          studentEl.className = remaining <= 5
            ? 'px-4 py-1.5 rounded-full bg-rose-500 text-white text-base font-black font-mono shadow-lg shadow-rose-500/50 animate-pulse'
            : 'px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 text-base font-black font-mono shadow-lg shadow-amber-500/30';
        } else {
          studentEl.textContent = 'HẾT GIỜ';
          studentEl.className = 'px-4 py-1.5 rounded-full bg-slate-700 text-white text-base font-black font-mono';

          // Khi hết giờ mà chưa nộp bài: tự động khóa nút và hiện cảnh báo
          if (!this.hasSubmittedCurrentQuestion && !q.revealed) {
            const banner = document.getElementById('student-submitted-banner');
            if (banner) {
              banner.classList.remove('hidden');
              banner.innerHTML = '<i class="fa-solid fa-hourglass-end text-amber-400"></i> Đã hết thời gian trả lời! Đang chờ Thầy/Cô công bố đáp án...';
              banner.className = 'p-3 rounded-2xl bg-amber-500/20 text-amber-300 font-bold text-xs sm:text-sm border border-amber-500/30';
            }
            const optionBtns = document.querySelectorAll('.student-opt-btn');
            optionBtns.forEach(b => {
              b.disabled = true;
              b.classList.add('opacity-40', 'cursor-not-allowed');
            });
          }
        }
      }

      if (remaining <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
      }
    };

    tick();
    this.countdownInterval = setInterval(tick, 1000);
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
      btnLeave.onclick = async () => {
        if (confirm('Em có chắc chắn muốn rời khỏi phòng học trực tuyến của Thầy/Cô không?')) {
          try {
            const uid = this.studentInfo?.uid;
            const dbUrl = this.getBaseDbUrl();
            if (uid && this.activeRoom?.roomId) {
              await fetch(`${dbUrl}/live_video_rooms/${this.activeRoom.roomId}/students/${uid}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ online: false, lastSeen: 0 })
              });
            }
          } catch (e) {}

          this.cleanupSession();
          if (window.App && typeof window.App.switchTab === 'function') {
            window.App.switchTab('interactive-video');
          }
        }
      };
    }

    const btnReady = document.getElementById('btn-student-ready-confirm');
    const video = document.getElementById('live-student-video');
    if (btnReady && video) {
      btnReady.onclick = () => {
        btnReady.disabled = true;
        btnReady.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-300"></i> Đã sẵn sàng! Màn hình sẽ tự chiếu khi Thầy/Cô phát';
        btnReady.className = 'mt-2 px-6 py-3 rounded-2xl bg-emerald-600/40 text-emerald-300 font-bold text-xs border border-emerald-500/30 flex items-center gap-2';

        // Tương tác trước để kích hoạt quyền Autoplay âm thanh
        video.play().then(() => {
          if (this.remoteState?.state !== 'playing') {
            video.pause();
          }
        }).catch(() => {
          video.muted = true;
          video.play().then(() => {
            if (this.remoteState?.state !== 'playing') video.pause();
          }).catch(() => {});
        });
      };
    }

    if (video) {
      video.onclick = () => {
        if (video.muted) {
          video.muted = false;
          video.volume = 1.0;
          const pill = document.getElementById('student-unmute-pill');
          if (pill) pill.remove();
        } else if (this.remoteState?.state === 'playing' && video.paused) {
          video.play().catch(() => {});
        }
      };

      video.onerror = () => {
        console.warn('Live Student Video load error for:', video.src);
        if (video.src && (video.src.includes('archive.org/download/') || video.src.includes('.us.archive.org/'))) {
          const corsUrl = `https://archive.org/cors/tinhoc-hub-thpt/${room.videoFileName}`;
          if (video.src !== corsUrl) {
            console.log('Chuyển Student sang nguồn Archive CORS trực tiếp:', corsUrl);
            video.src = corsUrl;
            video.load();
            video.play().catch(() => {});
          }
        }
      };
    }
  },

  showStudentUnmutePill() {
    if (document.getElementById('student-unmute-pill')) return;
    const container = document.getElementById('live-student-cinema');
    if (!container) return;

    const pill = document.createElement('div');
    pill.id = 'student-unmute-pill';
    pill.className = 'absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-5 py-3 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-2xl flex items-center gap-2.5 cursor-pointer transition animate-bounce border-2 border-white/40';
    pill.innerHTML = '<i class="fa-solid fa-volume-xmark text-base"></i> <span>VIDEO ĐANG TẮT TIẾNG • CHẠM VÀO ĐÂY ĐỂ BẬT ÂM THANH</span> <i class="fa-solid fa-volume-high text-base"></i>';

    const video = document.getElementById('live-student-video');
    pill.onclick = () => {
      if (video) {
        video.muted = false;
        video.volume = 1.0;
      }
      pill.remove();
    };

    container.appendChild(pill);

    // Tự động ẩn sau 12 giây nếu học sinh không bấm
    setTimeout(() => {
      if (pill && pill.parentNode) pill.remove();
    }, 12000);
  },

  showStudentTapToPlayOverlay() {
    if (document.getElementById('student-tap-play-overlay')) return;
    const container = document.getElementById('live-student-cinema');
    if (!container) return;

    const overlay = document.createElement('div');
    overlay.id = 'student-tap-play-overlay';
    overlay.className = 'absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-25 cursor-pointer';
    overlay.innerHTML = `
      <div class="w-24 h-24 rounded-full bg-rose-600/90 text-white flex items-center justify-center text-4xl shadow-2xl shadow-rose-600/50 animate-pulse mb-4 hover:scale-110 transition">
        <i class="fa-solid fa-play ml-1"></i>
      </div>
      <h3 class="text-lg font-black text-white">Thầy/Cô đang phát bài giảng</h3>
      <p class="text-xs text-slate-300 mt-1">Chạm vào màn hình để bắt đầu xem cùng lớp</p>
    `;

    const video = document.getElementById('live-student-video');
    overlay.onclick = () => {
      if (video) {
        video.muted = false;
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
      }
      overlay.remove();
    };

    container.appendChild(overlay);
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
    const vTrim = String(fileName).trim();
    if (vTrim.startsWith('http://') || vTrim.startsWith('https://') || vTrim.startsWith('blob:') || vTrim.startsWith('data:')) {
      if (vTrim.includes('archive.org/download/')) {
        return vTrim.replace('archive.org/download/', 'archive.org/cors/');
      }
      return vTrim;
    }

    // 1. Tệp video cục bộ chọn từ máy tính giáo viên nếu có
    if (window.InteractiveVideo && window.InteractiveVideo.localVideoMap) {
      const entry = window.InteractiveVideo.localVideoMap[vTrim] || window.InteractiveVideo.localVideoMap[vTrim.toLowerCase()];
      if (entry) {
        return typeof entry === 'string' ? entry : (entry.url || '');
      }
    }

    // 2. Custom Video URL từ Storage nếu giáo viên/admin đã cấu hình
    if (typeof Storage !== 'undefined' && typeof Storage.getCustomVideoUrl === 'function') {
      const customUrl = Storage.getCustomVideoUrl(vTrim);
      if (customUrl) {
        if (customUrl.includes('archive.org/download/')) {
          return customUrl.replace('archive.org/download/', 'archive.org/cors/');
        }
        return customUrl;
      }
    }

    // 3. Mặc định stream qua Archive CORS trực tiếp chống chặn mạng
    let baseUrl = 'https://archive.org/cors/tinhoc-hub-thpt/';
    if (typeof Storage !== 'undefined' && typeof Storage.getVideoBaseUrl === 'function') {
      baseUrl = Storage.getVideoBaseUrl();
      if (baseUrl && baseUrl.includes('archive.org/download/')) {
        baseUrl = baseUrl.replace('archive.org/download/', 'archive.org/cors/');
      }
    }
    return `${baseUrl}${vTrim}`;
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
      <div id="modal-create-live-video-room" data-role-req="teacher" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 hidden">
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
