/**
 * TIN HỌC HUB - PROCTOR & ANTI-CHEAT ENGINE
 * Hệ thống giám sát thi trực tuyến, chống gian lận, phát hiện rời màn hình / chuyển tab
 */

export const Proctor = {
  active: false,
  config: {
    enabled: true,
    maxViolations: 3,
    enforceFullscreen: true,
    preventTabSwitch: true,
    disableCopyPaste: true,
    blockDevTools: true
  },
  violationCount: 0,
  violationLogs: [],
  lastViolationTime: 0,
  audioCtx: null,

  callbacks: {
    onViolation: null,
    onDisqualify: null
  },

  init(config = {}, onViolation = null, onDisqualify = null) {
    this.config = {
      enabled: config.enabled ?? true,
      maxViolations: config.maxViolations ?? 3,
      enforceFullscreen: config.enforceFullscreen ?? true,
      preventTabSwitch: config.preventTabSwitch ?? true,
      disableCopyPaste: config.disableCopyPaste ?? true,
      blockDevTools: config.blockDevTools ?? true
    };
    this.callbacks.onViolation = onViolation;
    this.callbacks.onDisqualify = onDisqualify;
    this.violationCount = 0;
    this.violationLogs = [];
    this.lastViolationTime = 0;
    this.active = false;
  },

  start() {
    if (!this.config.enabled) return;
    this.active = true;
    this.violationCount = 0;
    this.violationLogs = [];
    this.lastViolationTime = 0;

    document.body.classList.add('in-proctored-exam');

    // Khởi tạo AudioContext khi người dùng tương tác
    this.initAudio();

    // Bắt buộc toàn màn hình nếu được cấu hình
    if (this.config.enforceFullscreen) {
      this.requestFullscreen();
    }

    // Gắn các bộ lắng nghe sự kiện
    this.bindEvents();
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

  playWarningBeep() {
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
    this._onVisibilityChange = () => {
      if (!this.active) return;
      if (document.hidden && this.config.preventTabSwitch) {
        this.triggerViolation('Chuyển sang tab khác hoặc thu nhỏ trình duyệt');
      }
    };

    this._onWindowBlur = () => {
      if (!this.active) return;
      if (this.config.preventTabSwitch) {
        this.triggerViolation('Rời khỏi cửa sổ thi (click sang ứng dụng khác)');
      }
    };

    this._onFullscreenChange = () => {
      if (!this.active) return;
      if (this.config.enforceFullscreen && !document.fullscreenElement) {
        this.triggerViolation('Thoát chế độ Toàn màn hình trong khi thi');
      }
    };

    this._onContextMenu = (e) => {
      if (!this.active) return;
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    this._onCopy = (e) => {
      if (!this.active) return;
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    this._onPaste = (e) => {
      if (!this.active) return;
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    this._onCut = (e) => {
      if (!this.active) return;
      if (this.config.disableCopyPaste) {
        e.preventDefault();
        return false;
      }
    };

    this._onKeyDown = (e) => {
      if (!this.active) return;

      // Chặn F12
      if (e.key === 'F12' && this.config.blockDevTools) {
        e.preventDefault();
        this.triggerViolation('Cố ý mở công cụ nhà phát triển (F12)');
        return false;
      }

      // Chặn Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key) && this.config.blockDevTools) {
        e.preventDefault();
        this.triggerViolation('Cố ý mở Developer Tools');
        return false;
      }

      // Chặn Ctrl+U (Xem nguồn trang)
      if (e.ctrlKey && ['u', 'U'].includes(e.key) && this.config.blockDevTools) {
        e.preventDefault();
        return false;
      }

      // Chặn Ctrl+C / Ctrl+V / Ctrl+X
      if (e.ctrlKey && ['c', 'v', 'x', 'C', 'V', 'X'].includes(e.key) && this.config.disableCopyPaste) {
        // Cho phép gõ chữ trong ô trả lời ngắn bình thường, chỉ chặn sao chép câu hỏi
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          return false;
        }
      }
    };

    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('blur', this._onWindowBlur);
    document.addEventListener('fullscreenchange', this._onFullscreenChange);
    document.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('copy', this._onCopy);
    document.addEventListener('paste', this._onPaste);
    document.addEventListener('cut', this._onCut);
    window.addEventListener('keydown', this._onKeyDown);
  },

  requestFullscreen() {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => {
          console.warn('Fullscreen request rejected by browser:', err);
        });
      }
    } catch (e) {
      console.warn('Could not enter fullscreen', e);
    }
  },

  triggerViolation(reason) {
    if (!this.active) return;

    // Cooldown debounce (1.5 giây) để tránh 1 lần Alt+Tab bị kích hoạt liên tiếp blur + visibilitychange
    const now = Date.now();
    if (now - this.lastViolationTime < 1500) {
      return;
    }
    this.lastViolationTime = now;

    this.violationCount++;
    const record = {
      id: Date.now(),
      index: this.violationCount,
      time: new Date().toLocaleTimeString('vi-VN'),
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
    // Xóa modal cũ nếu đang hiển thị
    const existing = document.getElementById('proctor-warning-modal');
    if (existing) existing.remove();

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
            Phát Hiện Hành Vi Rời Màn Hình!
          </h3>
          <p class="text-xs text-rose-600 dark:text-rose-400 font-bold mt-1">
            Lý do: ${record.reason} (${record.time})
          </p>
        </div>

        <div class="p-3.5 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs text-slate-700 dark:text-slate-300 leading-relaxed text-left">
          <p class="font-bold text-rose-700 dark:text-rose-300 mb-1">
            <i class="fa-solid fa-circle-exclamation mr-1"></i> Quy chế phòng thi nghiêm ngặt:
          </p>
          <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
            <li>Không được chuyển tab, mở ứng dụng khác hay tra cứu mạng.</li>
            <li>Mọi mốc thời gian vi phạm đều được lưu vào biên bản nộp cho Thầy Cô.</li>
            <li>Bạn chỉ còn <strong class="text-rose-600 dark:text-rose-400 text-xs font-black">${remaining} lần cảnh báo</strong> trước khi bài thi bị hủy tự động!</li>
          </ul>
        </div>

        <button id="btn-ack-proctor-warning" class="w-full py-3.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-rose-600/30 transition">
          Tôi Đã Hiểu & Tiếp Tục Làm Bài
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const btn = modal.querySelector('#btn-ack-proctor-warning');
    if (btn) {
      btn.addEventListener('click', () => {
        modal.remove();
        if (this.config.enforceFullscreen && !document.fullscreenElement) {
          this.requestFullscreen();
        }
      });
    }
  },

  showDisqualifyModal(record) {
    const existing = document.getElementById('proctor-warning-modal');
    if (existing) existing.remove();

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
            ĐÌNH CHỈ THI
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
                • [${log.time}] Lần ${i + 1}: ${log.reason}
              </li>
            `).join('')}
          </ul>
        </div>

        <p class="text-xs text-slate-500">
          Hệ thống đang tiến hành nộp bài và chuyển biên bản này cho Giáo viên quản trị.
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
    document.body.classList.remove('in-proctored-exam');

    if (this._onVisibilityChange) document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this._onWindowBlur) window.removeEventListener('blur', this._onWindowBlur);
    if (this._onFullscreenChange) document.removeEventListener('fullscreenchange', this._onFullscreenChange);
    if (this._onContextMenu) document.removeEventListener('contextmenu', this._onContextMenu);
    if (this._onCopy) document.removeEventListener('copy', this._onCopy);
    if (this._onPaste) document.removeEventListener('paste', this._onPaste);
    if (this._onCut) document.removeEventListener('cut', this._onCut);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);

    // Xóa modal nếu còn
    const modal = document.getElementById('proctor-warning-modal');
    if (modal) modal.remove();

    // Thoát toàn màn hình nếu đang bật
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}
  },

  getAuditData() {
    return {
      violationCount: this.violationCount,
      violationLogs: [...this.violationLogs],
      isDisqualified: (this.violationCount >= this.config.maxViolations)
    };
  }
};
