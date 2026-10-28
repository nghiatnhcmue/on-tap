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
  ADMIN_CONFIG: 'tinhoc_admin_config'
};

export const Storage = {
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
    if (!user || !user.email) return;
    try {
      let list = this.getAccountsList();
      const idx = list.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
      const record = {
        uid: user.uid,
        email: user.email,
        fullName: user.fullName || 'Người dùng',
        className: user.className || '',
        school: user.school || '',
        role: user.role || 'student',
        lastActive: new Date().toISOString()
      };
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.push(record);
      }
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
    } catch (e) {
      console.error('Error saving account record', e);
    }
  },

  updateAccountRole(email, newRole) {
    try {
      let list = this.getAccountsList();
      const user = list.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        user.role = newRole;
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
      }
      // Cập nhật session hiện tại nếu trùng email
      const currentUserStr = localStorage.getItem('tinhoc_user');
      if (currentUserStr) {
        const cur = JSON.parse(currentUserStr);
        if (cur.email.toLowerCase() === email.toLowerCase()) {
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

      // Lọc theo mốc thời gian và khối
      const filtered = history.filter(item => {
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
        details: result.details || [] // danh sách câu hỏi và câu trả lời
      };
      history.unshift(entry);
      // Giữ tối đa 100 bài thi gần nhất
      if (history.length > 100) history.pop();
      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));
      return entry;
    } catch (e) {
      console.error('Error saving exam result', e);
      return null;
    }
  },

  clearExamHistory() {
    localStorage.removeItem(STORAGE_KEYS.EXAM_HISTORY);
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

  recordPracticeResult(isCorrect) {
    try {
      const stats = this.getPracticeStats();
      stats.total += 1;
      if (isCorrect) stats.correct += 1;
      else stats.wrong += 1;
      localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(stats));
      return stats;
    } catch (e) {
      console.error('Error recording practice result', e);
    }
  },

  // --- SAO LƯU & PHỤC HỒI DỮ LIỆU ---
  exportBackup() {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      bookmarks: this.getBookmarks(),
      history: this.getExamHistory(),
      settings: this.getSettings(),
      stats: this.getPracticeStats()
    }, null, 2);
  },

  importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.bookmarks) localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(data.bookmarks));
      if (data.history) localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(data.history));
      if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.stats) localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(data.stats));
      return true;
    } catch (e) {
      console.error('Invalid backup data', e);
      return false;
    }
  }
};

