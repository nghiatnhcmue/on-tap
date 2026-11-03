/**
 * TinHocHub - RandomPicker (Bộ Công Cụ Random & Mini-Game Lớp Học Đỉnh Cao)
 * Tích hợp 5 tựa game ngẫu nhiên phục vụ giảng dạy, gọi học sinh & chia nhóm:
 * 1. 🎡 Vòng Quay May Mắn (Lucky Wheel / Wheel of Names Canvas)
 * 2. 🎰 Máy Quay Xèng (Arcade Slot Machine 1-3 Reels)
 * 3. 🎁 Hộp Quà Bí Ẩn (Mystery Lucky Boxes with Challenges/Rewards)
 * 4. 💣 Quả Bom Nổ Chậm (Hot Potato Bomb Countdown Timer)
 * 5. 👥 Chia Nhóm Tự Động (Group / Team Generator with Random Mascot Names)
 */

import { Storage } from './storage.js?v=20261102_82';
import { escapeHtml as importedEscapeHtml } from './utils.js?v=20261102_82';

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

// ============================================================================
// 1. SOUND FX SYNTHESIZER (WEB AUDIO API KHÔNG CẦN FILE NGOÀI)
// ============================================================================
const SoundFX = {
  ctx: null,
  isMuted: false,

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },

  playTick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {}
  },

  playSlotTick() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(540, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {}
  },

  playBoxOpen() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(950, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {}
  },

  playBoom() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.15));
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.45);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch {}
  },

  playFanfare() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const delays = [0, 90, 180, 270];
    notes.forEach((f, idx) => {
      setTimeout(() => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.4);
        } catch {}
      }, delays[idx]);
    });
  },

  playAlarm() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.15);
        } catch {}
      }, i * 200);
    }
  }
};

// ============================================================================
// 2. MAIN RANDOM PICKER CONTROLLER
// ============================================================================
export const RandomPicker = {
  container: null,
  manifest: null,
  loadGradeFn: null,

  // Trạng thái chung
  currentMode: 'wheel', // 'wheel' | 'slot' | 'boxes' | 'bomb' | 'teams'
  rawNames: [],
  activeNames: [],
  eliminatedNames: [],
  pickCount: 1,
  eliminationMode: true,
  spinDurationSec: 5,
  thinkingTimerSec: 30,
  includeQuestion: false,
  questionGrade: '12',
  cachedQuestions: {},

  // Biến điều khiển từng game
  isSpinning: false,
  wheelAngle: 0,
  wheelAnimId: null,
  bombTimerInterval: null,
  thinkingTimerInterval: null,
  thinkingTimeLeft: 0,

  // Bảng màu rực rỡ cho vòng quay
  PALETTE: [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16',
    '#06B6D4', '#A855F7'
  ],

  // Danh sách tên linh thú chia nhóm
  MASCOTS: [
    { name: 'Sư Tử Vàng', icon: '🦁', color: 'from-amber-500 to-yellow-600' },
    { name: 'Rồng Thần', icon: '🐉', color: 'from-rose-500 to-red-600' },
    { name: 'Đại Bàng Lửa', icon: '🦅', color: 'from-orange-500 to-amber-600' },
    { name: 'Tia Chớp Xanh', icon: '⚡', color: 'from-blue-500 to-indigo-600' },
    { name: 'Sói Bạc', icon: '🐺', color: 'from-slate-500 to-slate-700' },
    { name: 'Cá Mập Sát Thủ', icon: '🦈', color: 'from-cyan-500 to-blue-600' },
    { name: 'Kỳ Lân Phép Thuật', icon: '🦄', color: 'from-purple-500 to-pink-600' },
    { name: 'Gấu Trúc Kungfu', icon: '🐼', color: 'from-emerald-500 to-teal-600' },
    { name: 'Hổ Quyền Năng', icon: '🐯', color: 'from-amber-600 to-red-700' },
    { name: 'Phượng Hoàng Lửa', icon: '🦚', color: 'from-pink-500 to-rose-600' }
  ],

  // Thử thách ngẫu nhiên trong Hộp Quà Bí Ẩn
  CHALLENGES: [
    '🌟 Trả lời câu hỏi ôn tập của Thầy/Cô',
    '💻 Lên bảng giải thích hoặc viết code ví dụ',
    '👑 Nhận ngay 1 điểm cộng tinh thần phong độ!',
    '🎯 Chỉ định 1 bạn bất kỳ cùng trả lời giúp',
    '⚡ Quyền trợ giúp: Hỏi ý kiến của cả lớp',
    '🎤 Tóm tắt 3 từ khóa quan trọng của bài học',
    '🚀 Đọc to ghi chú hoặc câu hỏi tiếp theo',
    '🎁 Miễn trừ: Nhường lượt cho bạn bên cạnh!'
  ],

  async init(containerEl, manifest = null, loadGradeFn = null) {
    this.container = containerEl;
    this.manifest = manifest;
    this.loadGradeFn = loadGradeFn;

    // Nạp danh sách học sinh từ Preset mặc định đầu tiên
    const presets = Storage.getClassroomPresets();
    const defaultPreset = presets[0] || { names: [] };
    this.setNames(defaultPreset.names);

    this.render();
  },

  setNames(nameList) {
    this.rawNames = Array.isArray(nameList)
      ? nameList.map(n => String(n).trim()).filter(n => n.length > 0)
      : [];
    this.activeNames = [...this.rawNames];
    this.eliminatedNames = [];
  },

  parseNamesFromText(text) {
    if (!text) return [];
    return text
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  },

  // ============================================================================
  // 3. RENDER GIAO DIỆN CHÍNH
  // ============================================================================
  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="random-picker-root" class="space-y-6 animate-fadeIn pb-12">
        
        <!-- HEADER TOOLBAR -->
        <div class="p-6 rounded-3xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white shadow-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black uppercase tracking-wider mb-2">
              <i class="fa-solid fa-dice animate-spin"></i> Trợ Giảng Thông Minh TinHocHub
            </div>
            <h2 class="text-2xl sm:text-3xl font-black flex items-center gap-3">
              <span>BỘ CÔNG CỤ RANDOM & GỌI TÊN LỚP HỌC</span>
            </h2>
            <p class="text-xs text-slate-300 mt-1">Vòng quay may mắn, Máy quay xèng, Hộp quà bí ẩn, Bom nổ chậm & Chia nhóm tự động</p>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
            <button id="rp-btn-sound" class="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold transition flex items-center gap-2" title="Bật/Tắt âm thanh">
              <i class="fa-solid ${SoundFX.isMuted ? 'fa-volume-xmark text-rose-400' : 'fa-volume-high text-emerald-400'}"></i>
              <span>${SoundFX.isMuted ? 'Tắt âm' : 'Bật âm'}</span>
            </button>
            <button id="rp-btn-fullscreen" class="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg" title="Phóng to máy chiếu lớp học">
              <i class="fa-solid fa-expand"></i> <span>Máy Chiếu</span>
            </button>
          </div>
        </div>

        <!-- TABS CHỌN TỰA GAME RANDOM -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          ${[
            { id: 'wheel', label: 'Vòng Quay May Mắn', icon: 'fa-circle-notch', color: 'from-amber-500 to-orange-600' },
            { id: 'slot', label: 'Máy Quay Xèng', icon: 'fa-cubes', color: 'from-purple-500 to-indigo-600' },
            { id: 'boxes', label: 'Hộp Quà Bí Ẩn', icon: 'fa-gift', color: 'from-rose-500 to-pink-600' },
            { id: 'bomb', label: 'Bom Nổ Chậm', icon: 'fa-bomb', color: 'from-red-600 to-rose-700' },
            { id: 'teams', label: 'Chia Nhóm Tự Động', icon: 'fa-users-gear', color: 'from-emerald-500 to-teal-600' }
          ].map(tab => {
            const isActive = this.currentMode === tab.id;
            return `
              <button type="button" data-rp-mode="${tab.id}" class="px-4 py-3 rounded-2xl font-black text-xs transition flex items-center gap-2.5 shrink-0 shadow-sm ${
                isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg ring-2 ring-white/50 scale-105`
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }">
                <i class="fa-solid ${tab.icon}"></i> ${tab.label}
              </button>
            `;
          }).join('')}
        </div>

        <!-- MAIN GRID: CÀI ĐẶT / DANH SÁCH (TRÁI) & SÂN KHẤU TRÒ CHƠI (PHẢI) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <!-- CỘT TRÁI: QUẢN LÝ DANH SÁCH & CÀI ĐẶT SƯ PHẠM (4 CỘT) -->
          <div class="lg:col-span-4 space-y-5">
            <div class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
              
              <div class="flex items-center justify-between">
                <span class="text-xs font-black uppercase text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <i class="fa-solid fa-address-book"></i> Danh Sách Học Sinh
                </span>
                <span id="rp-count-badge" class="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[11px] font-black font-mono">
                  ${this.activeNames.length} / ${this.rawNames.length}
                </span>
              </div>

              <!-- CHỌN PRESET LỚP CÓ SẴN HOẶC ĐÃ LƯU -->
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold text-slate-500">Nạp nhanh theo Lớp học:</label>
                <div class="flex items-center gap-2">
                  <select id="rp-select-preset" class="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white">
                    ${Storage.getClassroomPresets().map(p => `
                      <option value="${p.id}">${escapeHtml(p.name)}</option>
                    `).join('')}
                  </select>
                  <button id="rp-btn-save-preset" type="button" class="p-2.5 rounded-xl bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300 text-xs font-bold transition shrink-0" title="Lưu danh sách hiện tại thành Preset mới">
                    <i class="fa-solid fa-floppy-disk"></i>
                  </button>
                </div>
              </div>

              <!-- TEXTAREA NHẬP TÊN -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Dán tên (mỗi bạn 1 dòng):</span>
                  <div class="flex items-center gap-2">
                    <button id="rp-btn-shuffle" class="text-purple-600 hover:underline font-bold" title="Trộn ngẫu nhiên thứ tự">🔀 Trộn</button>
                    <button id="rp-btn-reset-list" class="text-indigo-600 hover:underline font-bold" title="Khôi phục danh sách đầy đủ ban đầu">🔄 Khôi phục</button>
                    <button id="rp-btn-clear" class="text-rose-500 hover:underline font-bold" title="Xóa trắng danh sách">Xóa</button>
                  </div>
                </div>
                <textarea id="rp-textarea-names" rows="7" class="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-hidden transition" placeholder="Nhập tên học sinh vào đây...">${this.rawNames.join('\n')}</textarea>
              </div>

              <!-- CÀI ĐẶT LUẬT CHƠI & THỜI GIAN -->
              <div class="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
                <span class="text-[11px] font-black uppercase text-slate-400 block">Cài Đặt Vòng Quay & Thời Gian</span>

                <!-- SỐ LƯỢNG GỌI MỖI LƯỢT -->
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-700 dark:text-slate-300">Gọi cùng lúc:</span>
                  <select id="rp-select-pick-count" class="p-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-xs">
                    <option value="1" ${this.pickCount === 1 ? 'selected' : ''}>1 bạn (Đơn)</option>
                    <option value="2" ${this.pickCount === 2 ? 'selected' : ''}>2 bạn cùng lúc</option>
                    <option value="3" ${this.pickCount === 3 ? 'selected' : ''}>3 bạn cùng lúc</option>
                    <option value="4" ${this.pickCount === 4 ? 'selected' : ''}>4 bạn cùng lúc</option>
                    <option value="5" ${this.pickCount === 5 ? 'selected' : ''}>5 bạn cùng lúc</option>
                  </select>
                </div>

                <!-- CHẾ ĐỘ LOẠI TRỪ (ELIMINATION) -->
                <label class="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input type="checkbox" id="rp-check-elimination" ${this.eliminationMode ? 'checked' : ''} class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500">
                  <span class="font-bold">Loại bạn đã gọi khỏi vòng tiếp theo</span>
                </label>

                <!-- ĐỒNG HỒ SUY NGHĨ -->
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-700 dark:text-slate-300">Đồng hồ suy nghĩ:</span>
                  <select id="rp-select-thinking-time" class="p-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-xs">
                    <option value="0" ${this.thinkingTimerSec === 0 ? 'selected' : ''}>Tắt</option>
                    <option value="15" ${this.thinkingTimerSec === 15 ? 'selected' : ''}>15 giây</option>
                    <option value="30" ${this.thinkingTimerSec === 30 ? 'selected' : ''}>30 giây</option>
                    <option value="45" ${this.thinkingTimerSec === 45 ? 'selected' : ''}>45 giây</option>
                    <option value="60" ${this.thinkingTimerSec === 60 ? 'selected' : ''}>60 giây (1 phút)</option>
                    <option value="90" ${this.thinkingTimerSec === 90 ? 'selected' : ''}>90 giây</option>
                  </select>
                </div>

                <!-- KÈM CÂU HỎI TRẮC NGHIỆM TIN HỌC -->
                <div class="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-2">
                  <label class="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input type="checkbox" id="rp-check-include-question" ${this.includeQuestion ? 'checked' : ''} class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500">
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">Gài kèm câu hỏi ôn tập Tin học</span>
                  </label>
                  <div id="rp-question-grade-wrap" class="${this.includeQuestion ? '' : 'hidden'} pl-6 flex items-center gap-2 text-xs">
                    <span class="text-slate-400">Chọn khối:</span>
                    <select id="rp-select-question-grade" class="p-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-xs">
                      <option value="12" ${this.questionGrade === '12' ? 'selected' : ''}>Khối 12 (1.479 câu)</option>
                      <option value="11" ${this.questionGrade === '11' ? 'selected' : ''}>Khối 11 (1.240 câu)</option>
                      <option value="10" ${this.questionGrade === '10' ? 'selected' : ''}>Khối 10 (1.379 câu)</option>
                    </select>
                  </div>
                </div>

              </div>

            </div>
          </div>

          <!-- CỘT PHẢI: SÂN KHẤU TRÒ CHƠI CHÍNH (8 CỘT) -->
          <div class="lg:col-span-8">
            <div id="rp-stage-container" class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-xl min-h-[520px] flex flex-col items-center justify-center relative overflow-hidden">
              <!-- Game Stage View Render động tại đây -->
            </div>
          </div>

        </div>

      </div>

      <!-- MODAL CHÚC MỪNG CHIẾN THẮNG & ĐỒNG HỒ TRẢ LỜI -->
      <div id="rp-modal-winner" class="hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <!-- Render động qua renderWinnerModal -->
      </div>
    `;

    this.bindEvents();
    this.renderCurrentGameStage();
  },

  // ============================================================================
  // 4. BINDING CÁC SỰ KIỆN ĐIỀU KHIỂN
  // ============================================================================
  bindEvents() {
    // Chuyển chế độ game
    this.container.querySelectorAll('[data-rp-mode]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.getAttribute('data-rp-mode');
        this.switchGameMode(mode);
      };
    });

    // Bật/Tắt âm thanh
    const btnSound = document.getElementById('rp-btn-sound');
    if (btnSound) {
      btnSound.onclick = () => {
        SoundFX.isMuted = !SoundFX.isMuted;
        btnSound.innerHTML = `
          <i class="fa-solid ${SoundFX.isMuted ? 'fa-volume-xmark text-rose-400' : 'fa-volume-high text-emerald-400'}"></i>
          <span>${SoundFX.isMuted ? 'Tắt âm' : 'Bật âm'}</span>
        `;
      };
    }

    // Fullscreen máy chiếu
    const btnFull = document.getElementById('rp-btn-fullscreen');
    if (btnFull) {
      btnFull.onclick = () => {
        const root = document.getElementById('random-picker-root');
        if (!document.fullscreenElement) {
          (root || document.documentElement).requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }

    // Chọn Preset
    const selectPreset = document.getElementById('rp-select-preset');
    if (selectPreset) {
      selectPreset.onchange = () => {
        const pId = selectPreset.value;
        const preset = Storage.getClassroomPresets().find(p => p.id === pId);
        if (preset && preset.names) {
          this.setNames(preset.names);
          const ta = document.getElementById('rp-textarea-names');
          if (ta) ta.value = this.rawNames.join('\n');
          this.updateCountBadge();
          this.renderCurrentGameStage();
        }
      };
    }

    // Lưu Preset
    const btnSavePreset = document.getElementById('rp-btn-save-preset');
    if (btnSavePreset) {
      btnSavePreset.onclick = () => {
        const name = prompt('Nhập tên Lớp / Nhóm cho danh sách này:', 'Lớp mới');
        if (name && name.trim()) {
          const ta = document.getElementById('rp-textarea-names');
          const names = this.parseNamesFromText(ta ? ta.value : '');
          if (names.length === 0) {
            alert('Danh sách tên đang trống!');
            return;
          }
          Storage.saveClassroomPreset({
            name: name.trim(),
            names
          });
          alert(`Đã lưu thành công preset [${name}]!`);
          this.render();
        }
      };
    }

    // Textarea thay đổi danh sách
    const taNames = document.getElementById('rp-textarea-names');
    if (taNames) {
      taNames.oninput = () => {
        const names = this.parseNamesFromText(taNames.value);
        this.setNames(names);
        this.updateCountBadge();
        this.renderCurrentGameStage();
      };
    }

    // Trộn danh sách (Shuffle)
    const btnShuffle = document.getElementById('rp-btn-shuffle');
    if (btnShuffle) {
      btnShuffle.onclick = () => {
        this.activeNames = [...this.activeNames].sort(() => 0.5 - Math.random());
        this.rawNames = [...this.activeNames];
        if (taNames) taNames.value = this.rawNames.join('\n');
        this.renderCurrentGameStage();
        SoundFX.playTick();
      };
    }

    // Khôi phục ban đầu (Reset)
    const btnReset = document.getElementById('rp-btn-reset-list');
    if (btnReset) {
      btnReset.onclick = () => {
        const select = document.getElementById('rp-select-preset');
        const pId = select ? select.value : null;
        const preset = Storage.getClassroomPresets().find(p => p.id === pId);
        if (preset) {
          this.setNames(preset.names);
        } else {
          this.activeNames = [...this.rawNames];
          this.eliminatedNames = [];
        }
        if (taNames) taNames.value = this.rawNames.join('\n');
        this.updateCountBadge();
        this.renderCurrentGameStage();
        alert('Đã khôi phục toàn bộ danh sách học sinh ban đầu!');
      };
    }

    // Xóa trắng
    const btnClear = document.getElementById('rp-btn-clear');
    if (btnClear) {
      btnClear.onclick = () => {
        if (confirm('Em có chắc chắn muốn xóa danh sách tên này không?')) {
          this.setNames([]);
          if (taNames) taNames.value = '';
          this.updateCountBadge();
          this.renderCurrentGameStage();
        }
      };
    }

    // Số lượng người gọi mỗi lượt
    const selCount = document.getElementById('rp-select-pick-count');
    if (selCount) {
      selCount.onchange = () => {
        this.pickCount = parseInt(selCount.value, 10) || 1;
        if (this.currentMode === 'slot') this.renderSlotStage();
      };
    }

    // Chế độ loại trừ
    const chkElim = document.getElementById('rp-check-elimination');
    if (chkElim) {
      chkElim.onchange = () => {
        this.eliminationMode = chkElim.checked;
      };
    }

    // Đồng hồ suy nghĩ
    const selThinking = document.getElementById('rp-select-thinking-time');
    if (selThinking) {
      selThinking.onchange = () => {
        this.thinkingTimerSec = parseInt(selThinking.value, 10) || 0;
      };
    }

    // Checkbox kèm câu hỏi
    const chkQ = document.getElementById('rp-check-include-question');
    const qWrap = document.getElementById('rp-question-grade-wrap');
    if (chkQ) {
      chkQ.onchange = () => {
        this.includeQuestion = chkQ.checked;
        if (qWrap) qWrap.classList.toggle('hidden', !this.includeQuestion);
      };
    }

    // Chọn khối cho câu hỏi
    const selGrade = document.getElementById('rp-select-question-grade');
    if (selGrade) {
      selGrade.onchange = () => {
        this.questionGrade = selGrade.value;
      };
    }
  },

  updateCountBadge() {
    const badge = document.getElementById('rp-count-badge');
    if (badge) {
      badge.textContent = `${this.activeNames.length} / ${this.rawNames.length}`;
    }
  },

  switchGameMode(mode) {
    this.currentMode = mode;
    this.render();
  },

  renderCurrentGameStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    if (this.activeNames.length === 0) {
      stage.innerHTML = `
        <div class="text-center space-y-3 py-12">
          <div class="text-5xl animate-bounce">📋</div>
          <h3 class="text-lg font-black text-slate-800 dark:text-white">Danh sách tên đang trống!</h3>
          <p class="text-xs text-slate-400 max-w-sm">Thầy/Cô hãy chọn một lớp mẫu ở cột bên trái hoặc dán danh sách học sinh để bắt đầu trò chơi nhé.</p>
        </div>
      `;
      return;
    }

    switch (this.currentMode) {
      case 'wheel':
        this.renderWheelStage();
        break;
      case 'slot':
        this.renderSlotStage();
        break;
      case 'boxes':
        this.renderBoxesStage();
        break;
      case 'bomb':
        this.renderBombStage();
        break;
      case 'teams':
        this.renderTeamsStage();
        break;
    }
  },

  // ============================================================================
  // 5. GAME 1: 🎡 VÒNG QUAY MAY MẮN (LUCKY WHEEL CANVAS)
  // ============================================================================
  renderWheelStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    stage.innerHTML = `
      <div class="flex flex-col items-center justify-center space-y-5 animate-scaleUp py-2">
        
        <!-- WHEEL CANVAS WRAPPER -->
        <div class="relative w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] flex items-center justify-center">
          
          <!-- KIM CHỈ (POINTER) Ở ĐỈNH 12H -->
          <div id="rp-wheel-pointer" class="absolute -top-3 z-30 transition-transform duration-75 origin-top filter drop-shadow-lg">
            <svg width="40" height="44" viewBox="0 0 40 44" fill="none">
              <path d="M20 44L4 6C2 3 4 0 8 0H32C36 0 38 3 36 6L20 44Z" fill="#DC2626" stroke="#FFFFFF" stroke-width="3" />
              <circle cx="20" cy="14" r="6" fill="#FDE047" />
            </svg>
          </div>

          <!-- CANVAS VÒNG QUAY -->
          <canvas id="rp-wheel-canvas" width="460" height="460" class="rounded-full shadow-2xl border-4 border-amber-400/80 bg-slate-900 cursor-pointer"></canvas>

          <!-- NÚT QUAY Ở TRUNG TÂM -->
          <button id="rp-btn-spin-wheel" type="button" class="absolute z-20 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 text-slate-950 font-black text-sm sm:text-base shadow-2xl border-4 border-white flex flex-col items-center justify-center transition transform hover:scale-110 active:scale-95 cursor-pointer ring-4 ring-amber-500/30">
            <i class="fa-solid fa-play text-base sm:text-lg mb-0.5"></i>
            <span>QUAY</span>
          </button>
        </div>

        <!-- HƯỚNG DẪN BẤM -->
        <div class="text-center text-xs text-slate-400 flex items-center gap-2">
          <span>Bấm nút <b>QUAY</b> hoặc nhấn phím <kbd class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-bold">Space</kbd> để quay</span>
        </div>

      </div>
    `;

    this.initWheelCanvas();

    const btnSpin = document.getElementById('rp-btn-spin-wheel');
    const canvas = document.getElementById('rp-wheel-canvas');
    if (btnSpin) btnSpin.onclick = () => this.spinWheel();
    if (canvas) canvas.onclick = () => this.spinWheel();
  },

  initWheelCanvas() {
    const canvas = document.getElementById('rp-wheel-canvas');
    if (!canvas) return;
    this.drawWheel(this.wheelAngle);
  },

  drawWheel(currentAngle) {
    const canvas = document.getElementById('rp-wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 12;

    ctx.clearRect(0, 0, width, height);

    const names = this.activeNames;
    const numSlices = names.length;
    if (numSlices === 0) return;

    const sliceAngle = (Math.PI * 2) / numSlices;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(currentAngle);

    for (let i = 0; i < numSlices; i++) {
      const angle = i * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + sliceAngle);
      ctx.closePath();

      // Màu nền slice
      ctx.fillStyle = this.PALETTE[i % this.PALETTE.length];
      ctx.fill();

      // Viền trắng mảnh giữa các slice
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Vẽ tên học sinh
      ctx.save();
      ctx.rotate(angle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;

      const fontSize = numSlices > 30 ? 10 : numSlices > 18 ? 12 : 14;
      ctx.font = `bold ${fontSize}px sans-serif`;

      let name = names[i];
      if (name.length > 18) name = name.substring(0, 16) + '...';
      ctx.fillText(name, radius - 20, 0);
      ctx.restore();
    }

    // Vành ngoài với các chấm bóng sáng
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Vẽ các chấm đinh tán tròn xung quanh vành
    const numDots = Math.min(36, Math.max(12, numSlices));
    for (let j = 0; j < numDots; j++) {
      const dotAngle = (j * (Math.PI * 2)) / numDots;
      const dx = centerX + (radius + 4) * Math.cos(dotAngle);
      const dy = centerY + (radius + 4) * Math.sin(dotAngle);
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fillStyle = j % 2 === 0 ? '#FDE047' : '#FFFFFF';
      ctx.fill();
    }
    ctx.restore();
  },

  spinWheel() {
    if (this.isSpinning) return;
    if (this.activeNames.length === 0) {
      alert('Không còn học sinh nào trong vòng quay!');
      return;
    }

    this.isSpinning = true;
    SoundFX.init();

    // Xác định góc quay mục tiêu: ít nhất 5 vòng (5 * 2PI) + góc ngẫu nhiên
    const minRounds = 5 + Math.floor(Math.random() * 3);
    const targetSliceIndex = Math.floor(Math.random() * this.activeNames.length);
    const sliceAngle = (Math.PI * 2) / this.activeNames.length;

    // Pointer nằm ở đỉnh 12h (-PI/2)
    const pointerOffset = -Math.PI / 2;
    // Góc dừng sao cho slice targetSliceIndex nằm đúng vị trí pointer
    const targetSliceCenter = targetSliceIndex * sliceAngle + sliceAngle / 2;
    let targetAngle = minRounds * Math.PI * 2 + (pointerOffset - targetSliceCenter);

    // Chuẩn hóa góc dương
    while (targetAngle < this.wheelAngle) {
      targetAngle += Math.PI * 2;
    }

    const startAngle = this.wheelAngle;
    const totalDelta = targetAngle - startAngle;
    const duration = (this.spinDurationSec || 5) * 1000;
    const startTime = performance.now();

    let lastTickSlice = -1;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Easing cubic out
      const ease = 1 - Math.pow(1 - progress, 3);
      this.wheelAngle = startAngle + totalDelta * ease;

      this.drawWheel(this.wheelAngle);

      // Hiệu ứng kim chỉ rung nảy khi qua nan quạt
      const currentSlice = Math.floor(
        ((pointerOffset - this.wheelAngle) % (Math.PI * 2) + Math.PI * 2) / sliceAngle
      ) % this.activeNames.length;

      if (currentSlice !== lastTickSlice) {
        lastTickSlice = currentSlice;
        SoundFX.playTick();
        const pointer = document.getElementById('rp-wheel-pointer');
        if (pointer) {
          pointer.style.transform = 'rotate(-18deg)';
          setTimeout(() => { if (pointer) pointer.style.transform = 'rotate(0deg)'; }, 45);
        }
      }

      if (progress < 1) {
        this.wheelAnimId = requestAnimationFrame(animate);
      } else {
        this.isSpinning = false;
        const winner = this.activeNames[targetSliceIndex];
        this.onWinnerSelected([winner]);
      }
    };

    this.wheelAnimId = requestAnimationFrame(animate);
  },

  // ============================================================================
  // 6. GAME 2: 🎰 MÁY QUAY XÈNG (ARCADE SLOT MACHINE)
  // ============================================================================
  renderSlotStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    const reelsCount = Math.min(3, Math.max(1, this.pickCount));

    stage.innerHTML = `
      <div class="flex flex-col items-center justify-center space-y-6 animate-scaleUp py-4 w-full max-w-xl">
        
        <!-- KHUNG MÁY QUAY ARCADE CASINO -->
        <div class="w-full p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-purple-950 via-slate-900 to-indigo-950 border-4 border-amber-400 shadow-2xl relative overflow-hidden text-center space-y-6">
          
          <!-- BẢNG ĐÈN NEON MARQUEE -->
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs tracking-wider shadow-md animate-pulse">
            🎰 CYBER SLOT MACHINE 🎰
          </div>

          <!-- CÁC CUỘN LĂN REELS -->
          <div class="grid grid-cols-${reelsCount} gap-3 sm:gap-4 p-4 rounded-2xl bg-black/60 border-2 border-amber-400/40 shadow-inner min-h-[160px] items-center">
            ${Array.from({ length: reelsCount }).map((_, idx) => `
              <div class="h-32 rounded-2xl bg-gradient-to-b from-slate-800 via-slate-900 to-slate-800 border-2 border-white/20 shadow-lg flex items-center justify-center p-3 relative overflow-hidden">
                <div id="rp-slot-reel-${idx}" class="text-center font-black text-base sm:text-lg text-amber-300 font-mono transition-transform duration-75">
                  <span class="block text-2xl mb-1">🎁</span>
                  <span>? ? ?</span>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- NÚT GIẬT CẦN / QUAY XÈNG -->
          <button id="rp-btn-spin-slot" type="button" class="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-amber-500/30 transition transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3 cursor-pointer">
            <i class="fa-solid fa-bolt animate-bounce"></i>
            <span>GIẬT CẦN QUAY THƯỞNG!</span>
          </button>
        </div>

        <p class="text-xs text-slate-400">Máy quay sẽ lần lượt khóa ngẫu nhiên ${reelsCount} bạn học sinh may mắn!</p>
      </div>
    `;

    const btnSpin = document.getElementById('rp-btn-spin-slot');
    if (btnSpin) btnSpin.onclick = () => this.spinSlotMachine(reelsCount);
  },

  spinSlotMachine(reelsCount) {
    if (this.isSpinning) return;
    if (this.activeNames.length < reelsCount) {
      alert(`Số lượng học sinh còn lại (${this.activeNames.length}) không đủ để quay ${reelsCount} bạn!`);
      return;
    }

    this.isSpinning = true;
    SoundFX.init();

    // Chọn ngẫu nhiên reelsCount bạn khác nhau
    const shuffled = [...this.activeNames].sort(() => 0.5 - Math.random());
    const winners = shuffled.slice(0, reelsCount);

    const reels = Array.from({ length: reelsCount }).map((_, i) => document.getElementById(`rp-slot-reel-${i}`));

    // Bắt đầu lăn nhanh
    const intervals = reels.map((reel, idx) => {
      return setInterval(() => {
        const randName = this.activeNames[Math.floor(Math.random() * this.activeNames.length)];
        if (reel) {
          reel.style.filter = 'blur(1.5px)';
          reel.innerHTML = `
            <span class="block text-2xl mb-1 animate-spin">🎲</span>
            <span class="text-slate-300">${escapeHtml(randName)}</span>
          `;
        }
        SoundFX.playSlotTick();
      }, 70);
    });

    // Dừng lần lượt từng cuộn
    reels.forEach((reel, idx) => {
      const stopDelay = 2200 + idx * 800;
      setTimeout(() => {
        clearInterval(intervals[idx]);
        if (reel) {
          reel.style.filter = 'none';
          reel.innerHTML = `
            <span class="block text-2xl mb-1">👑</span>
            <span class="text-amber-400 font-bold text-sm sm:text-base">${escapeHtml(winners[idx])}</span>
          `;
          reel.parentElement.classList.add('ring-4', 'ring-emerald-400', 'animate-scaleUp');
        }
        SoundFX.playFanfare();

        // Cuộn cuối cùng dừng
        if (idx === reelsCount - 1) {
          this.isSpinning = false;
          setTimeout(() => {
            this.onWinnerSelected(winners);
          }, 500);
        }
      }, stopDelay);
    });
  },

  // ============================================================================
  // 7. GAME 3: 🎁 HỘP QUÀ BÍ ẨN (MYSTERY LUCKY BOXES)
  // ============================================================================
  renderBoxesStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    // Hiển thị 12 hộp quà bí ẩn
    const boxCount = 12;

    stage.innerHTML = `
      <div class="flex flex-col items-center justify-center space-y-6 animate-scaleUp py-2 w-full max-w-2xl">
        
        <div class="text-center space-y-1">
          <h3 class="text-xl font-black text-slate-800 dark:text-white flex items-center justify-center gap-2">
            <span>🎁 CHỌN 1 HỘP QUÀ BÍ MẬT 🎁</span>
          </h3>
          <p class="text-xs text-slate-400">Bên trong mỗi hộp chứa 1 học sinh may mắn kèm 1 thử thách/phần thưởng vui nhộn!</p>
        </div>

        <!-- GRID 12 HỘP QUÀ -->
        <div id="rp-boxes-grid" class="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
          ${Array.from({ length: boxCount }).map((_, idx) => `
            <button type="button" data-mystery-box="${idx}" class="p-4 rounded-3xl bg-gradient-to-br from-purple-600 via-indigo-600 to-slate-800 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg border border-white/20 flex flex-col items-center justify-center gap-1.5 transition transform hover:scale-105 active:scale-95 cursor-pointer min-h-[90px] group">
              <span class="text-3xl sm:text-4xl group-hover:animate-bounce">🎁</span>
              <span class="text-xs font-black uppercase text-amber-300">Hộp ${idx + 1}</span>
            </button>
          `).join('')}
        </div>

        <!-- NÚT HÀNH ĐỘNG -->
        <div class="flex items-center gap-3 pt-2">
          <button id="rp-btn-shuffle-boxes" class="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-2">
            <i class="fa-solid fa-arrows-rotate"></i> <span>Xáo Trộn Hộp</span>
          </button>
          <button id="rp-btn-random-pick-box" class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 text-white text-xs font-black transition flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 cursor-pointer">
            <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Mở Hộp Bất Kỳ</span>
          </button>
        </div>

      </div>
    `;

    // Click vào từng hộp
    stage.querySelectorAll('[data-mystery-box]').forEach(btn => {
      btn.onclick = () => {
        const boxIdx = parseInt(btn.getAttribute('data-mystery-box'), 10);
        this.openMysteryBox(boxIdx, btn);
      };
    });

    const btnShuffle = document.getElementById('rp-btn-shuffle-boxes');
    if (btnShuffle) {
      btnShuffle.onclick = () => {
        SoundFX.playSlotTick();
        const grid = document.getElementById('rp-boxes-grid');
        if (grid) {
          grid.classList.add('animate-spin');
          setTimeout(() => grid.classList.remove('animate-spin'), 350);
        }
      };
    }

    const btnRandom = document.getElementById('rp-btn-random-pick-box');
    if (btnRandom) {
      btnRandom.onclick = () => {
        const boxes = stage.querySelectorAll('[data-mystery-box]');
        const randIdx = Math.floor(Math.random() * boxes.length);
        this.openMysteryBox(randIdx, boxes[randIdx]);
      };
    }
  },

  openMysteryBox(boxIdx, boxBtn) {
    if (this.isSpinning) return;
    if (this.activeNames.length === 0) {
      alert('Không còn học sinh nào trong danh sách!');
      return;
    }

    this.isSpinning = true;
    SoundFX.init();
    SoundFX.playBoxOpen();

    if (boxBtn) {
      boxBtn.classList.add('animate-bounce', 'ring-4', 'ring-yellow-400');
    }

    setTimeout(() => {
      this.isSpinning = false;
      const winner = this.activeNames[Math.floor(Math.random() * this.activeNames.length)];
      const challenge = this.CHALLENGES[Math.floor(Math.random() * this.CHALLENGES.length)];
      this.onWinnerSelected([winner], challenge);
    }, 700);
  },

  // ============================================================================
  // 8. GAME 4: 💣 QUẢ BOM NỔ CHẬM (HOT POTATO BOMB TIMER)
  // ============================================================================
  renderBombStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    stage.innerHTML = `
      <div class="flex flex-col items-center justify-center space-y-6 animate-scaleUp py-4 w-full max-w-lg text-center">
        
        <!-- CARTOON TIME BOMB GRAPHIC -->
        <div id="rp-bomb-wrapper" class="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
          
          <!-- NGÒI NỔ CÓ LỬA CHÁY -->
          <div id="rp-bomb-spark" class="hidden absolute top-1 right-8 text-2xl animate-ping">
            🔥
          </div>

          <!-- QUẢ BOM ĐEN TRÒN -->
          <div id="rp-bomb-body" class="w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 border-4 border-slate-700 shadow-2xl flex flex-col items-center justify-center p-4 relative">
            <span class="text-4xl mb-1">💣</span>
            <div id="rp-bomb-lcd" class="w-full py-1 rounded-lg bg-red-950/80 border border-red-500/40 text-red-400 font-mono font-black text-xl tracking-widest">
              30s
            </div>
            <span id="rp-bomb-name-preview" class="text-[11px] font-bold text-slate-400 truncate max-w-[120px] mt-1">Sẵn sàng...</span>
          </div>

        </div>

        <!-- CÀI ĐẶT THỜI GIAN BOM CHÁY -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-500">Thời gian nổ:</span>
          ${[10, 15, 20, 30, 45].map(sec => `
            <button type="button" data-bomb-sec="${sec}" class="px-2.5 py-1 rounded-xl text-xs font-bold border transition ${
              sec === 20 ? 'bg-red-600 text-white border-red-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
            }">${sec}s</button>
          `).join('')}
        </div>

        <!-- NÚT CHÂM NGÒI NỔ -->
        <button id="rp-btn-start-bomb" type="button" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white font-black text-base shadow-xl shadow-red-500/30 transition transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
          <i class="fa-solid fa-fire"></i>
          <span>CHÂM NGÒI NỔ NGAY!</span>
        </button>

        <p class="text-xs text-slate-400">Các bạn sẽ truyền câu hỏi liên tục; người giữ lượt khi bom nổ sẽ trả lời!</p>
      </div>
    `;

    let selectedBombSec = 20;

    stage.querySelectorAll('[data-bomb-sec]').forEach(btn => {
      btn.onclick = () => {
        selectedBombSec = parseInt(btn.getAttribute('data-bomb-sec'), 10);
        stage.querySelectorAll('[data-bomb-sec]').forEach(b => {
          b.className = 'px-2.5 py-1 rounded-xl text-xs font-bold border transition bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
        });
        btn.className = 'px-2.5 py-1 rounded-xl text-xs font-bold border transition bg-red-600 text-white border-red-600';
        const lcd = document.getElementById('rp-bomb-lcd');
        if (lcd) lcd.textContent = `${selectedBombSec}s`;
      };
    });

    const btnStart = document.getElementById('rp-btn-start-bomb');
    if (btnStart) {
      btnStart.onclick = () => this.startBombCountdown(selectedBombSec);
    }
  },

  startBombCountdown(seconds) {
    if (this.isSpinning) return;
    if (this.activeNames.length === 0) {
      alert('Không còn học sinh nào trong danh sách!');
      return;
    }

    this.isSpinning = true;
    SoundFX.init();

    const spark = document.getElementById('rp-bomb-spark');
    const body = document.getElementById('rp-bomb-body');
    const lcd = document.getElementById('rp-bomb-lcd');
    const namePreview = document.getElementById('rp-bomb-name-preview');
    const btnStart = document.getElementById('rp-btn-start-bomb');

    if (spark) spark.classList.remove('hidden');
    if (btnStart) btnStart.disabled = true;

    let timeLeft = seconds;
    if (lcd) lcd.textContent = `${timeLeft}s`;

    // Chu kỳ đổi tên học sinh ngẫu nhiên liên tục trên màn hình bom
    const nameInterval = setInterval(() => {
      const rand = this.activeNames[Math.floor(Math.random() * this.activeNames.length)];
      if (namePreview) namePreview.textContent = rand;
      SoundFX.playTick();
    }, 150);

    // Đếm ngược bom
    this.bombTimerInterval = setInterval(() => {
      timeLeft--;
      if (lcd) lcd.textContent = `${timeLeft}s`;

      if (timeLeft <= 5 && body) {
        body.classList.add('animate-ping');
        setTimeout(() => body.classList.remove('animate-ping'), 200);
      }

      if (timeLeft <= 0) {
        clearInterval(this.bombTimerInterval);
        clearInterval(nameInterval);
        this.isSpinning = false;

        if (spark) spark.classList.add('hidden');
        if (btnStart) btnStart.disabled = false;

        // HIỆU ỨNG BOM NỔ BÙM
        SoundFX.playBoom();
        if (body) {
          body.classList.add('animate-bounce');
        }

        const victim = this.activeNames[Math.floor(Math.random() * this.activeNames.length)];
        this.onWinnerSelected([victim], '💥 BÙM! Quả bom phát nổ trúng em! Hãy lên bảng hoàn thành nhiệm vụ nhé.');
      }
    }, 1000);
  },

  // ============================================================================
  // 9. GAME 5: 👥 CHIA NHÓM TỰ ĐỘNG (TEAM / GROUP GENERATOR)
  // ============================================================================
  renderTeamsStage() {
    const stage = document.getElementById('rp-stage-container');
    if (!stage) return;

    stage.innerHTML = `
      <div class="space-y-6 w-full animate-fadeIn py-2">
        
        <!-- BẢNG ĐIỀU KHIỂN CHIA NHÓM -->
        <div class="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Chia theo:</span>
            <select id="rp-teams-mode" class="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold">
              <option value="by_groups">Số lượng nhóm</option>
              <option value="by_members">Số bạn mỗi nhóm</option>
            </select>
            <input type="number" id="rp-teams-count" min="2" max="12" value="4" class="w-16 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-black text-center font-mono">
          </div>

          <div class="flex items-center gap-2">
            <button id="rp-btn-generate-teams" class="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition flex items-center gap-2 shadow-lg cursor-pointer">
              <i class="fa-solid fa-users"></i> <span>CHIA NHÓM NGAY</span>
            </button>
            <button id="rp-btn-copy-teams" class="px-3.5 py-2.5 rounded-2xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-white font-bold text-xs transition flex items-center gap-1.5" title="Copy danh sách chia nhóm">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>
        </div>

        <!-- VÙNG HIỂN THỊ KẾT QUẢ CHIA NHÓM -->
        <div id="rp-teams-result-area" class="space-y-4">
          <div class="text-center py-12 text-slate-400 text-xs space-y-2">
            <div class="text-4xl animate-bounce">👥</div>
            <p>Bấm nút <b>CHIA NHÓM NGAY</b> để tự động xáo trộn và phân bổ đều học sinh vào các nhóm!</p>
          </div>
        </div>

      </div>
    `;

    const btnGen = document.getElementById('rp-btn-generate-teams');
    if (btnGen) {
      btnGen.onclick = () => this.generateTeams();
    }

    const btnCopy = document.getElementById('rp-btn-copy-teams');
    if (btnCopy) {
      btnCopy.onclick = () => this.copyTeamsList();
    }
  },

  generateTeams() {
    if (this.rawNames.length === 0) {
      alert('Danh sách học sinh đang trống!');
      return;
    }

    const mode = document.getElementById('rp-teams-mode')?.value || 'by_groups';
    let val = parseInt(document.getElementById('rp-teams-count')?.value, 10) || 4;

    const names = [...this.rawNames].sort(() => 0.5 - Math.random());
    const total = names.length;

    let numGroups = 4;
    if (mode === 'by_groups') {
      numGroups = Math.max(2, Math.min(val, total));
    } else {
      const perGroup = Math.max(1, Math.min(val, total));
      numGroups = Math.max(1, Math.ceil(total / perGroup));
    }

    const groups = Array.from({ length: numGroups }, (_, i) => ({
      id: i + 1,
      mascot: this.MASCOTS[i % this.MASCOTS.length],
      members: []
    }));

    // Phân bổ đều lần lượt từng bạn
    names.forEach((name, idx) => {
      groups[idx % numGroups].members.push(name);
    });

    this.lastGeneratedGroups = groups;
    SoundFX.playFanfare();

    const area = document.getElementById('rp-teams-result-area');
    if (!area) return;

    area.innerHTML = `
      <div class="flex items-center justify-between pb-1">
        <span class="text-xs font-bold text-slate-500">Đã chia thành công <b>${groups.length} nhóm</b> từ ${total} học sinh:</span>
        <button id="rp-btn-pick-random-group" class="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-950 dark:text-purple-300 text-purple-700 text-xs font-black transition flex items-center gap-1.5">
          <i class="fa-solid fa-dice"></i> <span>Quay Ngẫu Nhiên 1 Nhóm Báo Cáo</span>
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        ${groups.map(g => `
          <div id="rp-group-card-${g.id}" class="p-4 rounded-3xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 shadow-sm space-y-3 transition transform hover:scale-[1.02]">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <div class="flex items-center gap-2">
                <span class="text-2xl">${g.mascot.icon}</span>
                <div>
                  <h4 class="text-sm font-black text-slate-800 dark:text-white">Nhóm ${g.id}: ${g.mascot.name}</h4>
                  <span class="text-[10px] text-slate-400 font-bold">${g.members.length} thành viên</span>
                </div>
              </div>
            </div>

            <!-- DANH SÁCH THÀNH VIÊN -->
            <ul class="space-y-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              ${g.members.map((m, mIdx) => `
                <li class="flex items-center gap-2 p-1.5 rounded-xl ${mIdx === 0 ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-black' : 'bg-slate-50 dark:bg-slate-900/60'}">
                  <span class="w-5 h-5 rounded-full ${mIdx === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} flex items-center justify-center text-[10px] font-black shrink-0">
                    ${mIdx === 0 ? '★' : mIdx + 1}
                  </span>
                  <span class="truncate flex-1">${escapeHtml(m)}</span>
                  ${mIdx === 0 ? '<span class="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-300">Trưởng nhóm</span>' : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    `;

    const btnPickGroup = document.getElementById('rp-btn-pick-random-group');
    if (btnPickGroup) {
      btnPickGroup.onclick = () => this.pickRandomGroup(groups);
    }
  },

  pickRandomGroup(groups) {
    if (!groups || groups.length === 0) return;
    SoundFX.init();
    SoundFX.playSlotTick();

    // Hiệu ứng nhấp nháy highlight ngẫu nhiên các nhóm
    let count = 0;
    const maxCount = 15;
    const interval = setInterval(() => {
      groups.forEach(g => {
        const card = document.getElementById(`rp-group-card-${g.id}`);
        if (card) card.classList.remove('ring-4', 'ring-purple-500', 'bg-purple-50');
      });

      const randIdx = Math.floor(Math.random() * groups.length);
      const chosen = groups[randIdx];
      const card = document.getElementById(`rp-group-card-${chosen.id}`);
      if (card) card.classList.add('ring-4', 'ring-purple-500');

      SoundFX.playTick();
      count++;

      if (count >= maxCount) {
        clearInterval(interval);
        SoundFX.playFanfare();
        if (typeof window.confetti === 'function') {
          window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 } });
        }
        alert(`🎉 NHÓM ĐẠI DIỆN ĐƯỢC CHỌN:
Nhóm ${chosen.id} - ${chosen.mascot.name} (${chosen.members.length} bạn)!`);
      }
    }, 120);
  },

  copyTeamsList() {
    if (!this.lastGeneratedGroups || this.lastGeneratedGroups.length === 0) {
      alert('Chưa có danh sách chia nhóm để sao chép!');
      return;
    }

    const text = this.lastGeneratedGroups.map(g => {
      const membersText = g.members.map((m, i) => `  ${i + 1}. ${m}${i === 0 ? ' (Trưởng nhóm)' : ''}`).join('\n');
      return `📌 NHÓM ${g.id} (${g.mascot.name} - ${g.members.length} bạn):\n${membersText}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text);
    alert('📋 Đã sao chép danh sách chia nhóm vào clipboard! Thầy/Cô có thể dán ngay vào Zalo/Teams của lớp.');
  },

  // ============================================================================
  // 10. MODAL CHÚC MỪNG CHIẾN THẮNG & ĐỒNG HỒ TRẢ LỜI
  // ============================================================================
  async onWinnerSelected(winners = [], customMessage = null) {
    SoundFX.playFanfare();

    // Hiệu ứng pháo hoa Confetti
    if (typeof window.confetti === 'function') {
      window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
    }

    // Nếu bật loại trừ: gỡ các bạn chiến thắng khỏi activeNames
    if (this.eliminationMode) {
      winners.forEach(w => {
        const idx = this.activeNames.indexOf(w);
        if (idx >= 0) {
          this.activeNames.splice(idx, 1);
          this.eliminatedNames.push(w);
        }
      });
      this.updateCountBadge();
    }

    // Lấy câu hỏi ngẫu nhiên nếu có bật
    let randomQuestion = null;
    if (this.includeQuestion) {
      randomQuestion = await this.getRandomQuizQuestion(this.questionGrade);
    }

    this.renderWinnerModal(winners, customMessage, randomQuestion);
  },

  async getRandomQuizQuestion(grade = '12') {
    let questions = this.cachedQuestions[grade];
    if (!questions) {
      try {
        if (typeof this.loadGradeFn === 'function') {
          questions = await this.loadGradeFn(grade);
        } else if (typeof window !== 'undefined' && window.App?.loadGradeData) {
          questions = await window.App.loadGradeData(grade);
        } else {
          const res = await fetch(`data/grade_${grade}.json`);
          if (res.ok) questions = await res.json();
        }
        if (questions) this.cachedQuestions[grade] = questions;
      } catch (err) {
        console.warn('Lỗi tải câu hỏi random picker:', err);
      }
    }

    if (questions && questions.length > 0) {
      const mcqOnly = questions.filter(q => q.options && q.options.length === 4);
      const pool = mcqOnly.length > 0 ? mcqOnly : questions;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  },

  renderWinnerModal(winners = [], customMessage = null, quizQuestion = null) {
    const modal = document.getElementById('rp-modal-winner');
    if (!modal) return;

    this.thinkingTimeLeft = this.thinkingTimerSec || 30;

    modal.innerHTML = `
      <div class="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-amber-400 shadow-2xl text-center space-y-6 animate-scaleUp relative max-h-[90vh] overflow-y-auto">
        
        <!-- CONFETTI / BANNER HEADER -->
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs font-black uppercase tracking-wider">
            🎉 XIN CHÚC MỪNG DŨNG SĨ ĐƯỢC CHỌN 🎉
          </div>
          <h2 class="text-3xl sm:text-4xl font-black text-slate-800 dark:text-white mt-1">
            ${winners.map(w => `<span class="block text-purple-600 dark:text-purple-400 mt-1">${escapeHtml(w)}</span>`).join('')}
          </h2>
          ${customMessage ? `<p class="text-xs font-bold text-slate-500 mt-1">${escapeHtml(customMessage)}</p>` : ''}
        </div>

        <!-- CÂU HỎI TRẮC NGHIỆM GÀI KÈM (NẾU CÓ) -->
        ${quizQuestion ? `
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Câu Hỏi Kiểm Tra Nhanh</span>
              <button id="rp-btn-reveal-answer" class="text-[11px] text-purple-600 font-bold hover:underline">👁️ Hiện Đáp Án</button>
            </div>
            <p class="text-xs font-bold text-slate-800 dark:text-white">${escapeHtml(quizQuestion.question)}</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              ${(quizQuestion.options || []).map((opt, oIdx) => `
                <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <span class="w-5 h-5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 text-[10px] font-black flex items-center justify-center shrink-0">
                    ${['A', 'B', 'C', 'D'][oIdx]}
                  </span>
                  <span class="truncate">${escapeHtml(opt)}</span>
                </div>
              `).join('')}
            </div>
            <div id="rp-answer-box" class="hidden p-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold">
              ✅ Đáp án đúng: <b>${typeof quizQuestion.answer === 'number' ? ['A', 'B', 'C', 'D'][quizQuestion.answer] : quizQuestion.answer}</b>
            </div>
          </div>
        ` : ''}

        <!-- ĐỒNG HỒ SUY NGHĨ TRẢ LỜI -->
        ${this.thinkingTimerSec > 0 ? `
          <div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
            <div class="flex items-center gap-2 text-left">
              <span class="text-2xl animate-pulse">⏱️</span>
              <div>
                <span class="text-[11px] text-amber-800 dark:text-amber-300 font-black uppercase block">Thời Gian Suy Nghĩ</span>
                <span id="rp-thinking-timer-text" class="text-xl font-black font-mono text-slate-800 dark:text-white">${this.thinkingTimeLeft}s</span>
              </div>
            </div>
            <div class="flex items-center gap-1.5">
              <button id="rp-btn-pause-thinking" class="px-3 py-1.5 rounded-xl bg-amber-200 text-amber-900 font-black text-xs hover:bg-amber-300 transition">Tạm Dừng</button>
              <button id="rp-btn-add10-thinking" class="px-3 py-1.5 rounded-xl bg-amber-200 text-amber-900 font-black text-xs hover:bg-amber-300 transition">+10s</button>
            </div>
          </div>
        ` : ''}

        <!-- NÚT ĐIỀU HƯỚNG / ĐÓNG MODAL -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <button id="rp-btn-winner-keep" class="w-full py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 transition">
            Đóng & Giữ Lại
          </button>
          <button id="rp-btn-winner-next" class="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg transition">
            Quay Lượt Tiếp ➔
          </button>
        </div>

      </div>
    `;

    modal.classList.remove('hidden');

    // Nút hiện đáp án
    const btnRev = document.getElementById('rp-btn-reveal-answer');
    const ansBox = document.getElementById('rp-answer-box');
    if (btnRev && ansBox) {
      btnRev.onclick = () => ansBox.classList.toggle('hidden');
    }

    // Đếm ngược suy nghĩ
    if (this.thinkingTimerSec > 0) {
      this.startThinkingTimer();
    }

    // Đóng modal
    const btnKeep = document.getElementById('rp-btn-winner-keep');
    if (btnKeep) {
      btnKeep.onclick = () => {
        this.stopThinkingTimer();
        modal.classList.add('hidden');
        this.renderCurrentGameStage();
      };
    }

    const btnNext = document.getElementById('rp-btn-winner-next');
    if (btnNext) {
      btnNext.onclick = () => {
        this.stopThinkingTimer();
        modal.classList.add('hidden');
        this.renderCurrentGameStage();
        setTimeout(() => {
          if (this.currentMode === 'wheel') this.spinWheel();
          else if (this.currentMode === 'slot') this.spinSlotMachine(Math.min(3, Math.max(1, this.pickCount)));
        }, 300);
      };
    }
  },

  startThinkingTimer() {
    this.stopThinkingTimer();
    const timerText = document.getElementById('rp-thinking-timer-text');
    let isPaused = false;

    const btnPause = document.getElementById('rp-btn-pause-thinking');
    if (btnPause) {
      btnPause.onclick = () => {
        isPaused = !isPaused;
        btnPause.textContent = isPaused ? 'Tiếp Tục' : 'Tạm Dừng';
      };
    }

    const btnAdd10 = document.getElementById('rp-btn-add10-thinking');
    if (btnAdd10) {
      btnAdd10.onclick = () => {
        this.thinkingTimeLeft += 10;
        if (timerText) timerText.textContent = `${this.thinkingTimeLeft}s`;
      };
    }

    this.thinkingTimerInterval = setInterval(() => {
      if (isPaused) return;
      this.thinkingTimeLeft--;
      if (timerText) timerText.textContent = `${this.thinkingTimeLeft}s`;

      if (this.thinkingTimeLeft <= 3 && this.thinkingTimeLeft > 0) {
        SoundFX.playTick();
      }

      if (this.thinkingTimeLeft <= 0) {
        this.stopThinkingTimer();
        SoundFX.playAlarm();
        if (timerText) timerText.textContent = 'HẾT GIỜ!';
      }
    }, 1000);
  },

  stopThinkingTimer() {
    if (this.thinkingTimerInterval) {
      clearInterval(this.thinkingTimerInterval);
      this.thinkingTimerInterval = null;
    }
  }
};

if (typeof window !== 'undefined') {
  window.RandomPicker = RandomPicker;
}

export default RandomPicker;
