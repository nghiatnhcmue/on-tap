/**
 * tinhoc-hub: Storage Manager (LocalStorage)
 * Quản lý dữ liệu người dùng: Lịch sử thi, câu hỏi đã lưu, cài đặt, thống kê
 */

const STORAGE_KEYS = {
  BOOKMARKS: 'tinhoc_bookmarks',
  EXAM_HISTORY: 'tinhoc_exam_history',
  SETTINGS: 'tinhoc_settings',
  PRACTICE_STATS: 'tinhoc_practice_stats',
  CUSTOM_QUESTIONS: 'tinhoc_custom_questions',
  MODIFIED_QUESTIONS: 'tinhoc_modified_questions',
  DELETED_QUESTIONS: 'tinhoc_deleted_question_ids',
  ACCOUNTS: 'tinhoc_user_accounts',
  ADMIN_CONFIG: 'tinhoc_admin_config',
  EXAM_ROOMS: 'tinhoc_exam_rooms',
  ACTIVE_EXAM_SESSION: 'tinhoc_active_exam_session',
  WRONG_QUESTIONS: 'tinhoc_wrong_questions',
  USER_NOTES: 'tinhoc_user_notes',
  STUDY_STREAK: 'tinhoc_study_streak',
  VIDEO_CONFIG: 'tinhoc_video_config',
  VIDEO_PROGRESS: 'tinhoc_video_progress',
  CUSTOM_VIDEO_QUESTIONS: 'tinhoc_custom_video_questions',
  CUSTOM_VIDEO_URLS: 'tinhoc_custom_video_urls'
};

export const Storage = {
  cloudSync: null,

  // --- CẤU HÌNH VIDEO BÀI GIẢNG & ARCHIVE.ORG S3 ---
  getVideoConfig() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VIDEO_CONFIG);
      let parsed = data ? JSON.parse(data) : {
        archiveAccessKey: '',
        archiveSecretKey: '',
        archiveIdentifier: 'tinhoc-hub-thpt',
        videoBaseUrl: 'https://archive.org/cors/tinhoc-hub-thpt/',
        uploadedVideos: {}
      };
      // Tự động chuyển đổi download/ sang cors/ để chống lỗi ERR_CONNECTION_RESET tại Việt Nam
      if (parsed.videoBaseUrl && parsed.videoBaseUrl.includes('archive.org/download/')) {
        parsed.videoBaseUrl = parsed.videoBaseUrl.replace('archive.org/download/', 'archive.org/cors/');
      }
      return parsed;
    } catch (e) {
      return {
        archiveAccessKey: '',
        archiveSecretKey: '',
        archiveIdentifier: 'tinhoc-hub-thpt',
        videoBaseUrl: 'https://archive.org/cors/tinhoc-hub-thpt/',
        uploadedVideos: {}
      };
    }
  },

  saveVideoConfig(config) {
    try {
      const current = this.getVideoConfig();
      const updated = { ...current, ...config };
      // Chuẩn hóa videoBaseUrl kết thúc bằng dấu gạch chéo & dùng cors/
      if (updated.videoBaseUrl) {
        updated.videoBaseUrl = updated.videoBaseUrl.trim();
        if (updated.videoBaseUrl.includes('archive.org/download/')) {
          updated.videoBaseUrl = updated.videoBaseUrl.replace('archive.org/download/', 'archive.org/cors/');
        }
        if (!updated.videoBaseUrl.endsWith('/')) {
          updated.videoBaseUrl += '/';
        }
      }
      localStorage.setItem(STORAGE_KEYS.VIDEO_CONFIG, JSON.stringify(updated));
      if (this.cloudSync && typeof this.cloudSync.pushVideoConfigToCloud === 'function') {
        this.cloudSync.pushVideoConfigToCloud(updated).catch(() => {});
      }
      return updated;
    } catch (e) {
      console.error('Error saving video config', e);
    }
  },

  getVideoBaseUrl() {
    const cfg = this.getVideoConfig();
    let url = '';
    if (cfg && cfg.videoBaseUrl && cfg.videoBaseUrl.trim()) {
      url = cfg.videoBaseUrl.trim();
    } else {
      const id = (cfg && cfg.archiveIdentifier) ? cfg.archiveIdentifier.trim() : 'tinhoc-hub-thpt';
      url = `https://archive.org/cors/${id}/`;
    }
    if (url.includes('archive.org/download/')) {
      url = url.replace('archive.org/download/', 'archive.org/cors/');
    }
    return url.endsWith('/') ? url : url + '/';
  },

  // --- TIẾN TRÌNH HỌC TẬP VIDEO TƯƠNG TÁC ---
  getVideoProgress(videoFile) {
    if (!videoFile) return null;
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.VIDEO_PROGRESS) || '{}');
      return all[videoFile] || null;
    } catch (e) {
      return null;
    }
  },

  getAllVideoProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.VIDEO_PROGRESS) || '{}');
    } catch (e) {
      return {};
    }
  },

  recordVideoProgress(videoFile, score, totalQuestions, details = []) {
    if (!videoFile) return;
    try {
      const all = this.getAllVideoProgress();
      const current = all[videoFile] || { attempts: 0, highestScore: 0, completed: false };
      const numScore = Number(score) || 0;
      const isComplete = numScore >= 5.0 || (totalQuestions > 0 && numScore > 0);
      
      all[videoFile] = {
        videoFile,
        attempts: (current.attempts || 0) + 1,
        highestScore: Math.max(current.highestScore || 0, numScore),
        lastScore: numScore,
        totalQuestions: totalQuestions || current.totalQuestions || 0,
        completed: current.completed || isComplete,
        lastAttemptDate: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEYS.VIDEO_PROGRESS, JSON.stringify(all));
    } catch (e) {
      console.error('Error recording video progress:', e);
    }
  },

  // --- TÙY CHỈNH URL VIDEO TỪNG BÀI HỌC ---
  getCustomVideoUrls() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_VIDEO_URLS) || '{}');
    } catch (e) {
      return {};
    }
  },

  getCustomVideoUrl(videoFile) {
    if (!videoFile) return null;
    const all = this.getCustomVideoUrls();
    return all[videoFile] || null;
  },

  saveCustomVideoUrl(videoFile, url) {
    if (!videoFile) return;
    try {
      const all = this.getCustomVideoUrls();
      if (url && url.trim()) {
        all[videoFile] = url.trim();
      } else {
        delete all[videoFile];
      }
      localStorage.setItem(STORAGE_KEYS.CUSTOM_VIDEO_URLS, JSON.stringify(all));
      if (this.cloudSync && typeof this.cloudSync.pushCustomVideoUrlToCloud === 'function') {
        this.cloudSync.pushCustomVideoUrlToCloud(videoFile, url).catch(() => {});
      }
      return all;
    } catch (e) {
      console.error('Error saving custom video url', e);
    }
  },

  // --- CÂU HỎI & MỐC DỪNG TÙY BIẾN CHO VIDEO BÀI GIẢNG ---
  getAllCustomVideoQuestions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_VIDEO_QUESTIONS) || '{}');
    } catch (e) {
      return {};
    }
  },

  getCustomVideoQuestions(grade, videoFile) {
    if (!videoFile) return null;
    try {
      grade = String(grade || '12');
      const all = this.getAllCustomVideoQuestions();
      const list = all?.[grade]?.[videoFile];
      return Array.isArray(list) ? list : null;
    } catch (e) {
      return null;
    }
  },

  saveCustomVideoQuestions(grade, videoFile, questionsList) {
    if (!videoFile) return false;
    try {
      grade = String(grade || '12');
      const all = this.getAllCustomVideoQuestions();
      if (!all[grade]) all[grade] = {};
      all[grade][videoFile] = questionsList || [];
      localStorage.setItem(STORAGE_KEYS.CUSTOM_VIDEO_QUESTIONS, JSON.stringify(all));

      if (this.cloudSync && typeof this.cloudSync.pushCustomVideoQuestionsToCloud === 'function') {
        this.cloudSync.pushCustomVideoQuestionsToCloud(grade, videoFile, questionsList).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Error saving custom video questions', e);
      return false;
    }
  },

  resetCustomVideoQuestions(grade, videoFile) {
    if (!videoFile) return false;
    try {
      grade = String(grade || '12');
      const all = this.getAllCustomVideoQuestions();
      if (all[grade] && all[grade][videoFile]) {
        delete all[grade][videoFile];
        localStorage.setItem(STORAGE_KEYS.CUSTOM_VIDEO_QUESTIONS, JSON.stringify(all));
      }
      if (this.cloudSync && typeof this.cloudSync.deleteCustomVideoQuestionsFromCloud === 'function') {
        this.cloudSync.deleteCustomVideoQuestionsFromCloud(grade, videoFile).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Error resetting custom video questions', e);
      return false;
    }
  },

  // --- CẤU HÌNH XÁC THỰC GOOGLE BẰNG FIREBASE AUTH ---
  getFirebaseAuthConfig() {
    let result = {
      apiKey: '',
      authDomain: '',
      projectId: '',
      databaseURL: ''
    };

    try {
      const data = localStorage.getItem('tinhoc_firebase_auth_config');
      if (data) {
        result = { ...result, ...JSON.parse(data) };
      }
    } catch (e) {}

    const cloudCfg = JSON.parse(localStorage.getItem('tinhoc_cloud_config') || '{}');
    const adminCfg = this.getAdminConfig();
    const dbUrl = (cloudCfg.databaseUrl || '').trim();
    let derivedProjectId = '';
    if (dbUrl) {
      const m = dbUrl.match(/https?:\/\/([a-zA-Z0-9-]+)(?:-default-rtdb|\.firebaseio)/);
      if (m && m[1]) derivedProjectId = m[1];
    }

    if (!result.apiKey) {
      result.apiKey = cloudCfg.apiKey || adminCfg.firebaseApiKey || '';
    }
    if (!result.authDomain) {
      result.authDomain = cloudCfg.authDomain || (derivedProjectId ? `${derivedProjectId}.firebaseapp.com` : 'on-tap-nghiaedu-tin-hoc.firebaseapp.com');
    }
    if (!result.projectId) {
      result.projectId = cloudCfg.projectId || derivedProjectId || 'on-tap-nghiaedu-tin-hoc';
    }
    if (!result.databaseURL) {
      result.databaseURL = dbUrl || 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.asia-southeast1.firebasedatabase.app';
    }

    // Kiểm tra và chuẩn hóa Firebase Web API Key: Bắt đầu bằng 'AIza'
    if (result.apiKey) {
      let cleanKey = String(result.apiKey).trim().replace(/['";,\s]/g, '');
      const m = cleanKey.match(/AIza[A-Za-z0-9_-]{30,}/);
      if (m) cleanKey = m[0];
      if (!cleanKey.startsWith('AIza') || cleanKey.length < 25) {
        result.apiKey = '';
        try {
          localStorage.setItem('tinhoc_firebase_auth_config', JSON.stringify({ ...result, apiKey: '' }));
        } catch (e) {}
      } else {
        result.apiKey = cleanKey;
      }
    }

    return result;
  },

  saveFirebaseAuthConfig(config) {
    try {
      const current = this.getFirebaseAuthConfig();
      const updated = { ...current, ...config };
      if (updated.apiKey) {
        let cleanKey = String(updated.apiKey).trim().replace(/['";,\s]/g, '');
        const m = cleanKey.match(/AIza[A-Za-z0-9_-]{30,}/);
        if (m) cleanKey = m[0];
        updated.apiKey = cleanKey;
      }
      localStorage.setItem('tinhoc_firebase_auth_config', JSON.stringify(updated));

      // Đồng thời cập nhật vào cloud config nếu có apiKey
      if (updated.apiKey) {
        const cloudCfg = JSON.parse(localStorage.getItem('tinhoc_cloud_config') || '{}');
        cloudCfg.apiKey = updated.apiKey;
        if (updated.authDomain) cloudCfg.authDomain = updated.authDomain;
        if (updated.projectId) cloudCfg.projectId = updated.projectId;
        localStorage.setItem('tinhoc_cloud_config', JSON.stringify(cloudCfg));

        // Tự động đẩy cấu hình lên server đám mây để toàn bộ học sinh được thừa hưởng
        const cs = this.cloudSync || (typeof window !== 'undefined' ? window.CloudSync : null);
        if (cs && typeof cs.pushAuthConfigToCloud === 'function') {
          cs.pushAuthConfigToCloud(updated);
        }
      }
      return updated;
    } catch (e) {
      console.error('Error saving firebase auth config:', e);
    }
  },

  // --- CẤU HÌNH ADMIN & MÃ BẢO MẬT PHÂN QUYỀN ---
  getAdminConfig() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ADMIN_CONFIG);
      return data ? JSON.parse(data) : {
        teacherSecretCode: 'GV2025',
        adminSecretCode: 'ADMIN2025',
        adminEmail: 'nghiatnhcmue@gmail.com'
      };
    } catch (e) {
      return {
        teacherSecretCode: 'GV2025',
        adminSecretCode: 'ADMIN2025',
        adminEmail: 'nghiatnhcmue@gmail.com'
      };
    }
  },

  saveAdminConfig(config) {
    try {
      const current = this.getAdminConfig();
      const updated = { ...current, ...config };
      localStorage.setItem(STORAGE_KEYS.ADMIN_CONFIG, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Error saving admin config', e);
    }
  },

  // --- QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN (ADMIN) ---
  getAccountsList() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  saveAccountRecord(user) {
    if (!user) return;
    const identifier = (user.email && user.email.trim()) ? user.email.trim().toLowerCase() : (user.uid || '');
    if (!identifier) return;
    try {
      let list = this.getAccountsList();
      const idx = list.findIndex(u => (u.email && u.email.toLowerCase() === identifier) || (u.uid && u.uid === identifier));
      const record = {
        uid: user.uid || 'user_' + Date.now(),
        email: user.email || '',
        fullName: user.fullName || 'Người dùng',
        grade: user.grade || '12',
        className: user.className || '',
        school: user.school || '',
        avatar: user.avatar || '',
        role: user.role || 'student',
        password: user.password || (idx >= 0 ? list[idx].password : '') || '',
        lastActive: new Date().toISOString()
      };
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.unshift(record);
      }
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
      if (this.cloudSync) {
        this.cloudSync.pushAccountToCloud(record).catch(() => {});
      }
    } catch (e) {
      console.error('Error saving account record', e);
    }
  },

  updateAccountRole(emailOrUid, newRole) {
    if (!emailOrUid) return false;
    try {
      const target = String(emailOrUid).trim().toLowerCase();
      let list = this.getAccountsList();
      const user = list.find(u =>
        (u.email && u.email.toLowerCase() === target) ||
        (u.uid && u.uid.toLowerCase() === target)
      );
      if (user) {
        user.role = newRole;
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
        if (this.cloudSync) {
          this.cloudSync.pushAccountToCloud(user).catch(() => {});
        }
      }
      // Cập nhật session hiện tại nếu trùng email hoặc uid
      const currentUserStr = localStorage.getItem('tinhoc_user');
      if (currentUserStr) {
        const cur = JSON.parse(currentUserStr);
        if ((cur.email && cur.email.toLowerCase() === target) || (cur.uid && cur.uid.toLowerCase() === target)) {
          cur.role = newRole;
          localStorage.setItem('tinhoc_user', JSON.stringify(cur));
        }
      }
      return true;
    } catch (e) {
      console.error('Error updating role', e);
      return false;
    }
  },

  // --- QUẢN LÝ PHÒNG THI / GIAO ĐỀ THI (THỜI GIAN, PASSWORD, CHỐNG GIAN LẬN) ---
  getExamRooms() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXAM_ROOMS);
      if (data) return JSON.parse(data);

      // Phòng thi mẫu ban đầu để trải nghiệm
      const defaultRoom = {
        id: 'TIN12-HK1',
        title: 'Kiểm tra Giữa kỳ I - Tin học 12',
        grade: '12',
        createdDate: new Date().toISOString(),
        createdBy: 'nghiatnhcmue@gmail.com',
        creatorName: 'Thầy Nghĩa',
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() + 86400000 * 7).toISOString(),
        duration: 50,
        password: '123',
        type: 'bgd_2025',
        questionCount: 28,
        shuffleQuestions: true,
        shuffleOptions: true,
        antiCheat: {
          enabled: true,
          maxViolations: 3,
          enforceFullscreen: true,
          preventTabSwitch: true,
          disableCopyPaste: true,
          blockDevTools: true
        },
        status: 'active'
      };
      localStorage.setItem(STORAGE_KEYS.EXAM_ROOMS, JSON.stringify([defaultRoom]));
      return [defaultRoom];
    } catch (e) {
      console.error('Error loading exam rooms', e);
      return [];
    }
  },

  getExamRoom(roomId) {
    if (!roomId) return null;
    const rooms = this.getExamRooms();
    const cleanId = roomId.trim().toUpperCase();
    return rooms.find(r => r.id.toUpperCase() === cleanId) || null;
  },

  saveExamRoom(roomData) {
    try {
      const rooms = this.getExamRooms();
      const cleanId = (roomData.id || ('ROOM-' + Math.floor(1000 + Math.random() * 9000))).trim().toUpperCase();
      const existingIdx = rooms.findIndex(r => r.id.toUpperCase() === cleanId);
      
      const newRoom = {
        ...roomData,
        id: cleanId,
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        rooms[existingIdx] = { ...rooms[existingIdx], ...newRoom };
      } else {
        newRoom.createdDate = new Date().toISOString();
        rooms.unshift(newRoom);
      }

      localStorage.setItem(STORAGE_KEYS.EXAM_ROOMS, JSON.stringify(rooms));
      if (this.cloudSync) {
        this.cloudSync.pushRoomToCloud(newRoom).catch(() => {});
      }
      return newRoom;
    } catch (e) {
      console.error('Error saving exam room', e);
      return null;
    }
  },

  deleteExamRoom(roomId) {
    try {
      let rooms = this.getExamRooms();
      const cleanId = roomId.trim().toUpperCase();
      rooms = rooms.filter(r => r.id.toUpperCase() !== cleanId);
      localStorage.setItem(STORAGE_KEYS.EXAM_ROOMS, JSON.stringify(rooms));
      if (this.cloudSync) {
        this.cloudSync.deleteRoomFromCloud(cleanId).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Error deleting exam room', e);
      return false;
    }
  },

  validateRoomAccess(roomId, enteredPassword, user = null) {
    const room = this.getExamRoom(roomId);
    if (!room) {
      return {
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Mã phòng thi không tồn tại trong hệ thống! Vui lòng kiểm tra lại.'
      };
    }

    // 1. Kiểm tra mật khẩu (nếu phòng có cài mật khẩu)
    if (room.password && room.password.trim() !== '') {
      if (!enteredPassword || enteredPassword.trim() !== room.password.trim()) {
        return {
          valid: false,
          room,
          reason: 'WRONG_PASSWORD',
          message: 'Mật khẩu vào phòng thi chưa chính xác! Vui lòng hỏi lại Giáo viên phụ trách.'
        };
      }
    }

    // 2. Kiểm tra khung thời gian
    const now = new Date();
    if (room.startTime) {
      const start = new Date(room.startTime);
      if (now < start) {
        return {
          valid: false,
          room,
          reason: 'NOT_STARTED',
          message: `Phòng thi chưa đến giờ mở đề!\nThời gian mở thi: ${start.toLocaleString('vi-VN')}`,
          startTime: start
        };
      }
    }

    if (room.endTime) {
      const end = new Date(room.endTime);
      if (now > end) {
        return {
          valid: false,
          room,
          reason: 'EXPIRED',
          message: `Đã hết thời hạn làm bài của phòng thi này!\nThời gian đóng đề: ${end.toLocaleString('vi-VN')}`,
          endTime: end
        };
      }
    }

    // 3. Kiểm tra Giới hạn Khối lớp (Target Grade)
    const targetGrade = room.targetGrade || room.grade;
    if (user && targetGrade && targetGrade !== 'all') {
      if (user.grade && user.grade !== targetGrade) {
        return {
          valid: false,
          room,
          reason: 'GRADE_MISMATCH',
          message: `Bài thi này chỉ dành cho học sinh Khối ${targetGrade}!\n(Hồ sơ hiện tại của bạn là Khối ${user.grade || 'khác'}).`
        };
      }
    }

    // 4. Kiểm tra Giới hạn Trường học (Target School)
    if (user && room.targetSchool && room.targetSchool !== 'all') {
      const studentSchool = (user.school || '').trim().toLowerCase();
      const targetSchool = room.targetSchool.trim().toLowerCase();
      const isMatch = studentSchool.includes(targetSchool) || targetSchool.includes(studentSchool);
      if (!isMatch) {
        return {
          valid: false,
          room,
          reason: 'SCHOOL_MISMATCH',
          message: `Bài thi này được giao riêng cho trường: ${room.targetSchool}!\n(Trường hiện tại của bạn: ${user.school || 'Chưa cập nhật'}).`
        };
      }
    }

    // 5. Kiểm tra Giới hạn Lớp học (Target Class / Classes)
    const targetClass = room.targetClass || room.targetClasses;
    if (user && targetClass && targetClass !== 'all') {
      const studentClass = (user.className || '').trim().toUpperCase();
      let isAllowed = false;
      if (Array.isArray(targetClass)) {
        isAllowed = targetClass.some(c => c.trim().toUpperCase() === studentClass);
      } else if (typeof targetClass === 'string') {
        const allowedList = targetClass.split(',').map(c => c.trim().toUpperCase());
        isAllowed = allowedList.includes(studentClass);
      }
      if (!isAllowed) {
        const classNames = Array.isArray(targetClass) ? targetClass.join(', ') : targetClass;
        return {
          valid: false,
          room,
          reason: 'CLASS_MISMATCH',
          message: `Bài thi này được giao riêng cho lớp: ${classNames}!\n(Lớp hiện tại của bạn: ${user.className || 'Chưa cập nhật'}).`
        };
      }
    }

    return {
      valid: true,
      room,
      reason: 'OK',
      message: 'Hợp lệ'
    };
  },

  // --- QUẢN LÝ NGÂN HÀNG CÂU HỎI TÙY CHỈNH (CRUD GV & ADMIN) ---
  getCustomQuestions(grade) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_QUESTIONS);
      const all = data ? JSON.parse(data) : { '10': [], '11': [], '12': [] };
      return grade ? (all[grade] || []) : all;
    } catch (e) {
      return grade ? [] : { '10': [], '11': [], '12': [] };
    }
  },

  getModifiedQuestions() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MODIFIED_QUESTIONS);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  getDeletedQuestionIds() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DELETED_QUESTIONS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  saveQuestion(questionData) {
    try {
      const grade = String(questionData.grade || '12');
      const modifiedMap = this.getModifiedQuestions();
      const customAll = this.getCustomQuestions();
      if (!customAll[grade]) customAll[grade] = [];

      if (!questionData.id) {
        // Tạo câu hỏi mới
        const newId = `custom_${grade}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newQ = {
          ...questionData,
          id: newId,
          isCustom: true,
          createdAt: new Date().toISOString()
        };
        customAll[grade].unshift(newQ);
        localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customAll));
        return newQ;
      } else {
        // Cập nhật câu hỏi hiện có
        const id = questionData.id;
        // Kiểm tra xem có phải câu hỏi tự tạo trong customAll không
        const customIdx = customAll[grade].findIndex(q => q.id === id);
        if (customIdx >= 0) {
          customAll[grade][customIdx] = {
            ...customAll[grade][customIdx],
            ...questionData,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customAll));
          return customAll[grade][customIdx];
        } else {
          // Là câu hỏi gốc trong file JSON được sửa
          modifiedMap[id] = {
            ...questionData,
            isModified: true,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(STORAGE_KEYS.MODIFIED_QUESTIONS, JSON.stringify(modifiedMap));
          return modifiedMap[id];
        }
      }
    } catch (e) {
      console.error('Error saving question', e);
      return null;
    }
  },

  deleteQuestion(questionId, grade) {
    try {
      grade = String(grade);
      const customAll = this.getCustomQuestions();
      if (customAll[grade]) {
        const customIdx = customAll[grade].findIndex(q => q.id === questionId);
        if (customIdx >= 0) {
          customAll[grade].splice(customIdx, 1);
          localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customAll));
          return true;
        }
      }

      // Nếu là câu hỏi gốc, thêm vào danh sách deleted
      let deletedIds = this.getDeletedQuestionIds();
      if (!deletedIds.includes(questionId)) {
        deletedIds.push(questionId);
        localStorage.setItem(STORAGE_KEYS.DELETED_QUESTIONS, JSON.stringify(deletedIds));
      }

      // Xóa khỏi modified nếu có
      const modifiedMap = this.getModifiedQuestions();
      if (modifiedMap[questionId]) {
        delete modifiedMap[questionId];
        localStorage.setItem(STORAGE_KEYS.MODIFIED_QUESTIONS, JSON.stringify(modifiedMap));
      }
      return true;
    } catch (e) {
      console.error('Error deleting question', e);
      return false;
    }
  },

  resetQuestionsToDefault(grade = null) {
    try {
      if (grade) {
        grade = String(grade);
        const customAll = this.getCustomQuestions();
        customAll[grade] = [];
        localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customAll));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CUSTOM_QUESTIONS);
        localStorage.removeItem(STORAGE_KEYS.MODIFIED_QUESTIONS);
        localStorage.removeItem(STORAGE_KEYS.DELETED_QUESTIONS);
      }
      return true;
    } catch (e) {
      console.error('Error resetting questions', e);
      return false;
    }
  },

  applyCustomizations(grade, originalQuestions = []) {
    try {
      grade = String(grade);
      const deletedIds = new Set(this.getDeletedQuestionIds());
      const modifiedMap = this.getModifiedQuestions();
      const customQuestions = this.getCustomQuestions(grade);

      // 1. Lọc bỏ các câu đã bị xóa
      let result = originalQuestions.filter(q => !deletedIds.has(q.id));

      // 2. Thay thế các câu đã bị sửa
      result = result.map(q => {
        if (modifiedMap[q.id]) {
          return { ...q, ...modifiedMap[q.id] };
        }
        return q;
      });

      // 3. Ghép các câu hỏi tự thêm mới lên đầu hoặc cùng khối
      result = [...customQuestions, ...result];
      return result;
    } catch (e) {
      console.error('Error applying customizations', e);
      return originalQuestions;
    }
  },

  // --- BẢNG VINH DANH (LEADERBOARD THEO NGÀY / TUẦN / THÁNG / NĂM HỌC) ---
  getLeaderboard({ timeframe = 'today', grade = 'all' } = {}) {
    try {
      const history = this.getExamHistory();
      if (!history || history.length === 0) return [];

      const now = new Date();
      let startTime;

      if (timeframe === 'today') {
        // Từ 00:00:00 hôm nay
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      } else if (timeframe === 'week') {
        // Đầu tuần (Thứ Hai)
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0 là Thứ 2, 6 là CN
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
      } else if (timeframe === 'month') {
        // Đầu tháng
        startTime = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      } else if (timeframe === 'year') {
        // Năm học: Bắt đầu từ 01/08 của năm học hiện tại
        const currentMonth = now.getMonth(); // 0 - 11
        const schoolStartYear = (currentMonth >= 7) ? now.getFullYear() : (now.getFullYear() - 1);
        startTime = new Date(schoolStartYear, 7, 1, 0, 0, 0); // 01/08
      } else {
        startTime = new Date(0); // Tất cả
      }

      // Lọc theo mốc thời gian và khối (loại bỏ bài thi bị đình chỉ gian lận)
      const filtered = history.filter(item => {
        if (item.isDisqualified) return false;
        const itemDate = new Date(item.date);
        if (itemDate < startTime) return false;
        if (grade !== 'all' && String(item.grade) !== String(grade)) return false;
        return true;
      });

      // Gom theo học sinh: Mỗi học sinh chỉ lấy thành tích tốt nhất trong kỳ
      const studentBestMap = new Map();

      filtered.forEach(item => {
        const key = (item.studentEmail && item.studentEmail.trim()) 
          ? item.studentEmail.trim().toLowerCase() 
          : `${item.studentName}_${item.studentClass}_${item.studentSchool}`.toLowerCase();

        const existing = studentBestMap.get(key);
        if (!existing) {
          studentBestMap.set(key, item);
        } else {
          // So sánh thành tích: điểm cao hơn, hoặc bằng điểm thì thời gian ít hơn
          const isBetterScore = item.score > existing.score;
          const isSameScoreFaster = (item.score === existing.score && item.timeSpentSeconds < existing.timeSpentSeconds);
          if (isBetterScore || isSameScoreFaster) {
            studentBestMap.set(key, item);
          }
        }
      });

      // Sắp xếp bảng xếp hạng
      const leaderboard = Array.from(studentBestMap.values()).sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score; // Điểm cao hơn xếp trước
        }
        if (a.timeSpentSeconds !== b.timeSpentSeconds) {
          return a.timeSpentSeconds - b.timeSpentSeconds; // Nhanh hơn xếp trước
        }
        return new Date(b.date) - new Date(a.date); // Nộp sớm hơn
      });

      // Gắn thứ hạng
      return leaderboard.map((item, idx) => ({
        ...item,
        rank: idx + 1
      }));
    } catch (e) {
      console.error('Error generating leaderboard', e);
      return [];
    }
  },
  // --- CÀI ĐẶT ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? {
        theme: 'light', // 'light' | 'dark' | 'system'
        shuffleQuestions: true, // Mặc định bật xáo trộn thứ tự câu hỏi
        shuffleOptions: true,   // Mặc định bật xáo trộn phương án A, B, C, D
        autoNext: false,
        soundEnabled: true,
        ...JSON.parse(data)
      } : {
        theme: 'light',
        shuffleQuestions: true,
        shuffleOptions: true,
        autoNext: false,
        soundEnabled: true
      };
    } catch (e) {
      console.error('Error loading settings', e);
      return { theme: 'light', shuffleQuestions: true, shuffleOptions: true, autoNext: false, soundEnabled: true };
    }
  },

  saveSettings(settings) {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Error saving settings', e);
    }
  },

  // --- CÂU HỎI ĐÃ LƯU (BOOKMARKS) ---
  getBookmarks() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading bookmarks', e);
      return [];
    }
  },

  isBookmarked(questionId) {
    const list = this.getBookmarks();
    return list.some(item => item.id === questionId);
  },

  toggleBookmark(question) {
    try {
      let list = this.getBookmarks();
      const index = list.findIndex(item => item.id === question.id);
      let isAdded = false;

      if (index >= 0) {
        list.splice(index, 1);
        isAdded = false;
      } else {
        list.unshift({
          id: question.id,
          grade: question.grade,
          topic: question.topic,
          lesson: question.lesson,
          level: question.level,
          question: question.question,
          options: question.options,
          answer: question.answer,
          savedAt: new Date().toISOString()
        });
        isAdded = true;
      }

      localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(list));
      return isAdded;
    } catch (e) {
      console.error('Error toggling bookmark', e);
      return false;
    }
  },

  removeBookmark(questionId) {
    let list = this.getBookmarks();
    list = list.filter(item => item.id !== questionId);
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(list));
  },

  // --- LỊCH SỬ THI THỬ ---
  getExamHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXAM_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading exam history', e);
      return [];
    }
  },

  saveExamResult(result) {
    try {
      const history = this.getExamHistory();
      
      // Lấy thông tin học sinh hiện tại từ auth
      let student = { fullName: 'Thí sinh tự do', className: 'Tự do', school: 'Tự do', email: '' };
      try {
        const u = localStorage.getItem('tinhoc_user');
        if (u) {
          const parsed = JSON.parse(u);
          if (parsed.fullName) student.fullName = parsed.fullName;
          if (parsed.className) student.className = parsed.className;
          if (parsed.school) student.school = parsed.school;
          if (parsed.email) student.email = parsed.email;
        }
      } catch (err) {}

      const entry = {
        id: 'exam_' + Date.now(),
        date: new Date().toISOString(),
        title: result.title || 'Đề thi thử Tin học',
        grade: result.grade,
        score: result.score, // 0 - 10
        totalQuestions: result.totalQuestions,
        correctCount: result.correctCount,
        timeSpentSeconds: result.timeSpentSeconds,
        studentName: result.studentName || student.fullName,
        studentClass: result.studentClass || student.className,
        studentSchool: result.studentSchool || student.school,
        studentEmail: result.studentEmail || student.email,
        roomId: result.roomId || null,
        roomTitle: result.roomTitle || null,
        examCode: result.examCode || null,
        examType: result.examType || result.type || null,
        topic: result.topic || null,
        lesson: result.lesson || null,
        isProctored: !!result.isProctored,
        violationCount: result.violationCount || 0,
        violationLogs: result.violationLogs || [],
        isDisqualified: !!result.isDisqualified,
        disqualifiedReason: result.disqualifiedReason || '',
        details: result.details || [] // danh sách câu hỏi và câu trả lời
      };
      history.unshift(entry);
      // Giữ tối đa 100 bài thi gần nhất
      if (history.length > 100) history.pop();
      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));
      if (this.cloudSync) {
        this.cloudSync.pushExamResultToCloud(entry).catch(() => {});
      }

      // Tự động xóa phiên làm bài nháp sau khi đã nộp bài
      this.clearActiveExamSession();

      // Tự động ghi nhận chuỗi ngày học tập
      this.recordDailyActivity();

      // Tự động lưu các câu trả lời sai vào Ngân hàng câu hay sai
      if (Array.isArray(result.details)) {
        result.details.forEach(d => {
          if (!d.isCorrect && d.question) {
            this.recordWrongQuestion(d.question);
          } else if (d.isCorrect && d.question?.id) {
            this.markWrongQuestionResolved(d.question.id);
          }
        });
      }

      return entry;
    } catch (e) {
      console.error('Error saving exam result', e);
      return null;
    }
  },

  clearExamHistory() {
    localStorage.removeItem(STORAGE_KEYS.EXAM_HISTORY);
  },

  // --- LƯU NHÁP & KHÔI PHỤC BÀI THI ĐANG LÀM DỞ (AUTO-SAVE SESSION) ---
  saveActiveExamSession(sessionData) {
    try {
      if (!sessionData || !sessionData.examQuestions || sessionData.examQuestions.length === 0) return;
      const payload = {
        ...sessionData,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EXAM_SESSION, JSON.stringify(payload));
    } catch (e) {
      console.error('Error saving active exam session', e);
    }
  },

  getActiveExamSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_EXAM_SESSION);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Chỉ khôi phục các phiên làm bài trong vòng 3 giờ gần nhất và còn thời gian
      if (!data.savedAt || (Date.now() - data.savedAt) > 3 * 3600 * 1000 || (data.remainingSeconds || 0) <= 5) {
        this.clearActiveExamSession();
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  clearActiveExamSession() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXAM_SESSION);
  },

  // --- NGÂN HÀNG CÂU HỎI HAY SAI (SMART MISTAKE BANK) ---
  getWrongQuestions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WRONG_QUESTIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  recordWrongQuestion(question) {
    if (!question || !question.id) return;
    try {
      let list = this.getWrongQuestions();
      const idx = list.findIndex(item => item.id === question.id);
      if (idx >= 0) {
        list[idx].wrongCount = (list[idx].wrongCount || 1) + 1;
        list[idx].lastWrongAt = new Date().toISOString();
      } else {
        list.unshift({
          id: question.id,
          grade: question.grade,
          topic: question.topic,
          lesson: question.lesson,
          level: question.level,
          question: question.question,
          options: question.options,
          answer: question.answer,
          wrongCount: 1,
          lastWrongAt: new Date().toISOString()
        });
      }
      if (list.length > 200) list = list.slice(0, 200);
      localStorage.setItem(STORAGE_KEYS.WRONG_QUESTIONS, JSON.stringify(list));
    } catch (e) {
      console.error('Error recording wrong question', e);
    }
  },

  markWrongQuestionResolved(questionId) {
    if (!questionId) return;
    try {
      let list = this.getWrongQuestions();
      const filtered = list.filter(item => item.id !== questionId);
      if (filtered.length !== list.length) {
        localStorage.setItem(STORAGE_KEYS.WRONG_QUESTIONS, JSON.stringify(filtered));
      }
    } catch (e) {}
  },

  clearWrongQuestions() {
    localStorage.removeItem(STORAGE_KEYS.WRONG_QUESTIONS);
  },

  // --- GHI CHÚ CÁ NHÂN CHO TỪNG CÂU HỎI (PERSONAL NOTES) ---
  getAllQuestionNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_NOTES);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  getQuestionNote(questionId) {
    if (!questionId) return '';
    const notes = this.getAllQuestionNotes();
    return notes[questionId] || '';
  },

  saveQuestionNote(questionId, noteText) {
    if (!questionId) return;
    try {
      const notes = this.getAllQuestionNotes();
      const clean = (noteText || '').trim();
      if (clean) {
        notes[questionId] = clean;
      } else {
        delete notes[questionId];
      }
      localStorage.setItem(STORAGE_KEYS.USER_NOTES, JSON.stringify(notes));
    } catch (e) {
      console.error('Error saving question note', e);
    }
  },

  // --- CHUỖI NGÀY HỌC LIÊN TIẾP (DAILY STUDY STREAK) ---
  getStudyStreak() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STUDY_STREAK);
      if (!raw) return { streak: 0, lastDate: null, todayCount: 0 };
      const data = JSON.parse(raw);
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (data.lastDate !== todayStr && data.lastDate !== yesterdayStr) {
        return { streak: 0, lastDate: data.lastDate, todayCount: 0 };
      }
      return {
        streak: data.streak || 0,
        lastDate: data.lastDate,
        todayCount: data.lastDate === todayStr ? (data.todayCount || 0) : 0
      };
    } catch (e) {
      return { streak: 0, lastDate: null, todayCount: 0 };
    }
  },

  recordDailyActivity() {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const raw = localStorage.getItem(STORAGE_KEYS.STUDY_STREAK);
      let data = raw ? JSON.parse(raw) : { streak: 0, lastDate: null, todayCount: 0 };

      if (data.lastDate === todayStr) {
        data.todayCount = (data.todayCount || 0) + 1;
      } else if (data.lastDate === yesterdayStr) {
        data.streak = (data.streak || 0) + 1;
        data.lastDate = todayStr;
        data.todayCount = 1;
      } else {
        data.streak = 1;
        data.lastDate = todayStr;
        data.todayCount = 1;
      }
      localStorage.setItem(STORAGE_KEYS.STUDY_STREAK, JSON.stringify(data));
      return data;
    } catch (e) {
      return { streak: 1, lastDate: null, todayCount: 1 };
    }
  },

  // --- THỐNG KÊ LUYỆN TẬP ---
  getPracticeStats() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRACTICE_STATS);
      return data ? JSON.parse(data) : { total: 0, correct: 0, wrong: 0 };
    } catch (e) {
      return { total: 0, correct: 0, wrong: 0 };
    }
  },

  recordPracticeResult(isCorrect, question = null) {
    try {
      const stats = this.getPracticeStats();
      stats.total += 1;
      if (isCorrect) {
        stats.correct += 1;
        if (question?.id) this.markWrongQuestionResolved(question.id);
      } else {
        stats.wrong += 1;
        if (question) this.recordWrongQuestion(question);
      }
      localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(stats));
      this.recordDailyActivity();
      return stats;
    } catch (e) {
      console.error('Error recording practice result', e);
    }
  },

  // --- SAO LƯU & PHỤC HỒI DỮ LIỆU ---
  exportBackup() {
    return JSON.stringify({
      version: '1.1',
      exportedAt: new Date().toISOString(),
      bookmarks: this.getBookmarks(),
      history: this.getExamHistory(),
      settings: this.getSettings(),
      stats: this.getPracticeStats(),
      examRooms: this.getExamRooms(),
      accounts: this.getAccountsList(),
      adminConfig: this.getAdminConfig(),
      customQuestions: this.getCustomQuestions(),
      modifiedQuestions: this.getModifiedQuestions(),
      deletedQuestions: this.getDeletedQuestionIds()
    }, null, 2);
  },

  importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.bookmarks) localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(data.bookmarks));
      if (data.history) localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(data.history));
      if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.stats) localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(data.stats));
      if (data.examRooms) localStorage.setItem(STORAGE_KEYS.EXAM_ROOMS, JSON.stringify(data.examRooms));
      if (data.accounts) localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(data.accounts));
      if (data.adminConfig) localStorage.setItem(STORAGE_KEYS.ADMIN_CONFIG, JSON.stringify(data.adminConfig));
      if (data.customQuestions) localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(data.customQuestions));
      if (data.modifiedQuestions) localStorage.setItem(STORAGE_KEYS.MODIFIED_QUESTIONS, JSON.stringify(data.modifiedQuestions));
      if (data.deletedQuestions) localStorage.setItem(STORAGE_KEYS.DELETED_QUESTIONS, JSON.stringify(data.deletedQuestions));
      return true;
    } catch (e) {
      console.error('Invalid backup data', e);
      return false;
    }
  }
};

