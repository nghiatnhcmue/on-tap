/**
 * worker/archive.js
 * Quản lý tương tác với Archive.org S3 API phía Cloudflare Worker.
 * Khóa S3 sống an toàn trong Worker Secrets (env.ARCHIVE_S3_ACCESS, env.ARCHIVE_S3_SECRET).
 */

const DEFAULT_ARCHIVE_IDENTIFIER = 'tinhoc-hub-thpt';

/**
 * Kiểm tra xem Worker đã được cấu hình Secrets S3 hay chưa
 */
export function isArchiveConfigured(env) {
  return Boolean(env && env.ARCHIVE_S3_ACCESS && env.ARCHIVE_S3_SECRET);
}

/**
 * Lấy Archive.org item identifier (bucket)
 */
export function getArchiveIdentifier(env) {
  return env?.ARCHIVE_IDENTIFIER || DEFAULT_ARCHIVE_IDENTIFIER;
}

/**
 * Tải file video lên Archive.org S3 bằng khóa bí mật máy chủ
 * @param {ReadableStream|ArrayBuffer|Blob} fileBody - Luồng dữ liệu video
 * @param {string} filename - Tên file MP4 (vd: 12_01_Bai1.mp4)
 * @param {string} lessonName - Tên bài giảng để ghi vào metadata tiêu đề
 * @param {object} env - Biến môi trường / Secrets của Worker
 */
export async function uploadVideoToArchive(fileBody, filename, lessonName = '', env = {}) {
  if (!isArchiveConfigured(env)) {
    throw new Error('Khóa S3 Archive.org chưa được cấu hình trên máy chủ (Thiếu ARCHIVE_S3_ACCESS / ARCHIVE_S3_SECRET).');
  }

  const identifier = getArchiveIdentifier(env);
  const cleanFilename = String(filename || '').trim();
  if (!cleanFilename) {
    throw new Error('Tên tệp video không hợp lệ');
  }

  const targetUrl = `https://s3.us.archive.org/${encodeURIComponent(identifier)}/${encodeURIComponent(cleanFilename)}`;

  // Tiêu đề metadata dạng uri(...) tuân thủ chuẩn ISO-8859-1 của Archive.org Header
  const rawTitle = `Bài giảng Tin học THPT - ${lessonName || cleanFilename}`;
  const safeTitle = `uri(${encodeURIComponent(rawTitle)})`;

  const headers = {
    'Authorization': `LOW ${env.ARCHIVE_S3_ACCESS}:${env.ARCHIVE_S3_SECRET}`,
    'x-amz-auto-make-bucket': '1',
    'x-archive-meta-mediatype': 'movies',
    'x-archive-meta-collection': 'opensource_movies',
    'x-archive-meta-title': safeTitle,
    'x-archive-ignore-preexisting-bucket': '1',
    'Content-Type': 'video/mp4'
  };

  const res = await fetch(targetUrl, {
    method: 'PUT',
    headers,
    body: fileBody
  });

  if (res.status >= 200 && res.status < 300) {
    const downloadUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(cleanFilename)}`;
    return {
      success: true,
      status: res.status,
      filename: cleanFilename,
      identifier,
      url: downloadUrl
    };
  }

  const errText = await res.text();
  throw new Error(`Archive.org phản hồi lỗi HTTP ${res.status}: ${errText.slice(0, 200)}`);
}

/**
 * Quét danh sách các file video đã có trên Archive.org item
 */
export async function getArchiveRemoteFiles(env = {}) {
  const identifier = getArchiveIdentifier(env);
  const metaUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}/files`;

  try {
    const res = await fetch(metaUrl);
    if (!res.ok) {
      return { success: false, identifier, files: [] };
    }
    const data = await res.json();
    const files = Array.isArray(data?.result)
      ? data.result.map(f => f.name).filter(Boolean)
      : [];
    return {
      success: true,
      identifier,
      files
    };
  } catch (err) {
    return { success: false, identifier, files: [], error: err.message };
  }
}
