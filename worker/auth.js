/**
 * worker/auth.js
 * Xác thực Firebase ID Token phía server cho Cloudflare Worker bằng Web Crypto API.
 * Nguồn khóa công khai: Google Identity JWKS endpoint.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// Bộ nhớ đệm khóa công khai Google trong Worker RAM
let jwksCache = {
  keys: [],
  expiresAt: 0
};

/**
 * Giải mã chuỗi Base64Url sang chuỗi UTF-8
 */
export function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(b64)));
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * Chuyển đổi chuỗi Base64Url sang Uint8Array để kiểm tra chữ ký nhị phân
 */
export function base64UrlToUint8Array(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Lấy danh sách Public Keys của Google từ JWKS endpoint (có cache)
 */
export async function getGoogleJwks(customFetch = fetch) {
  const now = Date.now();
  if (jwksCache.keys.length > 0 && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  try {
    const res = await customFetch(GOOGLE_JWKS_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} khi tải Google JWKS`);
    }

    // Đọc cache-control max-age nếu có (mặc định cache 1 giờ)
    let maxAge = 3600;
    const cacheControl = res.headers.get('cache-control') || '';
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match) {
      maxAge = Math.min(Math.max(parseInt(match[1], 10), 300), 86400);
    }

    const data = await res.json();
    if (data && Array.isArray(data.keys)) {
      jwksCache = {
        keys: data.keys,
        expiresAt: now + (maxAge * 1000)
      };
      return jwksCache.keys;
    }
    throw new Error('Dữ liệu JWKS không đúng định dạng');
  } catch (e) {
    // Nếu có cache cũ thì dùng tạm trong lúc mạng lỗi
    if (jwksCache.keys.length > 0) {
      return jwksCache.keys;
    }
    throw e;
  }
}

/**
 * Đặt JWKS giả lập cho mục đích kiểm thử unit test
 */
export function setMockJwks(keys, ttlMs = 3600000) {
  jwksCache = {
    keys,
    expiresAt: Date.now() + ttlMs
  };
}

/**
 * Xóa cache JWKS
 */
export function clearJwksCache() {
  jwksCache = { keys: [], expiresAt: 0 };
}

/**
 * Xác thực Firebase ID Token đầy đủ: cấu trúc, thời hạn, claims và chữ ký RS256
 * @param {string} token - Chuỗi JWT ID Token
 * @param {string} projectId - ID dự án Firebase (vd: on-tap-nghiaedu-tin-hoc)
 * @param {object} options - Tùy chọn (subtleCrypto, customFetch)
 */
export async function verifyFirebaseIdToken(token, projectId, options = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('Thiếu ID Token hoặc định dạng không phải chuỗi');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Cấu trúc JWT không hợp lệ (phải gồm 3 phần)');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Phân tích Header
  let header;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch (e) {
    throw new Error('Header JWT không hợp lệ');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Thuật toán không được hỗ trợ: ${header.alg} (bắt buộc RS256)`);
  }
  if (!header.kid) {
    throw new Error('Header JWT thiếu thông tin kid');
  }

  // 2. Phân tích Payload
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (e) {
    throw new Error('Payload JWT không hợp lệ');
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Kiểm tra thời hạn hết hạn
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Token đã hết hạn sử dụng');
  }

  // Kiểm tra thời điểm phát hành (dung sai lệch đồng hồ 5 phút = 300s)
  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error('Thời gian phát hành token không hợp lệ trong tương lai');
  }

  // Kiểm tra Audience (phải khớp Firebase Project ID)
  if (projectId && payload.aud !== projectId) {
    throw new Error(`Audience không khớp: nhận "${payload.aud}", yêu cầu "${projectId}"`);
  }

  // Kiểm tra Issuer (phải là https://securetoken.google.com/<projectId>)
  if (projectId && payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(`Issuer không hợp lệ: "${payload.iss}"`);
  }

  // Kiểm tra Subject (User UID)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    throw new Error('Token thiếu định danh subject (UID)');
  }

  // 3. Xác minh chữ ký RS256 bằng Web Crypto API
  const subtle = options.subtleCrypto || globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Môi trường không hỗ trợ Web Crypto API (crypto.subtle)');
  }

  const jwks = await getGoogleJwks(options.customFetch || fetch);
  const matchingJwk = jwks.find(k => k.kid === header.kid);
  if (!matchingJwk) {
    throw new Error(`Không tìm thấy Public Key phù hợp với kid: "${header.kid}"`);
  }

  // Import JWK thành CryptoKey
  const cryptoKey = await subtle.importKey(
    'jwk',
    matchingJwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['verify']
  );

  // Dữ liệu ký: "header.payload"
  const encoder = new TextEncoder();
  const signedData = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);

  const isSigValid = await subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedData
  );

  if (!isSigValid) {
    throw new Error('Chữ ký số của Token không hợp lệ');
  }

  return {
    valid: true,
    uid: payload.sub,
    email: payload.email || '',
    name: payload.name || '',
    claims: payload
  };
}
