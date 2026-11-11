/**
 * js/api.js - Tầng mạng bảo mật cho TinHocHub (Firebase Auth Token Helper)
 * Tự động đính kèm Firebase ID Token vào mọi request gửi tới Firebase Realtime Database
 * Tuân thủ chuẩn ES Modules thuần.
 */

export async function getIdToken(forceRefresh = false) {
  try {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
      const user = firebase.auth().currentUser;
      if (user && typeof user.getIdToken === 'function') {
        return await user.getIdToken(forceRefresh);
      }
    }
  } catch (err) {
    console.warn('Không thể lấy Firebase ID Token:', err);
  }
  return null;
}

export async function authedFetch(url, options = {}) {
  let finalUrl = String(url);
  // Chỉ tự động đính kèm token xác thực khi request gửi tới Firebase Realtime Database
  if (finalUrl.includes('firebasedatabase.app')) {
    try {
      const token = await getIdToken();
      if (token) {
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl = `${finalUrl}${separator}auth=${encodeURIComponent(token)}`;
      }
    } catch (e) {
      console.warn('Lỗi đính kèm auth token vào request RTDB:', e);
    }
  }
  return fetch(finalUrl, options);
}

// Gán vào global window để hỗ trợ debug và tương thích đa ngữ cảnh
if (typeof window !== 'undefined') {
  window.authedFetch = authedFetch;
  window.getFirebaseIdToken = getIdToken;
}
