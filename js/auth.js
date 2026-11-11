/**
 * tinhoc-hub: Auth & User Management (Firebase Google Authentication)
 * Quản lý xác thực tài khoản Google trực tiếp qua Google Firebase Authentication.
 * Hỗ trợ: Đăng nhập Google Popup, Đồng bộ Firebase Realtime Database, Hồ sơ học sinh.
 */

import { Storage, DEFAULT_FIREBASE_API_KEY } from './storage.js?v=20261111_200';
import { getAvatarDataUrl } from './avatars.js?v=20261111_200';
import { CloudSync } from './cloud-sync.js?v=20261111_200';
import { escapeHtml } from './utils.js?v=20261111_200';
import { authedFetch } from './api.js?v=20261111_200';
import { DEFAULT_FIREBASE_DB_URL } from './cloud-sync.js?v=20261111_200';

const AUTH_STORAGE_KEY = 'tinhoc_user';

// Danh mục chuẩn các trường và danh sách lớp theo khối (Đọc động thời gian thực từ Storage / Cloud)
export const getSchoolsData = () => Storage.getSchoolsData();

export const SCHOOLS_DATA = new Proxy({}, {
  get(target, prop) {
    if (prop === Symbol.iterator) return undefined;
    const data = Storage.getSchoolsData();
    return data[prop];
  },
  has(target, prop) {
    const data = Storage.getSchoolsData();
    return prop in data;
  },
  ownKeys() {
    return Reflect.ownKeys(Storage.getSchoolsData());
  },
  getOwnPropertyDescriptor(target, prop) {
    const data = Storage.getSchoolsData();
    if (prop in data) {
      return { configurable: true, enumerable: true, value: data[prop] };
    }
    return undefined;
  }
});

export const Auth = {
  currentUser: null,
  firebaseAuth: null,
  isFirebaseInitialized: false,
  serverRole: null, // Nguồn sự thật duy nhất của vai trò đọc từ Firebase RTDB /roles/$uid
  onAuthChangeCallbacks: [],
  isSigningIn: false,
  isEditingProfile: false,

  init() {
    this.loadUserFromStorage();
    if (this.currentUser?.uid) {
      this.fetchServerRole(this.currentUser.uid).then(() => {
        if (typeof window !== 'undefined' && window.AppInstance && typeof window.AppInstance.renderHome === 'function') {
          window.AppInstance.renderHome();
        }
      }).catch(() => {});
    }
    this.ensureFirebaseInitialized();
    this.setupFirebaseAuthUI();
    this.bindGoogleAuthButtons();

    // Gán sự kiện nút Google qua bindGoogleAuthButtons()

    // Nếu Firebase SDK tải chậm từ CDN, đợi và khởi tạo ngay khi sẵn sàng
    if (typeof firebase === 'undefined' || !this.firebaseAuth) {
      this.waitForFirebaseSDK(3000).then(ready => {
        if (ready) {
          this.ensureFirebaseInitialized();
          this.bindGoogleAuthButtons();
        }
      });
    }

    this.setupSchoolClassSync({
      schoolSelectId: 'reg-input-school',
      customSchoolInputId: 'reg-input-school-custom',
      gradeSelectId: 'reg-input-grade',
      classSelectId: 'reg-input-class',
      customClassInputId: 'reg-input-class-custom',
      initialSchool: 'TT GDNN GDTX Chu Văn An',
      initialGrade: '12',
      initialClass: '12A1'
    });
  },

  loadUserFromStorage() {
    try {
      const data = localStorage.getItem(AUTH_STORAGE_KEY);
      if (data) {
        this.currentUser = JSON.parse(data);
        this.serverRole = 'student'; // Mặc định an toàn cho đến khi máy chủ xác thực qua fetchServerRole
        if (this.currentUser) {
          // Chuẩn hóa tự động: Nếu đã có trường và lớp thì coi như đã hoàn tất hồ sơ
          if (this.currentUser.school && this.currentUser.className) {
            if (!this.currentUser.profileCompleted || !this.currentUser.firstLoginDone) {
              this.currentUser.profileCompleted = true;
              this.currentUser.firstLoginDone = true;
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
            }
          } else {
            // Kiểm tra tìm trong cơ sở dữ liệu accounts hệ thống nếu là tài khoản đã có sẵn
            try {
              if (typeof Storage !== 'undefined' && typeof Storage.getAccountsList === 'function') {
                const email = (this.currentUser.email || '').trim().toLowerCase();
                const uid = (this.currentUser.uid || '').trim().toLowerCase();
                const uname = (this.currentUser.username || '').trim().toLowerCase();
                const accounts = Storage.getAccountsList();
                const found = accounts.find(a =>
                  (email && a.email && a.email.toLowerCase() === email) ||
                  (uid && a.uid && a.uid.toLowerCase() === uid) ||
                  (uname && a.username && a.username.toLowerCase() === uname)
                );
                if (found && (found.school && found.className)) {
                  this.currentUser.school = found.school;
                  this.currentUser.className = found.className;
                  this.currentUser.grade = found.grade || this.currentUser.grade || '12';
                  this.currentUser.fullName = found.fullName || this.currentUser.fullName || 'Học sinh';
                  this.currentUser.profileCompleted = true;
                  this.currentUser.firstLoginDone = true;
                  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
                }
              }
            } catch (e) {}
          }
        }
      } else {
        this.currentUser = null;
      }
    } catch (e) {
      console.error('Lỗi nạp thông tin user', e);
      this.currentUser = null;
    }
    this.notifyAuthChange();
  },

  onAuthChange(callback) {
    this.onAuthChangeCallbacks.push(callback);
    callback(this.currentUser);
  },

  notifyAuthChange() {
    this.onAuthChangeCallbacks.forEach(cb => {
      try { cb(this.currentUser); } catch (e) { console.error(e); }
    });
  },

  getCurrentUser() {
    return this.currentUser;
  },

  isLoggedIn() {
    return !!(this.currentUser && (this.currentUser.email || this.currentUser.fullName || this.currentUser.uid));
  },

  // Nguồn sự thật duy nhất của vai trò: Đọc trực tiếp từ Firebase RTDB /roles/$uid
  async fetchServerRole(uid) {
    const cleanUid = uid || this.currentUser?.uid;
    if (!cleanUid) {
      this.serverRole = 'student';
      return 'student';
    }
    try {
      const dbUrl = (typeof CloudSync !== 'undefined' && CloudSync.getBaseUrl)
        ? CloudSync.getBaseUrl()
        : DEFAULT_FIREBASE_DB_URL;
      const res = await authedFetch(`${dbUrl}/roles/${encodeURIComponent(cleanUid)}.json`, { cache: 'no-cache' });
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.role) {
          const verifiedRole = String(data.role).trim().toLowerCase();
          this.serverRole = verifiedRole;
          if (this.currentUser) {
            this.currentUser.role = verifiedRole;
            try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser)); } catch (e) {}
          }
          this.notifyAuthChange();
          return verifiedRole;
        } else {
          // Không có mục vai trò trong /roles/ -> mặc định là học sinh (student)
          this.serverRole = 'student';
          if (this.currentUser) {
            this.currentUser.role = 'student';
            try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser)); } catch (e) {}
          }
          this.notifyAuthChange();
          return 'student';
        }
      }
    } catch (e) {
      console.warn('Lỗi kiểm tra vai trò từ máy chủ:', e);
    }
    this.serverRole = this.serverRole || 'student';
    if (this.currentUser && !this.currentUser.role) {
      this.currentUser.role = 'student';
    }
    return this.serverRole;
  },

  isAdmin() {
    return this.serverRole === 'admin';
  },

  isTeacher() {
    return this.serverRole === 'teacher' || this.serverRole === 'admin';
  },

  isStudent() {
    return !this.serverRole || this.serverRole === 'student';
  },

  getUserRole() {
    return this.serverRole || 'student';
  },

  canManageQuestions() {
    return this.isTeacher();
  },

  canAccessSystemSettings() {
    return this.isAdmin();
  },

  getRoleLabel(role = null) {
    const r = role || this.serverRole || this.currentUser?.role || 'student';
    if (r === 'admin') return 'Quản trị viên (Admin)';
    if (r === 'teacher') return 'Giáo viên (GV)';
    return 'Học sinh (HS)';
  },

  // Gửi yêu cầu cấp quyền GV/Admin lên máy chủ (/role_requests/$uid)
  async requestRoleUpgrade({ requestedRole = 'teacher', school = '', reason = '' }) {
    if (!this.currentUser || !this.currentUser.uid) {
      return { success: false, message: 'Vui lòng đăng nhập trước khi gửi yêu cầu nâng quyền!' };
    }
    const cleanRole = (requestedRole === 'admin') ? 'admin' : 'teacher';
    const dbUrl = (typeof CloudSync !== 'undefined' && CloudSync.getBaseUrl)
      ? CloudSync.getBaseUrl()
      : DEFAULT_FIREBASE_DB_URL;
    const payload = {
      uid: this.currentUser.uid,
      email: this.currentUser.email || '',
      fullName: this.currentUser.fullName || 'Người dùng TinHocHub',
      school: school || this.currentUser.school || '',
      className: this.currentUser.className || '',
      requestedRole: cleanRole,
      reason: (reason || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    try {
      const res = await authedFetch(`${dbUrl}/role_requests/${encodeURIComponent(this.currentUser.uid)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res && res.ok) {
        return {
          success: true,
          message: `Yêu cầu cấp quyền [${cleanRole === 'admin' ? 'Quản trị viên' : 'Giáo viên'}] đã được gửi thành công!\n\nBan Quản Trị sẽ xem xét và phê duyệt trên hệ thống.`
        };
      }
      return { success: false, message: 'Không thể gửi yêu cầu lên máy chủ. Vui lòng kiểm tra kết nối mạng!' };
    } catch (e) {
      return { success: false, message: `Lỗi kết nối máy chủ: ${e.message}` };
    }
  },

  // Kích hoạt vai trò nhanh bằng mã bí mật qua Cloudflare Worker API
  async activateRoleWithCode(code) {
    if (!this.currentUser || !this.currentUser.uid) {
      return { success: false, message: 'Vui lòng đăng nhập trước khi kích hoạt vai trò!' };
    }
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      return { success: false, message: 'Vui lòng nhập mã kích hoạt vai trò!' };
    }

    try {
      const res = await authedFetch('/api/role/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          message: data.message || `Kích hoạt thất bại (Mã lỗi ${res.status}).`
        };
      }

      // Cập nhật serverRole và currentUser.role
      this.serverRole = data.role;
      if (this.currentUser) {
        this.currentUser.role = data.role;
        Storage.saveCurrentUser(this.currentUser);
      }

      // Thông báo các subscriber UI
      this.notifyAuthChange();

      // Thử đọc lại vai trò từ máy chủ để đồng bộ toàn diện
      await this.fetchServerRole(this.currentUser.uid);

      return {
        success: true,
        role: data.role,
        roleLabel: data.roleLabel,
        message: data.message || `Chúc mừng! Bạn đã kích hoạt thành công vai trò [${data.roleLabel}].`
      };
    } catch (err) {
      return {
        success: false,
        message: `Lỗi kết nối tới máy chủ khi kích hoạt vai trò: ${err.message}`
      };
    }
  },

  isProfileComplete() {
    if (!this.currentUser) return false;
    // 1. Quản trị viên và Giáo viên luôn hoàn tất hồ sơ
    if (this.currentUser.role === 'admin' || this.currentUser.role === 'teacher') {
      if (!this.currentUser.fullName) this.currentUser.fullName = this.currentUser.role === 'admin' ? 'Quản trị viên TinHocHub' : 'Giáo viên TinHocHub';
      if (!this.currentUser.school) this.currentUser.school = this.currentUser.role === 'admin' ? 'Ban Quản Trị TinHocHub' : 'THPT Thực Hành HCMUE';
      if (!this.currentUser.className) this.currentUser.className = this.currentUser.role === 'admin' ? 'Quản trị hệ thống' : 'Tổ Tin học';
      if (!this.currentUser.grade) this.currentUser.grade = '12';
      return true;
    }

    // 2. Học sinh đã có Trường và Lớp -> ĐÃ HOÀN TẤT
    const hasSchool = Boolean(this.currentUser.school && String(this.currentUser.school).trim());
    const hasClass = Boolean(this.currentUser.className && String(this.currentUser.className).trim());
    if (hasSchool && hasClass) {
      if (!this.currentUser.profileCompleted || !this.currentUser.firstLoginDone) {
        this.currentUser.profileCompleted = true;
        this.currentUser.firstLoginDone = true;
        try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser)); } catch (e) {}
      }
      return true;
    }

    // 3. Học sinh đã từng hoàn tất hoặc đã qua lần đăng nhập đầu tiên
    if (this.currentUser.profileCompleted || this.currentUser.firstLoginDone) {
      return true;
    }

    // 4. Kiểm tra tài khoản trong danh sách hệ thống (Storage.getAccountsList)
    try {
      if (typeof Storage !== 'undefined' && typeof Storage.getAccountsList === 'function') {
        const email = (this.currentUser.email || '').trim().toLowerCase();
        const uid = (this.currentUser.uid || '').trim().toLowerCase();
        const uname = (this.currentUser.username || '').trim().toLowerCase();
        const accounts = Storage.getAccountsList();
        const found = accounts.find(a =>
          (email && a.email && a.email.toLowerCase() === email) ||
          (uid && a.uid && a.uid.toLowerCase() === uid) ||
          (uname && a.username && a.username.toLowerCase() === uname)
        );

        if (found) {
          // Học sinh đã có trong hệ thống -> Tự động khôi phục và không tự bật modal bắt buộc
          this.currentUser.school = found.school || this.currentUser.school || 'TT GDNN GDTX Chu Văn An';
          this.currentUser.className = found.className || this.currentUser.className || '12A1';
          this.currentUser.grade = found.grade || this.currentUser.grade || '12';
          this.currentUser.fullName = found.fullName || this.currentUser.fullName || 'Học sinh';
          this.currentUser.profileCompleted = true;
          this.currentUser.firstLoginDone = true;
          try {
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
            Storage.saveAccountRecord(this.currentUser);
          } catch (e) {}
          return true;
        }
      }
    } catch (e) {}

    // Chỉ trả về false khi là học sinh hoàn toàn mới đăng nhập lần đầu tiên chưa từng có trong hệ thống
    return false;
  },

  // ==================== FIREBASE AUTHENTICATION (GOOGLE SIGN-IN) ====================
  cleanFirebaseApiKey(key) {
    if (!key || typeof key !== 'string') return '';
    let clean = key.trim().replace(/['";,\s]/g, '');
    const m = clean.match(/AIza[A-Za-z0-9_-]{30,}/);
    if (m) return m[0];
    return clean;
  },

  isFirebaseApiKey(key) {
    const clean = this.cleanFirebaseApiKey(key);
    return clean.startsWith('AIza') && clean.length >= 25;
  },

  async testFirebaseApiKey(apiKey) {
    const clean = this.cleanFirebaseApiKey(apiKey);
    if (!clean) {
      return { ok: false, message: 'Vui lòng nhập mã Web API Key (bắt đầu bằng "AIzaSy...")' };
    }
    if (!clean.startsWith('AIza') || clean.length < 25) {
      return { ok: false, message: 'Định dạng không đúng! Khóa Web API Key của Google/Firebase phải bắt đầu bằng "AIzaSy..."' };
    }

    try {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${clean}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data && data.error) {
        const msg = data.error.message || '';
        const reason = data.error.details?.[0]?.reason || '';
        if (msg.includes('API key not valid') || reason === 'API_KEY_INVALID') {
          return {
            ok: false,
            message: 'Mã API Key không tồn tại trên Google Cloud (hoặc bị sao chép thiếu/sai ký tự). Vui lòng vào Firebase Console -> Project Settings -> General -> Your apps để copy đúng mã.'
          };
        } else if (msg.includes('Identity Toolkit API') || msg.includes('disabled') || reason === 'SERVICE_DISABLED') {
          return {
            ok: false,
            message: 'Dịch vụ Identity Toolkit API chưa được bật trên dự án Firebase này! Vui lòng vào Firebase Console -> Authentication -> Bấm "Get started" và bật "Google Sign-in".'
          };
        }
      }
      return { ok: true, message: 'Khóa Web API Key hoàn toàn HỢP LỆ và đã kết nối thành công tới Google Identity Toolkit!' };
    } catch (e) {
      return { ok: false, message: `Lỗi kết nối mạng: ${e.message}` };
    }
  },

  waitForFirebaseSDK(timeoutMs = 3000) {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 50);
    });
  },

  ensureFirebaseInitialized() {
    if (this.firebaseAuth && this.isFirebaseInitialized) return true;

    if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
      return false;
    }

    const cfg = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : {};
    let cleanKey = this.cleanFirebaseApiKey(cfg.apiKey);
    if (!cleanKey || !this.isFirebaseApiKey(cleanKey)) {
      cleanKey = DEFAULT_FIREBASE_API_KEY;
    }

    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp({
          apiKey: cleanKey,
          authDomain: cfg.authDomain || (cfg.projectId ? `${cfg.projectId}.firebaseapp.com` : 'on-tap-nghiaedu-tin-hoc.firebaseapp.com'),
          projectId: cfg.projectId || 'on-tap-nghiaedu-tin-hoc',
          databaseURL: cfg.databaseURL || 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.asia-southeast1.firebasedatabase.app'
        });
      }

      this.firebaseAuth = firebase.auth();
      this.isFirebaseInitialized = true;

      // Lắng nghe thay đổi trạng thái xác thực Firebase
      this.firebaseAuth.onAuthStateChanged((user) => {
        if (user) {
          this.handleFirebaseUser(user);
        }
      });

      // Kiểm tra kết quả Redirect nếu người dùng vừa xác thực Google Redirect về trang
      if (typeof this.firebaseAuth.getRedirectResult === 'function') {
        this.firebaseAuth.getRedirectResult().then((result) => {
          if (result && result.user) {
            console.log("Đã đăng nhập thành công qua Google Redirect:", result.user);
            this.handleFirebaseUser(result.user);
          }
        }).catch((err) => {
          if (err && err.code !== 'auth/null-user') {
            console.warn("Lỗi getRedirectResult:", err);
          }
        });
      }

      return true;
    } catch (err) {
      console.warn('Lỗi khởi tạo Firebase Auth:', err);
      return false;
    }
  },

  initFirebaseAuth() {
    const ok = this.ensureFirebaseInitialized();
    this.bindGoogleAuthButtons();
    return ok;
  },

  bindGoogleAuthButtons() {
    const selector = '#btn-firebase-google-signin, #btn-firebase-google-signup, [data-trigger-google-firebase]';
    document.querySelectorAll(selector).forEach(btn => {
      btn.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this.signInWithGoogleFirebase();
      };
    });
  },

  // Tương thích ngược với các lệnh gọi cũ
  initGoogleIdentity() {
    return this.initFirebaseAuth();
  },

  setGoogleClientId(clientId) {
    if (clientId) {
      const clean = clientId.trim();
      if (this.isFirebaseApiKey(clean)) {
        Storage.saveFirebaseAuthConfig({ apiKey: clean });
        this.initFirebaseAuth();
      } else if (clean.includes('googleusercontent.com')) {
        Storage.saveAdminConfig({ googleClientId: clean });
      }
    }
  },

  getGoogleClientId() {
    const cfg = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : {};
    return (cfg.apiKey && this.isFirebaseApiKey(cfg.apiKey)) ? cfg.apiKey : '';
  },

  setupFirebaseAuthUI() {
    // Bắt sự kiện form cấu hình Firebase Auth
    const formCfg = document.getElementById('form-firebase-auth-cfg');
    if (formCfg) {
      formCfg.onsubmit = (e) => {
        e.preventDefault();
        const rawKey = document.getElementById('input-firebase-api-key')?.value || '';
        const cleanKey = this.cleanFirebaseApiKey(rawKey);
        const projectId = document.getElementById('input-firebase-project-id')?.value.trim() || '';
        let authDomain = document.getElementById('input-firebase-auth-domain')?.value.trim() || '';

        if (!authDomain && projectId) {
          authDomain = `${projectId}.firebaseapp.com`;
        }

        if (!cleanKey) {
          alert('Vui lòng nhập Firebase Web API Key!');
          return;
        }

        if (!this.isFirebaseApiKey(cleanKey)) {
          alert('Mã Firebase Web API Key không đúng định dạng!\nMã hợp lệ phải bắt đầu bằng "AIzaSy..." và có độ dài tối thiểu 25 ký tự.');
          return;
        }

        const savedAuth = Storage.saveFirebaseAuthConfig({
          apiKey: cleanKey,
          projectId,
          authDomain
        });

        // Tự động đẩy lên máy chủ Cloud (Firebase RTDB) để toàn bộ học sinh được thừa hưởng
        if (CloudSync && typeof CloudSync.pushAuthConfigToCloud === 'function') {
          CloudSync.pushAuthConfigToCloud(savedAuth);
        }

        alert('✅ Đã lưu cấu hình Firebase Auth lên máy chủ thành công!\nToàn bộ học sinh và giáo viên sẽ tự động đăng nhập được bằng Google mà không cần nhập key.');
        const modal = document.getElementById('modal-firebase-config');
        if (modal) modal.classList.add('hidden');

        this.initFirebaseAuth();
        this.signInWithGoogleFirebase();
      };
    }

    // Nút Kiểm Tra Khóa Web API Key trực tiếp với Google Identity Toolkit
    const btnTestKey = document.getElementById('btn-test-firebase-api-key');
    if (btnTestKey) {
      btnTestKey.onclick = async () => {
        const rawKey = document.getElementById('input-firebase-api-key')?.value || '';
        btnTestKey.disabled = true;
        btnTestKey.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang test...';

        const res = await this.testFirebaseApiKey(rawKey);
        btnTestKey.disabled = false;
        btnTestKey.innerHTML = '<i class="fa-solid fa-bolt"></i> Kiểm Tra Khóa';

        const hintEl = document.getElementById('firebase-cfg-hint-msg');
        if (hintEl) {
          hintEl.textContent = res.message;
          hintEl.parentElement?.classList.remove('hidden');
          if (res.ok) {
            hintEl.parentElement.className = 'p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed mb-4 flex items-start gap-2.5';
          } else {
            hintEl.parentElement.className = 'p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 leading-relaxed mb-4 flex items-start gap-2.5';
          }
        }
        alert(res.ok ? `🎉 ${res.message}` : `❌ ${res.message}`);
      };
    }

    // Tự động phân tích khi dán mã cấu hình Firebase JSON
    const textConfig = document.getElementById('input-firebase-config-json');
    if (textConfig) {
      textConfig.oninput = () => {
        const val = textConfig.value;
        const apiKeyMatch = val.match(/apiKey["']?\s*:\s*["']([^"']+)["']/);
        const authDomainMatch = val.match(/authDomain["']?\s*:\s*["']([^"']+)["']/);
        const projectIdMatch = val.match(/projectId["']?\s*:\s*["']([^"']+)["']/);

        if (apiKeyMatch && apiKeyMatch[1]) {
          const inputKey = document.getElementById('input-firebase-api-key');
          if (inputKey) inputKey.value = apiKeyMatch[1];
        }
        if (authDomainMatch && authDomainMatch[1]) {
          const inputDomain = document.getElementById('input-firebase-auth-domain');
          if (inputDomain) inputDomain.value = authDomainMatch[1];
        }
        if (projectIdMatch && projectIdMatch[1]) {
          const inputProj = document.getElementById('input-firebase-project-id');
          if (inputProj) inputProj.value = projectIdMatch[1];
        }
      };
    }

    // Nút Bỏ qua cấu hình để vào học ngay
    const btnBypass = document.getElementById('btn-bypass-firebase-login');
    if (btnBypass) {
      btnBypass.onclick = () => {
        const modal = document.getElementById('modal-firebase-config');
        if (modal) modal.classList.add('hidden');
        const inputId = document.getElementById('login-input-identity');
        if (inputId) inputId.focus();
      };
    }

    // Nút Xóa cấu hình Firebase API key
    const btnClearCfg = document.getElementById('btn-clear-firebase-config');
    if (btnClearCfg) {
      btnClearCfg.onclick = () => {
        Storage.saveFirebaseAuthConfig({ apiKey: '', projectId: '', authDomain: '' });
        const inputKey = document.getElementById('input-firebase-api-key');
        if (inputKey) inputKey.value = '';
        if (this.firebaseAuth) {
          try { firebase.app().delete(); } catch(e) {}
          this.firebaseAuth = null;
          this.isFirebaseInitialized = false;
        }
        alert('Đã xóa cấu hình Firebase API Key.');
        const modal = document.getElementById('modal-firebase-config');
        if (modal) modal.classList.add('hidden');
      };
    }

    // Mở modal cài đặt Firebase Auth
    const openBtns = [
      document.getElementById('btn-open-google-config'),
      document.getElementById('btn-open-firebase-config'),
      document.getElementById('btn-google-quick-open-oauth-cfg')
    ];
    openBtns.forEach(btn => {
      if (btn) btn.onclick = () => this.openFirebaseConfigModal();
    });
  },

  openFirebaseConfigModal(hintMessage = '') {
    // Chỉ Admin mới được phép mở modal cấu hình kỹ thuật Firebase Web API Key
    if (!this.isAdmin()) {
      alert('Chức năng cài đặt API Key chỉ dành riêng cho Quản trị viên (Admin).\nNếu em là học sinh, hãy đăng nhập trực tiếp bằng Email/Tài khoản và Mật khẩu ở bên dưới nhé!');
      return;
    }
    const modal = document.getElementById('modal-firebase-config');
    if (modal) {
      modal.classList.remove('hidden');
      const cfg = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : {};
      const inputKey = document.getElementById('input-firebase-api-key');
      const inputProj = document.getElementById('input-firebase-project-id');
      const inputDomain = document.getElementById('input-firebase-auth-domain');
      if (inputKey) inputKey.value = (cfg.apiKey && this.isFirebaseApiKey(cfg.apiKey)) ? cfg.apiKey : '';
      if (inputProj && !inputProj.value) inputProj.value = cfg.projectId || '';
      if (inputDomain && !inputDomain.value) inputDomain.value = cfg.authDomain || '';

      const hintEl = document.getElementById('firebase-cfg-hint-msg');
      if (hintEl) {
        if (hintMessage) {
          hintEl.textContent = hintMessage;
          hintEl.parentElement?.classList.remove('hidden');
        } else {
          hintEl.parentElement?.classList.add('hidden');
        }
      }
      inputKey?.focus();
    } else {
      const modalQuick = document.getElementById('modal-google-quick-prompt');
      if (modalQuick) modalQuick.classList.remove('hidden');
    }
  },

  renderFallbackGoogleButtons() {
    const googleSvg = `
      <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
        <path fill="#34A853" d="M12 24c3.3 0 6.08-1.09 8.11-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.23 1.16-3.26 0-6.02-2.2-7-5.15H1.01v3.14C3.03 21.16 7.21 24 12 24z"/>
        <path fill="#FBBC05" d="M5 14c-.25-.72-.39-1.49-.39-2.3s.14-1.58.39-2.3V6.26H1.01C.37 7.54 0 8.98 0 11.7s.37 4.16 1.01 5.44L5 14z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.21 0 3.03 2.84 1.01 6.86L5 10c.98-2.95 3.74-5.25 7-5.25z"/>
      </svg>
    `;

    const signInContainer = document.getElementById('google-signin-btn-container');
    if (signInContainer) {
      signInContainer.innerHTML = `
        <button type="button" data-trigger-google-firebase="signin" class="w-full max-w-xs px-5 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
          ${googleSvg}
          <span>Đăng nhập với Google (Firebase)</span>
        </button>
      `;
    }

    const signUpContainer = document.getElementById('google-signup-btn-container');
    if (signUpContainer) {
      signUpContainer.innerHTML = `
        <button type="button" data-trigger-google-firebase="signup" class="w-full max-w-xs px-5 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
          ${googleSvg}
          <span>Đăng ký nhanh với Google (Firebase)</span>
        </button>
      `;
    }

    document.querySelectorAll('[data-trigger-google-firebase]').forEach(btn => {
      btn.onclick = () => this.signInWithGoogleFirebase();
    });
  },

  async signInWithGoogleFirebase() {
    if (this.isSigningIn) {
      console.warn('Đang có một tiến trình xác thực Google đang mở...');
      return;
    }
    this.isSigningIn = true;

    const btns = document.querySelectorAll('#btn-firebase-google-signin, #btn-firebase-google-signup, [data-trigger-google-firebase]');
    btns.forEach(b => {
      b.disabled = true;
      if (!b.dataset.prevHtml) b.dataset.prevHtml = b.innerHTML;
      b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang mở xác thực Google...';
    });

    // Watchdog tự động khôi phục nút sau 6 giây nếu popup bị treo hoặc đóng mà không kích hoạt callback
    const watchdogTimer = setTimeout(() => {
      this.isSigningIn = false;
      btns.forEach(b => {
        b.disabled = false;
        if (b.dataset.prevHtml) {
          b.innerHTML = b.dataset.prevHtml;
          delete b.dataset.prevHtml;
        }
      });
    }, 6000);

    try {
      // Đảm bảo Firebase SDK đã sẵn sàng
      if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
        const ready = await this.waitForFirebaseSDK(3000);
        if (!ready) {
          alert('Không thể kết nối đến thư viện Google Firebase (có thể do đường truyền hoặc trình duyệt chặn kết nối).\n\nEm vui lòng chọn một trong các nút "Vào nhanh không cần mật khẩu" hoặc đăng nhập bằng Email/Tài khoản ở bên dưới để vào học ngay nhé!');
          document.getElementById('login-input-identity')?.focus();
          return;
        }
      }

      const ok = this.ensureFirebaseInitialized();
      if (!ok || !this.firebaseAuth) {
        alert('Đang kết nối xác thực Google. Em hãy chọn một trong các nút "Vào nhanh không cần mật khẩu" hoặc đăng nhập bằng Email/Tài khoản ở bên dưới để vào học ngay nhé!');
        document.getElementById('login-input-identity')?.focus();
        return;
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Thử xác thực qua Popup, tự động chuyển đổi sang Redirect nếu gặp lỗi chặn COOP/Tracking
      let result = null;
      try {
        result = await this.firebaseAuth.signInWithPopup(provider);
      } catch (popupErr) {
        console.warn('Popup gặp lỗi hoặc bị chặn COOP/Tracking, tự động chuyển sang signInWithRedirect:', popupErr);
        const isCoopOrBlocked = popupErr.code === 'auth/popup-blocked' ||
                                popupErr.code === 'auth/cancelled-popup-request' ||
                                popupErr.code === 'auth/internal-error' ||
                                (popupErr.message && (
                                  popupErr.message.includes('Cross-Origin-Opener-Policy') ||
                                  popupErr.message.includes('window.closed') ||
                                  popupErr.message.includes('tracking')
                                ));

        if (isCoopOrBlocked && typeof this.firebaseAuth.signInWithRedirect === 'function') {
          btns.forEach(b => {
            b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang chuyển hướng Google...';
          });
          await this.firebaseAuth.signInWithRedirect(provider);
          return;
        }
        throw popupErr;
      }

      if (result && result.user) {
        this.handleFirebaseUser(result.user);
      }
    } catch (err) {
      console.error('Lỗi đăng nhập Google Firebase:', err);
      const isApiKeyErr = err.code === 'auth/api-key-not-valid' ||
                          err.code === 'auth/invalid-api-key' ||
                          (err.code && String(err.code).includes('api-key-not-valid')) ||
                          (err.message && String(err.message).includes('api-key-not-valid'));

      if (isApiKeyErr) {
        alert('Đăng nhập Google tạm thời gián đoạn do cấu hình API Key. Bạn vui lòng đăng nhập bằng Email / Tên tài khoản và Mật khẩu ở bên dưới!');
        document.getElementById('login-input-identity')?.focus();
      } else if (err.code === 'auth/popup-blocked') {
        alert('Trình duyệt đã chặn cửa sổ đăng nhập Google (Pop-up blocked)!\n\nVui lòng nhấp vào biểu tượng Pop-up trên thanh địa chỉ của trình duyệt để "Cho phép Pop-up từ trang này", hoặc đăng nhập bằng Email / Tên tài khoản và Mật khẩu ở bên dưới.');
      } else if (err.code === 'auth/unauthorized-domain' || err.code === 'auth/invalid-continue-uri' || (err.message && err.message.includes('invalid-continue-uri'))) {
        const domain = window.location.hostname;
        alert(`⚠️ TÊN MIỀN [${domain}] CHƯA ĐƯỢC ỦY QUYỀN TRÊN GOOGLE FIREBASE!\n\n• Hướng dẫn Quản trị viên: Truy cập Firebase Console > Authentication > Settings > Authorized domains và thêm tên miền "${domain}".\n• Người dùng: Vui lòng đăng nhập bằng Email / Tên tài khoản và Mật khẩu ở khung bên dưới.`);
        document.getElementById('login-input-identity')?.focus();
      } else if (err.code === 'auth/operation-not-allowed') {
        alert('Phương thức Google Sign-In chưa được kích hoạt trong Firebase Console!\n\nBạn vui lòng đăng nhập bằng Email / Tên tài khoản và Mật khẩu ở bên dưới.');
        document.getElementById('login-input-identity')?.focus();
      } else if (err.code === 'auth/popup-closed-by-user') {
        // Người dùng chủ động đóng popup
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Đã có một popup khác đang mở
      } else {
        alert(`Xác thực Firebase: ${err.message || err.code || 'Có lỗi xảy ra'}\nBạn có thể đăng nhập bằng Email/Tài khoản và Mật khẩu ở bên dưới để vào học ngay nhé!`);
        document.getElementById('login-input-identity')?.focus();
      }
    } finally {
      clearTimeout(watchdogTimer);
      this.isSigningIn = false;
      btns.forEach(b => {
        b.disabled = false;
        if (b.dataset.prevHtml) {
          b.innerHTML = b.dataset.prevHtml;
          delete b.dataset.prevHtml;
        }
      });
    }
  },

  handleFirebaseUser(firebaseUser) {
    if (!firebaseUser) return null;
    const email = (firebaseUser.email || '').trim().toLowerCase();
    const fullName = (firebaseUser.displayName || '').trim() || this.currentUser?.fullName || 'Người dùng TinHocHub';
    const avatar = firebaseUser.photoURL || this.currentUser?.avatar || getAvatarDataUrl(fullName, this.serverRole);
    const uid = firebaseUser.uid;

    const profile = this.loginOrRegisterWithGoogleInfo({
      email,
      fullName,
      picture: avatar,
      sub: uid
    });
    this.fetchServerRole(uid).then(() => {
      if (window.AppInstance && typeof window.AppInstance.renderHome === 'function') {
        window.AppInstance.renderHome();
      }
    }).catch(() => {});

    const modalLogin = document.getElementById('modal-login');
    if (modalLogin) {
      modalLogin.classList.add('hidden');
      modalLogin.style.setProperty('display', 'none', 'important');
    }

    if (this.isProfileComplete()) {
      document.documentElement.classList.add('is-authenticated');
      document.documentElement.classList.remove('has-incomplete-profile');
      if (typeof window.closeLoginModal === 'function') {
        window.closeLoginModal();
      }
      const profileModal = document.getElementById('modal-required-profile');
      if (profileModal && !this.isEditingProfile) {
        profileModal.classList.add('hidden');
        profileModal.style.removeProperty('display');
      }
      const gatekeeperOverlay = document.getElementById('auth-gatekeeper-overlay');
      if (gatekeeperOverlay) {
        gatekeeperOverlay.classList.add('hidden');
      }
    } else {
      document.documentElement.classList.remove('is-authenticated');
      document.documentElement.classList.add('has-incomplete-profile');
      this.openRequiredProfileModal();

      // Đồng bộ ngầm từ Cloud phòng trường hợp học sinh đã từng chọn trường/lớp trên thiết bị khác
      if (CloudSync && typeof CloudSync.syncAccounts === 'function') {
        CloudSync.syncAccounts().then(() => {
          const syncedAccounts = Storage.getAccountsList();
          const remoteFound = syncedAccounts.find(a => a.email && a.email.toLowerCase() === email);
          if (remoteFound && ((remoteFound.school && remoteFound.className) || remoteFound.profileCompleted || remoteFound.firstLoginDone)) {
            this.currentUser = {
              ...this.currentUser,
              fullName: remoteFound.fullName || this.currentUser.fullName,
              grade: remoteFound.grade || this.currentUser.grade || '12',
              school: remoteFound.school || this.currentUser.school || 'TT GDNN GDTX Chu Văn An',
              className: remoteFound.className || this.currentUser.className || '12A1',
              profileCompleted: true,
              firstLoginDone: true,
              profileUpdatedAt: remoteFound.profileUpdatedAt || new Date().toISOString()
            };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
            this.closeRequiredProfileModal();
            this.notifyAuthChange();
            if (window.AppInstance) {
              if (typeof window.AppInstance.renderHome === 'function') window.AppInstance.renderHome();
              if (typeof window.AppInstance.enforceAuthentication === 'function') window.AppInstance.enforceAuthentication();
            }
          }
        }).catch(() => {});
      }
    }

    if (window.AppInstance) {
      if (typeof window.AppInstance.renderHome === 'function') {
        window.AppInstance.renderHome();
      }
      if (typeof window.AppInstance.enforceAuthentication === 'function') {
        window.AppInstance.enforceAuthentication();
      }
    }
    return profile;
  },

  loginOrRegisterWithGoogleInfo({ email, fullName, picture = '', sub = '' }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim() || 'Người dùng Google';
    const avatar = picture || getAvatarDataUrl(cleanName);

    // Tìm xem tài khoản Gmail này đã từng đăng ký hoặc cập nhật trên thiết bị chưa
    const savedAccounts = Storage.getAccountsList();
    const found = savedAccounts.find(a => a.email && a.email.toLowerCase() === cleanEmail);
    const curSame = (this.currentUser && this.currentUser.email && this.currentUser.email.toLowerCase() === cleanEmail) ? this.currentUser : null;
    const existing = (curSame && (curSame.profileCompleted || curSame.profileUpdatedAt || (curSame.school && curSame.className))) ? curSame : (found || curSame);

    const userRole = this.serverRole || existing?.role || 'student';
    const hasExistingProfile = Boolean(existing && existing.school && existing.className);

    const profile = {
      uid: sub || existing?.uid || ('firebase_' + Date.now()),
      email: cleanEmail,
      fullName: (hasExistingProfile && existing?.fullName) ? existing.fullName : (cleanName || existing?.fullName || 'Học sinh Google'),
      avatar: avatar,
      grade: existing?.grade || '12',
      className: existing?.className || '',
      school: existing?.school || '',
      role: userRole,
      profileCompleted: Boolean(hasExistingProfile || existing?.profileCompleted || existing?.firstLoginDone),
      firstLoginDone: Boolean(hasExistingProfile || existing?.firstLoginDone || existing?.profileCompleted),
      profileUpdatedAt: existing?.profileUpdatedAt || (hasExistingProfile ? new Date().toISOString() : null),
      lastActive: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    this.saveUser(profile);
    return profile;
  },

  // Đăng nhập an toàn bằng Email + Mật khẩu thông qua Firebase Authentication
  async loginWithCredentialsAsync(identity, password) {
    this.ensureFirebaseInitialized();
    if (!this.firebaseAuth) {
      return { success: false, message: 'Dịch vụ xác thực Firebase chưa sẵn sàng. Vui lòng tải lại trang!' };
    }

    const raw = (identity || '').trim();
    const pwd = (password || '').trim();
    if (!raw) return { success: false, message: 'Vui lòng nhập Email của bạn!' };
    if (!pwd) return { success: false, message: 'Vui lòng nhập Mật khẩu cá nhân!' };

    let targetEmail = raw.toLowerCase();
    // Nếu học sinh nhập username không có @, tra cứu email tương ứng trong danh sách tài khoản đã lưu
    if (!targetEmail.includes('@')) {
      const accounts = Storage.getAccountsList();
      const matched = accounts.find(a =>
        (a.username && a.username.toLowerCase() === targetEmail) ||
        (a.email && a.email.split('@')[0].toLowerCase() === targetEmail)
      );
      if (matched && matched.email) {
        targetEmail = matched.email.toLowerCase();
      } else {
        return {
          success: false,
          code: 'INVALID_EMAIL',
          message: 'Vui lòng nhập đầy đủ địa chỉ Email của bạn (ví dụ: hocsinh@gmail.com) để đăng nhập bảo mật qua Firebase!'
        };
      }
    }

    try {
      const userCredential = await this.firebaseAuth.signInWithEmailAndPassword(targetEmail, pwd);
      const fbUser = userCredential.user;

      // Tìm thông tin hồ sơ đã lưu hoặc tải từ Cloud
      let userProfile = null;
      const accounts = Storage.getAccountsList();
      const existing = accounts.find(a =>
        (a.uid && a.uid === fbUser.uid) ||
        (a.email && a.email.toLowerCase() === targetEmail)
      );

      const nowIso = new Date().toISOString();
      userProfile = {
        uid: fbUser.uid,
        email: targetEmail,
        fullName: existing?.fullName || fbUser.displayName || 'Học sinh',
        avatar: existing?.avatar || fbUser.photoURL || getAvatarDataUrl(fbUser.displayName || 'HS'),
        grade: existing?.grade || '12',
        className: existing?.className || '',
        school: existing?.school || '',
        role: existing?.role || 'student',
        profileCompleted: Boolean(existing && existing.school && existing.className),
        firstLoginDone: true,
        lastActive: nowIso,
        createdAt: existing?.createdAt || nowIso
      };

      await this.fetchServerRole(fbUser.uid);
      userProfile.role = this.serverRole;
      this.saveUser(userProfile);

      // Đồng bộ tiến trình sau khi đăng nhập thành công
      if (CloudSync) {
        Promise.all([
          CloudSync.syncUserProgress ? CloudSync.syncUserProgress(null, userProfile) : Promise.resolve(),
          CloudSync.syncHistory ? CloudSync.syncHistory() : Promise.resolve(),
          CloudSync.syncRooms ? CloudSync.syncRooms() : Promise.resolve()
        ]).then(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tinhoc-cloud-synced', { detail: { timestamp: new Date().toISOString() } }));
          }
        }).catch(() => {});
      }

      return { success: true, user: userProfile };
    } catch (err) {
      console.error('Lỗi signInWithEmailAndPassword:', err);
      let msg = 'Đăng nhập không thành công. Vui lòng kiểm tra lại email và mật khẩu!';
      let code = err.code || 'UNKNOWN';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials') {
        code = 'NOT_FOUND';
        msg = 'Tài khoản hoặc mật khẩu không chính xác!\nNếu bạn chưa có tài khoản, vui lòng chuyển sang tab "Đăng Ký Mới" để tạo tài khoản.';
      } else if (err.code === 'auth/wrong-password') {
        code = 'WRONG_PASSWORD';
        msg = 'Mật khẩu không chính xác! Vui lòng kiểm tra lại hoặc bấm "Quên mật khẩu?" để khôi phục.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Địa chỉ email không hợp lệ. Vui lòng nhập đúng định dạng email (ví dụ: hocsinh@gmail.com).';
      } else if (err.code === 'auth/user-disabled') {
        msg = 'Tài khoản này đã bị tạm khóa. Vui lòng liên hệ Thầy Cô hoặc Ban Quản Trị để được hỗ trợ.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Tài khoản tạm thời bị giới hạn do đăng nhập sai nhiều lần liên tiếp. Vui lòng thử lại sau ít phút hoặc dùng chức năng Quên mật khẩu!';
      }
      return { success: false, code, message: msg };
    }
  },

  // Đồng bộ giao diện với hàm đăng nhập bất đồng bộ
  loginWithCredentials(identity, password) {
    return this.loginWithCredentialsAsync(identity, password);
  },

  // Tương thích ngược với các lệnh gọi cũ
  loginWithDirectIdentity(identity, password = '') {
    return this.loginWithCredentialsAsync(identity, password);
  },

  // Đăng ký tài khoản mới trực tiếp qua Firebase Authentication
  async registerUser({ fullName, grade, className, school, email, password = '', role = 'student', secretCode = '' }) {
    this.ensureFirebaseInitialized();
    if (!this.firebaseAuth) {
      return { success: false, message: 'Dịch vụ xác thực Firebase chưa sẵn sàng. Vui lòng thử lại sau giây lát!' };
    }

    const cleanName = (fullName || '').trim();
    const cleanClass = (className || '').trim();
    const cleanSchool = (school || '').trim();
    const cleanGrade = grade || '12';
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanName) {
      return { success: false, message: 'Vui lòng nhập Họ và tên của bạn!' };
    }
    if (!cleanSchool) {
      return { success: false, message: 'Vui lòng chọn hoặc nhập Trường học của bạn!' };
    }
    if (!cleanClass) {
      return { success: false, message: 'Vui lòng chọn hoặc nhập Lớp học của bạn!' };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Vui lòng nhập đúng định dạng Email của bạn (ví dụ: hocsinh@gmail.com) để đăng ký bảo mật!' };
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      return { success: false, message: 'Mật khẩu phải có tối thiểu 6 ký tự để bảo mật tài khoản và điểm số của bạn!' };
    }

    try {
      const userCredential = await this.firebaseAuth.createUserWithEmailAndPassword(cleanEmail, cleanPassword);
      const fbUser = userCredential.user;

      if (fbUser && typeof fbUser.updateProfile === 'function') {
        await fbUser.updateProfile({ displayName: cleanName }).catch(() => {});
      }

      const nowIso = new Date().toISOString();
      const newUser = {
        uid: fbUser.uid,
        email: cleanEmail,
        fullName: cleanName,
        avatar: getAvatarDataUrl(cleanName),
        grade: cleanGrade,
        className: cleanClass,
        school: cleanSchool,
        role: 'student', // Quyền do server quản lý
        profileCompleted: true,
        firstLoginDone: true,
        profileUpdatedAt: nowIso,
        createdAt: nowIso
      };

      this.saveUser(newUser);
      return { success: true, user: newUser, message: 'Đăng ký tài khoản thành công!' };
    } catch (err) {
      console.error('Lỗi createUserWithEmailAndPassword:', err);
      let msg = 'Đăng ký tài khoản không thành công. Vui lòng thử lại!';
      if (err.code === 'auth/email-already-in-use') {
        msg = `Email [${cleanEmail}] đã được đăng ký tài khoản trước đó!\nNếu đây là tài khoản của bạn, vui lòng chuyển sang tab "Đăng Nhập" để vào học.`;
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Địa chỉ email không hợp lệ. Vui lòng kiểm tra lại cấu trúc email (ví dụ: hocsinh@gmail.com).';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Mật khẩu chưa đủ an toàn. Mật khẩu phải có tối thiểu 6 ký tự.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Chức năng đăng ký bằng Email/Mật khẩu chưa được kích hoạt trong Firebase Console. Vui lòng liên hệ Quản trị viên!';
      } else if (err.message) {
        msg = `Lỗi hệ thống: ${err.message}`;
      }
      return { success: false, code: err.code, message: msg };
    }
  },

  // Gửi email khôi phục mật khẩu thông qua Firebase Authentication
  async sendPasswordReset(email) {
    this.ensureFirebaseInitialized();
    if (!this.firebaseAuth) {
      return { success: false, message: 'Dịch vụ xác thực Firebase chưa sẵn sàng. Vui lòng thử lại sau!' };
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, message: 'Vui lòng nhập địa chỉ Email hợp lệ để nhận liên kết khôi phục mật khẩu!' };
    }

    try {
      await this.firebaseAuth.sendPasswordResetEmail(cleanEmail);
      return {
        success: true,
        message: `Hệ thống đã gửi liên kết đặt lại mật khẩu đến email [${cleanEmail}].\n\nBạn vui lòng kiểm tra hộp thư đến (hoặc thư mục Spam) và làm theo hướng dẫn để thiết lập mật khẩu mới nhé!`
      };
    } catch (err) {
      console.error('Lỗi sendPasswordResetEmail:', err);
      let msg = 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau!';
      if (err.code === 'auth/user-not-found') {
        msg = `Không tìm thấy tài khoản nào khớp với email [${cleanEmail}]. Bạn hãy kiểm tra lại email hoặc đăng ký tài khoản mới nhé!`;
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Địa chỉ email không đúng định dạng. Vui lòng kiểm tra lại.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng đợi vài phút rồi thử lại!';
      }
      return { success: false, code: err.code, message: msg };
    }
  },

  loginWithSavedAccount(uidOrEmail) {
    return {
      success: false,
      message: 'Vui lòng nhập mật khẩu tài khoản của bạn để đăng nhập an toàn qua Firebase Authentication!'
    };
  },

  saveUser(user) {
    if (user && typeof user === 'object' && 'password' in user) {
      delete user.password;
    }
    this.currentUser = user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    Storage.saveAccountRecord(user);
    if (CloudSync && typeof CloudSync.syncUserProgress === 'function') {
      CloudSync.syncUserProgress(null, user).then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tinhoc-cloud-synced', { detail: { timestamp: new Date().toISOString() } }));
        }
      }).catch(() => {});
    }
    this.notifyAuthChange();
  },

  updateProfile(profileData) {
    if (!this.currentUser) return false;

    const nowIso = new Date().toISOString();
    const newFullName = (profileData.fullName || this.currentUser.fullName || '').trim();
    const newGrade = String(profileData.grade || this.currentUser.grade || '12').trim();
    const newClassName = (profileData.className || this.currentUser.className || '').trim();
    const newSchool = (profileData.school || this.currentUser.school || '').trim();

    this.currentUser = {
      ...this.currentUser,
      fullName: newFullName,
      grade: newGrade,
      className: newClassName,
      school: newSchool,
      profileCompleted: true,
      firstLoginDone: true,
      profileUpdatedAt: nowIso,
      lastActive: nowIso
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    Storage.saveAccountRecord(this.currentUser);

    // Đồng bộ cập nhật Lớp & Trường vào lịch sử bài thi của học sinh này (để Sổ điểm & Bảng vinh danh cập nhật tức thì)
    try {
      const userEmail = (this.currentUser.email || '').trim().toLowerCase();
      const userUid = (this.currentUser.uid || '').trim().toLowerCase();
      const history = Storage.getExamHistory ? Storage.getExamHistory() : [];
      let historyChanged = false;
      history.forEach(h => {
        const hEmail = (h.studentEmail || '').trim().toLowerCase();
        const hUid = (h.studentUid || '').trim().toLowerCase();
        if ((userEmail && hEmail === userEmail) || (userUid && hUid === userUid)) {
          h.studentName = newFullName || h.studentName;
          h.school = newSchool || h.school;
          h.className = newClassName || h.className;
          historyChanged = true;
          if (CloudSync && typeof CloudSync.pushExamResultToCloud === 'function') {
            CloudSync.pushExamResultToCloud(h).catch(() => {});
          }
        }
      });
      if (historyChanged) {
        localStorage.setItem('tinhoc_exam_history', JSON.stringify(history));
      }
    } catch (e) {}

    if (CloudSync && typeof CloudSync.pushAccountToCloud === 'function') {
      CloudSync.pushAccountToCloud(this.currentUser).catch(() => {});
    }
    if (CloudSync && typeof CloudSync.syncUserProgress === 'function') {
      CloudSync.syncUserProgress(null, this.currentUser).catch(() => {});
    }

    this.notifyAuthChange();
    return true;
  },

  logout() {
    if (this.firebaseAuth) {
      this.firebaseAuth.signOut().catch(() => {});
    }
    this.currentUser = null;
    this.serverRole = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.notifyAuthChange();
  },

  normalizeSchoolName(schoolName) {
    if (!schoolName) return '';
    const clean = schoolName.trim().toLowerCase();
    const schoolsObj = (typeof Storage !== 'undefined' && Storage.getSchoolsData) ? Storage.getSchoolsData() : (typeof SCHOOLS_DATA !== 'undefined' ? SCHOOLS_DATA : {});

    // 1. So khớp chính xác
    for (const [key, data] of Object.entries(schoolsObj)) {
      if (key.toLowerCase() === clean) return key;
      if (data.name && data.name.toLowerCase() === clean) return key;
    }

    // 2. So khớp mờ / bao hàm 2 chiều (ví dụ: 'TT GDNN GDTX Chu' khớp 'TT GDNN GDTX Chu Văn An')
    for (const [key, data] of Object.entries(schoolsObj)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes(clean) || clean.includes(keyLower)) return key;
      if (data.name) {
        const nameLower = data.name.toLowerCase();
        if (nameLower.includes(clean) || clean.includes(nameLower)) return key;
      }
      if (data.aliases && Array.isArray(data.aliases)) {
        if (data.aliases.some(a => {
          const aLower = String(a).toLowerCase();
          return aLower === clean || aLower.includes(clean) || clean.includes(aLower);
        })) {
          return key;
        }
      }
    }
    return schoolName.trim();
  },

  setupSchoolClassSync({
    schoolSelectId,
    customSchoolInputId,
    gradeSelectId,
    classSelectId,
    customClassInputId,
    initialSchool = '',
    initialGrade = '12',
    initialClass = ''
  }) {
    const schoolSelect = document.getElementById(schoolSelectId);
    const customSchoolInput = document.getElementById(customSchoolInputId);
    const gradeSelect = document.getElementById(gradeSelectId);
    const classSelect = document.getElementById(classSelectId);
    const customClassInput = document.getElementById(customClassInputId);

    if (!schoolSelect || !classSelect) return;

    // 1. Nạp động danh sách các trường học từ Storage.getSchoolsData() để luôn đầy đủ trường mới
    const schoolsObj = Storage.getSchoolsData ? Storage.getSchoolsData() : SCHOOLS_DATA;
    const schoolNames = Object.keys(schoolsObj || {});
    let schoolOptionsHtml = `<option value="">-- Chọn trường học --</option>`;
    schoolNames.forEach(sName => {
      schoolOptionsHtml += `<option value="${escapeHtml(sName)}">${escapeHtml(sName)}</option>`;
    });
    schoolOptionsHtml += `<option value="__other__">Trường khác (Tự nhập)...</option>`;
    schoolSelect.innerHTML = schoolOptionsHtml;

    let isInternalUpdate = false;

    const renderClassDropdown = (preferredClass = '', allowCustomFallback = false) => {
      const selectedSchool = schoolSelect.value;
      const selectedGrade = gradeSelect ? gradeSelect.value : '12';

      if (!selectedSchool) {
        classSelect.innerHTML = `<option value="">-- Vui lòng chọn trường trước --</option>`;
        if (customClassInput) customClassInput.classList.add('hidden');
        return;
      }

      if (selectedSchool === '__other__') {
        if (customSchoolInput) customSchoolInput.classList.remove('hidden');
        classSelect.innerHTML = `
          <option value="">-- Tự nhập tên lớp bên dưới --</option>
          <option value="__other__" selected>Lớp khác (Tự nhập)...</option>
        `;
        if (customClassInput) {
          customClassInput.classList.remove('hidden');
          if (preferredClass && preferredClass !== '__other__') {
            customClassInput.value = preferredClass;
          }
        }
        return;
      }

      if (customSchoolInput) customSchoolInput.classList.add('hidden');

      const schoolInfo = SCHOOLS_DATA[selectedSchool];
      if (!schoolInfo) {
        classSelect.innerHTML = `<option value="">-- Vui lòng chọn trường trước --</option>`;
        return;
      }

      const gradeClasses = schoolInfo.classes[selectedGrade] || [];
      const allSchoolClasses = Object.entries(schoolInfo.classes).flatMap(([g, cls]) => cls.map(c => ({ grade: g, name: c })));

      let html = `<option value="">-- Chọn lớp học --</option>`;

      if (gradeClasses.length > 0) {
        html += `<optgroup label="Lớp thuộc Khối ${escapeHtml(selectedGrade)}">`;
        gradeClasses.forEach(cls => {
          html += `<option value="${escapeHtml(cls)}">${escapeHtml(cls)}</option>`;
        });
        html += `</optgroup>`;
      }

      const otherClasses = allSchoolClasses.filter(c => c.grade !== selectedGrade);
      if (otherClasses.length > 0) {
        html += `<optgroup label="Các lớp khối khác (${escapeHtml(selectedSchool)})">`;
        otherClasses.forEach(c => {
          html += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (Khối ${escapeHtml(c.grade)})</option>`;
        });
        html += `</optgroup>`;
      }

      html += `<option value="__other__">Lớp khác (Tự nhập)...</option>`;
      classSelect.innerHTML = html;

      const target = preferredClass || '';
      const hasTarget = Boolean(target && allSchoolClasses.some(c => c.name === target));

      if (hasTarget) {
        classSelect.value = target;
        classSelect.dataset.prevClass = target;
        if (customClassInput) customClassInput.classList.add('hidden');
      } else if (allowCustomFallback && target && target !== '__other__') {
        classSelect.value = '__other__';
        if (customClassInput) {
          customClassInput.classList.remove('hidden');
          customClassInput.value = target;
        }
      } else if (gradeClasses.length > 0) {
        classSelect.value = gradeClasses[0];
        classSelect.dataset.prevClass = gradeClasses[0];
        if (customClassInput) customClassInput.classList.add('hidden');
      } else if (allSchoolClasses.length > 0) {
        classSelect.value = allSchoolClasses[0].name;
        classSelect.dataset.prevClass = allSchoolClasses[0].name;
        if (customClassInput) customClassInput.classList.add('hidden');
      } else {
        classSelect.value = '__other__';
        if (customClassInput) customClassInput.classList.remove('hidden');
      }
    };

    schoolSelect.onchange = () => {
      classSelect.dataset.prevClass = '';
      if (schoolSelect.value === '__other__') {
        if (customSchoolInput) {
          customSchoolInput.classList.remove('hidden');
          customSchoolInput.focus();
        }
        renderClassDropdown('__other__', true);
      } else {
        if (customSchoolInput) customSchoolInput.classList.add('hidden');
        if (customClassInput) customClassInput.classList.add('hidden');
        renderClassDropdown('', false);
      }
    };

    if (gradeSelect) {
      gradeSelect.onchange = () => {
        if (!isInternalUpdate && schoolSelect.value && schoolSelect.value !== '__other__') {
          classSelect.dataset.prevClass = '';
          if (customClassInput) customClassInput.classList.add('hidden');
          renderClassDropdown('', false);
        }
      };
    }

    classSelect.onchange = () => {
      const val = classSelect.value;
      classSelect.dataset.prevClass = val;

      if (val === '__other__') {
        if (customClassInput) {
          customClassInput.classList.remove('hidden');
          customClassInput.focus();
        }
      } else {
        if (customClassInput) customClassInput.classList.add('hidden');

        let detectedGrade = null;
        if (/^10/.test(val)) detectedGrade = '10';
        else if (/^11/.test(val)) detectedGrade = '11';
        else if (/^12/.test(val)) detectedGrade = '12';

        if (detectedGrade && gradeSelect && gradeSelect.value !== detectedGrade) {
          isInternalUpdate = true;
          gradeSelect.value = detectedGrade;
          renderClassDropdown(val, false);
          isInternalUpdate = false;
        }
      }
    };

    // Áp dụng trạng thái ban đầu
    classSelect.dataset.prevClass = initialClass || '';
    if (initialSchool) {
      const stdSchool = this.normalizeSchoolName(initialSchool);
      const schoolsObj = (typeof Storage !== 'undefined' && Storage.getSchoolsData) ? Storage.getSchoolsData() : SCHOOLS_DATA;
      if (schoolsObj && schoolsObj[stdSchool]) {
        schoolSelect.value = stdSchool;
        if (customSchoolInput) customSchoolInput.classList.add('hidden');
      } else {
        schoolSelect.value = '__other__';
        if (customSchoolInput) {
          customSchoolInput.classList.remove('hidden');
          customSchoolInput.value = initialSchool;
        }
      }
    } else {
      schoolSelect.value = '';
      if (customSchoolInput) customSchoolInput.classList.add('hidden');
    }

    if (gradeSelect && initialGrade) {
      gradeSelect.value = String(initialGrade);
    }

    renderClassDropdown(initialClass, Boolean(initialClass));
  },

  openRequiredProfileModal() {
    const modal = document.getElementById('modal-required-profile');
    if (!modal) return;

    this.isEditingProfile = true;
    const isComplete = this.isProfileComplete();

    // Ẩn nút Đóng (X) và nút Đóng phụ nếu học sinh đăng nhập lần đầu chưa chọn Trường & Lớp
    const closeTopBtn = document.getElementById('btn-close-profile-modal');
    const closeBottomBtn = document.getElementById('btn-cancel-profile-close');
    if (closeTopBtn) closeTopBtn.classList.toggle('hidden', !isComplete);
    if (closeBottomBtn) closeBottomBtn.classList.toggle('hidden', !isComplete);

    const titleEl = document.getElementById('profile-modal-title');
    const subtitleEl = document.getElementById('profile-modal-subtitle');
    const submitBtnEl = document.getElementById('btn-submit-required-profile');
    if (titleEl) {
      titleEl.textContent = isComplete
        ? 'Cập Nhật Hồ Sơ Học Sinh (Lớp & Trường)'
        : 'Chào Mừng Em! Vui Lòng Chọn Trường & Lớp Học';
    }
    if (subtitleEl) {
      subtitleEl.textContent = isComplete
        ? 'Đồng bộ chính xác Trường, Khối, Lớp để nhận đề kiểm tra và tính điểm'
        : 'Bước bắt buộc trong lần đăng nhập đầu tiên để nhận đúng bài tập và phòng thi của lớp em';
    }
    if (submitBtnEl) {
      submitBtnEl.innerHTML = isComplete
        ? '<i class="fa-solid fa-floppy-disk"></i> Lưu Cập Nhật Lớp & Trường'
        : '<i class="fa-solid fa-circle-check"></i> Xác Nhận Trường Lớp & Vào Học Ngay';
    }

    const emailEl = document.getElementById('profile-email-display');
    const nameInput = document.getElementById('profile-input-fullname');

    if (this.currentUser) {
      if (emailEl) emailEl.textContent = this.currentUser.email || this.currentUser.username || this.currentUser.uid || '-';
      if (nameInput) {
        const defaultPlaceholderNames = ['Người dùng Google', 'Học sinh Google', 'Người dùng TinHocHub', 'Người dùng'];
        nameInput.value = (this.currentUser.fullName && !defaultPlaceholderNames.includes(this.currentUser.fullName))
          ? this.currentUser.fullName
          : (isComplete ? (this.currentUser.fullName || '') : '');
      }
      this.setupSchoolClassSync({
        schoolSelectId: 'profile-input-school',
        customSchoolInputId: 'profile-input-school-custom',
        gradeSelectId: 'profile-input-grade',
        classSelectId: 'profile-input-class',
        customClassInputId: 'profile-input-class-custom',
        initialSchool: isComplete ? (this.currentUser.school || '') : '',
        initialGrade: this.currentUser.grade || '12',
        initialClass: isComplete ? (this.currentUser.className || '') : ''
      });
    }

    modal.classList.remove('hidden');
    modal.style.setProperty('display', 'flex', 'important');
  },

  closeRequiredProfileModal() {
    this.isEditingProfile = false;
    const modal = document.getElementById('modal-required-profile');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.removeProperty('display');
    }
  },

  openLoginModal(tab = 'login') {
    if (typeof window !== 'undefined' && typeof window.openLoginModal === 'function') {
      window.openLoginModal();
    } else {
      const modal = document.getElementById('modal-login');
      if (modal) {
        modal.classList.remove('hidden');
        modal.style.setProperty('display', 'flex', 'important');
      }
    }
    if (window.AppInstance && typeof window.AppInstance.switchAuthModalTab === 'function') {
      window.AppInstance.switchAuthModalTab(tab);
    }
    if (window.AppInstance && typeof window.AppInstance.renderSavedAccountsList === 'function') {
      window.AppInstance.renderSavedAccountsList();
    }
  },

  closeLoginModal() {
    if (typeof window !== 'undefined' && typeof window.closeLoginModal === 'function') {
      window.closeLoginModal();
    } else {
      const modal = document.getElementById('modal-login');
      if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
      }
    }
  },

  // --- PHÂN CÔNG GIẢNG DẠY & GIỚI HẠN PHẠM VI GIÁO VIÊN ---
  getTeacherAssignments() {
    if (!this.currentUser) return [];
    return Storage.getTeacherAssignments(this.currentUser.email);
  },

  isTeacherAssigned(school, grade, className) {
    return Storage.isTeacherAssignedToClass(this.currentUser, school, grade, className);
  },

  getAssignedSchools() {
    if (!this.currentUser) return [];
    if (this.isAdmin()) return Object.keys(Storage.getSchoolsData());
    return Storage.getTeacherAssignedSchools(this.currentUser.email);
  },

  getAssignedGrades(school = null) {
    if (!this.currentUser) return ['10', '11', '12'];
    if (this.isAdmin()) return ['10', '11', '12'];
    return Storage.getTeacherAssignedGrades(this.currentUser.email, school);
  },

  getAssignedClasses(school = null, grade = null) {
    if (!this.currentUser) return [];
    if (this.isAdmin()) {
      const schools = Storage.getSchoolsData();
      if (school && schools[school]) {
        if (grade && schools[school].classes?.[grade]) return schools[school].classes[grade];
        return Object.values(schools[school].classes || {}).flat();
      }
      return [];
    }
    return Storage.getTeacherAssignedClasses(this.currentUser.email, school, grade);
  },

};

if (typeof window !== 'undefined') {
  window.Auth = Auth;
}
