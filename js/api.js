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
  const token = await getIdToken();

  // 1. Tự động đính kèm token xác thực vào Firebase Realtime Database (?auth=<token>)
  if (finalUrl.includes('firebasedatabase.app')) {
    if (token) {
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}auth=${encodeURIComponent(token)}`;
    }
  }

  // 2. Tự động đính kèm Bearer ID Token vào các request gửi tới Cloudflare Worker API (/api/...)
  const finalOptions = { ...options };
  if (finalUrl.startsWith('/api/') || finalUrl.includes('/api/')) {
    if (token) {
      if (typeof Headers !== 'undefined' && finalOptions.headers instanceof Headers) {
        if (!finalOptions.headers.has('Authorization')) {
          finalOptions.headers.set('Authorization', `Bearer ${token}`);
        }
      } else {
        const headers = { ...(finalOptions.headers || {}) };
        if (!headers['Authorization'] && !headers['authorization']) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        finalOptions.headers = headers;
      }
    }
  }

  return fetch(finalUrl, finalOptions);
}

// Gán vào global window để hỗ trợ debug và tương thích đa ngữ cảnh
if (typeof window !== 'undefined') {
  window.authedFetch = authedFetch;
  window.getFirebaseIdToken = getIdToken;
}
