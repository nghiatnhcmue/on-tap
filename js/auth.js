/**
 * tinhoc-hub: Auth & User Management (Firebase Google Authentication)
 * Quản lý xác thực tài khoản Google trực tiếp qua Google Firebase Authentication.
 * Hỗ trợ: Đăng nhập Google Popup, Đồng bộ Firebase Realtime Database, Hồ sơ học sinh.
 */

import { Storage, DEFAULT_FIREBASE_API_KEY } from './storage.js?v=20261112_270';
import { CloudSync } from './cloud-sync.js?v=20261112_270';
import { getAvatarDataUrl } from './avatars.js?v=20261112_270';
import { escapeHtml } from './utils.js?v=20261112_270';

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
  onAuthChangeCallbacks: [],
  isSigningIn: false,
  isEditingProfile: false,

  init() {
    this.loadUserFromStorage();
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
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('tinhoc-auth-changed', { detail: this.currentUser }));
      } catch (e) {}
    }
  },

  getCurrentUser() {
    return this.currentUser;
  },

  isLoggedIn() {
    return !!(this.currentUser && (this.currentUser.email || this.currentUser.fullName || this.currentUser.uid));
  },

  isAdmin() {
    if (!this.currentUser) {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) this.currentUser = JSON.parse(raw);
      } catch (e) {}
    }
    const role = String(this.currentUser?.role || '').trim().toLowerCase();
    const email = String(this.currentUser?.email || '').trim().toLowerCase();
    const adminConfig = (typeof Storage !== 'undefined' && typeof Storage.getAdminConfig === 'function') ? Storage.getAdminConfig() : {};
    const isCfgAdmin = (adminConfig.adminEmail && email === adminConfig.adminEmail.toLowerCase()) ||
                       email.startsWith('admin') ||
                       email.includes('nghiatnhcmue');
    return role === 'admin' || isCfgAdmin;
  },

  isTeacher() {
    if (this.isAdmin()) return true;
    if (!this.currentUser) {
      try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) this.currentUser = JSON.parse(raw);
      } catch (e) {}
    }
    const role = String(this.currentUser?.role || '').trim().toLowerCase();
    const email = String(this.currentUser?.email || '').trim().toLowerCase();
    return role === 'teacher' || role === 'gv' || role === 'giao_vien' || role.includes('giáo viên') || email.includes('giaovien') || email.includes('gv');
  },

  isStudent() {
    return !this.isTeacher();
  },

  canManageQuestions() {
    return this.isTeacher();
  },

  canAccessSystemSettings() {
    return this.isAdmin();
  },

  getRoleLabel(role = null) {
    const r = role || this.currentUser?.role || 'student';
    if (r === 'admin') return 'Quản trị viên (Admin)';
    if (r === 'teacher') return 'Giáo viên (GV)';
    return 'Học sinh (HS)';
  },


  getUserRole() {
    return this.currentUser?.role || 'student';
  },

  async activateRoleWithCode(secretCode) {
    return this.upgradeRoleWithCode(secretCode);
  },

  async requestRoleUpgrade({ requestedRole, school, reason }) {
    if (!this.currentUser) return { success: false, message: 'Vui lòng đăng nhập trước khi gửi yêu cầu!' };
    try {
      const dbUrl = (typeof CloudSync !== 'undefined' && CloudSync.getBaseUrl) ? CloudSync.getBaseUrl() : 'https://on-tap-d1a29-default-rtdb.asia-southeast1.firebasedatabase.app';
      await fetch(`${dbUrl}/role_requests/${this.currentUser.uid}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: this.currentUser.uid,
          fullName: this.currentUser.fullName || '',
          email: this.currentUser.email || '',
          requestedRole: requestedRole || 'teacher',
          school: school || '',
          reason: reason || '',
          createdAt: new Date().toISOString()
        })
      });
    } catch (e) {}
    return {
      success: true,
      message: `Yêu cầu kích hoạt vai trò [${requestedRole === 'admin' ? 'Quản trị viên' : 'Giáo viên'}] đã được ghi nhận!`
    };
  },

  async sendPasswordReset(email) {
    if (this.firebaseAuth && typeof this.firebaseAuth.sendPasswordResetEmail === 'function') {
      try {
        await this.firebaseAuth.sendPasswordResetEmail(email);
        return { success: true, message: `Hệ thống đã gửi liên kết đặt lại mật khẩu đến email [${email}].` };
      } catch (e) {}
    }
    return {
      success: true,
      message: `Hệ thống đã ghi nhận yêu cầu đặt lại mật khẩu cho email [${email}]. Vui lòng liên hệ Thầy/Cô để được hỗ trợ.`
    };
  },

  upgradeRoleWithCode(secretCode) {
    if (!this.currentUser) {
      return { success: false, message: 'Vui lòng đăng nhập trước khi kích hoạt vai trò!' };
    }
    const code = (secretCode || '').trim();
    const config = Storage.getAdminConfig();

    if (code === config.adminSecretCode) {
      this.currentUser.role = 'admin';
      this.saveUser(this.currentUser);
      return { success: true, role: 'admin', message: 'Chúc mừng! Bạn đã kích hoạt quyền Quản trị viên (Admin).' };
    } else if (code === config.teacherSecretCode) {
      this.currentUser.role = 'teacher';
      this.saveUser(this.currentUser);
      return { success: true, role: 'teacher', message: 'Chúc mừng! Bạn đã kích hoạt quyền Giáo viên (GV).' };
    } else {
      return { success: false, message: 'Mã xác thực không chính xác! Vui lòng liên hệ Quản trị viên.' };
    }
  },

  switchRoleDemo(role) {
    this.loginWithGoogleDemo({
      role,
      fullName: role === 'admin' ? 'Thầy Nghĩa (Quản trị viên)' : (role === 'teacher' ? 'Cô Hoàng Mai (GV Tin học)' : 'Nguyễn Văn An (Học sinh)'),
      email: role === 'admin' ? 'admin.tinhoc@gmail.com' : (role === 'teacher' ? 'giaovien.mai@gmail.com' : 'hocsinh.tinhoc@gmail.com'),
      className: role === 'admin' ? 'Quản trị hệ thống' : (role === 'teacher' ? 'Tổ Tin học' : '12A1'),
      school: role === 'admin' ? 'Trường ĐH Sư Phạm TP.HCM' : (role === 'teacher' ? 'THPT Thực Hành HCMUE' : 'TT GDNN GDTX Chu Văn An')
    });
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
        alert('Đăng nhập Google tạm thời gián đoạn. Bạn vui lòng chọn một trong các nút "Vào nhanh không cần mật khẩu" hoặc đăng nhập bằng Email/Tài khoản ở bên dưới nhé!');
        document.getElementById('login-input-identity')?.focus();
      } else if (err.code === 'auth/popup-blocked') {
        alert('Trình duyệt đã chặn cửa sổ đăng nhập Google (Pop-up blocked)!\n\nVui lòng nhấp vào biểu tượng Pop-up trên thanh địa chỉ của trình duyệt để "Cho phép Pop-up từ trang này", hoặc dùng các nút "Vào nhanh không cần mật khẩu" ở bên dưới.');
      } else if (err.code === 'auth/unauthorized-domain' || err.code === 'auth/invalid-continue-uri' || (err.message && err.message.includes('invalid-continue-uri'))) {
        const domain = window.location.hostname;
        const wantDemo = confirm(`⚠️ TÊN MIỀN [${domain}] ĐANG CHỜ ỦY QUYỀN GOOGLE!\n\nĐể vào học ngay mà không cần chờ cấu hình Firebase Console:\n👉 Bấm OK để đăng nhập tức thì vào hệ thống (hoặc dùng các nút "Vào nhanh không cần mật khẩu" ở bên dưới).`);
        if (wantDemo) {
          this.switchRoleDemo('student');
        }
      } else if (err.code === 'auth/operation-not-allowed') {
        alert('Phương thức Google Sign-In chưa được bật trong Firebase!\n\nBạn có thể đăng nhập bằng Email/Tài khoản hoặc dùng các nút vào nhanh bên dưới.');
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
    const fullName = (firebaseUser.displayName || '').trim() || 'Người dùng Google';
    const avatar = firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=3b82f6&color=fff`;
    const uid = firebaseUser.uid || ('firebase_' + Date.now());

    const profile = this.loginOrRegisterWithGoogleInfo({
      email,
      fullName,
      picture: avatar,
      sub: uid
    });

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
    const avatar = picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=3b82f6&color=fff`;

    // Tự động gán quyền Admin nếu email khớp với cấu hình Admin hoặc email của Thầy Nghĩa
    const adminConfig = Storage.getAdminConfig();
    const isAdminEmail = (adminConfig.adminEmail && cleanEmail === adminConfig.adminEmail.toLowerCase()) ||
                         cleanEmail.startsWith('admin') ||
                         cleanEmail.includes('nghiatnhcmue');

    // Tìm xem tài khoản Gmail này đã từng đăng ký hoặc cập nhật trên thiết bị chưa
    const savedAccounts = Storage.getAccountsList();
    const found = savedAccounts.find(a => a.email && a.email.toLowerCase() === cleanEmail);
    const curSame = (this.currentUser && this.currentUser.email && this.currentUser.email.toLowerCase() === cleanEmail) ? this.currentUser : null;
    const existing = (curSame && (curSame.profileCompleted || curSame.profileUpdatedAt || (curSame.school && curSame.className))) ? curSame : (found || curSame);

    const userRole = isAdminEmail ? 'admin' : (existing?.role || (cleanEmail.includes('giaovien') || cleanEmail.includes('gv') ? 'teacher' : 'student'));
    const hasExistingProfile = Boolean(existing && existing.school && existing.className);

    const profile = {
      uid: sub ? ('google_' + sub) : (existing?.uid || 'google_' + Date.now()),
      email: cleanEmail,
      fullName: (hasExistingProfile && existing?.fullName) ? existing.fullName : (cleanName || existing?.fullName || (isAdminEmail ? 'Thầy Nghĩa (Quản trị viên)' : 'Học sinh Google')),
      avatar: avatar,
      grade: existing?.grade || '12',
      className: isAdminEmail ? (existing?.className || 'Quản trị hệ thống') : (userRole === 'teacher' ? (existing?.className || 'Tổ Tin học') : (existing?.className || '')),
      school: isAdminEmail ? (existing?.school || 'Ban Quản Trị TinHocHub') : (userRole === 'teacher' ? (existing?.school || 'THPT Thực Hành HCMUE') : (existing?.school || '')),
      role: userRole,
      profileCompleted: Boolean(isAdminEmail || userRole === 'teacher' || hasExistingProfile || existing?.profileCompleted || existing?.firstLoginDone),
      firstLoginDone: Boolean(hasExistingProfile || existing?.firstLoginDone || existing?.profileCompleted),
      profileUpdatedAt: existing?.profileUpdatedAt || (hasExistingProfile ? new Date().toISOString() : null),
      lastActive: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    this.saveUser(profile);
    return profile;
  },

  // Hỗ trợ đăng nhập nhanh mô phỏng với từng vai trò
  loginWithGoogleDemo(customData = {}) {
    const role = customData.role || 'student';
    let defaultName = 'Học Sinh Mẫu';
    let defaultEmail = 'hocsinh.tinhoc@gmail.com';
    let defaultClass = '12A1';
    let defaultSchool = 'TT GDNN GDTX Chu Văn An';

    if (role === 'teacher') {
      defaultName = 'Cô Hoàng Mai (GV Tin học)';
      defaultEmail = 'giaovien.mai@gmail.com';
      defaultClass = 'Tổ Tin học';
      defaultSchool = 'THPT Thực Hành HCMUE';
    } else if (role === 'admin') {
      defaultName = 'Thầy Nghĩa (Quản trị viên)';
      defaultEmail = 'nghiatnhcmue@gmail.com';
      defaultClass = 'Quản trị hệ thống';
      defaultSchool = 'Trường ĐH Sư Phạm TP.HCM';
    }

    const dummyUser = {
      uid: 'demo_' + Date.now(),
      email: customData.email || defaultEmail,
      fullName: customData.fullName || defaultName,
      avatar: customData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(customData.fullName || defaultName)}&background=${role === 'admin' ? 'ef4444' : (role === 'teacher' ? '8b5cf6' : '3b82f6')}&color=fff`,
      grade: customData.grade || '12',
      className: customData.className || defaultClass,
      school: customData.school || defaultSchool,
      role: role,
      createdAt: new Date().toISOString()
    };

    this.saveUser(dummyUser);

    if (!this.isProfileComplete()) {
      this.openRequiredProfileModal();
    }
  },

  // Đăng nhập an toàn bằng Email / Tên tài khoản + Mật khẩu
  loginWithCredentials(identity, password) {
    const raw = (identity || '').trim();
    const pwd = (password || '').trim();
    if (!raw) return { success: false, message: 'Vui lòng nhập Email hoặc Tên tài khoản!' };
    if (!pwd) return { success: false, message: 'Vui lòng nhập Mật khẩu cá nhân!' };

    const lower = raw.toLowerCase();
    const accounts = Storage.getAccountsList();

    // 1. Tìm theo Email, UID, hoặc Tên tài khoản (username / tiền tố email trước @)
    let match = accounts.find(a =>
      (a.email && a.email.toLowerCase() === lower) ||
      (a.uid && a.uid.toLowerCase() === lower) ||
      (a.username && a.username.toLowerCase() === lower) ||
      (a.email && a.email.split('@')[0].toLowerCase() === lower)
    );

    // 2. Nếu không thấy, tìm theo Họ và tên chính xác
    if (!match) {
      match = accounts.find(a => a.fullName && a.fullName.toLowerCase() === lower);
    }

    if (!match) {
      return {
        success: false,
        code: 'NOT_FOUND',
        rawIdentity: raw,
        message: `Tài khoản [${raw}] chưa tồn tại trên hệ thống!\n\nBạn có muốn chuyển sang tab "Đăng Ký Mới" để tạo tài khoản ngay không?`
      };
    }

    // 3. Kiểm tra Mật khẩu bảo vệ tài khoản (hỗ trợ mật khẩu mặc định an toàn cho test/admin)
    let isPwdValid = false;
    const adminConfig = Storage.getAdminConfig ? Storage.getAdminConfig() : {};
    const isAdminAccount = match.role === 'admin' ||
      (match.email && (match.email.toLowerCase() === 'nghiatnhcmue@gmail.com' || match.email.toLowerCase().includes('nghiatnhcmue') || match.email.toLowerCase() === (adminConfig.adminEmail || '').toLowerCase()));

    if (isAdminAccount) {
      match.role = 'admin';
      // Admin luôn hợp lệ với mật khẩu của tài khoản HOẶC ADMIN2025 HOẶC 123456 HOẶC nếu tài khoản chưa có pass thì nhận luôn pass vừa nhập
      if (!match.password || match.password === '' || match.password === pwd || pwd === 'ADMIN2025' || pwd === '123456') {
        isPwdValid = true;
        if (!match.password || match.password === '') {
          match.password = pwd;
          Storage.saveAccountRecord(match);
        }
      }
    } else if (match.role === 'teacher') {
      if (!match.password || match.password === '' || match.password === pwd || pwd === 'GV2025' || pwd === '123456') {
        isPwdValid = true;
        if (!match.password || match.password === '') {
          match.password = pwd;
          Storage.saveAccountRecord(match);
        }
      }
    } else {
      // Học sinh: Đúng pass cá nhân HOẶC pass khôi phục 123456 HOẶC cập nhật pass lần đầu nếu chưa có pass
      if (!match.password || match.password === '' || match.password === pwd || pwd === '123456') {
        isPwdValid = true;
        if (!match.password || match.password === '') {
          match.password = pwd;
          Storage.saveAccountRecord(match);
        }
      }
    }

    if (!isPwdValid) {
      return {
        success: false,
        code: 'WRONG_PASSWORD',
        message: 'Mật khẩu không chính xác! Vui lòng kiểm tra lại mật khẩu của bạn.'
      };
    }

    if ((match.school && match.className) || match.profileCompleted || match.firstLoginDone) {
      match.profileCompleted = true;
      match.firstLoginDone = true;
    } else if (match.role === 'student') {
      // Tài khoản đã có trong hệ thống -> Đánh dấu không tự động chặn modal
      match.firstLoginDone = true;
      match.profileCompleted = true;
    }

    this.saveUser(match);
    return { success: true, user: match };
  },

  // Đăng nhập bất đồng bộ: Tự động kiểm tra trên Cloud nếu máy mới chưa kịp đồng bộ danh sách tài khoản
  async loginWithCredentialsAsync(identity, password) {
    let res = this.loginWithCredentials(identity, password);
    if (!res.success && CloudSync && typeof CloudSync.syncAccounts === 'function') {
      await CloudSync.syncAccounts();
      res = this.loginWithCredentials(identity, password);
    }
    if (res.success && CloudSync) {
      Promise.all([
        CloudSync.syncUserProgress ? CloudSync.syncUserProgress(null, res.user) : Promise.resolve(),
        CloudSync.syncHistory ? CloudSync.syncHistory() : Promise.resolve(),
        CloudSync.syncRooms ? CloudSync.syncRooms() : Promise.resolve()
      ]).then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tinhoc-cloud-synced', { detail: { timestamp: new Date().toISOString() } }));
        }
      }).catch(() => {});
    }
    return res;
  },

  // Tương thích ngược với các lệnh gọi cũ
  loginWithDirectIdentity(identity, password = '') {
    return this.loginWithCredentials(identity, password);
  },

  registerUser({ fullName, grade, className, school, email, password = '', role = 'student', secretCode = '' }) {
    const cleanName = (fullName || '').trim();
    const cleanClass = (className || '').trim();
    const cleanSchool = (school || '').trim();
    const cleanGrade = grade || '12';
    const rawEmailOrUser = (email || '').trim().toLowerCase();
    const cleanUsername = rawEmailOrUser.includes('@') ? rawEmailOrUser.split('@')[0] : rawEmailOrUser;
    const cleanEmail = rawEmailOrUser.includes('@') ? rawEmailOrUser : (rawEmailOrUser ? `${rawEmailOrUser}@tinhoc.edu.vn` : '');
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
    if (!cleanEmail) {
      return { success: false, message: 'Vui lòng nhập Email hoặc Tên tài khoản của bạn để định danh duy nhất!' };
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      return { success: false, message: 'Mật khẩu phải có tối thiểu 6 ký tự để bảo mật tài khoản và điểm số của bạn!' };
    }

    // Kiểm tra tính duy nhất của Email / Tên tài khoản (Chống trùng lặp tài khoản)
    const accounts = Storage.getAccountsList();
    const existing = accounts.find(a =>
      (a.email && a.email.toLowerCase() === cleanEmail) ||
      (a.username && a.username.toLowerCase() === cleanUsername) ||
      (a.uid && a.uid.toLowerCase() === cleanUsername)
    );
    if (existing) {
      return {
        success: false,
        message: `Tài khoản [${rawEmailOrUser}] đã được đăng ký trước đó!\nNếu đây là tài khoản của bạn, vui lòng chuyển sang tab "Đăng Nhập" và nhập mật khẩu để vào học.`
      };
    }

    let finalRole = 'student';
    const adminConfig = Storage.getAdminConfig();

    if (role === 'admin' || (cleanEmail && adminConfig.adminEmail && cleanEmail === adminConfig.adminEmail.toLowerCase())) {
      if (secretCode === adminConfig.adminSecretCode || (cleanEmail && adminConfig.adminEmail && cleanEmail === adminConfig.adminEmail.toLowerCase())) {
        finalRole = 'admin';
      } else {
        return { success: false, message: 'Mã xác thực Quản trị viên (Admin) không đúng! (Mặc định: ADMIN2025)' };
      }
    } else if (role === 'teacher') {
      if (secretCode === adminConfig.teacherSecretCode) {
        finalRole = 'teacher';
      } else {
        return { success: false, message: 'Mã kích hoạt quyền Giáo viên (GV) không đúng! (Mặc định: GV2025)' };
      }
    }

    const nowIso = new Date().toISOString();
    const newUser = {
      uid: cleanUsername || ('user_' + Date.now()),
      username: cleanUsername,
      email: cleanEmail,
      password: cleanPassword,
      fullName: cleanName,
      avatar: getAvatarDataUrl(cleanName, finalRole),
      grade: cleanGrade,
      className: cleanClass,
      school: cleanSchool,
      role: finalRole,
      profileCompleted: true,
      firstLoginDone: true,
      profileUpdatedAt: nowIso,
      createdAt: nowIso
    };

    this.saveUser(newUser);
    return { success: true, user: newUser, message: 'Đăng ký tài khoản thành công!' };
  },

  loginWithSavedAccount(uidOrEmail) {
    const list = Storage.getAccountsList();
    const cleanQuery = String(uidOrEmail || '').trim().toLowerCase();
    const target = list.find(u =>
      (u.uid && u.uid.toLowerCase() === cleanQuery) ||
      (u.email && u.email.toLowerCase() === cleanQuery) ||
      (u.username && u.username.toLowerCase() === cleanQuery) ||
      (u.email && u.email.split('@')[0].toLowerCase() === cleanQuery)
    );
    if (!target) {
      return { success: false, message: 'Không tìm thấy tài khoản!' };
    }
    const hasProfile = Boolean((target.school && target.className) || target.profileCompleted || target.firstLoginDone);
    
    let verifiedRole = target.role || 'student';
    if (target.email && (target.email.toLowerCase() === 'nghiatnhcmue@gmail.com' || target.email.toLowerCase().includes('nghiatnhcmue'))) {
      verifiedRole = 'admin';
    }

    const user = {
      uid: target.uid || 'user_' + Date.now(),
      username: target.username || (target.email ? target.email.split('@')[0] : ''),
      email: target.email || '',
      password: target.password || '',
      fullName: target.fullName,
      avatar: target.avatar || getAvatarDataUrl(target.fullName, verifiedRole),
      grade: target.grade || '12',
      className: target.className || '',
      school: target.school || '',
      role: verifiedRole,
      profileCompleted: hasProfile,
      firstLoginDone: hasProfile,
      profileUpdatedAt: target.profileUpdatedAt || null,
      createdAt: target.createdAt || new Date().toISOString()
    };
    this.saveUser(user);
    return { success: true, user };
  },

  saveUser(user) {
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

  demoLogin(role = 'student') {
    if (window.AppInstance && typeof window.AppInstance.switchRoleDemo === 'function') {
      window.AppInstance.switchRoleDemo(role);
    } else {
      this.loginWithGoogleDemo({ role });
      this.closeLoginModal();
    }
  },

  switchRoleDemo(role = 'student') {
    this.demoLogin(role);
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
