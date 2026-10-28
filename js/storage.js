/**
 * tinhoc-hub: Storage Manager (LocalStorage)
 * Quản lý dữ liệu người dùng: Lịch sử thi, câu hỏi đã lưu, cài đặt, thống kê
 */

const STORAGE_KEYS = {
  BOOKMARKS: 'tinhoc_bookmarks',
  EXAM_HISTORY: 'tinhoc_exam_history',
  SETTINGS: 'tinhoc_settings',
  PRACTICE_STATS: 'tinhoc_practice_stats'
};

export const Storage = {
  // --- CÀI ĐẶT ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        theme: 'light', // 'light' | 'dark' | 'system'
        shuffleOptions: true,
        autoNext: false,
        soundEnabled: true
      };
    } catch (e) {
      console.error('Error loading settings', e);
      return { theme: 'light', shuffleOptions: true, autoNext: false, soundEnabled: true };
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
      const entry = {
        id: 'exam_' + Date.now(),
        date: new Date().toISOString(),
        title: result.title || 'Đề thi thử Tin học',
        grade: result.grade,
        score: result.score, // 0 - 10
        totalQuestions: result.totalQuestions,
        correctCount: result.correctCount,
        timeSpentSeconds: result.timeSpentSeconds,
        details: result.details || [] // danh sách câu hỏi và câu trả lời
      };
      history.unshift(entry);
      // Giữ tối đa 50 bài thi gần nhất
      if (history.length > 50) history.pop();
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

