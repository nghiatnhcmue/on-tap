/**
 * tinhoc-hub: Print & PDF Generator
 * Tạo đề thi in ấn chuẩn A4 kèm phiếu đáp án dành cho giáo viên và học sinh
 */

import { escapeHtml } from './utils.js';

export const PrintManager = {
  generatePrintView(options) {
    const {
      title = 'ĐỀ KIỂM TRA MÔN TIN HỌC',
      school = 'TRƯỜNG THPT................................',
      grade = '12',
      duration = '45',
      studentName = '',
      studentClass = '',
      questions = [],
      includeAnswerKey = true
    } = options;

    let printArea = document.getElementById('print-area');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'print-area';
      printArea.className = 'hidden print:block';
      document.body.appendChild(printArea);
    }

    const letters = ['A', 'B', 'C', 'D'];

    printArea.innerHTML = `
      <div class="print-header flex justify-between items-start text-xs font-semibold mb-6">
        <div class="text-center w-1/2">
          <p class="uppercase">${school}</p>
          <p class="font-bold uppercase tracking-wider">TỔ TIN HỌC</p>
          <div class="w-24 h-0.5 bg-black mx-auto my-1"></div>
          <p class="italic text-[10pt]">(Đề thi gồm có ${questions.length} câu)</p>
        </div>
        <div class="text-center w-1/2">
          <p class="font-bold uppercase text-[12pt]">${title} - KHỐI ${grade}</p>
          <p class="italic">Thời gian làm bài: ${duration} phút (không kể thời gian phát đề)</p>
          <p class="mt-2 text-left text-[10pt]">Họ và tên thí sinh: <span class="font-bold">${studentName || '..............................................................'}</span></p>
          <p class="text-left text-[10pt]">Số báo danh: .............. Lớp: <span class="font-bold">${studentClass || '.................................'}</span></p>
        </div>
      </div>

      <!-- Danh sách câu hỏi -->
      <div class="space-y-4">
        ${questions.map((q, idx) => `
          <div class="print-question text-[10.5pt] leading-snug">
            <p class="font-bold mb-1">
              Câu ${idx + 1}: <span class="font-normal">${escapeHtml(q.question)}</span>
            </p>
            ${['1', '2', '3', '4'].includes(q.level) ? `
              <div class="grid grid-cols-2 gap-x-6 gap-y-1 ml-4">
                ${(q.options || []).map((opt, oIdx) => `
                  <div><b>${letters[oIdx]}.</b> ${escapeHtml(opt)}</div>
                `).join('')}
              </div>
            ` : (q.level === 'DS' ? `
              <div class="ml-4 space-y-0.5">
                ${(q.options || []).map((opt, oIdx) => `
                  <div><b>${['a', 'b', 'c', 'd'][oIdx]})</b> ${escapeHtml(opt)}</div>
                `).join('')}
              </div>
            ` : `
              <div class="ml-4 italic text-slate-600">
                .......................................................................................................................................................
              </div>
            `)}
          </div>
        `).join('')}
      </div>

      <!-- Trang đáp án (nếu chọn) -->
      ${includeAnswerKey ? `
        <div class="print-page-break pt-6">
          <div class="text-center mb-6">
            <h3 class="font-bold text-[13pt] uppercase">ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h3>
            <p class="italic text-[10.5pt]">${title} - KHỐI ${grade}</p>
          </div>

          <table class="w-full border-collapse border border-black text-center text-[10pt] mb-6">
            <thead>
              <tr class="bg-slate-100">
                <th class="border border-black p-1.5 w-16">Câu</th>
                <th class="border border-black p-1.5 w-24">Đáp án</th>
                <th class="border border-black p-1.5">Nội dung bài / Chủ đề</th>
              </tr>
            </thead>
            <tbody>
              ${questions.map((q, idx) => `
                <tr>
                  <td class="border border-black p-1 font-bold">${idx + 1}</td>
                  <td class="border border-black p-1 font-bold">${q.answer || 'A'}</td>
                  <td class="border border-black p-1 text-left px-3 text-[9pt]">${q.lesson || q.topic}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;

    window.print();
  }
};

