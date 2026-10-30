/**
 * TIN HỌC HUB - CROSS-PLATFORM PROCTOR & ANTI-CHEAT ENGINE
 * Hệ thống giám sát thi trực tuyến đa nền tảng: Windows, macOS, Android, iOS (iPhone / iPadOS)
 */

import { escapeHtml } from './utils.js?v=20261030_45';

export const Proctor = {
  active: false,
  config: {
    enabled: true,
    maxViolations: 3,
    enforceFullscreen: true,
    preventTabSwitch: true,
    disableCopyPaste: true,
    blockDevTools: true,
    detectSplitScreen: true
  },
  platform: {
    os: 'Desktop',
    deviceType: 'Desktop',
    isIOS: false,
    isAndroid: false,
    isMac: false,
    isWindows: false,
    isTouch: false,
    supportsFullscreen: false
  },
  violationCount: 0,
  violationLogs: [],
  lastViolationTime: 0,
  audioCtx: null,
  wakeLockSentinel: null,
  resizeTimer: null,

  callbacks: {
    onViolation: null,
    onDisqualify: null
  },

  detectPlatform() {
    const ua = navigator.userAgent || '';
    const platformStr = navigator.platform || '';
    const maxTouch = navigator.maxTouchPoints || 0;

    const isIOS = /iPad|iPhone|iPod/.test(ua) || (platformStr === 'MacIntel' && maxTouch > 1);
    const isIPad = /iPad/.test(ua) || (platformStr === 'MacIntel' && maxTouch > 1);
    const isAndroid = /Android/i.test(ua);
    const isMac = !isIOS && /Mac/i.test(platformStr || ua);
    const isWindows = /Win/i.test(platformStr || ua);
    const isTouch = ('ontouchstart' in window) || maxTouch > 0;

    const docEl = document.documentElement;
    const supportsFullscreen = !!(
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.msRequestFullscreen
    ) && !(isIOS && !isIPad); // iPhone Safari không hỗ trợ Fullscreen API cho phần tử DOM

    let os = 'Máy tính';
    if (isIPad) os = 'iPadOS';
    else if (isIOS) os = 'iOS (iPhone)';
    else if (isAndroid) os = 'Android';
    else if (isMac) os = 'macOS';
    else if (isWindows) os = 'Windows';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let deviceType = 'Desktop';
    if (isIPad || (isAndroid && !/Mobile/i.test(ua))) deviceType = 'Tablet';
    else if (isIOS || isAndroid) deviceType = 'Mobile';

    this.platform = {
      os,
      deviceType,
      isIOS,
      isIPad,
      isAndroid,
      isMac,
      isWindows,
      isTouch,
      supportsFullscreen
    };

    return this.platform;
  },

  isProctoredSessionActive() {
    // 1. Kiểm tra Bài thi trực tuyến: Exam đang taking
    const isExamTaking = (typeof window !== 'undefined' && window.Exam && window.Exam.examState === 'taking');
    // 2. Kiểm tra Video tương tác: InteractiveVideo đang có activeLesson
    const isVideoPlaying = (typeof window !== 'undefined' && window.InteractiveVideo && !!window.InteractiveVideo.activeLesson);
    return Boolean(isExamTaking || isVideoPlaying);
  },

  init(config = {}, onViolation = null, onDisqualify = null) {
    this.detectPlatform();
    this.config = {
      enabled: config.enabled ?? true,
      maxViolations: config.maxViolations ?? 3,
      enforceFullscreen: config.enforceFullscreen ?? true,
      preventTabSwitch: config.preventTabSwitch ?? true,
      disableCopyPaste: config.disableCopyPaste ?? true,
      blockDevTools: config.blockDevTools ?? true,
      detectSplitScreen: config.detectSplitScreen ?? true
    };
    this.callbacks.onViolation = onViolation;
    this.callbacks.onDisqualify = onDisqualify;
    this.violationCount = config.initialViolationCount || 0;
    this.violationLogs = Array.isArray(config.initialViolationLogs) ? [...config.initialViolationLogs] : [];
    this.lastViolationTime = 0;
    this.active = false;
  },

  start() {
    if (!this.config.enabled) return;
    // BẢO VỆ CHẶT CHẼ: Chỉ kích hoạt giám sát khi đang thực sự trong Bài thi hoặc Video tương tác!
    if (!this.isProctoredSessionActive()) {
      console.warn('Proctor: Không kích hoạt vì hiện không ở trong Bài thi hay Video tương tác!');
      this.stop();
      return;
    }
    this.detectPlatform();
    this.active = true;
    this.lastViolationTime = Date.now(); // Tránh báo lỗi giả ngay giây đầu tiên khi vừa mở phòng thi

    document.body.classList.add('in-proctored-exam');
    this.setPrivacyShield(false);

    // Khởi tạo âm thanh cảnh báo và giữ màn hình luôn sáng (Wake Lock cho Android/iOS)
    this.initAudio();
    this.acquireWakeLock();

    // Bắt buộc toàn màn hình nếu thiết bị hỗ trợ (Windows, macOS, Android, iPad)
    if (this.config.enforceFullscreen && this.platform.supportsFullscreen) {
      this.requestFullscreen();
    }

    // Gắn các bộ lắng nghe sự kiện đa nền tảng
    this.bindEvents();
  },

  setPrivacyShield(enabled) {
    if (enabled && !this.isProctoredSessionActive()) {
      document.body.classList.remove('proctor-privacy-shield');
      return;
    }
    document.body.classList.toggle('proctor-privacy-shield', !!enabled);
  },

  async acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && this.active) {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      // Trình duyệt không hỗ trợ hoặc từ chối WakeLock
    }
  },

  async releaseWakeLock() {
    try {
      if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    } catch (e) {}
  },

  isInFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  },

  isVirtualKeyboardOpen() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || el.isContentEditable) {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (!['radio', 'checkbox', 'button', 'submit'].includes(type)) {
        return true;
      }
    }
    return false;
  },

  initAudio() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  },

  triggerHaptic(pattern = [200, 100, 200]) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) {}
  },

  playWarningBeep() {
    this.triggerHaptic([200, 100, 200]);
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(850, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);

      // Beep thứ 2
      setTimeout(() => {
        try {
          const osc2 = this.audioCtx.createOscillator();
          const gain2 = this.audioCtx.createGain();
          const t2 = this.audioCtx.currentTime;
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(750, t2);
          osc2.frequency.exponentialRampToValueAtTime(950, t2 + 0.15);
          gain2.gain.setValueAtTime(0.3, t2);
          gain2.gain.exponentialRampToValueAtTime(0.01, t2 + 0.35);
          osc2.connect(gain2);
          gain2.connect(this.audioCtx.destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.35);
        } catch (err) {}
      }, 150);
    } catch (e) {
      console.warn('Audio play error', e);
    }
  },

  playDisqualifySiren() {
    this.triggerHaptic([400, 150, 400, 150, 600]);
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(900, now + 0.3);
      osc.frequency.linearRampToValueAtTime(400, now + 0.6);
      osc.frequency.linearRampToValueAtTime(900, now + 0.9);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } catch (e) {}
  },

  bindEvents() {
    // 1. Phát hiện chuyển tab / ẩn trình duyệt / vuốt Home trên Android & iOS
    this._onVisibilityChange = () => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (document.hidden) {
        this.setPrivacyShield(true);
        if (this.config.preventTabSwitch) {
          const msg = (this.platform.isIOS || this.platform.isAndroid)
            ? `Rời màn hình thi hoặc chuyển ứng dụng trên ${this.platform.os}`
            : `Chuyển sang tab khác hoặc thu nhỏ trình duyệt (${this.platform.os})`;
          this.triggerViolation(msg);
        }
      } else {
        // Khi quay lại tab, khôi phục WakeLock
        this.acquireWakeLock();
        if (!document.getElementById('proctor-warning-modal')) {
          this.setPrivacyShield(false);
        }
      }
    };

    // 2. Phát hiện mất tiêu điểm cửa sổ (Click sang cửa sổ khác, kéo Control Center / Notification trên iOS/Android)
    this._onWindowBlur = () => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      // Bỏ qua nếu đang mở hộp thoại cảnh báo của chính hệ thống
      if (document.getElementById('proctor-warning-modal')) return;
      this.setPrivacyShield(true);
      if (this.config.preventTabSwitch) {
        const msg = (this.platform.isIOS || this.platform.isAndroid)
          ? `Mở thanh điều khiển / thông báo hoặc chuyển sang cửa sổ ứng dụng khác (${this.platform.os})`
          : `Rời khỏi cửa sổ thi (click sang ứng dụng khác trên ${this.platform.os})`;
        this.triggerViolation(msg);
      }
    };

    this._onWindowFocus = () => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (!document.getElementById('proctor-warning-modal')) {
        this.setPrivacyShield(false);
      }
    };

    // 3. Phát hiện thoát Toàn màn hình (chỉ áp dụng cho thiết bị hỗ trợ Fullscreen API)
    this._onFullscreenChange = () => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (this.config.enforceFullscreen && this.platform.supportsFullscreen && !this.isInFullscreen()) {
        this.triggerViolation(`Thoát chế độ Toàn màn hình trong khi thi (${this.platform.os})`);
      }
    };

    // 4. Phát hiện Chia đôi màn hình (Split-Screen / Slide Over / Cửa sổ nổi) trên Android, iPadOS & Desktop
    this._onResize = () => {
      if (!this.active || !this.config.detectSplitScreen || !this.isProctoredSessionActive()) {
        if (this.active && !this.isProctoredSessionActive()) this.stop();
        return;
      }
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (!this.active || !this.isProctoredSessionActive() || this.isVirtualKeyboardOpen()) return;
        const availW = window.screen?.availWidth || window.innerWidth;
        const availH = window.screen?.availHeight || window.innerHeight;
        const curW = window.innerWidth;
        const curH = window.innerHeight;

        // Nếu chiều rộng bị thu hẹp dưới 62% màn hình (Split-Screen ngang hoặc thu nhỏ cửa sổ)
        // hoặc chiều cao dưới 52% màn hình khi không mở bàn phím ảo (Split-Screen dọc trên điện thoại)
        const isWidthSplit = availW > 320 && (curW / availW) < 0.62;
        const isHeightSplit = availH > 480 && (curH / availH) < 0.52;

        if (isWidthSplit || isHeightSplit) {
          this.triggerViolation(`Phát hiện chia đôi màn hình (Split-Screen) hoặc thu nhỏ cửa sổ thi (${this.platform.os})`);
        }
      }, 600);
    };

    // 5. Chặn menu chuột phải & nhấn giữ (Long-press callout) trên iOS / Android / Desktop
    this._onContextMenu = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    // 6. Chặn bôi đen & kéo thả văn bản (trừ ô input trả lời ngắn)
    this._onSelectStart = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (!this.config.disableCopyPaste) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        return false;
      }
    };

    this._onDragStart = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (!this.config.disableCopyPaste) return;
      e.preventDefault();
      return false;
    };

    // 7. Phát hiện cử chỉ 3-4 ngón tay trên điện thoại/máy tính bảng (Chụp màn hình 3 ngón hoặc vuốt chuyển app)
    this._onTouchStart = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (e.touches && e.touches.length >= 3) {
        this.setPrivacyShield(true);
        this.triggerViolation(`Sử dụng cử chỉ đa điểm (${e.touches.length} ngón tay - chụp màn hình/chuyển ứng dụng)`);
      }
    };

    // 8. Chặn Copy / Paste / Cut
    this._onCopy = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        this.triggerViolation('Cố ý sao chép (Copy) nội dung đề thi');
        return false;
      }
    };

    this._onPaste = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (this.config.disableCopyPaste) {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          return false;
        }
      }
    };

    this._onCut = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    // 9. Chặn phím tắt gian lận trên cả Windows/Linux (Ctrl, Alt, F12, PrintScreen) và macOS (Command ⌘, Option)
    this._onKeyDown = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      const key = e.key || '';
      const keyLower = key.toLowerCase();
      const cmdOrCtrl = e.ctrlKey || e.metaKey;

      // Chặn F12 (Windows / Linux)
      if (key === 'F12' && this.config.blockDevTools) {
        e.preventDefault();
        this.triggerViolation('Cố ý mở công cụ nhà phát triển (F12)');
        return false;
      }

      // Chặn DevTools trên Windows (Ctrl+Shift+I/J/C) & macOS (Cmd+Option+I/J/C)
      if (this.config.blockDevTools) {
        const isWinDevTools = e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'k'].includes(keyLower);
        const isMacDevTools = e.metaKey && e.altKey && ['i', 'j', 'c', 'k', 'u'].includes(keyLower);
        if (isWinDevTools || isMacDevTools) {
          e.preventDefault();
          this.triggerViolation(`Cố ý mở Developer Tools (${this.platform.os})`);
          return false;
        }
      }

      // Chặn chụp màn hình macOS (Cmd + Shift + 3 / 4 / 5) và Windows (Win + Shift + S)
      if ((e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(keyLower)) || key === 'PrintScreen') {
        this.setPrivacyShield(true);
        e.preventDefault();
        this.triggerViolation(`Cố ý chụp ảnh màn hình đề thi (${this.platform.os})`);
        return false;
      }

      // Chặn Ctrl/Cmd + U (Xem nguồn trang), Ctrl/Cmd + S (Lưu trang), Ctrl/Cmd + P (In đề), Ctrl/Cmd + F/G (Tìm kiếm trong trang)
      if (cmdOrCtrl && ['u', 's', 'p', 'f', 'g'].includes(keyLower)) {
        e.preventDefault();
        return false;
      }

      // Chặn Ctrl/Cmd + C / V / X / A ngoài ô nhập liệu
      if (cmdOrCtrl && ['c', 'v', 'x', 'a'].includes(keyLower) && this.config.disableCopyPaste) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          return false;
        }
      }
    };

    this._onKeyUp = (e) => {
      if (!this.active || !this.isProctoredSessionActive()) {
        if (this.active) this.stop();
        return;
      }
      if (e.key === 'PrintScreen') {
        this.setPrivacyShield(true);
        try { navigator.clipboard?.writeText(''); } catch (err) {}
        this.triggerViolation(`Chụp màn hình bằng phím PrintScreen (${this.platform.os})`);
      }
    };

    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('focus', this._onWindowFocus);
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('selectstart', this._onSelectStart);
    document.addEventListener('dragstart', this._onDragStart);
    document.addEventListener('touchstart', this._onTouchStart, { passive: true });
    document.addEventListener('copy', this._onCopy);
    document.addEventListener('paste', this._onPaste);
    document.addEventListener('cut', this._onCut);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  },

  requestFullscreen() {
    if (!this.platform.supportsFullscreen) return;
    try {
      const docEl = document.documentElement;
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
      if (req) {
        const promise = req.call(docEl);
        if (promise && promise.catch) {
          promise.catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Could not enter fullscreen', e);
    }
  },

  triggerViolation(reason) {
    if (!this.active || !this.isProctoredSessionActive()) {
      if (this.active) this.stop();
      return;
    }

    // Cooldown debounce (1.8 giây) để tránh 1 thao tác chuyển tab/ứng dụng kích hoạt kép blur + visibilitychange
    const now = Date.now();
    if (now - this.lastViolationTime < 1800) {
      return;
    }
    this.lastViolationTime = now;

    this.violationCount++;
    const record = {
      id: Date.now(),
      index: this.violationCount,
      time: new Date().toLocaleTimeString('vi-VN'),
      device: `${this.platform.os} (${this.platform.deviceType})`,
      reason
    };
    this.violationLogs.push(record);

    const max = this.config.maxViolations;
    const remaining = Math.max(0, max - this.violationCount);

    if (this.violationCount >= max) {
      this.playDisqualifySiren();
      this.showDisqualifyModal(record);
      if (this.callbacks.onDisqualify) {
        this.callbacks.onDisqualify(this.violationLogs);
      }
    } else {
      this.playWarningBeep();
      this.showWarningModal(record, remaining);
      if (this.callbacks.onViolation) {
        this.callbacks.onViolation(record, remaining, this.violationCount);
      }
    }
  },

  showWarningModal(record, remaining) {
    if (!this.isProctoredSessionActive()) {
      this.stop();
      return;
    }

    const existing = document.getElementById('proctor-warning-modal');
    if (existing) existing.remove();

    this.setPrivacyShield(true);

    const modal = document.createElement('div');
    modal.id = 'proctor-warning-modal';
    modal.className = 'fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border-2 border-rose-500 animate-alert-shake text-center space-y-4">
        <div class="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-3xl shadow-inner">
          <i class="fa-solid fa-triangle-exclamation animate-bounce"></i>
        </div>

        <div>
          <span class="inline-block px-3 py-1 bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-extrabold text-xs uppercase tracking-wider rounded-lg mb-2">
            CẢNH BÁO VI PHẠM (Lần ${record.index}/${this.config.maxViolations})
          </span>
          <h3 class="text-lg font-black text-slate-800 dark:text-white">
            Phát Hiện Vi Phạm Quy Chế Thi!
          </h3>
          <p class="text-xs text-rose-600 dark:text-rose-400 font-bold mt-1">
            ${escapeHtml(record.reason)} (${escapeHtml(record.time)})
          </p>
        </div>

        <div class="p-3.5 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs text-slate-700 dark:text-slate-300 leading-relaxed text-left">
          <p class="font-bold text-rose-700 dark:text-rose-300 mb-1">
            <i class="fa-solid fa-shield-halved mr-1"></i> Giám sát đa nền tảng (${escapeHtml(this.platform.os)}):
          </p>
          <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
            <li>Không chuyển tab, vuốt sang ứng dụng khác hoặc chia đôi màn hình (Split-Screen).</li>
            <li>Không chụp ảnh màn hình, sao chép câu hỏi hoặc mở thanh điều khiển.</li>
            <li>Bạn chỉ còn <strong class="text-rose-600 dark:text-rose-400 text-xs font-black">${remaining} lần cảnh báo</strong> trước khi bài thi bị khóa tự động!</li>
          </ul>
        </div>

        <button id="btn-ack-proctor-warning" class="w-full py-3.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-rose-600/30 transition">
          Tôi Đã Hiểu & Quay Lại Làm Bài
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const btn = modal.querySelector('#btn-ack-proctor-warning');
    if (btn) {
      btn.addEventListener('click', () => {
        modal.remove();
        this.setPrivacyShield(false);
        this.lastViolationTime = Date.now();
        if (this.config.enforceFullscreen && this.platform.supportsFullscreen && !this.isInFullscreen()) {
          this.requestFullscreen();
        }
      });
    }
  },

  showDisqualifyModal(record) {
    if (!this.isProctoredSessionActive()) {
      this.stop();
      return;
    }

    const existing = document.getElementById('proctor-warning-modal');
    if (existing) existing.remove();

    this.setPrivacyShield(false);

    const modal = document.createElement('div');
    modal.id = 'proctor-warning-modal';
    modal.className = 'fixed inset-0 z-[100] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border-4 border-rose-600 text-center space-y-5">
        <div class="w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center mx-auto text-4xl shadow-xl shadow-rose-600/40 animate-pulse">
          <i class="fa-solid fa-ban"></i>
        </div>

        <div>
          <span class="inline-block px-3 py-1 bg-rose-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg mb-2">
            ĐÌNH CHỈ THI (${escapeHtml(this.platform.os)})
          </span>
          <h3 class="text-xl font-black text-slate-800 dark:text-white">
            Bài Thi Đã Bị Khóa Tự Động!
          </h3>
          <p class="text-xs text-rose-600 dark:text-rose-400 font-bold mt-1">
            Bạn đã vi phạm quy chế quá ${this.config.maxViolations} lần cho phép.
          </p>
        </div>

        <div class="p-3.5 bg-slate-100 dark:bg-slate-700/60 rounded-2xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed text-left max-h-36 overflow-y-auto">
          <p class="font-bold text-slate-800 dark:text-white mb-2">Nhật ký vi phạm đã ghi nhận:</p>
          <ul class="space-y-1 text-[11px] font-mono">
            ${this.violationLogs.map((log, i) => `
              <li class="text-rose-600 dark:text-rose-400">
                • [${escapeHtml(log.time)}] Lần ${i + 1}: ${escapeHtml(log.reason)}
              </li>
            `).join('')}
          </ul>
        </div>

        <p class="text-xs text-slate-500">
          Hệ thống đã tự động thu bài và gửi biên bản giám sát cho Giáo viên.
        </p>

        <button id="btn-close-disqualify-modal" class="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs uppercase rounded-2xl transition">
          Xem Biên Bản Kết Quả
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const btn = modal.querySelector('#btn-close-disqualify-modal');
    if (btn) {
      btn.addEventListener('click', () => {
        modal.remove();
      });
    }
  },

  stop() {
    this.active = false;
    clearTimeout(this.resizeTimer);
    document.body.classList.remove('in-proctored-exam', 'proctor-privacy-shield');
    this.releaseWakeLock();

    if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this._onWindowBlur) window.removeEventListener('blur', this._onWindowBlur);
    if (this._onWindowFocus) window.removeEventListener('focus', this._onWindowFocus);
    if (this._onFullscreenChange) {
      document.removeEventListener('fullscreenchange', this._onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', this._onFullscreenChange);
    }
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._onContextMenu) document.removeEventListener('contextmenu', this._onContextMenu);
    if (this._onSelectStart) document.removeEventListener('selectstart', this._onSelectStart);
    if (this._onDragStart) document.removeEventListener('dragstart', this._onDragStart);
    if (this._onTouchStart) document.removeEventListener('touchstart', this._onTouchStart);
    if (this._onCopy) document.removeEventListener('copy', this._onCopy);
    if (this._onPaste) document.removeEventListener('paste', this._onPaste);
    if (this._onCut) document.removeEventListener('cut', this._onCut);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);

    const modal = document.getElementById('proctor-warning-modal');
    if (modal) modal.remove();

    try {
      if (this.isInFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (exit) exit.call(document).catch?.(() => {});
      }
    } catch (e) {}
  },

  getAuditData() {
    return {
      violationCount: this.violationCount,
      violationLogs: [...this.violationLogs],
      deviceInfo: `${this.platform.os} (${this.platform.deviceType})`,
      isDisqualified: (this.violationCount >= this.config.maxViolations)
    };
  }
};
