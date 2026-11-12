import { ensureXLSX } from './lazy-libs.js?v=20261112_240';
/**
 * tinhoc-hub: Questions Manager (Quản Lý Câu Hỏi)
 * Dành cho Giáo viên (GV) & Quản trị viên (Admin)
 * Cho phép: Thêm, Sửa, Xóa câu hỏi trong ngân hàng đề, lọc và tìm kiếm trực quan.
 */

import { Storage } from './storage.js?v=20261112_240';
import { Auth } from './auth.js?v=20261112_240';
import { escapeHtml } from './utils.js?v=20261112_240';

export const QuestionsManager = {
  container: null,
  manifest: null,
  loadGradeDataCallback: null,
  currentGrade: '12',
  currentTopic: 'all',
  currentLevel: 'all',
  searchKeyword: '',
  currentPage: 1,
  pageSize: 20,
  cachedRawQuestions: {},
  activeManagerTab: 'all', // 'all' (Ngân hàng chung) | 'my-contributions' (Kho đóng góp của tôi)
  pendingExcelPackage: null,

  init(containerEl, manifest, loadGradeDataFn) {
    this.container = containerEl;
    this.manifest = manifest;
    this.loadGradeDataCallback = loadGradeDataFn;
    this.render();
    if (typeof window !== 'undefined' && window.CloudSync) {
      window.CloudSync.syncCustomQuestions().then(() => this.render()).catch(() => {});
      window.CloudSync.syncTeacherContributions().then(() => this.render()).catch(() => {});
    }
  },


  // ==========================================
  // XUẤT FILE EXCEL MẪU CHUẨN ĐỂ GIÁO VIÊN NHẬP CÂU HỎI
  // ==========================================
  async downloadExcelTemplate() {
    const XLSX = await ensureXLSX();

    // 1. Sheet Câu Hỏi Mẫu
    const rows = [
      ['STT', 'Môn học / Lĩnh vực', 'Khối lớp', 'Chủ đề', 'Bài học', 'Loại câu (MCQ/DS/TLN)', 'Mức độ (1/2/3/4/DS/TLN)', 'Nội dung câu hỏi', 'Phương án A', 'Phương án B', 'Phương án C', 'Phương án D', 'Đáp án đúng', 'Hướng dẫn giải / Giải thích'],
      [1, 'Tin học', '12', 'Chủ đề 1. Máy tính và xã hội tri thức', 'Bài 01. Giới thiệu Trí tuệ nhân tạo (AI)', 'MCQ', '2', 'Hệ thống nào sau đây là một ứng dụng tiêu biểu của Trí tuệ nhân tạo (AI)?', 'Bảng tính Excel cơ bản', 'Hệ thống nhận diện khuôn mặt tự động trên điện thoại', 'Phần mềm Paint vẽ hình', 'Trình soạn thảo văn bản Notepad', 'B', 'Nhận diện khuôn mặt ứng dụng mạng nơ-ron tích chập (CNN) của Trí tuệ nhân tạo.'],
      [2, 'Tin học', '12', 'Chủ đề 2. Mạng máy tính và Internet', 'Bài 02. Giao thức mạng và địa chỉ IP', 'DS', 'DS', 'Cho các nhận định sau về giao thức TCP/IP trên Internet:', 'a) TCP đảm bảo việc truyền dữ liệu diễn ra tin cậy và nguyên vẹn.', 'b) IP chịu trách nhiệm định tuyến các gói tin đến đúng địa chỉ nhận.', 'c) HTTP là giao thức hoạt động tại tầng mạng.', 'd) Địa chỉ IPv4 tiêu chuẩn có độ dài là 128 bit.', 'a:Đ, b:Đ, c:S, d:S', 'HTTP hoạt động ở tầng ứng dụng; IPv4 có độ dài 32 bit (IPv6 mới có độ dài 128 bit).'],
      [3, 'Tin học', '10', 'Chủ đề 4. Lập trình cơ bản với Python', 'Bài 03. Cấu trúc lặp for và while', 'TLN', '3', `Cho đoạn mã Python sau:\ns = 0\nfor i in range(1, 6):\n    s += i\nprint(s)\nGiá trị in ra màn hình là bao nhiêu?`, '', '', '', '', '15', 'Vòng lặp tính tổng s = 1 + 2 + 3 + 4 + 5 = 15.'],
      [4, 'Toán học', '12', 'Chuyên đề: Giải tích', 'Bài 01. Khảo sát hàm số', 'MCQ', '1', 'Đạo hàm của hàm số y = x^3 là gì?', '3x^2', '2x^3', '3x', 'x^2', 'A', 'Áp dụng công thức (x^n)\' = n*x^(n-1), ta có (x^3)\' = 3x^2.']
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Căn chỉnh độ rộng cột
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 18 }, // Môn
      { wch: 10 }, // Khối
      { wch: 32 }, // Chủ đề
      { wch: 35 }, // Bài học
      { wch: 16 }, // Loại câu
      { wch: 14 }, // Mức độ
      { wch: 55 }, // Nội dung câu hỏi
      { wch: 35 }, // Phương án A
      { wch: 35 }, // Phương án B
      { wch: 35 }, // Phương án C
      { wch: 35 }, // Phương án D
      { wch: 16 }, // Đáp án
      { wch: 45 }  // Giải thích
    ];

    // 2. Sheet Hướng Dẫn
    const guideRows = [
      ['HƯỚNG DẪN ĐIỀN DỮ LIỆU CÂU HỎI VÀO FILE EXCEL CHUẨN TINHOCHUB'],
      [''],
      ['Tên Cột', 'Ý nghĩa', 'Quy tắc điền chi tiết'],
      ['STT', 'Số thứ tự', 'Điền số thứ tự 1, 2, 3...'],
      ['Môn học / Lĩnh vực', 'Tên môn học hoặc đề tài chuyên đề', 'Ví dụ: Tin học, Toán học, Vật lý, Lập trình Game... Giáo viên có thể tự do nhập bất kỳ môn nào.'],
      ['Khối lớp', 'Khối lớp học sinh', 'Điền 10, 11, hoặc 12 (hoặc để trống nếu áp dụng chung).'],
      ['Chủ đề & Bài học', 'Chủ đề và bài học của câu hỏi', 'Điền tên bài theo SGK hoặc tên chuyên đề riêng của Thầy/Cô.'],
      ['Loại câu (MCQ/DS/TLN)', 'Loại hình trắc nghiệm', 'MCQ: Trắc nghiệm 4 lựa chọn (A, B, C, D)\nDS: Câu hỏi Đúng / Sai gồm 4 ý a, b, c, d\nTLN: Câu hỏi trả lời ngắn (chỉ cần nhập đáp án)'],
      ['Mức độ', 'Cấp độ tư duy GDPT 2018', '1: Nhận biết, 2: Thông hiểu, 3: Vận dụng, 4: Vận dụng cao, DS, TLN'],
      ['Nội dung câu hỏi', 'Thân câu hỏi', 'Bắt buộc điền. Hỗ trợ xuống dòng.'],
      ['Phương án A, B, C, D', '4 lựa chọn trả lời', 'Với MCQ: Điền 4 lựa chọn A, B, C, D.\nVới DS: Điền 4 ý tương ứng a), b), c), d).\nVới TLN: Bỏ trống 4 cột này.'],
      ['Đáp án đúng', 'Đáp án chính xác', 'Với MCQ: Điền 1 chữ cái in hoa: A hoặc B hoặc C hoặc D.\nVới DS: Điền định dạng: a:Đ, b:S, c:Đ, d:S (hoặc Đ-S-Đ-S hoặc T-F-T-F).\nVới TLN: Điền từ khóa hoặc số đáp án chính xác (ví dụ: 15 hoặc CPU).'],
      ['Hướng dẫn giải', 'Lời giải chi tiết', 'Tùy chọn. Giúp học sinh hiểu rõ bản chất sau khi nộp bài.']
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
    wsGuide['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Cau_Hoi');
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Nhap_Lieu');

    XLSX.writeFile(wb, 'Mau_Nhap_Cau_Hoi_TinHocHub.xlsx');
  },

  // ==========================================
  // ĐỌC VÀ XỬ LÝ FILE EXCEL CÂU HỎI CỦA GIÁO VIÊN
  // ==========================================
  async importExcelFile(file) {
    if (!file) return;
    const XLSX = await ensureXLSX();

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
          alert('Tệp Excel trống hoặc không có dòng dữ liệu câu hỏi!');
          return;
        }

        // Tìm dòng header
        let headerIdx = 0;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const rowStr = rows[i].map(c => String(c).toLowerCase()).join(' ');
          if (rowStr.includes('câu hỏi') || rowStr.includes('noi dung') || rowStr.includes('question') || rowStr.includes('phương án')) {
            headerIdx = i;
            break;
          }
        }

        const headers = rows[headerIdx].map(c => String(c).trim().toLowerCase());
        const getColIdx = (aliases) => headers.findIndex(h => aliases.some(a => h.includes(a)));

        const colQ = getColIdx(['câu hỏi', 'noi dung', 'question', 'noi_dung']);
        const colOptA = getColIdx(['phương án a', 'phuong an a', 'a)', 'a.', 'opt a', 'option a']);
        const colOptB = getColIdx(['phương án b', 'phuong an b', 'b)', 'b.', 'opt b', 'option b']);
        const colOptC = getColIdx(['phương án c', 'phuong an c', 'c)', 'c.', 'opt c', 'option c']);
        const colOptD = getColIdx(['phương án d', 'phuong an d', 'd)', 'd.', 'opt d', 'option d']);
        const colAns = getColIdx(['đáp án', 'dap an', 'answer', 'correct']);
        const colType = getColIdx(['loại', 'loai', 'type']);
        const colLevel = getColIdx(['mức độ', 'muc do', 'level', 'cấp độ']);
        const colGrade = getColIdx(['khối', 'khoi', 'grade']);
        const colSubject = getColIdx(['môn', 'mon', 'subject', 'lĩnh vực']);
        const colTopic = getColIdx(['chủ đề', 'chu de', 'topic']);
        const colLesson = getColIdx(['bài', 'bai', 'lesson']);
        const colNote = getColIdx(['giải thích', 'giai thich', 'hướng dẫn', 'note', 'explain']);

        if (colQ === -1) {
          alert('Không tìm thấy cột "Nội dung câu hỏi" trong file Excel! Vui lòng tải file mẫu để xem định dạng chuẩn.');
          return;
        }

        const parsedQuestions = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0) continue;
          const questionText = String(r[colQ] || '').trim();
          if (!questionText) continue;

          let type = colType !== -1 && r[colType] ? String(r[colType]).trim().toUpperCase() : 'MCQ';
          let level = colLevel !== -1 && r[colLevel] ? String(r[colLevel]).trim() : '1';
          let grade = colGrade !== -1 && r[colGrade] ? String(r[colGrade]).trim() : this.currentGrade;
          let subject = colSubject !== -1 && r[colSubject] ? String(r[colSubject]).trim() : 'Tin học';
          let topic = colTopic !== -1 && r[colTopic] ? String(r[colTopic]).trim() : 'Chủ đề từ Excel';
          let lesson = colLesson !== -1 && r[colLesson] ? String(r[colLesson]).trim() : 'Bài học từ Excel';
          let note = colNote !== -1 && r[colNote] ? String(r[colNote]).trim() : '';

          const optA = colOptA !== -1 ? String(r[colOptA] || '').trim() : '';
          const optB = colOptB !== -1 ? String(r[colOptB] || '').trim() : '';
          const optC = colOptC !== -1 ? String(r[colOptC] || '').trim() : '';
          const optD = colOptD !== -1 ? String(r[colOptD] || '').trim() : '';
          let answer = colAns !== -1 ? String(r[colAns] || '').trim() : 'A';

          if (level === 'DS' || type === 'DS') {
            type = 'DS';
            level = 'DS';
          } else if (level === 'TLN' || type === 'TLN') {
            type = 'TLN';
            level = 'TLN';
          }

          parsedQuestions.push({
            id: 'q_ex_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4),
            grade,
            subject,
            topic,
            lesson,
            type,
            level,
            question: questionText,
            options: [optA, optB, optC, optD].filter(Boolean),
            answer,
            note
          });
        }

        if (parsedQuestions.length === 0) {
          alert('Không trích xuất được câu hỏi nào từ file Excel!');
          return;
        }

        const packageData = {
          fileName: file.name,
          title: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          questions: parsedQuestions
        };

        this.showExcelPreviewModal(packageData);
      } catch (err) {
        console.error('Lỗi phân tích Excel:', err);
        alert('Có lỗi xảy ra khi đọc file Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  },

  // ==========================================
  // HIỂN THỊ MODAL XEM TRƯỚC VÀ XÁC NHẬN GÓI CÂU HỎI EXCEL
  // ==========================================
  showExcelPreviewModal(packageData) {
    let modal = document.getElementById('modal-qm-excel-preview');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-qm-excel-preview';
      modal.className = 'fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto';
      document.body.appendChild(modal);
    }

    const user = Auth.getCurrentUser();
    const count = packageData.questions.length;
    const mcqCount = packageData.questions.filter(q => q.type === 'MCQ').length;
    const dsCount = packageData.questions.filter(q => q.type === 'DS').length;
    const tlnCount = packageData.questions.filter(q => q.type === 'TLN').length;

    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shadow-xs">
              <i class="fa-solid fa-file-excel"></i>
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-800 dark:text-white">Xem Trước Câu Hỏi Nhập Từ Excel</h3>
              <p class="text-xs text-slate-400">Tệp: <b>${escapeHtml(packageData.fileName)}</b> • Nhận diện thành công <b>${count}</b> câu hỏi</p>
            </div>
          </div>
          <button id="btn-close-qm-excel-preview" class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 transition flex items-center justify-center">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Tóm tắt thống kê -->
        <div class="grid grid-cols-4 gap-2 text-center text-xs">
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span class="text-slate-400 block text-[10px]">Tổng câu</span>
            <span class="text-base font-black text-slate-800 dark:text-white">${count}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <span class="block text-[10px]">Trắc nghiệm (MCQ)</span>
            <span class="text-base font-black">${mcqCount}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <span class="block text-[10px]">Đúng / Sai (DS)</span>
            <span class="text-base font-black">${dsCount}</span>
          </div>
          <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <span class="block text-[10px]">Trả lời ngắn (TLN)</span>
            <span class="text-base font-black">${tlnCount}</span>
          </div>
        </div>

        <!-- Tiêu đề bộ câu hỏi -->
        <div>
          <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Đặt tên cho Bộ câu hỏi / Đề thi này <span class="text-rose-500">*</span>
          </label>
          <input type="text" id="qm-excel-package-title" value="${escapeHtml(packageData.title)}" placeholder="Ví dụ: Đề cương ôn tập HK1 môn Tin học 12..." class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500" />
        </div>

        <!-- Danh sách xem trước 5 câu đầu -->
        <div class="flex-1 overflow-y-auto space-y-2.5 pr-1 border border-slate-100 dark:border-slate-700/60 p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
          <span class="text-[11px] font-bold text-slate-500 uppercase block mb-1">Xem trước các câu hỏi:</span>
          ${packageData.questions.slice(0, 10).map((q, idx) => `
            <div class="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 shadow-xs">
              <div class="flex items-center justify-between gap-2">
                <span class="font-bold text-slate-800 dark:text-white">Câu ${idx + 1} (${q.type}):</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  ${escapeHtml(q.subject)} • Khối ${escapeHtml(q.grade)} • ${escapeHtml(q.topic)}
                </span>
              </div>
              <p class="text-slate-700 dark:text-slate-200 whitespace-pre-line">${escapeHtml(q.question)}</p>
              ${q.options && q.options.length > 0 ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  ${q.options.map((opt, oIdx) => `<div>${String.fromCharCode(65 + oIdx)}. ${escapeHtml(opt)}</div>`).join('')}
                </div>
              ` : ''}
              <div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 pt-1">
                Đáp án: ${escapeHtml(q.answer)} ${q.note ? `• Giải thích: ${escapeHtml(q.note)}` : ''}
              </div>
            </div>
          `).join('')}
          ${packageData.questions.length > 10 ? `
            <div class="text-center py-2 text-xs text-slate-400 italic">
              ...và còn ${packageData.questions.length - 10} câu hỏi khác...
            </div>
          ` : ''}
        </div>

        <!-- 2 Nút hành động lựa chọn -->
        <div class="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
          <button id="btn-qm-save-draft" class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5">
            <i class="fa-regular fa-bookmark"></i> Lưu Bản Nháp Riêng
          </button>
          <button id="btn-qm-submit-for-approval" class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2">
            <i class="fa-solid fa-paper-plane"></i> Gửi Lên Kho Chung (Yêu Cầu Admin Duyệt)
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    const closeModal = () => modal.classList.add('hidden');
    modal.querySelector('#btn-close-qm-excel-preview').onclick = closeModal;

    // Lưu bản nháp riêng
    modal.querySelector('#btn-qm-save-draft').onclick = () => {
      const title = modal.querySelector('#qm-excel-package-title').value.trim() || packageData.title;
      Storage.saveTeacherContribution({
        teacherEmail: user?.email || 'giaovien@tinhochub.edu.vn',
        teacherName: user?.fullName || 'Giáo viên',
        teacherSchool: user?.school || '',
        packageTitle: title,
        sourceType: 'excel',
        status: 'draft',
        questionsCount: packageData.questions.length,
        questions: packageData.questions
      });
      alert(`Đã lưu ${packageData.questions.length} câu hỏi vào "Kho Câu Hỏi Đóng Góp Của Tôi" (Bản nháp)!`);
      closeModal();
      this.activeManagerTab = 'my-contributions';
      this.render();
    };

    // Gửi Admin duyệt ngay
    modal.querySelector('#btn-qm-submit-for-approval').onclick = () => {
      const title = modal.querySelector('#qm-excel-package-title').value.trim() || packageData.title;
      Storage.saveTeacherContribution({
        teacherEmail: user?.email || 'giaovien@tinhochub.edu.vn',
        teacherName: user?.fullName || 'Giáo viên',
        teacherSchool: user?.school || '',
        packageTitle: title,
        sourceType: 'excel',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        questionsCount: packageData.questions.length,
        questions: packageData.questions
      });
      alert(`Đã gửi bộ câu hỏi "${title}" (${packageData.questions.length} câu) lên Kho chung thành công!
Quản trị viên (Admin) sẽ xem xét và phê duyệt trong thời gian sớm nhất.`);
      closeModal();
      this.activeManagerTab = 'my-contributions';
      this.render();
    };
  },

  async findAndEditQuestion(qId) {
    if (!this.loadGradeDataCallback) return false;
    for (const g of ['12', '11', '10']) {
      const questions = await this.loadGradeDataCallback(g);
      const found = questions.find(q => String(q.id) === String(qId));
      if (found) {
        this.currentGrade = g;
        this.searchKeyword = String(found.id);
        await this.render();
        this.openEditModal(found);
        return true;
      }
    }
    return false;
  },

  async render() {
    if (!this.container) return;

    // Kiểm tra quyền hạn
    if (!Auth.isTeacher()) {
  
    let mainTabContentHtml = '';
    if (this.activeManagerTab === 'my-contributions') {
      mainTabContentHtml = `
        <div class="space-y-4">
          <div class="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <i class="fa-solid fa-cloud-arrow-up text-emerald-600 dark:text-emerald-400 text-base shrink-0"></i>
              <span><b>Kho Câu Hỏi Đóng Góp Của Bạn:</b> Soạn hoặc nhập câu hỏi từ Excel. Bấm <b>"Gửi Lên Kho Chung"</b> để Ban Quản Trị (Admin) phê duyệt đưa vào hệ thống dùng chung.</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button id="btn-qm-inner-download-excel" class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-100 transition shadow-xs">
                <i class="fa-solid fa-download mr-1"></i> Tải File Mẫu
              </button>
              <button id="btn-qm-inner-import-excel" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-xs">
                <i class="fa-solid fa-file-excel mr-1"></i> Nhập Excel Mới
              </button>
            </div>
          </div>

          ${myContributions.length === 0 ? `
            <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8">
              <div class="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center text-2xl mx-auto mb-3">
                <i class="fa-solid fa-file-excel"></i>
              </div>
              <h4 class="text-sm font-bold text-slate-800 dark:text-white">Bạn chưa có gói câu hỏi đóng góp nào</h4>
              <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Hãy bấm nút "Tải File Excel Mẫu" ở trên, điền câu hỏi theo định dạng chuẩn rồi bấm "Nhập File Excel" để tạo bộ câu hỏi riêng của bạn.
              </p>
              <div class="pt-4 flex items-center justify-center gap-3">
                <button id="btn-qm-empty-download" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition">
                  <i class="fa-solid fa-download mr-1"></i> Tải file Excel mẫu (.xlsx)
                </button>
                <button id="btn-qm-empty-import" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm">
                  <i class="fa-solid fa-file-excel mr-1"></i> Nhập câu hỏi từ Excel ngay
                </button>
              </div>
            </div>
          ` : `
            <div class="grid grid-cols-1 gap-3">
              ${myContributions.map(pkg => {
                let badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
                let badgeText = 'Bản nháp riêng (Chưa gửi)';
                let badgeIcon = 'fa-regular fa-file';

                if (pkg.status === 'pending') {
                  badgeClass = 'bg-blue-100 text-blue-800 border-blue-300 animate-pulse';
                  badgeText = 'Chờ Admin duyệt ⏳';
                  badgeIcon = 'fa-solid fa-hourglass-half';
                } else if (pkg.status === 'approved') {
                  badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  badgeText = 'Đã phê duyệt vào ngân hàng ✅';
                  badgeIcon = 'fa-solid fa-circle-check';
                } else if (pkg.status === 'rejected') {
                  badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
                  badgeText = 'Cần chỉnh sửa lại ⚠️';
                  badgeIcon = 'fa-solid fa-triangle-exclamation';
                }

                return `
                  <div class="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:border-emerald-300">
                    <div class="space-y-1.5 flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${badgeClass} flex items-center gap-1">
                          <i class="${badgeIcon}"></i> ${badgeText}
                        </span>
                        <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          <i class="fa-solid fa-file-excel text-emerald-600 mr-1"></i> ${escapeHtml(pkg.sourceType || 'excel').toUpperCase()}
                        </span>
                        <span class="text-[11px] text-slate-400">
                          Tạo ngày: ${new Date(pkg.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">
                        ${escapeHtml(pkg.packageTitle || 'Bộ câu hỏi đóng góp')}
                      </h4>

                      <div class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span>Số lượng: <strong class="text-slate-700 dark:text-slate-200">${pkg.questionsCount || (pkg.questions ? pkg.questions.length : 0)} câu</strong></span>
                        <span>Giáo viên: <strong>${escapeHtml(pkg.teacherName || 'Tôi')}</strong></span>
                        ${pkg.teacherSchool ? `<span>Trường: <strong>${escapeHtml(pkg.teacherSchool)}</strong></span>` : ''}
                      </div>

                      ${pkg.status === 'rejected' && pkg.rejectReason ? `
                        <div class="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 mt-2">
                          <strong>Phản hồi từ Admin:</strong> ${escapeHtml(pkg.rejectReason)}
                        </div>
                      ` : ''}
                    </div>

                    <!-- Các nút hành động -->
                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button data-qm-view-pkg="${pkg.id}" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5">
                        <i class="fa-regular fa-eye"></i> Xem câu hỏi
                      </button>

                      ${(pkg.status === 'draft' || pkg.status === 'rejected') ? `
                        <button data-qm-submit-pkg="${pkg.id}" class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5">
                          <i class="fa-solid fa-paper-plane"></i> Gửi duyệt
                        </button>
                      ` : ''}

                      ${pkg.status !== 'approved' ? `
                        <button data-qm-delete-pkg="${pkg.id}" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 text-xs font-bold transition" title="Xóa gói câu hỏi này">
                          <i class="fa-regular fa-trash-can"></i>
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      `;
    } else {
      mainTabContentHtml = `
${mainTabContentHtml}
      `;
    }

    this.container.innerHTML = `
        <div class="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
          <div class="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-3xl mx-auto mb-4">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2">
            Khu Vực Dành Cho Giáo Viên & Quản Trị Viên
          </h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
            Học sinh chỉ có quyền tham gia ôn tập và thi thử. Nếu Thầy/Cô là Giáo viên môn Tin học, vui lòng nhập mã xác thực Giáo viên để được cấp quyền quản lý ngân hàng câu hỏi.
          </p>
          <button id="btn-qm-open-upgrade" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20">
            <i class="fa-solid fa-user-shield mr-1.5"></i> Yêu cầu cấp quyền Giáo viên
          </button>
        </div>
      `;

      this.container.querySelector('#btn-qm-open-upgrade')?.addEventListener('click', () => {
        document.getElementById('modal-upgrade-role')?.classList.remove('hidden');
      });
      return;
    }

    // Tải dữ liệu câu hỏi của khối hiện tại (đã được áp dụng tùy chỉnh thêm/sửa/xóa)
    let questions = [];
    if (this.loadGradeDataCallback) {
      questions = await this.loadGradeDataCallback(this.currentGrade);
    }

    // Lọc danh sách câu hỏi
    let filtered = [...questions];
    if (this.currentTopic !== 'all') {
      filtered = filtered.filter(q => q.topic === this.currentTopic);
    }
    if (this.currentLevel !== 'all') {
      filtered = filtered.filter(q => q.level === this.currentLevel);
    }
    if (this.searchKeyword.trim()) {
      const kw = this.searchKeyword.trim().toLowerCase();
      filtered = filtered.filter(q => {
        return (q.question && q.question.toLowerCase().includes(kw)) ||
               (q.lesson && q.lesson.toLowerCase().includes(kw)) ||
               (q.topic && q.topic.toLowerCase().includes(kw));
      });
    }

    const totalQuestions = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalQuestions / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageQuestions = filtered.slice(startIdx, startIdx + this.pageSize);

    // Lấy danh sách chủ đề theo khối từ manifest
    const topicsList = (this.manifest && this.manifest.grades[this.currentGrade])
      ? Object.keys(this.manifest.grades[this.currentGrade].topics || {})
      : [];

    const currentUser = Auth.getCurrentUser();
    const myContributions = Storage.getTeacherContributions(currentUser?.email);

    const activeEl = document.activeElement;
    const isKwFocused = activeEl && activeEl.id === 'qm-filter-keyword';
    const selStart = isKwFocused ? activeEl.selectionStart : null;
    const selEnd = isKwFocused ? activeEl.selectionEnd : null;

    this.container.innerHTML = `
      <div class="space-y-6 animate-fadeIn">
        
        <!-- Header Quản Lý Câu Hỏi -->
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-2">
              <i class="fa-solid fa-database"></i> Quản Lý Ngân Hàng Đề
            </div>
            <h2 class="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
              Ngân Hàng Câu Hỏi Khối ${this.currentGrade}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Thầy/Cô có toàn quyền Thêm mới, Sửa nội dung hoặc Xóa câu hỏi. Các thay đổi sẽ có hiệu lực ngay trong Ôn tập & Thi thử.
            </p>
          </div>

          <!-- Nút hành động nhanh -->
          <div class="flex items-center flex-wrap gap-2">
            <button id="btn-qm-download-excel-template" class="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-bold transition flex items-center gap-1.5 shadow-xs" title="Tải file Excel mẫu chuẩn TinHocHub để soạn câu hỏi">
              <i class="fa-solid fa-download text-emerald-600"></i> Tải File Excel Mẫu (.xlsx)
            </button>
            <button id="btn-qm-import-excel" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-1.5" title="Nhập hàng loạt câu hỏi từ file Excel">
              <i class="fa-solid fa-file-excel"></i> Nhập File Excel
            </button>
            <input type="file" id="input-qm-import-excel" accept=".xlsx,.xls,.csv" class="hidden" />

            <button id="btn-qm-add-new" class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-plus"></i> Soạn câu hỏi
            </button>
            <button id="btn-qm-reset-default" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition" title="Khôi phục lại ngân hàng gốc">
              <i class="fa-solid fa-rotate-left mr-1"></i> Khôi phục gốc
            </button>
            <button id="btn-qm-export-custom" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition" title="Xuất dữ liệu ra file JSON">
              <i class="fa-solid fa-file-arrow-down mr-1"></i> Xuất JSON
            </button>
            <button id="btn-qm-import-custom" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition" title="Nhập câu hỏi từ file JSON">
              <i class="fa-solid fa-file-arrow-up mr-1"></i> Nhập JSON
            </button>
            <input type="file" id="input-qm-import-json" accept=".json,application/json" class="hidden" />
          </div>
        </div>

        <!-- Thanh Chuyển Tab: Ngân Hàng Đề Chung vs Kho Đóng Góp Của Tôi -->
        <div class="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
          <button id="btn-tab-qm-all" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.activeManagerTab !== 'my-contributions' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600'}">
            <i class="fa-solid fa-database"></i> Ngân Hàng Đề Hiện Tại (${totalQuestions} câu)
          </button>
          <button id="btn-tab-qm-my-contributions" class="px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${this.activeManagerTab === 'my-contributions' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600'}">
            <i class="fa-solid fa-cloud-arrow-up"></i> Kho Câu Hỏi Đóng Góp Của Tôi
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-black ${this.activeManagerTab === 'my-contributions' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}">
              ${myContributions.length}
            </span>
          </button>
        </div>

        <!-- Thanh Tìm Kiếm & Bộ Lọc Nâng Cao -->
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            <!-- Khối lớp -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Khối lớp</label>
              <select id="qm-filter-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="12" ${this.currentGrade === '12' ? 'selected' : ''}>Khối 12</option>
                <option value="11" ${this.currentGrade === '11' ? 'selected' : ''}>Khối 11</option>
                <option value="10" ${this.currentGrade === '10' ? 'selected' : ''}>Khối 10</option>
              </select>
            </div>

            <!-- Mức độ -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Loại / Mức độ</label>
              <select id="qm-filter-level" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="all" ${this.currentLevel === 'all' ? 'selected' : ''}>Tất cả mức độ</option>
                <option value="1" ${this.currentLevel === '1' ? 'selected' : ''}>Mức 1 (Nhận biết)</option>
                <option value="2" ${this.currentLevel === '2' ? 'selected' : ''}>Mức 2 (Thông hiểu)</option>
                <option value="3" ${this.currentLevel === '3' ? 'selected' : ''}>Mức 3 (Vận dụng)</option>
                <option value="4" ${this.currentLevel === '4' ? 'selected' : ''}>Mức 4 (Vận dụng cao)</option>
                <option value="DS" ${this.currentLevel === 'DS' ? 'selected' : ''}>Phần II: Đúng / Sai</option>
              </select>
            </div>

            <!-- Chủ đề -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Chủ đề</label>
              <select id="qm-filter-topic" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                <option value="all">Tất cả chủ đề</option>
                ${topicsList.map(t => `<option value="${escapeHtml(t)}" ${this.currentTopic === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
              </select>
            </div>

            <!-- Tìm kiếm từ khóa -->
            <div>
              <label class="block text-[11px] font-bold text-slate-500 mb-1 uppercase">Tìm kiếm từ khóa</label>
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input type="text" id="qm-filter-keyword" value="${escapeHtml(this.searchKeyword)}" placeholder="Nội dung, bài học..." class="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

          </div>

          <div class="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <span>Tìm thấy <strong>${totalQuestions}</strong> câu hỏi phù hợp</span>
            <span>Trang <strong>${this.currentPage}</strong> / ${totalPages}</span>
          </div>
        </div>

        <!-- Danh Sách Các Thẻ Câu Hỏi -->
        <div class="space-y-4">
          ${pageQuestions.length === 0 ? `
            <div class="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8">
              <i class="fa-solid fa-filter-circle-xmark text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
              <h4 class="text-sm font-bold text-slate-700 dark:text-slate-300">Không tìm thấy câu hỏi nào</h4>
              <p class="text-xs text-slate-400 mt-1">Thử đổi điều kiện lọc hoặc bấm "Thêm câu hỏi mới" để bổ sung.</p>
            </div>
          ` : pageQuestions.map((q, idx) => this.renderQuestionRow(q, startIdx + idx)).join('')}
        </div>

        <!-- Phân trang (Pagination) -->
        ${totalPages > 1 ? `
          <div class="flex items-center justify-center gap-2 pt-4">
            <button id="btn-qm-prev-page" ${this.currentPage <= 1 ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
              <i class="fa-solid fa-arrow-left mr-1"></i> Trang trước
            </button>

            <span class="text-xs font-bold text-slate-600 dark:text-slate-300 px-3">
              ${this.currentPage} / ${totalPages}
            </span>

            <button id="btn-qm-next-page" ${this.currentPage >= totalPages ? 'disabled' : ''} class="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-50 transition">
              Trang sau <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
          </div>
        ` : ''}

      </div>

      <!-- MODAL: THÊM / SỬA CÂU HỎI -->
      <div id="modal-qm-edit" class="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 relative max-h-[90dvh] overflow-y-auto">
          <button id="btn-qm-close-modal" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-white flex items-center justify-center text-sm transition">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-pen-to-square"></i>
            </div>
            <div>
              <h3 id="modal-qm-title" class="text-base font-bold text-slate-800 dark:text-white">
                Thêm Câu Hỏi Mới
              </h3>
              <p class="text-xs text-slate-400">Ngân hàng câu hỏi Tin học chuẩn GDPT 2018</p>
            </div>
          </div>

          <form id="form-qm-question" class="space-y-4">
            <input type="hidden" id="qm-input-id" value="" />

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Khối lớp *</label>
                <select id="qm-input-grade" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="12">Khối 12</option>
                  <option value="11">Khối 11</option>
                  <option value="10">Khối 10</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Dạng câu hỏi *</label>
                <select id="qm-input-level" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white">
                  <option value="1">1 - Nhận biết (MCQ)</option>
                  <option value="2">2 - Thông hiểu (MCQ)</option>
                  <option value="3">3 - Vận dụng (MCQ)</option>
                  <option value="4">4 - Vận dụng cao (MCQ)</option>
                  <option value="DS">DS - Đúng / Sai (4 ý)</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Chủ đề</label>
                <input type="text" id="qm-input-topic" placeholder="Ví dụ: 7. ỨNG DỤNG TIN HỌC" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tên bài học</label>
              <input type="text" id="qm-input-lesson" placeholder="Ví dụ: Bài 25. Phần thân và chân trang web" class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nội dung câu hỏi *</label>
              <textarea id="qm-input-question" required rows="3" placeholder="Nhập câu hỏi tại đây..." class="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
            </div>

            <!-- Khu vực các phương án nhập liệu động (MCQ / DS / TLN) -->
            <div id="qm-options-container" class="space-y-3 pt-2">
              <!-- Được JS render tùy theo level -->
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Giải thích / Ghi chú</label>
              <input type="text" id="qm-input-note" placeholder="Lời giải thích ngắn gọn khi xem đáp án..." class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>

            <div class="pt-3 flex items-center justify-end gap-3">
              <button type="button" id="btn-qm-cancel" class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition">
                Hủy bỏ
              </button>
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5">
                <i class="fa-solid fa-floppy-disk"></i> Lưu câu hỏi
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (isKwFocused) {
      const newKwInput = this.container.querySelector('#qm-filter-keyword');
      if (newKwInput) {
        newKwInput.focus();
        if (selStart !== null && selEnd !== null) {
          try { newKwInput.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }

    this.bindEvents(questions);
  },

  renderQuestionRow(q, index) {
    let levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Biết</span>`;
    if (q.level === '2') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Hiểu</span>`;
    else if (q.level === '3') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Vận dụng</span>`;
    else if (q.level === '4') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">VD Cao</span>`;
    else if (q.level === 'DS') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Đúng/Sai</span>`;
    else if (q.level === 'TLN') levelBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">Trả lời ngắn</span>`;

    let customBadge = '';
    if (q.isCustom) {
      customBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-white">Thêm mới</span>`;
    } else if (q.isModified) {
      customBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500 text-white">Đã sửa</span>`;
    }

    return `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-slate-300 transition">
        <div class="flex items-center justify-between gap-3 mb-2.5">
          <div class="flex items-center flex-wrap gap-2">
            <span class="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
              ${index + 1}
            </span>
            ${levelBadge}
            ${customBadge}
            <span class="text-xs text-slate-400 font-medium">${escapeHtml(q.lesson || q.topic || '')}</span>
          </div>

          <!-- Nút Sửa & Xóa -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button data-qm-edit="${q.id}" class="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold transition flex items-center gap-1">
              <i class="fa-solid fa-pen"></i> Sửa
            </button>
            <button data-qm-delete="${q.id}" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition" title="Xóa câu hỏi">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <h4 class="text-sm font-bold text-slate-800 dark:text-white mb-3 leading-relaxed">
          ${escapeHtml(q.question)}
        </h4>

        ${['1', '2', '3', '4'].includes(q.level) && q.options ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            ${q.options.map((opt, oIdx) => {
              const letter = ['A', 'B', 'C', 'D'][oIdx];
              const isCorrect = (letter === q.answer);
              return `
                <div class="p-2 rounded-xl border ${isCorrect ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}">
                  ${letter}. ${escapeHtml(opt)}
                </div>
              `;
            }).join('')}
          </div>
        ` : (q.level === 'DS' && q.options ? `
          <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            ${q.options.map((opt, oIdx) => {
              const subL = ['a', 'b', 'c', 'd'][oIdx];
              const ansVal = (q.answer && q.answer.split(',')[oIdx]) || '';
              return `
                <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-750 flex items-center justify-between">
                  <span><strong>${subL})</strong> ${escapeHtml(opt)}</span>
                  <span class="px-2 py-0.5 rounded font-bold text-[11px] ${ansVal === 'Đ' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">${ansVal === 'Đ' ? 'Đúng' : 'Sai'}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
            Đáp án: ${escapeHtml(q.answer)}
          </div>
        `)}
      </div>
    `;
  },

  renderOptionsForm(level, existingQ = null) {
    const container = document.getElementById('qm-options-container');
    if (!container) return;

    if (['1', '2', '3', '4'].includes(level)) {
      const opts = existingQ?.options || ['', '', '', ''];
      const curAns = existingQ?.answer || 'A';
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          4 Phương án trả lời & Chọn đáp án đúng:
        </label>
        <div class="space-y-2">
          ${['A', 'B', 'C', 'D'].map((letter, idx) => `
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer ${curAns === letter ? 'bg-blue-50 border-blue-500 font-bold text-blue-600' : 'text-slate-600'}">
                <input type="radio" name="qm-mcq-correct" value="${letter}" ${curAns === letter ? 'checked' : ''} class="w-3.5 h-3.5 text-blue-600" />
                <span>${letter}</span>
              </label>
              <input type="text" id="qm-opt-${idx}" required value="${escapeHtml(opts[idx] || '')}" placeholder="Nội dung phương án ${letter}..." class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
            </div>
          `).join('')}
        </div>
      `;
    } else if (level === 'DS') {
      const opts = existingQ?.options || ['', '', '', ''];
      const ansArr = (existingQ?.answer || 'Đ,S,Đ,S').split(',');
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          4 Ý con (a, b, c, d) & Chọn Đúng/Sai cho từng ý:
        </label>
        <div class="space-y-2">
          ${['a', 'b', 'c', 'd'].map((letter, idx) => `
            <div class="flex items-center gap-2">
              <span class="w-6 text-xs font-bold text-blue-600 text-center">${letter})</span>
              <input type="text" id="qm-ds-opt-${idx}" required value="${escapeHtml(opts[idx] || '')}" placeholder="Nội dung ý ${letter}..." class="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white" />
              <select id="qm-ds-val-${idx}" class="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold">
                <option value="Đ" ${ansArr[idx] === 'Đ' ? 'selected' : ''}>Đúng</option>
                <option value="S" ${ansArr[idx] === 'S' ? 'selected' : ''}>Sai</option>
              </select>
            </div>
          `).join('')}
        </div>
      `;
    } else if (level === 'TLN') {
      const curAns = existingQ?.answer || '';
      container.innerHTML = `
        <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          Đáp án ngắn:
        </label>
        <input type="text" id="qm-tln-ans" required value="${escapeHtml(curAns)}" placeholder="Ví dụ: 1024, print, True..." class="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white" />
      `;
    }
  },

  openEditModal(question = null) {
    const modal = document.getElementById('modal-qm-edit');
    if (!modal) return;

    const titleEl = document.getElementById('modal-qm-title');
    const idInput = document.getElementById('qm-input-id');
    const gradeSelect = document.getElementById('qm-input-grade');
    const levelSelect = document.getElementById('qm-input-level');
    const topicInput = document.getElementById('qm-input-topic');
    const lessonInput = document.getElementById('qm-input-lesson');
    const questionTextarea = document.getElementById('qm-input-question');
    const noteInput = document.getElementById('qm-input-note');

    if (question) {
      if (titleEl) titleEl.textContent = 'Chỉnh Sửa Câu Hỏi';
      if (idInput) idInput.value = question.id;
      if (gradeSelect) gradeSelect.value = question.grade || this.currentGrade;
      if (levelSelect) levelSelect.value = question.level || '1';
      if (topicInput) topicInput.value = question.topic || '';
      if (lessonInput) lessonInput.value = question.lesson || '';
      if (questionTextarea) questionTextarea.value = question.question || '';
      if (noteInput) noteInput.value = question.note || '';

      this.renderOptionsForm(question.level || '1', question);
    } else {
      if (titleEl) titleEl.textContent = 'Thêm Câu Hỏi Mới';
      if (idInput) idInput.value = '';
      if (gradeSelect) gradeSelect.value = this.currentGrade;
      if (levelSelect) levelSelect.value = '1';
      if (topicInput) topicInput.value = this.currentTopic !== 'all' ? this.currentTopic : '';
      if (lessonInput) lessonInput.value = '';
      if (questionTextarea) questionTextarea.value = '';
      if (noteInput) noteInput.value = '';

      this.renderOptionsForm('1', null);
    }

    modal.classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('modal-qm-edit')?.classList.add('hidden');
  },

  bindEvents(currentQuestionsList) {
    // Lọc Khối
    const gradeFilter = this.container.querySelector('#qm-filter-grade');
    if (gradeFilter) {
      gradeFilter.addEventListener('change', (e) => {
        this.currentGrade = e.target.value;
        this.currentTopic = 'all';
        this.currentPage = 1;
        this.render();
      });
    }

    // Lọc Mức độ
    const levelFilter = this.container.querySelector('#qm-filter-level');
    if (levelFilter) {
      levelFilter.addEventListener('change', (e) => {
        this.currentLevel = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    // Lọc Chủ đề
    const topicFilter = this.container.querySelector('#qm-filter-topic');
    if (topicFilter) {
      topicFilter.addEventListener('change', (e) => {
        this.currentTopic = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    // Tìm kiếm từ khóa (Debounce 300ms)
    const kwInput = this.container.querySelector('#qm-filter-keyword');
    if (kwInput) {
      let timer;
      kwInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.searchKeyword = e.target.value;
          this.currentPage = 1;
          this.render();
        }, 300);
      });
    }

    // Chuyển trang
    this.container.querySelector('#btn-qm-prev-page')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.render();
      }
    });

    this.container.querySelector('#btn-qm-next-page')?.addEventListener('click', () => {
      this.currentPage++;
      this.render();
    });

    // Mở modal Thêm mới
    this.container.querySelector('#btn-qm-add-new')?.addEventListener('click', () => {
      this.openEditModal(null);
    });

    // Mở modal Sửa
    this.container.querySelectorAll('[data-qm-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qm-edit');
        const q = currentQuestionsList.find(item => item.id === id);
        if (q) this.openEditModal(q);
      });
    });

    // Nút Xóa câu hỏi
    this.container.querySelectorAll('[data-qm-delete]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-qm-delete');
        if (confirm('Thầy/Cô có chắc chắn muốn xóa câu hỏi này khỏi ngân hàng đề?')) {
          Storage.deleteQuestion(id, this.currentGrade);
          alert('Đã xóa câu hỏi thành công!');
          this.render();
        }
      });
    });

    // Nút Khôi phục dữ liệu gốc
    this.container.querySelector('#btn-qm-reset-default')?.addEventListener('click', () => {
      if (confirm(`Khôi phục ngân hàng câu hỏi Khối ${this.currentGrade} về mặc định ban đầu? Mọi câu hỏi Thầy/Cô đã thêm hoặc sửa của khối này sẽ bị hủy bỏ.`)) {
        Storage.resetQuestionsToDefault(this.currentGrade);
        alert('Đã khôi phục ngân hàng câu hỏi về dữ liệu gốc ban đầu!');
        this.render();
      }
    });

    // Nút Xuất JSON
    this.container.querySelector('#btn-qm-export-custom')?.addEventListener('click', () => {
      const customQuestions = Storage.getCustomQuestions(this.currentGrade);
      const blob = new Blob([JSON.stringify(customQuestions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cau_Hoi_TinHoc_${this.currentGrade}_Custom.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Nút Nhập JSON
    const importBtn = this.container.querySelector('#btn-qm-import-custom');
    const importFileInput = this.container.querySelector('#input-qm-import-json');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            const list = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            if (!Array.isArray(list) || list.length === 0) {
              alert('Tệp JSON không hợp lệ hoặc không chứa danh sách câu hỏi!');
              return;
            }
            let added = 0;
            list.forEach(q => {
              if (q && q.question) {
                Storage.saveQuestion({
                  grade: String(q.grade || this.currentGrade),
                  level: String(q.level || '1'),
                  topic: q.topic || 'Chủ đề nhập từ JSON',
                  lesson: q.lesson || 'Bài học nhập từ JSON',
                  question: q.question,
                  options: Array.isArray(q.options) ? q.options : [],
                  answer: String(q.answer || 'A'),
                  note: q.note || ''
                });
                added++;
              }
            });
            alert(`Đã nhập thành công ${added} câu hỏi vào ngân hàng đề!`);
            this.render();
          } catch (err) {
            alert('Không thể đọc tệp JSON! Vui lòng kiểm tra định dạng tệp.');
          }
        };
        reader.readAsText(file);
      });
    }

    // Đóng Modal
    this.container.querySelector('#btn-qm-close-modal')?.addEventListener('click', () => this.closeEditModal());
    this.container.querySelector('#btn-qm-cancel')?.addEventListener('click', () => this.closeEditModal());

    // Đổi loại câu hỏi trong form modal
    const modalLevelSelect = document.getElementById('qm-input-level');
    if (modalLevelSelect) {
      modalLevelSelect.addEventListener('change', (e) => {
        this.renderOptionsForm(e.target.value, null);
      });
    }

    // Submit Form Lưu câu hỏi (Thêm mới hoặc Sửa)
    const form = document.getElementById('form-qm-question');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('qm-input-id')?.value || '';
        const grade = document.getElementById('qm-input-grade')?.value || this.currentGrade;
        const level = document.getElementById('qm-input-level')?.value || '1';
        const topic = document.getElementById('qm-input-topic')?.value || 'Chủ đề tùy biến';
        const lesson = document.getElementById('qm-input-lesson')?.value || 'Bài học tùy biến';
        const questionText = document.getElementById('qm-input-question')?.value || '';
        const note = document.getElementById('qm-input-note')?.value || '';

        let options = [];
        let answer = '';

        if (['1', '2', '3', '4'].includes(level)) {
          options = [
            document.getElementById('qm-opt-0')?.value || '',
            document.getElementById('qm-opt-1')?.value || '',
            document.getElementById('qm-opt-2')?.value || '',
            document.getElementById('qm-opt-3')?.value || ''
          ];
          const checkedRadio = document.querySelector('input[name="qm-mcq-correct"]:checked');
          answer = checkedRadio ? checkedRadio.value : 'A';
        } else if (level === 'DS') {
          options = [
            document.getElementById('qm-ds-opt-0')?.value || '',
            document.getElementById('qm-ds-opt-1')?.value || '',
            document.getElementById('qm-ds-opt-2')?.value || '',
            document.getElementById('qm-ds-opt-3')?.value || ''
          ];
          const vals = [
            document.getElementById('qm-ds-val-0')?.value || 'Đ',
            document.getElementById('qm-ds-val-1')?.value || 'S',
            document.getElementById('qm-ds-val-2')?.value || 'Đ',
            document.getElementById('qm-ds-val-3')?.value || 'S'
          ];
          answer = vals.join(',');
        } else if (level === 'TLN') {
          answer = document.getElementById('qm-tln-ans')?.value || '';
          options = [];
        }

        const questionPayload = {
          id: id || undefined,
          grade,
          level,
          topic,
          lesson,
          question: questionText,
          options,
          answer,
          note
        };

        Storage.saveQuestion(questionPayload);
        this.closeEditModal();
        alert('Đã lưu câu hỏi thành công!');
        this.render();
      };
    }

    // --- SỰ KIỆN QUẢN LÝ EXCEL & KHO ĐÓNG GÓP ---
    // Chuyển tab Ngân hàng chung vs Kho đóng góp của tôi
    this.container.querySelector('#btn-tab-qm-all')?.addEventListener('click', () => {
      this.activeManagerTab = 'all';
      this.render();
    });
    this.container.querySelector('#btn-tab-qm-my-contributions')?.addEventListener('click', () => {
      this.activeManagerTab = 'my-contributions';
      this.render();
    });

    // Tải file Excel mẫu chuẩn
    const triggerDownload = () => this.downloadExcelTemplate();
    this.container.querySelector('#btn-qm-download-excel-template')?.addEventListener('click', triggerDownload);
    this.container.querySelector('#btn-qm-inner-download-excel')?.addEventListener('click', triggerDownload);
    this.container.querySelector('#btn-qm-empty-download')?.addEventListener('click', triggerDownload);

    // Kích hoạt chọn file Excel
    const excelInput = this.container.querySelector('#input-qm-import-excel');
    const triggerExcelFile = () => excelInput?.click();
    this.container.querySelector('#btn-qm-import-excel')?.addEventListener('click', triggerExcelFile);
    this.container.querySelector('#btn-qm-inner-import-excel')?.addEventListener('click', triggerExcelFile);
    this.container.querySelector('#btn-qm-empty-import')?.addEventListener('click', triggerExcelFile);

    if (excelInput) {
      excelInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.importExcelFile(file);
        }
        e.target.value = '';
      };
    }

    // Gửi duyệt gói câu hỏi đóng góp
    this.container.querySelectorAll('[data-qm-submit-pkg]').forEach(btn => {
      btn.onclick = () => {
        const pkgId = btn.getAttribute('data-qm-submit-pkg');
        if (confirm('Bạn có chắc muốn gửi gói câu hỏi này lên Kho chung để Ban Quản Trị (Admin) phê duyệt?')) {
          Storage.submitContributionForApproval(pkgId);
          alert('🚀 Đã gửi gói câu hỏi lên Kho chung thành công! Vui lòng đợi Admin kiểm duyệt.');
          this.render();
        }
      };
    });

    // Xóa gói câu hỏi đóng góp
    this.container.querySelectorAll('[data-qm-delete-pkg]').forEach(btn => {
      btn.onclick = () => {
        const pkgId = btn.getAttribute('data-qm-delete-pkg');
        if (confirm('Bạn có chắc chắn muốn xóa gói câu hỏi này không?')) {
          Storage.deleteTeacherContribution(pkgId);
          this.render();
        }
      };
    });

    // Xem chi tiết câu hỏi trong gói đóng góp
    this.container.querySelectorAll('[data-qm-view-pkg]').forEach(btn => {
      btn.onclick = () => {
        const pkgId = btn.getAttribute('data-qm-view-pkg');
        const allPkgs = Storage.getAllTeacherContributions();
        const pkg = allPkgs.find(p => p.id === pkgId);
        if (!pkg || !pkg.questions) return;
        this.showExcelPreviewModal({
          fileName: pkg.packageTitle,
          title: pkg.packageTitle,
          questions: pkg.questions
        });
      };
    });
  }
};
