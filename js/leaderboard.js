/**
 * tinhoc-hub: Leaderboard (Bảng Vinh Danh)
 * Ghi nhận & Vinh danh thành tích thi thử của học sinh theo Ngày / Tuần / Tháng / Năm học
 */

import { Storage } from './storage.js?v=20261030_44';
import { escapeHtml } from './utils.js?v=20261030_44';

export const Leaderboard = {
  container: null,
  timeframe: 'today', // 'today' | 'week' | 'month' | 'year'
  grade: 'all',       // 'all' | '12' | '11' | '10'

  init(containerEl) {
    this.container = containerEl;
    this.render();
    if (typeof window !== 'undefined' && window.CloudSync) {
      window.CloudSync.syncHistory().then(() => this.render()).catch(() => {});
    }
  },

  setTimeframe(tf) {
    this.timeframe = tf;
    this.render();
  },

  setGrade(g) {
    this.grade = g;
    this.render();
  },

  render() {
    if (!this.container) return;

    const entries = Storage.getLeaderboard({
      timeframe: this.timeframe,
      grade: this.grade
    });

    const timeframeLabels = {
      today: 'Hôm Nay',
      week: 'Tuần Này',
      month: 'Tháng Này',
      year: 'Năm Học 2024 - 2025'
    };

    const top1 = entries[0] || null;
    const top2 = entries[1] || null;
    const top3 = entries[2] || null;
    const rest = entries.slice(3);

    this.container.innerHTML = `
      <div class="space-y-8 animate-fadeIn">
        
        <!-- Header Banner Vinh Danh -->
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-6 sm:p-10 text-white shadow-xl shadow-amber-500/15">
          <div class="relative z-10 max-w-2xl">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-100 text-xs font-bold uppercase tracking-wider mb-3">
              <i class="fa-solid fa-crown text-yellow-300"></i> Bảng Vàng Thành Tích
            </div>
            <h2 class="text-2xl sm:text-4xl font-black tracking-tight mb-2">
              Bảng Vinh Danh Học Sinh Xuất Sắc
            </h2>
            <p class="text-xs sm:text-sm text-amber-100 leading-relaxed opacity-95">
              Tôn vinh các thí sinh có điểm số cao nhất và tốc độ hoàn thành bài thi nhanh nhất môn Tin học.
            </p>
          </div>

          <!-- Huy hiệu nền trang trí -->
          <div class="absolute right-4 -bottom-6 text-white/10 text-9xl sm:text-[160px] pointer-events-none select-none">
            <i class="fa-solid fa-trophy"></i>
          </div>
        </div>

        <!-- Bộ Lọc Thời Gian & Khối Lớp -->
        <div class="bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          
          <!-- Nhóm thời gian: Ngày / Tuần / Tháng / Năm học -->
          <div class="flex items-center bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
            <button data-lb-tf="today" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${this.timeframe === 'today' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
              <i class="fa-solid fa-calendar-day mr-1.5"></i> Hôm nay
            </button>
            <button data-lb-tf="week" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${this.timeframe === 'week' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
              <i class="fa-solid fa-calendar-week mr-1.5"></i> Tuần này
            </button>
            <button data-lb-tf="month" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${this.timeframe === 'month' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
              <i class="fa-solid fa-calendar mr-1.5"></i> Tháng này
            </button>
            <button data-lb-tf="year" class="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${this.timeframe === 'year' ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
              <i class="fa-solid fa-graduation-cap mr-1.5"></i> Năm học
            </button>
          </div>

          <!-- Lọc theo khối -->
          <div class="flex items-center gap-2 w-full md:w-auto justify-end">
            <span class="text-xs text-slate-400 font-semibold hidden sm:inline">Khối:</span>
            <select id="lb-select-grade" class="px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-amber-500">
              <option value="all" ${this.grade === 'all' ? 'selected' : ''}>Tất cả khối lớp</option>
              <option value="12" ${this.grade === '12' ? 'selected' : ''}>Khối 12</option>
              <option value="11" ${this.grade === '11' ? 'selected' : ''}>Khối 11</option>
              <option value="10" ${this.grade === '10' ? 'selected' : ''}>Khối 10</option>
            </select>
          </div>
        </div>

        ${entries.length === 0 ? `
          <!-- Trạng thái chưa có dữ liệu trong mốc này -->
          <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
            <div class="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 flex items-center justify-center text-3xl mx-auto mb-4">
              <i class="fa-solid fa-medal"></i>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-1">
              Chưa có kết quả thi trong ${timeframeLabels[this.timeframe]}
            </h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto mb-6">
              Bảng vàng đang chờ đón tên của bạn! Hãy tham gia thi thử ngay để ghi danh vào bảng vinh danh hôm nay.
            </p>
            <button id="btn-lb-start-exam" class="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-amber-500/25 transition inline-flex items-center gap-2">
              <i class="fa-solid fa-play"></i> Bắt đầu làm bài thi thử ngay
            </button>
          </div>
        ` : `
          <!-- BỤC VINH QUANG PODIUM (TOP 1, 2, 3) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-end pt-6">
            
            <!-- HẠNG 2 (BẠC) -->
            <div class="order-2 sm:order-1 bg-white dark:bg-slate-800 rounded-3xl p-6 border-2 border-slate-200 dark:border-slate-700 text-center relative shadow-sm hover:shadow-md transition">
              <div class="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-white flex items-center justify-center font-black text-sm shadow-md ring-4 ring-white dark:ring-slate-800">
                🥈 2
              </div>
              ${top2 ? this.renderPodiumCard(top2, 'slate') : '<div class="py-10 text-xs text-slate-400">Đang chờ thí sinh</div>'}
            </div>

            <!-- HẠNG 1 (VÀNG) - Cao nhất & Nổi bật -->
            <div class="order-1 sm:order-2 bg-gradient-to-b from-amber-50 via-white to-amber-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800/90 rounded-3xl p-6 sm:p-8 border-2 border-amber-400 dark:border-amber-500 text-center relative shadow-xl shadow-amber-500/15 sm:-translate-y-4">
              <div class="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-white flex items-center justify-center font-black text-xl shadow-lg ring-4 ring-white dark:ring-slate-800 animate-bounce">
                👑
              </div>
              ${top1 ? this.renderPodiumCard(top1, 'amber', true) : ''}
            </div>

            <!-- HẠNG 3 (ĐỒNG) -->
            <div class="order-3 sm:order-3 bg-white dark:bg-slate-800 rounded-3xl p-6 border-2 border-amber-700/20 dark:border-slate-700 text-center relative shadow-sm hover:shadow-md transition">
              <div class="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-amber-700 text-white flex items-center justify-center font-black text-sm shadow-md ring-4 ring-white dark:ring-slate-800">
                🥉 3
              </div>
              ${top3 ? this.renderPodiumCard(top3, 'bronze') : '<div class="py-10 text-xs text-slate-400">Đang chờ thí sinh</div>'}
            </div>

          </div>

          <!-- BẢNG DANH SÁCH CHI TIẾT (TẤT CẢ VỊ TRÍ) -->
          <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div class="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-list-ol text-amber-500"></i> Danh Sách Bảng Vàng (${entries.length} Thí sinh)
              </h3>
              <span class="text-xs text-slate-400">${timeframeLabels[this.timeframe]}</span>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-900/50 text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                    <th class="py-3.5 px-4 font-bold text-center w-16">Thứ hạng</th>
                    <th class="py-3.5 px-4 font-bold">Thí sinh</th>
                    <th class="py-3.5 px-4 font-bold">Lớp</th>
                    <th class="py-3.5 px-4 font-bold">Trường</th>
                    <th class="py-3.5 px-4 font-bold">Đề thi</th>
                    <th class="py-3.5 px-4 font-bold text-center">Điểm số</th>
                    <th class="py-3.5 px-4 font-bold">Thời gian</th>
                    <th class="py-3.5 px-4 font-bold text-right">Ngày thi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
                  ${entries.map(item => this.renderTableRow(item)).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}

      </div>
    `;

    this.bindEvents();
  },

  renderPodiumCard(item, theme, isTop1 = false) {
    const mins = Math.floor(item.timeSpentSeconds / 60);
    const secs = item.timeSpentSeconds % 60;
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.studentName || 'HS')}&background=${isTop1 ? 'f59e0b' : (theme === 'slate' ? '94a3b8' : 'b45309')}&color=fff`;

    return `
      <div class="pt-4 space-y-3">
        <img src="${avatar}" alt="Avatar" class="w-16 h-16 ${isTop1 ? 'w-20 h-20' : ''} rounded-2xl mx-auto object-cover ring-4 ${isTop1 ? 'ring-amber-400 shadow-xl' : 'ring-slate-200 dark:ring-slate-700'}" />
        <div>
          <h4 class="font-bold text-slate-800 dark:text-white ${isTop1 ? 'text-base sm:text-lg' : 'text-sm'} leading-snug">
            ${escapeHtml(item.studentName)}
          </h4>
          <p class="text-xs text-slate-400 mt-0.5">
            Lớp <strong>${escapeHtml(item.studentClass || 'Tự do')}</strong> • ${escapeHtml(item.studentSchool || '')}
          </p>
        </div>

        <div class="pt-2 flex items-center justify-center gap-3">
          <div class="text-center px-3 py-1.5 rounded-xl ${isTop1 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}">
            <span class="block ${isTop1 ? 'text-2xl' : 'text-xl'} font-black leading-none">${item.score}</span>
            <span class="text-[10px] uppercase font-bold tracking-wider">Điểm</span>
          </div>

          <div class="text-center px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            <span class="block ${isTop1 ? 'text-base' : 'text-sm'} font-mono font-bold leading-none">${mins}p ${secs}s</span>
            <span class="text-[10px] uppercase font-bold tracking-wider">Thời gian</span>
          </div>
        </div>
      </div>
    `;
  },

  renderTableRow(item) {
    const mins = Math.floor(item.timeSpentSeconds / 60);
    const secs = item.timeSpentSeconds % 60;
    const date = new Date(item.date).toLocaleDateString('vi-VN');

    let rankBadge = `<span class="font-mono font-bold text-slate-500">#${item.rank}</span>`;
    if (item.rank === 1) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-black text-xs">🥇 1</span>`;
    else if (item.rank === 2) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs">🥈 2</span>`;
    else if (item.rank === 3) rankBadge = `<span class="px-2 py-0.5 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 font-black text-xs">🥉 3</span>`;

    let scoreBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
    if (item.score < 5.0) scoreBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    else if (item.score < 8.0) scoreBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';

    return `
      <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
        <td class="py-3 px-4 text-center">${rankBadge}</td>
        <td class="py-3 px-4 font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(item.studentName || 'HS')}&background=3b82f6&color=fff" class="w-6 h-6 rounded-lg object-cover" />
          <span>${escapeHtml(item.studentName || 'Thí sinh')}</span>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold">
            ${escapeHtml(item.studentClass || 'Tự do')}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300">${escapeHtml(item.studentSchool || '-')}</td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-[180px] truncate" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</td>
        <td class="py-3 px-4 text-center">
          <span class="px-2.5 py-1 rounded-lg font-black ${scoreBadge}">
            ${item.score}
          </span>
        </td>
        <td class="py-3 px-4 text-slate-500 font-mono">${mins}p ${secs}s</td>
        <td class="py-3 px-4 text-right text-slate-400">${date}</td>
      </tr>
    `;
  },

  bindEvents() {
    // Nút chọn mốc thời gian
    this.container.querySelectorAll('[data-lb-tf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.getAttribute('data-lb-tf');
        this.setTimeframe(tf);
      });
    });

    // Chọn khối
    const gradeSelect = this.container.querySelector('#lb-select-grade');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', (e) => {
        this.setGrade(e.target.value);
      });
    }

    // Nút Bắt đầu thi thử từ bục rỗng
    const startExamBtn = this.container.querySelector('#btn-lb-start-exam');
    if (startExamBtn) {
      startExamBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'exam-setup' }));
      });
    }
  }
};
