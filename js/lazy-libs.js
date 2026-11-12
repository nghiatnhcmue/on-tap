/**
 * js/lazy-libs.js
 * Quản lý tải trễ (lazy-load) theo nhu cầu các thư viện bên ngoài nặng
 * (SheetJS ~276KB, Mammoth ~117KB) để tối ưu hóa First Load cho học sinh.
 */

let xlsxPromise = null;
let mammothPromise = null;

export function ensureXLSX() {
  if (typeof window !== 'undefined' && window.XLSX) {
    return Promise.resolve(window.XLSX);
  }
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => {
        xlsxPromise = null;
        reject(new Error('Không thể tải thư viện xử lý file Excel (SheetJS). Vui lòng kiểm tra kết nối mạng.'));
      };
      document.head.appendChild(script);
    });
  }
  return xlsxPromise;
}

export function ensureMammoth() {
  if (typeof window !== 'undefined' && window.mammoth) {
    return Promise.resolve(window.mammoth);
  }
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.async = true;
      script.onload = () => resolve(window.mammoth);
      script.onerror = () => {
        mammothPromise = null;
        reject(new Error('Không thể tải thư viện xử lý file Word (Mammoth). Vui lòng kiểm tra kết nối mạng.'));
      };
      document.head.appendChild(script);
    });
  }
  return mammothPromise;
}
