/**
 * worker/index.js
 * Cloudflare Worker API cho TinHocHub (Giai đoạn 2)
 * Định tuyến thống nhất:
 * - /api/health: Kiểm tra tình trạng máy chủ (Healthcheck)
 * - /api/auth/verify: Xác minh Firebase ID Token phía server
 * - /api/exam/submit: Chấm điểm server-authoritative độc lập
 * - /api/exam/:roomId/answers: Trả đáp án sau khi nộp bài
 * - /api/archive/status: Kiểm tra cấu hình S3 Archive.org
 * - /api/archive/files: Lấy danh sách video trên Archive.org
 * - /api/archive/upload/:filename: Tải video lên Archive.org S3 bằng secret máy chủ
 * - /api/*: Các endpoint API nghiệp vụ được bảo vệ
 * - Các request còn lại: Chuyển giao phục vụ Static Assets (HTML, CSS, JS, JSON)
 */

import { verifyFirebaseIdToken } from './auth.js';
import { gradeSubmission } from './grading.js';
import { answerStore } from './data/answer_store.js';
import {
  isArchiveConfigured,
  getArchiveIdentifier,
  uploadVideoToArchive,
  getArchiveRemoteFiles
} from './archive.js';

// Tiêu đề CORS chuẩn cho các phản hồi API
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Filename, X-Lesson-Title',
  'Access-Control-Max-Age': '86400'
};

// Cache tạm thời thông tin câu hỏi phòng thi để tăng tốc độ chấm điểm
const roomAnswersCache = new Map();

/**
 * Tạo phản hồi JSON chuẩn kèm CORS
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

/**
 * Trích xuất Bearer token từ Authorization header
 */
function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Kiểm tra xem người dùng có vai trò Teacher hoặc Admin trên RTDB không
 */
async function checkTeacherOrAdminRole(uid, token, dbUrl) {
  if (!uid || !token) return false;
  try {
    const res = await fetch(`${dbUrl.replace(/\/$/, '')}/roles/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json();
      return Boolean(data && (data.role === 'teacher' || data.role === 'admin'));
    }
  } catch (e) {
    console.warn('[Worker] Lỗi tra cứu role:', e.message);
  }
  return false;
}

export default {
  /**
   * Main fetch handler của Cloudflare Worker
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Xử lý preflight CORS cho mọi route
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // 2. Định tuyến API: Các đường dẫn bắt đầu bằng /api/
    if (url.pathname.startsWith('/api/')) {
      return this.handleApiRequest(request, env, ctx, url);
    }

    // 3. Phục vụ tài nguyên tĩnh qua Static Assets binding
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetRes = await env.ASSETS.fetch(request);
      // Chống cache cho trang chủ index.html để đảm bảo người dùng luôn nhận bản cập nhật mới nhất
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const newHeaders = new Headers(assetRes.headers);
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newHeaders.set('Pragma', 'no-cache');
        newHeaders.set('Expires', '0');
        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers: newHeaders
        });
      }
      return assetRes;
    }

    return new Response('TinHocHub Worker: Static Assets binding (env.ASSETS) chưa sẵn sàng.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  },

  /**
   * Bộ xử lý các endpoint /api/*
   */
  async handleApiRequest(request, env, ctx, url) {
    const path = url.pathname.replace(/\/+$/, ''); // Bỏ trailing slash nếu có
    const method = request.method.toUpperCase();
    const projectId = env.FIREBASE_PROJECT_ID || 'on-tap-nghiaedu-tin-hoc';
    const dbUrl = env.FIREBASE_DB_URL || 'https://on-tap-nghiaedu-tin-hoc-default-rtdb.asia-southeast1.firebasedatabase.app';

    try {
      // -----------------------------------------------------------------------
      // ENDPOINT 1: GET /api/health (Công khai - Kiểm tra máy chủ)
      // -----------------------------------------------------------------------
      if (path === '/api/health') {
        if (method !== 'GET') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }
        return jsonResponse({
          status: 'ok',
          service: 'tinhoc-hub-worker-api',
          version: '2.3.0',
          environment: env.ENVIRONMENT || 'production',
          timestamp: new Date().toISOString()
        });
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 2: GET/POST /api/auth/verify (Bảo vệ - Kiểm tra token)
      // -----------------------------------------------------------------------
      if (path === '/api/auth/verify') {
        if (method !== 'GET' && method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);
        return jsonResponse({
          valid: true,
          uid: authUser.uid,
          email: authUser.email,
          name: authUser.name,
          verifiedAt: new Date().toISOString()
        });
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 3: POST /api/exam/submit (Chấm điểm Server-Authoritative)
      // -----------------------------------------------------------------------
      if (path === '/api/exam/submit') {
        if (method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({ error: 'Bad Request', message: 'Payload JSON không hợp lệ' }, 400);
        }

        if (!body || typeof body !== 'object') {
          return jsonResponse({ error: 'Bad Request', message: 'Thiếu dữ liệu nộp bài' }, 400);
        }

        // Lấy thêm đáp án của câu hỏi tùy chỉnh phòng thi nếu có (kèm cache in-memory 60s và timeout 2.5s)
        let customAnswersMap = {};
        const roomId = body.roomId || null;

        if (roomId) {
          const cachedRoom = roomAnswersCache.get(roomId);
          if (cachedRoom && cachedRoom.expiresAt > Date.now()) {
            customAnswersMap = cachedRoom.map;
          } else {
            try {
              const roomCtrl = new AbortController();
              const roomTimeout = setTimeout(() => roomCtrl.abort(), 2500);
              const roomRes = await fetch(
                `${dbUrl.replace(/\/$/, '')}/exam_rooms/${encodeURIComponent(roomId)}.json?auth=${encodeURIComponent(token)}`,
                { signal: roomCtrl.signal }
              );
              clearTimeout(roomTimeout);
              if (roomRes.ok) {
                const roomData = await roomRes.json();
                if (roomData && Array.isArray(roomData.fixedQuestions)) {
                  roomData.fixedQuestions.forEach(q => {
                    if (q && q.id) customAnswersMap[q.id] = q;
                  });
                }
                roomAnswersCache.set(roomId, { map: customAnswersMap, expiresAt: Date.now() + 60000 });
              }
            } catch (e) {
              console.warn('[Worker] Không thể nạp phòng thi từ RTDB:', e.message);
            }
          }
        }

        // CHẤM ĐIỂM SERVER-AUTHORITATIVE: Tự động tính toán độc lập, bỏ qua hoàn toàn score của client
        const gradeResult = gradeSubmission(body, { customAnswersMap, answerStore });

        const submissionId = 'exam_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const examHistoryEntry = {
          id: submissionId,
          uid: authUser.uid,
          date: new Date().toISOString(),
          title: body.examConfig?.title || 'Đề thi Tin học',
          type: body.examConfig?.type || 'bgd_2025',
          grade: body.examConfig?.grade || '12',
          examCode: body.examCode || '101',
          score: gradeResult.score,
          rawScore: gradeResult.rawScore,
          part1Score: gradeResult.part1Score,
          part2Score: gradeResult.part2Score,
          totalQuestions: gradeResult.totalQuestions,
          correctCount: gradeResult.correctCount,
          timeSpentSeconds: Number(body.timeSpentSeconds) || 0,
          studentName: body.studentName || authUser.name || authUser.email || 'Thí sinh',
          studentEmail: authUser.email || '',
          studentClass: body.studentClass || '',
          studentSchool: body.studentSchool || '',
          roomId,
          isProctored: Boolean(body.proctor?.isProctored),
          violationCount: gradeResult.violationCount,
          violationLogs: gradeResult.violationLogs,
          isDisqualified: gradeResult.isDisqualified,
          disqualifiedReason: gradeResult.disqualifiedReason,
          details: gradeResult.details
        };

        // Ghi nhận kết quả thi vào /exam_history trên RTDB (dùng ctx.waitUntil không chặn phản hồi của học sinh)
        const saveHistoryPromise = (async () => {
          try {
            await fetch(`${dbUrl.replace(/\/$/, '')}/exam_history/${encodeURIComponent(submissionId)}.json?auth=${encodeURIComponent(token)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(examHistoryEntry)
            });
          } catch (e) {
            console.warn('[Worker] Lỗi mạng khi ghi exam_history:', e.message);
          }
        })();

        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(saveHistoryPromise);
        } else {
          await saveHistoryPromise;
        }

        return jsonResponse({
          success: true,
          submissionId,
          ...gradeResult
        }, 200);
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 4: GET /api/exam/:roomId/answers (Xem lại đáp án sau khi nộp)
      // -----------------------------------------------------------------------
      const answersMatch = path.match(/^\/api\/exam\/([^/]+)\/answers$/);
      if (answersMatch || path === '/api/exam/answers') {
        if (method !== 'GET') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const targetRoomId = answersMatch ? decodeURIComponent(answersMatch[1]) : url.searchParams.get('roomId');
        if (!targetRoomId) {
          return jsonResponse({ error: 'Bad Request', message: 'Thiếu roomId' }, 400);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);

        // 1. Kiểm tra vai trò của người dùng trên /roles/$uid
        const isTeacherOrAdmin = await checkTeacherOrAdminRole(authUser.uid, token, dbUrl);

        // 2. Nếu là học sinh, kiểm tra xem đã nộp bài phòng thi này chưa hoặc phòng thi đã hết giờ
        let canViewAnswers = isTeacherOrAdmin;
        let roomData = null;

        try {
          const roomRes = await fetch(`${dbUrl.replace(/\/$/, '')}/exam_rooms/${encodeURIComponent(targetRoomId)}.json?auth=${encodeURIComponent(token)}`);
          if (roomRes.ok) {
            roomData = await roomRes.json();
          }
        } catch (e) {}

        if (!canViewAnswers) {
          // Kiểm tra xem phòng thi đã hết giờ chưa
          if (roomData && roomData.endTime) {
            const endTs = new Date(roomData.endTime).getTime();
            if (Date.now() > endTs) {
              canViewAnswers = true;
            }
          }

          // Kiểm tra xem thí sinh đã nộp bài vào /exam_history chưa
          if (!canViewAnswers) {
            try {
              const histCheckRes = await fetch(`${dbUrl.replace(/\/$/, '')}/exam_history.json?auth=${encodeURIComponent(token)}&orderBy="uid"&equalTo="${encodeURIComponent(authUser.uid)}"`);
              if (histCheckRes.ok) {
                const histList = await histCheckRes.json();
                if (histList && typeof histList === 'object') {
                  const hasSubmitted = Object.values(histList).some(h => h && h.roomId === targetRoomId);
                  if (hasSubmitted) {
                    canViewAnswers = true;
                  }
                }
              }
            } catch (e) {}
          }
        }

        if (!canViewAnswers) {
          return jsonResponse({
            error: 'Forbidden',
            message: 'Thí sinh chưa nộp bài hoặc phòng thi chưa kết thúc. Không được phép xem trước đáp án.'
          }, 403);
        }

        // Lấy danh sách đáp án cho phòng thi này
        const roomAnswers = {};
        if (roomData && Array.isArray(roomData.fixedQuestions)) {
          roomData.fixedQuestions.forEach(q => {
            if (q && q.id) {
              const fromStore = answerStore[q.id];
              roomAnswers[q.id] = {
                answer: q.answer || fromStore?.answer || '',
                level: q.level || fromStore?.level || '1',
                options: q.options || fromStore?.options || []
              };
            }
          });
        }

        return jsonResponse({
          success: true,
          roomId: targetRoomId,
          answers: roomAnswers,
          unlockedAt: new Date().toISOString()
        }, 200);
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 5: GET /api/archive/status (Kiểm tra cấu hình S3 Archive.org)
      // -----------------------------------------------------------------------
      if (path === '/api/archive/status') {
        if (method !== 'GET') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);
        const isTeacherOrAdmin = await checkTeacherOrAdminRole(authUser.uid, token, dbUrl);
        if (!isTeacherOrAdmin) {
          return jsonResponse({
            error: 'Forbidden',
            message: 'Chỉ Giáo viên và Quản trị viên mới được phép truy cập trạng thái S3.'
          }, 403);
        }

        return jsonResponse({
          success: true,
          configured: isArchiveConfigured(env),
          identifier: getArchiveIdentifier(env),
          checkedAt: new Date().toISOString()
        });
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 6: GET /api/archive/files (Quét danh sách file trên Archive.org)
      // -----------------------------------------------------------------------
      if (path === '/api/archive/files') {
        if (method !== 'GET') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);
        const isTeacherOrAdmin = await checkTeacherOrAdminRole(authUser.uid, token, dbUrl);
        if (!isTeacherOrAdmin) {
          return jsonResponse({
            error: 'Forbidden',
            message: 'Chỉ Giáo viên và Quản trị viên mới được phép xem danh sách tệp.'
          }, 403);
        }

        const fileResult = await getArchiveRemoteFiles(env);
        return jsonResponse(fileResult, 200);
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 7: PUT /api/archive/upload/:filename (Tải video lên Archive.org S3)
      // -----------------------------------------------------------------------
      const uploadMatch = path.match(/^\/api\/archive\/upload\/(.+)$/);
      if (uploadMatch || path === '/api/archive/upload') {
        if (method !== 'PUT' && method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const filename = uploadMatch
          ? decodeURIComponent(uploadMatch[1])
          : (url.searchParams.get('filename') || request.headers.get('x-filename'));

        if (!filename) {
          return jsonResponse({ error: 'Bad Request', message: 'Thiếu tên tệp video (filename).' }, 400);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);
        const isTeacherOrAdmin = await checkTeacherOrAdminRole(authUser.uid, token, dbUrl);
        if (!isTeacherOrAdmin) {
          return jsonResponse({
            error: 'Forbidden',
            message: 'Chỉ Giáo viên và Quản trị viên mới có quyền tải video lên máy chủ.'
          }, 403);
        }

        // Kiểm tra xem Worker đã được cấu hình Secrets S3 chưa
        if (!isArchiveConfigured(env)) {
          return jsonResponse({
            error: 'Service Unavailable',
            message: 'Khóa S3 Archive.org chưa được cấu hình trên máy chủ Cloudflare Worker (Thiếu ARCHIVE_S3_ACCESS / ARCHIVE_S3_SECRET). Vui lòng cấu hình qua wrangler secret put.'
          }, 503);
        }

        const lessonName = url.searchParams.get('lesson') || request.headers.get('x-lesson-title') || '';
        const uploadResult = await uploadVideoToArchive(request.body, filename, lessonName, env);

        return jsonResponse(uploadResult, 200);
      }

      // -----------------------------------------------------------------------
      // ENDPOINT 8: POST /api/role/activate (Kích hoạt vai trò qua mã bí mật máy chủ)
      // -----------------------------------------------------------------------
      if (path === '/api/role/activate') {
        if (method !== 'POST') {
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
        }

        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({
            error: 'Unauthorized',
            message: 'Yêu cầu không kèm Bearer ID Token trong Authorization header.'
          }, 401);
        }

        const authUser = await verifyFirebaseIdToken(token, projectId);

        let body = {};
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({ error: 'Bad Request', message: 'Dữ liệu JSON không hợp lệ.' }, 400);
        }

        const code = String(body.code || '').trim().toUpperCase();
        if (!code) {
          return jsonResponse({
            error: 'Bad Request',
            message: 'Vui lòng cung cấp mã kích hoạt vai trò.'
          }, 400);
        }

        // So khớp với Secrets trên Cloudflare Worker
        const secretAdmin = String(env.ROLE_CODE_ADMIN || '').trim().toUpperCase();
        const secretTeacher = String(env.ROLE_CODE_TEACHER || '').trim().toUpperCase();

        let assignedRole = null;
        if (secretAdmin && code === secretAdmin) {
          assignedRole = 'admin';
        } else if (secretTeacher && code === secretTeacher) {
          assignedRole = 'teacher';
        } else {
          return jsonResponse({
            error: 'Forbidden',
            message: 'Mã kích hoạt vai trò không chính xác hoặc đã hết hạn sử dụng.'
          }, 403);
        }

        const roleLabel = (assignedRole === 'admin') ? 'Quản trị viên' : 'Giáo viên';
        const nowIso = new Date().toISOString();

        // 1. Cập nhật trực tiếp lên /roles/$uid nếu có Database Secret hoặc Admin auth
        const adminAuth = env.FIREBASE_DATABASE_SECRET || env.FIREBASE_ADMIN_AUTH;
        let rtdbRoleUpdated = false;
        if (adminAuth) {
          try {
            const roleRes = await fetch(`${dbUrl.replace(/\/$/, '')}/roles/${encodeURIComponent(authUser.uid)}.json?auth=${encodeURIComponent(adminAuth)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role: assignedRole,
                updatedAt: nowIso,
                updatedBy: 'worker_code_activation'
              })
            });
            if (roleRes.ok) {
              rtdbRoleUpdated = true;
            }
          } catch (e) {
            console.warn('[Worker] Lỗi khi ghi /roles bằng admin auth:', e.message);
          }
        }

        // 2. Ghi nhận lịch sử kích hoạt vào /role_requests/$uid (với quyền của chính user token)
        try {
          await fetch(`${dbUrl.replace(/\/$/, '')}/role_requests/${encodeURIComponent(authUser.uid)}.json?auth=${encodeURIComponent(token)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: authUser.uid,
              email: authUser.email || '',
              name: authUser.name || '',
              requestedRole: assignedRole,
              status: rtdbRoleUpdated ? 'approved' : 'activated_by_code',
              codeVerified: true,
              activatedAt: nowIso,
              updatedAt: nowIso
            })
          });
        } catch (e) {
          console.warn('[Worker] Lỗi khi ghi /role_requests:', e.message);
        }

        return jsonResponse({
          success: true,
          role: assignedRole,
          roleLabel,
          message: `Chúc mừng! Bạn đã kích hoạt thành công vai trò [${roleLabel}].`
        }, 200);
      }

      // -----------------------------------------------------------------------
      // 404: Endpoint API không tồn tại
      // -----------------------------------------------------------------------
      return jsonResponse({
        error: 'Not Found',
        message: `Đường dẫn API "${url.pathname}" không tồn tại trên hệ thống.`
      }, 404);

    } catch (err) {
      // Bắt các lỗi xác thực token -> Trả về 401 Unauthorized
      const errMsg = err.message || '';
      if (
        errMsg.includes('Token') ||
        errMsg.includes('JWT') ||
        errMsg.includes('Audience') ||
        errMsg.includes('Issuer') ||
        errMsg.includes('hết hạn') ||
        errMsg.includes('chữ ký')
      ) {
        return jsonResponse({
          error: 'Unauthorized',
          message: `Xác thực ID Token thất bại: ${errMsg}`
        }, 401);
      }

      // Lỗi hệ thống nội bộ -> Trả về 500
      console.error(`[Worker Error] ${method} ${path}:`, err);
      return jsonResponse({
        error: 'Internal Server Error',
        message: err.message || 'Đã xảy ra lỗi nội bộ trên máy chủ.'
      }, 500);
    }
  }
};
