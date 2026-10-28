/**
 * tinhoc-hub: Utilities
 * Hàm tiện ích xử lý chuỗi, an toàn HTML cho môn Tin học (HTML, code, toán tử so sánh)
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
