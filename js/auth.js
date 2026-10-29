/**
 * tinhoc-hub: Auth & User Management (Google Sign-In & Student Profile)
 * Quản lý đăng ký / đăng nhập Google, hồ sơ học sinh (Họ tên, Lớp, Trường)
 */

import { Storage } from './storage.js';

const AUTH_STORAGE_KEY = 'tinhoc_user';
const GOOGLE_CLIENT_ID_KEY = 'tinhoc_google_client_id';

// Default Demo/Testing Google Client ID (User có thể thay bằng Client ID của mình)
const DEFAULT_CLIENT_ID = '1082697841285-sample.apps.googleusercontent.com';

export const Auth = {
  currentUser: null,
  clientId: '',
  onAuthChangeCallbacks: [],

  init() {
    const savedId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
    this.clientId = savedId || (DEFAULT_CLIENT_ID !== '1082697841285-sample.apps.googleusercontent.com' ? DEFAULT_CLIENT_ID : '');
    this.loadUserFromStorage();
    this.initGoogleIdentity();
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

  isLoggedIn() {
    return !!this.currentUser;
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

  setGoogleClientId(clientId) {
    this.clientId = clientId.trim();
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, this.clientId);
    this.initGoogleIdentity();
  },

  getGoogleClientId() {
    return this.clientId;
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
        <button type="button" data-trigger-google-quick="signin" class="px-6 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
          ${googleSvg}
          <span>Đăng nhập bằng tài khoản Google</span>
        </button>
      `;
    }

    const signUpContainer = document.getElementById('google-signup-btn-container');
    if (signUpContainer) {
      signUpContainer.innerHTML = `
        <button type="button" data-trigger-google-quick="signup" class="px-6 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
          ${googleSvg}
          <span>Đăng ký nhanh bằng Google</span>
        </button>
      `;
    }

    document.querySelectorAll('[data-trigger-google-quick]').forEach(btn => {
      btn.onclick = () => {
        const modal = document.getElementById('modal-google-quick-prompt');
        if (modal) {
          modal.classList.remove('hidden');
          document.getElementById('google-quick-email')?.focus();
        }
      };
    });
  },

  initGoogleIdentity() {
    const hasValidClientId = this.clientId && this.clientId.includes('.apps.googleusercontent.com') && this.clientId !== DEFAULT_CLIENT_ID;

    if (!hasValidClientId) {
      this.renderFallbackGoogleButtons();
      return;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      this.renderFallbackGoogleButtons();
      // Thử lại sau 500ms nếu script Google chưa tải xong
      setTimeout(() => this.initGoogleIdentity(), 500);
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: this.clientId,
        callback: (response) => this.handleGoogleCredentialResponse(response),
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const signInContainer = document.getElementById('google-signin-btn-container');
      if (signInContainer) {
        signInContainer.innerHTML = '';
        window.google.accounts.id.renderButton(signInContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left'
        });
      }

      const signUpContainer = document.getElementById('google-signup-btn-container');
      if (signUpContainer) {
        signUpContainer.innerHTML = '';
        window.google.accounts.id.renderButton(signUpContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signup_with',
          shape: 'pill',
          logo_alignment: 'left'
        });
      }
    } catch (err) {
      console.warn('Lỗi khởi tạo Google Identity Services', err);
      this.renderFallbackGoogleButtons();
    }
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

  handleGoogleCredentialResponse(response) {
    try {
      const jwt = response.credential;
      const payload = this.parseJwt(jwt);

      this.loginOrRegisterWithGoogleInfo({
        email: payload.email || '',
        fullName: payload.name || '',
        picture: payload.picture || '',
        sub: payload.sub || ''
      });
    } catch (e) {
      console.error('Lỗi xử lý phản hồi từ Google', e);
      alert('Không thể xác thực tài khoản Google. Vui lòng thử lại!');
    }
  },

  // Hỗ trợ đăng nhập nhanh mô phỏng với từng vai trò
  loginWithGoogleDemo(customData = {}) {
    const role = customData.role || 'student';
    let defaultName = 'Học Sinh Mẫu';
    let defaultEmail = 'hocsinh.tinhoc@gmail.com';
    let defaultClass = '12A1';
    let defaultSchool = 'THPT Chu Văn An';

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

  registerUser({ fullName, grade, className, school, email, role = 'student', secretCode = '' }) {
    const cleanName = (fullName || '').trim();
    const cleanClass = (className || '').trim();
    const cleanSchool = (school || '').trim();
    const cleanGrade = grade || '12';
    const cleanEmail = (email || '').trim();

    if (!cleanName) {
      return { success: false, message: 'Vui lòng nhập Họ và tên của bạn!' };
    }
    if (!cleanClass) {
      return { success: false, message: 'Vui lòng nhập Lớp của bạn!' };
    }
    if (!cleanSchool) {
      return { success: false, message: 'Vui lòng nhập Trường của bạn!' };
    }

    let finalRole = 'student';
    const adminConfig = Storage.getAdminConfig();

    if (role === 'admin' || (cleanEmail && adminConfig.adminEmail && cleanEmail.toLowerCase() === adminConfig.adminEmail.toLowerCase())) {
      if (secretCode === adminConfig.adminSecretCode || (cleanEmail && adminConfig.adminEmail && cleanEmail.toLowerCase() === adminConfig.adminEmail.toLowerCase())) {
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
      email: cleanEmail || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'hs'}_${Date.now().toString().slice(-4)}@tinhoc.local`,
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
    this.notifyAuthChange();
    return true;
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    this.notifyAuthChange();
  },

  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return {};
    }
  },

  // Modal bắt buộc học sinh điền đầy đủ: Họ và tên, Lớp, Trường
  openRequiredProfileModal() {
    const modal = document.getElementById('modal-required-profile');
    if (!modal) return;

    const emailEl = document.getElementById('profile-email-display');
    const nameInput = document.getElementById('profile-input-fullname');
    const gradeSelect = document.getElementById('profile-input-grade');
    const classInput = document.getElementById('profile-input-class');
    const schoolInput = document.getElementById('profile-input-school');

    if (this.currentUser) {
      if (emailEl) emailEl.textContent = this.currentUser.email || '';
      if (nameInput) nameInput.value = this.currentUser.fullName || '';
      if (gradeSelect) gradeSelect.value = this.currentUser.grade || '12';
      if (classInput) classInput.value = this.currentUser.className || '';
      if (schoolInput) schoolInput.value = this.currentUser.school || '';
    }

    modal.classList.remove('hidden');
  },

  closeRequiredProfileModal() {
    const modal = document.getElementById('modal-required-profile');
    if (modal) modal.classList.add('hidden');
  }
};
