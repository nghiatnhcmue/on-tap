#!/usr/bin/env node
/**
 * scripts/migrate_accounts.js
 * TinHocHub - Công cụ Di trú & Làm sạch Dữ liệu Người dùng (Data Migration Tool)
 * 
 * Mục đích:
 * 1. Quét và loại bỏ vĩnh viễn trường 'password' khỏi mọi bản ghi tài khoản.
 * 2. Tách trường 'role' khỏi /accounts sang node phân quyền máy chủ riêng biệt /roles/$uid.
 * 3. Chuẩn hóa khóa của /accounts theo đúng UID (Firebase Auth UID).
 * 4. Tạo báo cáo kiểm toán (Audit Report) danh sách Giáo viên & Admin để rà soát thủ công.
 */

import fs from 'node:fs';
import path from 'node:path';

// Trợ giúp hiển thị tài liệu CLI
function showHelp() {
  console.log(`
================================================================================
  TinHocHub - CÔNG CỤ DI TRÚ & LÀM SẠCH DỮ LIỆU TÀI KHOẢN (GIAI ĐOẠN 1.4)
================================================================================

Cách dùng (Chế độ File JSON Offline - Khuyến nghị):
  node scripts/migrate_accounts.js --input <accounts_raw.json> [tùy chọn]

Tùy chọn:
  --input, -i <path>             Đường dẫn file JSON thô xuất từ node /accounts trên Firebase Console
                                (Mặc định: accounts_raw.json)
  --output-accounts, -oa <path>  Đường dẫn file kết quả tài khoản đã làm sạch
                                (Mặc định: accounts_clean.json)
  --output-roles, -or <path>     Đường dẫn file kết quả vai trò chuẩn hóa (/roles)
                                (Mặc định: roles_clean.json)
  --audit, -a <path>             Đường dẫn file báo cáo kiểm toán vai trò giáo viên/admin
                                (Mặc định: roles_audit.txt)
  --online                       Chế độ kết nối trực tiếp Firebase qua REST API
  --db-url <url>                 URL Firebase Realtime Database (dùng với --online)
  --token <idToken>              Firebase ID Token của tài khoản Admin (dùng với --online)
  --dry-run                      Chỉ phân tích dữ liệu, không ghi file hoặc không cập nhật DB
  --help, -h                     Hiển thị hướng dẫn này

Ví dụ:
  1. Xuất file accounts từ Firebase Console lưu thành 'accounts_raw.json'
  2. Chạy: node scripts/migrate_accounts.js --input accounts_raw.json
  3. Mở file 'roles_audit.txt' đối soát danh sách giáo viên và admin
  4. Import 'accounts_clean.json' vào node /accounts trên Firebase Console
  5. Import 'roles_clean.json' vào node /roles trên Firebase Console
================================================================================
`);
}

// Hàm chuẩn hóa & làm sạch 1 tài khoản
export function sanitizeAccountRecord(rawKey, rawData) {
  if (!rawData || typeof rawData !== 'object') return null;

  // Xác định UID chuẩn
  const uid = String(rawData.uid || rawKey || '').trim();
  if (!uid) return null;

  const email = rawData.email ? String(rawData.email).trim().toLowerCase() : '';
  const fullName = rawData.fullName ? String(rawData.fullName).trim() : (rawData.name ? String(rawData.name).trim() : '');
  const username = rawData.username ? String(rawData.username).trim().toLowerCase() : '';
  const className = rawData.className ? String(rawData.className).trim() : (rawData.class ? String(rawData.class).trim() : '');
  const school = rawData.school ? String(rawData.school).trim() : '';
  const grade = rawData.grade ? String(rawData.grade).trim() : '';
  const avatar = rawData.avatar || '';
  const createdAt = rawData.createdAt || new Date().toISOString();
  const lastLogin = rawData.lastLogin || null;

  // Lấy vai trò cũ để phân loại
  const rawRole = String(rawData.role || '').trim().toLowerCase();
  const role = (rawRole === 'admin' || rawRole === 'teacher') ? rawRole : 'student';

  // ĐỐI TƯỢNG TÀI KHOẢN MỚI: TUYỆT ĐỐI KHÔNG CÓ 'password' VÀ KHÔNG CÓ 'role'
  const cleanAccount = {
    uid,
    fullName: fullName || 'Thành viên',
    email: email || undefined,
    username: username || undefined,
    className: className || undefined,
    school: school || undefined,
    grade: grade || undefined,
    avatar: avatar || undefined,
    createdAt,
    lastLogin: lastLogin || undefined,
    isProfileComplete: Boolean(rawData.isProfileComplete || (fullName && (className || school)))
  };

  // Loại bỏ các trường undefined
  Object.keys(cleanAccount).forEach(k => cleanAccount[k] === undefined && delete cleanAccount[k]);

  // Kiểm tra an toàn: đảm bảo không còn bất kỳ trường nhạy cảm nào
  delete cleanAccount.password;
  delete cleanAccount.passwordHash;
  delete cleanAccount.pass;
  delete cleanAccount.role;

  return {
    uid,
    role,
    cleanAccount,
    hadPassword: Boolean(rawData.password || rawData.passwordHash || rawData.pass)
  };
}

// Xử lý toàn bộ danh sách tài khoản
export function processAccountsMigration(rawAccountsData) {
  const accountsClean = {};
  const rolesClean = {};
  const auditList = [];

  let totalProcessed = 0;
  let passwordsPurgedCount = 0;
  let studentCount = 0;
  let teacherCount = 0;
  let adminCount = 0;

  // Hỗ trợ cả Object lẫn Array
  const entries = Array.isArray(rawAccountsData)
    ? rawAccountsData.map((acc, idx) => [acc.uid || String(idx), acc])
    : Object.entries(rawAccountsData || {});

  for (const [key, val] of entries) {
    const res = sanitizeAccountRecord(key, val);
    if (!res) continue;

    totalProcessed++;
    if (res.hadPassword) passwordsPurgedCount++;

    accountsClean[res.uid] = res.cleanAccount;

    if (res.role === 'admin' || res.role === 'teacher') {
      rolesClean[res.uid] = {
        role: res.role,
        approvedBy: 'migration_tool',
        updatedAt: new Date().toISOString(),
        email: res.cleanAccount.email || '',
        fullName: res.cleanAccount.fullName || ''
      };

      auditList.push({
        uid: res.uid,
        role: res.role,
        fullName: res.cleanAccount.fullName,
        email: res.cleanAccount.email || '(Không có email)',
        school: res.cleanAccount.school || '(Chưa điền trường)'
      });

      if (res.role === 'admin') adminCount++;
      if (res.role === 'teacher') teacherCount++;
    } else {
      studentCount++;
    }
  }

  return {
    totalProcessed,
    passwordsPurgedCount,
    studentCount,
    teacherCount,
    adminCount,
    accountsClean,
    rolesClean,
    auditList
  };
}

// Tạo nội dung văn bản báo cáo kiểm toán vai trò
export function generateAuditReportText(auditList, stats) {
  let text = `================================================================================\n`;
  text += ` BÁO CÁO KIỂM TOÁN VAI TRÒ GIÁO VIÊN & QUẢN TRỊ VIÊN (ROLE AUDIT REPORT)\n`;
  text += ` Thời gian tạo: ${new Date().toLocaleString('vi-VN')}\n`;
  text += `================================================================================\n\n`;

  text += `TỔNG KẾT:\n`;
  text += `- Tổng số tài khoản đã xử lý: ${stats.totalProcessed}\n`;
  text += `- Số tài khoản đã bị xóa sạch trường 'password': ${stats.passwordsPurgedCount} (100% sạch)\n`;
  text += `- Học sinh (Student - mặc định không ghi vào /roles): ${stats.studentCount}\n`;
  text += `- Giáo viên (Teacher): ${stats.teacherCount}\n`;
  text += `- Quản trị viên (Admin): ${stats.adminCount}\n\n`;

  text += `DANH SÁCH TÀI KHOẢN CÓ QUYỀN ĐẶC BIỆT CẦN RÀ SOÁT THỦ CÔNG:\n`;
  text += `(Quản trị viên cần kiểm tra kỹ từng tài khoản dưới đây trước khi áp dụng vào /roles)\n`;
  text += `--------------------------------------------------------------------------------\n`;

  if (auditList.length === 0) {
    text += `(Không có tài khoản Giáo viên hoặc Admin nào được tìm thấy)\n`;
  } else {
    auditList.forEach((item, index) => {
      text += `[${index + 1}] Vai trò: [${item.role.toUpperCase()}]\n`;
      text += `    UID:      ${item.uid}\n`;
      text += `    Họ tên:   ${item.fullName}\n`;
      text += `    Email:    ${item.email}\n`;
      text += `    Đơn vị:   ${item.school}\n`;
      text += `    Trạng thái: Cần xác nhận là nhân sự sư phạm hợp lệ\n\n`;
    });
  }

  text += `--------------------------------------------------------------------------------\n`;
  text += `HƯỚNG DẪN BƯỚC TIẾP THEO:\n`;
  text += `1. Nếu có tài khoản nào được gán 'teacher' hoặc 'admin' không đúng thực tế, hãy xóa bản ghi đó trong file roles_clean.json.\n`;
  text += `2. Sau khi xác nhận danh sách trên là chính xác, import roles_clean.json vào node /roles trên Firebase Console.\n`;
  text += `3. Import accounts_clean.json vào node /accounts trên Firebase Console.\n`;
  text += `================================================================================\n`;

  return text;
}

// Xử lý trực tiếp từ CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const getArg = (flag, shortFlag, defaultVal) => {
    let idx = args.indexOf(flag);
    if (idx === -1 && shortFlag) idx = args.indexOf(shortFlag);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return defaultVal;
  };

  const isDryRun = args.includes('--dry-run');
  const isOnline = args.includes('--online');

  if (isOnline) {
    const dbUrl = getArg('--db-url', null, '');
    const token = getArg('--token', null, '');

    if (!dbUrl || !token) {
      console.error('❌ Chế độ --online yêu cầu cung cấp --db-url và --token (Admin ID Token)!');
      process.exit(1);
    }

    console.log(`🌐 Đang kết nối tới ${dbUrl}...`);
    try {
      const fetchUrl = `${dbUrl.replace(/\/$/, '')}/accounts.json?auth=${encodeURIComponent(token)}`;
      const res = await fetch(fetchUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const rawData = await res.json();
      const result = processAccountsMigration(rawData);

      console.log(`\n✅ Đã tải và làm sạch ${result.totalProcessed} tài khoản.`);
      console.log(`- Xóa sạch password: ${result.passwordsPurgedCount} tài khoản.`);
      console.log(`- Giáo viên: ${result.teacherCount}, Admin: ${result.adminCount}, Học sinh: ${result.studentCount}`);

      const auditText = generateAuditReportText(result.auditList, result);
      console.log('\n' + auditText);

      if (!isDryRun) {
        console.log('Đang ghi /accounts và /roles lên máy chủ...');
        await fetch(`${dbUrl.replace(/\/$/, '')}/accounts.json?auth=${encodeURIComponent(token)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.accountsClean)
        });
        await fetch(`${dbUrl.replace(/\/$/, '')}/roles.json?auth=${encodeURIComponent(token)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.rolesClean)
        });
        console.log('🎯 Di trú trực tuyến thành công 100%!');
      } else {
        console.log('ℹ️ Chế độ --dry-run: Không ghi thay đổi lên máy chủ.');
      }
    } catch (e) {
      console.error(`❌ Lỗi kết nối online: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  // Chế độ File JSON Offline
  const inputFile = getArg('--input', '-i', 'accounts_raw.json');
  const outAccountsFile = getArg('--output-accounts', '-oa', 'accounts_clean.json');
  const outRolesFile = getArg('--output-roles', '-or', 'roles_clean.json');
  const auditFile = getArg('--audit', '-a', 'roles_audit.txt');

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Không tìm thấy tệp đầu vào: "${inputFile}"!`);
    console.error(`Vui lòng xuất JSON node /accounts từ Firebase Console và lưu thành "${inputFile}", hoặc dùng --input <đường_dẫn>.`);
    console.error(`Chạy 'node scripts/migrate_accounts.js --help' để xem hướng dẫn chi tiết.`);
    process.exit(1);
  }

  console.log(`📂 Đang đọc dữ liệu từ: ${inputFile}...`);
  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (e) {
    console.error(`❌ Tệp ${inputFile} không đúng định dạng JSON hợp lệ: ${e.message}`);
    process.exit(1);
  }

  const result = processAccountsMigration(rawData);

  console.log(`\n================ KẾT QUẢ XỬ LÝ DI TRÚ ================`);
  console.log(`- Tổng số tài khoản xử lý:             ${result.totalProcessed}`);
  console.log(`- Số trường 'password' đã bị xóa sạch:  ${result.passwordsPurgedCount}`);
  console.log(`- Tài khoản Học sinh (Student):         ${result.studentCount}`);
  console.log(`- Tài khoản Giáo viên (Teacher):        ${result.teacherCount}`);
  console.log(`- Tài khoản Quản trị viên (Admin):      ${result.adminCount}`);
  console.log(`======================================================\n`);

  const auditText = generateAuditReportText(result.auditList, result);

  if (isDryRun) {
    console.log('ℹ️ Chế độ --dry-run: Không xuất file ra đĩa.');
    console.log(auditText);
    return;
  }

  fs.writeFileSync(outAccountsFile, JSON.stringify(result.accountsClean, null, 2), 'utf8');
  console.log(`✅ Đã xuất tài khoản làm sạch: ${outAccountsFile}`);

  fs.writeFileSync(outRolesFile, JSON.stringify(result.rolesClean, null, 2), 'utf8');
  console.log(`✅ Đã xuất cấu trúc vai trò:   ${outRolesFile}`);

  fs.writeFileSync(auditFile, auditText, 'utf8');
  console.log(`✅ Đã xuất báo cáo kiểm toán:  ${auditFile}`);

  console.log(`\n🎯 HOÀN TẤT! Vui lòng đọc file "${auditFile}" để rà soát kỹ vai trò trước khi import lên Firebase.`);
}

// Chạy trực tiếp nếu được gọi từ command line
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch(err => {
    console.error('Lỗi thực thi:', err);
    process.exit(1);
  });
}
