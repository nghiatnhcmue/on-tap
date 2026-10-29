/**
 * tinhoc-hub: Cloud Synchronization Engine (js/cloud-sync.js)
 * Chuyển đổi TinHocHub từ Web Tĩnh sang Web Động Đa Nền Tảng (Dynamic Realtime Web App).
 * 
 * Tính năng cốt lõi:
 * 1. Đồng bộ 2 chiều (Bi-directional Sync) giữa LocalStorage và Cloud Database (Firebase / REST API).
 * 2. Đồng bộ Tài khoản học sinh & giáo viên (Accounts): HS đăng ký trên điện thoại -> Hiện ngay trên Admin máy Thầy.
 * 3. Đồng bộ Phòng thi & Giao đề (Exam Rooms): Thầy tạo phòng trên máy Thầy -> Mọi HS trên điện thoại đều vào được.
 * 4. Đồng bộ Điểm số & Lịch sử thi (Exam History): HS nộp bài -> Tự động đổ về Sổ điểm (Gradebook) của Thầy.
 * 5. Cơ chế Local-First an toàn: Mất mạng vẫn làm bài bình thường, khi có mạng tự động đẩy dữ liệu lên đám mây.
 */

import { Storage } from './storage.js';

const CLOUD_CONFIG_KEY = 'tinhoc_cloud_config';

export const CloudSync = {
  config: null,
  syncInterval: null,
  isSyncing: false,
  listeners: [],

  // 1. KHỞI TẠO VÀ NẠP CẤU HÌNH
  init() {
    this.loadConfig();
    this.setupAutoSync();
    this.setupVisibilitySync();

    // Nếu đã cấu hình Cloud, tự động đồng bộ ngay khi khởi động
    if (this.isConfigured()) {
      setTimeout(() => this.syncAll(false), 1500);
    }
  },

  loadConfig() {
    try {
      const saved = localStorage.getItem(CLOUD_CONFIG_KEY);
      this.config = saved ? JSON.parse(saved) : {
        enabled: false,
        provider: 'firebase', // 'firebase' | 'custom'
        databaseUrl: '', // Ví dụ: https://tinhoc-thpt-default-rtdb.firebaseio.com
        apiKey: '',
        autoSync: true,
        intervalMinutes: 1,
        lastSync: null
      };
    } catch (e) {
      this.config = {
        enabled: false,
        provider: 'firebase',
        databaseUrl: '',
        apiKey: '',
        autoSync: true,
        intervalMinutes: 1,
        lastSync: null
      };
    }
    return this.config;
  },

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    // Chuẩn hóa databaseUrl: bỏ dấu gạch chéo ở đuôi
    if (this.config.databaseUrl) {
      this.config.databaseUrl = this.config.databaseUrl.trim().replace(/\/+$/, '');
    }
    try {
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('Lỗi lưu cấu hình Cloud:', e);
    }
    this.setupAutoSync();
    this.notifyStatusChange();
    return this.config;
  },

  isConfigured() {
    return !!(this.config && this.config.enabled && this.config.databaseUrl && this.config.databaseUrl.startsWith('http'));
  },

  getCleanKey(key) {
    if (!key) return 'unknown';
    // Firebase key không cho phép '.', '#', '$', '/', '[', ']'
    return String(key).replace(/[.#$/[\]]/g, '_');
  },

  // 2. LẮNG NGHE SỰ KIỆN TRẠNG THÁI
  onStatusChange(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
    }
  },

  notifyStatusChange() {
    this.listeners.forEach(fn => {
      try { fn(this.getStatus()); } catch (e) { console.error(e); }
    });
  },

  getStatus() {
    return {
      isConfigured: this.isConfigured(),
      enabled: this.config?.enabled || false,
      isSyncing: this.isSyncing,
      lastSync: this.config?.lastSync || null,
      databaseUrl: this.config?.databaseUrl || '',
      provider: this.config?.provider || 'firebase'
    };
  },

  // 3. THIẾT LẬP ĐỒNG BỘ NỀN TỰ ĐỘNG
  setupAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.isConfigured() && this.config.autoSync) {
      const ms = Math.max(20000, (this.config.intervalMinutes || 1) * 60000);
      this.syncInterval = setInterval(() => {
        if (!document.hidden) {
          this.syncAll(false);
        }
      }, ms);
    }
  },

  setupVisibilitySync() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isConfigured()) {
        // Học sinh hoặc Thầy vừa quay lại tab -> đồng bộ ngay để nhận điểm/phòng mới
        this.syncAll(false);
      }
    });
  },

  // 4. KIỂM TRA KẾT NỐI MÁY CHỦ (PING TEST)
  async testConnection(urlToCheck = null) {
    const url = (urlToCheck || this.config?.databaseUrl || '').trim().replace(/\/+$/, '');
    if (!url || !url.startsWith('http')) {
      return { success: false, message: 'URL cơ sở dữ liệu không hợp lệ!' };
    }

    try {
      const pingUrl = `${url}/system_ping.json`;
      const testData = {
        timestamp: new Date().toISOString(),
        client: 'TinHocHub-Web'
      };

      const putRes = await fetch(pingUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      if (!putRes.ok) {
        return {
          success: false,
          message: `Máy chủ phản hồi mã lỗi HTTP ${putRes.status} (${putRes.statusText}). Vui lòng kiểm tra lại quyền truy cập (Rules) của Firebase.`
        };
      }

      const getRes = await fetch(pingUrl);
      const data = await getRes.json();

      if (data && data.client === 'TinHocHub-Web') {
        return {
          success: true,
          message: 'Kết nối Đám mây thành công 100%! Cơ sở dữ liệu sẵn sàng đồng bộ đa thiết bị.'
        };
      }

      return { success: false, message: 'Phản hồi từ máy chủ không khớp.' };
    } catch (e) {
      return {
        success: false,
        message: `Lỗi kết nối: ${e.message}. Kiểm tra xem URL có đúng định dạng Firebase Realtime Database không.`
      };
    }
  },

  // 5. ĐỒNG BỘ TẤT CẢ DỮ LIỆU (ACCOUNTS, ROOMS, HISTORY)
  async syncAll(showUiNotice = false) {
    if (!this.isConfigured() || this.isSyncing) return false;

    this.isSyncing = true;
    this.notifyStatusChange();

    try {
      const baseUrl = this.config.databaseUrl;

      // 1. Đồng bộ Tài khoản (Accounts)
      await this.syncAccounts(baseUrl);

      // 2. Đồng bộ Phòng thi (Exam Rooms)
      await this.syncRooms(baseUrl);

      // 3. Đồng bộ Kết quả thi (Exam History)
      await this.syncHistory(baseUrl);

      // 4. Đồng bộ Cấu hình Video Bài Giảng (Video Base URL & Archive Bucket)
      await this.syncVideoConfig(baseUrl);

      this.config.lastSync = new Date().toISOString();
      try {
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(this.config));
      } catch (e) {}

      if (showUiNotice && window.alert) {
        alert('✅ Đồng bộ dữ liệu Đám mây thành công!\nToàn bộ Tài khoản, Phòng thi và Điểm số đã được cập nhật mới nhất.');
      }

      return true;
    } catch (err) {
      console.warn('Lỗi trong quá trình đồng bộ Cloud:', err);
      if (showUiNotice && window.alert) {
        alert(`⚠️ Đồng bộ chưa hoàn tất: ${err.message}`);
      }
      return false;
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  },

  // --- CHI TIẾT ĐỒNG BỘ TÀI KHOẢN ---
  async syncAccounts(baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/accounts.json`);
      if (!res.ok) return;
      const remoteData = await res.json() || {};
      
      const localList = Storage.getAccountsList();
      const localMap = new Map();
      localList.forEach(acc => {
        const key = this.getCleanKey(acc.email || acc.uid);
        localMap.set(key, acc);
      });

      // Hợp nhất từ Cloud vào Local
      let updated = false;
      Object.entries(remoteData).forEach(([key, remoteAcc]) => {
        if (!remoteAcc || typeof remoteAcc !== 'object') return;
        const localAcc = localMap.get(key);
        if (!localAcc) {
          localMap.set(key, remoteAcc);
          updated = true;
        } else {
          // So sánh thời gian hoạt động để lấy bản mới hơn
          const remoteTime = new Date(remoteAcc.lastActive || 0).getTime();
          const localTime = new Date(localAcc.lastActive || 0).getTime();
          if (remoteTime > localTime) {
            localMap.set(key, { ...localAcc, ...remoteAcc });
            updated = true;
          }
        }
      });

      if (updated) {
        const mergedList = Array.from(localMap.values());
        localStorage.setItem('tinhoc_accounts', JSON.stringify(mergedList));
      }

      // Đẩy ngược các tài khoản local chưa có trên Cloud
      for (const [key, localAcc] of localMap.entries()) {
        if (!remoteData[key]) {
          this.pushAccountToCloud(localAcc).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Sync accounts error', e);
    }
  },

  async pushAccountToCloud(user) {
    if (!this.isConfigured() || !user) return;
    const key = this.getCleanKey(user.email || user.uid);
    if (!key) return;
    try {
      await fetch(`${this.config.databaseUrl}/accounts/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
    } catch (e) {
      console.warn('Lỗi push tài khoản lên cloud:', e);
    }
  },

  // --- CHI TIẾT ĐỒNG BỘ PHÒNG THI ---
  async syncRooms(baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/exam_rooms.json`);
      if (!res.ok) return;
      const remoteData = await res.json() || {};

      const localRooms = Storage.getExamRooms();
      const localMap = new Map();
      localRooms.forEach(r => localMap.set(r.id.toUpperCase(), r));

      let updated = false;
      Object.entries(remoteData).forEach(([cleanId, remoteRoom]) => {
        if (!remoteRoom || !remoteRoom.id) return;
        const id = remoteRoom.id.toUpperCase();
        const localRoom = localMap.get(id);
        if (!localRoom) {
          localMap.set(id, remoteRoom);
          updated = true;
        } else {
          const remoteTime = new Date(remoteRoom.updatedAt || remoteRoom.createdDate || 0).getTime();
          const localTime = new Date(localRoom.updatedAt || localRoom.createdDate || 0).getTime();
          if (remoteTime > localTime) {
            localMap.set(id, { ...localRoom, ...remoteRoom });
            updated = true;
          }
        }
      });

      if (updated) {
        const mergedRooms = Array.from(localMap.values());
        localStorage.setItem('tinhoc_exam_rooms', JSON.stringify(mergedRooms));
      }

      // Đẩy ngược phòng thi tạo từ máy local lên Cloud
      for (const [id, localRoom] of localMap.entries()) {
        const cleanKey = this.getCleanKey(id);
        if (!remoteData[cleanKey]) {
          this.pushRoomToCloud(localRoom).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Sync rooms error', e);
    }
  },

  async pushRoomToCloud(room) {
    if (!this.isConfigured() || !room || !room.id) return;
    const key = this.getCleanKey(room.id);
    try {
      await fetch(`${this.config.databaseUrl}/exam_rooms/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(room)
      });
    } catch (e) {
      console.warn('Lỗi push phòng thi lên cloud:', e);
    }
  },

  async deleteRoomFromCloud(roomId) {
    if (!this.isConfigured() || !roomId) return;
    const key = this.getCleanKey(roomId);
    try {
      await fetch(`${this.config.databaseUrl}/exam_rooms/${key}.json`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Lỗi xóa phòng thi trên cloud:', e);
    }
  },

  // Tìm phòng thi trực tiếp từ Cloud nếu local chưa có (dành cho học sinh mở link trực tiếp ?room=XYZ)
  async fetchRoomFromCloud(roomId) {
    if (!this.isConfigured() || !roomId) return null;
    const key = this.getCleanKey(roomId);
    try {
      const res = await fetch(`${this.config.databaseUrl}/exam_rooms/${key}.json`);
      if (!res.ok) return null;
      const room = await res.json();
      if (room && room.id) {
        Storage.saveExamRoom(room); // Lưu vào cache local
        return room;
      }
    } catch (e) {
      console.warn('Fetch room from cloud error:', e);
    }
    return null;
  },

  // --- CHI TIẾT ĐỒNG BỘ KẾT QUẢ THI ---
  async syncHistory(baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/exam_history.json`);
      if (!res.ok) return;
      const remoteData = await res.json() || {};

      const localHistory = Storage.getExamHistory();
      const localMap = new Map();
      localHistory.forEach(item => {
        const key = this.getResultUniqueKey(item);
        localMap.set(key, item);
      });

      let updated = false;
      Object.entries(remoteData).forEach(([rKey, remoteItem]) => {
        if (!remoteItem) return;
        const key = this.getResultUniqueKey(remoteItem);
        if (!localMap.has(key)) {
          localMap.set(key, remoteItem);
          updated = true;
        }
      });

      if (updated) {
        // Sắp xếp theo ngày thi mới nhất
        const mergedHistory = Array.from(localMap.values()).sort((a, b) => {
          return new Date(b.date || 0) - new Date(a.date || 0);
        });
        localStorage.setItem('tinhoc_exam_history', JSON.stringify(mergedHistory));
      }

      // Đẩy ngược kết quả thi local lên Cloud
      for (const [key, localItem] of localMap.entries()) {
        const cleanKey = this.getCleanKey(key);
        if (!remoteData[cleanKey]) {
          this.pushExamResultToCloud(localItem).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Sync history error', e);
    }
  },

  getResultUniqueKey(item) {
    if (!item) return 'res_' + Date.now();
    if (item.id) return item.id;
    // Khóa duy nhất: Email + Phòng + Ngày giờ
    const email = item.studentEmail || item.studentName || 'hs';
    const room = item.roomId || item.title || 'exam';
    const date = item.date || '';
    return `${email}__${room}__${date}`.replace(/[.#$/[\]]/g, '_');
  },

  async pushExamResultToCloud(result) {
    if (!this.isConfigured() || !result) return;
    const key = this.getCleanKey(this.getResultUniqueKey(result));
    try {
      await fetch(`${this.config.databaseUrl}/exam_history/${key}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    } catch (e) {
      console.warn('Lỗi push điểm thi lên cloud:', e);
    }
  },

  // --- ĐỒNG BỘ CẤU HÌNH VIDEO ARCHIVE.ORG & BÀI GIẢNG ---
  async syncVideoConfig(baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/config/video.json`);
      if (!res.ok) return;
      const remoteConfig = await res.json();
      const localConfig = Storage.getVideoConfig();

      if (remoteConfig && (remoteConfig.videoBaseUrl || remoteConfig.archiveIdentifier)) {
        // Cập nhật cấu hình video từ Cloud xuống máy học sinh/giáo viên
        const merged = {
          ...localConfig,
          ...remoteConfig,
          // Giữ lại private key nếu máy này là Admin
          archiveAccessKey: localConfig.archiveAccessKey || remoteConfig.archiveAccessKey || '',
          archiveSecretKey: localConfig.archiveSecretKey || remoteConfig.archiveSecretKey || ''
        };
        localStorage.setItem('tinhoc_video_config', JSON.stringify(merged));
      } else if (localConfig.videoBaseUrl || localConfig.archiveIdentifier) {
        // Nếu Cloud chưa có mà máy này có, đẩy lên Cloud
        await this.pushVideoConfigToCloud(localConfig);
      }
    } catch (e) {
      console.warn('Lỗi đồng bộ cấu hình video từ Cloud:', e);
    }
  },

  async pushVideoConfigToCloud(config) {
    if (!this.isConfigured() || !config) return;
    try {
      // Chỉ đẩy public info lên Cloud để học sinh tải được video
      const publicPayload = {
        archiveIdentifier: config.archiveIdentifier || 'tinhoc-hub-thpt',
        videoBaseUrl: config.videoBaseUrl || `https://archive.org/download/${config.archiveIdentifier || 'tinhoc-hub-thpt'}/`,
        uploadedVideos: config.uploadedVideos || {},
        updatedAt: new Date().toISOString()
      };
      await fetch(`${this.config.databaseUrl}/config/video.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicPayload)
      });
    } catch (e) {
      console.warn('Lỗi đẩy cấu hình video lên cloud:', e);
    }
  },

  // 6. ĐẨY TOÀN BỘ DỮ LIỆU LOCAL LÊN ĐÁM MÂY (FORCE PUSH)
  async pushAllLocalToCloud() {
    if (!this.isConfigured()) {
      alert('Vui lòng nhập URL Cơ sở dữ liệu Cloud và Bật kết nối trước!');
      return false;
    }

    const confirmPush = confirm('Bạn có chắc chắn muốn TẢI TOÀN BỘ dữ liệu từ máy tính này lên Cloud không?\n(Dữ liệu bao gồm: Tất cả Tài khoản, Phòng thi và Lịch sử điểm)');
    if (!confirmPush) return false;

    this.isSyncing = true;
    this.notifyStatusChange();

    try {
      const accounts = Storage.getAccountsList();
      const rooms = Storage.getExamRooms();
      const history = Storage.getExamHistory();

      let accSuccess = 0;
      for (const acc of accounts) {
        await this.pushAccountToCloud(acc);
        accSuccess++;
      }

      let roomSuccess = 0;
      for (const r of rooms) {
        await this.pushRoomToCloud(r);
        roomSuccess++;
      }

      let histSuccess = 0;
      for (const h of history) {
        await this.pushExamResultToCloud(h);
        histSuccess++;
      }

      alert(`✅ Tải lên Đám mây thành công!\n• ${accSuccess} Tài khoản\n• ${roomSuccess} Phòng thi\n• ${histSuccess} Lượt thi`);
      return true;
    } catch (e) {
      alert(`⚠️ Lỗi tải lên: ${e.message}`);
      return false;
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  },

  // 7. KÉO TOÀN BỘ DỮ LIỆU TỪ ĐÁM MÂY VỀ MÁY (FORCE PULL)
  async pullAllCloudToLocal() {
    if (!this.isConfigured()) {
      alert('Vui lòng cấu hình URL Cloud trước!');
      return false;
    }

    const confirmPull = confirm('Kéo toàn bộ dữ liệu từ Đám mây về trình duyệt máy này?');
    if (!confirmPull) return false;

    const ok = await this.syncAll(true);
    return ok;
  }
};
