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
  MASTERED_QUESTIONS: 'tinhoc_mastered_questions',
  USER_NOTES: 'tinhoc_user_notes',
  STUDY_STREAK: 'tinhoc_study_streak',
  VIDEO_CONFIG: 'tinhoc_video_config',
  VIDEO_PROGRESS: 'tinhoc_video_progress',
  CUSTOM_VIDEO_QUESTIONS: 'tinhoc_custom_video_questions',
  CUSTOM_VIDEO_URLS: 'tinhoc_custom_video_urls',
  SCHOOLS_DATA: 'tinhoc_schools_data',
  SUBJECTS: 'tinhoc_subjects_list',
  TEACHER_ASSIGNMENTS: 'tinhoc_teacher_assignments',
  TEACHER_CONTRIBUTIONS: 'tinhoc_teacher_contributions',
  TEACHER_VIDEOS: 'tinhoc_teacher_videos',
  ARENA_ROOMS: 'tinhoc_arena_rooms',
  ARENA_HISTORY: 'tinhoc_arena_history',
  ARENA_PLAYER: 'tinhoc_arena_player',
  CLASSROOM_PRESETS: 'tinhoc_classroom_presets'
};

export const DEFAULT_FIREBASE_API_KEY = 'AIzaSyBOn_vHOZXDhRPpeOhjuZOiECpCRfhXPA0';
export const DEFAULT_ARCHIVE_ACCESS_KEY = '';
export const DEFAULT_ARCHIVE_SECRET_KEY = '';
export const DEFAULT_SCHOOLS_DATA = {
  'EMASI': {
    name: 'Hệ thống Trường Song ngữ Quốc tế EMASI',
    aliases: ['EMASI', 'Trường EMASI', 'Song ngữ EMASI', 'Trường Song ngữ Quốc tế EMASI'],
    classes: {
      '10': ['10E', '10I1', '10I2'],
      '11': ['11E'],
      '12': ['12E']
    }
  },
  'Phổ thông Năng khiếu': {
    name: 'Trường Phổ thông Năng khiếu - ĐHQG TP.HCM',
    aliases: ['PTNK', 'Phổ thông Năng khiếu', 'Phổ thông Năng Khiếu', 'Trường PTNK', 'THPT Năng Khiếu', 'Trường Phổ thông Năng khiếu'],
    classes: {
      '10': ['10TOAN', '10TIN', '10LI', '10HOA', '10SINH', '10VAN', '10ANH'],
      '11': ['11TOAN', '11TIN', '11LI', '11HOA', '11SINH', '11VAN', '11ANH'],
      '12': ['12TOAN', '12LI', '12HOA', '12SINH', '12VAN', '12ANH']
    }
  },
  'TT GDNN GDTX Chu Văn An': {
    name: 'Trung tâm GDNN - GDTX Chu Văn An',
    aliases: [
      'TT GDNN GDTX Chu Văn An',
      'TT GDNN - GDTX Chu Văn An',
      'THPT Chu Văn An',
      'Chu Văn An',
      'CVA',
      'TT GDTX Chu Văn An'
    ],
    classes: {
      '10': ['10TN', '10A1', '10A2', '10A3', '10A4', '10A5', '10A6', '10A7', '10A8', '10A9', '10A10', '10A11', '10A12'],
      '11': ['11A1', '11A2', '11A3', '11A4', '11A5'],
      '12': ['12A1', '12A2', '12A3', '12A4', '12A5', '12A6', '12A7', '12A8', '12A9', '12A10']
    }
  }
};

export const DEFAULT_SUBJECTS = ['Tin học', 'Chuyên đề Tin học', 'Công nghệ'];

// ============================================================================
// INDEXEDDB CLIENT-SIDE CACHE CHO TÀI NGUYÊN LỚN (JSON ASSETS)
// Tối ưu hóa băng thông trường học: grade_10.json, grade_11.json, grade_12.json, manifest.json
// Cache tồn tại lâu dài, tự động vô hiệu khi có bản build mới (CURRENT_BUILD)
// ============================================================================

export const CURRENT_BUILD = '20261112_295';

const IDB_CACHE_NAME = 'tinhochub_cache';
const IDB_CACHE_VERSION = 1;
const IDB_CACHE_STORE = 'json_cache';

let _idbPromise = null;

function getIdbFactory() {
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      return window.indexedDB;
    }
    if (typeof indexedDB !== 'undefined') {
      return indexedDB;
    }
  } catch (_) {}
  return null;
}

function getIdb() {
  const idbFactory = getIdbFactory();
  if (!idbFactory) {
    return Promise.resolve(null);
  }

  if (_idbPromise) {
    return _idbPromise;
  }

  _idbPromise = new Promise((resolve) => {
    try {
      const request = idbFactory.open(IDB_CACHE_NAME, IDB_CACHE_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(IDB_CACHE_STORE)) {
            db.createObjectStore(IDB_CACHE_STORE, { keyPath: 'key' });
          }
        } catch (upgradeErr) {
          console.warn('[IndexedDB Cache] Lỗi tạo objectStore:', upgradeErr);
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        db.onversionchange = () => {
          try { db.close(); } catch (_) {}
          _idbPromise = null;
        };
        db.onclose = () => {
          _idbPromise = null;
        };
        resolve(db);
      };

      request.onerror = (err) => {
        console.warn('[IndexedDB Cache] Không thể mở IndexedDB (chế độ ẩn danh hoặc bị chặn):', err);
        _idbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[IndexedDB Cache] Kết nối IndexedDB bị chặn bởi phiên làm việc khác');
        _idbPromise = null;
        resolve(null);
      };
    } catch (e) {
      console.warn('[IndexedDB Cache] Ngoại lệ khi mở IndexedDB:', e);
      _idbPromise = null;
      resolve(null);
    }
  });

  return _idbPromise;
}

/**
 * Đọc dữ liệu JSON từ IndexedDB cache.
 * Trả về dữ liệu nếu tìm thấy và phiên bản khớp với expectedVersion.
 * Trả về null nếu không có, sai phiên bản, hoặc IndexedDB bị lỗi/bị chặn.
 * @param {string} key - Tên khóa tài sản (vd: 'grade_10', 'manifest')
 * @param {string} [expectedVersion] - Phiên bản mong muốn (vd: CURRENT_BUILD '20261112_295')
 * @returns {Promise<any|null>}
 */
export async function getCachedJson(key, expectedVersion) {
  if (!key) return null;
  const cleanKey = String(key).trim();
  try {
    const db = await getIdb();
    if (!db) return null;

    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, 'readonly');
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);

        const store = tx.objectStore(IDB_CACHE_STORE);
        const req = store.get(cleanKey);

        const checkRecord = (record, targetKey) => {
          if (!record || record.data === undefined || record.data === null) {
            return false;
          }
          if (expectedVersion && record.version !== expectedVersion) {
            // Bản ghi cũ: kích hoạt xóa ngầm để dọn dẹp bộ nhớ
            try {
              const delTx = db.transaction(IDB_CACHE_STORE, 'readwrite');
              delTx.objectStore(IDB_CACHE_STORE).delete(targetKey);
            } catch (_) {}
            return false;
          }
          return true;
        };

        req.onsuccess = () => {
          const record = req.result;
          if (checkRecord(record, cleanKey)) {
            return resolve(record.data);
          }
          // Thử key phụ tương thích (vd: 'grade_10.json' <-> 'grade_10')
          const altKey = cleanKey.endsWith('.json')
            ? cleanKey.replace(/\.json$/i, '')
            : `${cleanKey}.json`;
          const altReq = store.get(altKey);
          altReq.onsuccess = () => {
            const altRecord = altReq.result;
            if (checkRecord(altRecord, altKey)) {
              return resolve(altRecord.data);
            }
            resolve(null);
          };
          altReq.onerror = () => resolve(null);
        };

        req.onerror = () => resolve(null);
      } catch (txErr) {
        _idbPromise = null;
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Lưu dữ liệu JSON vào IndexedDB cache kèm phiên bản và nhãn thời gian.
 * @param {string} key - Tên khóa tài sản (vd: 'grade_10', 'manifest')
 * @param {string} version - Phiên bản hiện tại (vd: CURRENT_BUILD '20261112_295')
 * @param {any} data - Dữ liệu JSON cần cache
 * @returns {Promise<boolean>} Trả về true nếu thành công, false nếu thất bại/bị chặn
 */
export async function setCachedJson(key, version, data) {
  if (!key || data === undefined || data === null) return false;
  const cleanKey = String(key).trim();
  try {
    const db = await getIdb();
    if (!db) return false;

    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, 'readwrite');
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);

        const store = tx.objectStore(IDB_CACHE_STORE);
        const record = {
          key: cleanKey,
          version: String(version || ''),
          data,
          timestamp: Date.now()
        };
        const req = store.put(record);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (txErr) {
        _idbPromise = null;
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

/**
 * Xóa cache JSON cụ thể hoặc toàn bộ kho cache IndexedDB
 * @param {string} [key] - Khóa cần xóa, để trống nếu xóa toàn bộ
 * @returns {Promise<boolean>}
 */
export async function clearJsonCache(key) {
  try {
    const db = await getIdb();
    if (!db) return false;

    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_CACHE_STORE, 'readwrite');
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);

        const store = tx.objectStore(IDB_CACHE_STORE);
        const req = key ? store.delete(String(key).trim()) : store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (txErr) {
        _idbPromise = null;
        resolve(false);
      }
    });
  } catch (e) {
    return false;
  }
}

export const Storage = {
  cloudSync: null,

  getCloudSync() {
    return this.cloudSync || (typeof window !== 'undefined' ? window.CloudSync : null);
  },

  // --- CLIENT-SIDE INDEXEDDB CACHE CHO JSON ASSETS ---
  getCachedJson(key, expectedVersion) {
    return getCachedJson(key, expectedVersion);
  },

  setCachedJson(key, version, data) {
    return setCachedJson(key, version, data);
  },

  clearJsonCache(key) {
    return clearJsonCache(key);
  },

  // --- CẤU HÌNH VIDEO BÀI GIẢNG & ARCHIVE.ORG S3 ---
  getVideoConfig() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VIDEO_CONFIG);
      let parsed = data ? JSON.parse(data) : {
        archiveAccessKey: DEFAULT_ARCHIVE_ACCESS_KEY,
        archiveSecretKey: DEFAULT_ARCHIVE_SECRET_KEY,
        archiveIdentifier: 'tinhoc-hub-thpt',
        videoBaseUrl: 'https://archive.org/cors/tinhoc-hub-thpt/',
        uploadedVideos: {}
      };
      parsed.archiveAccessKey = '';
      parsed.archiveSecretKey = '';
      // Tự động chuyển đổi download/ sang cors/ để chống lỗi ERR_CONNECTION_RESET tại Việt Nam
      if (parsed.videoBaseUrl && parsed.videoBaseUrl.includes('archive.org/download/')) {
        parsed.videoBaseUrl = parsed.videoBaseUrl.replace('archive.org/download/', 'archive.org/cors/');
      }
      return parsed;
    } catch (e) {
      return {
        archiveAccessKey: DEFAULT_ARCHIVE_ACCESS_KEY,
        archiveSecretKey: DEFAULT_ARCHIVE_SECRET_KEY,
        archiveIdentifier: 'tinhoc-hub-thpt',
        videoBaseUrl: 'https://archive.org/cors/tinhoc-hub-thpt/',
        uploadedVideos: {}
      };
    }
  },

  saveVideoConfig(config, pushToCloud = true) {
    try {
      const current = this.getVideoConfig();
      const updated = {
        ...current,
        ...config,
        archiveAccessKey: '',
        archiveSecretKey: ''
      };
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
      if (pushToCloud) {
        const cs = this.cloudSync || (typeof window !== 'undefined' ? window.CloudSync : null);
        if (cs && typeof cs.pushVideoConfigToCloud === 'function') {
          cs.pushVideoConfigToCloud(updated).catch(() => {});
        }
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
      this.notifyUserProgressChanged();
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
      result.apiKey = cloudCfg.apiKey || adminCfg.firebaseApiKey || DEFAULT_FIREBASE_API_KEY;
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
    let cleanKey = String(result.apiKey || DEFAULT_FIREBASE_API_KEY).trim().replace(/['";,\s]/g, '');
    const m = cleanKey.match(/AIza[A-Za-z0-9_-]{30,}/);
    if (m) cleanKey = m[0];
    if (!cleanKey.startsWith('AIza') || cleanKey.length < 25) {
      result.apiKey = DEFAULT_FIREBASE_API_KEY;
    } else {
      result.apiKey = cleanKey;
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
  getDefaultTestAccounts() {
    return [
      {
        uid: 'admin',
        username: 'admin',
        email: 'admin.tinhoc@gmail.com',
        password: '123456',
        fullName: 'Thầy Nghĩa (Quản trị viên)',
        grade: '12',
        className: 'Quản trị hệ thống',
        school: 'Ban Quản Trị TinHocHub',
        avatar: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2228%22%20fill%3D%22%23ef4444%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2258%22%20font-family%3D%22sans-serif%22%20font-size%3D%2236%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3EAD%3C%2Ftext%3E%3C%2Fsvg%3E',
        role: 'admin',
        createdAt: '2026-10-30T00:00:00.000Z',
        lastActive: '2026-10-30T02:00:00.000Z'
      },
      {
        uid: 'tesths',
        username: 'tesths',
        email: 'tesths@tinhoc.edu.vn',
        password: '123456',
        fullName: 'Nguyễn Minh Khôi (tesths)',
        grade: '12',
        className: '12A1',
        school: 'TT GDNN GDTX Chu Văn An',
        avatar: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2228%22%20fill%3D%22%233b82f6%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2258%22%20font-family%3D%22sans-serif%22%20font-size%3D%2236%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ENK%3C%2Ftext%3E%3C%2Fsvg%3E',
        role: 'student',
        profileCompleted: true,
        firstLoginDone: true,
        createdAt: '2026-10-30T00:00:00.000Z',
        lastActive: '2026-10-30T02:00:00.000Z'
      },
      {
        uid: 'testgv',
        username: 'testgv',
        email: 'testgv@tinhoc.edu.vn',
        password: '123456',
        fullName: 'Thầy Trần Văn Minh (testgv)',
        grade: '12',
        className: '12A1',
        school: 'TT GDNN GDTX Chu Văn An',
        avatar: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2228%22%20fill%3D%22%238b5cf6%22%2F%3E%3Ctext%20x%3D%2250%22%20y%3D%2258%22%20font-family%3D%22sans-serif%22%20font-size%3D%2236%22%20font-weight%3D%22bold%22%20fill%3D%22%23fff%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%3ETM%3C%2Ftext%3E%3C%2Fsvg%3E',
        role: 'teacher',
        createdAt: '2026-10-30T00:00:00.000Z',
        lastActive: '2026-10-30T02:00:00.000Z'
      }
    ];
  },

  getAccountsList() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS) || localStorage.getItem('tinhoc_accounts');
      const list = data ? JSON.parse(data) : [];
      const defaults = this.getDefaultTestAccounts();
      let changed = false;
      if (localStorage.getItem('tinhoc_accounts')) {
        localStorage.removeItem('tinhoc_accounts');
        changed = true;
      }
      defaults.forEach(def => {
        const exists = list.some(u =>
          (u.email && u.email.toLowerCase() === def.email.toLowerCase()) ||
          (u.uid && u.uid.toLowerCase() === def.uid.toLowerCase()) ||
          (u.username && u.username.toLowerCase() === def.username.toLowerCase())
        );
        if (!exists) {
          list.push(def);
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
      }
      return list;
    } catch (e) {
      return this.getDefaultTestAccounts();
    }
  },

  saveAccountRecord(user) {
    if (!user) return;
    const identifier = (user.email && user.email.trim()) ? user.email.trim().toLowerCase() : (user.uid || '');
    if (!identifier) return;
    try {
      let list = this.getAccountsList();
      const idx = list.findIndex(u =>
        (u.email && u.email.toLowerCase() === identifier) ||
        (u.uid && u.uid.toLowerCase() === identifier) ||
        (user.username && u.username && u.username.toLowerCase() === user.username.toLowerCase())
      );
      const record = {
        uid: user.uid || (idx >= 0 ? list[idx].uid : ('user_' + Date.now())),
        username: user.username || (idx >= 0 ? list[idx].username : (user.email ? user.email.split('@')[0] : '')),
        email: user.email || (idx >= 0 ? list[idx].email : ''),
        fullName: user.fullName || 'Người dùng',
        grade: user.grade || '12',
        className: user.className || '',
        school: user.school || '',
        avatar: user.avatar || '',
        role: user.role || 'student',
        password: user.password || (idx >= 0 ? list[idx].password : '') || '',
        profileCompleted: Boolean(user.profileCompleted || user.profileUpdatedAt || (idx >= 0 && list[idx].profileCompleted) || (user.school && user.className)),
        firstLoginDone: Boolean(user.firstLoginDone || (idx >= 0 && list[idx].firstLoginDone) || (user.school && user.className) || user.profileCompleted),
        profileUpdatedAt: user.profileUpdatedAt || (idx >= 0 ? list[idx].profileUpdatedAt : null) || null,
        lastActive: user.lastActive || new Date().toISOString()
      };
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...record };
      } else {
        list.unshift(record);
      }
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
      const cs = this.getCloudSync();
      const shouldPushCloud = record.role !== 'student' || record.profileCompleted || Boolean(record.profileUpdatedAt);
      if (cs && typeof cs.pushAccountToCloud === 'function' && shouldPushCloud) {
        cs.pushAccountToCloud(record).catch(() => {});
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
        const cs = this.getCloudSync();
        if (cs && typeof cs.pushAccountToCloud === 'function') {
          cs.pushAccountToCloud(user).catch(() => {});
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

  updateAccount(emailOrUid, updatedData) {
    if (!emailOrUid || !updatedData) return null;
    try {
      const target = String(emailOrUid).trim().toLowerCase();
      let list = this.getAccountsList();
      const user = list.find(u =>
        (u.email && u.email.toLowerCase() === target) ||
        (u.uid && u.uid.toLowerCase() === target) ||
        (u.username && u.username.toLowerCase() === target)
      );
      if (!user) return null;

      if (updatedData.fullName !== undefined) user.fullName = String(updatedData.fullName).trim();
      if (updatedData.email !== undefined && String(updatedData.email).trim()) {
        user.email = String(updatedData.email).trim().toLowerCase();
      }
      if (updatedData.username !== undefined && String(updatedData.username).trim()) {
        user.username = String(updatedData.username).trim().toLowerCase();
      }
      if (updatedData.grade !== undefined) user.grade = String(updatedData.grade).trim();
      if (updatedData.className !== undefined) user.className = String(updatedData.className).trim();
      if (updatedData.school !== undefined) user.school = String(updatedData.school).trim();
      if (updatedData.role !== undefined) user.role = String(updatedData.role).trim();
      if (updatedData.password !== undefined && String(updatedData.password).trim()) {
        user.password = String(updatedData.password).trim();
      }
      user.profileCompleted = true;
      user.profileUpdatedAt = new Date().toISOString();
      user.lastActive = new Date().toISOString();

      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(list));
      localStorage.setItem('tinhoc_user_accounts', JSON.stringify(list));

      const cs = this.getCloudSync();
      if (cs && typeof cs.pushAccountToCloud === 'function') {
        cs.pushAccountToCloud(user).catch(() => {});
      }

      // Cập nhật session hiện tại nếu tài khoản đang đăng nhập
      const currentUserStr = localStorage.getItem('tinhoc_user');
      if (currentUserStr) {
        try {
          const cur = JSON.parse(currentUserStr);
          if ((cur.email && cur.email.toLowerCase() === target) || (cur.uid && cur.uid.toLowerCase() === target)) {
            const updatedCur = { ...cur, ...user };
            localStorage.setItem('tinhoc_user', JSON.stringify(updatedCur));
          }
        } catch (e) {}
      }

      return user;
    } catch (e) {
      console.error('Error updating account', e);
      return null;
    }
  },

  deleteAccount(emailOrUid) {
    if (!emailOrUid) return false;
    try {
      const target = String(emailOrUid).trim().toLowerCase();
      let list = this.getAccountsList();
      const userToDelete = list.find(u =>
        (u.email && u.email.toLowerCase() === target) ||
        (u.uid && u.uid.toLowerCase() === target) ||
        (u.username && u.username.toLowerCase() === target)
      );
      if (!userToDelete) return false;

      const filtered = list.filter(u =>
        (u.email && u.email.toLowerCase() === target) ? false :
        (u.uid && u.uid.toLowerCase() === target) ? false :
        (u.username && u.username.toLowerCase() === target) ? false : true
      );

      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(filtered));
      localStorage.setItem('tinhoc_user_accounts', JSON.stringify(filtered));

      const cs = this.getCloudSync();
      if (cs && typeof cs.deleteAccountFromCloud === 'function') {
        cs.deleteAccountFromCloud(userToDelete.email || userToDelete.uid || userToDelete.username).catch(() => {});
      }

      return true;
    } catch (e) {
      console.error('Error deleting account', e);
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
    const cleanId = String(roomId).trim().toUpperCase();
    const compactId = cleanId.replace(/[-_\s]/g, '');
    return rooms.find(r => {
      const rId = String(r.id || '').trim().toUpperCase();
      const rPin = String(r.pin || '').trim().toUpperCase();
      return rId === cleanId || rPin === cleanId || rId.replace(/[-_\s]/g, '') === compactId || rPin.replace(/[-_\s]/g, '') === compactId;
    }) || null;
  },

  saveExamRoom(roomData, skipCloud = false) {
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
      if (!skipCloud) {
        const cs = this.getCloudSync();
        if (cs && typeof cs.pushRoomToCloud === 'function') {
          cs.pushRoomToCloud(newRoom).catch(() => {});
        }
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
      const cs = this.getCloudSync();
      if (cs && typeof cs.deleteRoomFromCloud === 'function') {
        cs.deleteRoomFromCloud(cleanId).catch(() => {});
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
        message: 'Mã phòng thi không tồn tại trong hệ thống! Em vui lòng kiểm tra lại mã phòng hoặc mã PIN do Thầy/Cô cung cấp nhé.'
      };
    }

    if (room.isDeleted || room.status === 'closed' || room.status === 'archived') {
      return {
        valid: false,
        room,
        reason: 'CLOSED',
        message: `Phòng thi [${room.title || room.id}] hiện đã đóng hoặc chưa được Thầy/Cô mở!\nEm hãy liên hệ với Thầy/Cô phụ trách để biết thời gian mở phòng thi nhé.`
      };
    }

    const isPrivileged = !!(user && (user.role === 'admin' || user.role === 'teacher'));

    // 1. Kiểm tra mật khẩu (nếu phòng có cài mật khẩu và người vào không phải Admin)
    if (!isPrivileged && room.password && room.password.trim() !== '') {
      if (!enteredPassword || enteredPassword.trim() !== room.password.trim()) {
        return {
          valid: false,
          room,
          reason: 'WRONG_PASSWORD',
          message: 'Mật khẩu vào phòng thi chưa chính xác! Vui lòng hỏi lại Giáo viên phụ trách.'
        };
      }
    }

    // Nếu là Quản trị viên (Admin) hoặc Giáo viên (GV) -> Cho phép vào thẳng mọi phòng thi để kiểm tra/giám sát
    if (isPrivileged) {
      return {
        valid: true,
        room,
        reason: 'OK',
        message: 'Hợp lệ'
      };
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
        const cs = this.getCloudSync();
        if (cs && typeof cs.pushCustomQuestionsToCloud === 'function') {
          cs.pushCustomQuestionsToCloud().catch(() => {});
        }
        return newQ;
      } else {
        // Cập nhật câu hỏi hiện có
        const id = questionData.id;
        let resQuestion = null;
        // Kiểm tra xem có phải câu hỏi tự tạo trong customAll không
        const customIdx = customAll[grade].findIndex(q => q.id === id);
        if (customIdx >= 0) {
          customAll[grade][customIdx] = {
            ...customAll[grade][customIdx],
            ...questionData,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(STORAGE_KEYS.CUSTOM_QUESTIONS, JSON.stringify(customAll));
          resQuestion = customAll[grade][customIdx];
        } else {
          // Là câu hỏi gốc trong file JSON được sửa
          modifiedMap[id] = {
            ...questionData,
            isModified: true,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(STORAGE_KEYS.MODIFIED_QUESTIONS, JSON.stringify(modifiedMap));
          resQuestion = modifiedMap[id];
        }
        const cs = this.getCloudSync();
        if (cs && typeof cs.pushCustomQuestionsToCloud === 'function') {
          cs.pushCustomQuestionsToCloud().catch(() => {});
        }
        return resQuestion;
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
          const cs = this.getCloudSync();
          if (cs && typeof cs.pushCustomQuestionsToCloud === 'function') {
            cs.pushCustomQuestionsToCloud().catch(() => {});
          }
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
      const cs = this.getCloudSync();
      if (cs && typeof cs.pushCustomQuestionsToCloud === 'function') {
        cs.pushCustomQuestionsToCloud().catch(() => {});
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
      const cs = this.getCloudSync();
      if (cs && typeof cs.pushCustomQuestionsToCloud === 'function') {
        cs.pushCustomQuestionsToCloud().catch(() => {});
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

      // Lọc theo mốc thời gian và khối (loại bỏ bài thi bị đình chỉ gian lận hoặc bài thi cài đặt bảo mật ẩn điểm)
      const filtered = history.filter(item => {
        if (item.isDisqualified) return false;
        if (item.resultDisplayMode === 'hidden') return false;
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
      this.notifyUserProgressChanged();
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
    this.notifyUserProgressChanged();
  },

  // --- ĐỒNG BỘ TIẾN TRÌNH HỌC TẬP CÁ NHÂN THEO TỪNG TÀI KHOẢN ---
  getUserProgressSnapshot() {
    return {
      practiceStats: this.getPracticeStats(),
      bookmarks: this.getBookmarks(),
      wrongQuestions: this.getWrongQuestions(),
      masteredQuestions: this.getAllMasteredQuestions(),
      studyStreak: this.getStudyStreak(),
      userNotes: this.getAllQuestionNotes(),
      videoProgress: this.getAllVideoProgress(),
      updatedAt: new Date().toISOString()
    };
  },

  applyUserProgressSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    try {
      if (snap.practiceStats) localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(snap.practiceStats));
      if (Array.isArray(snap.bookmarks)) localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(snap.bookmarks));
      if (Array.isArray(snap.wrongQuestions)) localStorage.setItem(STORAGE_KEYS.WRONG_QUESTIONS, JSON.stringify(snap.wrongQuestions));
      if (snap.masteredQuestions) localStorage.setItem(STORAGE_KEYS.MASTERED_QUESTIONS, JSON.stringify(snap.masteredQuestions));
      if (snap.studyStreak) localStorage.setItem(STORAGE_KEYS.STUDY_STREAK, JSON.stringify(snap.studyStreak));
      if (snap.userNotes) localStorage.setItem(STORAGE_KEYS.USER_NOTES, JSON.stringify(snap.userNotes));
      if (snap.videoProgress) localStorage.setItem(STORAGE_KEYS.VIDEO_PROGRESS, JSON.stringify(snap.videoProgress));
    } catch (e) {
      console.warn('Error applying user progress snapshot:', e);
    }
  },

  notifyUserProgressChanged() {
    try {
      const cs = this.getCloudSync();
      if (cs && typeof cs.pushUserProgressToCloud === 'function') {
        cs.pushUserProgressToCloud().catch(() => {});
      }
    } catch (e) {}
  },

  // --- LỊCH SỬ THI THỬ ---
  getExamResults() {
    return this.getExamHistory();
  },

  getExamHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EXAM_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading exam history', e);
      return [];
    }
  },

  // Lọc lịch sử thi theo đúng học sinh đang đăng nhập (tránh trộn điểm với tài khoản khác trên cùng thiết bị/Cloud)
  getUserExamHistory(user = null) {
    const history = this.getExamHistory();
    let cur = user;
    if (!cur) {
      try {
        const raw = localStorage.getItem('tinhoc_user');
        if (raw) cur = JSON.parse(raw);
      } catch (e) {}
    }
    if (!cur) return history;

    const email = (cur.email || '').trim().toLowerCase();
    const uid = (cur.uid || '').trim().toLowerCase();
    const username = (cur.username || (email ? email.split('@')[0] : '')).trim().toLowerCase();
    const fullName = (cur.fullName || '').trim().toLowerCase();

    return history.filter(item => {
      const itemEmail = (item.studentEmail || '').trim().toLowerCase();
      const itemName = (item.studentName || '').trim().toLowerCase();
      if (email && itemEmail && itemEmail === email) return true;
      if (uid && itemEmail && (itemEmail === uid || itemEmail.split('@')[0] === uid)) return true;
      if (username && itemEmail && itemEmail.split('@')[0] === username) return true;
      if (fullName && itemName && itemName === fullName) return true;
      return false;
    });
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
        ...result,
        id: result.id || ('exam_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        date: result.date || result.completedAt || new Date().toISOString(),
        title: result.title || result.examTitle || 'Đề thi thử Tin học',
        grade: result.grade,
        score: result.score, // 0 - 10
        totalQuestions: result.totalQuestions,
        correctCount: result.correctCount,
        timeSpentSeconds: result.timeSpentSeconds,
        studentName: result.studentName || student.fullName,
        studentClass: result.studentClass || result.className || student.className,
        studentSchool: result.studentSchool || result.school || student.school,
        school: result.school || result.studentSchool || student.school,
        className: result.className || result.studentClass || student.className,
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
        details: result.details || [], // danh sách câu hỏi và câu trả lời
        isArenaGame: !!result.isArenaGame,
        arenaPin: result.arenaPin || null,
        gameMode: result.gameMode || null,
        blookName: result.blookName || null
      };
      history.unshift(entry);
      // Giữ tối đa 2000 bài thi trên thiết bị để Sổ điểm của Giáo viên luôn đầy đủ
      if (history.length > 2000) history.pop();
      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));
      const cs = this.getCloudSync();
      if (cs && typeof cs.pushExamResultToCloud === 'function' && !entry.isSyncedByWorker) {
        cs.pushExamResultToCloud(entry).catch(() => {});
      }

      // Tự động xóa phiên làm bài nháp sau khi đã nộp bài
      this.clearActiveExamSession();

      // Tự động ghi nhận chuỗi ngày học tập
      this.recordDailyActivity();

      // Tự động lưu các câu trả lời sai vào Ngân hàng câu hay sai theo lô tối ưu
      if (Array.isArray(result.details) && !result._batchRecorded) {
        const correctList = [];
        const wrongList = [];
        result.details.forEach(d => {
          if (!d.isCorrect && d.question) {
            wrongList.push(d.question);
          } else if (d.isCorrect && (d.question || d.questionId)) {
            correctList.push(d.question || { id: d.questionId });
          }
        });
        if (correctList.length > 0 || wrongList.length > 0) {
          this.recordMasteredAndWrongBatch(correctList, wrongList);
        }
      }

      this.notifyUserProgressChanged();
      return entry;
    } catch (e) {
      console.error('Error saving exam result', e);
      return null;
    }
  },

  clearExamHistory() {
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    const isAllowed = authObj && (
      (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) ||
      (typeof authObj.isTeacher === 'function' && authObj.isTeacher())
    );
    if (!isAllowed) {
      console.warn('Học sinh không có quyền xóa toàn bộ lịch sử thi.');
      return false;
    }
    localStorage.removeItem(STORAGE_KEYS.EXAM_HISTORY);
    return true;
  },

  deleteExamResult(id) {
    if (!id) return false;
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    const isAllowed = authObj && (
      (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) ||
      (typeof authObj.isTeacher === 'function' && authObj.isTeacher())
    );
    if (!isAllowed) {
      console.warn('Học sinh không có quyền xóa bài thi trong lịch sử.');
      return false;
    }
    try {
      let history = this.getExamHistory();
      const targetItem = history.find(item => item.id === id);
      if (!targetItem) return false;

      history = history.filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));

      const cs = this.getCloudSync();
      if (cs && typeof cs.deleteExamResultFromCloud === 'function') {
        cs.deleteExamResultFromCloud(targetItem).catch(() => {});
      }
      this.notifyUserProgressChanged();
      return true;
    } catch (e) {
      console.error('Error deleting exam result', e);
      return false;
    }
  },

  updateExamResult(id, updatedData) {
    if (!id || !updatedData) return null;
    try {
      const history = this.getExamHistory();
      const idx = history.findIndex(item => item.id === id);
      if (idx < 0) return null;

      const item = history[idx];
      if (updatedData.score !== undefined) {
        item.score = Number(Number(updatedData.score).toFixed(2));
      }
      if (updatedData.correctCount !== undefined) {
        item.correctCount = parseInt(updatedData.correctCount, 10);
      }
      if (updatedData.totalQuestions !== undefined) {
        item.totalQuestions = parseInt(updatedData.totalQuestions, 10);
      }
      if (updatedData.studentName !== undefined) {
        item.studentName = String(updatedData.studentName).trim();
      }
      if (updatedData.studentClass !== undefined || updatedData.className !== undefined) {
        const c = String(updatedData.studentClass || updatedData.className || '').trim();
        item.studentClass = c;
        item.className = c;
      }
      if (updatedData.studentSchool !== undefined || updatedData.school !== undefined) {
        const s = String(updatedData.studentSchool || updatedData.school || '').trim();
        item.studentSchool = s;
        item.school = s;
      }
      if (updatedData.grade !== undefined) {
        item.grade = String(updatedData.grade).trim();
      }
      if (updatedData.title !== undefined) {
        item.title = String(updatedData.title).trim();
      }
      if (updatedData.examCode !== undefined) {
        item.examCode = String(updatedData.examCode).trim();
      }
      if (updatedData.roomId !== undefined) {
        item.roomId = String(updatedData.roomId).trim() || null;
      }
      if (updatedData.violationCount !== undefined) {
        item.violationCount = parseInt(updatedData.violationCount, 10) || 0;
      }
      if (updatedData.isDisqualified !== undefined) {
        item.isDisqualified = Boolean(updatedData.isDisqualified);
      }
      if (updatedData.disqualifiedReason !== undefined) {
        item.disqualifiedReason = String(updatedData.disqualifiedReason).trim();
      }
      item.updatedAt = new Date().toISOString();

      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));

      const cs = this.getCloudSync();
      if (cs && typeof cs.pushExamResultToCloud === 'function') {
        cs.pushExamResultToCloud(item).catch(() => {});
      }
      this.notifyUserProgressChanged();
      return item;
    } catch (e) {
      console.error('Error updating exam result', e);
      return null;
    }
  },

  deleteExamResultsBulk(idsOrFilterFn) {
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    const isAllowed = authObj && (
      (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) ||
      (typeof authObj.isTeacher === 'function' && authObj.isTeacher())
    );
    if (!isAllowed) {
      console.warn('Học sinh không có quyền xóa hàng loạt kết quả thi.');
      return false;
    }
    try {
      let history = this.getExamHistory();
      let toDelete = [];
      if (Array.isArray(idsOrFilterFn)) {
        const idSet = new Set(idsOrFilterFn);
        toDelete = history.filter(item => idSet.has(item.id));
        history = history.filter(item => !idSet.has(item.id));
      } else if (typeof idsOrFilterFn === 'function') {
        toDelete = history.filter(idsOrFilterFn);
        history = history.filter(item => !idsOrFilterFn(item));
      } else {
        return false;
      }

      localStorage.setItem(STORAGE_KEYS.EXAM_HISTORY, JSON.stringify(history));

      const cs = this.getCloudSync();
      if (cs && typeof cs.deleteExamResultFromCloud === 'function') {
        toDelete.forEach(item => {
          cs.deleteExamResultFromCloud(item).catch(() => {});
        });
      }
      this.notifyUserProgressChanged();
      return toDelete.length;
    } catch (e) {
      console.error('Error bulk deleting exam results', e);
      return false;
    }
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

  // --- QUẢN LÝ CÂU HỎI ĐÃ THÀNH THẠO / ĐÃ LÀM ĐÚNG (SMART LEARNING / MASTERY) ---
  getAllMasteredQuestions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MASTERED_QUESTIONS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  getMasteredQuestionIds(grade = null, topic = null, lesson = null) {
    const all = this.getAllMasteredQuestions();
    const ids = new Set();
    for (const [id, meta] of Object.entries(all)) {
      if (grade && meta.grade && String(meta.grade) !== String(grade)) continue;
      if (topic && meta.topic && meta.topic !== topic) continue;
      if (lesson && meta.lesson && meta.lesson !== lesson) continue;
      ids.add(id);
    }
    return ids;
  },

  recordMasteredAndWrongBatch(correctList = [], wrongList = []) {
    try {
      const allMastered = this.getAllMasteredQuestions();
      let wrongItems = this.getWrongQuestions();
      const resolvedIds = new Set();

      correctList.forEach(q => {
        if (!q || !q.id) return;
        allMastered[q.id] = {
          masteredAt: new Date().toISOString(),
          grade: q.grade || null,
          topic: q.topic || null,
          lesson: q.lesson || null
        };
        resolvedIds.add(q.id);
      });

      if (resolvedIds.size > 0) {
        wrongItems = wrongItems.filter(item => !resolvedIds.has(item.id));
      }

      wrongList.forEach(q => {
        if (!q || !q.id) return;
        delete allMastered[q.id];
        const idx = wrongItems.findIndex(item => item.id === q.id);
        if (idx >= 0) {
          wrongItems[idx].wrongCount = (wrongItems[idx].wrongCount || 1) + 1;
          wrongItems[idx].lastWrongAt = new Date().toISOString();
        } else {
          wrongItems.unshift({
            id: q.id,
            grade: q.grade,
            topic: q.topic,
            lesson: q.lesson,
            level: q.level,
            question: q.question,
            options: q.options,
            answer: q.answer,
            wrongCount: 1,
            lastWrongAt: new Date().toISOString()
          });
        }
      });

      if (wrongItems.length > 200) wrongItems = wrongItems.slice(0, 200);

      localStorage.setItem(STORAGE_KEYS.MASTERED_QUESTIONS, JSON.stringify(allMastered));
      localStorage.setItem(STORAGE_KEYS.WRONG_QUESTIONS, JSON.stringify(wrongItems));
      this.notifyUserProgressChanged();
    } catch (e) {
      console.warn('Error in recordMasteredAndWrongBatch:', e);
    }
  },

  recordMasteredQuestion(questionId, grade = null, topic = null, lesson = null) {
    if (!questionId) return;
    try {
      const all = this.getAllMasteredQuestions();
      all[questionId] = {
        masteredAt: new Date().toISOString(),
        grade: grade || null,
        topic: topic || null,
        lesson: lesson || null
      };
      localStorage.setItem(STORAGE_KEYS.MASTERED_QUESTIONS, JSON.stringify(all));
      this.markWrongQuestionResolved(questionId);
      this.notifyUserProgressChanged();
    } catch (e) {
      console.warn('Error recording mastered question:', e);
    }
  },

  removeMasteredQuestion(questionId) {
    if (!questionId) return;
    try {
      const all = this.getAllMasteredQuestions();
      if (all[questionId]) {
        delete all[questionId];
        localStorage.setItem(STORAGE_KEYS.MASTERED_QUESTIONS, JSON.stringify(all));
        this.notifyUserProgressChanged();
      }
    } catch (e) {}
  },

  clearMasteredQuestions(grade = null, topic = null, lesson = null) {
    try {
      if (!grade && !topic && !lesson) {
        localStorage.removeItem(STORAGE_KEYS.MASTERED_QUESTIONS);
      } else {
        const all = this.getAllMasteredQuestions();
        for (const [id, meta] of Object.entries(all)) {
          let match = true;
          if (grade && meta.grade && String(meta.grade) !== String(grade)) match = false;
          if (topic && meta.topic && meta.topic !== topic) match = false;
          if (lesson && meta.lesson && meta.lesson !== lesson) match = false;
          if (match) {
            delete all[id];
          }
        }
        localStorage.setItem(STORAGE_KEYS.MASTERED_QUESTIONS, JSON.stringify(all));
      }
      this.notifyUserProgressChanged();
    } catch (e) {}
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
      this.notifyUserProgressChanged();
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
        if (question?.id) {
          this.markWrongQuestionResolved(question.id);
          this.recordMasteredQuestion(question.id, question.grade, question.topic, question.lesson);
        }
      } else {
        stats.wrong += 1;
        if (question?.id) {
          this.removeMasteredQuestion(question.id);
          this.recordWrongQuestion(question);
        }
      }
      localStorage.setItem(STORAGE_KEYS.PRACTICE_STATS, JSON.stringify(stats));
      this.recordDailyActivity();
      this.notifyUserProgressChanged();
      return stats;
    } catch (e) {
      console.error('Error recording practice result', e);
    }
  },


  // --- QUẢN LÝ CẤU TRÚC TRƯỜNG HỌC & LỚP THEO KHỐI ---
  getSchoolsData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SCHOOLS_DATA);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          for (const key of Object.keys(parsed)) {
            if (!parsed[key].classes) parsed[key].classes = { '10': [], '11': [], '12': [] };
            if (!parsed[key].classes['10']) parsed[key].classes['10'] = [];
            if (!parsed[key].classes['11']) parsed[key].classes['11'] = [];
            if (!parsed[key].classes['12']) parsed[key].classes['12'] = [];
            if (!parsed[key].aliases) parsed[key].aliases = [key];
            if (!parsed[key].name) parsed[key].name = key;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc schools data từ localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SCHOOLS_DATA));
  },

  saveSchoolsData(schools) {
    try {
      localStorage.setItem(STORAGE_KEYS.SCHOOLS_DATA, JSON.stringify(schools));
      const sync = this.getCloudSync();
      if (sync && typeof sync.pushSchoolsDataToCloud === 'function') {
        sync.pushSchoolsDataToCloud(schools).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Lỗi lưu schools data:', e);
      return false;
    }
  },

  addSchool(schoolKey, schoolName, aliases = []) {
    const key = (schoolKey || '').trim();
    const name = (schoolName || key).trim();
    if (!key) return { success: false, message: 'Mã trường không được để trống' };
    const schools = this.getSchoolsData();
    if (!schools[key]) {
      schools[key] = {
        name: name,
        aliases: Array.from(new Set([key, name, ...(aliases || [])])).filter(Boolean),
        classes: { '10': [], '11': [], '12': [] }
      };
    } else {
      schools[key].name = name;
      if (aliases && aliases.length > 0) {
        schools[key].aliases = Array.from(new Set([...(schools[key].aliases || []), ...aliases])).filter(Boolean);
      }
    }
    this.saveSchoolsData(schools);
    return { success: true, message: `Đã lưu trường [${key}]` };
  },

  deleteSchool(schoolKey) {
    const key = (schoolKey || '').trim();
    const schools = this.getSchoolsData();
    if (schools[key]) {
      delete schools[key];
      this.saveSchoolsData(schools);
      return { success: true, message: `Đã xóa trường [${key}]` };
    }
    return { success: false, message: 'Trường không tồn tại' };
  },

  addClassToSchool(schoolKey, grade, className) {
    const key = (schoolKey || '').trim();
    const g = String(grade).trim();
    const cls = (className || '').trim().toUpperCase();
    if (!key || !g || !cls) return { success: false, message: 'Thông tin lớp không hợp lệ' };
    const schools = this.getSchoolsData();
    if (!schools[key]) return { success: false, message: 'Trường không tồn tại' };
    if (!schools[key].classes) schools[key].classes = { '10': [], '11': [], '12': [] };
    if (!schools[key].classes[g]) schools[key].classes[g] = [];
    if (!schools[key].classes[g].includes(cls)) {
      schools[key].classes[g].push(cls);
      this.saveSchoolsData(schools);
      return { success: true, message: `Đã thêm lớp ${cls} vào ${key} (Khối ${g})` };
    }
    return { success: false, message: `Lớp ${cls} đã tồn tại trong ${key}` };
  },

  deleteClassFromSchool(schoolKey, grade, className) {
    const key = (schoolKey || '').trim();
    const g = String(grade).trim();
    const cls = (className || '').trim().toUpperCase();
    const schools = this.getSchoolsData();
    if (!schools[key] || !schools[key].classes || !schools[key].classes[g]) {
      return { success: false, message: 'Không tìm thấy lớp' };
    }
    schools[key].classes[g] = schools[key].classes[g].filter(c => c !== cls);
    this.saveSchoolsData(schools);
    return { success: true, message: `Đã xóa lớp ${cls}` };
  },

  // --- QUẢN LÝ DANH MỤC MÔN HỌC ---
  getSubjectsList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Lỗi đọc subjects list:', e);
    }
    return [...DEFAULT_SUBJECTS];
  },

  saveSubjectsList(list) {
    try {
      const cleanList = Array.from(new Set((list || []).map(s => String(s).trim()).filter(Boolean)));
      if (!cleanList.includes('Tin học')) cleanList.unshift('Tin học');
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(cleanList));
      const sync = this.getCloudSync();
      if (sync && typeof sync.pushSubjectsToCloud === 'function') {
        sync.pushSubjectsToCloud(cleanList).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Lỗi lưu danh sách môn học:', e);
      return false;
    }
  },

  addSubject(subjectName) {
    const name = (subjectName || '').trim();
    if (!name) return { success: false, message: 'Tên môn học không được để trống' };
    const list = this.getSubjectsList();
    if (!list.includes(name)) {
      list.push(name);
      this.saveSubjectsList(list);
      return { success: true, message: `Đã thêm môn [${name}]` };
    }
    return { success: false, message: 'Môn học đã tồn tại' };
  },

  deleteSubject(subjectName) {
    const name = (subjectName || '').trim();
    if (name === 'Tin học') return { success: false, message: 'Không thể xóa môn Tin học mặc định' };
    const list = this.getSubjectsList();
    const filtered = list.filter(s => s !== name);
    this.saveSubjectsList(filtered);
    return { success: true, message: `Đã xóa môn [${name}]` };
  },

  // --- QUẢN LÝ PHÂN CÔNG GIẢNG DẠY GIÁO VIÊN (TEACHER ASSIGNMENTS) ---
  getAllTeacherAssignments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_ASSIGNMENTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.warn('Lỗi đọc teacher assignments:', e);
    }
    return {};
  },

  saveAllTeacherAssignments(assignments) {
    try {
      localStorage.setItem(STORAGE_KEYS.TEACHER_ASSIGNMENTS, JSON.stringify(assignments || {}));
      const sync = this.getCloudSync();
      if (sync && typeof sync.pushTeacherAssignmentsToCloud === 'function') {
        sync.pushTeacherAssignmentsToCloud(assignments).catch(() => {});
      }
      return true;
    } catch (e) {
      console.error('Lỗi lưu teacher assignments:', e);
      return false;
    }
  },

  getTeacherAssignments(teacherEmail) {
    if (!teacherEmail) return [];
    const emailKey = String(teacherEmail).trim().toLowerCase();
    const all = this.getAllTeacherAssignments();
    return Array.isArray(all[emailKey]) ? all[emailKey] : [];
  },

  saveTeacherAssignments(teacherEmail, assignmentsList) {
    if (!teacherEmail) return false;
    const emailKey = String(teacherEmail).trim().toLowerCase();
    const all = this.getAllTeacherAssignments();
    all[emailKey] = (assignmentsList || []).map(a => ({
      school: String(a.school || '').trim(),
      grade: String(a.grade || '').trim(),
      className: String(a.className || '').trim().toUpperCase(),
      subject: String(a.subject || 'Tin học').trim()
    })).filter(a => a.school && a.grade && a.className);
    return this.saveAllTeacherAssignments(all);
  },

  getTeacherAssignedSchools(teacherEmail) {
    const assignments = this.getTeacherAssignments(teacherEmail);
    return Array.from(new Set(assignments.map(a => a.school).filter(Boolean)));
  },

  getTeacherAssignedGrades(teacherEmail, school = null) {
    let assignments = this.getTeacherAssignments(teacherEmail);
    if (school && school !== 'all') {
      assignments = assignments.filter(a => a.school === school);
    }
    return Array.from(new Set(assignments.map(a => String(a.grade)).filter(Boolean))).sort();
  },

  getTeacherAssignedClasses(teacherEmail, school = null, grade = null) {
    let assignments = this.getTeacherAssignments(teacherEmail);
    if (school && school !== 'all') {
      assignments = assignments.filter(a => a.school === school);
    }
    if (grade && grade !== 'all') {
      assignments = assignments.filter(a => String(a.grade) === String(grade));
    }
    return Array.from(new Set(assignments.map(a => a.className).filter(Boolean))).sort();
  },

  isTeacherAssignedToClass(userOrEmail, school, grade, className) {
    let email = '';
    if (typeof userOrEmail === 'object' && userOrEmail) {
      if (userOrEmail.role === 'admin') return true;
      email = userOrEmail.email;
    } else {
      email = String(userOrEmail || '');
    }
    if (!email) return false;

    const all = this.getAllTeacherAssignments();
    const emailKey = email.trim().toLowerCase();
    if (!all[emailKey] || all[emailKey].length === 0) {
      return true;
    }

    const assignments = all[emailKey];
    const s = String(school || '').trim();
    const g = String(grade || '').trim();
    const c = String(className || '').trim().toUpperCase();

    return assignments.some(a => {
      const matchSchool = (a.school === 'all' || !s || s === 'all' || a.school === s);
      const matchGrade = (a.grade === 'all' || !g || g === 'all' || String(a.grade) === g);
      const matchClass = (a.className === 'all' || !c || c === 'all' || a.className === c);
      return matchSchool && matchGrade && matchClass;
    });
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
      deletedQuestions: this.getDeletedQuestionIds(),
      schoolsData: this.getSchoolsData(),
      subjectsList: this.getSubjectsList(),
      teacherAssignments: this.getAllTeacherAssignments()
    }, null, 2);
  },


  // ==========================================
  // QUẢN LÝ CÂU HỎI ĐÓNG GÓP TỪ GIÁO VIÊN (EXCEL & SOẠN TAY)
  // ==========================================
  getAllTeacherContributions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  getTeacherContributions(teacherEmail = null) {
    const all = this.getAllTeacherContributions();
    if (!teacherEmail) return all;
    return all.filter(c => c.teacherEmail && c.teacherEmail.toLowerCase() === teacherEmail.toLowerCase());
  },

  saveTeacherContribution(pkg) {
    if (!pkg) return null;
    const all = this.getAllTeacherContributions();
    const now = new Date().toISOString();
    if (!pkg.id) {
      pkg.id = 'cont_q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      pkg.createdAt = now;
      pkg.status = pkg.status || 'draft';
      all.unshift(pkg);
    } else {
      const idx = all.findIndex(c => c.id === pkg.id);
      pkg.updatedAt = now;
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...pkg };
      } else {
        all.unshift(pkg);
      }
    }
    localStorage.setItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherContributionsToCloud === 'function') {
      window.CloudSync.pushTeacherContributionsToCloud().catch(() => {});
    }
    return pkg;
  },

  deleteTeacherContribution(id) {
    const all = this.getAllTeacherContributions();
    const filtered = all.filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS, JSON.stringify(filtered));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherContributionsToCloud === 'function') {
      window.CloudSync.pushTeacherContributionsToCloud().catch(() => {});
    }
  },

  submitContributionForApproval(id) {
    const all = this.getAllTeacherContributions();
    const item = all.find(c => c.id === id);
    if (!item) return false;
    item.status = 'pending';
    item.submittedAt = new Date().toISOString();
    item.rejectReason = '';
    localStorage.setItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherContributionsToCloud === 'function') {
      window.CloudSync.pushTeacherContributionsToCloud().catch(() => {});
    }
    return true;
  },

  approveContribution(id, adminName = 'Admin') {
    const all = this.getAllTeacherContributions();
    const item = all.find(c => c.id === id);
    if (!item) return false;
    item.status = 'approved';
    item.approvedAt = new Date().toISOString();
    item.approvedBy = adminName;
    item.rejectReason = '';
    localStorage.setItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS, JSON.stringify(all));

    // Tự động nạp các câu hỏi trong gói vào Ngân hàng câu hỏi dùng chung (Storage.saveQuestion)
    if (Array.isArray(item.questions) && item.questions.length > 0) {
      item.questions.forEach(q => {
        if (q && q.question) {
          this.saveQuestion({
            ...q,
            contributedBy: item.teacherName || item.teacherEmail,
            contributedSchool: item.teacherSchool || '',
            contributionId: item.id
          });
        }
      });
    }

    if (typeof window !== 'undefined' && window.CloudSync) {
      if (typeof window.CloudSync.pushTeacherContributionsToCloud === 'function') {
        window.CloudSync.pushTeacherContributionsToCloud().catch(() => {});
      }
      if (typeof window.CloudSync.pushCustomQuestionsToCloud === 'function') {
        window.CloudSync.pushCustomQuestionsToCloud().catch(() => {});
      }
    }
    return true;
  },

  rejectContribution(id, reason = '', adminName = 'Admin') {
    const all = this.getAllTeacherContributions();
    const item = all.find(c => c.id === id);
    if (!item) return false;
    item.status = 'rejected';
    item.rejectedAt = new Date().toISOString();
    item.rejectedBy = adminName;
    item.rejectReason = reason || 'Nội dung câu hỏi chưa đạt yêu cầu chuẩn hóa.';
    localStorage.setItem(STORAGE_KEYS.TEACHER_CONTRIBUTIONS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherContributionsToCloud === 'function') {
      window.CloudSync.pushTeacherContributionsToCloud().catch(() => {});
    }
    return true;
  },

  // ==========================================
  // QUẢN LÝ VIDEO BÀI GIẢNG ĐÓNG GÓP TỰ DO TỪ GIÁO VIÊN
  // ==========================================
  getAllTeacherVideos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_VIDEOS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  getTeacherVideos(teacherEmail = null, status = null) {
    let list = this.getAllTeacherVideos();
    if (teacherEmail) {
      list = list.filter(v => v.teacherEmail && v.teacherEmail.toLowerCase() === teacherEmail.toLowerCase());
    }
    if (status) {
      list = list.filter(v => v.status === status);
    }
    return list;
  },

  getApprovedTeacherVideos() {
    return this.getAllTeacherVideos().filter(v => v.status === 'approved');
  },

  saveTeacherVideo(video) {
    if (!video) return null;
    const all = this.getAllTeacherVideos();
    const now = new Date().toISOString();
    if (!video.id) {
      video.id = 'cont_v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      video.createdAt = now;
      video.status = video.status || 'draft';
      all.unshift(video);
    } else {
      const idx = all.findIndex(v => v.id === video.id);
      video.updatedAt = now;
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...video };
      } else {
        all.unshift(video);
      }
    }
    localStorage.setItem(STORAGE_KEYS.TEACHER_VIDEOS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherVideosToCloud === 'function') {
      window.CloudSync.pushTeacherVideosToCloud().catch(() => {});
    }
    return video;
  },

  deleteTeacherVideo(id) {
    const all = this.getAllTeacherVideos();
    const filtered = all.filter(v => v.id !== id);
    localStorage.setItem(STORAGE_KEYS.TEACHER_VIDEOS, JSON.stringify(filtered));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherVideosToCloud === 'function') {
      window.CloudSync.pushTeacherVideosToCloud().catch(() => {});
    }
  },

  submitVideoForApproval(id) {
    const all = this.getAllTeacherVideos();
    const item = all.find(v => v.id === id);
    if (!item) return false;
    item.status = 'pending';
    item.submittedAt = new Date().toISOString();
    item.rejectReason = '';
    localStorage.setItem(STORAGE_KEYS.TEACHER_VIDEOS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherVideosToCloud === 'function') {
      window.CloudSync.pushTeacherVideosToCloud().catch(() => {});
    }
    return true;
  },

  approveVideo(id, adminName = 'Admin') {
    const all = this.getAllTeacherVideos();
    const item = all.find(v => v.id === id);
    if (!item) return false;
    item.status = 'approved';
    item.approvedAt = new Date().toISOString();
    item.approvedBy = adminName;
    item.rejectReason = '';
    localStorage.setItem(STORAGE_KEYS.TEACHER_VIDEOS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherVideosToCloud === 'function') {
      window.CloudSync.pushTeacherVideosToCloud().catch(() => {});
    }
    return true;
  },

  rejectVideo(id, reason = '', adminName = 'Admin') {
    const all = this.getAllTeacherVideos();
    const item = all.find(v => v.id === id);
    if (!item) return false;
    item.status = 'rejected';
    item.rejectedAt = new Date().toISOString();
    item.rejectedBy = adminName;
    item.rejectReason = reason || 'Video bài giảng chưa phù hợp chuẩn sư phạm.';
    localStorage.setItem(STORAGE_KEYS.TEACHER_VIDEOS, JSON.stringify(all));
    if (typeof window !== 'undefined' && window.CloudSync && typeof window.CloudSync.pushTeacherVideosToCloud === 'function') {
      window.CloudSync.pushTeacherVideosToCloud().catch(() => {});
    }
    return true;
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
      if (data.schoolsData) this.saveSchoolsData(data.schoolsData);
      if (data.subjectsList) this.saveSubjectsList(data.subjectsList);
      if (data.teacherAssignments) this.saveAllTeacherAssignments(data.teacherAssignments);
      return true;
    } catch (e) {
      console.error('Invalid backup data', e);
      return false;
    }
  },

  // ==========================================
  // ĐẤU TRƯỜNG GAME TRÍ TUỆ (BLOOKET & WAYGROUND ARENA)
  // ==========================================
  getArenaRooms() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ARENA_ROOMS) || '{}');
    } catch {
      return {};
    }
  },

  getArenaRoom(pin) {
    if (!pin) return null;
    const rooms = this.getArenaRooms();
    return rooms[pin] || null;
  },

  saveArenaRoom(room) {
    if (!room || !room.pin) return false;
    const rooms = this.getArenaRooms();
    rooms[room.pin] = {
      ...room,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(STORAGE_KEYS.ARENA_ROOMS, JSON.stringify(rooms));
      return true;
    } catch (e) {
      console.error('Storage: Lỗi lưu phòng đấu trường arena:', e);
      return false;
    }
  },

  deleteArenaRoom(pin) {
    if (!pin) return false;
    const rooms = this.getArenaRooms();
    if (rooms[pin]) {
      delete rooms[pin];
      localStorage.setItem(STORAGE_KEYS.ARENA_ROOMS, JSON.stringify(rooms));
      return true;
    }
    return false;
  },

  getArenaHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ARENA_HISTORY) || '[]');
    } catch {
      return [];
    }
  },

  saveArenaHistory(historyItem) {
    if (!historyItem) return false;
    const history = this.getArenaHistory();
    history.unshift({
      id: historyItem.id || `arena_hist_${Date.now()}`,
      savedAt: Date.now(),
      ...historyItem
    });
    // Giữ tối đa 50 trận đấu gần nhất
    const trimmed = history.slice(0, 50);
    try {
      localStorage.setItem(STORAGE_KEYS.ARENA_HISTORY, JSON.stringify(trimmed));
      return true;
    } catch (e) {
      console.error('Storage: Lỗi lưu lịch sử arena:', e);
      return false;
    }
  },

  getArenaPlayer() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ARENA_PLAYER) || 'null');
    } catch {
      return null;
    }
  },

  getArenaPlayerInfo() {
    return this.getArenaPlayer();
  },

  saveArenaPlayer(playerData) {
    if (!playerData) return;
    try {
      localStorage.setItem(STORAGE_KEYS.ARENA_PLAYER, JSON.stringify(playerData));
    } catch {}
  },

  deleteArenaHistory(id) {
    if (!id) return false;
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    const isAllowed = authObj && (
      (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) ||
      (typeof authObj.isTeacher === 'function' && authObj.isTeacher())
    );
    if (!isAllowed) {
      console.warn('Học sinh không có quyền xóa lịch sử đấu trường.');
      return false;
    }
    const history = this.getArenaHistory().filter(h => h.id !== id && h.pin !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.ARENA_HISTORY, JSON.stringify(history));
      return true;
    } catch {
      return false;
    }
  },

  getFirebaseDbUrl() {
    try {
      const custom = localStorage.getItem('tinhoc_cloud_db_url');
      if (custom && custom.trim().startsWith('http')) {
        const u = custom.trim().replace(/\/+$/, '');
        if (u.includes('on-tap-tinhoc-default-rtdb') || u.includes('firebaseio.com')) {
          localStorage.removeItem('tinhoc_cloud_db_url');
        } else {
          return u;
        }
      }
    } catch {}
    return 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.asia-southeast1.firebasedatabase.app';
  },

  // --- QUẢN LÝ DANH SÁCH LỚP HỌC CHO BỘ RANDOM GỌI TÊN ---
  getClassroomPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLASSROOM_PRESETS);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Lỗi đọc classroom presets:', e);
    }
    return [
      {
        id: 'preset_emasi_12e',
        name: 'Lớp 12E (EMASI - 25 HS)',
        school: 'EMASI',
        grade: '12',
        className: '12E',
        names: [
          'Nguyễn Minh Khôi', 'Trần Bảo An', 'Lê Hoàng Nam', 'Phạm Quỳnh Anh', 'Vũ Đức Trí',
          'Đặng Mai Phương', 'Bùi Gia Huy', 'Hồ Ngọc Hà', 'Đỗ Thành Đạt', 'Ngô Kiến Huy',
          'Dương Tú Anh', 'Trịnh Thăng Bình', 'Lý Hải', 'Mai Phương Thúy', 'Phan Mạnh Quỳnh',
          'Đinh Tiến Dũng', 'Lâm Tâm Như', 'Võ Hoàng Yến', 'Cao Thái Sơn', 'Tạ Quang Thắng',
          'Châu Bùi', 'Sơn Tùng M-TP', 'Nguyễn Thúc Thùy Tiên', "H'Hen Niê", 'Đen Vâu'
        ]
      },
      {
        id: 'preset_cva_12a1',
        name: 'Lớp 12A1 (Chu Văn An - 25 HS)',
        school: 'TT GDNN GDTX Chu Văn An',
        grade: '12',
        className: '12A1',
        names: [
          'Nguyễn Văn An', 'Trần Thị Bích', 'Lê Văn Cường', 'Phạm Thị Dung', 'Hoàng Văn Em',
          'Vũ Thị Giang', 'Đặng Văn Hùng', 'Bùi Thị Lan', 'Đỗ Văn Minh', 'Hồ Thị Nga',
          'Ngô Văn Phúc', 'Dương Thị Quỳnh', 'Lý Văn Sang', 'Mai Thị Thảo', 'Phan Văn Uy',
          'Đinh Thị Vân', 'Cao Văn Xuân', 'Tạ Thị Yến', 'Lưu Văn Bình', 'Trịnh Thị Cúc',
          'Võ Văn Dũng', 'Đào Thị Hoa', 'Phùng Văn Khang', 'Lương Thị Linh', 'Chu Văn Nam'
        ]
      },
      {
        id: 'preset_ptnk_12toan',
        name: 'Lớp 12 Tin / Toán (PTNK - 20 HS)',
        school: 'Phổ thông Năng khiếu',
        grade: '12',
        className: '12TOAN',
        names: [
          'Minh Khôi (C++ Pro)', 'Bảo An (Algorithm)', 'Hoàng Nam (Python Dev)', 'Quỳnh Anh (Math Olympian)',
          'Đức Trí (Database)', 'Mai Phương (Web Front)', 'Gia Huy (AI & ML)', 'Thành Đạt (Network)',
          'Kiến Huy (Cybersec)', 'Tú Anh (Backend)', 'Thăng Bình (Data Science)', 'Lý Hải (Mobile Dev)',
          'Tiến Dũng (Cloud DevOps)', 'Hoàng Yến (UI/UX)', 'Thái Sơn (Game Dev)', 'Quang Thắng (Robotics)',
          'Châu Bùi (System Admin)', 'Sơn Tùng (Fullstack)', 'Thùy Tiên (Quality Assurance)', 'Đen Vâu (Embedded)'
        ]
      },
      {
        id: 'preset_team_sample',
        name: 'Tổ 1 - Đội Tuyển Học Sinh Giỏi (6 HS)',
        school: 'TinHocHub',
        grade: '12',
        className: 'Đội Tuyển',
        names: [
          'Nguyễn Minh Khôi (Tổ trưởng)',
          'Trần Bảo An (Tổ phó)',
          'Lê Hoàng Nam',
          'Phạm Quỳnh Anh',
          'Vũ Đức Trí',
          'Đặng Mai Phương'
        ]
      }
    ];
  },

  saveAllClassroomPresets(presets) {
    try {
      localStorage.setItem(STORAGE_KEYS.CLASSROOM_PRESETS, JSON.stringify(presets));
      return true;
    } catch (e) {
      console.error('Lỗi lưu classroom presets:', e);
      return false;
    }
  },

  saveClassroomPreset(preset) {
    if (!preset || !preset.name || !Array.isArray(preset.names)) return false;
    const presets = this.getClassroomPresets();
    const id = preset.id || `preset_${Date.now()}`;
    preset.id = id;
    const idx = presets.findIndex(p => p.id === id);
    if (idx >= 0) {
      presets[idx] = preset;
    } else {
      presets.unshift(preset);
    }
    return this.saveAllClassroomPresets(presets);
  },

  deleteClassroomPreset(presetId) {
    const presets = this.getClassroomPresets().filter(p => p.id !== presetId);
    return this.saveAllClassroomPresets(presets);
  }
};

