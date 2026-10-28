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
    this.clientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
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

  initGoogleIdentity() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      // Thử lại sau 500ms nếu script Google chưa tải xong
      setTimeout(() => this.initGoogleIdentity(), 500);
      return;
    }

    if (!this.clientId) return;

    try {
      window.google.accounts.id.initialize({
        client_id: this.clientId,
        callback: (response) => this.handleGoogleCredentialResponse(response),
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const btnContainer = document.getElementById('google-signin-btn-container');
      if (btnContainer) {
        btnContainer.innerHTML = '';
        window.google.accounts.id.renderButton(btnContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left'
        });
      }
    } catch (err) {
      console.warn('Lỗi khởi tạo Google Identity Services', err);
    }
  },

  handleGoogleCredentialResponse(response) {
    try {
      const jwt = response.credential;
      const payload = this.parseJwt(jwt);

      const email = payload.email || '';
      const name = payload.name || '';
      const picture = payload.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Học Sinh')}&background=3b82f6&color=fff`;

      // Tự động gán quyền Admin nếu email khớp với cấu hình Admin
      const adminConfig = Storage.getAdminConfig();
      const isAdminEmail = (adminConfig.adminEmail && email.toLowerCase() === adminConfig.adminEmail.toLowerCase());

      // Kiểm tra xem đã có hồ sơ trước đó chưa
      let existingProfile = this.currentUser;
      if (!existingProfile || existingProfile.email !== email) {
        // Tìm trong danh sách tài khoản đã lưu nếu có
        const savedAccounts = Storage.getAccountsList();
        const found = savedAccounts.find(a => a.email.toLowerCase() === email.toLowerCase());

        existingProfile = {
          uid: 'google_' + payload.sub,
          email,
          fullName: name,
          avatar: picture,
          grade: '12',
          className: '',
          school: '',
          role: isAdminEmail ? 'admin' : (found?.role || 'student'),
          createdAt: new Date().toISOString()
        };
      } else {
        existingProfile.avatar = picture;
        if (isAdminEmail) existingProfile.role = 'admin';
      }

      this.saveUser(existingProfile);

      // Nếu chưa điền đủ Họ tên, Lớp, Trường -> Mở modal bắt buộc
      if (!this.isProfileComplete()) {
        this.openRequiredProfileModal();
      }
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
