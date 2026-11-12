/**
 * TinHocHub - Arena: Đấu Trường Game Trí Tuệ (Blooket & Wayground Style + LMS Chỉnh Chu)
 * Kiến trúc Pluggable Game Modes over Decoupled Question Sets:
 * Tách biệt hoàn toàn ngân hàng câu hỏi giáo dục khỏi lớp cơ chế gamification.
 * Hỗ trợ các GameModeHandler: Resource Quest (Đào Vàng), Speed Race (Đua Top), Boss Raid (Săn Boss), Classic Kahoot.
 */

import defaultGameEngine, {
  GameSessionManager,
  ResourceQuestHandler,
  SpeedRaceHandler,
  BossRaidHandler,
  ClassicKahootHandler
} from './game-engine.js?v=20261112_265';
import { Storage } from './storage.js?v=20261112_265';
import { authedFetch } from './api.js?v=20261112_265';
import { Auth } from './auth.js?v=20261112_265';
import { CloudSync } from './cloud-sync.js?v=20261112_265';
import { escapeHtml as importedEscapeHtml } from './utils.js?v=20261112_265';
import {
  AVATARS,
  AVATAR_CATEGORIES,
  RARITY,
  renderAvatar,
  renderAvatarSVG,
  getAvatar,
  randomAvatarId
} from './avatars.js?v=20261112_265';

// Định nghĩa an toàn tuyệt đối cho hàm escapeHtml trong scope của arena.js
function escapeHtml(str) {
  if (typeof importedEscapeHtml === 'function') return importedEscapeHtml(str);
  if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml(str);
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
  window.escapeHtml = escapeHtml;
}

const Arena = {
  engine: defaultGameEngine,
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
  selectedAvatarCat: 'all',

  // Danh mục 44 Linh thú Blooks vẽ tay bằng SVG đa lớp sắc nét
  BLOOKS: AVATARS.map(a => ({
    ...a,
    category: a.cat || a.category || 'animal',
    icon: a.icon || 'fa-paw',
    gradient: a.gradient || 'from-purple-500 to-indigo-600',
    color: (a.bg && a.bg[0]) || '#8b5cf6'
  })),

  renderBlookIcon(blookId, sizeCls = 'w-8 h-8 rounded-lg', opts = {}) {
    return renderAvatar(blookId || 'bot', sizeCls, opts);
  },

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

    // Lắng nghe thay đổi trạng thái xác thực để tự động làm mới giao diện
    if (!this._authListenerRegistered) {
      this._authListenerRegistered = true;
      const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
      if (authObj && typeof authObj.onAuthChange === 'function') {
        authObj.onAuthChange(() => {
          const arenaView = document.getElementById('view-arena');
          if (arenaView && !arenaView.classList.contains('hidden') && this.container) {
            this.renderMainView();
          }
        });
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('tinhoc-auth-changed', () => {
          const arenaView = document.getElementById('view-arena');
          if (arenaView && !arenaView.classList.contains('hidden') && this.container) {
            this.renderMainView();
          }
        });
      }
    }

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

  checkIsTeacher() {
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    if (authObj) {
      if (typeof authObj.isAdmin === 'function' && authObj.isAdmin()) return true;
      if (typeof authObj.isTeacher === 'function' && authObj.isTeacher()) return true;
    }
    try {
      const raw = localStorage.getItem('tinhoc_user');
      if (raw) {
        const u = JSON.parse(raw);
        const r = String(u.role || '').trim().toLowerCase();
        const em = String(u.email || '').trim().toLowerCase();
        if (r === 'admin' || r === 'teacher' || r === 'gv' || r === 'giao_vien' || r.includes('quản trị') || r.includes('giáo viên')) {
          return true;
        }
        const adminCfg = (typeof Storage !== 'undefined' && typeof Storage.getAdminConfig === 'function') ? Storage.getAdminConfig() : {};
        if (adminCfg.adminEmail && em === adminCfg.adminEmail.toLowerCase()) return true;
        if (em.startsWith('admin') || em.includes('nghiatnhcmue') || em.includes('giaovien') || em.includes('gv')) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  },

  getBaseDbUrl() {
    if (typeof Storage !== 'undefined' && typeof Storage.getFirebaseDbUrl === 'function') {
      const url = Storage.getFirebaseDbUrl();
      if (url && url.trim() && !url.includes('on-tap-tinhoc-default-rtdb') && !url.includes('firebaseio.com')) {
        return url.trim().replace(/\/+$/, '');
      }
    }
    return 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.asia-southeast1.firebasedatabase.app';
  },

  renderMainView() {
    const isTeacher = this.checkIsTeacher();
    const authObj = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
    const currentUser = (authObj && typeof authObj.getCurrentUser === 'function') ? authObj.getCurrentUser() : null;
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
              <button type="button" id="btn-open-create-arena" data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-900 text-xs font-black transition flex items-center gap-2 shadow-lg shadow-black/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                <i class="fa-solid fa-crown text-base"></i> Tạo Đấu Trường Mới (Dành Cho Giáo Viên)
              </button>

              <button type="button" id="arena-btn-toggle-sound" class="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition text-sm cursor-pointer" title="Bật/Tắt âm thanh">
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

              <!-- Gợi ý chọn Linh Thú tại Hàng Đợi Phòng Chờ -->
              <div class="p-3.5 rounded-2xl bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 flex items-center gap-3">
                <div class="shrink-0">
                  ${this.renderBlookIcon(savedPlayer.blookId || this.BLOOKS[0].id, 'w-11 h-11 rounded-xl', { badge: true })}
                </div>
                <div class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong class="font-black text-purple-700 dark:text-purple-300 block">🎭 Chọn Nhân Vật Ở Hàng Đợi Phòng Chờ</strong>
                  Sau khi kết nối vào phòng chờ, em sẽ tự do chọn & đổi giữa <strong>${this.BLOOKS.length} Linh Thú Blook</strong> trong lúc đợi Thầy/Cô bấm Bắt đầu!
                </div>
              </div>

              <button type="submit" id="btn-submit-join-arena" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-sm transition shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
                <i class="fa-solid fa-rocket"></i> KẾT NỐI VÀO PHÒNG CHỜ NGAY
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
              <div class="p-5 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800 border-2 border-amber-200 dark:border-amber-800/60 flex flex-col justify-between space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="space-y-3">
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
                <div class="pt-2 flex items-center gap-2">
                  <button type="button" data-solo-arena-mode="resource_quest" class="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                    <i class="fa-solid fa-play"></i> Chơi Thử Ngay
                  </button>
                  <button type="button" data-host-arena-mode="resource_quest" data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}py-2 px-3 rounded-xl bg-white dark:bg-slate-700 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer" title="Tạo phòng cho lớp">
                    <i class="fa-solid fa-crown"></i> Tạo Phòng
                  </button>
                </div>
              </div>

              <!-- Mode 2: Speed Racer -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 border-2 border-blue-200 dark:border-blue-800/60 flex flex-col justify-between space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="space-y-3">
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
                <div class="pt-2 flex items-center gap-2">
                  <button type="button" data-solo-arena-mode="speed_race" class="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                    <i class="fa-solid fa-play"></i> Chơi Thử Ngay
                  </button>
                  <button type="button" data-host-arena-mode="speed_race" data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}py-2 px-3 rounded-xl bg-white dark:bg-slate-700 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer" title="Tạo phòng cho lớp">
                    <i class="fa-solid fa-crown"></i> Tạo Phòng
                  </button>
                </div>
              </div>

              <!-- Mode 3: Boss Raid -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-slate-800 dark:to-slate-800 border-2 border-rose-200 dark:border-rose-800/60 flex flex-col justify-between space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="space-y-3">
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
                <div class="pt-2 flex items-center gap-2">
                  <button type="button" data-solo-arena-mode="boss_hunt" class="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                    <i class="fa-solid fa-play"></i> Chơi Thử Ngay
                  </button>
                  <button type="button" data-host-arena-mode="boss_hunt" data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}py-2 px-3 rounded-xl bg-white dark:bg-slate-700 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer" title="Tạo phòng cho lớp">
                    <i class="fa-solid fa-crown"></i> Tạo Phòng
                  </button>
                </div>
              </div>

              <!-- Mode 4: Classic Arena -->
              <div class="p-5 rounded-3xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-800 border-2 border-purple-200 dark:border-purple-800/60 flex flex-col justify-between space-y-3 relative overflow-hidden group hover:shadow-lg transition">
                <div class="space-y-3">
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
                <div class="pt-2 flex items-center gap-2">
                  <button type="button" data-solo-arena-mode="classic" class="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer">
                    <i class="fa-solid fa-play"></i> Chơi Thử Ngay
                  </button>
                  <button type="button" data-host-arena-mode="classic" data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}py-2 px-3 rounded-xl bg-white dark:bg-slate-700 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 text-xs font-black transition flex items-center justify-center gap-1 cursor-pointer" title="Tạo phòng cho lớp">
                    <i class="fa-solid fa-crown"></i> Tạo Phòng
                  </button>
                </div>
              </div>
            </div>

            <!-- Classroom Random Games Banner -->
            <div data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}p-4 rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white border border-white/10 flex items-center justify-between gap-3 shadow-md">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl shrink-0 animate-bounce">
                  🦆
                </div>
                <div>
                  <strong class="text-xs font-black block text-amber-300">9 Mini-Game Gọi Tên, Đua Vịt & Chia Nhóm Lớp Học</strong>
                  <span class="text-[11px] text-slate-300 block">Đua vịt đường sông, gắp thú bông, rút thẻ bài ma thuật, vòng quay, quay xèng & bom hẹn giờ</span>
                </div>
              </div>
              <button type="button" id="btn-arena-open-random-picker" class="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition shrink-0 shadow-sm cursor-pointer">
                Mở Ngay ➔
              </button>
            </div>
          </div>
        </div>

        ${this.renderSavedRoomsAndHistoryHtml(isTeacher)}
      </div>
    `;

    this.bindMainEvents();
  },

  renderSavedRoomsAndHistoryHtml(isTeacher = false) {
    const roomsObj = (typeof Storage !== 'undefined' && typeof Storage.getArenaRooms === 'function')
      ? Storage.getArenaRooms()
      : {};
    const activeRooms = Object.values(roomsObj || {})
      .filter(r => r && r.pin && !r.isSoloPractice && (r.status === 'lobby' || r.status === 'playing'))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const historyList = (typeof Storage !== 'undefined' && typeof Storage.getArenaHistory === 'function')
      ? Storage.getArenaHistory()
      : [];

    if (activeRooms.length === 0 && historyList.length === 0) return '';

    return `
      <div class="grid grid-cols-1 ${activeRooms.length > 0 && historyList.length > 0 ? 'lg:grid-cols-2' : ''} gap-6 pt-2">
        ${activeRooms.length > 0 ? `
          <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Phòng Đấu Trường Đang Mở (${activeRooms.length})
                </h3>
              </div>
              <span class="text-[11px] font-bold text-slate-400">Bấm 1 chạm để tham gia</span>
            </div>
            <div class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              ${activeRooms.map(r => {
                const pCount = Object.keys(r.players || {}).length;
                return `
                  <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono text-xs font-black">
                          PIN: ${escapeHtml(r.pin)}
                        </span>
                        <span class="text-xs font-black text-slate-800 dark:text-white truncate">${escapeHtml(r.title || 'Đấu Trường TinHocHub')}</span>
                      </div>
                      <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        ${this.getModeTitle(r.gameMode)} • ${r.totalQuestions || (r.questions || []).length || 15} câu • 👥 ${pCount} người chơi
                      </p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button type="button" data-quick-join-arena-pin="${escapeHtml(r.pin)}" class="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition cursor-pointer">
                        🚀 Vào Ngay
                      </button>
                      <div data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}flex items-center gap-1.5 shrink-0">
                        <button type="button" data-reopen-host-pin="${escapeHtml(r.pin)}" class="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold transition cursor-pointer" title="Mở màn hình Máy chiếu (Host)">
                          <i class="fa-solid fa-tv"></i> Host
                        </button>
                        <button type="button" data-delete-arena-room="${escapeHtml(r.pin)}" class="px-2.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-xs font-bold transition cursor-pointer" title="Đóng / Xóa phòng">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        ${historyList.length > 0 ? `
          <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <i class="fa-solid fa-trophy text-amber-500"></i> Lịch Sử Trận Đấu Gần Đây (${historyList.length})
              </h3>
              <span class="text-[11px] font-bold text-slate-400">Lưu tối đa 50 trận</span>
            </div>
            <div class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              ${historyList.slice(0, 10).map(h => {
                const hid = h.id || h.pin;
                const topPlayer = h.rankings && h.rankings[0] ? h.rankings[0].name : 'Chưa có';
                return `
                  <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-black text-slate-800 dark:text-white truncate">${escapeHtml(h.title || 'Trận Đấu Arena')}</span>
                        <span class="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                          🏆 Top 1: ${escapeHtml(topPlayer)}
                        </span>
                      </div>
                      <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        ${this.getModeTitle(h.gameMode)} • 👥 ${h.playerCount || (h.rankings || []).length || 0} HS • ${h.finishedAt ? new Date(h.finishedAt).toLocaleDateString('vi-VN') : ''}
                      </p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      ${Array.isArray(h.rankings) && h.rankings.length > 0 ? `
                        <button type="button" data-export-arena-hist="${escapeHtml(hid)}" class="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition cursor-pointer" title="Xuất báo cáo Excel">
                          <i class="fa-solid fa-file-excel"></i> Excel
                        </button>
                      ` : ''}
                      <div data-role-req="teacher" class="${isTeacher ? '' : 'hidden '}shrink-0">
                        <button type="button" data-delete-arena-hist="${escapeHtml(hid)}" class="px-2.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-xs font-bold transition cursor-pointer" title="Xóa lịch sử này">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  bindMainEvents() {
    const savedPlayer = Storage.getArenaPlayer() || {};
    const selectedBlookId = (savedPlayer.blookId && this.BLOOKS.some(x => x.id === savedPlayer.blookId))
      ? savedPlayer.blookId
      : this.BLOOKS[0].id;

    // 2. Submit Vào Phòng
    const formJoin = document.getElementById('form-join-arena');
    if (formJoin) {
      formJoin.onsubmit = (e) => {
        e.preventDefault();
        const rawPin = document.getElementById('arena-input-pin')?.value || '';
        const pin = String(rawPin).replace(/[\s\-_]/g, '').trim();
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

    // 5. Nút Mở 9 Mini-Game Random Picker
    const btnRandomPicker = document.getElementById('btn-arena-open-random-picker');
    if (btnRandomPicker) {
      btnRandomPicker.onclick = () => {
        if (window.AppInstance && typeof window.AppInstance.switchTab === 'function') {
          window.AppInstance.switchTab('random-picker');
        }
      };
    }

    // 6. Các nút Chơi Thử Ngay (Solo Practice) trên 4 thẻ Game Mode
    this.container.querySelectorAll('[data-solo-arena-mode]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.getAttribute('data-solo-arena-mode') || 'resource_quest';
        const nameInput = document.getElementById('arena-input-name')?.value.trim();
        Storage.saveArenaPlayer({
          pin: savedPlayer.pin || '',
          name: nameInput || savedPlayer.name || '',
          blookId: selectedBlookId
        });
        this.startSoloArenaGame(mode, selectedBlookId, nameInput);
      };
    });

    // 7. Các nút Tạo Phòng theo từng Game Mode trên 4 thẻ
    this.container.querySelectorAll('[data-host-arena-mode]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.getAttribute('data-host-arena-mode') || 'resource_quest';
        this.openCreateArenaModal(mode);
      };
    });

    // 8. Các nút Vào Nhanh / Mở Host / Xóa Phòng Đấu Trường đang lưu
    this.container.querySelectorAll('[data-quick-join-arena-pin]').forEach(btn => {
      btn.onclick = () => {
        const rawPin = btn.getAttribute('data-quick-join-arena-pin') || '';
        const pin = String(rawPin).replace(/[\s\-_]/g, '').trim();
        const nameInput = document.getElementById('arena-input-name')?.value.trim();
        const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        const playerName = nameInput || currentUser?.fullName || savedPlayer.name || 'Chiến Binh Tin Học';
        Storage.saveArenaPlayer({ pin, name: playerName, blookId: selectedBlookId });
        this.joinArenaByPin(pin, playerName, selectedBlookId);
      };
    });

    this.container.querySelectorAll('[data-reopen-host-pin]').forEach(btn => {
      btn.onclick = () => {
        const pin = btn.getAttribute('data-reopen-host-pin');
        const room = Storage.getArenaRoom(pin);
        if (room) {
          this.startHostView(room);
        }
      };
    });

    this.container.querySelectorAll('[data-delete-arena-room]').forEach(btn => {
      btn.onclick = () => {
        const pin = btn.getAttribute('data-delete-arena-room');
        if (confirm(`Bạn có chắc chắn muốn đóng và xóa phòng đấu trường [PIN: ${pin}] không?`)) {
          Storage.deleteArenaRoom(pin);
          if (typeof CloudSync !== 'undefined' && typeof CloudSync.deleteArenaRoomFromCloud === 'function') {
            CloudSync.deleteArenaRoomFromCloud(pin);
          }
          this.renderMainView();
        }
      };
    });

    // 9. Các nút Xuất Excel / Xóa Lịch Sử Trận Đấu
    this.container.querySelectorAll('[data-export-arena-hist]').forEach(btn => {
      btn.onclick = () => {
        const hid = btn.getAttribute('data-export-arena-hist');
        const item = Storage.getArenaHistory().find(h => (h.id || h.pin) === hid);
        if (item && Array.isArray(item.rankings)) {
          this.exportMatchToExcel({
            title: item.title || 'Trận Đấu Arena',
            gameMode: item.gameMode || 'resource_quest',
            pin: item.pin || 'HIST',
            createdAt: item.finishedAt || item.savedAt || Date.now(),
            totalQuestions: item.totalQuestions || 15
          }, item.rankings);
        }
      };
    });

    this.container.querySelectorAll('[data-delete-arena-hist]').forEach(btn => {
      btn.onclick = () => {
        const hid = btn.getAttribute('data-delete-arena-hist');
        if (confirm('Xóa kết quả trận đấu này khỏi lịch sử?')) {
          if (typeof Storage.deleteArenaHistory === 'function') {
            Storage.deleteArenaHistory(hid);
          }
          this.renderMainView();
        }
      };
    });
  },

  // ==========================================
  // 2B. CHẾ ĐỘ CHƠI THỬ / TỰ LUYỆN SOLO CÙNG AI BLOOKS
  // ==========================================
  async startSoloArenaGame(mode = 'resource_quest', blookId = null, customName = '') {
    const grade = (typeof window !== 'undefined' && window.AppInstance?.currentGrade) || '12';
    let questions = [];
    try {
      if (typeof this.loadGradeFn === 'function') {
        questions = await this.loadGradeFn(grade);
      } else if (typeof window !== 'undefined' && typeof window.AppInstance?.loadGradeData === 'function') {
        questions = await window.AppInstance.loadGradeData(grade);
      } else {
        const res = await fetch(`data/grade_${grade}.json`);
        if (res.ok) questions = await res.json();
      }
    } catch (e) {
      console.warn('Không tải được câu hỏi cho chế độ tự luyện:', e);
    }

    const mcqQuestions = (questions || []).filter(q => Array.isArray(q.options) && q.options.length >= 2);
    if (mcqQuestions.length === 0) {
      alert('Đang tải ngân hàng câu hỏi, vui lòng thử lại sau giây lát!');
      return;
    }

    const shuffled = [...mcqQuestions].sort(() => 0.5 - Math.random()).slice(0, 15);
    const pin = `SOLO${Math.floor(10 + Math.random() * 89)}`;
    const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const savedPlayer = Storage.getArenaPlayer() || {};
    const finalName = customName || currentUser?.fullName || savedPlayer.name || 'Chiến Binh Tin Học';
    const finalBlook = blookId || savedPlayer.blookId || this.BLOOKS[0].id;
    const uid = (currentUser?.email || currentUser?.username || 'solo_player').replace(/[.#$\[\]\/]/g, '_');

    const session = defaultGameEngine.createSession({
      pin,
      hostId: uid,
      quizId: `grade_${grade}`,
      gameMode: mode,
      questions: shuffled,
      timerSec: 20,
      goalCap: 0,
      powerUpFrequency: 'normal',
      title: `Tự Luyện: ${this.getModeTitle(mode)} (Khối ${grade})`,
      targetClass: 'all',
      hostName: finalName,
      hostEmail: currentUser?.email || ''
    });

    session.pin = pin;
    session.title = `Tự Luyện: ${this.getModeTitle(mode)} (Khối ${grade})`;
    session.isSoloPractice = true;
    session.status = 'lobby';
    session.currentQuestionIndex = 0;

    // Thêm người chơi chính
    const playerState = defaultGameEngine.joinPlayer(session, {
      id: uid,
      uid,
      name: finalName,
      blookId: finalBlook
    });
    playerState.uid = uid;
    playerState.email = currentUser?.email || '';
    playerState.school = currentUser?.school || '';
    playerState.className = currentUser?.className || '';

    // Thêm 3 đối thủ / đồng đội AI Blooks để cướp vàng, đua top và hợp sức đánh Boss
    const aiCompanions = [
      { id: 'ai_bot_1', uid: 'ai_bot_1', name: 'Minh Khôi AI 🤖', blookId: 'cyber_dragon', isAi: true },
      { id: 'ai_bot_2', uid: 'ai_bot_2', name: 'Bảo An AI ⚡', blookId: 'kitsune_nine', isAi: true },
      { id: 'ai_bot_3', uid: 'ai_bot_3', name: 'Quỳnh Anh AI 🌟', blookId: 'astronaut_cat', isAi: true }
    ];
    aiCompanions.forEach(ai => {
      const p = defaultGameEngine.joinPlayer(session, ai);
      p.uid = ai.uid;
      p.isAi = true;
      if (this.isGoldMode(mode)) {
        p.metadata = p.metadata || {};
        p.metadata.gold = 50;
      }
    });

    this.playerInfo = playerState;
    this.activeRoom = session;
    this.activeRole = 'player';
    this.cleanupRoomListener();
    this.renderPlayerLobby();
  },

  simulateSoloAiTurn(room) {
    if (!room || !room.isSoloPractice) return;
    const q = room.questions[room.currentQuestionIndex || 0];
    if (!q) return;

    Object.values(room.players || {}).forEach(p => {
      if (!p.isAi) return;
      const aiUid = p.id || p.uid;
      if (p.lastSimulatedQ === room.currentQuestionIndex) return;
      p.lastSimulatedQ = room.currentQuestionIndex;

      // Xác suất AI trả lời đúng ~68%
      const willBeCorrect = Math.random() < 0.68;
      let ansIdx = 0;
      const opts = q.options || ['A', 'B', 'C', 'D'];
      const rawAns = String(q.answer ?? '0').trim().toUpperCase();
      const letterMap = { A: 0, B: 1, C: 2, D: 3 };
      let correctIdx = letterMap[rawAns] !== undefined ? letterMap[rawAns] : parseInt(rawAns, 10);
      if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) {
        correctIdx = opts.findIndex(o => String(o).trim().toUpperCase() === rawAns);
        if (correctIdx < 0) correctIdx = 0;
      }

      if (willBeCorrect) {
        ansIdx = correctIdx;
      } else {
        ansIdx = (correctIdx + 1 + Math.floor(Math.random() * Math.max(1, opts.length - 1))) % opts.length;
      }

      const simTime = 2500 + Math.floor(Math.random() * 8000);
      try {
        defaultGameEngine.submitAnswer(room, aiUid, ansIdx, simTime);
        if (willBeCorrect && this.isGoldMode(room.gameMode)) {
          p.metadata = p.metadata || {};
          const bonusGold = [20, 35, 50, 75][Math.floor(Math.random() * 4)];
          p.metadata.gold = (p.metadata.gold || 0) + bonusGold;
          p.score = p.metadata.gold;
        }
      } catch {}
    });
  },

  // ==========================================
  // 3. MODAL TẠO ĐẤU TRƯỜNG DÀNH CHO GIÁO VIÊN (PLUGGABLE FLOW)
  // ==========================================
  openCreateArenaModal(defaultMode = 'resource_quest') {
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

    // Trạng thái cục bộ cho modal tạo đấu trường
    let activeScope = 'all'; // 'all' | 'by_topic' | 'by_lesson' | 'pick_questions'
    let loadedQuestions = [];
    let selectedLessonNames = new Set();
    let pickedQuestionIds = new Set();
    let currentGrade = '12';

    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-6 max-h-[92vh] overflow-y-auto animate-scaleUp">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 text-white flex items-center justify-center text-lg shadow-sm">
              <i class="fa-solid fa-gamepad"></i>
            </div>
            <div>
              <h3 class="text-base font-black text-slate-800 dark:text-white">Khởi Tạo Đấu Trường Gamification</h3>
              <p class="text-xs text-slate-400">Chọn đề thi, bài học hoặc duyệt chọn từng câu hỏi đưa vào trận đấu</p>
            </div>
          </div>
          <button id="btn-close-create-arena" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form id="form-create-arena-submit" class="space-y-5 text-xs">
          <!-- Tên trận đấu -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tên Trận Đấu / Đấu Trường *</label>
            <input type="text" id="arena-create-title" required placeholder="Ví dụ: Đấu Trường Rương Báu Tin Học 12 - Ôn Thi Giữa Kỳ" class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500" />
          </div>

          <!-- BƯỚC 1: CHỌN BỘ ĐỀ THI & BÀI HỌC KIỂM TRA (GIỐNG TẠO PHÒNG THI) -->
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3.5">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-black uppercase text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <i class="fa-solid fa-book-open"></i> Bước 1: Chọn Bộ Đề Thi & Bài Học Kiểm Tra
              </span>
              <span id="arena-scope-summary-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                Toàn khối (Ngân hàng chuẩn)
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ngân Hàng Câu Hỏi *</label>
                <select id="arena-create-source" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                  <option value="grade_12" selected>Khối 12 (Ngân hàng chuẩn 1.479 câu)</option>
                  <option value="grade_11">Khối 11 (Ngân hàng chuẩn 1.240 câu)</option>
                  <option value="grade_10">Khối 10 (Ngân hàng chuẩn 1.379 câu)</option>
                  ${customPackages.map(p => `
                    <option value="pkg_${p.id}">Gói Excel: ${escapeHtml(p.packageTitle)} (${p.questions.length} câu)</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Số Lượng Câu Hỏi Trộn *</label>
                <select id="arena-create-qcount" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                  <option value="10">10 câu hỏi (Nhanh 5-7 phút)</option>
                  <option value="15" selected>15 câu hỏi (Tiêu chuẩn 10-12 phút)</option>
                  <option value="20">20 câu hỏi (Toàn diện 15 phút)</option>
                  <option value="25">25 câu hỏi</option>
                  <option value="30">30 câu hỏi</option>
                  <option value="40">40 câu hỏi</option>
                  <option value="all">Toàn bộ câu hỏi phù hợp</option>
                </select>
              </div>
            </div>

            <!-- 4 Chế Độ Phạm Vi Giống Phòng Thi -->
            <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <label class="block font-bold text-slate-700 dark:text-slate-300 text-xs">
                Phạm vi kiểm tra & Hình thức chọn câu hỏi:
              </label>
              
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button type="button" data-arena-scope="all" class="arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shadow-sm">
                  🌐 Toàn khối
                </button>
                <button type="button" data-arena-scope="by_topic" class="arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-600 dark:text-slate-300">
                  📁 Theo Chủ đề
                </button>
                <button type="button" data-arena-scope="by_lesson" class="arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-600 dark:text-slate-300">
                  📖 Theo Bài học
                </button>
                <button type="button" data-arena-scope="pick_questions" class="arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-600 dark:text-slate-300">
                  📝 Chọn từng câu
                </button>
              </div>

              <!-- Panel: Theo Chủ đề -->
              <div id="arena-panel-by-topic" class="hidden p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <label class="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">Chọn chủ đề kiểm tra:</label>
                <select id="arena-select-topic" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white">
                  <!-- Đổ động các chủ đề -->
                </select>
              </div>

              <!-- Panel: Theo Bài học -->
              <div id="arena-panel-by-lesson" class="hidden p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div class="flex items-center justify-between">
                  <label class="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">Tích chọn các bài học muốn đưa vào đấu trường:</label>
                  <div class="inline-flex items-center gap-2">
                    <button type="button" id="btn-arena-select-all-lessons" class="text-[10px] text-purple-600 dark:text-purple-400 font-bold hover:underline">Chọn tất cả</button>
                    <span class="text-slate-300 dark:text-slate-600">•</span>
                    <button type="button" id="btn-arena-clear-lessons" class="text-[10px] text-slate-400 hover:underline">Bỏ chọn</button>
                  </div>
                </div>
                <div id="arena-lessons-checklist" class="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-700/60">
                  <!-- Đổ động danh sách bài học -->
                </div>
              </div>

              <!-- Panel: Đọc & Chọn Từng Câu Hỏi Cụ Thể -->
              <div id="arena-panel-pick-questions" class="hidden p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-800 dark:text-white text-xs">Duyệt & Tích Chọn Câu Hỏi Ngân Hàng</span>
                    <span id="arena-qpick-count-badge" class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                      Đã chọn: 0 câu
                    </span>
                  </div>
                  <div class="inline-flex items-center gap-2">
                    <button type="button" id="btn-arena-qpick-select-filtered" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 hover:bg-purple-100 transition">
                      <i class="fa-solid fa-check-double mr-1"></i> Chọn tất cả đang lọc
                    </button>
                    <button type="button" id="btn-arena-qpick-clear" class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 transition">
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <!-- Bộ lọc tìm kiếm câu hỏi -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <input type="text" id="arena-qpick-search" placeholder="Tìm theo từ khóa câu hỏi..." class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-800 dark:text-white" />
                  </div>
                  <div>
                    <select id="arena-qpick-filter-lesson" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-800 dark:text-white">
                      <option value="all">Tất cả bài học</option>
                    </select>
                  </div>
                  <div>
                    <select id="arena-qpick-filter-level" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-800 dark:text-white">
                      <option value="all">Tất cả mức độ</option>
                      <option value="1">Mức 1 (Nhận biết)</option>
                      <option value="2">Mức 2 (Thông hiểu)</option>
                      <option value="3">Mức 3 (Vận dụng)</option>
                      <option value="4">Mức 4 (Vận dụng cao)</option>
                    </select>
                  </div>
                </div>

                <!-- Danh sách cuộn các câu hỏi -->
                <div id="arena-qpick-scroll-list" class="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 dark:divide-slate-700/60">
                  <!-- Đổ động danh sách câu hỏi -->
                </div>
              </div>
            </div>
          </div>

          <!-- BƯỚC 2: CHỌN CHẾ ĐỘ CHƠI (GAME MODE STRATEGY) -->
          <div class="space-y-2">
            <span class="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <i class="fa-solid fa-dice"></i> Bước 2: Chọn Chế Độ Gamification (Game Mode Adapter)
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label class="p-3 rounded-2xl border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="resource_quest" checked class="text-amber-500 focus:ring-amber-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">🪙 Đào Vàng & Rương Báu (Resource Quest)</strong>
                  <span class="text-[10px] text-slate-500">Blooket Style: Mở 3 rương, x2 vàng, Khiên thần, Cướp vàng</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="speed_race" class="text-blue-500 focus:ring-blue-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">🏎️ Đua Top Tốc Độ (Speed Race)</strong>
                  <span class="text-[10px] text-slate-500">Wayground Style: Phản xạ nhanh, Combo streak x2/x3 & Đóng băng</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-rose-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="boss_hunt" class="text-rose-500 focus:ring-rose-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">👾 Săn Boss Diệt Bug (Boss Raid)</strong>
                  <span class="text-[10px] text-slate-500">Co-op Co-operative: Cả lớp hợp lực đánh bại Siêu Trùm</span>
                </div>
              </label>

              <label class="p-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-purple-400 flex items-center gap-3 cursor-pointer">
                <input type="radio" name="arena-create-mode" value="classic" class="text-purple-500 focus:ring-purple-400" />
                <div>
                  <strong class="block text-slate-800 dark:text-white text-xs">⚡ Tốc Độ Cổ Điển (Classic Kahoot)</strong>
                  <span class="text-[10px] text-slate-500">Biểu đồ phân bổ phương án và bục vinh danh Podium</span>
                </div>
              </label>
            </div>
          </div>

          <!-- BƯỚC 3: THIẾT LẬP THÔNG SỐ GAME (MODE PARAMETERS) -->
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <span class="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <i class="fa-solid fa-sliders"></i> Bước 3: Thiết Lập Thông Số Trận Đấu (Mode Parameters)
            </span>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Thời Gian / Câu</label>
                <select id="arena-create-timer" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                  <option value="15">15 giây (Rất nhanh)</option>
                  <option value="20" selected>20 giây (Chuẩn cân đối)</option>
                  <option value="30">30 giây (Thư thả suy nghĩ)</option>
                  <option value="45">45 giây (Vận dụng cao)</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mục Tiêu Kết Thúc (Goal Cap)</label>
                <select id="arena-create-goal-cap" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                  <option value="0" selected>Thi hết số câu trong đề</option>
                  <option value="500">Cán mốc 500 Vàng / Điểm</option>
                  <option value="1000">Cán mốc 1.000 Vàng / Điểm</option>
                  <option value="2500">Cán mốc 2.500 Vàng / Điểm</option>
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tần Suất Rương / Power-up</label>
                <select id="arena-create-powerup-freq" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
                  <option value="low">Thấp (Tập trung lý thuyết)</option>
                  <option value="normal" selected>Tiêu chuẩn (Cân đối)</option>
                  <option value="high">Cao (Nhiều rương Jackpot & Cướp)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Giao Cho Lớp (Tự Lưu Sổ Điểm LMS)</label>
              <select id="arena-create-target-class" class="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white">
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
            <button type="submit" id="btn-submit-create-arena" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black shadow-lg shadow-amber-500/25 flex items-center gap-2 transition">
              <i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)
            </button>
          </div>
        </form>
      </div>
    `;

    modal.classList.remove('hidden');

    // Đóng modal
    const closeModal = () => modal.classList.add('hidden');
    modal.querySelector('#btn-close-create-arena').onclick = closeModal;
    modal.querySelector('#btn-cancel-create-arena').onclick = closeModal;

    // Highlight chế độ chơi đã chọn
    const modeInputs = modal.querySelectorAll('input[name="arena-create-mode"]');
    const updateModeCardsHighlight = () => {
      modeInputs.forEach(inp => {
        const parentLabel = inp.closest('label');
        if (inp.checked) {
          parentLabel.classList.add('border-amber-400', 'bg-amber-50/50', 'dark:bg-amber-950/20');
          parentLabel.classList.remove('border-slate-200', 'dark:border-slate-700');
        } else {
          parentLabel.classList.remove('border-amber-400', 'bg-amber-50/50', 'dark:bg-amber-950/20');
          parentLabel.classList.add('border-slate-200', 'dark:border-slate-700');
        }
      });
    };
    modeInputs.forEach(inp => inp.addEventListener('change', updateModeCardsHighlight));
    const targetModeRadio = modal.querySelector(`input[name="arena-create-mode"][value="${defaultMode}"]`);
    if (targetModeRadio) targetModeRadio.checked = true;
    updateModeCardsHighlight();

    // ==================== QUẢN LÝ PHẠM VI & CHỌN CÂU HỎI (GIỐNG PHÒNG THI) ====================
    const sourceSelect = modal.querySelector('#arena-create-source');
    const panelTopic = modal.querySelector('#arena-panel-by-topic');
    const panelLesson = modal.querySelector('#arena-panel-by-lesson');
    const panelQuestions = modal.querySelector('#arena-panel-pick-questions');
    const selectTopicEl = modal.querySelector('#arena-select-topic');
    const checklistLessonsEl = modal.querySelector('#arena-lessons-checklist');
    const scrollQuestionsEl = modal.querySelector('#arena-qpick-scroll-list');
    const qCountBadge = modal.querySelector('#arena-create-qcount-badge');
    const qCountSummaryBadge = modal.querySelector('#arena-scope-summary-badge');
    const qPickCountBadge = modal.querySelector('#arena-qpick-count-badge');
    const filterLessonEl = modal.querySelector('#arena-qpick-filter-lesson');
    const filterLevelEl = modal.querySelector('#arena-qpick-filter-level');
    const searchQuestionEl = modal.querySelector('#arena-qpick-search');
    const scopeButtons = modal.querySelectorAll('.arena-scope-btn');

    // Hàm cập nhật giao diện scope buttons
    const updateScopeButtonsUI = () => {
      scopeButtons.forEach(btn => {
        const s = btn.getAttribute('data-arena-scope');
        if (s === activeScope) {
          btn.className = 'arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shadow-sm';
        } else {
          btn.className = 'arena-scope-btn px-2.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 border-slate-200 dark:border-slate-700 hover:border-purple-300 text-slate-600 dark:text-slate-300';
        }
      });

      panelTopic.classList.toggle('hidden', activeScope !== 'by_topic');
      panelLesson.classList.toggle('hidden', activeScope !== 'by_lesson');
      panelQuestions.classList.toggle('hidden', activeScope !== 'pick_questions');

      if (activeScope === 'pick_questions') {
        if (qCountSummaryBadge) qCountSummaryBadge.textContent = `Đã chọn ${pickedQuestionIds.size} câu cụ thể`;
      } else if (activeScope === 'by_lesson') {
        if (qCountSummaryBadge) qCountSummaryBadge.textContent = `Theo ${selectedLessonNames.size} bài học`;
      } else if (activeScope === 'by_topic') {
        if (qCountSummaryBadge) qCountSummaryBadge.textContent = `Theo Chủ đề đã chọn`;
      } else {
        if (qCountSummaryBadge) qCountSummaryBadge.textContent = `Toàn khối (${loadedQuestions.length} câu)`;
      }
    };

    // Hàm nạp câu hỏi theo nguồn đã chọn
    const loadQuestionsForSource = async () => {
      const src = sourceSelect.value;
      if (src.startsWith('pkg_')) {
        const pkgId = src.replace('pkg_', '');
        const pkg = Storage.getAllTeacherContributions().find(p => p.id === pkgId);
        loadedQuestions = pkg?.questions ? [...pkg.questions] : [];
        currentGrade = '12';
      } else {
        const g = src.replace('grade_', '');
        currentGrade = g;
        try {
          if (typeof this.loadGradeFn === 'function') {
            loadedQuestions = await this.loadGradeFn(g);
          } else if (typeof window !== 'undefined' && typeof window.App?.loadGradeData === 'function') {
            loadedQuestions = await window.App.loadGradeData(g);
          } else {
            const res = await fetch(`data/grade_${g}.json`);
            if (res.ok) loadedQuestions = await res.json();
          }
        } catch (e) {
          console.warn('Lỗi nạp câu hỏi cho đấu trường:', e);
          loadedQuestions = [];
        }
      }

      // Trích xuất danh sách chủ đề và bài học
      const topics = [...new Set(loadedQuestions.map(q => q.topic).filter(Boolean))];
      const lessons = [...new Set(loadedQuestions.map(q => q.lesson).filter(Boolean))];

      // Đổ dropdown chủ đề
      if (selectTopicEl) {
        selectTopicEl.innerHTML = topics.map(t => {
          const count = loadedQuestions.filter(q => q.topic === t).length;
          return `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${count} câu)</option>`;
        }).join('');
      }

      // Đổ checklist bài học
      selectedLessonNames.clear();
      if (checklistLessonsEl) {
        checklistLessonsEl.innerHTML = lessons.map((les, idx) => {
          const count = loadedQuestions.filter(q => q.lesson === les).length;
          selectedLessonNames.add(les); // mặc định tích tất cả
          return `
            <label class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer text-xs">
              <span class="flex items-center gap-2">
                <input type="checkbox" data-arena-lesson-cb="${escapeHtml(les)}" checked class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500" />
                <span class="font-medium text-slate-800 dark:text-white">${escapeHtml(les)}</span>
              </span>
              <span class="text-[11px] font-bold text-purple-600 dark:text-purple-400 font-mono">${count} câu</span>
            </label>
          `;
        }).join('');

        // Lắng nghe click checklist bài học
        checklistLessonsEl.querySelectorAll('[data-arena-lesson-cb]').forEach(cb => {
          cb.onchange = () => {
            const les = cb.getAttribute('data-arena-lesson-cb');
            if (cb.checked) selectedLessonNames.add(les);
            else selectedLessonNames.delete(les);
            updateScopeButtonsUI();
          };
        });
      }

      // Đổ dropdown filter bài học cho bảng duyệt từng câu
      if (filterLessonEl) {
        filterLessonEl.innerHTML = '<option value="all">Tất cả bài học</option>' + lessons.map(les => {
          return `<option value="${escapeHtml(les)}">${escapeHtml(les)}</option>`;
        }).join('');
      }

      // Reset danh sách câu hỏi đã chọn cho scope pick_questions
      pickedQuestionIds.clear();
      renderQuestionsList();
      updateScopeButtonsUI();
    };

    // Hàm render danh sách câu hỏi trong bảng duyệt từng câu
    const renderQuestionsList = () => {
      if (!scrollQuestionsEl) return;
      const kw = (searchQuestionEl?.value || '').toLowerCase().trim();
      const filterLes = filterLessonEl?.value || 'all';
      const filterLev = filterLevelEl?.value || 'all';

      const filtered = loadedQuestions.filter(q => {
        if (filterLes !== 'all' && q.lesson !== filterLes) return false;
        if (filterLev !== 'all' && String(q.level) !== String(filterLev)) return false;
        if (kw) {
          const text = `${q.question || ''} ${(q.options || []).join(' ')}`.toLowerCase();
          if (!text.includes(kw)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        scrollQuestionsEl.innerHTML = `
          <div class="py-8 text-center text-slate-400 text-xs">
            <i class="fa-solid fa-filter text-xl mb-1.5 block text-slate-300 dark:text-slate-600"></i>
            Không có câu hỏi nào khớp với bộ lọc hiện tại.
          </div>
        `;
        return;
      }

      scrollQuestionsEl.innerHTML = filtered.map((q, idx) => {
        const qId = String(q.id || q.stt || idx);
        const isChecked = pickedQuestionIds.has(qId);
        let levelBadge = 'Biết';
        let levelColor = 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
        if (String(q.level) === '2') { levelBadge = 'Hiểu'; levelColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'; }
        else if (String(q.level) === '3') { levelBadge = 'Vận dụng'; levelColor = 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'; }
        else if (String(q.level) === '4') { levelBadge = 'Vận dụng cao'; levelColor = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'; }

        return `
          <div class="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/40 transition flex items-start gap-3">
            <input type="checkbox" data-qpick-id="${escapeHtml(qId)}" ${isChecked ? 'checked' : ''} class="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer" />
            <div class="flex-1 space-y-1">
              <div class="flex items-center gap-2 flex-wrap text-[10px]">
                <span class="font-bold text-slate-400 font-mono">#${idx + 1}</span>
                <span class="px-2 py-0.5 rounded-full font-bold ${levelColor}">${levelBadge}</span>
                <span class="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">${escapeHtml(q.lesson || q.topic || '')}</span>
              </div>
              <div class="font-bold text-slate-800 dark:text-white text-xs leading-snug">
                ${escapeHtml(q.question || '')}
              </div>
              ${Array.isArray(q.options) && q.options.length > 0 ? `
                <div class="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                  ${q.options.map((opt, oIdx) => {
                    const optLetter = String.fromCharCode(65 + oIdx);
                    const isCorrect = q.answer === optLetter || q.answer === opt || String(q.answer) === String(oIdx + 1);
                    return `
                      <div class="px-2 py-1 rounded-lg border ${isCorrect ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">
                        <strong>${optLetter}.</strong> ${escapeHtml(opt)}
                      </div>
                    `;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Gắn sự kiện tích chọn cho từng câu hỏi
      scrollQuestionsEl.querySelectorAll('[data-qpick-id]').forEach(cb => {
        cb.onchange = () => {
          const id = cb.getAttribute('data-qpick-id');
          if (cb.checked) pickedQuestionIds.add(id);
          else pickedQuestionIds.delete(id);
          updatePickBadges();
        };
      });
    };

    const updatePickBadges = () => {
      const count = pickedQuestionIds.size;
      if (qPickCountBadge) qPickCountBadge.textContent = `Đã chọn: ${count} câu`;
      if (qCountBadge) qCountBadge.textContent = `Đã chọn: ${count} câu hỏi`;
      if (activeScope === 'pick_questions' && qCountSummaryBadge) {
        qCountSummaryBadge.textContent = `Đã chọn ${count} câu cụ thể`;
      }
    };

    // Sự kiện chuyển tab Scope
    scopeButtons.forEach(btn => {
      btn.onclick = () => {
        activeScope = btn.getAttribute('data-arena-scope');
        updateScopeButtonsUI();
      };
    });

    // Sự kiện đổi nguồn ngân hàng
    sourceSelect.onchange = () => {
      loadQuestionsForSource();
    };

    // Sự kiện checklist bài học: Chọn tất cả / Bỏ chọn
    modal.querySelector('#btn-arena-select-all-lessons')?.addEventListener('click', () => {
      checklistLessonsEl?.querySelectorAll('[data-arena-lesson-cb]').forEach(cb => {
        cb.checked = true;
        selectedLessonNames.add(cb.getAttribute('data-arena-lesson-cb'));
      });
      updateScopeButtonsUI();
    });

    modal.querySelector('#btn-arena-clear-lessons')?.addEventListener('click', () => {
      checklistLessonsEl?.querySelectorAll('[data-arena-lesson-cb]').forEach(cb => {
        cb.checked = false;
        selectedLessonNames.delete(cb.getAttribute('data-arena-lesson-cb'));
      });
      updateScopeButtonsUI();
    });

    // Sự kiện lọc trong bảng duyệt câu hỏi
    searchQuestionEl?.addEventListener('input', renderQuestionsList);
    filterLessonEl?.addEventListener('change', renderQuestionsList);
    filterLevelEl?.addEventListener('change', renderQuestionsList);

    // Nút "Chọn tất cả đang lọc" trong bảng duyệt câu hỏi
    modal.querySelector('#btn-arena-qpick-select-filtered')?.addEventListener('click', () => {
      scrollQuestionsEl?.querySelectorAll('[data-qpick-id]').forEach(cb => {
        cb.checked = true;
        pickedQuestionIds.add(cb.getAttribute('data-qpick-id'));
      });
      updatePickBadges();
    });

    // Nút "Bỏ chọn" trong bảng duyệt câu hỏi
    modal.querySelector('#btn-arena-qpick-clear')?.addEventListener('click', () => {
      scrollQuestionsEl?.querySelectorAll('[data-qpick-id]').forEach(cb => {
        cb.checked = false;
      });
      pickedQuestionIds.clear();
      updatePickBadges();
    });

    // Nạp câu hỏi ban đầu
    loadQuestionsForSource();

    // ==================== XỬ LÝ SUBMIT TẠO PHÒNG ĐẤU TRƯỜNG ====================
    const form = modal.querySelector('#form-create-arena-submit');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = modal.querySelector('#btn-submit-create-arena');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang khởi tạo...';
        }

        try {
          const title = modal.querySelector('#arena-create-title').value.trim();
          const mode = modal.querySelector('input[name="arena-create-mode"]:checked')?.value || 'resource_quest';
          const source = sourceSelect.value;
          const qCountVal = modal.querySelector('#arena-create-qcount').value;
          const timerSec = parseInt(modal.querySelector('#arena-create-timer').value, 10) || 20;
          const goalCap = parseInt(modal.querySelector('#arena-create-goal-cap')?.value, 10) || 0;
          const powerUpFrequency = modal.querySelector('#arena-create-powerup-freq')?.value || 'normal';
          const targetClass = modal.querySelector('#arena-create-target-class').value;

          // Xử lý lọc câu hỏi theo Scope mà giáo viên đã chọn
          let chosenQuestions = [];

          if (activeScope === 'pick_questions') {
            if (pickedQuestionIds.size < 5) {
              alert('Thầy/Cô vui lòng tích chọn ít nhất 5 câu hỏi để khởi tạo đấu trường!');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)';
              }
              return;
            }
            chosenQuestions = loadedQuestions.filter(q => pickedQuestionIds.has(String(q.id || q.stt)));
          } else if (activeScope === 'by_topic') {
            const selTopic = selectTopicEl?.value;
            chosenQuestions = loadedQuestions.filter(q => q.topic === selTopic);
            if (chosenQuestions.length === 0) {
              alert('Không tìm thấy câu hỏi nào thuộc chủ đề đã chọn!');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)';
              }
              return;
            }
          } else if (activeScope === 'by_lesson') {
            if (selectedLessonNames.size === 0) {
              alert('Thầy/Cô vui lòng tích chọn ít nhất một bài học!');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)';
              }
              return;
            }
            chosenQuestions = loadedQuestions.filter(q => selectedLessonNames.has(q.lesson));
            if (chosenQuestions.length === 0) {
              alert('Không tìm thấy câu hỏi nào thuộc các bài học đã chọn!');
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)';
              }
              return;
            }
          } else {
            // Toàn khối
            chosenQuestions = [...loadedQuestions];
          }

          // Tính số lượng câu hỏi
          let qCount = qCountVal === 'all' ? chosenQuestions.length : parseInt(qCountVal, 10);
          if (isNaN(qCount) || qCount <= 0) qCount = 15;
          qCount = Math.min(qCount, chosenQuestions.length);

          closeModal();
          await this.createNewArenaRoom({
            title,
            mode,
            source,
            questions: chosenQuestions,
            qCount,
            timerSec,
            targetClass,
            goalCap,
            powerUpFrequency
          });
        } catch (err) {
          console.error('Lỗi khởi tạo đấu trường:', err);
          alert('Lỗi khởi tạo đấu trường: ' + err.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Khởi Tạo & Vào Phòng Chờ (Host)';
          }
        }
      };
    }
  },

  async createNewArenaRoom({ title, mode, source, questions = null, qCount = 15, timerSec = 20, targetClass = 'all', goalCap = 0, powerUpFrequency = 'normal' }) {
    // 1. Sinh mã PIN 6 số ngẫu nhiên
    const pin = String(Math.floor(100000 + Math.random() * 900000));

    // 2. Lấy câu hỏi theo nguồn nếu chưa truyền vào
    let candidateQuestions = questions;
    if (!candidateQuestions || candidateQuestions.length === 0) {
      if (source.startsWith('pkg_')) {
        const pkgId = source.replace('pkg_', '');
        const pkg = Storage.getAllTeacherContributions().find(p => p.id === pkgId);
        if (pkg && pkg.questions) candidateQuestions = [...pkg.questions];
      } else {
        const grade = source.replace('grade_', '');
        try {
          if (typeof this.loadGradeFn === 'function') {
            candidateQuestions = await this.loadGradeFn(grade);
          } else if (typeof window !== 'undefined' && typeof window.App?.loadGradeData === 'function') {
            candidateQuestions = await window.App.loadGradeData(grade);
          } else {
            const res = await fetch(`data/grade_${grade}.json`);
            if (res.ok) candidateQuestions = await res.json();
          }
        } catch (err) {
          console.warn('Không tải được câu hỏi khối:', grade, err);
        }
      }
    }

    if (!candidateQuestions || candidateQuestions.length === 0) {
      if (typeof alert === 'function') {
        alert('Không tìm thấy câu hỏi cho nguồn đề đã chọn. Vui lòng kiểm tra lại!');
      }
      return null;
    }

    // Xáo trộn và cắt đúng số lượng câu hỏi giáo dục (Decoupled questions)
    const shuffledQuestions = [...candidateQuestions].sort(() => 0.5 - Math.random()).slice(0, qCount);
    const hostUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;

    // 3. Khởi tạo Normalized Session State thông qua GameEngine
    const session = defaultGameEngine.createSession({
      pin,
      hostId: hostUser?.email || hostUser?.username || 'host',
      quizId: source,
      gameMode: mode,
      questions: shuffledQuestions,
      timerSec,
      goalCap,
      powerUpFrequency,
      title: title || 'Đấu Trường TinHocHub',
      targetClass,
      hostName: hostUser?.fullName || 'Thầy/Cô',
      hostEmail: hostUser?.email || ''
    });
    session.pin = pin; // Tương thích ngược
    session.title = session.settings?.title || title || 'Đấu Trường TinHocHub';
    session.targetClass = session.settings?.targetClass || targetClass || 'all';

    // 4. Lưu LocalStorage & Đẩy lên Firebase RTDB
    Storage.saveArenaRoom(session);
    if (typeof CloudSync !== 'undefined' && CloudSync.pushArenaRoomToCloud) {
      CloudSync.pushArenaRoomToCloud(session);
    }

    // Mở màn hình Host (Máy chiếu)
    this.startHostView(session);
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
                <i class="fa-regular fa-copy"></i> Copy Link Trực Tiếp (?game=${escapeHtml(room.pin)})
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
                  <div class="animate-bounce">
                    ${this.renderBlookIcon(blook.id, 'w-12 h-12 rounded-xl', { badge: true })}
                  </div>
                  <span class="text-xs font-bold text-slate-800 dark:text-white truncate w-full text-center">${escapeHtml(p.name)}</span>
                  <span class="text-[9px] text-purple-600 dark:text-purple-400 font-bold truncate w-full text-center">${escapeHtml(blook.name)}</span>
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
        ${this.isBossMode(room.gameMode) ? `
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
                <span id="host-boss-hp-text" class="text-xl font-black text-rose-400 font-mono">${room.metadata?.bossCurrentHp ?? room.bossCurrentHp ?? 1000} / ${room.metadata?.bossMaxHp ?? room.bossMaxHp ?? 1000} HP</span>
              </div>
            </div>

            <!-- Health Bar -->
            <div class="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-rose-500/30">
              <div id="host-boss-hp-fill" class="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300" style="width: ${((room.metadata?.bossCurrentHp ?? room.bossCurrentHp ?? 1000) / (room.metadata?.bossMaxHp ?? room.bossMaxHp ?? 1000)) * 100}%"></div>
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
    // Đồng bộ kết quả câu trả lời của người chơi từ Storage
    if (typeof Storage !== 'undefined' && typeof Storage.getArenaRoom === 'function') {
      const savedRoom = Storage.getArenaRoom(room.pin);
      if (savedRoom && savedRoom.players) {
        room.players = { ...(room.players || {}), ...savedRoom.players };
      }
    }
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

    // Leaderboard Top 5 hiện tại qua GameEngine rankPlayers
    const topPlayers = defaultGameEngine.rankPlayers(room).slice(0, 5);
    const isGoldMode = room.gameMode === 'resource_quest' || room.gameMode === 'gold_quest';

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
              <span class="text-[11px] text-slate-400">${isGoldMode ? 'Vàng 🪙' : 'Điểm ⚡'}</span>
            </div>

            <div class="space-y-2">
              ${topPlayers.map((p, idx) => {
                const blook = this.BLOOKS.find(b => b.id === p.blookId) || this.BLOOKS[0];
                const gold = p.metadata?.gold ?? p.gold ?? 0;
                const val = isGoldMode ? `${gold} 🪙` : `${p.score || 0} đ`;
                return `
                  <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2.5">
                      <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-amber-400 text-slate-900 font-black' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-100 dark:bg-slate-700'} text-xs flex items-center justify-center font-bold">
                        ${idx + 1}
                      </span>
                      ${this.renderBlookIcon(blook.id, 'w-8 h-8 rounded-lg')}
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
    this.cleanupRoomListener();
    const room = this.activeRoom;
    // Đồng bộ toàn bộ điểm và dữ liệu người chơi cuối cùng từ Storage
    if (typeof Storage !== 'undefined' && typeof Storage.getArenaRoom === 'function') {
      const savedRoom = Storage.getArenaRoom(room.pin);
      if (savedRoom && savedRoom.players) {
        room.players = { ...(room.players || {}), ...savedRoom.players };
      }
    }
    room.status = 'game_over';
    room.updatedAt = Date.now();
    this.syncRoomToCloud(room);

    this.playFanfare();

    // Sắp xếp thứ hạng toàn bộ học sinh qua GameEngine rankPlayers
    const sortedPlayers = defaultGameEngine.rankPlayers(room);

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
                <div class="relative mb-2">
                  ${this.renderBlookIcon(top2.blookId, 'w-14 h-14 rounded-2xl', { badge: true })}
                  <span class="absolute -top-2 -left-2 text-lg">🥈</span>
                </div>
                <span class="text-xs font-bold truncate max-w-[100px]">${escapeHtml(top2.name)}</span>
                <span class="text-[10px] text-slate-400 font-mono mb-2">${this.isGoldMode(room.gameMode) ? `${top2.metadata?.gold ?? top2.gold ?? 0} 🪙` : `${top2.score || 0} đ`}</span>
                <div class="w-full h-28 bg-gradient-to-t from-slate-700 to-slate-600 rounded-t-2xl flex items-center justify-center font-black text-xl text-slate-300 border-t-2 border-slate-400 shadow-md">
                  #2
                </div>
              </div>
            ` : '<div class="flex-1"></div>'}

            <!-- Top 1: Vàng (Cao nhất) -->
            ${top1 ? `
              <div class="flex flex-col items-center flex-1 animate-scaleUp">
                <div class="relative mb-2 animate-bounce">
                  ${this.renderBlookIcon(top1.blookId, 'w-20 h-20 rounded-3xl', { badge: true })}
                  <span class="absolute -top-3 -left-2 text-2xl">👑</span>
                </div>
                <span class="text-sm font-black truncate max-w-[120px] text-amber-300">${escapeHtml(top1.name)}</span>
                <span class="text-xs text-amber-400 font-mono font-bold mb-2">${this.isGoldMode(room.gameMode) ? `${top1.metadata?.gold ?? top1.gold ?? 0} 🪙` : `${top1.score || 0} đ`}</span>
                <div class="w-full h-40 bg-gradient-to-t from-amber-600 to-yellow-500 rounded-t-2xl flex items-center justify-center font-black text-3xl text-slate-950 border-t-4 border-amber-200 shadow-2xl">
                  #1
                </div>
              </div>
            ` : ''}

            <!-- Top 3: Đồng -->
            ${top3 ? `
              <div class="flex flex-col items-center flex-1 animate-scaleUp">
                <div class="relative mb-2">
                  ${this.renderBlookIcon(top3.blookId, 'w-12 h-12 rounded-2xl', { badge: true })}
                  <span class="absolute -top-2 -left-2 text-base">🥉</span>
                </div>
                <span class="text-xs font-bold truncate max-w-[90px]">${escapeHtml(top3.name)}</span>
                <span class="text-[10px] text-slate-400 font-mono mb-2">${this.isGoldMode(room.gameMode) ? `${top3.metadata?.gold ?? top3.gold ?? 0} 🪙` : `${top3.score || 0} đ`}</span>
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
                  const val = this.isGoldMode(room.gameMode) ? `${p.metadata?.gold ?? p.gold ?? 0} 🪙` : `${p.score || 0} đ`;
                  return `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition">
                      <td class="py-3 px-3 font-black text-slate-700 dark:text-slate-300">#${idx + 1}</td>
                      <td class="py-3 px-3">
                        <div class="flex items-center gap-2">
                          ${this.renderBlookIcon(blook.id, 'w-8 h-8 rounded-lg')}
                          <span class="text-[10px] font-bold text-slate-500 hidden sm:inline">${escapeHtml(blook.name)}</span>
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
    const targetCls = room.targetClass || room.settings?.targetClass || '';
    if (targetCls && targetCls.includes('|')) {
      const parts = targetCls.split('|');
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
      const val = this.isGoldMode(room.gameMode) ? (p.metadata?.gold ?? p.gold ?? 0) : (p.score || 0);

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
    if (!pin) return;
    pin = String(pin).replace(/[\s\-_]/g, '').trim();
    const dbUrl = this.getBaseDbUrl();

    // Lấy thông tin phòng từ Firebase hoặc Storage
    let room = null;
    try {
      const res = await authedFetch(`${dbUrl}/arena_rooms/${pin}.json`, { cache: 'no-cache' });
      if (res.ok) room = await res.json();
    } catch (e) {
      console.warn('Lỗi kết nối máy chủ Firebase khi tìm phòng đấu trường:', e);
    }

    if (!room) room = Storage.getArenaRoom(pin);

    if (!room) {
      alert(`Không tìm thấy phòng đấu trường có mã PIN [${pin}]. Vui lòng kiểm tra lại!`);
      return;
    }

    // Đảm bảo cấu trúc phòng hợp lệ
    room.players = room.players || {};
    room.pin = room.pin || pin;

    const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const finalName = studentName || currentUser?.fullName || 'Học sinh ẩn danh';
    const uid = (currentUser?.email || currentUser?.username || `player_${Date.now()}`).replace(/[.#$\[\]\/]/g, '_');

    // Khởi tạo PlayerState thông qua GameEngine (Universal + Extensible Metadata)
    const playerState = defaultGameEngine.joinPlayer(room, {
      id: uid,
      uid,
      name: finalName,
      blookId
    });
    playerState.uid = uid;
    playerState.email = currentUser?.email || '';
    playerState.school = currentUser?.school || '';
    playerState.className = currentUser?.className || '';

    this.playerInfo = playerState;
    this.activeRoom = room;
    this.activeRole = 'player';

    // Cập nhật người chơi vào room và lưu vào Storage
    room.players = room.players || {};
    room.players[uid] = this.playerInfo;
    if (typeof Storage !== 'undefined' && typeof Storage.saveArenaRoom === 'function') {
      Storage.saveArenaRoom(room);
    }

    // Đăng ký người chơi vào Firebase
    try {
      await authedFetch(`${dbUrl}/arena_rooms/${pin}/players/${uid}.json`, {
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
    const rarInfo = RARITY[blook.rarity] || RARITY.common;
    const playersList = Object.values(room.players || {});

    this.container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-6 py-4 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl space-y-6">
          
          <!-- Header Trạng thái kết nối hàng đợi -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div class="flex items-center gap-2.5">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-black uppercase tracking-wider">
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span> Đang Ở Hàng Đợi Phòng Chờ
              </span>
              <span class="px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono text-xs font-black">
                PIN: ${escapeHtml(room.pin)}
              </span>
            </div>
            <div class="text-xs font-bold text-slate-500 dark:text-slate-400">
              👥 Hàng đợi: <strong id="lobby-player-queue-count" class="text-purple-600 dark:text-purple-400 font-black">${playersList.length}</strong> người chơi
            </div>
          </div>

          <!-- Thông tin người chơi & Linh thú đại diện hiện tại -->
          <div class="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 dark:from-slate-900 dark:via-purple-950/30 dark:to-slate-900 border border-purple-200/80 dark:border-purple-800/50 flex flex-col sm:flex-row items-center gap-4">
            <div id="lobby-selected-blook-avatar" class="shrink-0 animate-bounce">
              ${this.renderBlookIcon(blook.id, 'w-20 h-20 rounded-3xl', { badge: true })}
            </div>
            <div class="min-w-0 flex-1 text-center sm:text-left space-y-1">
              <div class="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Chiến Binh: <span class="text-slate-800 dark:text-white font-black">${escapeHtml(this.playerInfo.name)}</span>
              </div>
              <div class="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h3 id="lobby-selected-blook-name" class="text-lg sm:text-xl font-black text-slate-800 dark:text-white">${escapeHtml(blook.name)}</h3>
                <span id="lobby-selected-blook-rarity" class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r ${rarInfo.badge} text-white shadow-xs">
                  ${escapeHtml(rarInfo.label)}
                </span>
              </div>
              <p id="lobby-selected-blook-desc" class="text-xs text-slate-600 dark:text-slate-400 font-medium">
                ✨ Tuyệt kỹ: ${escapeHtml(blook.desc)}
              </p>
            </div>
            <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700 text-center sm:text-right shrink-0">
              <span class="text-[10px] text-slate-400 font-bold uppercase block">Đấu Trường</span>
              <strong class="text-xs text-slate-800 dark:text-white block max-w-[180px] truncate">${escapeHtml(room.title)}</strong>
              <span class="text-[11px] text-amber-600 dark:text-amber-400 font-black block mt-0.5">${this.getModeTitle(room.gameMode)}</span>
            </div>
          </div>

          <!-- BỘ CHỌN / ĐỔI LINH THÚ BLOOK TRỰC TIẾP TRONG HÀNG ĐỢI PHÒNG CHỜ -->
          <div class="space-y-3 text-left">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label class="text-xs sm:text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-wand-magic-sparkles text-purple-600"></i>
                <span>Đổi Nhân Vật Linh Thú Blook Trong Lúc Chờ (${this.BLOOKS.length} Nhân Vật)</span>
              </label>
              <button type="button" id="btn-arena-random-blook" class="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/70 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs">
                <i class="fa-solid fa-shuffle"></i> Chọn Ngẫu Nhiên
              </button>
            </div>

            <!-- Bộ Lọc Chủ Đề Linh Thú -->
            <div id="arena-blook-cat-tabs" class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              ${AVATAR_CATEGORIES.map(c => `
                <button type="button" data-blook-cat="${c.id}" class="blook-cat-btn px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition cursor-pointer ${c.id === 'all' ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
                  ${c.icon} ${escapeHtml(c.name)}
                </button>
              `).join('')}
            </div>

            <!-- Lưới 44 Linh Thú Vector SVG -->
            <div id="arena-blook-grid" class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 max-h-72 overflow-y-auto">
              ${this.BLOOKS.map(b => {
                const isSelected = b.id === blook.id;
                const rar = RARITY[b.rarity] || RARITY.common;
                return `
                  <button type="button" data-blook-id="${b.id}" data-blook-cat="${b.category || 'animals'}" class="blook-select-btn p-2 rounded-2xl flex flex-col items-center gap-1 transition cursor-pointer ${isSelected ? 'bg-purple-100 dark:bg-purple-900/70 ring-2 ring-purple-500 scale-[1.04]' : 'hover:bg-slate-200/70 dark:hover:bg-slate-800'}" title="${escapeHtml(b.name)} (${rar.label}) - ${escapeHtml(b.desc)}">
                    <div class="pointer-events-none">
                      ${this.renderBlookIcon(b.id, 'w-12 h-12 rounded-xl')}
                    </div>
                    <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate w-full text-center leading-tight pointer-events-none">${escapeHtml(b.name)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Danh sách bạn học đang cùng ở trong hàng đợi -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700 text-left space-y-2">
            <span class="text-[11px] font-black uppercase text-slate-400 block">Các chiến binh đang ở phòng chờ</span>
            <div id="lobby-players-list" class="flex flex-wrap gap-2">
              ${playersList.map(p => {
                const pb = this.BLOOKS.find(x => x.id === p.blookId) || this.BLOOKS[0];
                const isMe = (p.id || p.uid) === this.playerInfo.uid;
                return `
                  <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${isMe ? 'bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} text-xs">
                    ${this.renderBlookIcon(pb.id, 'w-5 h-5 rounded-md')}
                    <span class="font-bold text-slate-700 dark:text-slate-200">${escapeHtml(p.name)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Footer hành động ở phòng chờ -->
          <div class="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            ${room.isSoloPractice ? `
              <button type="button" id="btn-solo-start-from-lobby" class="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-white font-black text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-play"></i> BẮT ĐẦU VÀO TRẬN ĐẤU NGAY
              </button>
            ` : `
              <div class="flex-1 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center justify-center sm:justify-start gap-2">
                <i class="fa-solid fa-spinner fa-spin text-base"></i> Đã sẵn sàng! Đang đợi Thầy/Cô bấm Bắt đầu trên máy chiếu...
              </div>
            `}
            <button type="button" id="btn-player-leave-room" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 text-xs font-bold transition cursor-pointer">
              Rời Phòng Chờ
            </button>
          </div>
        </div>
      </div>
    `;

    // Hàm cập nhật Linh Thú Blook của học sinh ngay trong phòng chờ & đồng bộ lên Firebase
    const selectLobbyBlook = async (newBlookId, playSound = true) => {
      const found = this.BLOOKS.find(x => x.id === newBlookId) || this.BLOOKS[0];
      this.playerInfo.blookId = found.id;
      if (room.players && room.players[this.playerInfo.uid]) {
        room.players[this.playerInfo.uid].blookId = found.id;
      }

      // Lưu vào LocalStorage
      Storage.saveArenaPlayer({
        pin: room.pin,
        name: this.playerInfo.name,
        blookId: found.id
      });
      if (typeof Storage.saveArenaRoom === 'function') {
        Storage.saveArenaRoom(room);
      }

      // Cập nhật giao diện thẻ preview & lưới
      this.container.querySelectorAll('.blook-select-btn').forEach(b => {
        const match = b.getAttribute('data-blook-id') === found.id;
        b.classList.toggle('bg-purple-100', match);
        b.classList.toggle('dark:bg-purple-900/70', match);
        b.classList.toggle('ring-2', match);
        b.classList.toggle('ring-purple-500', match);
        b.classList.toggle('scale-[1.04]', match);
      });

      const rar = RARITY[found.rarity] || RARITY.common;
      const avatarEl = document.getElementById('lobby-selected-blook-avatar');
      const nameEl = document.getElementById('lobby-selected-blook-name');
      const rarityEl = document.getElementById('lobby-selected-blook-rarity');
      const descEl = document.getElementById('lobby-selected-blook-desc');

      if (avatarEl) avatarEl.innerHTML = this.renderBlookIcon(found.id, 'w-20 h-20 rounded-3xl', { badge: true });
      if (nameEl) nameEl.textContent = found.name;
      if (rarityEl) {
        rarityEl.className = `px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r ${rar.badge} text-white shadow-xs`;
        rarityEl.textContent = rar.label;
      }
      if (descEl) descEl.textContent = `✨ Tuyệt kỹ: ${found.desc}`;

      // Cập nhật danh sách hàng đợi nhỏ
      const listEl = document.getElementById('lobby-players-list');
      if (listEl) {
        listEl.innerHTML = Object.values(room.players || {}).map(p => {
          const pb = this.BLOOKS.find(x => x.id === p.blookId) || this.BLOOKS[0];
          const isMe = (p.id || p.uid) === this.playerInfo.uid;
          return `
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${isMe ? 'bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} text-xs">
              ${this.renderBlookIcon(pb.id, 'w-5 h-5 rounded-md')}
              <span class="font-bold text-slate-700 dark:text-slate-200">${escapeHtml(p.name)}</span>
            </div>
          `;
        }).join('');
      }

      if (playSound) this.playTone(620, 0.08, 'sine');

      // Đồng bộ tức thì lên Firebase để màn hình Máy chiếu của Giáo viên đổi nhân vật theo thời gian thực
      if (!room.isSoloPractice) {
        const dbUrl = this.getBaseDbUrl();
        try {
          await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blookId: found.id })
          });
        } catch {}
      }
    };

    // Gắn sự kiện click cho từng nút nhân vật
    this.container.querySelectorAll('.blook-select-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-blook-id');
        if (id) selectLobbyBlook(id, true);
      };
    });

    // Gắn sự kiện lọc danh mục nhân vật
    this.container.querySelectorAll('.blook-cat-btn').forEach(catBtn => {
      catBtn.onclick = (e) => {
        e.preventDefault();
        const cat = catBtn.getAttribute('data-blook-cat') || 'all';
        this.container.querySelectorAll('.blook-cat-btn').forEach(b => {
          const active = b.getAttribute('data-blook-cat') === cat;
          b.className = `blook-cat-btn px-3 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition cursor-pointer ${active ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`;
        });
        this.container.querySelectorAll('.blook-select-btn').forEach(item => {
          const itemCat = item.getAttribute('data-blook-cat');
          item.style.display = (cat === 'all' || itemCat === cat) ? '' : 'none';
        });
        this.playTone(500, 0.05, 'triangle');
      };
    });

    // Nút Chọn Ngẫu Nhiên
    const btnRandomBlook = document.getElementById('btn-arena-random-blook');
    if (btnRandomBlook) {
      btnRandomBlook.onclick = (e) => {
        e.preventDefault();
        const rId = randomAvatarId();
        selectLobbyBlook(rId, true);
        const targetBtn = this.container.querySelector(`.blook-select-btn[data-blook-id="${rId}"]`);
        if (targetBtn && targetBtn.style.display !== 'none') {
          targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    }

    // Nút Bắt đầu ngay (nếu đang ở chế độ Tự Luyện Solo)
    const btnSoloStart = document.getElementById('btn-solo-start-from-lobby');
    if (btnSoloStart) {
      btnSoloStart.onclick = () => {
        room.status = 'playing';
        room.currentQuestionIndex = 0;
        this.playStart();
        this.renderPlayerQuestionView(room.questions[0]);
      };
    }

    // Nút Rời phòng chờ
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
    this.questionStartTime = Date.now();

    const isGoldMode = room.gameMode === 'resource_quest' || room.gameMode === 'gold_quest';
    const currentGold = this.playerInfo.metadata?.gold ?? this.playerInfo.gold ?? 0;
    const currentShields = this.playerInfo.metadata?.shields ?? 0;
    const currentScore = this.playerInfo.score || 0;
    const currentMultiplier = this.playerInfo.metadata?.multiplier || 1;

    this.container.innerHTML = `
      <div class="max-w-lg mx-auto space-y-4 py-4 animate-fadeIn">
        
        <!-- INJECTED MODE HUD: Tách biệt hoàn toàn trên question renderer -->
        <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div class="flex items-center gap-2">
            ${this.renderBlookIcon(blook.id, 'w-8 h-8 rounded-lg')}
            <span class="text-xs font-black text-slate-800 dark:text-white truncate max-w-[120px]">${escapeHtml(this.playerInfo.name)}</span>
          </div>

          <div class="flex items-center gap-2 font-mono font-bold text-xs">
            ${isGoldMode ? `
              <span class="text-amber-500 font-black"><i class="fa-solid fa-coins mr-1"></i>${currentGold}</span>
              ${currentShields > 0 ? `<span class="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black"><i class="fa-solid fa-shield-halved mr-1"></i>${currentShields}</span>` : ''}
            ` : `
              <span class="text-purple-600 font-black"><i class="fa-solid fa-bolt mr-1"></i>${currentScore} đ</span>
              ${currentMultiplier > 1 ? `<span class="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black">x${currentMultiplier}</span>` : ''}
            `}
            <span class="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] font-bold">Câu ${qIdx}/${room.totalQuestions || (room.questions || []).length || 15}</span>
            <button type="button" id="btn-player-quit-match" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 text-slate-500 hover:text-rose-600 text-[10px] font-bold transition cursor-pointer" title="Rời trận đấu">
              <i class="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>

        <!-- NỘI DUNG CÂU HỎI TIÊU CHUẨN (AGNOSTIC QUESTION RENDERER) -->
        <div class="p-5 rounded-3xl bg-slate-900 text-white text-center shadow-lg border border-white/10 min-h-[90px] flex items-center justify-center">
          <p class="text-sm sm:text-base font-bold leading-relaxed">${escapeHtml(q.question)}</p>
        </div>

        <!-- 4 NÚT BẤM LỰA CHỌN PHƯƠNG ÁN (A, B, C, D) -->
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

    const btnQuit = document.getElementById('btn-player-quit-match');
    if (btnQuit) {
      btnQuit.onclick = () => {
        if (confirm('Bạn có chắc chắn muốn rời khỏi trận đấu này không?')) {
          this.cleanupRoomListener();
          this.renderMainView();
        }
      };
    }
  },

  async playerSubmitAnswer(ansIdx, q) {
    if (this.playerInfo.answeredInCurrentQ) return;
    this.playerInfo.answeredInCurrentQ = true;
    this.playerInfo.currentAnswer = ansIdx;

    if (navigator.vibrate) navigator.vibrate([40]);

    const responseTime = Date.now() - (this.questionStartTime || Date.now());
    const room = this.activeRoom;

    // AUTHORITATIVE HOST / SERVER EVALUATION THÔNG QUA GAME ENGINE
    let evalResult;
    try {
      evalResult = defaultGameEngine.submitAnswer(room, this.playerInfo.uid, ansIdx, responseTime);
    } catch (e) {
      console.warn('GameEngine evaluate answer fallback:', e);
      evalResult = { isCorrect: false, rewardPayload: { rewardOptions: [] } };
    }

    const isCorrect = evalResult.isCorrect;
    const dbUrl = this.getBaseDbUrl();

    // Đồng bộ lại local playerInfo từ room.players
    if (room.players[this.playerInfo.uid]) {
      this.playerInfo = { ...room.players[this.playerInfo.uid], uid: this.playerInfo.uid };
    }
    if (typeof Storage !== 'undefined' && typeof Storage.saveArenaRoom === 'function') {
      Storage.saveArenaRoom(room);
    }

    if (isCorrect) {
      this.playChime();

      // Đẩy cập nhật lên Firebase
      try {
        await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            score: this.playerInfo.score,
            streak: this.playerInfo.streak,
            correctCount: this.playerInfo.correctCount,
            currentAnswer: ansIdx,
            metadata: this.playerInfo.metadata,
            inventory: this.playerInfo.inventory
          })
        });

        if (room.gameMode === 'boss_raid' || room.gameMode === 'boss_hunt') {
          await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/metadata/bossCurrentHp.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(room.metadata?.bossCurrentHp || 0)
          });
        }
      } catch {}

      // Nếu có rewardOptions (như 3 rương báu Resource Quest) -> Mở giao diện rương
      if (evalResult.rewardPayload?.rewardOptions && evalResult.rewardPayload.rewardOptions.length > 0) {
        this.renderPlayerChestChoice(evalResult.rewardPayload.rewardOptions);
      } else {
        this.renderPlayerFeedback(true, 'Chính xác! Xuất sắc lắm!');
      }

    } else {
      this.playWrong();
      try {
        await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
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

  renderPlayerChestChoice(rewardOptions = []) {
    this.playChest();
    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-6 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-yellow-600 text-white shadow-2xl space-y-4">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 text-xs font-bold uppercase tracking-wider">
            🎉 Trả Lời Đúng!
          </div>
          <h3 class="text-xl font-black">CHỌN 1 TRONG 3 RƯƠNG BÁU</h3>
          <p class="text-xs text-white/90">Mở rương để nhận Vàng, Nhân đôi số vàng, Khiên thần hoặc Cướp vàng của bạn khác!</p>

          <!-- 3 Rương Báu -->
          <div class="grid grid-cols-3 gap-3 pt-4">
            ${[0, 1, 2].map(n => `
              <button type="button" data-pick-chest="${n}" class="p-4 rounded-2xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex flex-col items-center gap-2 transition transform hover:scale-105 active:scale-95 shadow-lg">
                <span class="text-4xl animate-bounce">📦</span>
                <span class="text-xs font-black uppercase">Rương ${n + 1}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-pick-chest]').forEach(btn => {
      btn.onclick = () => {
        const chestIdx = parseInt(btn.getAttribute('data-pick-chest'), 10);
        this.playerOpenChestReward(chestIdx);
      };
    });
  },

  async playerOpenChestReward(chestIndex = 0) {
    const room = this.activeRoom;

    // TRIGGER_ACTION: CHEST_PICK qua GameEngine
    const delta = defaultGameEngine.triggerAction(room, {
      type: 'CHEST_PICK',
      playerId: this.playerInfo.uid,
      payload: { chestIndex }
    });

    if (room.players[this.playerInfo.uid]) {
      this.playerInfo = { ...room.players[this.playerInfo.uid], uid: this.playerInfo.uid };
    }
    if (typeof Storage !== 'undefined' && typeof Storage.saveArenaRoom === 'function') {
      Storage.saveArenaRoom(room);
    }

    const dbUrl = this.getBaseDbUrl();
    try {
      await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: this.playerInfo.score,
          metadata: this.playerInfo.metadata
        })
      });
    } catch {}

    if (delta.reward?.type === 'steal') {
      this.renderPlayerStealTargetPicker();
    } else {
      this.renderPlayerFeedback(true, delta.broadcastMessage || `Đã mở rương thành công!`);
    }
  },

  renderPlayerStealTargetPicker() {
    const room = this.activeRoom;
    const otherPlayers = Object.values(room.players || {}).filter(p => (p.id || p.uid) !== this.playerInfo.uid);

    this.playSteal();

    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-5 py-6 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white shadow-2xl border border-white/10 space-y-4">
          <span class="text-3xl animate-pulse">⚡</span>
          <h3 class="text-lg font-black text-amber-300">CHỌN NGƯỜI CHƠI ĐỂ CƯỚP VÀNG</h3>
          <p class="text-xs text-slate-300">Em sẽ cướp được 20% số vàng của bạn đó (nếu bạn chưa kích hoạt khiên bảo vệ)!</p>

          <div class="space-y-2 max-h-52 overflow-y-auto pt-2">
            ${otherPlayers.length === 0 ? `
              <p class="text-xs text-slate-400 py-4">Chưa có người chơi khác trong phòng để cướp.</p>
            ` : otherPlayers.map(p => {
              const gold = p.metadata?.gold ?? p.gold ?? 0;
              const hasShield = (p.metadata?.shields ?? 0) > 0;
              return `
                <button type="button" data-steal-target="${p.id || p.uid}" class="w-full p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between transition text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-bold">${escapeHtml(p.name)}</span>
                    ${hasShield ? '<span class="text-[10px] text-blue-400">🛡️ Có Khiên</span>' : ''}
                  </div>
                  <span class="font-mono text-amber-400 font-bold">${gold} 🪙</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-steal-target]').forEach(btn => {
      btn.onclick = async () => {
        const targetId = btn.getAttribute('data-steal-target');
        // TRIGGER_ACTION: STEAL_EXECUTE (Giao dịch cướp vàng nguyên tử trên GameEngine)
        const delta = defaultGameEngine.triggerAction(room, {
          type: 'STEAL_EXECUTE',
          playerId: this.playerInfo.uid,
          targetPlayerId: targetId
        });

        if (room.players[this.playerInfo.uid]) {
          this.playerInfo = { ...room.players[this.playerInfo.uid], uid: this.playerInfo.uid };
        }
        if (typeof Storage !== 'undefined' && typeof Storage.saveArenaRoom === 'function') {
          Storage.saveArenaRoom(room);
        }

        const dbUrl = this.getBaseDbUrl();
        try {
          // Cập nhật cả 2 người chơi atomic lên Firebase
          await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${this.playerInfo.uid}/metadata.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.playerInfo.metadata)
          });
          if (room.players[targetId]) {
            await authedFetch(`${dbUrl}/arena_rooms/${room.pin}/players/${targetId}/metadata.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(room.players[targetId].metadata)
            });
          }
        } catch {}

        this.renderPlayerFeedback(true, delta.broadcastMessage || 'Đã hoàn tất hành động!');
      };
    });
  },

  renderPlayerFeedback(isCorrect, message) {
    const room = this.activeRoom;
    const isSolo = Boolean(room && room.isSoloPractice);
    if (isSolo) {
      this.simulateSoloAiTurn(room);
    }

    const qIdx = (room?.currentQuestionIndex || 0) + 1;
    const totalQ = room?.totalQuestions || (room?.questions || []).length || 15;
    const isLastQ = qIdx >= totalQ;
    const isBoss = room && this.isBossMode(room.gameMode);
    const bossHp = room?.metadata?.bossCurrentHp ?? room?.bossCurrentHp ?? 0;
    const bossMax = room?.metadata?.bossMaxHp ?? room?.bossMaxHp ?? 1000;
    const bossPct = bossMax > 0 ? Math.max(0, Math.min(100, Math.round((bossHp / bossMax) * 100))) : 0;

    let soloHudHtml = '';
    if (isSolo && room) {
      const sorted = defaultGameEngine.rankPlayers(room);
      const isGold = this.isGoldMode(room.gameMode);
      soloHudHtml = `
        <div class="p-4 rounded-2xl bg-black/25 text-left space-y-3 mt-3">
          ${isBoss ? `
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-black">
                <span>👾 Máu Siêu Trùm Bug</span>
                <span>${bossHp} / ${bossMax} HP (${bossPct}%)</span>
              </div>
              <div class="w-full h-3 rounded-full bg-black/40 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all duration-500" style="width:${bossPct}%"></div>
              </div>
            </div>
          ` : ''}
          <div class="text-[11px] font-black uppercase text-white/80 flex items-center justify-between">
            <span>Bảng Xếp Hạng Tạm Thời (Câu ${qIdx}/${totalQ})</span>
            <span>${isGold ? '🪙 Vàng' : '⚡ Điểm'}</span>
          </div>
          <div class="space-y-1.5">
            ${sorted.slice(0, 4).map((p, idx) => {
              const val = isGold ? `${p.metadata?.gold ?? p.gold ?? 0} 🪙` : `${p.score || 0} đ`;
              const isMe = (p.id || p.uid) === this.playerInfo?.uid;
              return `
                <div class="px-3 py-1.5 rounded-xl ${isMe ? 'bg-white/25 font-black' : 'bg-white/10'} flex items-center justify-between text-xs">
                  <span>#${idx + 1} ${escapeHtml(p.name)}</span>
                  <span class="font-mono font-black">${val}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="max-w-md mx-auto text-center space-y-6 py-8 animate-fadeIn">
        <div class="p-6 sm:p-8 rounded-3xl ${isCorrect ? 'bg-emerald-600' : 'bg-rose-600'} text-white shadow-2xl space-y-4">
          <div class="text-5xl animate-bounce">
            ${isCorrect ? '🎉' : '❌'}
          </div>
          <h3 class="text-xl font-black">${isCorrect ? 'CHÍNH XÁC!' : 'CHƯA ĐÚNG!'}</h3>
          <p class="text-xs text-white/90 leading-relaxed">${escapeHtml(message)}</p>

          ${soloHudHtml}

          ${isSolo ? `
            <div class="pt-4 border-t border-white/20 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              ${(!isLastQ && (!isBoss || bossHp > 0)) ? `
                <button type="button" id="btn-solo-next-q" class="w-full sm:flex-1 py-3 px-4 rounded-2xl bg-white text-slate-900 hover:bg-amber-100 font-black text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                  Câu Tiếp Theo (${qIdx + 1}/${totalQ}) <i class="fa-solid fa-arrow-right"></i>
                </button>
              ` : ''}
              <button type="button" id="btn-solo-finish-game" class="w-full sm:w-auto py-3 px-4 rounded-2xl bg-black/30 hover:bg-black/45 text-white font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-flag-checkered"></i> ${isLastQ || (isBoss && bossHp <= 0) ? 'Xem Bảng Vinh Danh Chung Cuộc' : 'Kết Thúc Sớm'}
              </button>
            </div>
          ` : `
            <div class="pt-4 border-t border-white/20 text-xs font-bold flex items-center justify-center gap-2">
              <i class="fa-solid fa-spinner fa-spin"></i> Đang chờ câu tiếp theo từ Thầy/Cô...
            </div>
          `}
        </div>
      </div>
    `;

    if (isSolo && room) {
      const btnNext = document.getElementById('btn-solo-next-q');
      if (btnNext) {
        btnNext.onclick = () => {
          room.currentQuestionIndex = (room.currentQuestionIndex || 0) + 1;
          this.playerInfo.answeredInCurrentQ = false;
          this.playerInfo.currentAnswer = null;
          const nextQ = room.questions[room.currentQuestionIndex];
          if (nextQ) {
            this.renderPlayerQuestionView(nextQ);
          } else {
            room.status = 'game_over';
            this.renderPlayerGameOver();
          }
        };
      }
      const btnFinish = document.getElementById('btn-solo-finish-game');
      if (btnFinish) {
        btnFinish.onclick = () => {
          room.status = 'game_over';
          this.renderPlayerGameOver();
        };
      }
    }
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
        let remote = null;
        try {
          const res = await authedFetch(roomUrl, { cache: 'no-cache' });
          if (res.ok) remote = await res.json();
        } catch {}

        if (!remote && typeof Storage !== 'undefined' && typeof Storage.getArenaRoom === 'function') {
          remote = Storage.getArenaRoom(pin);
        }

        if (remote) {
          this.handleRemoteRoomUpdate(remote);
        }
      } catch {}
    }, 1200);
  },

  handleRemoteRoomUpdate(remoteRoom) {
    if (!remoteRoom) return;
    const oldStatus = this.activeRoom ? this.activeRoom.status : null;
    const oldQIndex = this.activeRoom ? this.activeRoom.currentQuestionIndex : -1;
    this.activeRoom = remoteRoom;

    // Đảm bảo playerInfo và blookId vừa chọn ở hàng đợi không bị ghi đè khi nhận remoteRoom
    if (this.activeRole === 'player' && this.playerInfo) {
      remoteRoom.players = remoteRoom.players || {};
      const currentChosenBlook = this.playerInfo.blookId;
      if (!remoteRoom.players[this.playerInfo.uid]) {
        remoteRoom.players[this.playerInfo.uid] = this.playerInfo;
      } else {
        this.playerInfo = {
          ...remoteRoom.players[this.playerInfo.uid],
          uid: this.playerInfo.uid,
          blookId: currentChosenBlook || remoteRoom.players[this.playerInfo.uid].blookId
        };
        remoteRoom.players[this.playerInfo.uid].blookId = this.playerInfo.blookId;
      }

      if (remoteRoom.status === 'lobby') {
        const playersArr = Object.values(remoteRoom.players || {});
        const qCountEl = document.getElementById('lobby-player-queue-count');
        if (qCountEl) qCountEl.textContent = playersArr.length;
        const listEl = document.getElementById('lobby-players-list');
        if (listEl) {
          listEl.innerHTML = playersArr.map(p => {
            const pb = this.BLOOKS.find(x => x.id === p.blookId) || this.BLOOKS[0];
            const isMe = (p.id || p.uid) === this.playerInfo.uid;
            return `
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${isMe ? 'bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-700' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'} text-xs">
                ${this.renderBlookIcon(pb.id, 'w-5 h-5 rounded-md')}
                <span class="font-bold text-slate-700 dark:text-slate-200">${escapeHtml(p.name)}</span>
              </div>
            `;
          }).join('');
        }
      }
    }

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
              <div class="animate-bounce">
                ${this.renderBlookIcon(blook.id, 'w-12 h-12 rounded-xl', { badge: true })}
              </div>
              <span class="text-xs font-bold text-slate-800 dark:text-white truncate w-full text-center">${escapeHtml(p.name)}</span>
              <span class="text-[9px] text-purple-600 dark:text-purple-400 font-bold truncate w-full text-center">${escapeHtml(blook.name)}</span>
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
      if (this.isBossMode(remoteRoom.gameMode)) {
        const hpText = document.getElementById('host-boss-hp-text');
        const hpFill = document.getElementById('host-boss-hp-fill');
        const currentHp = remoteRoom.metadata?.bossCurrentHp ?? remoteRoom.bossCurrentHp ?? 0;
        const maxHp = remoteRoom.metadata?.bossMaxHp ?? remoteRoom.bossMaxHp ?? 1000;
        if (hpText) hpText.textContent = `${currentHp} / ${maxHp} HP`;
        if (hpFill && maxHp > 0) hpFill.style.width = `${Math.max(0, Math.min(100, (currentHp / maxHp) * 100))}%`;
      }
    }

    // Xử lý chuyển cảnh phía Học Sinh khi Host thay đổi trạng thái
    if (this.activeRole === 'player') {
      if (remoteRoom.status === 'playing' && (oldStatus !== 'playing' || oldQIndex !== remoteRoom.currentQuestionIndex)) {
        this.playerInfo.answeredInCurrentQ = false;
        this.playerInfo.currentAnswer = null;
        const q = remoteRoom.questions[remoteRoom.currentQuestionIndex];
        if (q) this.renderPlayerQuestionView(q);
      } else if (remoteRoom.status === 'question_result' && oldStatus !== 'question_result') {
        if (!this.playerInfo.answeredInCurrentQ) {
          this.renderPlayerFeedback(false, 'Hết thời gian trả lời câu hỏi này! Hãy chuẩn bị cho câu tiếp theo.');
        }
      } else if (remoteRoom.status === 'game_over' && oldStatus !== 'game_over') {
        this.renderPlayerGameOver();
      }
    }
  },

  renderPlayerGameOver() {
    const room = this.activeRoom;
    const sorted = defaultGameEngine.rankPlayers(room);

    if (room.isSoloPractice && typeof Storage !== 'undefined' && typeof Storage.saveArenaHistory === 'function') {
      Storage.saveArenaHistory({
        pin: room.pin,
        title: room.title,
        gameMode: room.gameMode,
        totalQuestions: room.totalQuestions,
        playerCount: sorted.length,
        rankings: sorted,
        finishedAt: Date.now()
      });
    }

    const myRank = sorted.findIndex(p => (p.id || p.uid) === this.playerInfo.uid) + 1;
    this.playFanfare();

    const isGold = this.isGoldMode(room.gameMode);
    const totalVal = isGold
      ? `${this.playerInfo.metadata?.gold ?? this.playerInfo.gold ?? 0} 🪙`
      : `${this.playerInfo.score || 0} đ`;

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
              <span class="text-slate-400 block">${isGold ? 'Tổng Vàng' : 'Tổng Điểm'}</span>
              <span class="text-base font-bold text-amber-400 font-mono mt-1 block">${totalVal}</span>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row gap-2.5">
            ${room.isSoloPractice ? `
              <button id="btn-player-replay-solo" class="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer">
                🔄 Chơi Lại
              </button>
            ` : ''}
            <button id="btn-player-finish-back" class="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 font-black text-xs transition cursor-pointer">
              Về Trang Chủ Đấu Trường
            </button>
          </div>
        </div>
      </div>
    `;

    const btnReplay = document.getElementById('btn-player-replay-solo');
    if (btnReplay) {
      btnReplay.onclick = () => {
        this.cleanupRoomListener();
        this.startSoloArenaGame(room.gameMode, this.playerInfo?.blookId, this.playerInfo?.name);
      };
    }

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
    authedFetch(`${dbUrl}/arena_rooms/${room.pin}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    }).catch(() => {});
  },

  isGoldMode(mode) {
    return mode === 'resource_quest' || mode === 'gold_quest';
  },

  isBossMode(mode) {
    return mode === 'boss_hunt' || mode === 'boss_raid';
  },

  isSpeedMode(mode) {
    return mode === 'speed_race' || mode === 'speed_racer';
  },

  isClassicMode(mode) {
    return mode === 'classic' || mode === 'classic_kahoot';
  },

  getModeTitle(mode) {
    switch (mode) {
      case 'resource_quest':
      case 'gold_quest':
        return '🪙 Đào Vàng & Rương Báu (Resource Quest)';
      case 'speed_race':
      case 'speed_racer':
        return '🏎️ Đua Top Tốc Độ (Speed Race)';
      case 'boss_hunt':
      case 'boss_raid':
        return '👾 Săn Boss Diệt Bug (Boss Raid)';
      case 'classic':
      case 'classic_kahoot':
        return '⚡ Tốc Độ Cổ Điển (Classic Kahoot)';
      default:
        return 'Đấu Trường Trí Tuệ';
    }
  }
};

if (typeof window !== "undefined") window.Arena = Arena;
export default Arena;