/**
 * TinHocHub - Arena: Đấu Trường Game Trí Tuệ (Blooket & Wayground Style + LMS Chỉnh Chu)
 * Hỗ trợ 4 chế độ game: Đào Vàng Rương Báu, Đua Top Tốc Độ, Săn Boss Diệt Bug, Kahoot Cổ Điển.
 * Tích hợp Blook Avatars, Web Audio API Sound Synthesizer, Firebase Realtime Sync, và LMS Sổ Điểm.
 */

const Arena = {
  container: null,
  manifest: null,
  loadGradeFn: null,
  activeRoom: null,
  activeRole: null, // 'host' | 'player'
  currentQuestionIndex: -1,
  gameTimer: null,
  eventSource: null,
  pollingInterval: null,
  isMuted: false,
  soundCtx: null,

  // Danh mục 12 Linh thú Blooks ngộ nghĩnh
  BLOOKS: [
    { id: 'bot', name: 'Cyber Bot', icon: 'fa-robot', gradient: 'from-cyan-500 to-blue-600', color: '#06b6d4', desc: 'Tăng 10% may mắn mở rương' },
    { id: 'cat', name: 'Ninja Neko', icon: 'fa-cat', gradient: 'from-amber-400 to-orange-500', color: '#f59e0b', desc: 'Bứt tốc phản xạ câu hỏi' },
    { id: 'dragon', name: 'Rồng Lửa', icon: 'fa-dragon', gradient: 'from-rose-500 to-red-600', color: '#ef4444', desc: 'Sát thương chí mạng lên Boss' },
    { id: 'wizard', name: 'Pháp Sư', icon: 'fa-hat-wizard', gradient: 'from-purple-500 to-indigo-600', color: '#8b5cf6', desc: 'Khiên phép thuật bảo hộ' },
    { id: 'astronaut', name: 'Phi Hành Gia', icon: 'fa-user-astronaut', gradient: 'from-blue-600 to-violet-700', color: '#3b82f6', desc: 'Khám phá tri thức vũ trụ' },
    { id: 'fox', name: 'Cáo Tinh Anh', icon: 'fa-paw', gradient: 'from-orange-500 to-amber-600', color: '#f97316', desc: 'Mưu lược cướp vàng thông thái' },
    { id: 'owl', name: 'Cú Thông Thái', icon: 'fa-feather', gradient: 'from-emerald-500 to-teal-600', color: '#10b981', desc: 'Trực giác đáp án chính xác' },
    { id: 'unicorn', name: 'Kỳ Lân', icon: 'fa-horse-head', gradient: 'from-pink-400 to-purple-500', color: '#ec4899', desc: 'Nhân đôi combo may mắn' },
    { id: 'alien', name: 'Pixel Alien', icon: 'fa-spaghetti-monster-flying', gradient: 'from-lime-400 to-green-600', color: '#84cc16', desc: 'Miễn nhiễm đòn đóng băng' },
    { id: 'lion', name: 'Sư Tử Chúa', icon: 'fa-shield-halved', gradient: 'from-yellow-500 to-amber-600', color: '#eab308', desc: 'Vương giả dẫn đầu bảng' },
    { id: 'panda', name: 'Kungfu Panda', icon: 'fa-hand-fist', gradient: 'from-slate-700 to-slate-900', color: '#334155', desc: 'Đòn đánh liên hoàn dũng mãnh' },
    { id: 'shark', name: 'Cá Mập Tech', icon: 'fa-fish', gradient: 'from-sky-500 to-indigo-600', color: '#0284c7', desc: 'Lướt sóng bứt phá thần tốc' }
  ],

  // ==========================================
  // 1. WEB AUDIO API SYNTHESIZER (ÂM THANH ĐỘNG)
  // ==========================================
  initAudio() {
    if (!this.soundCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.soundCtx = new AudioCtx();
    }
    if (this.soundCtx && this.soundCtx.state === 'suspended') {
      this.soundCtx.resume();
    }
  },

  playTone(freq, duration, type = 'sine', gainVal = 0.15) {
    if (this.isMuted) return;
    try {
      this.initAudio();
      if (!this.soundCtx) return;
      const osc = this.soundCtx.createOscillator();
      const gain = this.soundCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.soundCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.soundCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.soundCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.soundCtx.destination);
      osc.start();
      osc.stop(this.soundCtx.currentTime + duration);
    } catch {}
  },

  playChime() {
    this.playTone(523.25, 0.15, 'triangle', 0.2); // C5
    setTimeout(() => this.playTone(659.25, 0.15, 'triangle', 0.2), 100); // E5
    setTimeout(() => this.playTone(783.99, 0.25, 'triangle', 0.2), 200); // G5
    setTimeout(() => this.playTone(1046.50, 0.35, 'triangle', 0.25), 300); // C6
  },

  playWrong() {
    this.playTone(260, 0.18, 'sawtooth', 0.2);
    setTimeout(() => this.playTone(220, 0.25, 'sawtooth', 0.2), 120);
  },

  playChest() {
    this.playTone(440, 0.1, 'sine', 0.15);
    setTimeout(() => this.playTone(554.37, 0.1, 'sine', 0.15), 80);
    setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.15), 160);
    setTimeout(() => this.playTone(880, 0.3, 'sine', 0.25), 240);
  },

  playSteal() {
    this.playTone(880, 0.1, 'sawtooth', 0.2);
    setTimeout(() => this.playTone(440, 0.2, 'sawtooth', 0.2), 80);
  },

  playBossHit() {
    this.playTone(150, 0.2, 'square', 0.25);
    setTimeout(() => this.playTone(90, 0.3, 'sawtooth', 0.3), 80);
  },

  playTick() {
    this.playTone(800, 0.04, 'sine', 0.05);
  },

  playFanfare() {
    const notes = [523, 523, 523, 659, 784, 1046];
    const delays = [0, 120, 240, 360, 480, 640];
    notes.forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 0.25, 'triangle', 0.25), delays[idx]);
    });
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    const btn = document.getElementById('arena-btn-toggle-sound');
    if (btn) {
      btn.innerHTML = this.isMuted ? '<i class="fa-solid fa-volume-xmark text-rose-500"></i>' : '<i class="fa-solid fa-volume-high text-emerald-500"></i>';
      btn.title = this.isMuted ? 'Đang tắt âm (Bấm để bật)' : 'Đang bật âm (Bấm để tắt)';
    }
  },

  // ==========================================
  // 2. KHỞI TẠO & RENDER VIEW CHÍNH
  // ==========================================
  async init(containerEl, manifest = null, loadGradeFn = null) {
    this.container = containerEl;
    this.manifest = manifest;
    this.loadGradeFn = loadGradeFn;

    // Kiểm tra query parameter ?game=XYZ hoặc ?pin=XYZ
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('game') || urlParams.get('pin');

    this.renderMainView();

    if (pinParam) {
      setTimeout(() => {
        const pinInput = document.getElementById('arena-input-pin');
        if (pinInput) {
          pinInput.value = pinParam.trim();
          this.joinArenaByPin(pinParam.trim());
        }
      }, 200);
    }
  },

  getBaseDbUrl() {
    if (typeof Storage !== 'undefined' && typeof Storage.getFirebaseDbUrl === 'function') {
      const url = Storage.getFirebaseDbUrl();
      if (url && url.trim()) return url.trim().replace(/\/+$/, '');
    }
    return 'https://on-tap-tinhoc-default-rtdb.firebaseio.com';
  },

  renderMainView() {
    const isTeacher = typeof Auth !== 'undefined' && (Auth.isTeacher() || Auth.isAdmin());
    const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const savedPlayer = Storage.getArenaPlayer() || {};

    this.container.innerHTML = `
      <div class="space-y-8 animate-fadeIn pb-12">
        
        <!-- Header Banner Đấu Trường -->
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-700 via-indigo-700 to-rose-600 text-white p-6 sm:p-10 shadow-2xl border border-white/10">
          <div class="absolute -top-16 -right-16 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-16 -left-16 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
          
          <div class="relative z-10 max-w-3xl space-y-4">
            <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider">
              <i class="fa-solid fa-gamepad text-amber-300"></i> Đấu Trường Game Trí Tuệ (Blooket & Wayground)
            </div>

            <h2 class="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              Học Mà Chơi, Chơi Mà Học Cùng <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-pink-200 to-cyan-200">TinHocHub Arena</span>!
            </h2>
            <p class="text-xs sm:text-sm text-white/90 leading-relaxed max-w-2xl">
              Hóa thân thành các Linh thú Blooks ngộ nghĩnh, tham gia Đào Vàng Mở Rương, Đua Top Bứt Tốc hay Hợp Lực Cả Lớp Săn Boss để ôn luyện kiến thức cực đỉnh!
            </p>

            <div class="pt-2 flex flex-wrap items-center gap-3">
              ${isTeacher ? `
                <button type="button" id="btn-open-create-arena" class="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-900 text-xs font-black transition flex items-center gap-2 shadow-lg shadow-black/20 hover:scale-[1.02] active:scale-[0.98]">
                  <i class="fa-solid fa-crown text-base"></i> Tạo Đấu Trường Mới (Dành Cho Giáo Viên)
                </button>
              ` : ''}

              <button type="button" id="arena-btn-toggle-sound" class="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition text-sm" title="Bật/Tắt âm thanh">
                ${this.isMuted ? '<i class="fa-solid fa-volume-xmark text-rose-300"></i>' : '<i class="fa-solid fa-volume-high text-emerald-300"></i>'}
              </button>
            </div>
          </div>
        </div>

        <!-- Khung 2 Cột: Tham Gia Ngay (Học Sinh) & Chọn Chế Độ Game -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <!-- Cột Trái (lg:col-span-5): Cổng Vào Đấu Trường Học Sinh -->
          <div class="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xl space-y-6">
            <div class="border-b border-slate-100 dark:border-slate-700 pb-4">
              <span class="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <i class="fa-solid fa-right-to-bracket"></i> Dành Cho Học Sinh
              </span>
              <h3 class="text-xl font-black text-slate-800 dark:text-white mt-1">
                Vào Phòng Đấu Trường Ngay
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Nhập mã PIN 6 chữ số do Thầy/Cô cung cấp trên máy chiếu lớp học</p>
            </div>

            <form id="form-join-arena" class="space-y-4">
              <!-- Mã PIN -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Mã PIN Trận Đấu *</label>
                <div class="relative">
                  <input type="text" id="arena-input-pin" required maxlength="6" placeholder="Ví dụ: 829104" class="w-full text-center tracking-[0.35em] text-2xl font-black px-4 py-3 bg-purple-50 dark:bg-purple-950/30 border-2 border-purple-300 dark:border-purple-700 rounded-2xl text-purple-700 dark:text-purple-300 focus:ring-4 focus:ring-purple-500/20 uppercase" />
                  <div class="absolute right-3.5 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none">
                    <i class="fa-solid fa-hashtag text-sm"></i>
                  </div>
                </div>
              </div>

              <!-- Tên Hiển Thị -->
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Tên / Biệt Danh Của Em *</label>
                <input type="text" id="arena-input-name" required value="${escapeHtml(currentUser?.fullName || savedPlayer.name || '')}" placeholder="Nhập họ tên (Ví dụ: Nguyễn Minh Khôi)" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500" />
              </div>

              <!-- Chọn Linh Thú Blook -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-xs font-bold text-slate-700 dark:text-slate-300">Chọn Linh Thú Blook Đại Diện</label>
                  <span id="arena-selected-blook-name" class="text-xs font-black text-purple-600 dark:text-purple-400">Cyber Bot</span>
                </div>
                
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-h-44 overflow-y-auto">
                  ${this.BLOOKS.map((b, idx) => `
                    <button type="button" data-blook-id="${b.id}" class="blook-select-btn p-2 rounded-xl flex flex-col items-center gap-1 transition ${idx === 0 ? 'bg-purple-100 dark:bg-purple-900/60 ring-2 ring-purple-500' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}" title="${escapeHtml(b.name)} - ${escapeHtml(b.desc)}">
                      <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${b.gradient} text-white flex items-center justify-center text-sm shadow-xs">
                        <i class="fa-solid ${b.icon}"></i>
                      </div>
                      <span class="text-[9px] font-bold text-slate-700 dark:text-slate-300 truncate w-full text-center">${escapeHtml(b.name)}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <button type="submit" id="btn-submit-join-arena" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-sm transition shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99]">
                <i class="fa-solid fa-rocket"></i> VÀO ĐẤU TRƯỜNG NGAY
              </button>
            </form>
          </div>

          <!-- Cột Phải (lg:col-span-7): Giới Thiệu 4 Chế Độ Đấu Trường Gamification -->
          <div class="lg:col-span-7 space-y-4">
            <div>
              <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Các Đấu Trường Nổi Bật</span>
              <h3 class="text-lg font-black text-slate-800 dark:text-white mt-0.5">Khám Phá Cơ Chế Chơi Gamification Đỉnh Cao</h3>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Mode 1: Gold Quest -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800 border-2 border-amber-200 dark:border-amber-800/60 space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-500 text-white flex items-center justify-center text-2xl shadow-sm">
                  <i class="fa-solid fa-coins"></i>
                </div>
                <div>
                  <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-200/60 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-[10px] font-bold uppercase">
                    Blooket Style
                  </div>
                  <h4 class="text-base font-black text-slate-800 dark:text-white mt-1">Đào Vàng & Rương Báu</h4>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Trả lời đúng để mở 1 trong 3 rương báu bí mật: nhận Vàng, x2 Vàng Jackpot, Khiên Thần, hoặc Cướp vàng của bạn khác!
                  </p>
                </div>
              </div>

              <!-- Mode 2: Speed Racer -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 border-2 border-blue-200 dark:border-blue-800/60 space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center text-2xl shadow-sm">
                  <i class="fa-solid fa-bolt-lightning"></i>
                </div>
                <div>
                  <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-200/60 dark:bg-blue-950 text-blue-900 dark:text-blue-300 text-[10px] font-bold uppercase">
                    Wayground Style
                  </div>
                  <h4 class="text-base font-black text-slate-800 dark:text-white mt-1">Đua Top & Combo Power-Ups</h4>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Tốc độ phản xạ quyết định vị trí! Chuỗi trả lời đúng tạo combo x1.5, x2, x3 và mở khóa thẻ trợ giúp 50/50, Đóng băng đối thủ.
                  </p>
                </div>
              </div>

              <!-- Mode 3: Boss Raid -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-slate-800 dark:to-slate-800 border-2 border-rose-200 dark:border-rose-800/60 space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-red-600 text-white flex items-center justify-center text-2xl shadow-sm">
                  <i class="fa-solid fa-dragon"></i>
                </div>
                <div>
                  <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-200/60 dark:bg-rose-950 text-rose-900 dark:text-rose-300 text-[10px] font-bold uppercase">
                    Co-op Battle
                  </div>
                  <h4 class="text-base font-black text-slate-800 dark:text-white mt-1">Hợp Lực Diệt Siêu Trùm Bug</h4>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Cả lớp cùng nhìn lên máy chiếu hợp sức đánh Siêu Trùm! Mỗi câu đúng phóng một chưởng phép thuật trừ máu Boss trước khi hết giờ.
                  </p>
                </div>
              </div>

              <!-- Mode 4: Classic Arena -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-800 border-2 border-purple-200 dark:border-purple-800/60 space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-600 text-white flex items-center justify-center text-2xl shadow-sm">
                  <i class="fa-solid fa-stopwatch"></i>
                </div>
                <div>
                  <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-200/60 dark:bg-purple-950 text-purple-900 dark:text-purple-300 text-[10px] font-bold uppercase">
                    Kahoot Style
                  </div>
                  <h4 class="text-base font-black text-slate-800 dark:text-white mt-1">Tốc Độ Cổ Điển & Bảng Điểm</h4>
                  <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Trải nghiệm cổ điển với biểu đồ cột thống kê đáp án A, B, C, D sau mỗi câu và bục vinh danh Podium 3D trao cúp rực rỡ.
                  </p>
                </div>
              </div>
            </div>

            <!-- LMS Integration Banner -->
            <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-base shrink-0">
                <i class="fa-solid fa-graduation-cap"></i>
              </div>
              <div class="text-xs text-emerald-900 dark:text-emerald-200">
                <strong>Hệ thống LMS Chỉnh Chu:</strong> Tự động đồng bộ điểm số vào Sổ Điểm Điện Tử Lớp, phân tích câu hỏi học sinh hay sai nhiều nhất và xuất file Excel chuẩn quốc tế.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindMainEvents();
  },

  bindMainEvents() {
    // 1. Chọn Blook
    let selectedBlookId = this.BLOOKS[0].id;
    this.container.querySelectorAll('.blook-select-btn').forEach(btn => {
      btn.onclick = () => {
        this.container.querySelectorAll('.blook-select-btn').forEach(b => {
          b.classList.remove('bg-purple-100', 'dark:bg-purple-900/60', 'ring-2', 'ring-purple-500');
        });
        btn.classList.add('bg-purple-100', 'dark:bg-purple-900/60', 'ring-2', 'ring-purple-500');
        selectedBlookId = btn.getAttribute('data-blook-id');
        const found = this.BLOOKS.find(x => x.id === selectedBlookId);
        const nameEl = document.getElementById('arena-selected-blook-name');
        if (nameEl && found) nameEl.textContent = found.name;
        this.playTone(600, 0.08, 'sine');
      };
    });

    // 2. Submit Vào Phòng
    const formJoin = document.getElementById('form-join-arena');
    if (formJoin) {
      formJoin.onsubmit = (e) => {
        e.preventDefault();
        const pin = document.getElementById('arena-input-pin')?.value.trim();
        const name = document.getElementById('arena-input-name')?.value.trim();
        if (!pin || pin.length < 4) {
          alert('Vui lòng nhập đúng mã PIN trận đấu (tối thiểu 4-6 số)!');
          return;
        }
        if (!name) {
          alert('Vui lòng nhập tên của em!');
          return;
        }

        // Lưu thông tin người chơi
        Storage.saveArenaPlayer({ pin, name, blookId: selectedBlookId });
        this.joinArenaByPin(pin, name, selectedBlookId);
      };
    }

    // 3. Mở Modal Tạo Đấu Trường (Giáo viên)
    const btnOpenCreate = document.getElementById('btn-open-create-arena');
    if (btnOpenCreate) {
      btnOpenCreate.onclick = () => {
        this.openCreateArenaModal();
      };
    }

    // 4. Bật/Tắt Âm Thanh
    const btnSound = document.getElementById('arena-btn-toggle-sound');
    if (btnSound) {
      btnSound.onclick = () => this.toggleMute();
    }
  },

  // ==========================================
  // 3. MODAL TẠO ĐẤU TRƯỜNG DÀNH CHO GIÁO VIÊN
  // ==========================================
  openCreateArenaModal() {
    let modal = document.getElementById('modal-create-arena');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-create-arena';
      modal.className = 'fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto';
      document.body.appendChild(modal);
    }

    const schoolsData = Storage.getSchoolsData();
    const schoolsList = Object.keys(schoolsData);
    const customPackages = Storage.getAllTeacherContributions().filter(p => p.questions && p.questions.length > 0);

    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 max-h-[92vh] overflow-y-auto animate-scaleUp">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 text-white flex items-center justify-center text-lg shadow-sm">
              <i class="fa-solid fa-gamepad"></i>
            </div>
            <div>
              <h3 class="text-base font-black text-slate-800 dark:text-white">Tạo Đấu Trường Game Mới</h3>
              <p class="text-xs text-slate-400">Khởi tạo trận đấu tương tác trực tiếp hoặc giao bài tập về nhà</p>
            </div>
          </div>
          <button id="btn-close-create-arena" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="form-create-arena-submit" class="space-y-4 text-xs">
          <!-- 1. Tên trận đấu -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên Trận Đấu / Đấu Trường *</label>
            <input type="text" id="arena-create-title" required placeholder="Ví dụ: Đấu Trường Rương Báu Tin Học 12 - Ôn Thi Giữa Kỳ" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500" />
          </div>

          <!-- 2. Chọn Chế độ Game -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Chế Độ Chơi (Game Mode) *</label>
            <div class="grid grid-cols-2 gap-2.5">
              <label class="p-3 rounded-2xl border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="gold_quest" checked class="text-amber-500 focus:ring-amber-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">🪙 Đào Vàng & Rương Báu</strong>
                  <span class="text-[10px] text-slate-500">Blooket Gold Quest cướp vàng</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="speed_racer" class="text-blue-500 focus:ring-blue-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">🏎️ Đua Top Tốc Độ</strong>
                  <span class="text-[10px] text-slate-500">Wayground Combo Power-ups</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="boss_raid" class="text-rose-500 focus:ring-rose-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">👾 Săn Boss Diệt Bug</strong>
                  <span class="text-[10px] text-slate-500">Cả lớp hợp lực đánh trùm</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-purple-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="classic" class="text-purple-500 focus:ring-purple-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">⚡ Tốc Độ Cổ Điển</strong>
                  <span class="text-[10px] text-slate-500">Biểu đồ câu hỏi Kahoot</span>
                </div>
              </label>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- 3. Nguồn câu hỏi -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nguồn Đề Thi / Câu Hỏi *</label>
              <select id="arena-create-source" class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                <option value="grade_12" selected>Khối 12 (Ngân hàng chuẩn 1.479 câu)</option>
                <option value="grade_11">Khối 11 (Ngân hàng chuẩn 1.240 câu)</option>
                <option value="grade_10">Khối 10 (Ngân hàng chuẩn 1.379 câu)</option>
                ${customPackages.map(p => `
                  <option value="pkg_${p.id}">Gói Excel: ${escapeHtml(p.packageTitle)} (${p.questions.length} câu)</option>
                `).join('')}
              </select>
            </div>

            <!-- 4. Số lượng câu hỏi -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số Lượng Câu Hỏi</label>
              <select id="arena-create-qcount" class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                <option value="10">10 câu hỏi (Nhanh 5-7 phút)</option>
                <option value="15" selected>15 câu hỏi (Tiêu chuẩn 10-12 phút)</option>
                <option value="20">20 câu hỏi (Toàn diện 15 phút)</option>
                <option value="25">25 câu hỏi</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- 5. Thời gian mỗi câu -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Thời Gian Mỗi Câu</label>
              <select id="arena-create-timer" class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                <option value="15">15 giây (Rất nhanh)</option>
                <option value="20" selected>20 giây (Chuẩn cân đối)</option>
                <option value="30">30 giây (Thư thả suy nghĩ)</option>
                <option value="45">45 giây (Vận dụng cao)</option>
              </select>
            </div>

            <!-- 6. Phân lớp ghi sổ điểm -->
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Giao Cho Lớp (Tự Lưu Sổ Điểm)</label>
              <select id="arena-create-target-class" class="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                <option value="all" selected>Tất cả các lớp / Tự do</option>
                ${schoolsList.map(s => {
                  const sInfo = schoolsData[s];
                  const cList = (sInfo.classes?.['12'] || []).concat(sInfo.classes?.['11'] || []).concat(sInfo.classes?.['10'] || []);
                  return cList.map(c => `<option value="${s}|${c}">${escapeHtml(sInfo.name)} - Lớp ${c}</option>`).join('');
                }).join('')}
              </select>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-3">
            <button type="button" id="btn-cancel-create-arena" class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 transition">
              Hủy
            </button>
            <button type="submit" id="btn-submit-create-arena" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black shadow-md transition flex items-center gap-2">
              <i class="fa-solid fa-play"></i> Khởi Tạo & Vào Phòng Chờ (Host)
            </button>
          </div>
        </form>
      </div>
    `;

    const closeModal = () => modal.remove();
    modal.querySelector('#btn-close-create-arena')?.addEventListener('click', closeModal);
    modal.querySelector('#btn-cancel-create-arena')?.addEventListener('click', closeModal);

    // Xử lý tạo phòng
    const form = modal.querySelector('#form-create-arena-submit');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const title = modal.querySelector('#arena-create-title').value.trim();
        const mode = modal.querySelector('input[name="arena-create-mode"]:checked')?.value || 'gold_quest';
        const source = modal.querySelector('#arena-create-source').value;
        const qCount = parseInt(modal.querySelector('#arena-create-qcount').value, 10) || 15;
        const timerSec = parseInt(modal.querySelector('#arena-create-timer').value, 10) || 20;
        const targetClass = modal.querySelector('#arena-create-target-class').value;

        closeModal();
        await this.createNewArenaRoom({ title, mode, source, qCount, timerSec, targetClass });
      };
    }
  },

  async createNewArenaRoom({ title, mode, source, qCount, timerSec, targetClass }) {
    // 1. Sinh mã PIN 6 số ngẫu nhiên
    const pin = String(Math.floor(100000 + Math.random() * 900000));

    // 2. Lấy câu hỏi theo nguồn
    let questions = [];
    if (source.startsWith('pkg_')) {
      const pkgId = source.replace('pkg_', '');
      const pkg = Storage.getAllTeacherContributions().find(p => p.id === pkgId);
      if (pkg && pkg.questions) questions = [...pkg.questions];
    } else {
      const grade = source.replace('grade_', '');
      try {
        const res = await fetch(`data/grade_${grade}.json`);
        if (res.ok) questions = await res.json();
      } catch (err) {
        console.warn('Không tải được câu hỏi khối:', grade, err);
      }
    }

    // Xáo trộn và cắt đúng số lượng câu hỏi
    const shuffledQuestions = questions.sort(() => 0.5 - Math.random()).slice(0, qCount);

    const hostUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const roomData = {
      pin,
      title,
      gameMode: mode,
      timerPerQuestion: timerSec,
      targetClass,
      hostName: hostUser?.fullName || 'Thầy/Cô',
      hostEmail: hostUser?.email || '',
      status: 'lobby', // 'lobby' | 'playing' | 'question_result' | 'game_over'
      currentQuestionIndex: -1,
      totalQuestions: shuffledQuestions.length,
      questions: shuffledQuestions,
      bossMaxHp: shuffledQuestions.length * 400,
      bossCurrentHp: shuffledQuestions.length * 400,
      players: {},
      activityFeed: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Lưu LocalStorage & Đẩy lên Firebase RTDB
    Storage.saveArenaRoom(roomData);
    if (typeof CloudSync !== 'undefined' && CloudSync.pushArenaRoomToCloud) {
      CloudSync.pushArenaRoomToCloud(roomData);
    }

    // Mở màn hình Host (Máy chiếu)
    this.startHostView(roomData);
  },

  // ==========================================
  // 4. MÀN HÌNH HOST (GIÁO VIÊN / MÁY CHIẾU LỚP HỌC)
  // ==========================================
  startHostView(room) {
    this.activeRoom = room;
    this.activeRole = 'host';
    this.listenToRoomUpdates(room.pin);
    this.renderHostLobby();
  },

  renderHostLobby() {
    const room = this.activeRoom;
    const players = Object.values(room.players || {});
    const joinUrl = `${window.location.origin}/?game=${room.pin}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(joinUrl)}`;

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn pb-12">
        <!-- Top bar Host -->
        <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center gap-3">
            <button id="btn-host-exit-room" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition flex items-center gap-1.5">
              <i class="fa-solid fa-arrow-left"></i> Thoát Đấu Trường
            </button>
            <div>
              <h3 class="text-sm font-black text-slate-800 dark:text-white">${escapeHtml(room.title)}</h3>
              <span class="text-[11px] text-slate-400">Chế độ: <b>${this.getModeTitle(room.gameMode)}</b> • ${room.totalQuestions} câu hỏi</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button id="arena-btn-toggle-sound" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 transition text-sm">
              ${this.isMuted ? '<i class="fa-solid fa-volume-xmark text-rose-500"></i>' : '<i class="fa-solid fa-volume-high text-emerald-500"></i>'}
            </button>
            <button id="btn-host-fullscreen" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-1">
              <i class="fa-solid fa-expand"></i> Toàn Màn Hình
            </button>
          </div>
        </div>

        <!-- Khung Máy Chiếu Lớp Học: Mã PIN & QR Code To Rõ Nét -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          <!-- Cột Trái: Mã PIN khổng lồ & Link -->
          <div class="md:col-span-8 bg-gradient-to-br from-indigo-900 via-purple-950 to-slate-900 text-white rounded-3xl p-8 sm:p-12 shadow-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between min-h-[360px]">
            <div class="space-y-2">
              <span class="text-xs font-bold uppercase tracking-[0.2em] text-pink-300 flex items-center gap-2">
                <i class="fa-solid fa-tower-broadcast animate-pulse"></i> Phòng Đang Chờ Người Chơi
              </span>
              <p class="text-sm text-slate-300">
                Các em học sinh truy cập trang web hoặc quét mã QR bên cạnh và nhập mã PIN:
              </p>
            </div>

            <div class="my-6">
              <div class="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">MÃ PIN ĐẤU TRƯỜNG</div>
              <div class="text-5xl sm:text-7xl font-black tracking-[0.25em] text-amber-400 select-all font-mono drop-shadow-[0_10px_20px_rgba(245,158,11,0.3)]">
                ${room.pin}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button id="btn-copy-join-link" class="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-bold transition flex items-center gap-2 border border-white/20">
                <i class="fa-regular fa-copy"></i> Copy Link Trực Tiếp (?game=${room.pin})
              </button>
              
              <button id="btn-host-start-game" class="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-black text-sm tracking-wide transition shadow-xl shadow-emerald-500/30 flex items-center gap-2 hover:scale-[1.03] active:scale-[0.98]">
                <i class="fa-solid fa-play"></i> BẮT ĐẦU TRẬN ĐẤU NGAY (${players.length} HS)
              </button>
            </div>
          </div>

          <!-- Cột Phải: QR Code quét vào phòng tức thì -->
          <div class="md:col-span-4 bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xl flex flex-col items-center justify-center text-center space-y-4">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <i class="fa-solid fa-qrcode text-purple-600"></i> Quét Mã Bằng Điện Thoại
            </span>
            <div class="p-3 bg-white rounded-2xl shadow-inner border border-slate-200">
              <img src="${qrUrl}" alt="QR Code" class="w-44 h-44 object-contain" />
            </div>
            <p class="text-[11px] text-slate-400">Bật Camera điện thoại quét để vào đấu trường ngay lập tức</p>
          </div>
        </div>

        <!-- Danh Sách Blooks Học Sinh Đang Ở Phòng Chờ -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h4 class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-users text-purple-600"></i> Học Sinh Đã Tham Gia (<span id="host-lobby-count">${players.length}</span>)
            </h4>
            <span class="text-xs text-slate-400">Tự động đồng bộ thời gian thực...</span>
          </div>

          <div id="host-lobby-players-grid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            ${players.length === 0 ? `
              <div class="col-span-full py-12 text-center text-slate-400 text-xs">
                <i class="fa-solid fa-hourglass-start text-3xl mb-2 text-purple-400 animate-spin"></i>
                <p>Đang chờ các em học sinh nhập mã PIN vào phòng đấu trường...</p>
              </div>
            ` : players.map(p => {
              const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
              return `
                <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2 animate-scaleUp">
                  <div class="w-12 h-12 rounded-xl bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-xl shadow-sm animate-bounce">
                    <i class="fa-solid ${blook.icon}"></i>
                  </div>
                  <span class="text-xs font-bold text-slate-800 dark:text-white truncate w-full text-center">${escapeHtml(p.name)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    // Event listeners
    const btnExit = document.getElementById('btn-host-exit-room');
    if (btnExit) {
      btnExit.onclick = () => {
        if (confirm('Thầy/Cô có chắc chắn muốn đóng phòng đấu trường này không?')) {
          this.cleanupRoomListener();
          this.renderMainView();
        }
      };
    }

    const btnCopy = document.getElementById('btn-copy-join-link');
    if (btnCopy) {
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(joinUrl);
        alert(`Đã copy link đấu trường: ${joinUrl}`);
      };
    }

    const btnStart = document.getElementById('btn-host-start-game');
    if (btnStart) {
      btnStart.onclick = () => {
        this.hostStartNextQuestion();
      };
    }

    const btnFullscreen = document.getElementById('btn-host-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }

    const btnSound = document.getElementById('arena-btn-toggle-sound');
    if (btnSound) btnSound.onclick = () => this.toggleMute();
  },

  // ==========================================
  // 5. MÀN HÌNH CÂU HỎI & GAMEPLAY HOST
  // ==========================================
  hostStartNextQuestion() {
    this.currentQuestionIndex++;
    if (this.currentQuestionIndex >= this.activeRoom.totalQuestions) {
      this.hostFinishGame();
      return;
    }

    const room = this.activeRoom;
    const q = room.questions[this.currentQuestionIndex];
    room.status = 'playing';
    room.currentQuestionIndex = this.currentQuestionIndex;
    room.updatedAt = Date.now();

    // Reset lượt trả lời của người chơi trong câu này
    Object.values(room.players || {}).forEach(p => {
      p.currentAnswer = null;
      p.answeredInCurrentQ = false;
    });

    this.syncRoomToCloud(room);
    this.renderHostQuestionView(q);
  },

  renderHostQuestionView(q) {
    const room = this.activeRoom;
    let timeLeft = room.timerPerQuestion || 20;
    const qIdx = this.currentQuestionIndex + 1;
    const totalQ = room.totalQuestions;

    this.initAudio();
    this.playTone(440, 0.1, 'sine');

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn pb-12">
        <!-- Top bar Gameplay -->
        <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs font-black">
              Câu ${qIdx} / ${totalQ}
            </span>
            <span class="text-xs font-bold text-slate-500">${this.getModeTitle(room.gameMode)}</span>
          </div>

          <div class="flex items-center gap-3">
            <!-- Đồng hồ đếm ngược to rõ -->
            <div id="host-timer-badge" class="px-4 py-1.5 rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono text-lg font-black flex items-center gap-2">
              <i class="fa-regular fa-clock"></i> <span id="host-timer-text">${timeLeft}s</span>
            </div>

            <button id="btn-host-skip-q" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition">
              Bỏ Qua ➔
            </button>
          </div>
        </div>

        <!-- Gameplay Visual Theo Chế Độ (Gold / Boss / Speed) -->
        ${room.gameMode === 'boss_raid' ? `
          <!-- Thanh Máu Siêu Trùm Boss -->
          <div class="p-6 rounded-3xl bg-slate-900 border-2 border-rose-500/50 shadow-2xl text-white space-y-3 relative overflow-hidden">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-2xl shadow-lg shadow-rose-500/40 animate-pulse">
                  👾
                </div>
                <div>
                  <h4 class="text-base font-black text-rose-300">Siêu Trùm Bug Quái Khổng Lồ</h4>
                  <p class="text-xs text-slate-400">Mỗi câu trả lời đúng của học sinh sẽ bắn một chưởng sát thương vào Boss!</p>
                </div>
              </div>
              <div class="text-right">
                <span id="host-boss-hp-text" class="text-xl font-black text-rose-400 font-mono">${room.bossCurrentHp} / ${room.bossMaxHp} HP</span>
              </div>
            </div>

            <!-- Health Bar -->
            <div class="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-rose-500/30">
              <div id="host-boss-hp-fill" class="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300" style="width: ${(room.bossCurrentHp / room.bossMaxHp) * 100}%"></div>
            </div>
          </div>
        ` : ''}

        <!-- Nội Dung Câu Hỏi (Màn hình máy chiếu) -->
        <div class="bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 text-white rounded-3xl p-8 sm:p-12 shadow-2xl border border-white/10 text-center min-h-[220px] flex items-center justify-center">
          <h2 class="text-xl sm:text-3xl font-black leading-relaxed max-w-4xl mx-auto">
            ${escapeHtml(q.question)}
          </h2>
        </div>

        <!-- 4 Phương Án A, B, C, D (Màu sắc chuẩn Wayground / Blooket) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${(q.options || ['A', 'B', 'C', 'D']).slice(0, 4).map((opt, idx) => {
            const colors = [
              { bg: 'bg-rose-600', ring: 'ring-rose-400', icon: 'fa-diamond', label: 'A' },
              { bg: 'bg-blue-600', ring: 'ring-blue-400', icon: 'fa-circle', label: 'B' },
              { bg: 'bg-amber-500', ring: 'ring-amber-300', icon: 'fa-square', label: 'C' },
              { bg: 'bg-emerald-600', ring: 'ring-emerald-400', icon: 'fa-play rotate-90', label: 'D' }
            ];
            const c = colors[idx] || colors[0];
            return `
              <div class="${c.bg} text-white p-5 rounded-3xl shadow-lg flex items-center gap-4 text-left transition transform hover:scale-[1.01]">
                <div class="w-10 h-10 rounded-2xl bg-black/20 flex items-center justify-center text-lg font-black shrink-0">
                  ${c.label}
                </div>
                <span class="text-sm sm:text-base font-bold flex-1 leading-snug">${escapeHtml(opt)}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Ticker Tin Tức Trực Tiếp & Số Lượng Nộp Bài -->
        <div class="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          <div id="host-live-ticker" class="text-slate-500 dark:text-slate-400 truncate max-w-lg">
            <i class="fa-solid fa-bullhorn text-amber-500 mr-1.5"></i> Trận đấu đang diễn ra! Học sinh đang bấm chọn đáp án trên điện thoại...
          </div>
          <div class="font-bold text-slate-800 dark:text-white shrink-0">
            Đã nộp: <span id="host-answered-count" class="text-purple-600 font-mono text-sm">0</span> / ${Object.keys(room.players || {}).length}
          </div>
        </div>
      </div>
    `;

    // Countdown Timer Loop
    if (this.gameTimer) clearInterval(this.gameTimer);
    this.gameTimer = setInterval(() => {
      timeLeft--;
      const textEl = document.getElementById('host-timer-text');
      if (textEl) textEl.textContent = `${timeLeft}s`;

      if (timeLeft <= 5 && timeLeft > 0) {
        this.playTick();
        const badge = document.getElementById('host-timer-badge');
        if (badge) badge.className = 'px-4 py-1.5 rounded-2xl bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-mono text-lg font-black flex items-center gap-2 animate-pulse';
      }

      if (timeLeft <= 0) {
        clearInterval(this.gameTimer);
        this.hostRevealQuestionResults();
      }
    }, 1000);

    const btnSkip = document.getElementById('btn-host-skip-q');
    if (btnSkip) {
      btnSkip.onclick = () => {
        clearInterval(this.gameTimer);
        this.hostRevealQuestionResults();
      };
    }
  },

  // ==========================================
  // 6. CÔNG BỐ ĐÁP ÁN & BẢNG ĐIỂM SAU CÂU HỎI
  // ==========================================
  hostRevealQuestionResults() {
    const room = this.activeRoom;
    const q = room.questions[this.currentQuestionIndex];
    room.status = 'question_result';
    room.updatedAt = Date.now();
    this.syncRoomToCloud(room);

    // Tính toán phân bổ câu trả lời A, B, C, D
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const players = Object.values(room.players || {});
    players.forEach(p => {
      if (p.currentAnswer !== null && p.currentAnswer !== undefined) {
        counts[p.currentAnswer] = (counts[p.currentAnswer] || 0) + 1;
      }
    });

    // Xác định đáp án đúng
    let correctIdx = 0;
    if (typeof q.answer === 'number') correctIdx = q.answer;
    else if (typeof q.answer === 'string') {
      const char = q.answer.trim().toUpperCase()[0];
      correctIdx = ['A', 'B', 'C', 'D'].indexOf(char);
      if (correctIdx === -1) correctIdx = 0;
    }

    // Leaderboard Top 5 hiện tại
    const topPlayers = [...players].sort((a, b) => {
      if (room.gameMode === 'gold_quest') return (b.gold || 0) - (a.gold || 0);
      return (b.score || 0) - (a.score || 0);
    }).slice(0, 5);

    this.playTone(800, 0.25, 'triangle');

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn pb-12">
        <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span class="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
            <i class="fa-solid fa-check-circle"></i> Kết Quả Câu ${this.currentQuestionIndex + 1} / ${room.totalQuestions}
          </span>

          <button id="btn-host-next-q" class="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition shadow-md flex items-center gap-2">
            ${this.currentQuestionIndex + 1 >= room.totalQuestions ? 'Xem Bục Vinh Danh Podium ➔' : 'Câu Tiếp Theo ➔'}
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- Cột Trái (lg:col-span-7): Thống kê câu trả lời của lớp -->
          <div class="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
            <div>
              <span class="text-[11px] font-bold uppercase text-slate-400">Đáp Án Chính Xác</span>
              <h3 class="text-lg font-black text-slate-800 dark:text-white mt-0.5">${escapeHtml(q.question)}</h3>
            </div>

            <!-- Biểu đồ phân bổ 4 phương án -->
            <div class="space-y-2.5">
              ${(q.options || ['A', 'B', 'C', 'D']).slice(0, 4).map((opt, idx) => {
                const isCorrect = idx === correctIdx;
                const count = counts[idx] || 0;
                const pct = players.length > 0 ? Math.round((count / players.length) * 100) : 0;
                return `
                  <div class="p-3 rounded-2xl border-2 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200' : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'} flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <span class="w-7 h-7 rounded-lg ${isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700'} flex items-center justify-center font-black text-xs">
                        ${String.fromCharCode(65 + idx)}
                      </span>
                      <span class="text-xs font-bold">${escapeHtml(opt)} ${isCorrect ? '✅' : ''}</span>
                    </div>
                    <div class="text-right shrink-0">
                      <span class="text-xs font-black">${count} HS (${pct}%)</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${q.explanation ? `
              <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                💡 <b>Giải thích chi tiết:</b> ${escapeHtml(q.explanation)}
              </div>
            ` : ''}
          </div>

          <!-- Cột Phải (lg:col-span-5): Leaderboard Top 5 -->
          <div class="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h4 class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-trophy text-amber-500"></i> Bảng Xếp Hạng Top 5
              </h4>
              <span class="text-[11px] text-slate-400">${room.gameMode === 'gold_quest' ? 'Vàng 🪙' : 'Điểm ⚡'}</span>
            </div>

            <div class="space-y-2">
              ${topPlayers.map((p, idx) => {
                const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
                const val = room.gameMode === 'gold_quest' ? `${p.gold || 0} 🪙` : `${p.score || 0} đ`;
                return `
                  <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                      <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-amber-400 text-slate-900 font-black' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700'} text-xs flex items-center justify-center font-bold">
                        ${idx + 1}
                      </span>
                      <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-sm shadow-xs">
                        <i class="fa-solid ${blook.icon}"></i>
                      </div>
                      <span class="text-xs font-bold text-slate-800 dark:text-white">${escapeHtml(p.name)}</span>
                    </div>
                    <span class="text-xs font-black text-purple-600 dark:text-purple-400 font-mono">${val}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    const btnNext = document.getElementById('btn-host-next-q');
    if (btnNext) {
      btnNext.onclick = () => {
        this.hostStartNextQuestion();
      };
    }
  },

  // ==========================================
  // 7. KẾT THÚC TRẬN ĐẤU & BỤC VINH DANH PODIUM (LMS INTEGRATION)
  // ==========================================
  hostFinishGame() {
    const room = this.activeRoom;
    room.status = 'game_over';
    room.updatedAt = Date.now();
    this.syncRoomToCloud(room);

    this.playFanfare();

    // Sắp xếp thứ hạng toàn bộ học sinh
    const sortedPlayers = Object.values(room.players || {}).sort((a, b) => {
      if (room.gameMode === 'gold_quest') return (b.gold || 0) - (a.gold || 0);
      return (b.score || 0) - (a.score || 0);
    });

    const top1 = sortedPlayers[0] || null;
    const top2 = sortedPlayers[1] || null;
    const top3 = sortedPlayers[2] || null;

    // Tính toán số liệu phân tích LMS
    const totalAnswers = sortedPlayers.reduce((acc, p) => acc + (p.correctCount || 0), 0);
    const maxPossibleAnswers = sortedPlayers.length * room.totalQuestions;
    const accuracyPct = maxPossibleAnswers > 0 ? Math.round((totalAnswers / maxPossibleAnswers) * 100) : 0;

    // Lưu vào lịch sử đấu trường
    Storage.saveArenaHistory({
      pin: room.pin,
      title: room.title,
      gameMode: room.gameMode,
      totalQuestions: room.totalQuestions,
      playersCount: sortedPlayers.length,
      accuracyPct,
      topPlayers: sortedPlayers.slice(0, 10)
    });

    this.container.innerHTML = `
      <div class="space-y-8 animate-fadeIn pb-16">
        
        <!-- Bục Vinh Danh Podium 3D (Gold, Silver, Bronze) -->
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-purple-950 text-white p-8 sm:p-12 shadow-2xl border border-white/10 text-center">
          <div class="space-y-2 mb-8">
            <span class="text-xs font-bold uppercase tracking-[0.25em] text-amber-300">
              🏆 BẢNG VINH DANH NHÀ VÔ ĐỊCH
            </span>
            <h2 class="text-2xl sm:text-4xl font-black">${escapeHtml(room.title)}</h2>
            <p class="text-xs text-slate-300">Chúc mừng tất cả các dũng sĩ Blooks đã hoàn thành xuất sắc trận đấu!</p>
          </div>

          <!-- Podium Grid -->
          <div class="flex items-end justify-center gap-3 sm:gap-6 max-w-xl mx-auto pt-8 pb-4">
            
            <!-- Top 2: Bạc -->
            ${top2 ? `
              <div class="flex flex-col items-center flex-1 animate-scaleUp">
                <div class="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-300 to-slate-400 text-slate-900 flex items-center justify-center text-2xl shadow-lg shadow-white/10 mb-2">
                  🥈
                </div>
                <span class="text-xs font-bold truncate max-w-[100px]">${escapeHtml(top2.name)}</span>
                <span class="text-[10px] text-slate-400 font-mono mb-2">${room.gameMode === 'gold_quest' ? `${top2.gold || 0} 🪙` : `${top2.score || 0} đ`}</span>
                <div class="w-full h-28 bg-gradient-to-t from-slate-700 to-slate-600 rounded-t-2xl flex items-center justify-center font-black text-xl text-slate-300 border-t-2 border-slate-400 shadow-md">
                  #2
                </div>
              </div>
            ` : '<div class="flex-1"></div>'}

            <!-- Top 1: Vàng (Cao nhất) -->
            ${top1 ? `
              <div class="flex flex-col items-center flex-1 animate-scaleUp">
                <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-300 to-yellow-500 text-slate-950 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/40 mb-2 animate-bounce">
                  👑
                </div>
                <span class="text-sm font-black truncate max-w-[120px] text-amber-300">${escapeHtml(top1.name)}</span>
                <span class="text-xs text-amber-400 font-mono font-bold mb-2">${room.gameMode === 'gold_quest' ? `${top1.gold || 0} 🪙` : `${top1.score || 0} đ`}</span>
                <div class="w-full h-40 bg-gradient-to-t from-amber-600 to-yellow-500 rounded-t-2xl flex items-center justify-center font-black text-3xl text-slate-950 border-t-4 border-amber-200 shadow-2xl">
                  #1
                </div>
              </div>
            ` : ''}

            <!-- Top 3: Đồng -->
            ${top3 ? `
              <div class="flex flex-col items-center flex-1 animate-scaleUp">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-700 to-amber-800 text-white flex items-center justify-center text-xl shadow-md mb-2">
                  🥉
                </div>
                <span class="text-xs font-bold truncate max-w-[90px]">${escapeHtml(top3.name)}</span>
                <span class="text-[10px] text-slate-400 font-mono mb-2">${room.gameMode === 'gold_quest' ? `${top3.gold || 0} 🪙` : `${top3.score || 0} đ`}</span>
                <div class="w-full h-20 bg-gradient-to-t from-amber-900 to-amber-800 rounded-t-2xl flex items-center justify-center font-black text-lg text-amber-300 border-t-2 border-amber-600 shadow-md">
                  #3
                </div>
              </div>
            ` : '<div class="flex-1"></div>'}
          </div>
        </div>

        <!-- LMS Báo Cáo Sư Phạm & Hành Động Của Giáo Viên -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xl space-y-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div>
              <span class="text-[11px] font-bold uppercase text-emerald-600 flex items-center gap-1.5">
                <i class="fa-solid fa-graduation-cap"></i> Phân Tích Sư Phạm & Sổ Điểm LMS
              </span>
              <h3 class="text-base font-black text-slate-800 dark:text-white mt-0.5">Báo Cáo Kết Quả Thi Đấu Của Lớp</h3>
            </div>

            <!-- Cụm Action Button LMS -->
            <div class="flex items-center gap-2.5 flex-wrap">
              <button id="btn-arena-save-gradebook" class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition shadow-sm flex items-center gap-2">
                <i class="fa-solid fa-floppy-disk"></i> Lưu Vào Sổ Điểm Lớp
              </button>
              
              <button id="btn-arena-export-excel" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition flex items-center gap-2">
                <i class="fa-solid fa-file-excel text-emerald-600"></i> Xuất Báo Cáo Excel
              </button>

              <button id="btn-arena-play-again" class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 transition">
                Về Trang Chủ Đấu Trường
              </button>
            </div>
          </div>

          <!-- Thống Kê Nhanh (KPI Cards) -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span class="text-[11px] text-slate-400 font-bold block">Tổng Người Chơi</span>
              <span class="text-2xl font-black text-slate-800 dark:text-white mt-0.5 block">${sortedPlayers.length} HS</span>
            </div>
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span class="text-[11px] text-slate-400 font-bold block">Độ Chính Xác Lớp</span>
              <span class="text-2xl font-black text-emerald-600 mt-0.5 block">${accuracyPct}%</span>
            </div>
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span class="text-[11px] text-slate-400 font-bold block">Tổng Số Câu Hỏi</span>
              <span class="text-2xl font-black text-blue-600 mt-0.5 block">${room.totalQuestions} câu</span>
            </div>
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <span class="text-[11px] text-slate-400 font-bold block">Chế Độ Chơi</span>
              <span class="text-sm font-black text-purple-600 mt-2 block truncate">${this.getModeTitle(room.gameMode)}</span>
            </div>
          </div>

          <!-- Bảng Chi Tiết Điểm Từng Học Sinh -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-bold uppercase tracking-wider">
                  <th class="py-2.5 px-3">Hạng</th>
                  <th class="py-2.5 px-3">Linh Thú Blook</th>
                  <th class="py-2.5 px-3">Họ và Tên Học Sinh</th>
                  <th class="py-2.5 px-3">Số Câu Đúng</th>
                  <th class="py-2.5 px-3">Độ Chính Xác</th>
                  <th class="py-2.5 px-3 text-right">Tổng Vàng / Điểm</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700/60">
                ${sortedPlayers.map((p, idx) => {
                  const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
                  const cCount = p.correctCount || 0;
                  const pPct = Math.round((cCount / room.totalQuestions) * 100);
                  const val = room.gameMode === 'gold_quest' ? `${p.gold || 0} 🪙` : `${p.score || 0} đ`;
                  return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                      <td class="py-3 px-3 font-black text-slate-700 dark:text-slate-300">#${idx + 1}</td>
                      <td class="py-3 px-3">
                        <div class="w-8 h-8 rounded-lg bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-sm shadow-xs">
                          <i class="fa-solid ${blook.icon}"></i>
                        </div>
                      </td>
                      <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">
                        ${escapeHtml(p.name)}
                      </td>
                      <td class="py-3 px-3 font-bold text-indigo-600">
                        ${cCount} / ${room.totalQuestions}
                      </td>
                      <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${pPct >= 80 ? 'bg-emerald-100 text-emerald-800' : pPct >= 50 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}">
                          ${pPct}%
                        </span>
                      </td>
                      <td class="py-3 px-3 text-right font-black font-mono text-purple-600 dark:text-purple-400">
                        ${val}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Action: Lưu vào Sổ Điểm
    const btnSaveGb = document.getElementById('btn-arena-save-gradebook');
    if (btnSaveGb) {
      btnSaveGb.onclick = () => {
        this.saveMatchToLmsGradebook(room, sortedPlayers);
      };
    }

    // Action: Xuất Excel
    const btnExport = document.getElementById('btn-arena-export-excel');
    if (btnExport) {
      btnExport.onclick = () => {
        this.exportMatchToExcel(room, sortedPlayers);
      };
    }

    // Action: Chơi lại
    const btnPlayAgain = document.getElementById('btn-arena-play-again');
    if (btnPlayAgain) {
      btnPlayAgain.onclick = () => {
        this.cleanupRoomListener();
        this.renderMainView();
      };
    }
  },

  // ==========================================
  // 8. LMS GRADEBOOK & EXCEL EXPORT HELPERS
  // ==========================================
  saveMatchToLmsGradebook(room, sortedPlayers) {
    if (!sortedPlayers || sortedPlayers.length === 0) {
      alert('Không có học sinh nào trong trận đấu để lưu sổ điểm!');
      return;
    }

    // Phân tích targetClass (ví dụ: 'EMASI|10E')
    let school = 'TinHocHub';
    let className = 'Toàn Trường';
    if (room.targetClass && room.targetClass.includes('|')) {
      const parts = room.targetClass.split('|');
      school = parts[0];
      className = parts[1];
    }

    let savedCount = 0;
    sortedPlayers.forEach(p => {
      const score10 = Number((( (p.correctCount || 0) / room.totalQuestions ) * 10).toFixed(2));
      const examResult = {
        id: `arena_${room.pin}_${p.uid || Date.now()}`,
        examTitle: `[Đấu Trường ${this.getModeTitle(room.gameMode)}] ${room.title}`,
        grade: '12',
        score: score10,
        maxScore: 10.0,
        correctCount: p.correctCount || 0,
        totalQuestions: room.totalQuestions,
        completedAt: new Date().toISOString(),
        studentName: p.name,
        studentEmail: p.email || `${p.name.toLowerCase().replace(/\s+/g, '')}@student.edu.vn`,
        school: p.school || school,
        className: p.className || className,
        isArenaGame: true,
        gameMode: room.gameMode,
        arenaPin: room.pin,
        blookName: (this.BLOOKS.find(b => b.id === p.blookId) || {}).name || 'Blook'
      };

      Storage.saveExamResult(examResult);
      if (typeof CloudSync !== 'undefined' && CloudSync.pushExamResultToCloud) {
        CloudSync.pushExamResultToCloud(examResult);
      }
      savedCount++;
    });

    alert(`🎉 ĐÃ LƯU THÀNH CÔNG VÀO SỔ ĐIỂM!
Đã ghi nhận điểm số của ${savedCount} học sinh vào hệ thống LMS Sổ Điểm Lớp.`);
  },

  exportMatchToExcel(room, sortedPlayers) {
    const rows = [
      ['BÁO CÁO KẾT QUẢ ĐẤU TRƯỜNG GAME TRÍ TUỆ - TINHOCHUB ARENA'],
      ['Tên trận đấu:', room.title],
      ['Chế độ game:', this.getModeTitle(room.gameMode)],
      ['Mã PIN:', room.pin],
      ['Ngày thi đấu:', new Date(room.createdAt).toLocaleString('vi-VN')],
      ['Tổng số câu hỏi:', room.totalQuestions],
      ['Tổng số học sinh:', sortedPlayers.length],
      [],
      ['Hạng', 'Họ và Tên Học Sinh', 'Linh Thú Blook', 'Số Câu Đúng', 'Tổng Số Câu', 'Độ Chính Xác (%)', 'Điểm Hệ Số 10', 'Tổng Vàng / Điểm Game']
    ];

    sortedPlayers.forEach((p, idx) => {
      const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
      const cCount = p.correctCount || 0;
      const pct = Math.round((cCount / room.totalQuestions) * 100);
      const score10 = ((cCount / room.totalQuestions) * 10).toFixed(2);
      const val = room.gameMode === 'gold_quest' ? (p.gold || 0) : (p.score || 0);

      rows.push([
        idx + 1,
        p.name,
        blook.name,
        cCount,
        room.totalQuestions,
        `${pct}%`,
        score10,
        val
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Bao_Cao_Dau_Truong_${room.pin}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // ==========================================
  // 9. MÀN HÌNH HỌC SINH (PLAYER CONTROLLER - MOBILE/PC)
  // ==========================================
  async joinArenaByPin(pin, studentName = null, blookId = 'bot') {
    pin = pin.trim();
    const dbUrl = this.getBaseDbUrl();

    // Lấy thông tin phòng từ Firebase hoặc Storage
    let room = null;
    try {
      const res = await fetch(`${dbUrl}/arena_rooms/${pin}.json`, { cache: 'no-cache' });
      if (res.ok) room = await res.json();
    } catch {}

    if (!room) room = Storage.getArenaRoom(pin);

    if (!room) {
      alert(`Không tìm thấy phòng đấu trường có mã PIN [${pin}]. Vui lòng kiểm tra lại!`);
      return;
    }

    const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const finalName = studentName || currentUser?.fullName || 'Học sinh ẩn danh';
    const uid = (currentUser?.email || currentUser?.username || `player_${Date.now()}`).replace(/[.#$\[\]\/]/g, '_');

    this.playerInfo = {
      uid,
      name: finalName,
      blookId,
      email: currentUser?.email || '',
      school: currentUser?.school || '',
      className: currentUser?.className || '',
      gold: 0,
      score: 0,
      streak: 0,
      correctCount: 0,
      hasShield: false,
      shieldCount: 0
    };

    this.activeRoom = room;
    this.activeRole = 'player';

    // Đăng ký người chơi vào Firebase
    try {
      await fetch(`${dbUrl}/arena_rooms/${pin}/players/${uid}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.playerInfo)
      });
    } catch {}

    // Lắng nghe cập nhật phòng
    this.listenToRoomUpdates(pin);
    this.renderPlayerLobby();
  },

  renderPlayerLobby() {
    const room = this.activeRoom;
    const blook = this.BLOOKS.find(b => b.id === this.playerInfo.blookId) || this.BLOOKS[0];

    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-8 animate-fadeIn">
        <div class="p-8 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl space-y-5">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <i class="fa-solid fa-circle-check"></i> Đã Tham Gia Phòng
          </div>

          <!-- Blook Bouncing Animation -->
          <div class="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-4xl shadow-xl shadow-purple-500/20 animate-bounce">
            <i class="fa-solid ${blook.icon}"></i>
          </div>

          <div>
            <h3 class="text-xl font-black text-slate-800 dark:text-white">${escapeHtml(this.playerInfo.name)}</h3>
            <p class="text-xs font-bold text-purple-600 dark:text-purple-400 mt-0.5">Linh Thú: ${escapeHtml(blook.name)}</p>
          </div>

          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 space-y-1">
            <span class="text-[11px] text-slate-400 font-bold uppercase block">Đấu Trường</span>
            <strong class="text-sm text-slate-800 dark:text-white block">${escapeHtml(room.title)}</strong>
            <span class="text-xs text-amber-600 dark:text-amber-400 font-bold block">${this.getModeTitle(room.gameMode)}</span>
          </div>

          <div class="py-2 text-xs text-slate-400 flex items-center justify-center gap-2">
            <i class="fa-solid fa-spinner fa-spin text-purple-600"></i> Hãy nhìn lên máy chiếu của Thầy/Cô, trận đấu sắp bắt đầu!
          </div>

          <button id="btn-player-leave-room" class="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 text-xs font-bold transition">
            Rời Phòng
          </button>
        </div>
      </div>
    `;

    const btnLeave = document.getElementById('btn-player-leave-room');
    if (btnLeave) {
      btnLeave.onclick = () => {
        if (confirm('Em có chắc chắn muốn rời phòng đấu trường không?')) {
          this.cleanupRoomListener();
          this.renderMainView();
        }
      };
    }
  },

  renderPlayerQuestionView(q) {
    const room = this.activeRoom;
    const blook = this.BLOOKS.find(b => b.id === this.playerInfo.blookId) || this.BLOOKS[0];
    const qIdx = (room.currentQuestionIndex || 0) + 1;

    this.container.innerHTML = `
      <div class="max-w-lg mx-auto space-y-4 py-4 animate-fadeIn">
        
        <!-- Top Stats Bar Mobile -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-xs">
              <i class="fa-solid ${blook.icon}"></i>
            </div>
            <span class="text-xs font-black text-slate-800 dark:text-white truncate max-w-[120px]">${escapeHtml(this.playerInfo.name)}</span>
          </div>

          <div class="flex items-center gap-3 font-mono font-bold text-xs">
            ${room.gameMode === 'gold_quest' ? `
              <span class="text-amber-500 font-black"><i class="fa-solid fa-coins mr-1"></i>${this.playerInfo.gold || 0}</span>
            ` : `
              <span class="text-purple-600 font-black"><i class="fa-solid fa-bolt mr-1"></i>${this.playerInfo.score || 0} đ</span>
            `}
            <span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">Câu ${qIdx}</span>
          </div>
        </div>

        <!-- Nội Dung Câu Hỏi Trên Máy Học Sinh -->
        <div class="p-5 rounded-3xl bg-slate-900 text-white text-center shadow-lg border border-white/10 min-h-[90px] flex items-center justify-center">
          <p class="text-sm sm:text-base font-bold leading-relaxed">${escapeHtml(q.question)}</p>
        </div>

        <!-- 4 Nút Bấm Lớn Màu Sắc Cảm Ứng Nhạy (A, B, C, D) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          ${(q.options || ['A', 'B', 'C', 'D']).slice(0, 4).map((opt, idx) => {
            const colors = [
              { bg: 'bg-rose-600 active:bg-rose-700', label: 'A' },
              { bg: 'bg-blue-600 active:bg-blue-700', label: 'B' },
              { bg: 'bg-amber-500 active:bg-amber-600', label: 'C' },
              { bg: 'bg-emerald-600 active:bg-emerald-700', label: 'D' }
            ];
            const c = colors[idx] || colors[0];
            return `
              <button type="button" data-player-ans="${idx}" class="${c.bg} text-white p-4 sm:p-5 rounded-3xl shadow-lg font-bold text-left flex items-center gap-3 transition transform active:scale-95 touch-manipulation">
                <span class="w-8 h-8 rounded-xl bg-black/25 flex items-center justify-center text-sm font-black shrink-0">
                  ${c.label}
                </span>
                <span class="text-xs sm:text-sm leading-snug flex-1">${escapeHtml(opt)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Click chọn đáp án
    this.container.querySelectorAll('[data-player-ans]').forEach(btn => {
      btn.onclick = () => {
        const ansIdx = parseInt(btn.getAttribute('data-player-ans'), 10);
        this.playerSubmitAnswer(ansIdx, q);
      };
    });
  },

  async playerSubmitAnswer(ansIdx, q) {
    if (this.playerInfo.answeredInCurrentQ) return;
    this.playerInfo.answeredInCurrentQ = true;
    this.playerInfo.currentAnswer = ansIdx;

    if (navigator.vibrate) navigator.vibrate([40]);

    // Kiểm tra đúng/sai
    let isCorrect = false;
    let correctIdx = 0;
    if (typeof q.answer === 'number') correctIdx = q.answer;
    else if (typeof q.answer === 'string') {
      const char = q.answer.trim().toUpperCase()[0];
      correctIdx = ['A', 'B', 'C', 'D'].indexOf(char);
      if (correctIdx === -1) correctIdx = 0;
    }
    isCorrect = (ansIdx === correctIdx);

    const room = this.activeRoom;
    const dbUrl = this.getBaseDbUrl();

    if (isCorrect) {
      this.playChime();
      this.playerInfo.streak = (this.playerInfo.streak || 0) + 1;
      this.playerInfo.correctCount = (this.playerInfo.correctCount || 0) + 1;

      // Cộng điểm theo chế độ
      if (room.gameMode === 'speed_racer' || room.gameMode === 'classic') {
        const bonus = Math.min(3, 1 + (this.playerInfo.streak * 0.2));
        const pts = Math.round(500 * bonus);
        this.playerInfo.score = (this.playerInfo.score || 0) + pts;
      } else if (room.gameMode === 'boss_raid') {
        // Gây sát thương lên Boss
        const dmg = Math.floor(100 + Math.random() * 80);
        room.bossCurrentHp = Math.max(0, (room.bossCurrentHp || 1000) - dmg);
        this.playBossHit();
      }

      // Đẩy cập nhật lên Firebase
      try {
        await fetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: this.playerInfo.score,
            streak: this.playerInfo.streak,
            correctCount: this.playerInfo.correctCount,
            currentAnswer: ansIdx
          })
        });

        if (room.gameMode === 'boss_raid') {
          await fetch(`${dbUrl}/arena_rooms/${room.pin}/bossCurrentHp.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(room.bossCurrentHp)
          });
        }
      } catch {}

      // Nếu là chế độ Gold Quest -> Mở màn hình 3 Rương Báu
      if (room.gameMode === 'gold_quest') {
        this.renderPlayerChestChoice();
      } else {
        this.renderPlayerFeedback(true, 'Chính xác! Xuất sắc lắm!');
      }

    } else {
      this.playWrong();
      this.playerInfo.streak = 0;
      try {
        await fetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streak: 0,
            currentAnswer: ansIdx
          })
        });
      } catch {}

      this.renderPlayerFeedback(false, 'Chưa chính xác rồi! Cố gắng ở câu tiếp theo nhé.');
    }
  },

  renderPlayerChestChoice() {
    this.playChest();
    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-6 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-yellow-600 text-white shadow-2xl space-y-4">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 text-xs font-bold uppercase tracking-wider">
            🎉 Trả Lời Đúng!
          </div>
          <h3 class="text-xl font-black">CHỌN 1 TRONG 3 RƯƠNG BÁU</h3>
          <p class="text-xs text-white/90">Mở rương để nhận Vàng, Nhân đôi số vàng hoặc Cướp vàng của bạn khác!</p>

          <!-- 3 Rương Báu -->
          <div class="grid grid-cols-3 gap-3 pt-4">
            ${[1, 2, 3].map(n => `
              <button type="button" data-pick-chest="${n}" class="p-4 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex flex-col items-center gap-2 transition transform hover:scale-105 active:scale-95 shadow-lg">
                <span class="text-4xl animate-bounce">📦</span>
                <span class="text-xs font-black uppercase">Rương ${n}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-pick-chest]').forEach(btn => {
      btn.onclick = () => {
        this.playerOpenChestReward();
      };
    });
  },

  async playerOpenChestReward() {
    // Các phần thưởng rương báu
    const rewards = [
      { type: 'gold', val: 25, text: '+25 Vàng 🪙' },
      { type: 'gold', val: 50, text: '+50 Vàng 🪙' },
      { type: 'gold', val: 100, text: '+100 Vàng Đại Thắng! 🪙' },
      { type: 'double', text: 'Nhân Đôi x2 Toàn Bộ Số Vàng! 🔥' },
      { type: 'shield', text: 'Nhận Khiên Thần (Bảo Vệ Chống Cướp)! 🛡️' },
      { type: 'steal', text: 'Cướp 20% Vàng Của Bạn Khác! ⚡' }
    ];
    const picked = rewards[Math.floor(Math.random() * rewards.length)];

    const room = this.activeRoom;
    const dbUrl = this.getBaseDbUrl();

    if (picked.type === 'gold') {
      this.playerInfo.gold = (this.playerInfo.gold || 0) + picked.val;
      this.playTone(880, 0.25, 'sine');
    } else if (picked.type === 'double') {
      this.playerInfo.gold = Math.max(20, (this.playerInfo.gold || 10) * 2);
      this.playTone(987, 0.35, 'triangle');
    } else if (picked.type === 'shield') {
      this.playerInfo.hasShield = true;
      this.playerInfo.shieldCount = 3;
    }

    // Đẩy vàng lên Firebase
    try {
      await fetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gold: this.playerInfo.gold,
          hasShield: this.playerInfo.hasShield
        })
      });
    } catch {}

    if (picked.type === 'steal') {
      this.renderPlayerStealTargetPicker();
    } else {
      this.renderPlayerFeedback(true, `Rương báu mở ra: ${picked.text}`);
    }
  },

  renderPlayerStealTargetPicker() {
    const room = this.activeRoom;
    const otherPlayers = Object.values(room.players || {}).filter(p => p.uid !== this.playerInfo.uid);

    this.playSteal();

    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-5 py-6 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-2xl border border-white/10 space-y-4">
          <span class="text-3xl animate-pulse">⚡</span>
          <h3 class="text-lg font-black text-amber-300">CHỌN NGƯỜI CHƠI ĐỂ CƯỚP VÀNG</h3>
          <p class="text-xs text-slate-300">Em sẽ cướp được 20% số vàng của bạn đó (nếu bạn chưa kích hoạt khiên)!</p>

          <div class="space-y-2 max-h-52 overflow-y-auto pt-2">
            ${otherPlayers.length === 0 ? `
              <p class="text-xs text-slate-400 py-4">Chưa có người chơi khác trong phòng để cướp.</p>
            ` : otherPlayers.map(p => `
              <button type="button" data-steal-target="${p.uid}" class="w-full p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition text-xs">
                <span class="font-bold">${escapeHtml(p.name)}</span>
                <span class="font-mono text-amber-400 font-bold">${p.gold || 0} 🪙</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-steal-target]').forEach(btn => {
      btn.onclick = async () => {
        const targetUid = btn.getAttribute('data-steal-target');
        const target = otherPlayers.find(p => p.uid === targetUid);
        if (target) {
          const stolen = Math.max(5, Math.floor((target.gold || 0) * 0.2));
          this.playerInfo.gold = (this.playerInfo.gold || 0) + stolen;
          target.gold = Math.max(0, (target.gold || 0) - stolen);

          const dbUrl = this.getBaseDbUrl();
          try {
            await fetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}/gold.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(this.playerInfo.gold)
            });
            await fetch(`${dbUrl}/arena_rooms/${room.pin}/players/${targetUid}/gold.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(target.gold)
            });
          } catch {}

          this.renderPlayerFeedback(true, `Đã cướp thành công ${stolen} vàng từ [${target.name}]! 🪙`);
        }
      };
    });
  },

  renderPlayerFeedback(isCorrect, message) {
    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-12 animate-fadeIn">
        <div class="p-8 rounded-3xl ${isCorrect ? 'bg-emerald-600' : 'bg-rose-600'} text-white shadow-2xl space-y-4">
          <div class="text-5xl animate-bounce">
            ${isCorrect ? '🎉' : '❌'}
          </div>
          <h3 class="text-xl font-black">${isCorrect ? 'CHÍNH XÁC!' : 'CHƯA ĐÚNG!'}</h3>
          <p class="text-xs text-white/90 leading-relaxed">${escapeHtml(message)}</p>

          <div class="pt-4 border-t border-white/20 text-xs font-bold flex items-center justify-center gap-2">
            <i class="fa-solid fa-spinner fa-spin"></i> Đang chờ câu tiếp theo từ Thầy/Cô...
          </div>
        </div>
      </div>
    `;
  },

  // ==========================================
  // 10. REALTIME SYNC LISTENER (FIREBASE RTDB / POLLING)
  // ==========================================
  listenToRoomUpdates(pin) {
    this.cleanupRoomListener();
    const dbUrl = this.getBaseDbUrl();
    const roomUrl = `${dbUrl}/arena_rooms/${pin}.json`;

    // Polling định kỳ mỗi 1.2s đảm bảo cập nhật mượt mà
    this.pollingInterval = setInterval(async () => {
      try {
        const res = await fetch(roomUrl, { cache: 'no-cache' });
        if (res.ok) {
          const remote = await res.json();
          if (remote) {
            this.handleRemoteRoomUpdate(remote);
          }
        }
      } catch {}
    }, 1200);
  },

  handleRemoteRoomUpdate(remoteRoom) {
    if (!remoteRoom) return;
    const oldStatus = this.activeRoom ? this.activeRoom.status : null;
    const oldQIndex = this.activeRoom ? this.activeRoom.currentQuestionIndex : -1;
    this.activeRoom = remoteRoom;

    // Cập nhật số lượng người chơi trong Lobby nếu Host đang ở màn hình chờ
    if (this.activeRole === 'host' && remoteRoom.status === 'lobby') {
      const pGrid = document.getElementById('host-lobby-players-grid');
      const countEl = document.getElementById('host-lobby-count');
      const startBtn = document.getElementById('btn-host-start-game');
      const players = Object.values(remoteRoom.players || {});
      if (countEl) countEl.textContent = players.length;
      if (startBtn) startBtn.innerHTML = `<i class="fa-solid fa-play"></i> BẮT ĐẦU TRẬN ĐẤU NGAY (${players.length} HS)`;

      if (pGrid) {
        pGrid.innerHTML = players.map(p => {
          const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
          return `
            <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-2 animate-scaleUp">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-tr ${blook.gradient} text-white flex items-center justify-center text-xl shadow-sm animate-bounce">
                <i class="fa-solid ${blook.icon}"></i>
              </div>
              <span class="text-xs font-bold text-slate-800 dark:text-white truncate w-full text-center">${escapeHtml(p.name)}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Cập nhật số lượng nộp bài trên màn hình Host khi đang làm bài
    if (this.activeRole === 'host' && remoteRoom.status === 'playing') {
      const answeredCount = Object.values(remoteRoom.players || {}).filter(p => p.currentAnswer !== null && p.currentAnswer !== undefined).length;
      const countEl = document.getElementById('host-answered-count');
      if (countEl) countEl.textContent = answeredCount;

      // Cập nhật máu Boss nếu là Boss Raid
      if (remoteRoom.gameMode === 'boss_raid') {
        const hpText = document.getElementById('host-boss-hp-text');
        const hpFill = document.getElementById('host-boss-hp-fill');
        if (hpText) hpText.textContent = `${remoteRoom.bossCurrentHp} / ${remoteRoom.bossMaxHp} HP`;
        if (hpFill) hpFill.style.width = `${(remoteRoom.bossCurrentHp / remoteRoom.bossMaxHp) * 100}%`;
      }
    }

    // Xử lý chuyển cảnh phía Học Sinh khi Host thay đổi trạng thái
    if (this.activeRole === 'player') {
      if (remoteRoom.status === 'playing' && (oldStatus !== 'playing' || oldQIndex !== remoteRoom.currentQuestionIndex)) {
        this.playerInfo.answeredInCurrentQ = false;
        this.playerInfo.currentAnswer = null;
        const q = remoteRoom.questions[remoteRoom.currentQuestionIndex];
        if (q) this.renderPlayerQuestionView(q);
      } else if (remoteRoom.status === 'game_over' && oldStatus !== 'game_over') {
        this.renderPlayerGameOver();
      }
    }
  },

  renderPlayerGameOver() {
    const room = this.activeRoom;
    const sorted = Object.values(room.players || {}).sort((a, b) => {
      if (room.gameMode === 'gold_quest') return (b.gold || 0) - (a.gold || 0);
      return (b.score || 0) - (a.score || 0);
    });

    const myRank = sorted.findIndex(p => p.uid === this.playerInfo.uid) + 1;
    this.playFanfare();

    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-8 animate-fadeIn">
        <div class="p-8 rounded-3xl bg-slate-900 text-white shadow-2xl border border-white/10 space-y-5">
          <span class="text-5xl animate-bounce">🏆</span>
          <h2 class="text-2xl font-black">TRẬN ĐẤU KẾT THÚC!</h2>
          
          <div class="p-5 rounded-2xl bg-white/10 backdrop-blur-md space-y-2">
            <span class="text-xs text-amber-300 font-bold uppercase block">Thứ Hạng Chung Cuộc</span>
            <span class="text-4xl font-black text-white font-mono block">#${myRank > 0 ? myRank : 1}</span>
            <span class="text-xs text-slate-300 block">trên tổng số ${sorted.length} dũng sĩ</span>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-xl bg-slate-800">
              <span class="text-slate-400 block">Số câu đúng</span>
              <span class="text-base font-bold text-emerald-400 font-mono mt-1 block">${this.playerInfo.correctCount || 0} / ${room.totalQuestions}</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800">
              <span class="text-slate-400 block">${room.gameMode === 'gold_quest' ? 'Tổng Vàng' : 'Tổng Điểm'}</span>
              <span class="text-base font-bold text-amber-400 font-mono mt-1 block">${room.gameMode === 'gold_quest' ? `${this.playerInfo.gold || 0} 🪙` : `${this.playerInfo.score || 0} đ`}</span>
            </div>
          </div>

          <button id="btn-player-finish-back" class="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 font-black text-xs transition">
            Về Trang Chủ Đấu Trường
          </button>
        </div>
      </div>
    `;

    const btnBack = document.getElementById('btn-player-finish-back');
    if (btnBack) {
      btnBack.onclick = () => {
        this.cleanupRoomListener();
        this.renderMainView();
      };
    }
  },

  cleanupRoomListener() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }
  },

  syncRoomToCloud(room) {
    if (!room || !room.pin) return;
    Storage.saveArenaRoom(room);
    const dbUrl = this.getBaseDbUrl();
    fetch(`${dbUrl}/arena_rooms/${room.pin}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    }).catch(() => {});
  },

  getModeTitle(mode) {
    switch (mode) {
      case 'gold_quest': return '🪙 Đào Vàng & Rương Báu';
      case 'speed_racer': return '🏎️ Đua Top Tốc Độ';
      case 'boss_raid': return '👾 Săn Boss Diệt Bug';
      case 'classic': return '⚡ Tốc Độ Cổ Điển';
      default: return 'Đấu Trường Trí Tuệ';
    }
  }
};

window.Arena = Arena;
export default Arena;