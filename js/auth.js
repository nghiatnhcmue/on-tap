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

      // Kiểm tra xem đã có hồ sơ học sinh trước đó chưa
      let existingProfile = this.currentUser;
      if (!existingProfile || existingProfile.email !== email) {
        // Tìm trong danh sách học sinh đã lưu trước đó nếu có
        existingProfile = {
          uid: 'google_' + payload.sub,
          email,
          fullName: name,
          avatar: picture,
          grade: '12',
          className: '',
          school: '',
          role: 'student',
          createdAt: new Date().toISOString()
        };
      } else {
        existingProfile.avatar = picture;
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

  // Hỗ trợ đăng nhập nhanh (mô phỏng hoặc trực tiếp) khi chưa cấu hình Client ID của riêng mình
  loginWithGoogleDemo(customData = {}) {
    const dummyUser = {
      uid: 'google_' + Date.now(),
      email: customData.email || 'hocsinh.tinhoc@gmail.com',
      fullName: customData.fullName || 'Học Sinh Mẫu',
      avatar: customData.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(customData.fullName || 'Học Sinh')}&background=3b82f6&color=fff`,
      grade: customData.grade || '12',
      className: customData.className || '',
      school: customData.school || '',
      role: 'student',
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
