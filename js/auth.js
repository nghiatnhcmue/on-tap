/**
 * tinhoc-hub: Auth & User Management (Google Sign-In & Student Profile)
 * Quản lý đăng ký / đăng nhập Google, hồ sơ học sinh (Họ tên, Lớp, Trường)
 */

import { Storage } from './storage.js';

const AUTH_STORAGE_KEY = 'tinhoc_user';
const GOOGLE_CLIENT_ID_KEY = 'tinhoc_google_client_id';

// Default Demo/Testing Google Client ID (User có thể thay bằng Client ID của mình)
const DEFAULT_CLIENT_ID = '1082697841285-sample.apps.googleusercontent.com';

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
  clientId: '',
  onAuthChangeCallbacks: [],

  init() {
    const savedId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
    this.clientId = savedId || (DEFAULT_CLIENT_ID !== '1082697841285-sample.apps.googleusercontent.com' ? DEFAULT_CLIENT_ID : '');
    this.loadUserFromStorage();
    this.initGoogleIdentity();
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
    if (signInContainer && !signInContainer.querySelector('[data-trigger-google-quick]')) {
      signInContainer.innerHTML = `
        <button type="button" data-trigger-google-quick="signin" class="w-full max-w-xs px-5 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
          ${googleSvg}
          <span>Đăng nhập bằng tài khoản Google</span>
        </button>
      `;
    }

    const signUpContainer = document.getElementById('google-signup-btn-container');
    if (signUpContainer && !signUpContainer.querySelector('[data-trigger-google-quick]')) {
      signUpContainer.innerHTML = `
        <button type="button" data-trigger-google-quick="signup" class="w-full max-w-xs px-5 py-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2.5 transition hover:scale-[1.01]">
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
      if (!this._gisRetryCount) this._gisRetryCount = 0;
      if (this._gisRetryCount < 4) {
        this._gisRetryCount++;
        setTimeout(() => this.initGoogleIdentity(), 800);
      }
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

  loginWithDirectIdentity(identity) {
    const raw = (identity || '').trim();
    if (!raw) return { success: false, message: 'Vui lòng nhập Email hoặc Họ và tên!' };

    const lower = raw.toLowerCase();
    const accounts = Storage.getAccountsList();

    // 1. Tìm theo Email
    let match = accounts.find(a => a.email && a.email.toLowerCase() === lower);

    // 2. Tìm theo Họ và tên chính xác
    if (!match) {
      match = accounts.find(a => a.fullName && a.fullName.toLowerCase() === lower);
    }

    // 3. Tìm theo Họ tên gần đúng
    if (!match) {
      match = accounts.find(a => a.fullName && a.fullName.toLowerCase().includes(lower));
    }

    if (match) {
      this.saveUser(match);
      return { success: true, user: match };
    }

    // 4. Nếu là địa chỉ email nhưng chưa lưu trong danh sách -> Tạo hoặc đăng nhập
    if (lower.includes('@')) {
      const newUser = this.loginOrRegisterWithGoogleInfo({
        email: lower,
        fullName: raw.split('@')[0]
      });
      return { success: true, user: newUser };
    }

    // 5. Nếu là họ tên hợp lệ (>= 2 ký tự) -> Tạo tài khoản học sinh
    if (raw.length >= 2) {
      const newUser = {
        uid: 'user_' + Date.now(),
        fullName: raw,
        email: '',
        role: 'student',
        grade: '12',
        className: '',
        school: '',
        createdAt: new Date().toISOString()
      };
      this.saveUser(newUser);
      return { success: true, user: newUser };
    }

    return { success: false, message: 'Tài khoản chưa tồn tại. Vui lòng đăng ký mới hoặc đăng nhập bằng Google!' };
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
    Storage.saveAccountRecord(this.currentUser);
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

      // Determine active target class
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

        // Detect grade from class (e.g. 10TN, 11A1, 12TOAN)
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

    // Apply initial state
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

  // Modal bắt buộc học sinh điền đầy đủ: Họ và tên, Lớp, Trường
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
