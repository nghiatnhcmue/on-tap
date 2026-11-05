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

import { DEFAULT_FIREBASE_DB_URL } from './cloud-sync.js?v=20261102_88';
import { Storage } from './storage.js?v=20261102_88';
import { Auth, SCHOOLS_DATA } from './auth.js?v=20261102_88';
import { escapeHtml } from './utils.js?v=20261102_88';
import { Proctor } from './proctor.js?v=20261102_88';
import { Gradebook } from './gradebook.js?v=20261102_88';

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

  // Kiểm tra phòng Live Video có thực sự đang hoạt động không (chống hiển thị phòng ảo / phòng cũ bị treo)
  isRoomActivelyLive(room, now = Date.now()) {
    if (!room || !room.roomId) return false;
    const state = String(room.state || '').toLowerCase();
    if (state === 'finished' || state === 'closed' || state === 'ended') return false;

    const lastActive = Number(room.hostLastSeen || room.updatedAt || room.createdAt || 0);
    if (!lastActive) return false;

    const elapsedMs = now - lastActive;
    // Nếu có heartbeat của Host mà quá 3 phút không phản hồi và quá 15 phút không cập nhật state -> Đã tắt trình duyệt
    if (room.hostLastSeen && (now - Number(room.hostLastSeen)) > 3 * 60 * 1000 && (now - Number(room.updatedAt || 0)) > 15 * 60 * 1000) {
      return false;
    }
    // Phòng ở trạng thái chờ (waiting) quá 25 phút không có tác động -> Đã bị bỏ quên
    if (state === 'waiting' && elapsedMs > 25 * 60 * 1000) {
      return false;
    }
    // Bất kỳ phòng nào không có tín hiệu quá 60 phút -> Tự động coi là đã kết thúc
    if (elapsedMs > 60 * 60 * 1000) {
      return false;
    }
    return true;
  },

  // Đóng / Xóa phòng Live Video ngay lập tức (dành cho Admin & Giáo viên)
  async closeOrDeleteRoom(roomId, silent = false) {
    if (!roomId) return false;
    try {
      const dbUrl = this.getBaseDbUrl();
      await fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'finished', endedAt: Date.now(), updatedAt: Date.now() })
      });
      if (!silent) {
        alert(`Đã đóng phòng học trực tuyến "${roomId}" thành công!`);
      }
      return true;
    } catch (e) {
      if (!silent) alert(`Không thể đóng phòng: ${e.message}`);
      return false;
    }
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

      const requireApprovalEl = document.getElementById('live-input-require-approval');
      const requireApproval = requireApprovalEl ? !!requireApprovalEl.checked : false;

      const roomPayload = {
        roomId,
        title,
        hostEmail: user?.email || 'giaovien@tinhoc.edu.vn',
        hostName: user?.fullName || user?.name || 'Thầy/Cô Giáo Viên',
        school,
        grade,
        className,
        videoFileName,
        lessonTitle,
        topicTitle,
        countdownSec,
        requireApproval,
        totalQuestions: checkpoints.length,
        checkpoints,
        state: 'waiting', // 'waiting' | 'playing' | 'paused' | 'question' | 'finished'
        currentTime: 0,
        currentQuestionIdx: null,
        currentQuestion: null,
        hostLastSeen: Date.now(),
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

  async handleJoinRoomSubmit(customCode = null, options = {}) {
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
    const isAdmin = Auth.isAdmin() || user?.role === 'admin';
    const isTeacher = Auth.isTeacher() || user?.role === 'teacher';
    const isPrivileged = isAdmin || isTeacher;

    if (!isPrivileged && !Auth.isProfileComplete()) {
      Auth.openRequiredProfileModal();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang vào lớp...';
    }

    try {
      const dbUrl = this.getBaseDbUrl();
      let resolvedRoomId = roomId;
      let res = await fetch(`${dbUrl}/live_video_rooms/${resolvedRoomId}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error('Không thể kết nối máy chủ');

      let roomData = await res.json();
      // Hỗ trợ học sinh nhập mã rút gọn (VD: nhập "892" tự động khớp "LIVE-892")
      if ((!roomData || !roomData.roomId) && !resolvedRoomId.startsWith('LIVE-')) {
        const altId = `LIVE-${resolvedRoomId}`;
        const altRes = await fetch(`${dbUrl}/live_video_rooms/${altId}.json`, { cache: 'no-cache' });
        if (altRes.ok) {
          const altData = await altRes.json();
          if (altData && altData.roomId) {
            resolvedRoomId = altId;
            roomData = altData;
          }
        }
      }

      if (!roomData || !roomData.roomId) {
        alert(`Không tìm thấy phòng trực tuyến với mã "${roomId}"!\nVui lòng kiểm tra lại mã phòng do Thầy/Cô cung cấp.`);
        return;
      }

      const isRoomHost = isAdmin || (isTeacher && roomData.hostEmail && user?.email && roomData.hostEmail.toLowerCase() === user.email.toLowerCase());

      // Nếu phòng đã kết thúc hoặc bị treo quá hạn không còn ai live
      if (roomData.state === 'finished' || roomData.state === 'closed' || !this.isRoomActivelyLive(roomData)) {
        if (isRoomHost && roomData.state !== 'finished') {
          await this.closeOrDeleteRoom(resolvedRoomId, true);
        }
        if (isRoomHost) {
          const wantReopen = confirm(`Phòng trực tuyến "${resolvedRoomId}" hiện đã kết thúc hoặc ngừng phát.\n\nBạn đang là Quản trị viên / Giáo viên chủ phòng:\n- Bấm OK để MỞ LẠI & ĐIỀU KHIỂN phòng học này.\n- Bấm Cancel để đóng hẳn phòng.`);
          if (!wantReopen) {
            await this.closeOrDeleteRoom(resolvedRoomId, true);
            document.getElementById('modal-join-live-video-room')?.classList.add('hidden');
            if (window.App && typeof window.App.renderStudentAssignedTasks === 'function') {
              window.App.renderStudentAssignedTasks();
            }
            return;
          }
          roomData.state = 'waiting';
          roomData.hostLastSeen = Date.now();
          roomData.updatedAt = Date.now();
          await fetch(`${dbUrl}/live_video_rooms/${resolvedRoomId}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: 'waiting', hostLastSeen: Date.now(), updatedAt: Date.now() })
          }).catch(() => {});
        } else {
          alert(`Phòng học trực tuyến "${resolvedRoomId}" hiện đã kết thúc hoặc chưa có Giáo viên phát trực tiếp!`);
          return;
        }
      }

      // Kiểm tra đối tượng tham gia (Trường & Lớp) - CHỈ áp dụng cho Học sinh, Admin & Giáo viên vào thẳng không hỏi!
      if (!isPrivileged) {
        if (roomData.school !== 'all' && user.school && roomData.school.toLowerCase() !== user.school.toLowerCase()) {
          const confirmJoin = confirm(`Phòng học này được Thầy/Cô giao riêng cho trường "${roomData.school}".\nTài khoản của em đang thuộc trường "${user.school}".\nEm có chắc chắn muốn tham gia không?`);
          if (!confirmJoin) return;
        }

        if (roomData.className !== 'all' && user.className && roomData.className.toLowerCase() !== user.className.toLowerCase()) {
          const confirmJoin = confirm(`Phòng học này được Thầy/Cô giao cho lớp "${roomData.className}".\nLớp của em là "${user.className}".\nEm có muốn tiếp tục tham gia không?`);
          if (!confirmJoin) return;
        }
      }

      // Đóng modal join
      document.getElementById('modal-join-live-video-room')?.classList.add('hidden');

      // Nếu là Admin hoặc Giáo viên chủ phòng (và không chọn chế độ xem như học sinh) -> Vào thẳng Master Console điều khiển!
      if (isRoomHost && !options?.asStudent) {
        this.isHost = true;
        this.activeRoom = roomData;
        this.questionsList = roomData.checkpoints || [];
        fetch(`${dbUrl}/live_video_rooms/${resolvedRoomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostLastSeen: Date.now(), updatedAt: Date.now() })
        }).catch(() => {});
        await this.openHostMasterConsole(roomData);
        return;
      }

      // Đăng ký học sinh vào Hàng Đợi Truy Cập (Waiting Queue) trên Firebase
      const studentUid = (user.email || user.username || `hs_${Date.now()}`).replace(/[.#$\[\]\/]/g, '_');
      const existingStudents = roomData.students || {};
      const prevStudent = existingStudents[studentUid];
      const existingCount = Object.keys(existingStudents).length;
      const queueOrder = prevStudent?.queueOrder || (existingCount + 1);
      const initialQueueStatus = prevStudent?.queueStatus === 'admitted'
        ? 'admitted'
        : (roomData.requireApproval ? 'pending' : 'admitted');

      const studentRecord = {
        uid: studentUid,
        name: user.fullName || user.name || 'Học sinh',
        email: user.email || '',
        avatar: user.avatar || '',
        school: user.school || '',
        className: user.className || '',
        grade: user.grade || '',
        online: true,
        ready: prevStudent?.ready || false,
        queueOrder,
        queueStatus: initialQueueStatus, // 'pending' (chờ duyệt) | 'admitted' (đã vào hàng đợi phòng chờ) | 'kicked'
        joinedAt: prevStudent?.joinedAt || Date.now(),
        lastSeen: Date.now(),
        score: prevStudent?.score || 0,
        correctCount: prevStudent?.correctCount || 0
      };

      await fetch(`${dbUrl}/live_video_rooms/${resolvedRoomId}/students/${studentUid}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentRecord)
      });

      this.isHost = false;
      this.activeRoom = roomData;
      this.studentInfo = studentRecord;
      this.questionsList = roomData.checkpoints || [];

      // Mở Rạp Chiếu Phim Trực Tuyến & Hàng Đợi Phòng Chờ của Học Sinh
      await this.openStudentCinemaStage(roomData);
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
  async openHostMasterConsole(room) {
    this.isHost = true;
    this.activeRoom = room;
    this.questionsList = room.checkpoints || [];

    if (window.App && typeof window.App.switchTab === 'function' && window.App.currentTab !== 'interactive-video') {
      await window.App.switchTab('interactive-video');
    }

    const container = document.getElementById('view-interactive-video');
    if (!container) return;
    container.classList.remove('hidden');

    const origin = window.location.origin + window.location.pathname;
    const shareLink = `${origin}?live_video=${encodeURIComponent(room.roomId)}`;
    const videoUrl = this.resolveVideoStreamingUrl(room.videoFileName);

    container.innerHTML = `
      <div id="live-master-console" class="space-y-6 animate-fadeIn pb-12">
        
        <!-- Top Master Header Bar -->
        <div class="bg-gradient-to-r from-slate-900 via-rose-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-rose-500/30 relative overflow-hidden">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 relative z-10">
            <div class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span id="master-room-state-badge" class="px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                  <i class="fa-solid fa-users-line"></i> ĐANG MỞ HÀNG ĐỢI PHÒNG CHỜ
                </span>
                <button type="button" id="btn-master-copy-code" class="px-3.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-bold font-mono flex items-center gap-2 border border-amber-400/50 cursor-pointer transition" title="Bấm để sao chép Mã Phòng">
                  <span>MÃ TRUY CẬP:</span>
                  <strong class="text-amber-300 font-black text-sm tracking-wider">${escapeHtml(room.roomId)}</strong>
                  <i class="fa-regular fa-copy text-amber-300"></i>
                </button>
                <span class="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-bold border border-indigo-400/30">
                  Lớp: ${escapeHtml(room.className === 'all' ? `Toàn khối ${room.grade}` : room.className)} • ${escapeHtml(room.school === 'all' ? 'Mở tự do' : room.school)}
                </span>
              </div>
              <h2 class="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
                ${escapeHtml(room.title)}
              </h2>
              <p class="text-xs sm:text-sm text-slate-300 flex items-center gap-2 flex-wrap">
                <span><i class="fa-solid fa-book-open text-rose-400"></i> ${escapeHtml(room.lessonTitle)}</span>
                <span>•</span>
                <span><i class="fa-solid fa-flag-checkered text-amber-400"></i> ${room.totalQuestions} mốc câu hỏi tương tác</span>
              </p>
            </div>

            <!-- Cụm Nút Điều Khiển Nhanh Phòng Live (Bắt đầu / Tạm dừng / Tiếp tục / Dừng phòng) -->
            <div class="flex items-center gap-2.5 flex-wrap">
              <button type="button" id="btn-master-header-start-pause" class="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-2 shadow-lg cursor-pointer">
                <i class="fa-solid fa-play"></i> Bắt Đầu Phòng Live
              </button>
              <button type="button" id="btn-master-copy-invite" class="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20 cursor-pointer">
                <i class="fa-solid fa-share-nodes text-amber-300"></i> Copy Mời Lớp
              </button>
              <button type="button" id="btn-master-end-session" class="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer">
                <i class="fa-solid fa-stop"></i> Dừng Phòng Live & Xuất Thống Kê
              </button>
            </div>
          </div>
        </div>

        <!-- Main 2-Column Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- Cột Trái (8/12): Sân khấu Video, Sảnh Hàng Đợi & Thống Kê Mốc Câu Hỏi -->
          <div class="lg:col-span-8 space-y-4">
            
            <!-- Video Stage Card -->
            <div class="bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 relative group min-h-[420px] sm:min-h-[480px] flex items-center justify-center">
              <video id="live-master-video" src="${videoUrl}" playsinline preload="metadata" class="w-full h-full object-contain max-h-[540px]"></video>

              <!-- 1. SẢNH ĐỢI & HÀNG ĐỢI TRUY CẬP PHÒNG LIVE (HIỂN THỊ KHI CHƯA BẮT ĐẦU) -->
              <div id="master-waiting-lobby-overlay" class="${room.state === 'waiting' ? '' : 'hidden'} absolute inset-0 bg-gradient-to-br from-slate-950/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-md p-5 sm:p-7 flex flex-col justify-between z-20 overflow-y-auto">
                <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <span class="text-[11px] font-black uppercase tracking-widest text-amber-400 block">
                      🎟️ CỔNG TRUY CẬP & HÀNG ĐỢI PHÒNG LIVE
                    </span>
                    <h3 class="text-lg sm:text-xl font-black text-white mt-0.5">
                      Học sinh nhập mã bên dưới để vào Hàng Đợi
                    </h3>
                  </div>

                  <!-- Hộp Mã Phòng Khổng Lồ Cho Máy Chiếu -->
                  <div class="flex items-center gap-3 bg-white/10 border-2 border-amber-400/70 rounded-2xl px-4 py-2 shadow-lg">
                    <div>
                      <span class="text-[10px] font-bold uppercase text-amber-200 block">MÃ VÀO PHÒNG</span>
                      <span class="text-2xl sm:text-3xl font-black font-mono tracking-widest text-amber-300">${escapeHtml(room.roomId)}</span>
                    </div>
                  </div>
                </div>

                <!-- Khu vực Hàng Đợi Học Sinh Đang Chờ Vào -->
                <div class="my-4 flex-1 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span class="text-xs font-black text-white uppercase tracking-wider">
                        Hàng Đợi Học Sinh Đã Vào (<span id="master-lobby-queue-count">0</span> HS)
                      </span>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                      <label class="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 cursor-pointer">
                        <input type="checkbox" id="master-toggle-require-approval" ${room.requireApproval ? 'checked' : ''} class="rounded text-amber-500" />
                        <span>Duyệt thủ công từng HS vào phòng</span>
                      </label>
                      <button type="button" id="btn-master-admit-all" class="hidden px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black transition cursor-pointer">
                        <i class="fa-solid fa-check-double"></i> Duyệt Tất Cả
                      </button>
                    </div>
                  </div>

                  <div id="master-lobby-queue-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[210px] overflow-y-auto p-1">
                    <div class="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed border-white/15 rounded-2xl">
                      <i class="fa-solid fa-user-clock text-2xl mb-1.5 text-amber-400/80 block"></i>
                      Đang chờ học sinh nhập mã <strong>${escapeHtml(room.roomId)}</strong> để xếp hàng vào lớp...
                    </div>
                  </div>
                </div>

                <!-- Nút Bắt Đầu Chính Thức Cho Giáo Viên / Admin -->
                <div class="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p class="text-[11px] text-slate-300">
                    <i class="fa-solid fa-circle-info text-amber-400"></i> Video bài giảng đang khóa chờ. Chỉ khi Thầy/Cô bấm <strong>BẮT ĐẦU</strong> thì cả lớp mới bắt đầu xem!
                  </p>
                  <button type="button" id="btn-master-lobby-start" class="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2 transition transform hover:scale-[1.02] active:scale-95 cursor-pointer">
                    <i class="fa-solid fa-rocket"></i> BẮT ĐẦU PHÒNG LIVE NGAY
                  </button>
                </div>
              </div>

              <!-- 2. MÀN CHẮN CÂU HỎI & BẢNG THỐNG KÊ TẠI MỐC + TÍCH LŨY TÍNH ĐẾN MỐC ĐÓ -->
              <div id="master-question-active-overlay" class="absolute inset-0 bg-slate-950/95 backdrop-blur-md p-4 sm:p-6 flex flex-col justify-between hidden z-20 overflow-y-auto">
                <div class="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-3">
                  <div class="flex items-center gap-2">
                    <span class="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black border border-amber-500/30 flex items-center gap-1.5">
                      <i class="fa-solid fa-flag"></i> MỐC CÂU HỎI <span id="master-q-number">1</span> / <span>${room.totalQuestions || 1}</span>
                    </span>
                    <span id="master-q-time-badge" class="px-2.5 py-1 rounded-full bg-white/10 text-slate-300 text-[11px] font-mono">00:00</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-300 font-mono">Trạng thái:</span>
                    <span id="master-q-countdown" class="px-3 py-1 rounded-full bg-rose-600 text-white text-xs sm:text-sm font-black font-mono">20s</span>
                  </div>
                </div>

                <div class="w-full my-auto py-3 space-y-4">
                  <h3 id="master-q-text" class="text-sm sm:text-base font-bold text-white leading-relaxed text-center max-w-3xl mx-auto">
                    Đang tải câu hỏi...
                  </h3>

                  <!-- Biểu đồ Live Polling A-B-C-D theo thời gian thực -->
                  <div id="master-poll-bars" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <!-- Sẽ render động 4 cột A, B, C, D -->
                  </div>

                  <!-- KHUNG THỐNG KÊ SAU KHI MỞ ĐÁP ÁN: THỐNG KÊ TẠI MỐC NÀY & TÍCH LŨY TÍNH ĐẾN MỐC NÀY -->
                  <div id="master-milestone-stats-panel" class="hidden space-y-3 pt-2 border-t border-slate-800 text-left">
                    <!-- Sẽ được render động bởi renderMasterMilestoneStatsPanel -->
                  </div>
                </div>

                <div class="flex items-center justify-between gap-3 flex-wrap border-t border-slate-800 pt-3">
                  <div class="text-xs text-slate-300">
                    Đã trả lời mốc này: <strong id="master-q-submitted-count" class="text-emerald-400 font-black">0</strong>/<span id="master-q-total-students">0</span> học sinh
                  </div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <button type="button" id="btn-master-reveal-answer" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer">
                      <i class="fa-solid fa-chart-pie"></i> Khóa & Xem Thống Kê Mốc Này
                    </button>
                    <button type="button" id="btn-master-resume-video" class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-blue-600/30 hidden cursor-pointer">
                      <i class="fa-solid fa-play"></i> Tiếp Tục Bài Giảng
                    </button>
                    <button type="button" id="btn-master-finish-all-milestones" class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-lg hidden cursor-pointer">
                      <i class="fa-solid fa-trophy"></i> Xuất Thứ Hạng & Thống Kê Chung Cuộc
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
                    <i class="fa-solid fa-arrows-spin"></i> Điều khiển của Thầy/Cô đồng bộ tức thì tới toàn bộ học sinh
                  </span>
                  <span id="master-time-duration">00:00</span>
                </div>
                <div id="master-timeline-track" class="relative w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full cursor-pointer overflow-hidden border border-slate-200 dark:border-slate-700">
                  <div id="master-timeline-fill" class="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-rose-500 to-indigo-600 rounded-full w-0 transition-all duration-100"></div>
                  <div id="master-timeline-pins" class="absolute inset-0 pointer-events-none"></div>
                </div>
              </div>

              <!-- Control Buttons Bar: Bắt đầu / Tạm dừng / Tiếp tục / Dừng phòng / Chuyển mốc -->
              <div class="flex items-center justify-between gap-2.5 flex-wrap pt-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <button type="button" id="btn-master-play-pause" class="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer">
                    <i class="fa-solid fa-play"></i> BẮT ĐẦU PHÁT (CẢ LỚP CÙNG XEM)
                  </button>
                  <button type="button" id="btn-master-stop-room" class="px-3.5 py-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 text-rose-700 dark:text-rose-300 text-xs font-black transition flex items-center gap-1.5 cursor-pointer" title="Dừng hẳn phòng Live và xuất bảng xếp hạng">
                    <i class="fa-solid fa-stop"></i> Dừng Live
                  </button>
                  <button type="button" id="btn-master-rewind-10" class="px-3 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">
                    <i class="fa-solid fa-rotate-left"></i> -10s
                  </button>
                  <button type="button" id="btn-master-forward-10" class="px-3 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">
                    +10s <i class="fa-solid fa-rotate-right"></i>
                  </button>
                </div>

                <div class="flex items-center gap-2 flex-wrap">
                  <button type="button" id="btn-master-trigger-current-q" class="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition shadow-lg shadow-amber-500/25 flex items-center gap-1.5 cursor-pointer" title="Dừng video và mở câu hỏi mốc hiện tại">
                    <i class="fa-solid fa-circle-question"></i> Mở Mốc Câu Hỏi Ngay
                  </button>
                  <button type="button" id="btn-master-next-checkpoint" class="px-3.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition shadow-lg shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer" title="Tua nhanh tới mốc câu hỏi kế tiếp">
                    Tới Mốc Kế Tiếp <i class="fa-solid fa-forward-step"></i>
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Cột Phải (4/12): Hàng Đợi Điểm Danh & Thống Kê Lũy Kế Qua Các Mốc -->
          <div class="lg:col-span-4 space-y-4">
            
            <!-- Queue & Attendance Card -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></span>
                  <h4 class="font-black text-sm text-slate-800 dark:text-white">
                    HÀNG ĐỢI & SĨ SỐ PHÒNG LIVE
                  </h4>
                </div>
                <span id="master-online-counter" class="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-black text-xs font-mono">
                  0 học sinh
                </span>
              </div>

              <!-- Danh sách học sinh trong hàng đợi / đang học -->
              <div id="master-students-list" class="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                <div class="p-6 text-center text-xs text-slate-400">
                  <i class="fa-solid fa-users text-2xl mb-2 opacity-50 block"></i>
                  Chưa có học sinh nào trong hàng đợi.<br />
                  Thầy/Cô gửi mã <strong>${escapeHtml(room.roomId)}</strong> để học sinh truy cập nhé!
                </div>
              </div>
            </div>

            <!-- Bảng Tiến Độ Các Mốc & Xếp Hạng Tích Lũy -->
            <div class="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent rounded-3xl p-5 border border-amber-500/20 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="font-black text-xs text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i class="fa-solid fa-trophy"></i> XẾP HẠNG & THỐNG KÊ LŨY KẾ
                </h4>
                <span id="master-cumulative-progress-badge" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  0/${room.totalQuestions || 0} mốc
                </span>
              </div>
              <div id="master-mini-leaderboard" class="space-y-1.5 text-xs">
                <div class="text-center py-2 text-slate-400 text-[11px]">
                  Thống kê từng mốc và xếp hạng tích lũy sẽ cập nhật sau mỗi mốc câu hỏi.
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
  async openStudentCinemaStage(room) {
    this.isHost = false;
    this.activeRoom = room;

    if (window.App && typeof window.App.switchTab === 'function' && window.App.currentTab !== 'interactive-video') {
      await window.App.switchTab('interactive-video');
    }

    const container = document.getElementById('view-interactive-video');
    if (!container) return;
    container.classList.remove('hidden');

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

          <!-- 1. MÀN HÌNH HÀNG ĐỢI TRUY CẬP PHÒNG LIVE (WAITING QUEUE OVERLAY) -->
          <div id="student-waiting-overlay" class="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10 space-y-5 overflow-y-auto">
            <div class="w-20 h-20 rounded-3xl bg-rose-600/20 text-rose-400 border border-rose-500/30 flex items-center justify-center text-4xl shadow-inner animate-pulse">
              <i class="fa-solid fa-users-line"></i>
            </div>
            <div class="space-y-1.5 max-w-lg">
              <span class="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-black uppercase tracking-wider border border-amber-500/30">
                MÃ PHÒNG LIVE: ${escapeHtml(room.roomId)}
              </span>
              <h3 class="text-xl sm:text-2xl font-black text-white pt-1">
                Chào em, ${escapeHtml(this.studentInfo?.name || 'Học sinh')}!
              </h3>
              <p id="student-waiting-subtitle" class="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Em đang trong <strong>Hàng Đợi Truy Cập Phòng Live</strong>. Phiên học sẽ chỉ bắt đầu khi Thầy/Cô bấm nút <strong>BẮT ĐẦU</strong>!
              </p>
            </div>

            <!-- Thẻ Trạng Thái Hàng Đợi Của Học Sinh -->
            <div class="w-full max-w-md bg-white/5 border border-white/15 rounded-3xl p-4 space-y-3">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div class="p-2.5 rounded-2xl bg-white/5">
                  <span class="text-[10px] text-slate-400 block">STT Hàng Đợi</span>
                  <span id="student-queue-order-badge" class="text-lg font-black text-amber-400 font-mono">#${this.studentInfo?.queueOrder || 1}</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/5">
                  <span class="text-[10px] text-slate-400 block">Sĩ Số Đang Chờ</span>
                  <span id="student-queue-total-badge" class="text-lg font-black text-emerald-400 font-mono">1 HS</span>
                </div>
                <div class="p-2.5 rounded-2xl bg-white/5">
                  <span class="text-[10px] text-slate-400 block">Số Mốc Câu Hỏi</span>
                  <span class="text-lg font-black text-indigo-400 font-mono">${room.totalQuestions || 0} mốc</span>
                </div>
              </div>

              <div id="student-queue-approval-badge" class="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-2xl bg-emerald-500/15 text-xs font-bold text-emerald-300 border border-emerald-500/30 font-mono">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> ĐÃ VÀO HÀNG ĐỢI • CHỜ THẦY/CÔ BẤM BẮT ĐẦU
              </div>

              <!-- Danh sách các bạn đang cùng xếp hàng -->
              <div id="student-waiting-peers-list" class="flex items-center justify-center gap-1.5 flex-wrap max-h-20 overflow-y-auto pt-1"></div>
            </div>

            <button type="button" id="btn-student-ready-confirm" class="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm shadow-xl shadow-rose-600/30 flex items-center gap-2 transition hover:scale-105 active:scale-95 cursor-pointer">
              <i class="fa-solid fa-circle-check text-emerald-300"></i> BẤM XÁC NHẬN: EM ĐÃ SẴN SÀNG!
            </button>
          </div>

          <!-- 2. MÀN HÌNH TẠM DỪNG KHI GIÁO VIÊN BẤM PAUSE ĐỂ GIẢNG BÀI -->
          <div id="student-paused-overlay" class="hidden absolute top-16 left-1/2 -translate-x-1/2 z-30 px-5 py-3 rounded-2xl bg-amber-500/95 text-slate-950 font-black text-xs sm:text-sm shadow-2xl border-2 border-white/40 flex items-center gap-2.5 animate-pulse">
            <i class="fa-solid fa-circle-pause text-lg"></i>
            <span>THẦY/CÔ ĐANG TẠM DỪNG PHÒNG LIVE ĐỂ GIẢNG BÀI • CHỜ THẦY/CÔ TIẾP TỤC</span>
          </div>

          <!-- 3. POPUP CÂU HỎI MỐC DỪNG & THỐNG KÊ TẠI MỐC + TÍCH LŨY ĐẾN MỐC ĐÓ -->
          <div id="student-question-modal" class="absolute inset-0 bg-slate-950/95 backdrop-blur-xl p-4 sm:p-8 flex flex-col justify-between hidden z-40 animate-fadeIn overflow-y-auto">
            <!-- Header câu hỏi -->
            <div class="flex items-center justify-between max-w-4xl mx-auto w-full gap-2 flex-wrap">
              <span class="px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-600/40">
                <i class="fa-solid fa-flag"></i> MỐC CÂU HỎI <span id="student-q-number">1</span>/${room.totalQuestions || 1}
              </span>
              <div class="flex items-center gap-3">
                <span class="text-xs text-slate-400 font-medium">Thời gian còn lại:</span>
                <span id="student-q-countdown" class="px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 text-base font-black font-mono shadow-lg shadow-amber-500/30">
                  20s
                </span>
              </div>
            </div>

            <!-- Nội dung câu hỏi -->
            <div class="max-w-4xl mx-auto w-full my-auto py-4 space-y-5 text-center">
              <h2 id="student-q-text" class="text-base sm:text-xl md:text-2xl font-black text-white leading-snug">
                Nội dung câu hỏi đang tải...
              </h2>

              <!-- 4 Nút Lựa Chọn Khổng Lồ A, B, C, D -->
              <div id="student-options-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left pt-1">
                <button type="button" data-student-option="A" class="student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-rose-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">A</span>
                  <span class="student-opt-label flex-1">Phương án A</span>
                </button>
                <button type="button" data-student-option="B" class="student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-indigo-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">B</span>
                  <span class="student-opt-label flex-1">Phương án B</span>
                </button>
                <button type="button" data-student-option="C" class="student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm sm:text-base transition shadow-lg shadow-amber-500/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-black/20 text-slate-950 flex items-center justify-center font-black text-base shrink-0">C</span>
                  <span class="student-opt-label flex-1 text-slate-950 font-extrabold">Phương án C</span>
                </button>
                <button type="button" data-student-option="D" class="student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-sm sm:text-base transition shadow-lg shadow-emerald-600/25 flex items-center gap-3.5 border-2 border-transparent active:scale-[0.98]">
                  <span class="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center font-black text-base shrink-0">D</span>
                  <span class="student-opt-label flex-1">Phương án D</span>
                </button>
              </div>

              <!-- Trạng thái đã gửi đáp án -->
              <div id="student-submitted-banner" class="hidden p-3 rounded-2xl bg-white/10 text-emerald-400 font-bold text-xs sm:text-sm animate-pulse border border-emerald-500/30">
                <i class="fa-solid fa-circle-check"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô mở thống kê mốc này...
              </div>

              <!-- Kết quả câu hỏi & Thống kê tại mốc + Tích lũy đến mốc đó -->
              <div id="student-result-banner" class="hidden space-y-4 text-left">
                <div id="student-result-badge" class="p-4 rounded-2xl text-center font-black text-base sm:text-lg">
                  <!-- Thông báo Đúng/Sai -->
                </div>

                <!-- 1. Thống kê tại Mốc câu hỏi này của cả lớp -->
                <div class="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2.5">
                  <div class="text-xs text-slate-200 font-black flex items-center justify-between flex-wrap gap-2">
                    <span><i class="fa-solid fa-chart-column text-amber-400"></i> THỐNG KÊ TẠI MỐC NÀY:</span>
                    <span id="student-class-accuracy" class="text-emerald-400 font-mono font-bold"></span>
                  </div>
                  <div id="student-poll-bars-class" class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <!-- 4 cột poll -->
                  </div>
                </div>

                <!-- 2. Thống kê Tích Lũy Toàn Bộ Tính Cho Đến Mốc Này -->
                <div id="student-cumulative-stats-box" class="bg-indigo-950/50 rounded-2xl p-4 border border-indigo-500/30 space-y-2.5">
                  <!-- Render động bởi renderStudentQuestion -->
                </div>
              </div>
            </div>

            <!-- Footer trạng thái kết nối -->
            <div class="text-center text-xs text-slate-500 pb-1">
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

    // 3. Heartbeat điểm danh trực tuyến (Host mỗi 15 giây, Học sinh mỗi 8 giây)
    if (this.isHost) {
      this.heartbeatTimer = setInterval(async () => {
        try {
          await fetch(`${dbUrl}/live_video_rooms/${roomId}/hostLastSeen.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Date.now())
          });
        } catch (e) {}
      }, 15000);
    } else if (this.studentInfo) {
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
  // 6B. BỘ MÁY THỐNG KÊ TẠI TỪNG MỐC & LŨY KẾ TOÀN BỘ TÍNH ĐẾN MỐC ĐÓ
  // =========================================================================
  normalizeAnswerLetter(ans) {
    const raw = String(ans ?? '').trim().toUpperCase();
    const mapIdx = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '0': 'A' };
    return mapIdx[raw] || raw;
  },

  computeMilestoneStats(remote, upToQuestionIdx = null) {
    const checkpoints = Array.isArray(remote?.checkpoints) && remote.checkpoints.length > 0
      ? remote.checkpoints
      : (this.questionsList || []);
    const totalMilestones = checkpoints.length || Number(remote?.totalQuestions || 0);
    const studentsMap = remote?.students || {};
    const responsesAll = remote?.responses || {};

    // Xác định mốc hiện tại cần thống kê (0-based)
    let targetIdx = upToQuestionIdx;
    if (targetIdx === null || targetIdx === undefined) {
      if (remote?.currentQuestion?.index !== undefined) {
        targetIdx = Number(remote.currentQuestion.index);
      } else {
        const answeredIndices = Object.keys(responsesAll).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        targetIdx = answeredIndices.length > 0 ? Math.max(...answeredIndices) : Math.max(0, totalMilestones - 1);
      }
    }
    targetIdx = Math.max(0, Math.min(targetIdx, Math.max(0, totalMilestones - 1)));

    // Tập hợp toàn bộ học sinh (từ danh sách điểm danh + danh sách đã nộp đáp án)
    const allStudentUids = new Set(Object.keys(studentsMap));
    Object.values(responsesAll).forEach(qResp => {
      if (qResp && typeof qResp === 'object') {
        Object.keys(qResp).forEach(uid => allStudentUids.add(uid));
      }
    });

    const validUids = Array.from(allStudentUids).filter(uid => studentsMap[uid]?.queueStatus !== 'kicked');
    const totalStudents = validUids.length;

    // 1. Thống kê từng mốc từ Mốc 1 (index 0) đến Mốc hiện tại (targetIdx)
    const milestonesBreakdown = [];
    let cumulativeResponsesCount = 0;
    let cumulativeCorrectCount = 0;

    for (let mIdx = 0; mIdx <= targetIdx; mIdx++) {
      const cp = checkpoints[mIdx] || (mIdx === remote?.currentQuestion?.index ? remote.currentQuestion : { index: mIdx, question: `Mốc câu hỏi ${mIdx + 1}`, answer: 'A', sec: 0 });
      const correctLetter = this.normalizeAnswerLetter(cp.answer);
      const qResps = responsesAll[mIdx] || {};
      const entries = Object.values(qResps);
      const tally = { A: 0, B: 0, C: 0, D: 0 };
      let correctCount = 0;

      entries.forEach(r => {
        const sel = this.normalizeAnswerLetter(r.selected);
        if (tally[sel] !== undefined) tally[sel]++;
        const isRight = r.isCorrect !== undefined ? !!r.isCorrect : (sel === correctLetter);
        if (isRight) correctCount++;
      });

      const submittedCount = entries.length;
      const wrongCount = Math.max(0, submittedCount - correctCount);
      const unansweredCount = Math.max(0, totalStudents - submittedCount);
      const accuracyPct = submittedCount > 0 ? Math.round((correctCount / submittedCount) * 100) : 0;
      const classCoveragePct = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 100) : 0;

      cumulativeResponsesCount += submittedCount;
      cumulativeCorrectCount += correctCount;

      milestonesBreakdown.push({
        index: mIdx,
        number: mIdx + 1,
        sec: cp.sec || 0,
        question: cp.question || `Câu hỏi mốc ${mIdx + 1}`,
        answer: correctLetter,
        totalStudents,
        submittedCount,
        correctCount,
        wrongCount,
        unansweredCount,
        accuracyPct,
        classCoveragePct,
        participationPct: classCoveragePct,
        tally
      });
    }

    const currentMilestone = milestonesBreakdown[targetIdx] || milestonesBreakdown[milestonesBreakdown.length - 1] || {
      index: targetIdx,
      number: targetIdx + 1,
      sec: 0,
      question: '',
      answer: 'A',
      totalStudents,
      submittedCount: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: totalStudents,
      accuracyPct: 0,
      classCoveragePct: 0,
      participationPct: 0,
      tally: { A: 0, B: 0, C: 0, D: 0 }
    };

    // 2. Tính bảng xếp hạng & thống kê tích lũy của từng học sinh tính đến Mốc targetIdx
    const completedMilestonesCount = targetIdx + 1;
    const leaderboard = validUids.map(uid => {
      const sInfo = studentsMap[uid] || {};
      let correctUpToNow = 0;
      let answeredUpToNow = 0;
      let scoreUpToNow = 0;
      let totalTimestamp = 0;
      const milestoneResults = [];

      for (let mIdx = 0; mIdx <= targetIdx; mIdx++) {
        const cp = checkpoints[mIdx] || {};
        const correctLetter = this.normalizeAnswerLetter(cp.answer);
        const r = responsesAll[mIdx]?.[uid];
        if (r && r.selected) {
          const sel = this.normalizeAnswerLetter(r.selected);
          const isRight = r.isCorrect !== undefined ? !!r.isCorrect : (sel === correctLetter);
          const pts = isRight ? Number(r.pointsEarned || 100) : 0;
          answeredUpToNow++;
          if (isRight) {
            correctUpToNow++;
            scoreUpToNow += pts;
          }
          totalTimestamp += Number(r.timestamp || 0);
          milestoneResults.push({
            index: mIdx,
            number: mIdx + 1,
            answered: true,
            selected: sel,
            isCorrect: isRight,
            points: pts,
            timestamp: r.timestamp || 0
          });
        } else {
          milestoneResults.push({
            index: mIdx,
            number: mIdx + 1,
            answered: false,
            selected: null,
            isCorrect: false,
            points: 0,
            timestamp: Number.MAX_SAFE_INTEGER
          });
        }
      }

      const accuracyUpToNow = completedMilestonesCount > 0
        ? Math.round((correctUpToNow / completedMilestonesCount) * 100)
        : 0;
      const currentResult = milestoneResults[targetIdx] || { answered: false, selected: null, isCorrect: false, points: 0 };

      return {
        uid,
        name: sInfo.name || responsesAll[targetIdx]?.[uid]?.studentName || 'Học sinh',
        email: sInfo.email || '',
        className: sInfo.className || responsesAll[targetIdx]?.[uid]?.className || '',
        school: sInfo.school || responsesAll[targetIdx]?.[uid]?.school || '',
        queueOrder: sInfo.queueOrder || 999,
        queueStatus: sInfo.queueStatus || 'admitted',
        ready: !!sInfo.ready,
        correctUpToNow,
        answeredUpToNow,
        accuracyUpToNow,
        scoreUpToNow,
        totalTimestamp: totalTimestamp || Number.MAX_SAFE_INTEGER,
        milestoneResults,
        currentResult
      };
    }).sort((a, b) => {
      if (b.scoreUpToNow !== a.scoreUpToNow) return b.scoreUpToNow - a.scoreUpToNow;
      if (b.correctUpToNow !== a.correctUpToNow) return b.correctUpToNow - a.correctUpToNow;
      if (b.answeredUpToNow !== a.answeredUpToNow) return b.answeredUpToNow - a.answeredUpToNow;
      return a.totalTimestamp - b.totalTimestamp;
    }).map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));

    const overallAccuracyPct = cumulativeResponsesCount > 0
      ? Math.round((cumulativeCorrectCount / cumulativeResponsesCount) * 100)
      : 0;

    return {
      targetIdx,
      completedMilestonesCount,
      totalMilestones,
      totalStudents,
      currentMilestone,
      milestonesBreakdown,
      milestoneBreakdown: milestonesBreakdown,
      cumulativeResponsesCount,
      cumulativeCorrectCount,
      overallAccuracyPct,
      leaderboard,
      rankedStudents: leaderboard
    };
  },

  async admitStudent(roomId, uid) {
    if (!roomId || !uid) return;
    try {
      const dbUrl = this.getBaseDbUrl();
      await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}/queueStatus.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('admitted')
      });
    } catch (e) {}
  },

  async admitAllStudents(roomId) {
    if (!roomId || !this.remoteState?.students) return;
    try {
      const dbUrl = this.getBaseDbUrl();
      const updates = {};
      Object.keys(this.remoteState.students).forEach(uid => {
        if (this.remoteState.students[uid]?.queueStatus === 'pending') {
          updates[`${uid}/queueStatus`] = 'admitted';
        }
      });
      await Promise.all(
        Object.keys(this.remoteState.students).map(uid =>
          fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}/queueStatus.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify('admitted')
          })
        )
      );
    } catch (e) {}
  },

  async kickStudent(roomId, uid) {
    if (!roomId || !uid) return;
    try {
      const dbUrl = this.getBaseDbUrl();
      await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}.json`, {
        method: 'DELETE'
      });
    } catch (e) {}
  },

  // =========================================================================
  // 7. CẬP NHẬT GIAO DIỆN HỌC SINH THEO TÍN HIỆU ĐIỀU PHỐI CỦA GIÁO VIÊN
  // =========================================================================
  updateStudentUI(remote) {
    const video = document.getElementById('live-student-video');
    const waitingOverlay = document.getElementById('student-waiting-overlay');
    const pausedOverlay = document.getElementById('student-paused-overlay');
    const questionModal = document.getElementById('student-question-modal');

    if (!video) return;

    const myUid = this.studentInfo?.uid;
    const myRemoteStudent = myUid ? remote.students?.[myUid] : null;
    const allStudentsList = Object.values(remote.students || {}).sort((a, b) => (a.queueOrder || 999) - (b.queueOrder || 999));

    // Nếu học sinh đang ở trạng thái chờ duyệt trong hàng đợi (pending)
    const isPendingApproval = remote.requireApproval && myRemoteStudent && myRemoteStudent.queueStatus === 'pending';

    // 1. Trạng thái kết thúc buổi học
    if (remote.state === 'finished') {
      this.renderStudentEndSessionPodium(remote);
      return;
    }

    // 2. Cập nhật thông tin Hàng Đợi Truy Cập (Waiting Queue)
    if (remote.state === 'waiting' || isPendingApproval) {
      if (waitingOverlay) waitingOverlay.classList.remove('hidden');
      if (pausedOverlay) pausedOverlay.classList.add('hidden');
      if (questionModal) questionModal.classList.add('hidden');
      if (!video.paused) video.pause();

      const orderBadge = document.getElementById('student-queue-order-badge');
      const totalBadge = document.getElementById('student-queue-total-badge');
      const approvalBadge = document.getElementById('student-queue-approval-badge');
      const peersList = document.getElementById('student-waiting-peers-list');

      const myIndex = allStudentsList.findIndex(s => s.uid === myUid);
      const myOrder = myRemoteStudent?.queueOrder || (myIndex >= 0 ? myIndex + 1 : 1);
      if (orderBadge) orderBadge.textContent = `#${myOrder}`;
      if (totalBadge) totalBadge.textContent = `${allStudentsList.length} HS`;

      if (approvalBadge) {
        if (isPendingApproval) {
          approvalBadge.className = 'inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-2xl bg-amber-500/20 text-xs font-bold text-amber-300 border border-amber-500/40 font-mono';
          approvalBadge.innerHTML = '<i class="fa-solid fa-hourglass-half animate-spin"></i> ĐANG XẾP HÀNG CHỜ THẦY/CÔ DUYỆT VÀO LỚP...';
        } else {
          approvalBadge.className = 'inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-2xl bg-emerald-500/15 text-xs font-bold text-emerald-300 border border-emerald-500/30 font-mono';
          approvalBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> ĐÃ VÀO HÀNG ĐỢI • CHỜ THẦY/CÔ BẤM BẮT ĐẦU';
        }
      }

      if (peersList) {
        peersList.innerHTML = allStudentsList.slice(0, 18).map((s, idx) => `
          <span class="px-2.5 py-1 rounded-full ${s.uid === myUid ? 'bg-rose-600 text-white font-black' : 'bg-white/10 text-slate-200 font-semibold'} text-[11px] flex items-center gap-1">
            <span class="text-amber-300 font-mono">#${s.queueOrder || (idx + 1)}</span>
            <span>${escapeHtml(s.name)}</span>
            ${s.ready ? '<i class="fa-solid fa-circle-check text-emerald-400 text-[10px]"></i>' : ''}
          </span>
        `).join('');
      }
      return;
    } else {
      if (waitingOverlay) waitingOverlay.classList.add('hidden');
    }

    // 3. Trạng thái đang hỏi câu hỏi mốc dừng
    if (remote.state === 'question' && remote.currentQuestion) {
      if (!video.paused) video.pause();
      if (pausedOverlay) pausedOverlay.classList.add('hidden');
      this.renderStudentQuestion(remote.currentQuestion, remote.responses?.[remote.currentQuestion.index], remote);
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
      if (pausedOverlay) pausedOverlay.classList.add('hidden');
      const tapOverlay = document.getElementById('student-tap-play-overlay');
      if (tapOverlay && !video.paused) tapOverlay.remove();

      let expectedTime = Number(remote.currentTime || 0);
      if (remote.updatedAt) {
        const elapsedSec = (Date.now() - remote.updatedAt) / 1000;
        if (elapsedSec > 0 && elapsedSec < 1800) {
          expectedTime += elapsedSec;
        }
      }

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
      if (pausedOverlay) pausedOverlay.classList.remove('hidden');
      const targetTime = Number(remote.currentTime || 0);
      if (Math.abs(video.currentTime - targetTime) > 1.2) {
        video.currentTime = targetTime;
      }
    }
  },

  renderStudentQuestion(q, responsesForQ = {}, remote = null) {
    const modal = document.getElementById('student-question-modal');
    const qNumEl = document.getElementById('student-q-number');
    const qText = document.getElementById('student-q-text');
    const countdownEl = document.getElementById('student-q-countdown');
    const submittedBanner = document.getElementById('student-submitted-banner');
    const resultBanner = document.getElementById('student-result-banner');
    const resultBadge = document.getElementById('student-result-badge');
    const optionsGrid = document.getElementById('student-options-grid');
    if (!modal || !qText || !optionsGrid) return;

    modal.classList.remove('hidden');
    if (qNumEl) qNumEl.textContent = (q.index || 0) + 1;
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

      btn.disabled = !!(q.revealed || this.hasSubmittedCurrentQuestion);

      btn.onclick = () => {
        if (q.revealed || this.hasSubmittedCurrentQuestion) return;
        this.submitStudentAnswer(q.index, letter, q.answer);
      };
    });

    // Nếu Giáo viên đã công bố kết quả (Revealed) -> Hiển thị thống kê tại mốc này & thống kê lũy kế tính đến mốc này
    if (q.revealed) {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      if (countdownEl) {
        countdownEl.textContent = 'ĐÃ CHỐT MỐC';
        countdownEl.className = 'px-4 py-1.5 rounded-full bg-emerald-600 text-white text-sm font-black font-mono shadow-lg';
      }
      if (submittedBanner) submittedBanner.classList.add('hidden');
      if (resultBanner) resultBanner.classList.remove('hidden');

      const myAnswer = this.selectedAnswer || prevSub?.selected;
      const normAns = this.normalizeAnswerLetter(q.answer);
      const normMy = this.normalizeAnswerLetter(myAnswer);
      const isCorrect = (normMy && normMy === normAns);

      if (resultBadge) {
        if (isCorrect) {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-xl sm:text-2xl mb-1">🎉 CHÍNH XÁC! (+100 ĐIỂM MỐC #${(q.index || 0) + 1})</div>
            <div class="text-xs font-medium text-emerald-200">Em đã chọn đúng đáp án <strong>${escapeHtml(normAns)}</strong>. Giỏi lắm!</div>
          `;
          if (typeof window.confetti === 'function' && !this.confettiPlayedForQ) {
            this.confettiPlayedForQ = true;
            window.confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
          }
        } else if (myAnswer) {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-rose-600/30 text-rose-300 border border-rose-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-xl sm:text-2xl mb-1">❌ CHƯA CHÍNH XÁC</div>
            <div class="text-xs font-medium text-rose-200">Em chọn ${escapeHtml(normMy)} • Đáp án đúng của Mốc #${(q.index || 0) + 1} là <strong>${escapeHtml(normAns)}</strong>.</div>
          `;
        } else {
          resultBadge.className = 'p-4 rounded-2xl text-center font-black text-base sm:text-lg bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-xl';
          resultBadge.innerHTML = `
            <div class="text-xl sm:text-2xl mb-1">⏰ CHƯA KỊP TRẢ LỜI MỐC #${(q.index || 0) + 1}</div>
            <div class="text-xs font-medium text-amber-200">Đáp án đúng là <strong>${escapeHtml(normAns)}</strong>. Hãy sẵn sàng ở mốc tiếp theo nhé!</div>
          `;
        }
      }

      // Tô sáng nút đúng và mờ nút sai
      optionBtns.forEach(btn => {
        const letter = btn.getAttribute('data-student-option');
        btn.disabled = true;
        if (letter === normAns) {
          btn.className = 'student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-sm sm:text-base flex items-center gap-3.5 border-4 border-emerald-300 shadow-2xl scale-[1.01]';
        } else if (letter === normMy) {
          btn.className = 'student-opt-btn p-4 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 text-white font-bold text-sm sm:text-base flex items-center gap-3.5 border-2 border-rose-400 opacity-60';
        } else {
          btn.className = 'student-opt-btn p-4 rounded-2xl bg-slate-800 text-slate-400 font-bold text-sm sm:text-base flex items-center gap-3.5 opacity-30';
        }
      });

      // Tính thống kê tại mốc này & tích lũy đến mốc này
      const stats = this.computeMilestoneStats(remote || this.remoteState || this.activeRoom, q.index);
      const classAccEl = document.getElementById('student-class-accuracy');
      if (classAccEl) {
        classAccEl.textContent = `Đúng: ${stats.currentMilestone.correctCount}/${stats.currentMilestone.submittedCount} bạn (${stats.currentMilestone.accuracyPct}%)`;
      }

      // 1. Hiển thị phổ bình chọn tại mốc này
      this.renderLivePollChart('student-poll-bars-class', responsesForQ, normAns);

      // 2. Hiển thị thống kê tích lũy từ Mốc 1 đến Mốc hiện tại
      const cumBox = document.getElementById('student-cumulative-stats-box');
      if (cumBox) {
        const myEntry = stats.leaderboard.find(s => s.uid === myUid) || {
          rank: '-',
          correctUpToNow: 0,
          accuracyUpToNow: 0,
          scoreUpToNow: 0,
          milestoneResults: []
        };
        const top3 = stats.leaderboard.slice(0, 3);
        cumBox.innerHTML = `
          <div class="flex items-center justify-between flex-wrap gap-2 border-b border-indigo-400/20 pb-2">
            <span class="text-xs font-black text-indigo-300 uppercase flex items-center gap-1.5">
              <i class="fa-solid fa-layer-group"></i> LŨY KẾ TỪ MỐC 1 ➔ MỐC #${stats.completedMilestonesCount} (${stats.completedMilestonesCount}/${stats.totalMilestones} MỐC)
            </span>
            <span class="text-xs font-mono font-bold text-amber-300">
              Cả lớp đúng TB: ${stats.overallAccuracyPct}%
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center pt-1">
            <div class="p-2 rounded-xl bg-white/5 border border-white/10">
              <span class="text-[10px] text-slate-400 block">Hạng Của Em</span>
              <span class="text-base font-black text-amber-400 font-mono">#${myEntry.rank}/${stats.totalStudents || 1}</span>
            </div>
            <div class="p-2 rounded-xl bg-white/5 border border-white/10">
              <span class="text-[10px] text-slate-400 block">Lũy Kế Đúng</span>
              <span class="text-base font-black text-emerald-400 font-mono">${myEntry.correctUpToNow}/${stats.completedMilestonesCount} (${myEntry.accuracyUpToNow}%)</span>
            </div>
            <div class="p-2 rounded-xl bg-white/5 border border-white/10">
              <span class="text-[10px] text-slate-400 block">Tổng Điểm</span>
              <span class="text-base font-black text-rose-400 font-mono">${myEntry.scoreUpToNow}đ</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap pt-1">
            <span class="text-[11px] text-slate-400 font-bold">Chuỗi mốc của em:</span>
            ${(myEntry.milestoneResults || []).map(mr => `
              <span class="px-2 py-0.5 rounded-lg text-[10px] font-black ${mr.isCorrect ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (mr.answered ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-800 text-slate-400')}">
                M${mr.number}: ${mr.isCorrect ? '✅' : (mr.answered ? '❌' : '➖')}
              </span>
            `).join('')}
          </div>

          ${top3.length > 0 ? `
            <div class="pt-1 border-t border-white/10 flex items-center gap-2 flex-wrap text-[11px]">
              <span class="text-amber-300 font-bold"><i class="fa-solid fa-crown"></i> Top dẫn đầu đến Mốc #${stats.completedMilestonesCount}:</span>
              ${top3.map((st, i) => `
                <span class="px-2 py-0.5 rounded-full bg-white/10 text-white font-bold">
                  ${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${escapeHtml(st.name)} (${st.correctUpToNow}/${stats.completedMilestonesCount} • ${st.scoreUpToNow}đ)
                </span>
              `).join('')}
            </div>
          ` : ''}
        `;
      }
    } else {
      // Chưa công bố kết quả
      this.confettiPlayedForQ = false;
      if (resultBanner) resultBanner.classList.add('hidden');

      if (this.hasSubmittedCurrentQuestion) {
        if (submittedBanner) {
          submittedBanner.classList.remove('hidden');
          submittedBanner.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô mở thống kê mốc này...';
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

    const normAns = this.normalizeAnswerLetter(correctAnswer);
    const normSel = this.normalizeAnswerLetter(selectedOption);
    const isCorrect = (normSel === normAns);

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
      banner.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã ghi nhận đáp án của em! Đang chờ Thầy/Cô mở thống kê mốc này...';
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

      // Đồng bộ lại tổng điểm tích lũy chính xác từ tất cả các mốc đã trả lời
      if (!this.remoteState) this.remoteState = { ...(this.activeRoom || {}) };
      if (!this.remoteState.responses) this.remoteState.responses = {};
      if (!this.remoteState.responses[qIndex]) this.remoteState.responses[qIndex] = {};
      this.remoteState.responses[qIndex][uid] = responsePayload;

      let totalCorrect = 0;
      Object.values(this.remoteState.responses).forEach(qResp => {
        if (qResp && qResp[uid] && qResp[uid].isCorrect) {
          totalCorrect++;
        }
      });
      const totalScore = totalCorrect * 100;
      this.studentInfo.score = totalScore;
      this.studentInfo.correctCount = totalCorrect;

      await fetch(`${dbUrl}/live_video_rooms/${roomId}/students/${uid}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: totalScore, correctCount: totalCorrect, lastSeen: Date.now() })
      });
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
    const waitingLobbyOverlay = document.getElementById('master-waiting-lobby-overlay');
    const lobbyQueueCount = document.getElementById('master-lobby-queue-count');
    const lobbyQueueList = document.getElementById('master-lobby-queue-list');
    const btnAdmitAll = document.getElementById('btn-master-admit-all');
    const questionOverlay = document.getElementById('master-question-active-overlay');
    const btnPlay = document.getElementById('btn-master-play-pause');
    const btnHeaderStartPause = document.getElementById('btn-master-header-start-pause');
    const stateBadge = document.getElementById('master-room-state-badge');

    // Nếu phòng đã chuyển sang finished -> Hiển thị báo cáo tổng kết
    if (remote.state === 'finished') {
      this.renderMasterEndSessionReport(remote);
      return;
    }

    // 1. Cập nhật Badge Trạng thái Phòng trên Header
    if (stateBadge) {
      if (remote.state === 'waiting') {
        stateBadge.className = 'px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg';
        stateBadge.innerHTML = '<i class="fa-solid fa-users-line"></i> ĐANG MỞ HÀNG ĐỢI PHÒNG CHỜ';
      } else if (remote.state === 'playing') {
        stateBadge.className = 'px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg animate-pulse';
        stateBadge.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> ĐANG PHÁT TRỰC TIẾP';
      } else if (remote.state === 'paused') {
        stateBadge.className = 'px-3 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg';
        stateBadge.innerHTML = '<i class="fa-solid fa-pause"></i> ĐANG TẠM DỪNG GIẢNG BÀI';
      } else if (remote.state === 'question') {
        stateBadge.className = 'px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg animate-bounce';
        stateBadge.innerHTML = `<i class="fa-solid fa-flag"></i> ĐANG Ở MỐC CÂU HỎI #${(remote.currentQuestion?.index || 0) + 1}`;
      }
    }

    // 2. Cập nhật Hàng Đợi & Danh sách Học sinh
    const students = remote.students || {};
    const studentEntries = Object.values(students)
      .filter(s => s && s.queueStatus !== 'kicked')
      .sort((a, b) => (a.queueOrder || 999) - (b.queueOrder || 999));
    const now = Date.now();
    const activeStudents = studentEntries.filter(s => (now - (s.lastSeen || s.joinedAt || 0)) < 60000);
    const pendingStudents = studentEntries.filter(s => s.queueStatus === 'pending');

    if (onlineCounter) {
      onlineCounter.textContent = `${studentEntries.length} HS (${activeStudents.length} online)`;
    }

    // 2a. Hiển thị / Ẩn Sảnh Chờ Hàng Đợi (Waiting Queue Lobby)
    if (waitingLobbyOverlay) {
      if (remote.state === 'waiting') {
        waitingLobbyOverlay.classList.remove('hidden');
        if (video && !video.paused) video.pause();
      } else {
        waitingLobbyOverlay.classList.add('hidden');
      }
    }

    if (lobbyQueueCount) {
      lobbyQueueCount.textContent = studentEntries.length;
    }

    if (btnAdmitAll) {
      if (pendingStudents.length > 0) {
        btnAdmitAll.classList.remove('hidden');
        btnAdmitAll.innerHTML = `<i class="fa-solid fa-check-double"></i> Duyệt Tất Cả (${pendingStudents.length})`;
      } else {
        btnAdmitAll.classList.add('hidden');
      }
    }

    const btnLobbyStart = document.getElementById('btn-master-lobby-start');
    if (btnLobbyStart) {
      btnLobbyStart.innerHTML = `<i class="fa-solid fa-rocket"></i> BẮT ĐẦU PHÒNG LIVE NGAY (${studentEntries.length} HS)`;
    }

    if (lobbyQueueList && remote.state === 'waiting') {
      if (studentEntries.length === 0) {
        lobbyQueueList.innerHTML = `
          <div class="col-span-full py-8 text-center text-slate-400 text-xs border border-dashed border-white/15 rounded-2xl">
            <i class="fa-solid fa-user-clock text-2xl mb-1.5 text-amber-400/80 block"></i>
            Đang chờ học sinh nhập mã <strong>${escapeHtml(remote.roomId)}</strong> để xếp hàng vào lớp...
          </div>
        `;
      } else {
        lobbyQueueList.innerHTML = studentEntries.map((s, idx) => {
          const isPending = s.queueStatus === 'pending';
          return `
            <div class="p-2.5 rounded-2xl ${isPending ? 'bg-amber-500/15 border border-amber-400/50' : 'bg-white/10 border border-white/15'} flex items-center justify-between gap-2 text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black font-mono text-[11px] flex items-center justify-center shrink-0">
                  #${s.queueOrder || (idx + 1)}
                </span>
                <div class="min-w-0">
                  <div class="font-bold text-white truncate">${escapeHtml(s.name)}</div>
                  <div class="text-[10px] text-slate-300 flex items-center gap-1">
                    <span>${escapeHtml(s.className || 'HS')}</span>
                    <span>•</span>
                    ${isPending
                      ? '<span class="text-amber-300 font-bold">⏳ Chờ duyệt</span>'
                      : (s.ready ? '<span class="text-emerald-300 font-bold">✅ Sẵn sàng</span>' : '<span class="text-cyan-300">Đang đợi</span>')}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                ${isPending ? `
                  <button type="button" data-admit-uid="${escapeHtml(s.uid)}" class="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] cursor-pointer">
                    Duyệt
                  </button>
                ` : ''}
                <button type="button" data-kick-uid="${escapeHtml(s.uid)}" class="w-6 h-6 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[10px] flex items-center justify-center cursor-pointer" title="Mời ra khỏi hàng đợi">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');

        lobbyQueueList.querySelectorAll('[data-admit-uid]').forEach(btn => {
          btn.onclick = () => this.admitStudent(remote.roomId, btn.getAttribute('data-admit-uid'));
        });
        lobbyQueueList.querySelectorAll('[data-kick-uid]').forEach(btn => {
          btn.onclick = () => this.kickStudent(remote.roomId, btn.getAttribute('data-kick-uid'));
        });
      }
    }

    // 2b. Danh sách học sinh bên cột phải
    if (studentsList) {
      if (studentEntries.length === 0) {
        studentsList.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400">
            <i class="fa-solid fa-users text-2xl mb-2 opacity-50 block"></i>
            Chưa có học sinh nào trong hàng đợi.<br />
            Thầy/Cô gửi mã <strong>${escapeHtml(remote.roomId)}</strong> để học sinh tham gia nhé!
          </div>
        `;
      } else {
        studentsList.innerHTML = studentEntries.map((s, idx) => {
          const isOnline = (now - (s.lastSeen || s.joinedAt || 0)) < 30000;
          const isPending = s.queueStatus === 'pending';
          return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                  #${s.queueOrder || (idx + 1)}
                </span>
                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'} shrink-0"></span>
                <span class="font-bold text-slate-800 dark:text-white truncate">${escapeHtml(s.name)}</span>
                <span class="text-[10px] text-slate-400">(${escapeHtml(s.className || 'HS')})</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${isPending ? `
                  <button type="button" data-side-admit-uid="${escapeHtml(s.uid)}" class="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[10px] cursor-pointer">Duyệt</button>
                ` : `
                  <span class="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 font-black text-[11px] font-mono">
                    ${s.score || 0}đ
                  </span>
                `}
              </div>
            </div>
          `;
        }).join('');

        studentsList.querySelectorAll('[data-side-admit-uid]').forEach(btn => {
          btn.onclick = () => this.admitStudent(remote.roomId, btn.getAttribute('data-side-admit-uid'));
        });
      }
    }

    // 3. Cập nhật Bảng Xếp Hạng & Thống Kê Lũy Kế bên phải
    const answeredMilestoneIndices = Object.keys(remote.responses || {}).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
    const latestMilestoneIdx = remote.currentQuestion?.index !== undefined
      ? Number(remote.currentQuestion.index)
      : (answeredMilestoneIndices.length > 0 ? Math.max(...answeredMilestoneIndices) : -1);

    const progressBadge = document.getElementById('master-cumulative-progress-badge');
    if (progressBadge) {
      const doneCount = latestMilestoneIdx >= 0 ? (latestMilestoneIdx + 1) : 0;
      progressBadge.textContent = `${doneCount}/${remote.totalQuestions || 0} mốc`;
    }

    const miniLeaderboard = document.getElementById('master-mini-leaderboard');
    if (miniLeaderboard) {
      if (latestMilestoneIdx >= 0 && studentEntries.length > 0) {
        const cumStats = this.computeMilestoneStats(remote, latestMilestoneIdx);
        const top5 = cumStats.leaderboard.slice(0, 6);
        miniLeaderboard.innerHTML = `
          <div class="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-[11px] mb-1.5">
            <span class="font-bold text-slate-700 dark:text-slate-300">Tỷ lệ đúng lũy kế (M1➔M${cumStats.completedMilestonesCount}):</span>
            <strong class="font-mono font-black text-emerald-600 dark:text-emerald-400">${cumStats.overallAccuracyPct}%</strong>
          </div>
          ${top5.map((s, idx) => {
            const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`));
            return `
              <div class="flex items-center justify-between p-1.5 rounded-lg bg-white/60 dark:bg-slate-800/60 border border-amber-500/10 text-xs">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="font-bold">${medal}</span>
                  <span class="font-bold truncate text-slate-800 dark:text-slate-200">${escapeHtml(s.name)}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 font-mono">
                  <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">${s.correctUpToNow}/${cumStats.completedMilestonesCount} đúng</span>
                  <span class="font-black text-amber-600 dark:text-amber-400">${s.scoreUpToNow}đ</span>
                </div>
              </div>
            `;
          }).join('')}
        `;
      }
    }

    // 4. Cập nhật Question Overlay & Bảng Thống Kê Tại Mốc + Tích Lũy Tính Đến Mốc Đó
    if (remote.state === 'question' && remote.currentQuestion) {
      if (questionOverlay) questionOverlay.classList.remove('hidden');
      const q = remote.currentQuestion;
      const responses = remote.responses?.[q.index] || {};
      const submittedCount = Object.keys(responses).length;
      const totalCheckpoints = Number(remote.totalQuestions || this.questionsList.length || 1);

      const qNumEl = document.getElementById('master-q-number');
      const qTimeBadge = document.getElementById('master-q-time-badge');
      const qTextEl = document.getElementById('master-q-text');
      const subCountEl = document.getElementById('master-q-submitted-count');
      const totStudEl = document.getElementById('master-q-total-students');

      if (qNumEl) qNumEl.textContent = (q.index + 1);
      if (qTimeBadge) qTimeBadge.textContent = `Mốc dừng: ${this.formatTime(q.sec || 0)}`;
      if (qTextEl) qTextEl.textContent = q.question;
      if (subCountEl) subCountEl.textContent = submittedCount;
      if (totStudEl) totStudEl.textContent = studentEntries.length;

      // Khởi động đồng hồ đếm ngược trên máy Thầy Cô nếu chưa chạy
      if (this.activeQuestionIdx !== q.index || !this.countdownInterval) {
        this.activeQuestionIdx = q.index;
        this.startQuestionCountdown(q);
      }

      const normAns = this.normalizeAnswerLetter(q.answer);
      this.renderLivePollChart('master-poll-bars', responses, q.revealed ? normAns : null);

      const btnReveal = document.getElementById('btn-master-reveal-answer');
      const btnResume = document.getElementById('btn-master-resume-video');
      const btnFinishAll = document.getElementById('btn-master-finish-all-milestones');
      const statsPanel = document.getElementById('master-milestone-stats-panel');

      if (q.revealed) {
        if (btnReveal) btnReveal.classList.add('hidden');
        if (btnResume) btnResume.classList.remove('hidden');
        const isLastMilestone = (q.index + 1) >= totalCheckpoints;
        if (btnFinishAll) {
          btnFinishAll.classList.toggle('hidden', !isLastMilestone);
        }
        if (statsPanel) {
          statsPanel.classList.remove('hidden');
          this.renderMasterMilestoneStatsPanel(statsPanel, remote, q.index);
        }
      } else {
        if (btnReveal) btnReveal.classList.remove('hidden');
        if (btnResume) btnResume.classList.add('hidden');
        if (btnFinishAll) btnFinishAll.classList.add('hidden');
        if (statsPanel) statsPanel.classList.add('hidden');
      }
    } else {
      if (questionOverlay) questionOverlay.classList.add('hidden');
      if (this.isHost && this.countdownInterval && remote.state !== 'question') {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }

    // 5. Cập nhật nút Play/Pause ở cả Header và Thanh Điều Khiển
    if (btnPlay) {
      if (remote.state === 'playing') {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition shadow-lg shadow-amber-600/30 flex items-center gap-2 cursor-pointer';
        btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i> TẠM DỪNG PHÒNG LIVE (ĐỂ GIẢNG BÀI)';
      } else if (remote.state === 'paused') {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer';
        btnPlay.innerHTML = '<i class="fa-solid fa-play"></i> TIẾP TỤC PHÁT (CHO CẢ LỚP XEM)';
      } else {
        btnPlay.className = 'px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer';
        btnPlay.innerHTML = '<i class="fa-solid fa-play"></i> BẮT ĐẦU PHÒNG LIVE (CẢ LỚP CÙNG XEM)';
      }
    }

    if (btnHeaderStartPause) {
      if (remote.state === 'playing') {
        btnHeaderStartPause.className = 'px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition flex items-center gap-2 shadow-lg cursor-pointer';
        btnHeaderStartPause.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm Dừng Live';
      } else if (remote.state === 'paused') {
        btnHeaderStartPause.className = 'px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-2 shadow-lg cursor-pointer';
        btnHeaderStartPause.innerHTML = '<i class="fa-solid fa-play"></i> Tiếp Tục Live';
      } else {
        btnHeaderStartPause.className = 'px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-2 shadow-lg cursor-pointer';
        btnHeaderStartPause.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Phòng Live';
      }
    }
  },

  renderMasterMilestoneStatsPanel(panelEl, remote, qIdx) {
    if (!panelEl) return;
    const stats = this.computeMilestoneStats(remote, qIdx);
    const cur = stats.currentMilestone;
    const topRows = stats.leaderboard.slice(0, 8);

    panelEl.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- KHỐI 1: THỐNG KÊ TẠI MỐC CÂU HỎI NÀY (MỐC #${cur.number}) -->
        <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-emerald-400 uppercase flex items-center gap-1.5">
              <i class="fa-solid fa-bullseye"></i> 1. THỐNG KÊ TẠI MỐC #${cur.number} (${this.formatTime(cur.sec)})
            </span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
              Đáp án đúng: ${escapeHtml(cur.answer)}
            </span>
          </div>

          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="p-2 rounded-xl bg-white/5">
              <span class="text-[10px] text-slate-400 block">Đã Nộp</span>
              <span class="text-sm font-black text-white font-mono">${cur.submittedCount}/${cur.totalStudents}</span>
            </div>
            <div class="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
              <span class="text-[10px] text-emerald-300 block">Làm Đúng</span>
              <span class="text-sm font-black text-emerald-400 font-mono">${cur.correctCount} (${cur.accuracyPct}%)</span>
            </div>
            <div class="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
              <span class="text-[10px] text-rose-300 block">Làm Sai</span>
              <span class="text-sm font-black text-rose-400 font-mono">${cur.wrongCount}</span>
            </div>
            <div class="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
              <span class="text-[10px] text-amber-300 block">Chưa Nộp</span>
              <span class="text-sm font-black text-amber-400 font-mono">${cur.unansweredCount}</span>
            </div>
          </div>

          <div class="text-[11px] text-slate-300">
            <span class="font-bold text-slate-400">Tiến độ qua các mốc đã làm:</span>
            <div class="flex items-center gap-1.5 flex-wrap mt-1">
              ${stats.milestonesBreakdown.map(m => `
                <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold ${m.index === qIdx ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/10 text-slate-200'}">
                  Mốc #${m.number}: ${m.correctCount}/${m.submittedCount} đúng (${m.accuracyPct}%)
                </span>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- KHỐI 2: THỐNG KÊ TÍCH LŨY TOÀN BỘ TÍNH CHO ĐẾN MỐC #${cur.number} -->
        <div class="p-3.5 rounded-2xl bg-slate-900/90 border border-indigo-500/30 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-indigo-300 uppercase flex items-center gap-1.5">
              <i class="fa-solid fa-ranking-star"></i> 2. LŨY KẾ TỪ MỐC 1 ➔ MỐC #${cur.number} (${stats.completedMilestonesCount}/${stats.totalMilestones} MỐC)
            </span>
            <span class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 text-[10px] font-black font-mono">
              Đúng TB Lũy Kế: ${stats.overallAccuracyPct}%
            </span>
          </div>

          <div class="max-h-32 overflow-y-auto space-y-1 pr-1">
            ${topRows.length === 0 ? `
              <div class="text-center py-4 text-xs text-slate-400">Chưa có dữ liệu xếp hạng học sinh.</div>
            ` : topRows.map(s => `
              <div class="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 text-xs gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-black font-mono ${s.rank <= 3 ? 'text-amber-400' : 'text-slate-400'}">#${s.rank}</span>
                  <span class="font-bold text-white truncate">${escapeHtml(s.name)}</span>
                  <div class="hidden sm:flex items-center gap-0.5">
                    ${s.milestoneResults.map(mr => `
                      <span class="text-[9px]" title="Mốc ${mr.number}">${mr.isCorrect ? '✅' : (mr.answered ? '❌' : '➖')}</span>
                    `).join('')}
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span class="text-emerald-400 font-bold">${s.correctUpToNow}/${stats.completedMilestonesCount} (${s.accuracyUpToNow}%)</span>
                  <span class="text-amber-300 font-black">${s.scoreUpToNow}đ</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
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
      const opt = this.normalizeAnswerLetter(r.selected || '');
      if (tally[opt] !== undefined) tally[opt]++;
    });

    const normCorrect = correctAnswer ? this.normalizeAnswerLetter(correctAnswer) : null;
    const colors = {
      A: { bar: 'from-rose-500 to-rose-600', text: 'text-rose-400' },
      B: { bar: 'from-blue-500 to-indigo-600', text: 'text-blue-400' },
      C: { bar: 'from-amber-400 to-amber-500', text: 'text-amber-400' },
      D: { bar: 'from-emerald-500 to-teal-600', text: 'text-emerald-400' }
    };

    container.innerHTML = ['A', 'B', 'C', 'D'].map(opt => {
      const count = tally[opt] || 0;
      const pct = list.length > 0 ? Math.round((count / list.length) * 100) : 0;
      const isCorrect = Boolean(normCorrect && opt === normCorrect);

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
  // 10. BỤC VINH DANH PODIUM TOP 1-2-3 & TỔNG KẾT TIẾT HỌC (HỌC SINH)
  // =========================================================================
  renderStudentEndSessionPodium(remote) {
    const cinema = document.getElementById('live-student-cinema');
    if (!cinema) return;

    const totalQ = remote.totalQuestions || (remote.checkpoints || []).length || 1;
    const stats = this.computeMilestoneStats(remote, Math.max(0, totalQ - 1));
    const students = stats.rankedStudents;
    const myUid = this.studentInfo?.uid;
    const myRankIdx = students.findIndex(s => s.uid === myUid);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : '-';
    const myRecord = myRankIdx >= 0 ? students[myRankIdx] : this.studentInfo;

    const top1 = students[0];
    const top2 = students[1];
    const top3 = students[2];

    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
    }

    cinema.innerHTML = `
      <div class="min-h-screen bg-slate-950 text-white p-4 sm:p-8 flex flex-col items-center justify-start space-y-6 animate-fadeIn overflow-y-auto">
        
        <div class="text-center space-y-2 max-w-2xl pt-2">
          <span class="px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider border border-amber-500/30">
            <i class="fa-solid fa-trophy"></i> TỔNG KẾT THỨ HẠNG & THỐNG KÊ TOÀN BỘ ${stats.totalMilestones} MỐC CÂU HỎI
          </span>
          <h2 class="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Vinh Danh Học Sinh Xuất Sắc!
          </h2>
          <p class="text-xs sm:text-sm text-slate-300">
            ${escapeHtml(remote.title || remote.lessonTitle || '')} • Lớp: ${escapeHtml(remote.className || 'Tất cả')} • Mã phòng: <span class="font-mono font-bold text-amber-300">${escapeHtml(remote.roomId || '')}</span>
          </p>
        </div>

        <!-- 3D Podium Top 1-2-3 -->
        <div class="flex items-end justify-center gap-3 sm:gap-6 pt-2 max-w-2xl w-full">
          
          <!-- Hạng 2 -->
          <div class="flex-1 flex flex-col items-center space-y-2">
            <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-800 border-2 border-slate-300 flex items-center justify-center text-xl sm:text-2xl shadow-xl">
              🥈
            </div>
            <div class="text-center">
              <div class="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[100px] sm:max-w-[140px]">
                ${escapeHtml(top2?.name || '---')}
              </div>
              <div class="text-xs font-mono font-black text-amber-400">${top2?.scoreUpToNow ?? top2?.score ?? 0}đ (${top2?.correctUpToNow ?? 0}/${stats.totalMilestones})</div>
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
                ${escapeHtml(top1?.name || '---')}
              </div>
              <div class="text-sm font-mono font-black text-amber-400">${top1?.scoreUpToNow ?? top1?.score ?? 0}đ (${top1?.correctUpToNow ?? 0}/${stats.totalMilestones})</div>
            </div>
            <div class="w-full h-36 sm:h-44 bg-gradient-to-t from-amber-600 to-amber-500 rounded-t-2xl flex items-center justify-center font-black text-2xl text-slate-950 shadow-2xl">
              1
            </div>
          </div>

          <!-- Hạng 3 -->
          <div class="flex-1 flex flex-col items-center space-y-2">
            <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-orange-950 border-2 border-amber-700 flex items-center justify-center text-xl sm:text-2xl shadow-xl">
              🥉
            </div>
            <div class="text-center">
              <div class="font-bold text-xs sm:text-sm text-slate-200 truncate max-w-[100px] sm:max-w-[140px]">
                ${escapeHtml(top3?.name || '---')}
              </div>
              <div class="text-xs font-mono font-black text-amber-400">${top3?.scoreUpToNow ?? top3?.score ?? 0}đ (${top3?.correctUpToNow ?? 0}/${stats.totalMilestones})</div>
            </div>
            <div class="w-full h-20 sm:h-24 bg-gradient-to-t from-orange-900 to-orange-800 rounded-t-2xl flex items-center justify-center font-black text-xl text-amber-200">
              3
            </div>
          </div>

        </div>

        <!-- Thẻ Thành Tích Cá Nhân Của Học Sinh Này -->
        <div class="max-w-3xl w-full bg-white/10 backdrop-blur-md rounded-3xl p-5 border border-white/20 space-y-4">
          <div class="text-xs text-amber-300 font-black uppercase tracking-wider text-center">
            <i class="fa-solid fa-medal"></i> THÀNH TÍCH CÁ NHÂN CỦA EM QUA ${stats.totalMilestones} MỐC CÂU HỎI
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div class="p-3 rounded-2xl bg-slate-900/70 border border-white/10">
              <div class="text-[11px] text-slate-400">Thứ hạng chung cuộc</div>
              <div class="text-xl sm:text-2xl font-black text-amber-400">#${myRank}/${students.length || 1}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-900/70 border border-white/10">
              <div class="text-[11px] text-slate-400">Số mốc làm đúng</div>
              <div class="text-xl sm:text-2xl font-black text-emerald-400">${myRecord?.correctUpToNow ?? myRecord?.correctCount ?? 0}/${stats.totalMilestones}</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-900/70 border border-white/10">
              <div class="text-[11px] text-slate-400">Tỷ lệ chính xác</div>
              <div class="text-xl sm:text-2xl font-black text-indigo-300">${myRecord?.accuracyUpToNow ?? 0}%</div>
            </div>
            <div class="p-3 rounded-2xl bg-slate-900/70 border border-white/10">
              <div class="text-[11px] text-slate-400">Tổng điểm tích lũy</div>
              <div class="text-xl sm:text-2xl font-black text-rose-400">${myRecord?.scoreUpToNow ?? myRecord?.score ?? 0}đ</div>
            </div>
          </div>

          ${myRecord?.milestoneResults ? `
            <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
              ${myRecord.milestoneResults.map(mr => `
                <span class="px-3 py-1.5 rounded-xl text-xs font-bold border ${mr.isCorrect ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : (mr.answered ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-800 text-slate-400 border-slate-700')}">
                  Mốc ${mr.number}: ${mr.isCorrect ? `Đúng (${mr.selected}) +${mr.points}đ` : (mr.answered ? `Sai (${mr.selected})` : 'Chưa nộp')}
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Bảng Xếp Hạng & Thống Kê Toàn Lớp -->
        <div class="max-w-3xl w-full bg-slate-900/90 rounded-3xl p-5 border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <i class="fa-solid fa-ranking-star text-amber-400"></i> Bảng Xếp Hạng Chung Cuộc Toàn Lớp (${students.length} HS)
            </h3>
            <span class="text-xs font-bold text-indigo-300">Tỷ lệ đúng TB lớp: ${stats.overallAccuracyPct}%</span>
          </div>
          <div class="max-h-60 overflow-y-auto space-y-1.5 pr-1">
            ${students.map(s => `
              <div class="flex items-center justify-between px-3 py-2 rounded-xl ${s.uid === myUid ? 'bg-indigo-600/30 border border-indigo-400/50' : 'bg-white/5'} text-xs gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-black font-mono w-7 ${s.rank <= 3 ? 'text-amber-400' : 'text-slate-400'}">#${s.rank}</span>
                  <span class="font-bold text-white truncate">${escapeHtml(s.name)} ${s.uid === myUid ? '<span class="text-[10px] text-amber-300">(Em)</span>' : ''}</span>
                  <div class="hidden sm:flex items-center gap-1">
                    ${(s.milestoneResults || []).map(mr => `<span class="text-[10px]" title="Mốc ${mr.number}">${mr.isCorrect ? '✅' : (mr.answered ? '❌' : '➖')}</span>`).join('')}
                  </div>
                </div>
                <div class="flex items-center gap-3 shrink-0 font-mono">
                  <span class="text-emerald-400 font-bold">${s.correctUpToNow}/${stats.totalMilestones} (${s.accuracyUpToNow}%)</span>
                  <span class="text-amber-300 font-black">${s.scoreUpToNow}đ</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Nút Trở Về -->
        <button type="button" id="btn-podium-close" class="px-8 py-3.5 rounded-2xl bg-white text-slate-900 font-black text-xs sm:text-sm hover:bg-slate-100 transition shadow-xl">
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
  // 11. BINDING CÁC SỰ KIỆN MASTER CỦA GIÁO VIÊN / ADMIN
  // =========================================================================
  bindMasterConsoleEvents(room) {
    const video = document.getElementById('live-master-video');
    this.videoElem = video;

    const dbUrl = this.getBaseDbUrl();
    const roomId = room.roomId;

    // 1. Nút Copy Mã Phòng 1 chạm
    const btnCopyCode = document.getElementById('btn-master-copy-code');
    if (btnCopyCode) {
      btnCopyCode.onclick = () => {
        navigator.clipboard.writeText(roomId).then(() => {
          const orig = btnCopyCode.innerHTML;
          btnCopyCode.innerHTML = `<i class="fa-solid fa-check text-emerald-400"></i> <span class="text-emerald-300">ĐÃ COPY: ${escapeHtml(roomId)}</span>`;
          setTimeout(() => { btnCopyCode.innerHTML = orig; }, 2000);
        }).catch(() => {
          prompt('Mã phòng Live của Thầy/Cô:', roomId);
        });
      };
    }

    // 1b. Nút Copy Mẫu Mời Lớp Zalo
    const btnCopy = document.getElementById('btn-master-copy-invite');
    if (btnCopy) {
      btnCopy.onclick = () => {
        const origin = window.location.origin + window.location.pathname;
        const link = `${origin}?live_video=${encodeURIComponent(roomId)}`;
        const text = `📢 [THÔNG BÁO TIẾT HỌC TIN HỌC TRỰC TUYẾN]\nThầy/Cô mời các em lớp ${room.className} tham gia phòng chiếu phim bài giảng tương tác:\n🎬 Bài học: ${room.lessonTitle}\n🎟️ Mã phòng truy cập: ${roomId}\n👉 Link vào thẳng: ${link}\n(Các em nhập mã phòng ${roomId} hoặc mở link để vào hàng đợi phòng Live nhé!)`;
        navigator.clipboard.writeText(text).then(() => {
          alert('Đã sao chép mẫu thông báo kèm Mã Phòng vào clipboard!\nThầy/Cô dán vào nhóm Zalo/Facebook của lớp nhé.');
        }).catch(() => {
          prompt('Mời Thầy/Cô sao chép liên kết:', link);
        });
      };
    }

    // 1c. Hàng đợi: Toggle duyệt thủ công & Duyệt tất cả
    const chkRequireApproval = document.getElementById('master-toggle-require-approval');
    if (chkRequireApproval) {
      chkRequireApproval.onchange = () => {
        const val = Boolean(chkRequireApproval.checked);
        if (this.activeRoom) this.activeRoom.requireApproval = val;
        fetch(`${dbUrl}/live_video_rooms/${roomId}/requireApproval.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(val)
        }).catch(() => {});
      };
    }

    const btnAdmitAll = document.getElementById('btn-master-admit-all');
    if (btnAdmitAll) {
      btnAdmitAll.onclick = () => {
        this.admitAllStudents(roomId);
      };
    }

    // 2. Hàm điều khiển thống nhất: BẮT ĐẦU PHÒNG LIVE / TẠM DỪNG / TIẾP TỤC
    const toggleMasterPlayPause = async () => {
      if (!video) return;
      const curState = this.remoteState?.state || this.activeRoom?.state || 'waiting';
      const curTime = Number(video.currentTime || 0);

      if (curState === 'waiting' || video.paused) {
        // Nếu bắt đầu từ sảnh chờ, tự động duyệt toàn bộ học sinh đang ở hàng đợi để vào học cùng lúc
        if (curState === 'waiting') {
          await this.admitAllStudents(roomId);
        }

        const lobbyOverlay = document.getElementById('master-waiting-lobby-overlay');
        if (lobbyOverlay) lobbyOverlay.classList.add('hidden');

        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: 'playing',
            currentTime: curTime,
            startedAt: this.remoteState?.startedAt || Date.now(),
            updatedAt: Date.now()
          })
        }).catch(err => console.warn('Lỗi gửi lệnh phát lên Firebase:', err));

        try {
          await video.play();
        } catch (playErr) {
          video.muted = true;
          try {
            await video.play();
          } catch (err2) {
            console.error('Không thể phát video máy Thầy Cô:', err2);
          }
        }
      } else {
        // Tạm dừng phòng Live
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

    const btnPlayPause = document.getElementById('btn-master-play-pause');
    if (btnPlayPause) btnPlayPause.onclick = toggleMasterPlayPause;

    const btnHeaderStartPause = document.getElementById('btn-master-header-start-pause');
    if (btnHeaderStartPause) btnHeaderStartPause.onclick = toggleMasterPlayPause;

    const btnLobbyStart = document.getElementById('btn-master-lobby-start');
    if (btnLobbyStart) btnLobbyStart.onclick = toggleMasterPlayPause;

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
        // Khi kết thúc toàn bộ video và các mốc, tự động chuyển sang trạng thái hoàn thành & xuất bảng xếp hạng/thống kê
        fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: 'finished',
            currentQuestion: null,
            currentTime: video.duration || video.currentTime,
            updatedAt: Date.now()
          })
        }).catch(() => {});
        this.renderMasterEndSessionReport(this.remoteState || room);
      };

      video.onerror = () => {
        console.warn('Live Master Video load error for:', video.src);
        if (video.src && (video.src.includes('archive.org/download/') || video.src.includes('.us.archive.org/'))) {
          const corsUrl = `https://archive.org/cors/tinhoc-hub-thpt/${room.videoFileName}`;
          if (video.src !== corsUrl) {
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
          if (confirm('Đã hoàn thành toàn bộ các mốc câu hỏi trong bài giảng!\nThầy/Cô có muốn Xuất Thứ Hạng & Thống Kê Tổng Kết ngay không?')) {
            finishLiveSession(false);
          }
        }
      };
    }

    // 6. Nút Mở Đáp Án & Xem Thống Kê Mốc
    const btnReveal = document.getElementById('btn-master-reveal-answer');
    const btnResume = document.getElementById('btn-master-resume-video');
    const btnFinishAll = document.getElementById('btn-master-finish-all-milestones');

    const revealCurrentQuestionAnswer = () => {
      if (btnReveal) btnReveal.classList.add('hidden');
      const currentQ = this.remoteState?.currentQuestion || this.activeRoom?.currentQuestion;
      const totalQ = (this.remoteState?.totalQuestions || this.questionsList.length || 1);
      const isLastMilestone = currentQ && Number(currentQ.index) >= totalQ - 1;

      if (btnResume) btnResume.classList.remove('hidden');
      if (btnFinishAll) {
        if (isLastMilestone) btnFinishAll.classList.remove('hidden');
        else btnFinishAll.classList.add('hidden');
      }

      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      const masterCountdown = document.getElementById('master-q-countdown');
      if (masterCountdown) {
        masterCountdown.textContent = 'ĐÃ MỞ ĐÁP ÁN & THỐNG KÊ';
        masterCountdown.className = 'px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-black font-mono';
      }

      fetch(`${dbUrl}/live_video_rooms/${roomId}/currentQuestion/revealed.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(true)
      }).catch(err => console.warn('Lỗi công bố đáp án:', err));

      if (currentQ) {
        currentQ.revealed = true;
        const responses = this.remoteState?.responses?.[currentQ.index] || {};
        this.renderLivePollChart('master-poll-bars', responses, currentQ.answer);
        if (this.remoteState) {
          this.renderMasterMilestoneStatsPanel(this.remoteState, currentQ);
        }
      }
    };

    this.revealCurrentQuestionAnswer = revealCurrentQuestionAnswer;

    if (btnReveal) {
      btnReveal.onclick = revealCurrentQuestionAnswer;
    }

    // 7. Nút Tiếp Tục Bài Giảng Sau Câu Hỏi
    if (btnResume && video) {
      btnResume.onclick = async () => {
        const curTime = Number(video.currentTime || 0);
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

    // 8. Hàm Dừng Phòng Live / Xuất Thứ Hạng & Thống Kê Tổng Kết
    const finishLiveSession = async (askConfirmation = true) => {
      if (askConfirmation) {
        const confirmEnd = confirm('Thầy/Cô muốn dừng phòng Live và xuất Bảng Xếp Hạng & Thống Kê toàn bộ các mốc câu hỏi?');
        if (!confirmEnd) return;
      }

      if (video && !video.paused) video.pause();
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }

      await fetch(`${dbUrl}/live_video_rooms/${roomId}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'finished',
          currentQuestion: null,
          updatedAt: Date.now()
        })
      }).catch(() => {});

      if (this.remoteState) this.remoteState.state = 'finished';
      this.renderMasterEndSessionReport(this.remoteState || room);
    };

    const btnEnd = document.getElementById('btn-master-end-session');
    if (btnEnd) btnEnd.onclick = () => finishLiveSession(true);

    const btnStopRoom = document.getElementById('btn-master-stop-room');
    if (btnStopRoom) btnStopRoom.onclick = () => finishLiveSession(true);

    if (btnFinishAll) {
      btnFinishAll.onclick = () => finishLiveSession(false);
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
        <div class="absolute top-0 bottom-0 w-1.5 bg-amber-400 rounded-full cursor-pointer hover:w-2 hover:bg-white transition" style="left: ${pct}%" title="Mốc câu hỏi số ${idx + 1} (${this.formatTime(q.sec)})">
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
      if (q.revealed || this.remoteState?.currentQuestion?.revealed) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        const masterEl = document.getElementById('master-q-countdown');
        if (masterEl) {
          masterEl.textContent = 'ĐÃ MỞ ĐÁP ÁN & THỐNG KÊ';
          masterEl.className = 'px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-black font-mono';
        }
        const studentEl = document.getElementById('student-q-countdown');
        if (studentEl) {
          studentEl.textContent = 'ĐÃ CHỐT MỐC';
          studentEl.className = 'px-4 py-1.5 rounded-full bg-emerald-700 text-white text-base font-black font-mono shadow-lg';
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

          if (!this.hasSubmittedCurrentQuestion && !q.revealed) {
            const banner = document.getElementById('student-submitted-banner');
            if (banner) {
              banner.classList.remove('hidden');
              banner.innerHTML = '<i class="fa-solid fa-hourglass-end text-amber-400"></i> Đã hết thời gian trả lời! Đang tổng hợp thống kê mốc câu hỏi...';
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
        // Tự động mở đáp án & hiển thị thống kê mốc câu hỏi khi hết giờ trên máy Host
        if (this.isHost && !q.revealed && typeof this.revealCurrentQuestionAnswer === 'function') {
          this.revealCurrentQuestionAnswer();
        }
      }
    };

    tick();
    this.countdownInterval = setInterval(tick, 1000);
  },

  // =========================================================================
  // 12. BÁO CÁO TỔNG KẾT THỨ HẠNG, THỐNG KÊ TOÀN BỘ MỐC & XUẤT EXCEL (GV/ADMIN)
  // =========================================================================
  renderMasterEndSessionReport(remote) {
    const container = document.getElementById('live-master-console');
    if (!container) return;

    const totalQ = remote.totalQuestions || (remote.checkpoints || []).length || 1;
    const stats = this.computeMilestoneStats(remote, Math.max(0, totalQ - 1));
    const students = stats.rankedStudents;
    const milestones = stats.milestoneBreakdown || [];
    const avgScore = students.length > 0
      ? Math.round(students.reduce((acc, s) => acc + (s.scoreUpToNow || 0), 0) / students.length)
      : 0;

    const top1 = students[0];
    const top2 = students[1];
    const top3 = students[2];

    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 90, spread: 75, origin: { y: 0.5 } });
    }

    container.innerHTML = `
      <div class="space-y-6 animate-fadeIn pb-12">
        <!-- Header Tổng kết -->
        <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-rose-950 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/30">
          <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-500/30">
                  <i class="fa-solid fa-flag-checkered"></i> HOÀN THÀNH PHÒNG LIVE • THỐNG KÊ & XẾP HẠNG TOÀN DIỆN
                </span>
                <span class="px-3 py-1 rounded-full bg-white/10 text-amber-300 font-mono text-xs font-black">
                  Mã phòng: ${escapeHtml(remote.roomId || '')}
                </span>
              </div>
              <h2 class="text-2xl sm:text-3xl font-black text-white mt-2">
                ${escapeHtml(remote.title || remote.lessonTitle || 'Báo cáo kết quả Phòng Live')}
              </h2>
              <p class="text-xs sm:text-sm text-slate-300 mt-1">
                Trường: <strong>${escapeHtml(remote.school === 'all' ? 'Tất cả trường' : (remote.school || ''))}</strong> • Lớp: <strong>${escapeHtml(remote.className || 'Tất cả')}</strong> • Sĩ số tham gia: <strong>${students.length} học sinh</strong>
              </p>
            </div>

            <div class="flex items-center gap-2.5 flex-wrap">
              <button type="button" id="btn-export-live-excel" class="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-600/30">
                <i class="fa-solid fa-file-excel"></i> Xuất Báo Cáo Excel (BOM)
              </button>
              <button type="button" id="btn-save-to-gradebook" class="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-blue-600/30">
                <i class="fa-solid fa-book-bookmark"></i> Lưu Vào Sổ Điểm Lớp
              </button>
              <button type="button" id="btn-master-exit" class="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition">
                <i class="fa-solid fa-arrow-left"></i> Quay Lại
              </button>
            </div>
          </div>

          <!-- 4 KPI Tổng Hợp Toàn Bài -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div class="text-[11px] text-slate-400 uppercase font-bold">Tổng số học sinh</div>
              <div class="text-2xl font-black text-white font-mono mt-1">${students.length} HS</div>
            </div>
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div class="text-[11px] text-slate-400 uppercase font-bold">Tổng số mốc câu hỏi</div>
              <div class="text-2xl font-black text-amber-300 font-mono mt-1">${stats.totalMilestones} mốc</div>
            </div>
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div class="text-[11px] text-slate-400 uppercase font-bold">Tỷ lệ đúng TB toàn bài</div>
              <div class="text-2xl font-black text-emerald-400 font-mono mt-1">${stats.overallAccuracyPct}%</div>
            </div>
            <div class="p-4 rounded-2xl bg-white/5 border border-white/10">
              <div class="text-[11px] text-slate-400 uppercase font-bold">Điểm trung bình lớp</div>
              <div class="text-2xl font-black text-rose-400 font-mono mt-1">${avgScore}đ</div>
            </div>
          </div>
        </div>

        <!-- Bục Vinh Danh Podium Top 1-2-3 -->
        ${students.length > 0 ? `
          <div class="bg-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-xl">
            <h3 class="text-sm font-black uppercase tracking-wider text-amber-400 text-center mb-4">
              <i class="fa-solid fa-crown"></i> BỤC VINH DANH TOP 3 HỌC SINH DẪN ĐẦU TOÀN BỘ CÁC MỐC
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
              <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700 text-center space-y-1">
                <div class="text-2xl">🥈 Hạng 2</div>
                <div class="font-black text-white truncate">${escapeHtml(top2?.name || '---')}</div>
                <div class="text-xs text-slate-400">${escapeHtml(top2?.className || '')}</div>
                <div class="text-sm font-mono font-black text-emerald-400">${top2 ? `${top2.correctUpToNow}/${stats.totalMilestones} câu (${top2.accuracyUpToNow}%) • ${top2.scoreUpToNow}đ` : '---'}</div>
              </div>
              <div class="p-5 rounded-2xl bg-gradient-to-b from-amber-500/20 to-slate-900 border-2 border-amber-400 text-center space-y-1 shadow-lg shadow-amber-500/10">
                <div class="text-3xl">👑 Hạng 1</div>
                <div class="font-black text-base text-amber-300 truncate">${escapeHtml(top1?.name || '---')}</div>
                <div class="text-xs text-slate-300">${escapeHtml(top1?.className || '')}</div>
                <div class="text-base font-mono font-black text-amber-400">${top1 ? `${top1.correctUpToNow}/${stats.totalMilestones} câu (${top1.accuracyUpToNow}%) • ${top1.scoreUpToNow}đ` : '---'}</div>
              </div>
              <div class="p-4 rounded-2xl bg-slate-900 border border-amber-800/60 text-center space-y-1">
                <div class="text-2xl">🥉 Hạng 3</div>
                <div class="font-black text-white truncate">${escapeHtml(top3?.name || '---')}</div>
                <div class="text-xs text-slate-400">${escapeHtml(top3?.className || '')}</div>
                <div class="text-sm font-mono font-black text-emerald-400">${top3 ? `${top3.correctUpToNow}/${stats.totalMilestones} câu (${top3.accuracyUpToNow}%) • ${top3.scoreUpToNow}đ` : '---'}</div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Bảng Thống Kê Chi Tiết Từng Mốc Câu Hỏi (Mốc 1 -> Mốc N) -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 class="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-chart-column text-indigo-500"></i> THỐNG KÊ CHI TIẾT TỪNG MỐC CÂU HỎI (MỐC 1 ➔ MỐC ${stats.totalMilestones})
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                  <th class="py-3 px-3">Mốc</th>
                  <th class="py-3 px-3">Thời điểm</th>
                  <th class="py-3 px-3">Nội dung câu hỏi</th>
                  <th class="py-3 px-3 text-center">Đáp án</th>
                  <th class="py-3 px-3 text-center">Đã nộp</th>
                  <th class="py-3 px-3 text-center">Làm đúng</th>
                  <th class="py-3 px-3 text-center">Làm sai</th>
                  <th class="py-3 px-3 text-center">Chưa nộp</th>
                  <th class="py-3 px-3 text-center">Phân bố A / B / C / D</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${milestones.map(m => `
                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td class="py-3 px-3 font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">Mốc #${m.number}</td>
                    <td class="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">${this.formatTime(m.sec)}</td>
                    <td class="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 max-w-md truncate" title="${escapeHtml(m.question)}">${escapeHtml(m.question)}</td>
                    <td class="py-3 px-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400">${escapeHtml(m.answer)}</td>
                    <td class="py-3 px-3 text-center font-mono font-bold">${m.submittedCount}/${stats.totalStudents} (${m.participationPct}%)</td>
                    <td class="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">${m.correctCount} (${m.accuracyPct}%)</td>
                    <td class="py-3 px-3 text-center font-mono font-bold text-rose-500">${m.wrongCount}</td>
                    <td class="py-3 px-3 text-center font-mono text-slate-400">${m.unansweredCount}</td>
                    <td class="py-3 px-3 text-center font-mono text-[11px] whitespace-nowrap">
                      A:${m.tally.A} • B:${m.tally.B} • C:${m.tally.C} • D:${m.tally.D}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Bảng Xếp Hạng Thứ Hạng Học Sinh Toàn Lớp Kèm Kết Quả Từng Mốc -->
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 class="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-ranking-star text-amber-500"></i> BẢNG THỨ HẠNG & THỐNG KÊ TÍCH LŨY TOÀN BỘ HỌC SINH (${students.length} HS)
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                  <th class="py-3 px-3">Hạng</th>
                  <th class="py-3 px-3">Học sinh</th>
                  <th class="py-3 px-3">Trường / Lớp</th>
                  ${milestones.map(m => `<th class="py-3 px-2 text-center font-mono">M${m.number}</th>`).join('')}
                  <th class="py-3 px-3 text-center">Tổng câu đúng</th>
                  <th class="py-3 px-3 text-right">Tổng điểm</th>
                  <th class="py-3 px-3 text-center">Đánh giá</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                ${students.length === 0 ? `
                  <tr>
                    <td colspan="${6 + milestones.length}" class="py-8 text-center text-slate-400">Chưa có dữ liệu học sinh tham gia.</td>
                  </tr>
                ` : students.map((s, idx) => {
                  const medal = idx === 0 ? '🥇 #1' : (idx === 1 ? '🥈 #2' : (idx === 2 ? '🥉 #3' : `#${idx + 1}`));
                  const pct = s.accuracyUpToNow || 0;
                  const badge = pct >= 80 ? 'Xuất sắc 🚀' : (pct >= 50 ? 'Đạt chuẩn ✅' : 'Cần cố gắng ⚠️');
                  return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td class="py-3 px-3 font-bold whitespace-nowrap ${idx < 3 ? 'text-amber-500 font-black' : 'text-slate-500'}">${medal}</td>
                      <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">${escapeHtml(s.name)}</td>
                      <td class="py-3 px-3 text-slate-500">${escapeHtml(s.school || '')} • ${escapeHtml(s.className || '')}</td>
                      ${(s.milestoneResults || []).map(mr => `
                        <td class="py-3 px-2 text-center font-mono text-[11px]" title="Mốc ${mr.number}: Chọn ${mr.selected || 'Chưa nộp'}">
                          ${mr.isCorrect
                            ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">✅ ${escapeHtml(mr.selected)}</span>`
                            : (mr.answered
                              ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">❌ ${escapeHtml(mr.selected)}</span>`
                              : `<span class="text-slate-400">➖</span>`)}
                        </td>
                      `).join('')}
                      <td class="py-3 px-3 text-center font-mono font-bold">${s.correctUpToNow}/${stats.totalMilestones} (${pct}%)</td>
                      <td class="py-3 px-3 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-sm">${s.scoreUpToNow}đ</td>
                      <td class="py-3 px-3 text-center">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${pct >= 80 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300' : (pct >= 50 ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300')}">
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
      this.exportLiveSessionToExcel(remote, stats);
    });

    // Save to Gradebook
    document.getElementById('btn-save-to-gradebook')?.addEventListener('click', () => {
      students.forEach(s => {
        const score10 = stats.totalMilestones > 0
          ? ((s.correctUpToNow / stats.totalMilestones) * 10).toFixed(1)
          : '0.0';
        const record = {
          id: `live_${Date.now()}_${s.uid}`,
          studentName: s.name,
          studentEmail: s.email || `${s.uid}@tinhoc.edu.vn`,
          school: s.school || remote.school || '',
          className: s.className || remote.className || '',
          grade: remote.grade || '12',
          examTitle: `[Live Video] ${remote.lessonTitle || remote.title}`,
          score: score10,
          correctCount: s.correctUpToNow || 0,
          totalQuestions: stats.totalMilestones || 0,
          timeSpent: 1200,
          submittedAt: new Date().toISOString(),
          status: 'valid'
        };
        Storage.saveExamResult(record);
      });
      alert('Đã lưu toàn bộ kết quả thứ hạng và điểm số của học sinh vào Sổ Điểm Điện Tử!');
    });

    document.getElementById('btn-master-exit')?.addEventListener('click', () => {
      this.cleanupSession();
      if (window.App && typeof window.App.switchTab === 'function') {
        window.App.switchTab('interactive-video');
      }
    });
  },

  exportLiveSessionToExcel(remote, statsOrStudents) {
    const totalQ = remote.totalQuestions || (remote.checkpoints || []).length || 1;
    const stats = (statsOrStudents && statsOrStudents.rankedStudents)
      ? statsOrStudents
      : this.computeMilestoneStats(remote, Math.max(0, totalQ - 1));

    const students = stats.rankedStudents || [];
    const milestones = stats.milestoneBreakdown || [];

    const milestoneCols = milestones.map(m => `Mốc ${m.number}`);
    const headers = ['Hạng', 'Họ và Tên', 'Trường Học', 'Lớp', ...milestoneCols, 'Số Câu Đúng', 'Tổng Số Mốc', 'Tỷ Lệ Đúng (%)', 'Tổng Điểm', 'Thời Gian Ghi Nhận'];
    const rows = students.map((s, idx) => {
      const mCells = (s.milestoneResults || []).map(mr => {
        if (!mr.answered) return '"Chưa nộp"';
        return `"${mr.isCorrect ? 'Đúng' : 'Sai'} (${mr.selected})"` ;
      });
      return [
        idx + 1,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.school || remote.school || '').replace(/"/g, '""')}"`,
        `"${(s.className || remote.className || '').replace(/"/g, '""')}"`,
        ...mCells,
        s.correctUpToNow || 0,
        stats.totalMilestones,
        `${s.accuracyUpToNow || 0}%`,
        s.scoreUpToNow || 0,
        `"${new Date().toLocaleString('vi-VN')}"`
      ];
    });

    const summarySection = [
      [],
      ['THỐNG KÊ CHI TIẾT TỪNG MỐC CÂU HỎI'],
      ['Mốc', 'Thời Điểm', 'Câu Hỏi', 'Đáp Án Đúng', 'Số HS Nộp', 'Số HS Đúng', 'Số HS Sai', 'Chưa Nộp', 'Tỷ Lệ Đúng (%)'],
      ...milestones.map(m => [
        `Mốc ${m.number}`,
        this.formatTime(m.sec),
        `"${(m.question || '').replace(/"/g, '""')}"`,
        m.answer,
        m.submittedCount,
        m.correctCount,
        m.wrongCount,
        m.unansweredCount,
        `${m.accuracyPct}%`
      ])
    ];

    const allLines = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
      ...summarySection.map(r => r.join(','))
    ];

    const csvContent = '\uFEFF' + allLines.join('\r\n');
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
        btnReady.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-300"></i> Đã sẵn sàng trong hàng đợi! Sẽ tự phát khi Thầy/Cô bấm Bắt đầu';
        btnReady.className = 'mt-2 px-6 py-3 rounded-2xl bg-emerald-600/40 text-emerald-300 font-bold text-xs border border-emerald-500/30 flex items-center gap-2 mx-auto';

        // Báo trạng thái Sẵn sàng lên hàng đợi Firebase cho Giáo viên/Admin thấy
        const uid = this.studentInfo?.uid;
        const dbUrl = this.getBaseDbUrl();
        if (uid && this.activeRoom?.roomId) {
          fetch(`${dbUrl}/live_video_rooms/${this.activeRoom.roomId}/students/${uid}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ready: true, lastSeen: Date.now() })
          }).catch(() => {});
        }

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

    if (window.InteractiveVideo && window.InteractiveVideo.localVideoMap) {
      const entry = window.InteractiveVideo.localVideoMap[vTrim] || window.InteractiveVideo.localVideoMap[vTrim.toLowerCase()];
      if (entry) {
        return typeof entry === 'string' ? entry : (entry.url || '');
      }
    }

    if (typeof Storage !== 'undefined' && typeof Storage.getCustomVideoUrl === 'function') {
      const customUrl = Storage.getCustomVideoUrl(vTrim);
      if (customUrl) {
        if (customUrl.includes('archive.org/download/')) {
          return customUrl.replace('archive.org/download/', 'archive.org/cors/');
        }
        return customUrl;
      }
    }

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
                  Cấp mã phòng, quản lý hàng đợi học sinh và thống kê tự động sau từng mốc câu hỏi
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
                Mã Phòng Live (Học sinh dùng mã này để vào hàng đợi phòng Live) *
              </label>
              <input type="text" id="live-input-room-code" placeholder="LIVE-892" required class="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black font-mono tracking-wider text-rose-600 dark:text-rose-400 uppercase focus:ring-2 focus:ring-rose-500" />
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

            <!-- Cài đặt Hàng đợi duyệt học sinh -->
            <label class="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input type="checkbox" id="live-input-require-approval" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
              <div class="text-xs">
                <div class="font-bold text-slate-800 dark:text-white">Yêu cầu GV/Admin duyệt học sinh từ Hàng Đợi trước khi vào phòng</div>
                <div class="text-[11px] text-slate-400">Học sinh nhập mã sẽ xếp hàng chờ (#1, #2...). Bài giảng chỉ bắt đầu khi GV/Admin bấm Bắt đầu.</div>
              </div>
            </label>

            <div class="pt-2">
              <button type="button" id="btn-confirm-create-live-room" class="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-black transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2">
                <i class="fa-solid fa-tower-broadcast"></i> Mở Sảnh Chờ Phòng Live & Cấp Mã Truy Cập
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
              Nhập Mã Phòng Live
            </h3>
            <p class="text-xs text-slate-400 mt-1">
              Nhập mã phòng do Thầy/Cô cung cấp (VD: LIVE-892 hoặc 892) để xếp hàng vào phòng Live
            </p>
          </div>

          <div class="space-y-3">
            <input type="text" id="live-join-input-code" placeholder="VD: LIVE-892" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-center text-base font-black font-mono tracking-widest text-rose-600 dark:text-rose-400 uppercase focus:ring-4 focus:ring-rose-500/20 focus:border-rose-500 outline-none" />

            <button type="button" id="btn-confirm-join-live-room" class="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2">
              <i class="fa-solid fa-arrow-right-to-bracket"></i> Vào Hàng Đợi Phòng Live
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
