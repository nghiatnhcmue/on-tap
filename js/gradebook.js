/**
 * TIN HỌC HUB - GRADEBOOK & STUDENT PROGRESS ANALYTICS
 * Quản lý Sổ điểm, theo dõi tiến trình từng học sinh, phân tích lớp, điểm cao nhất, điểm trung bình,
 * đánh giá xu hướng tiến độ (Đang tiến bộ 🚀 / Cần cố gắng ⚠️ / Xuất sắc 🏆), và xuất file Excel chuẩn.
 */

import { Storage } from './storage.js';
import { Auth, SCHOOLS_DATA } from './auth.js';
import { escapeHtml } from './utils.js';

export const Gradebook = {
  container: null,
  activeTab: 'students', // 'students' | 'class' | 'sessions'
  filterSchool: 'all',
  filterGrade: 'all',
  filterClass: 'all',
  filterRoom: 'all',
  filterTrend: 'all',
  searchQuery: '',

  init(containerEl) {
    this.container = containerEl;
    this.render();
  },

  // --- TÍNH TOÁN TIẾN TRÌNH THEO HỌC SINH ---
  getStudentsProgress(historyList) {
    const groups = {};

    historyList.forEach(item => {
      // Key định danh học sinh: ưu tiên Email, nếu không có thì dùng Họ tên + Lớp
      const studentKey = (item.studentEmail && item.studentEmail.trim())
        ? item.studentEmail.trim().toLowerCase()
        : `${(item.studentName || 'unnamed').trim().toLowerCase()}__${(item.studentClass || 'noclass').trim().toLowerCase()}`;

      if (!groups[studentKey]) {
        groups[studentKey] = {
          key: studentKey,
          name: item.studentName || 'Thí sinh tự do',
          className: item.studentClass || 'Tự do',
          school: item.studentSchool || 'Chưa cập nhật',
          email: item.studentEmail || '',
          grade: item.grade || '12',
          exams: []
        };
      }
      groups[studentKey].exams.push(item);
    });

    // Tính toán số liệu thống kê & xu hướng tiến độ cho từng học sinh
    const students = Object.values(groups).map(st => {
      // Sắp xếp bài thi theo thứ tự thời gian tăng dần (cũ trước, mới sau)
      st.exams.sort((a, b) => new Date(a.date) - new Date(b.date));

      const totalExams = st.exams.length;
      const scores = st.exams.map(e => Number(e.score) || 0);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / totalExams) * 100) / 100;
      const latestExam = st.exams[totalExams - 1];
      const latestScore = Number(latestExam.score) || 0;
      const previousExam = totalExams > 1 ? st.exams[totalExams - 2] : null;
      const previousScore = previousExam ? (Number(previousExam.score) || 0) : null;
      const scoreDiff = previousScore !== null ? Math.round((latestScore - previousScore) * 100) / 100 : 0;

      // Đánh giá xu hướng tiến độ (Trend)
      let trend = 'starter';
      let trendLabel = 'Mới bắt đầu 🔄';
      let trendBadge = 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
      let trendNote = 'Đã làm 1 bài thi';

      if (totalExams >= 2) {
        if (scoreDiff >= 0.5 || (latestScore >= avgScore + 0.3 && latestScore >= 6.0)) {
          trend = 'improving';
          trendLabel = `Đang tiến bộ 🚀 (+${scoreDiff > 0 ? scoreDiff : 0.5}đ)`;
          trendBadge = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
          trendNote = `Điểm bài gần nhất tăng +${scoreDiff}đ so với bài trước`;
        } else if (avgScore >= 8.5 && latestScore >= 8.0) {
          trend = 'mastery';
          trendLabel = 'Xuất sắc 🏆';
          trendBadge = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
          trendNote = 'Duy trì kết quả xuất sắc liên tục';
        } else if (latestScore < 5.0 || avgScore < 5.0 || scoreDiff <= -1.0) {
          trend = 'needs_effort';
          trendLabel = `Cần cố gắng ⚠️ ${scoreDiff < 0 ? `(${scoreDiff}đ)` : ''}`;
          trendBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
          trendNote = scoreDiff < 0 ? `Điểm bài gần nhất giảm ${scoreDiff}đ` : 'Cần ôn thêm để vượt mốc 5.0 điểm';
        } else if (avgScore >= 6.5) {
          trend = 'proficient';
          trendLabel = 'Khá & Ổn định ⚡';
          trendBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
          trendNote = 'Kết quả ổn định ở mức khá';
        } else {
          trend = 'steady';
          trendLabel = 'Trung bình 📊';
          trendBadge = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
          trendNote = 'Phong độ chưa có nhiều đột phá';
        }
      } else {
        if (latestScore >= 8.5) {
          trend = 'mastery';
          trendLabel = 'Khởi đầu Xuất sắc 🏆';
          trendBadge = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
        } else if (latestScore < 5.0) {
          trend = 'needs_effort';
          trendLabel = 'Cần cố gắng ⚠️';
          trendBadge = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300';
        } else if (latestScore >= 6.5) {
          trend = 'proficient';
          trendLabel = 'Khởi đầu Khá ⚡';
          trendBadge = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
        }
      }

      const totalCorrect = st.exams.reduce((sum, e) => sum + (Number(e.correctCount) || 0), 0);
      const totalQuestions = st.exams.reduce((sum, e) => sum + (Number(e.totalQuestions) || 0), 0);
      const accuracyRate = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

      return {
        ...st,
        totalExams,
        maxScore,
        minScore,
        avgScore,
        latestScore,
        previousScore,
        scoreDiff,
        trend,
        trendLabel,
        trendBadge,
        trendNote,
        accuracyRate,
        latestDate: latestExam.date
      };
    });

    // Mặc định sắp xếp theo điểm trung bình giảm dần
    return students.sort((a, b) => b.avgScore - a.avgScore);
  },

  // --- TÍNH TOÁN BÁO CÁO THEO LỚP ---
  getClassAnalytics(historyList, targetClass, targetSchool = 'all') {
    let filtered = historyList;
    if (targetClass && targetClass !== 'all') {
      filtered = filtered.filter(item => item.studentClass === targetClass);
    }
    if (targetSchool && targetSchool !== 'all') {
      filtered = filtered.filter(item => item.studentSchool === targetSchool);
    }

    const students = this.getStudentsProgress(filtered);
    const totalExams = filtered.length;
    const totalStudents = students.length;

    if (totalStudents === 0) {
      return {
        totalStudents: 0,
        totalExams: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        passRate: 0,
        distribution: { excellent: 0, good: 0, fair: 0, average: 0, weak: 0 },
        trendCounts: { improving: 0, mastery: 0, proficient: 0, needs_effort: 0 },
        students: []
      };
    }

    const allScores = filtered.map(item => Number(item.score) || 0);
    const maxScore = Math.max(...allScores);
    const minScore = Math.min(...allScores);
    const avgScore = Math.round((allScores.reduce((a, b) => a + b, 0) / totalExams) * 100) / 100;

    // Phổ điểm
    const distribution = {
      excellent: allScores.filter(s => s >= 9.0).length,
      good: allScores.filter(s => s >= 8.0 && s < 9.0).length,
      fair: allScores.filter(s => s >= 6.5 && s < 8.0).length,
      average: allScores.filter(s => s >= 5.0 && s < 6.5).length,
      weak: allScores.filter(s => s < 5.0).length
    };

    const passCount = allScores.filter(s => s >= 5.0).length;
    const passRate = totalExams > 0 ? Math.round((passCount / totalExams) * 100) : 0;

    // Thống kê tiến độ trong lớp
    const trendCounts = {
      improving: students.filter(s => s.trend === 'improving').length,
      mastery: students.filter(s => s.trend === 'mastery').length,
      proficient: students.filter(s => s.trend === 'proficient').length,
      needs_effort: students.filter(s => s.trend === 'needs_effort').length
    };

    return {
      targetClass,
      targetSchool,
      totalStudents,
      totalExams,
      avgScore,
      maxScore,
      minScore,
      passRate,
      distribution,
      trendCounts,
      students
    };
  },

  // --- RENDER GIAO DIỆN CHÍNH SỔ ĐIỂM ---
  render() {
    if (!this.container) return;

    // Kiểm tra quyền hạn: Chỉ Giáo viên (GV) & Quản trị viên (Admin)
    if (!Auth.isTeacher()) {
      this.container.innerHTML = `
        <div class="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm max-w-xl mx-auto">
          <div class="w-16 h-16 rounded-3xl bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Sổ Điểm Lớp Học & Báo Cáo Phân Tích (Dành Cho Giáo Viên & Admin)
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            Học sinh có thể xem lại toàn bộ lịch sử bài thi và học bạ điện tử cá nhân của mình tại mục <b>Lịch sử thi</b>.
          </p>
          <button onclick="window.AppInstance.switchTab('history')" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-500/20">
            <i class="fa-regular fa-clock mr-1.5"></i> Xem Lịch Sử Thi Của Tôi
          </button>
        </div>
      `;
      return;
    }

    const history = Storage.getExamHistory();

    if (history.length === 0) {
      this.container.innerHTML = `
        <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
          <div class="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <h3 class="text-base font-bold text-slate-800 dark:text-white">Chưa có kết quả thi nào trong hệ thống</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Khi học sinh hoàn thành bài kiểm tra hoặc thi thử trực tuyến, điểm số, tiến trình và phân tích năng lực sẽ tự động hiển thị đầy đủ tại đây.
          </p>
        </div>
      `;
      return;
    }

    // Danh sách các lớp, trường, phòng duy nhất
    const schools = [...new Set(history.map(item => item.studentSchool).filter(Boolean))];
    const classes = [...new Set(history.map(item => item.studentClass).filter(Boolean))];
    const roomsList = [...new Set(history.map(item => item.roomId).filter(Boolean))];

    // Lọc theo bộ lọc
    const filteredHistory = history.filter(item => {
      if (this.filterSchool !== 'all' && item.studentSchool !== this.filterSchool) return false;
      if (this.filterGrade !== 'all' && item.grade !== this.filterGrade) return false;
      if (this.filterClass !== 'all' && item.studentClass !== this.filterClass) return false;
      if (this.filterRoom !== 'all' && item.roomId !== this.filterRoom) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchName = (item.studentName || '').toLowerCase().includes(q);
        const matchEmail = (item.studentEmail || '').toLowerCase().includes(q);
        const matchClass = (item.studentClass || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchClass) return false;
      }
      return true;
    });

    const studentsProgress = this.getStudentsProgress(filteredHistory);

    // Lọc theo xu hướng nếu có
    const displayStudents = this.filterTrend === 'all'
      ? studentsProgress
      : studentsProgress.filter(s => s.trend === this.filterTrend);

    // Tính toán tổng quan cả hệ thống / bộ lọc
    const totalExamsCount = filteredHistory.length;
    const totalStudentsCount = studentsProgress.length;
    const validScores = filteredHistory.map(h => Number(h.score) || 0);
    const overallAvgScore = validScores.length > 0
      ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
      : '0.00';
    const overallMaxScore = validScores.length > 0
      ? Math.max(...validScores).toFixed(2)
      : '0.00';

    const improvingCount = studentsProgress.filter(s => s.trend === 'improving').length;
    const needsEffortCount = studentsProgress.filter(s => s.trend === 'needs_effort').length;

    this.container.innerHTML = `
      <div class="space-y-6">
        
        <!-- Header & Action Buttons -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-chart-line text-blue-600"></i>
              Sổ Điểm Điện Tử & Theo Dõi Tiến Trình Học Tập
            </h2>
            <p class="text-xs text-slate-400 mt-1">
              Theo dõi điểm cao nhất, điểm trung bình, đánh giá xu hướng tiến bộ và xuất báo cáo Excel cho từng học sinh và từng lớp
            </p>
          </div>

          <!-- Nhóm nút xuất Excel -->
          <div class="flex items-center gap-2 flex-wrap">
            <button id="btn-export-students-excel" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition flex items-center gap-2 shadow-sm shadow-emerald-500/20">
              <i class="fa-solid fa-file-excel"></i> Xuất Báo Cáo Học Sinh
            </button>
            <button id="btn-export-sessions-excel" class="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-bold transition flex items-center gap-1.5">
              <i class="fa-solid fa-file-arrow-down"></i> Xuất Chi Tiết Bài Thi
            </button>
          </div>
        </div>

        <!-- 4 Thẻ KPI Tổng Quan -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <!-- Sĩ số học sinh -->
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-users"></i>
            </div>
            <div>
              <span class="text-slate-400 font-bold block">Tổng số học sinh</span>
              <strong class="text-xl font-black text-slate-800 dark:text-white">${totalStudentsCount} em</strong>
              <span class="text-[11px] text-slate-400 font-medium">${totalExamsCount} lượt làm bài</span>
            </div>
          </div>

          <!-- Điểm trung bình -->
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-bullseye"></i>
            </div>
            <div>
              <span class="text-slate-400 font-bold block">Điểm trung bình (ĐTB)</span>
              <strong class="text-xl font-black text-purple-600 dark:text-purple-400">${overallAvgScore} đ</strong>
              <span class="text-[11px] text-slate-400 font-medium">Thang điểm 10</span>
            </div>
          </div>

          <!-- Điểm cao nhất -->
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-trophy"></i>
            </div>
            <div>
              <span class="text-slate-400 font-bold block">Điểm cao nhất (Max)</span>
              <strong class="text-xl font-black text-amber-600 dark:text-amber-400">${overallMaxScore} đ</strong>
              <span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">Kỷ lục đạt được</span>
            </div>
          </div>

          <!-- Xu hướng tiến bộ -->
          <div class="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0">
              <i class="fa-solid fa-arrow-trend-up"></i>
            </div>
            <div>
              <span class="text-slate-400 font-bold block">Xu hướng tiến độ</span>
              <strong class="text-base font-black text-emerald-600 dark:text-emerald-400">${improvingCount} em đang tiến bộ 🚀</strong>
              <span class="text-[11px] text-rose-500 font-bold block mt-0.5">${needsEffortCount} em cần cố gắng ⚠️</span>
            </div>
          </div>
        </div>

        <!-- Thanh Điều Hướng Chế Độ Xem (Tabs) & Bộ Lọc Nâng Cao -->
        <div class="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700">
            <!-- Tabs -->
            <div class="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 self-start sm:self-auto overflow-x-auto max-w-full">
              <button type="button" data-gb-tab="students" class="px-4 py-2 rounded-xl text-xs font-bold ${this.activeTab === 'students' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-blue-600'} transition whitespace-nowrap">
                <i class="fa-solid fa-user-graduate mr-1.5"></i> Theo Dõi Học Sinh (${studentsProgress.length})
              </button>
              <button type="button" data-gb-tab="class" class="px-4 py-2 rounded-xl text-xs font-bold ${this.activeTab === 'class' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-blue-600'} transition whitespace-nowrap">
                <i class="fa-solid fa-users-rectangle mr-1.5"></i> Phân Tích Theo Lớp
              </button>
              <button type="button" data-gb-tab="sessions" class="px-4 py-2 rounded-xl text-xs font-bold ${this.activeTab === 'sessions' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-blue-600'} transition whitespace-nowrap">
                <i class="fa-solid fa-list-check mr-1.5"></i> Toàn Bộ Bài Thi (${filteredHistory.length})
              </button>
            </div>

            <!-- Tìm kiếm tên học sinh -->
            <div class="relative w-full sm:w-64">
              <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-3 text-slate-400 text-xs"></i>
              <input type="text" id="gb-input-search" value="${escapeHtml(this.searchQuery)}" placeholder="Tìm theo tên học sinh, email..." class="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <!-- Bộ lọc đa chiều: Trường, Khối, Lớp, Phòng thi, Xu hướng -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <!-- 1. Lọc Trường -->
            <div>
              <label class="block text-[11px] font-bold text-slate-400 mb-1">Trường học</label>
              <select id="gb-select-school" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all">Tất cả các trường</option>
                ${schools.map(s => `<option value="${escapeHtml(s)}" ${this.filterSchool === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
              </select>
            </div>

            <!-- 2. Lọc Khối -->
            <div>
              <label class="block text-[11px] font-bold text-slate-400 mb-1">Khối lớp</label>
              <select id="gb-select-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all">Tất cả khối</option>
                <option value="12" ${this.filterGrade === '12' ? 'selected' : ''}>Khối 12</option>
                <option value="11" ${this.filterGrade === '11' ? 'selected' : ''}>Khối 11</option>
                <option value="10" ${this.filterGrade === '10' ? 'selected' : ''}>Khối 10</option>
              </select>
            </div>

            <!-- 3. Lọc Lớp -->
            <div>
              <label class="block text-[11px] font-bold text-slate-400 mb-1">Lớp học</label>
              <select id="gb-select-class" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all">Tất cả các lớp</option>
                ${classes.map(c => `<option value="${escapeHtml(c)}" ${this.filterClass === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`).join('')}
              </select>
            </div>

            <!-- 4. Lọc Phòng thi -->
            <div>
              <label class="block text-[11px] font-bold text-slate-400 mb-1">Phòng thi</label>
              <select id="gb-select-room" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 font-mono">
                <option value="all">Tất cả phòng & tự do</option>
                ${roomsList.map(r => `<option value="${escapeHtml(r)}" ${this.filterRoom === r ? 'selected' : ''}>Phòng: ${escapeHtml(r)}</option>`).join('')}
              </select>
            </div>

            <!-- 5. Lọc Tiến độ -->
            <div>
              <label class="block text-[11px] font-bold text-slate-400 mb-1">Đánh giá tiến độ</label>
              <select id="gb-select-trend" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300">
                <option value="all">Mọi trạng thái</option>
                <option value="improving" ${this.filterTrend === 'improving' ? 'selected' : ''}>🚀 Đang tiến bộ</option>
                <option value="mastery" ${this.filterTrend === 'mastery' ? 'selected' : ''}>🏆 Xuất sắc & Ổn định</option>
                <option value="proficient" ${this.filterTrend === 'proficient' ? 'selected' : ''}>⚡ Khá & Phát triển</option>
                <option value="needs_effort" ${this.filterTrend === 'needs_effort' ? 'selected' : ''}>⚠️ Cần cố gắng</option>
              </select>
            </div>
          </div>
        </div>

        <!-- NỘI DUNG TƯƠNG ỨNG THEO TAB -->
        <div id="gb-tab-content-area">
          ${this.activeTab === 'students' ? this.renderStudentsTabHtml(displayStudents) : ''}
          ${this.activeTab === 'class' ? this.renderClassAnalyticsTabHtml(filteredHistory, classes, schools) : ''}
          ${this.activeTab === 'sessions' ? this.renderSessionsTabHtml(filteredHistory) : ''}
        </div>

      </div>
    `;

    this.bindEvents(history, studentsProgress);
  },

  // --- TAB 1: DANH SÁCH TIẾN TRÌNH HỌC SINH ---
  renderStudentsTabHtml(students) {
    if (students.length === 0) {
      return `
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
          <i class="fa-solid fa-filter text-3xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <p class="font-bold">Không tìm thấy học sinh nào phù hợp với bộ lọc hiện tại.</p>
          <p class="text-[11px] mt-1">Hãy thử chọn lại Trường, Lớp hoặc xóa ô tìm kiếm.</p>
        </div>
      `;
    }

    return `
      <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-5 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-ranking-star text-amber-500"></i>
            Bảng Theo Dõi Năng Lực & Tiến Trình Từng Học Sinh (${students.length} em)
          </h3>
          <span class="text-xs text-slate-400 font-medium">Bấm vào tên học sinh để xem học bạ chi tiết</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="bg-slate-50/75 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th class="py-3 px-4">Học Sinh</th>
                <th class="py-3 px-3">Lớp & Trường</th>
                <th class="py-3 px-3 text-center">Số bài đã thi</th>
                <th class="py-3 px-3 text-center">Điểm cao nhất</th>
                <th class="py-3 px-3 text-center">Điểm TB</th>
                <th class="py-3 px-3 text-center">Bài gần nhất</th>
                <th class="py-3 px-3 text-center">Đánh giá tiến độ</th>
                <th class="py-3 px-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
              ${students.map(st => {
                let maxColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                let avgColor = 'text-blue-600 dark:text-blue-400 font-black';
                if (st.avgScore >= 8.5) avgColor = 'text-emerald-600 dark:text-emerald-400 font-black';
                else if (st.avgScore < 5.0) avgColor = 'text-rose-600 dark:text-rose-400 font-bold';

                return `
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
                    <td class="py-3.5 px-4">
                      <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          ${st.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong class="text-slate-800 dark:text-white block text-xs hover:text-blue-600 cursor-pointer" data-view-student-key="${escapeHtml(st.key)}">
                            ${escapeHtml(st.name)}
                          </strong>
                          ${st.email ? `<span class="text-[10px] text-slate-400 block">${escapeHtml(st.email)}</span>` : ''}
                        </div>
                      </div>
                    </td>
                    <td class="py-3.5 px-3">
                      <span class="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                        Lớp ${escapeHtml(st.className)}
                      </span>
                      <span class="text-[11px] text-slate-400 block mt-0.5 truncate max-w-[140px]" title="${escapeHtml(st.school)}">${escapeHtml(st.school)}</span>
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <span class="font-bold text-slate-700 dark:text-slate-300 font-mono">${st.totalExams} bài</span>
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <span class="inline-block px-2.5 py-1 rounded-xl font-black text-xs font-mono ${maxColor}">
                        ${st.maxScore.toFixed(1)}
                      </span>
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <span class="text-sm font-mono ${avgColor}">
                        ${st.avgScore.toFixed(2)}
                      </span>
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <div class="inline-flex items-center gap-1 font-mono font-bold text-xs">
                        <span>${st.latestScore.toFixed(1)}</span>
                        ${st.scoreDiff > 0 ? `<span class="text-emerald-500 text-[10px]">↑+${st.scoreDiff}</span>` : (st.scoreDiff < 0 ? `<span class="text-rose-500 text-[10px]">↓${st.scoreDiff}</span>` : '')}
                      </div>
                    </td>
                    <td class="py-3.5 px-3 text-center">
                      <span class="inline-block px-2.5 py-1 rounded-xl text-[10px] font-black border ${st.trendBadge}" title="${escapeHtml(st.trendNote)}">
                        ${st.trendLabel}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 text-right">
                      <button type="button" data-view-student-key="${escapeHtml(st.key)}" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition flex items-center gap-1 ml-auto">
                        <i class="fa-solid fa-book-open text-[11px]"></i> Học bạ
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // --- TAB 2: BÁO CÁO & PHỔ ĐIỂM THEO LỚP ---
  renderClassAnalyticsTabHtml(historyList, allClasses, allSchools) {
    const targetClass = this.filterClass !== 'all' ? this.filterClass : (allClasses[0] || 'all');
    const analytics = this.getClassAnalytics(historyList, targetClass, this.filterSchool);

    const dist = analytics.distribution;
    const totalDist = (dist.excellent + dist.good + dist.fair + dist.average + dist.weak) || 1;

    const pExc = Math.round((dist.excellent / totalDist) * 100);
    const pGood = Math.round((dist.good / totalDist) * 100);
    const pFair = Math.round((dist.fair / totalDist) * 100);
    const pAvg = Math.round((dist.average / totalDist) * 100);
    const pWeak = Math.round((dist.weak / totalDist) * 100);

    return `
      <div class="space-y-6">
        <!-- Header Chọn Lớp -->
        <div class="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-3xl shadow-md border border-blue-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white/20 text-white mb-2 inline-block">
              Phân tích học lực chuyên sâu
            </span>
            <h3 class="text-xl font-black text-white">
              Báo Cáo Tiến Trình: ${targetClass === 'all' ? 'Toàn bộ các lớp' : `Lớp ${escapeHtml(targetClass)}`}
            </h3>
            <p class="text-xs text-blue-200 mt-1">
              ${analytics.targetSchool === 'all' ? 'Tất cả trường' : escapeHtml(analytics.targetSchool)} • Sĩ số tham gia: <b>${analytics.totalStudents} học sinh</b> (${analytics.totalExams} bài thi)
            </p>
          </div>

          <div class="flex items-center gap-2 self-start md:self-auto">
            <span class="text-xs font-bold text-blue-200">Chọn lớp khác:</span>
            <select id="class-analytics-switcher" class="px-3 py-2 bg-black/40 border border-white/20 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="all" ${targetClass === 'all' ? 'selected' : ''}>Tất cả các lớp</option>
              ${allClasses.map(c => `<option value="${escapeHtml(c)}" ${targetClass === c ? 'selected' : ''}>Lớp ${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- KPI Lớp -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
            <span class="text-slate-400 font-bold block mb-1">Điểm TB Lớp</span>
            <span class="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">${analytics.avgScore}</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Thang điểm 10.0</span>
          </div>

          <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
            <span class="text-slate-400 font-bold block mb-1">Điểm Cao Nhất (Max)</span>
            <span class="text-2xl font-black text-amber-500 font-mono">${analytics.maxScore}</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Kỷ lục của lớp</span>
          </div>

          <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
            <span class="text-slate-400 font-bold block mb-1">Tỷ Lệ Đạt (>= 5.0đ)</span>
            <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">${analytics.passRate}%</span>
            <span class="text-[11px] text-slate-400 block mt-0.5">Đạt yêu cầu chuẩn GD</span>
          </div>

          <div class="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
            <span class="text-slate-400 font-bold block mb-1">Đang Tiến Bộ</span>
            <span class="text-2xl font-black text-emerald-500 font-mono">${analytics.trendCounts.improving} em</span>
            <span class="text-[11px] text-rose-500 font-bold block mt-0.5">${analytics.trendCounts.needs_effort} em cần cố gắng</span>
          </div>
        </div>

        <!-- Biểu Đồ Phổ Điểm Lớp -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
            <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-chart-column text-indigo-500"></i>
              Phổ Điểm Phân Bố Của Lớp (Tổng ${analytics.totalExams} lượt bài thi)
            </h4>
            <span class="text-xs text-slate-400 font-medium">Barem chuẩn Bộ GD&ĐT</span>
          </div>

          <!-- Thanh phần trăm ngang trực quan -->
          <div class="w-full h-5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-700 shadow-inner">
            <div style="width: ${pExc}%" class="bg-indigo-600 h-full" title="Xuất sắc: ${pExc}%"></div>
            <div style="width: ${pGood}%" class="bg-blue-500 h-full" title="Giỏi: ${pGood}%"></div>
            <div style="width: ${pFair}%" class="bg-teal-500 h-full" title="Khá: ${pFair}%"></div>
            <div style="width: ${pAvg}%" class="bg-amber-400 h-full" title="Trung bình: ${pAvg}%"></div>
            <div style="width: ${pWeak}%" class="bg-rose-500 h-full" title="Cần cố gắng: ${pWeak}%"></div>
          </div>

          <!-- Chi tiết từng mức điểm -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 text-xs">
            <div class="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
              <div class="flex items-center gap-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0"></span> Xuất sắc (9 - 10đ)
              </div>
              <strong class="text-base font-black text-indigo-700 dark:text-indigo-300 block mt-1">${dist.excellent} bài (${pExc}%)</strong>
            </div>

            <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
              <div class="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300">
                <span class="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span> Giỏi (8 - 8.9đ)
              </div>
              <strong class="text-base font-black text-blue-700 dark:text-blue-300 block mt-1">${dist.good} bài (${pGood}%)</strong>
            </div>

            <div class="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
              <div class="flex items-center gap-1.5 font-bold text-teal-700 dark:text-teal-300">
                <span class="w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0"></span> Khá (6.5 - 7.9đ)
              </div>
              <strong class="text-base font-black text-teal-700 dark:text-teal-300 block mt-1">${dist.fair} bài (${pFair}%)</strong>
            </div>

            <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
              <div class="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span> Trung bình (5 - 6.4đ)
              </div>
              <strong class="text-base font-black text-amber-700 dark:text-amber-300 block mt-1">${dist.average} bài (${pAvg}%)</strong>
            </div>

            <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 col-span-2 sm:col-span-1">
              <div class="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span> Cần cố gắng (&lt; 5đ)
              </div>
              <strong class="text-base font-black text-rose-700 dark:text-rose-300 block mt-1">${dist.weak} bài (${pWeak}%)</strong>
            </div>
          </div>
        </div>

        <!-- Danh sách học sinh trong lớp -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h4 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-white flex items-center justify-between">
            <span>Danh Sách Học Sinh Trong Lớp (Xếp theo Điểm TB & Tiến độ)</span>
            <span class="text-blue-600 font-bold">${analytics.students.length} em</span>
          </h4>
          ${this.renderStudentsTabHtml(analytics.students)}
        </div>
      </div>
    `;
  },

  // --- TAB 3: TOÀN BỘ NHẬT KÝ BÀI THI ---
  renderSessionsTabHtml(history) {
    if (history.length === 0) {
      return `
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
          <p class="font-bold">Không tìm thấy bài thi nào phù hợp với bộ lọc.</p>
        </div>
      `;
    }

    return `
      <div class="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="p-5 pb-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fa-solid fa-list-ul text-blue-600"></i>
            Chi Tiết Toàn Bộ ${history.length} Lượt Bài Thi Đã Nộp
          </h3>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs" id="gradebook-table">
            <thead>
              <tr class="bg-slate-50/75 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th class="py-3 px-3">STT</th>
                <th class="py-3 px-3">Họ và Tên</th>
                <th class="py-3 px-3">Lớp & Khối</th>
                <th class="py-3 px-3">Trường</th>
                <th class="py-3 px-3">Phòng thi</th>
                <th class="py-3 px-3">Bài thi & Mã đề</th>
                <th class="py-3 px-3 text-center">Điểm</th>
                <th class="py-3 px-3 text-center">Giám sát vi phạm</th>
                <th class="py-3 px-3">Thời gian</th>
                <th class="py-3 px-3">Thời điểm nộp</th>
              </tr>
            </thead>
            <tbody id="gradebook-table-body" class="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium">
              ${history.map((item, idx) => {
                const date = new Date(item.date).toLocaleString('vi-VN');
                const mins = Math.floor(item.timeSpentSeconds / 60);
                const secs = item.timeSpentSeconds % 60;

                let scoreColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
                if (item.score < 5.0) scoreColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
                else if (item.score < 6.5) scoreColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                else if (item.score < 8.0) scoreColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';

                const proctorBadge = item.isDisqualified ? `
                  <button type="button" data-view-audit="${item.id}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:scale-105 transition" title="Bấm để xem chi tiết mốc thời gian vi phạm">
                    <i class="fa-solid fa-ban text-[9px]"></i> Đình chỉ (${item.violationCount || 0}) <i class="fa-solid fa-magnifying-glass text-[8px] ml-0.5"></i>
                  </button>
                ` : (item.violationCount > 0 ? `
                  <button type="button" data-view-audit="${item.id}" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:scale-105 transition" title="Bấm để xem mốc thời gian cảnh báo">
                    <i class="fa-solid fa-triangle-exclamation text-[9px]"></i> Cảnh báo (${item.violationCount}) <i class="fa-solid fa-magnifying-glass text-[8px] ml-0.5"></i>
                  </button>
                ` : (item.isProctored ? `
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <i class="fa-solid fa-check text-[9px]"></i> 0 vi phạm
                  </span>
                ` : `<span class="text-slate-400 font-mono text-[11px]">Tự do</span>`));

                return `
                  <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition">
                    <td class="py-3 px-3 text-slate-400">${idx + 1}</td>
                    <td class="py-3 px-3 font-bold text-slate-800 dark:text-white">
                      ${escapeHtml(item.studentName || 'Thí sinh tự do')}
                    </td>
                    <td class="py-3 px-3">
                      <span class="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold">
                        Lớp ${escapeHtml(item.studentClass || 'Tự do')}
                      </span>
                      <span class="text-[10px] text-slate-400 block mt-0.5 font-bold">Khối ${escapeHtml(item.grade || '12')}</span>
                    </td>
                    <td class="py-3 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[120px]" title="${escapeHtml(item.studentSchool || '-')}">
                      ${escapeHtml(item.studentSchool || '-')}
                    </td>
                    <td class="py-3 px-3">
                      ${item.roomId ? `
                        <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          ${escapeHtml(item.roomId)}
                        </span>
                      ` : `<span class="text-slate-400 italic">Tự do</span>`}
                    </td>
                    <td class="py-3 px-3 max-w-[180px] text-slate-700 dark:text-slate-300">
                      <span class="block truncate font-bold" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
                      <span class="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">Mã đề: ${escapeHtml(item.examCode || '101')}</span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="px-2.5 py-1 rounded-lg font-black font-mono ${scoreColor}">
                        ${item.score}
                      </span>
                    </td>
                    <td class="py-3 px-3 text-center">${proctorBadge}</td>
                    <td class="py-3 px-3 text-slate-400 font-mono">${mins}p ${secs}s</td>
                    <td class="py-3 px-3 text-slate-400">${date}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // --- SỰ KIỆN GIAO DIỆN ---
  bindEvents(history, studentsProgress) {
    if (!this.container) return;

    // Chuyển Tab
    this.container.querySelectorAll('[data-gb-tab]').forEach(btn => {
      btn.onclick = () => {
        this.activeTab = btn.getAttribute('data-gb-tab');
        this.render();
      };
    });

    // Switcher lớp trong Tab 2
    const classSwitcher = this.container.querySelector('#class-analytics-switcher');
    if (classSwitcher) {
      classSwitcher.onchange = (e) => {
        this.filterClass = e.target.value;
        this.render();
      };
    }

    // Bộ lọc
    const searchInput = this.container.querySelector('#gb-input-search');
    const schoolSelect = this.container.querySelector('#gb-select-school');
    const gradeSelect = this.container.querySelector('#gb-select-grade');
    const classSelect = this.container.querySelector('#gb-select-class');
    const roomSelect = this.container.querySelector('#gb-select-room');
    const trendSelect = this.container.querySelector('#gb-select-trend');

    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = e.target.value.trim();
        this.render();
      };
    }
    if (schoolSelect) {
      schoolSelect.onchange = (e) => {
        this.filterSchool = e.target.value;
        this.render();
      };
    }
    if (gradeSelect) {
      gradeSelect.onchange = (e) => {
        this.filterGrade = e.target.value;
        this.render();
      };
    }
    if (classSelect) {
      classSelect.onchange = (e) => {
        this.filterClass = e.target.value;
        this.render();
      };
    }
    if (roomSelect) {
      roomSelect.onchange = (e) => {
        this.filterRoom = e.target.value;
        this.render();
      };
    }
    if (trendSelect) {
      trendSelect.onchange = (e) => {
        this.filterTrend = e.target.value;
        this.render();
      };
    }

    // Nút xem biên bản vi phạm
    this.container.querySelectorAll('[data-view-audit]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-view-audit');
        const target = history.find(h => h.id === id);
        if (target && window.App?.openViolationAuditModal) {
          window.App.openViolationAuditModal(target);
        }
      };
    });

    // Nút xem học bạ chi tiết của học sinh
    this.container.querySelectorAll('[data-view-student-key]').forEach(btn => {
      btn.onclick = () => {
        const key = btn.getAttribute('data-view-student-key');
        const targetStudent = studentsProgress.find(s => s.key === key);
        if (targetStudent) {
          this.openStudentProgressModal(targetStudent);
        }
      };
    });

    // Nút xuất Excel danh sách học sinh
    const btnExpStudents = this.container.querySelector('#btn-export-students-excel');
    if (btnExpStudents) {
      btnExpStudents.onclick = () => this.exportStudentsProgressToExcel(studentsProgress);
    }

    // Nút xuất Excel toàn bộ bài thi
    const btnExpSessions = this.container.querySelector('#btn-export-sessions-excel');
    if (btnExpSessions) {
      btnExpSessions.onclick = () => this.exportSessionsToExcel(history);
    }
  },

  // --- MODAL: XEM TIẾN TRÌNH & HỌC BẠ ĐIỆN TỬ CỦA HỌC SINH ---
  openStudentProgressModal(student) {
    const modal = document.getElementById('modal-student-progress');
    if (!modal) return;

    const nameEl = document.getElementById('sp-modal-name');
    const metaEl = document.getElementById('sp-modal-meta');
    const maxEl = document.getElementById('sp-modal-max');
    const avgEl = document.getElementById('sp-modal-avg');
    const latestEl = document.getElementById('sp-modal-latest');
    const countEl = document.getElementById('sp-modal-count');
    const trendBadgeEl = document.getElementById('sp-modal-trend-badge');
    const pedagogicalNoteEl = document.getElementById('sp-modal-pedagogical-note');
    const barsContainer = document.getElementById('sp-modal-bars-container');
    const examsTableBody = document.getElementById('sp-modal-exams-tbody');

    if (nameEl) nameEl.textContent = student.name;
    if (metaEl) {
      metaEl.textContent = `Lớp: ${student.className} • Khối ${student.grade} • Trường: ${student.school} ${student.email ? `• ${student.email}` : ''}`;
    }
    if (maxEl) maxEl.textContent = `${student.maxScore.toFixed(1)}đ`;
    if (avgEl) avgEl.textContent = `${student.avgScore.toFixed(2)}đ`;
    if (latestEl) latestEl.textContent = `${student.latestScore.toFixed(1)}đ`;
    if (countEl) countEl.textContent = `${student.totalExams} bài`;

    if (trendBadgeEl) {
      trendBadgeEl.className = `inline-block px-3 py-1 rounded-xl text-xs font-black border ${student.trendBadge}`;
      trendBadgeEl.textContent = student.trendLabel;
    }

    // Nhận xét sư phạm tự động
    let feedback = '';
    if (student.trend === 'improving') {
      feedback = `🌟 <b>Nhận xét:</b> Học sinh có sự nỗ lực vượt bậc! Điểm số bài gần nhất (${student.latestScore}đ) có bước tiến rõ rệt so với các lần thi trước (+${student.scoreDiff}đ). Tiếp tục phát huy phương pháp ôn tập này.`;
    } else if (student.trend === 'mastery') {
      feedback = `🏆 <b>Nhận xét:</b> Học sinh đạt mức năng lực Xuất sắc ổn định (${student.avgScore}đ). Nắm rất vững kiến thức cả phần Trắc nghiệm lẫn Đúng/Sai. Khuyến khích tham gia giải các câu hỏi Vận dụng cao.`;
    } else if (student.trend === 'needs_effort') {
      feedback = `⚠️ <b>Nhận xét:</b> Điểm số hiện tại (${student.latestScore}đ) đang ở mức cần cố gắng. Học sinh nên vào mục "Luyện Câu Hay Sai" và luyện các bài kiểm tra 15 phút theo từng bài để củng cố lại lý thuyết căn bản.`;
    } else {
      feedback = `⚡ <b>Nhận xét:</b> Học sinh duy trì phong độ khá (${student.avgScore}đ). Cần rèn luyện thêm kỹ năng làm dạng bài Đúng/Sai để nâng điểm lên mốc 8.5+.`;
    }

    if (pedagogicalNoteEl) pedagogicalNoteEl.innerHTML = feedback;

    // Biểu đồ thanh trực quan (Visual Score Bars)
    if (barsContainer) {
      barsContainer.innerHTML = student.exams.map((ex, idx) => {
        const score = Number(ex.score) || 0;
        const heightPct = Math.max(10, Math.round((score / 10) * 100));
        let barColor = 'bg-blue-500';
        if (score >= 8.5) barColor = 'bg-emerald-500';
        else if (score < 5.0) barColor = 'bg-rose-500';
        else if (score >= 6.5) barColor = 'bg-indigo-500';

        const examDate = new Date(ex.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

        return `
          <div class="flex-1 flex flex-col items-center justify-end h-32 group relative">
            <span class="text-[10px] font-bold text-slate-500 mb-1 font-mono">${score}</span>
            <div style="height: ${heightPct}%" class="w-full max-w-[28px] rounded-t-lg ${barColor} group-hover:brightness-110 transition shadow-sm"></div>
            <span class="text-[9px] text-slate-400 mt-1.5 font-medium truncate max-w-full">#${idx+1}</span>
            <div class="hidden group-hover:block absolute -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg whitespace-nowrap z-20 shadow-md">
              ${escapeHtml(ex.title)}: ${score}đ (${examDate})
            </div>
          </div>
        `;
      }).join('');
    }

    // Bảng danh sách bài thi của học sinh này
    if (examsTableBody) {
      examsTableBody.innerHTML = student.exams.map((ex, idx) => {
        const mins = Math.floor(ex.timeSpentSeconds / 60);
        const secs = ex.timeSpentSeconds % 60;
        const date = new Date(ex.date).toLocaleString('vi-VN');
        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
            <td class="py-2.5 px-3 text-slate-400">${idx + 1}</td>
            <td class="py-2.5 px-3 font-bold text-slate-800 dark:text-white">
              ${escapeHtml(ex.title)}
              ${ex.examCode ? `<span class="ml-1 text-[10px] text-amber-600 font-mono font-bold">(Mã đề ${escapeHtml(ex.examCode)})</span>` : ''}
            </td>
            <td class="py-2.5 px-3">
              ${ex.roomId ? `<span class="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold">${escapeHtml(ex.roomId)}</span>` : '<span class="text-slate-400 italic">Tự do</span>'}
            </td>
            <td class="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
              ${ex.correctCount}/${ex.totalQuestions}
            </td>
            <td class="py-2.5 px-3 text-center">
              <span class="px-2 py-0.5 rounded font-black font-mono ${ex.score >= 8.0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60' : (ex.score < 5.0 ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800')}">
                ${ex.score}
              </span>
            </td>
            <td class="py-2.5 px-3 text-slate-400 font-mono">${mins}p ${secs}s</td>
            <td class="py-2.5 px-3 text-slate-400">${date}</td>
          </tr>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
  },

  // --- XUẤT EXCEL: BÁO CÁO TIẾN TRÌNH HỌC SINH (UTF-8 WITH BOM) ---
  exportStudentsProgressToExcel(studentsList) {
    const headers = [
      'STT',
      'Họ và Tên',
      'Lớp',
      'Khối',
      'Trường Học',
      'Email / Mã Thí Sinh',
      'Số Bài Thi Đã Làm',
      'Điểm Cao Nhất (Max)',
      'Điểm Trung Bình (ĐTB)',
      'Điểm Bài Gần Nhất',
      'Thay Đổi So Với Lần Trước',
      'Tỷ Lệ Trả Lời Đúng (%)',
      'Đánh Giá Xu Hướng Tiến Độ',
      'Ghi Chú Sư Phạm'
    ];

    const rows = studentsList.map((st, idx) => {
      const diffText = st.scoreDiff > 0 ? `+${st.scoreDiff}` : (st.scoreDiff < 0 ? `${st.scoreDiff}` : '0');
      return [
        idx + 1,
        `"${(st.name || '').replace(/"/g, '""')}"`,
        `"${(st.className || '').replace(/"/g, '""')}"`,
        st.grade || '12',
        `"${(st.school || '').replace(/"/g, '""')}"`,
        `"${(st.email || '').replace(/"/g, '""')}"`,
        st.totalExams,
        st.maxScore.toFixed(1),
        st.avgScore.toFixed(2),
        st.latestScore.toFixed(1),
        `"${diffText} điểm"`,
        `"${st.accuracyRate}%"`,
        `"${st.trendLabel}"`,
        `"${(st.trendNote || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bao_Cao_Tien_Trinh_Hoc_Sinh_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Đã xuất thành công file Báo cáo Tiến trình Học sinh!\nFile tương thích 100% với Microsoft Excel, Google Sheets và không bị lỗi font tiếng Việt.');
  },

  // --- XUẤT EXCEL: CHI TIẾT TOÀN BỘ BÀI THI ---
  exportSessionsToExcel(history) {
    const headers = [
      'STT',
      'Họ và Tên',
      'Lớp',
      'Khối',
      'Trường Học',
      'Email',
      'Mã Phòng Thi',
      'Tên Đề Thi',
      'Mã Đề',
      'Điểm Số (Thang 10)',
      'Điểm P1 (MCQ)',
      'Điểm P2 (Đúng/Sai)',
      'Số Câu Đúng',
      'Tổng Số Câu',
      'Thời Gian Làm Bài',
      'Giám Sát Chống Gian Lận',
      'Số Lần Vi Phạm',
      'Trạng Thái',
      'Thời Điểm Nộp'
    ];

    const rows = history.map((item, idx) => {
      const mins = Math.floor(item.timeSpentSeconds / 60);
      const secs = item.timeSpentSeconds % 60;
      const statusText = item.isDisqualified ? 'Bị đình chỉ thi' : (item.violationCount > 0 ? `Cảnh báo (${item.violationCount} lần)` : 'Hợp lệ');
      return [
        idx + 1,
        `"${(item.studentName || '').replace(/"/g, '""')}"`,
        `"${(item.studentClass || '').replace(/"/g, '""')}"`,
        item.grade || '12',
        `"${(item.studentSchool || '').replace(/"/g, '""')}"`,
        `"${(item.studentEmail || '').replace(/"/g, '""')}"`,
        `"${(item.roomId || 'Tự do').replace(/"/g, '""')}"`,
        `"${(item.title || '').replace(/"/g, '""')}"`,
        `"${(item.examCode || '101')}"`,
        item.score,
        item.part1Score ?? (item.score >= 6 ? 6 : item.score),
        item.part2Score ?? (item.score >= 6 ? item.score - 6 : 0),
        item.correctCount,
        item.totalQuestions,
        `"${mins}p ${secs}s"`,
        item.isProctored ? 'Bật' : 'Tắt',
        item.violationCount || 0,
        `"${statusText}"`,
        `"${new Date(item.date).toLocaleString('vi-VN')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Chi_Tiet_Bai_Thi_Tin_Hoc_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('Đã xuất thành công file Chi tiết Bài thi!\nFile có định dạng Unicode tiếng Việt chuẩn mở trực tiếp bằng Microsoft Excel.');
  }
};
