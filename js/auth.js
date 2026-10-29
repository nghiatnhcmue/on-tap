/**
 * tinhoc-hub: Auth & User Management (Firebase Google Authentication)
 * Quản lý xác thực tài khoản Google trực tiếp qua Google Firebase Authentication.
 * Hỗ trợ: Đăng nhập Google Popup, Đồng bộ Firebase Realtime Database, Hồ sơ học sinh.
 */

import { Storage } from './storage.js';

const AUTH_STORAGE_KEY = 'tinhoc_user';

// Danh mục chuẩn các trường và danh sách lớp theo khối
export const SCHOOLS_DATA = {
  'EMASI': {
    name: 'EMASI',
    aliases: ['EMASI', 'Trường EMASI', 'Song ngữ EMASI', 'Trường Song ngữ Quốc tế EMASI'],
    classes: {
      '10': ['10E', '10I1', '10I2'],
      '11': ['11E'],
      '12': ['12E']
    }
  },
  'Phổ thông Năng khiếu': {
    name: 'Phổ thông Năng khiếu',
    aliases: ['PTNK', 'Phổ thông Năng khiếu', 'Phổ thông Năng Khiếu', 'Trường PTNK', 'THPT Năng Khiếu', 'Trường Phổ thông Năng khiếu'],
    classes: {
      '10': [],
      '11': [],
      '12': ['12TOAN', '12LI', '12HOA', '12SINH', '12VAN']
    }
  },
  'TT GDNN GDTX Chu Văn An': {
    name: 'TT GDNN GDTX Chu Văn An',
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

export const Auth = {
  currentUser: null,
  firebaseAuth: null,
  isFirebaseInitialized: false,
  onAuthChangeCallbacks: [],

  init() {
    this.loadUserFromStorage();
    this.initFirebaseAuth();
    this.setupFirebaseAuthUI();
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

  isAdmin() {
    return this.currentUser?.role === 'admin';
  },

  isTeacher() {
    return this.currentUser?.role === 'teacher' || this.currentUser?.role === 'admin';
  },

  isStudent() {
    return !this.currentUser || this.currentUser?.role === 'student';
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
    if (!this.currentUser) {
      this.loginWithGoogleDemo({
        fullName: role === 'admin' ? 'Thầy Nghĩa (Admin)' : (role === 'teacher' ? 'Cô Mai (Giáo viên)' : 'Nguyễn Văn An (Học sinh)'),
        email: role === 'admin' ? 'admin.tinhoc@gmail.com' : (role === 'teacher' ? 'giaovien.tinhoc@gmail.com' : 'hocsinh.tinhoc@gmail.com'),
        role
      });
      return;
    }
    this.currentUser.role = role;
    this.saveUser(this.currentUser);
  },

  isProfileComplete() {
    if (!this.currentUser) return false;
    const { fullName, className, school } = this.currentUser;
    return !!(fullName && fullName.trim() && className && className.trim() && school && school.trim());
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

  initFirebaseAuth() {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK chưa được tải.');
      return false;
    }

    const cfg = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : {};
    const cleanKey = this.cleanFirebaseApiKey(cfg.apiKey);
    if (!cleanKey || !this.isFirebaseApiKey(cleanKey)) {
      this.renderFallbackGoogleButtons();
      return false;
    }

    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp({
          apiKey: cleanKey,
          authDomain: cfg.authDomain || (cfg.projectId ? `${cfg.projectId}.firebaseapp.com` : 'on-tap-nghiaedu-tin-hoc.firebaseapp.com'),
          projectId: cfg.projectId || 'on-tap-nghiaedu-tin-hoc',
          databaseURL: cfg.databaseURL || 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.firebaseio.com'
        });
      }

      this.firebaseAuth = firebase.auth();
      this.isFirebaseInitialized = true;

      // Lắng nghe thay đổi trạng thái xác thực Firebase
      this.firebaseAuth.onAuthStateChanged((user) => {
        if (user && !this.currentUser) {
          this.handleFirebaseUser(user);
        }
      });

      this.renderFallbackGoogleButtons();
      return true;
    } catch (err) {
      console.warn('Lỗi khởi tạo Firebase Auth:', err);
      this.renderFallbackGoogleButtons();
      return false;
    }
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

        Storage.saveFirebaseAuthConfig({
          apiKey: cleanKey,
          projectId,
          authDomain
        });

        alert('✅ Đã lưu cấu hình Firebase Auth thành công!\nĐang kết nối xác thực Google...');
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
    const cfg = Storage.getFirebaseAuthConfig ? Storage.getFirebaseAuthConfig() : {};

    // Nếu chưa cấu hình Firebase API key hoặc API key không đúng chuẩn (phải bắt đầu bằng AIza)
    if (!cfg.apiKey || !this.isFirebaseApiKey(cfg.apiKey)) {
      if (cfg.apiKey && !this.isFirebaseApiKey(cfg.apiKey)) {
        Storage.saveFirebaseAuthConfig({ apiKey: '' });
      }
      this.openFirebaseConfigModal(
        '⚠️ Chưa cấu hình Firebase Web API Key hợp lệ!\nKhóa chuẩn của Firebase bắt đầu bằng "AIzaSy...". Bạn hãy dán Web API Key từ Firebase Console (Project Settings -> General) hoặc sử dụng tính năng Đăng nhập nhanh bên dưới.'
      );
      return;
    }

    if (!this.firebaseAuth) {
      const ok = this.initFirebaseAuth();
      if (!ok || !this.firebaseAuth) {
        this.openFirebaseConfigModal(
          '⚠️ Không thể khởi tạo Firebase Auth với API Key hiện tại. Vui lòng kiểm tra lại cấu hình Web API Key.'
        );
        return;
      }
    }

    const btns = document.querySelectorAll('[data-trigger-google-firebase]');
    btns.forEach(b => {
      b.disabled = true;
      b.dataset.prevHtml = b.innerHTML;
      b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang mở xác thực Google...';
    });

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const result = await this.firebaseAuth.signInWithPopup(provider);
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
        // Tự động xóa API key hỏng để không bao giờ bị kẹt lại
        Storage.saveFirebaseAuthConfig({ apiKey: '' });
        if (this.firebaseAuth) {
          try { firebase.app().delete(); } catch (e) {}
          this.firebaseAuth = null;
          this.isFirebaseInitialized = false;
        }
        alert('⚠️ Khóa Firebase Web API Key hiện tại chưa được kích hoạt hoặc bị Google từ chối!\n\n💡 Bạn có thể vào học ngay lập tức mà không cần đợi cài Google Auth:\n1. Bấm nút "Đăng nhập: Học sinh (HS)" hoặc "Giáo viên / Admin" ở khung [TRẢI NGHIỆM NHANH] bên dưới (1 chạm là vào ngay).\n2. Hoặc Đăng ký tài khoản cá nhân có Mật khẩu ở tab "Đăng Ký Mới".\n\n👉 Để kích hoạt Google Sign-In: Hãy vào Firebase Console -> Authentication -> Bấm "Get started" và bật "Google Sign-in".');
        this.openFirebaseConfigModal('⚠️ Firebase Web API Key chưa hợp lệ. Vui lòng kiểm tra lại hoặc sử dụng tính năng Trải nghiệm nhanh bên dưới.');
      } else if (err.code === 'auth/popup-blocked') {
        alert('Trình duyệt đã chặn cửa sổ đăng nhập Google (Pop-up blocked)!\nVui lòng nhấp vào biểu tượng Pop-up trên thanh địa chỉ của trình duyệt để "Cho phép Pop-up", sau đó thử lại.');
      } else if (err.code === 'auth/unauthorized-domain' || err.code === 'auth/invalid-continue-uri' || (err.message && err.message.includes('invalid-continue-uri'))) {
        const domain = window.location.hostname;
        alert(`⚠️ TÊN MIỀN CHƯA ĐƯỢC ỦY QUYỀN TRONG FIREBASE!\n\nLỗi: (auth/invalid-continue-uri / unauthorized-domain)\n\n👉 Cách kích hoạt để Google cho phép đăng nhập (chỉ mất 30 giây):\n1. Mở Firebase Console (dự án on-tap-nghiaedu-tin-hoc)\n2. Chọn Authentication -> tab Settings (hoặc Sign-in method)\n3. Cuộn xuống mục [Authorized domains] (Miền được ủy quyền)\n4. Bấm "Add domain" và nhập chính xác: ${domain}\n5. Bấm Lưu và bấm lại nút Đăng nhập Google!`);
      } else if (err.code === 'auth/operation-not-allowed') {
        alert('Phương thức Google Sign-In chưa được bật trong Firebase!\n\nVào Firebase Console -> Authentication -> Sign-in method -> Bật Google (Enable) rồi bấm Lưu.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        // Người dùng chủ động đóng popup
      } else {
        alert(`Xác thực Firebase: ${err.message || err.code}`);
      }
    } finally {
      btns.forEach(b => {
        b.disabled = false;
        if (b.dataset.prevHtml) b.innerHTML = b.dataset.prevHtml;
      });
    }
  },

  handleFirebaseUser(firebaseUser) {
    if (!firebaseUser) return null;
    const email = (firebaseUser.email || '').trim().toLowerCase();
    const fullName = firebaseUser.displayName || 'Người dùng Google';
    const avatar = firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=3b82f6&color=fff`;
    const uid = firebaseUser.uid || ('firebase_' + Date.now());

    const profile = this.loginOrRegisterWithGoogleInfo({
      email,
      fullName,
      picture: avatar,
      sub: uid
    });

    // Tự động đóng modal đăng nhập nếu hồ sơ đã hoàn tất
    if (this.isProfileComplete()) {
      if (typeof window.closeLoginModal === 'function') {
        window.closeLoginModal();
      }
    }
    return profile;
  },

  loginOrRegisterWithGoogleInfo({ email, fullName, picture = '', sub = '' }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (fullName || '').trim() || 'Người dùng Google';
    const avatar = picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=3b82f6&color=fff`;

    // Tự động gán quyền Admin nếu email khớp với cấu hình Admin
    const adminConfig = Storage.getAdminConfig();
    const isAdminEmail = (adminConfig.adminEmail && cleanEmail === adminConfig.adminEmail.toLowerCase());

    // Tìm xem tài khoản Gmail này đã từng đăng ký trên thiết bị chưa
    const savedAccounts = Storage.getAccountsList();
    const found = savedAccounts.find(a => a.email && a.email.toLowerCase() === cleanEmail);

    const profile = {
      uid: sub ? ('google_' + sub) : (found?.uid || 'google_' + Date.now()),
      email: cleanEmail,
      fullName: cleanName || found?.fullName || 'Học sinh',
      avatar: avatar,
      grade: found?.grade || '12',
      className: found?.className || (isAdminEmail ? 'Quản trị hệ thống' : ''),
      school: found?.school || (isAdminEmail ? 'Ban Quản Trị TinHocHub' : ''),
      role: isAdminEmail ? 'admin' : (found?.role || 'student'),
      createdAt: found?.createdAt || new Date().toISOString()
    };

    this.saveUser(profile);

    // Nếu chưa điền đủ Họ tên, Lớp, Trường -> Mở modal hoàn tất hồ sơ bắt buộc
    if (!this.isProfileComplete()) {
      this.openRequiredProfileModal();
    }
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

    // 1. Tìm theo Email hoặc UID duy nhất
    let match = accounts.find(a => (a.email && a.email.toLowerCase() === lower) || (a.uid && a.uid.toLowerCase() === lower));

    // 2. Nếu không thấy, tìm theo Họ và tên chính xác
    if (!match) {
      match = accounts.find(a => a.fullName && a.fullName.toLowerCase() === lower);
    }

    if (!match) {
      return {
        success: false,
        message: 'Tài khoản không tồn tại trên hệ thống! Vui lòng kiểm tra lại Email hoặc bấm tab "Đăng Ký Mới" để tạo tài khoản.'
      };
    }

    // 3. Kiểm tra Mật khẩu bảo vệ tài khoản
    if (match.password) {
      if (match.password !== pwd) {
        return {
          success: false,
          message: 'Mật khẩu không chính xác! Vui lòng kiểm tra lại mật khẩu của bạn.'
        };
      }
    } else {
      // Tài khoản cũ tạo trước khi có tính năng mật khẩu -> Tự động cập nhật mật khẩu lần đầu
      match.password = pwd;
      Storage.saveAccountRecord(match);
    }

    this.saveUser(match);
    return { success: true, user: match };
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
    if (!cleanEmail) {
      return { success: false, message: 'Vui lòng nhập Email của bạn để định danh tài khoản duy nhất!' };
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      return { success: false, message: 'Mật khẩu phải có tối thiểu 6 ký tự để bảo mật tài khoản và điểm số của bạn!' };
    }

    // Kiểm tra tính duy nhất của Email (Chống trùng lặp tài khoản)
    const accounts = Storage.getAccountsList();
    const existing = accounts.find(a => a.email && a.email.toLowerCase() === cleanEmail);
    if (existing) {
      return {
        success: false,
        message: `Email [${cleanEmail}] đã được đăng ký tài khoản trước đó!\nNếu đây là tài khoản của bạn, vui lòng chuyển sang tab "Đăng Nhập" và nhập mật khẩu để vào học.`
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

    const newUser = {
      uid: 'user_' + Date.now(),
      email: cleanEmail,
      password: cleanPassword,
      fullName: cleanName,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=${finalRole === 'admin' ? 'ef4444' : (finalRole === 'teacher' ? '8b5cf6' : '3b82f6')}&color=fff`,
      grade: cleanGrade,
      className: cleanClass,
      school: cleanSchool,
      role: finalRole,
      createdAt: new Date().toISOString()
    };

    this.saveUser(newUser);
    return { success: true, user: newUser, message: 'Đăng ký tài khoản thành công!' };
  },

  loginWithSavedAccount(uidOrEmail) {
    const list = Storage.getAccountsList();
    const target = list.find(u => (u.uid && u.uid === uidOrEmail) || (u.email && u.email.toLowerCase() === uidOrEmail.toLowerCase()));
    if (!target) {
      return { success: false, message: 'Không tìm thấy tài khoản!' };
    }
    const user = {
      uid: target.uid || 'user_' + Date.now(),
      email: target.email || '',
      fullName: target.fullName,
      avatar: target.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(target.fullName)}&background=${target.role === 'admin' ? 'ef4444' : (target.role === 'teacher' ? '8b5cf6' : '3b82f6')}&color=fff`,
      grade: target.grade || '12',
      className: target.className,
      school: target.school,
      role: target.role || 'student',
      createdAt: target.createdAt || new Date().toISOString()
    };
    this.saveUser(user);
    return { success: true, user };
  },

  saveUser(user) {
    this.currentUser = user;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    Storage.saveAccountRecord(user);
    this.notifyAuthChange();
  },

  updateProfile(profileData) {
    if (!this.currentUser) return false;

    this.currentUser = {
      ...this.currentUser,
      fullName: profileData.fullName.trim(),
      grade: profileData.grade || this.currentUser.grade,
      className: profileData.className.trim(),
      school: profileData.school.trim()
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    Storage.saveAccountRecord(this.currentUser);
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
    for (const [key, data] of Object.entries(SCHOOLS_DATA)) {
      if (key.toLowerCase() === clean) return key;
      if (data.aliases && data.aliases.some(a => a.toLowerCase() === clean || clean.includes(a.toLowerCase()))) {
        return key;
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

    let isInternalUpdate = false;

    const renderClassDropdown = (preferredClass = '') => {
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
        html += `<optgroup label="Lớp thuộc Khối ${selectedGrade}">`;
        gradeClasses.forEach(cls => {
          html += `<option value="${cls}">${cls}</option>`;
        });
        html += `</optgroup>`;
      }

      const otherClasses = allSchoolClasses.filter(c => c.grade !== selectedGrade);
      if (otherClasses.length > 0) {
        html += `<optgroup label="Các lớp khối khác (${selectedSchool})">`;
        otherClasses.forEach(c => {
          html += `<option value="${c.name}">${c.name} (Khối ${c.grade})</option>`;
        });
        html += `</optgroup>`;
      }

      html += `<option value="__other__">Lớp khác (Tự nhập)...</option>`;
      classSelect.innerHTML = html;

      const target = preferredClass || classSelect.dataset.prevClass || '';
      const hasTarget = allSchoolClasses.some(c => c.name === target);

      if (hasTarget) {
        classSelect.value = target;
        if (customClassInput) customClassInput.classList.add('hidden');
      } else if (target && target !== '__other__') {
        classSelect.value = '__other__';
        if (customClassInput) {
          customClassInput.classList.remove('hidden');
          customClassInput.value = target;
        }
      } else if (gradeClasses.length > 0) {
        classSelect.value = gradeClasses[0];
        if (customClassInput) customClassInput.classList.add('hidden');
      } else if (allSchoolClasses.length > 0) {
        classSelect.value = allSchoolClasses[0].name;
        if (customClassInput) customClassInput.classList.add('hidden');
      } else {
        classSelect.value = '__other__';
        if (customClassInput) customClassInput.classList.remove('hidden');
      }
    };

    schoolSelect.onchange = () => {
      if (schoolSelect.value === '__other__') {
        if (customSchoolInput) {
          customSchoolInput.classList.remove('hidden');
          customSchoolInput.focus();
        }
        renderClassDropdown('__other__');
      } else {
        if (customSchoolInput) customSchoolInput.classList.add('hidden');
        renderClassDropdown();
      }
    };

    if (gradeSelect) {
      gradeSelect.onchange = () => {
        if (!isInternalUpdate && schoolSelect.value && schoolSelect.value !== '__other__') {
          renderClassDropdown();
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
          renderClassDropdown(val);
          isInternalUpdate = false;
        }
      }
    };

    // Áp dụng trạng thái ban đầu
    if (initialSchool) {
      const stdSchool = this.normalizeSchoolName(initialSchool);
      if (SCHOOLS_DATA[stdSchool]) {
        schoolSelect.value = stdSchool;
        if (customSchoolInput) customSchoolInput.classList.add('hidden');
      } else {
        schoolSelect.value = '__other__';
        if (customSchoolInput) {
          customSchoolInput.classList.remove('hidden');
          customSchoolInput.value = initialSchool;
        }
      }
    }

    if (gradeSelect && initialGrade) {
      gradeSelect.value = initialGrade;
    }

    renderClassDropdown(initialClass);
  },

  openRequiredProfileModal() {
    const modal = document.getElementById('modal-required-profile');
    if (!modal) return;

    const emailEl = document.getElementById('profile-email-display');
    const nameInput = document.getElementById('profile-input-fullname');

    if (this.currentUser) {
      if (emailEl) emailEl.textContent = this.currentUser.email || '';
      if (nameInput) nameInput.value = this.currentUser.fullName || '';
      this.setupSchoolClassSync({
        schoolSelectId: 'profile-input-school',
        customSchoolInputId: 'profile-input-school-custom',
        gradeSelectId: 'profile-input-grade',
        classSelectId: 'profile-input-class',
        customClassInputId: 'profile-input-class-custom',
        initialSchool: this.currentUser.school || '',
        initialGrade: this.currentUser.grade || '12',
        initialClass: this.currentUser.className || ''
      });
    }

    modal.classList.remove('hidden');
  },

  closeRequiredProfileModal() {
    const modal = document.getElementById('modal-required-profile');
    if (modal) modal.classList.add('hidden');
  }
};
