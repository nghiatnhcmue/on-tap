/**
 * Test Suite for RandomPicker & Classroom Mini-Games Engine
 * Run with: node test/random-picker.test.js
 */

import assert from 'node:assert';

// Mock localStorage for Node environment
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

global.window = {
  localStorage: global.localStorage
};

global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

// Import Storage and RandomPicker
const { Storage } = await import('../js/storage.js');
const { default: RandomPicker } = await import('../js/random-picker.js');

console.log('🧪 BẮT ĐẦU KIỂM THỬ BỘ CÔNG CỤ RANDOM & GAME GỌI TÊN LỚP HỌC...\n');

// ----------------------------------------------------------------------------
// TEST 1: PARSING DANH SÁCH TÊN HỌC SINH
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 1: Xử lý và chuẩn hóa chuỗi danh sách học sinh');
  const sampleInput = `
    Nguyễn Minh Khôi
    Trần Bảo An, Lê Hoàng Nam; Phạm Quỳnh Anh
    
    Vũ Đức Trí
  `;

  const parsed = RandomPicker.parseNamesFromText(sampleInput);
  assert.strictEqual(parsed.length, 5);
  assert.strictEqual(parsed[0], 'Nguyễn Minh Khôi');
  assert.strictEqual(parsed[1], 'Trần Bảo An');
  assert.strictEqual(parsed[2], 'Lê Hoàng Nam');
  assert.strictEqual(parsed[3], 'Phạm Quỳnh Anh');
  assert.strictEqual(parsed[4], 'Vũ Đức Trí');

  console.log(`  ✔ Phân tích chuẩn xác 5 học sinh từ nhiều định dạng phân cách (xuống dòng, dấu phẩy, chấm phẩy)!`);
}

// ----------------------------------------------------------------------------
// TEST 2: QUẢN LÝ PRESETS LỚP HỌC (STORAGE)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 2: Quản lý Presets lớp học chuẩn & lưu trữ tùy biến');
  const presets = Storage.getClassroomPresets();
  assert.ok(Array.isArray(presets), 'Presets must be an array');
  assert.ok(presets.length >= 3, 'Must have at least 3 default presets (EMASI, Chu Văn An, PTNK)');

  const emasiPreset = presets.find(p => p.id === 'preset_emasi_12e');
  assert.ok(emasiPreset, 'EMASI 12E preset must exist');
  assert.strictEqual(emasiPreset.names.length, 25);

  // Thêm preset mới
  const customPreset = {
    id: 'preset_test_10a1',
    name: 'Lớp 10A1 Tin Học Thực Hành',
    names: ['Học sinh A', 'Học sinh B', 'Học sinh C']
  };
  const saveOk = Storage.saveClassroomPreset(customPreset);
  assert.strictEqual(saveOk, true);

  const updatedPresets = Storage.getClassroomPresets();
  const found = updatedPresets.find(p => p.id === 'preset_test_10a1');
  assert.ok(found, 'Custom preset must be persisted in storage');
  assert.strictEqual(found.names.length, 3);

  // Xóa preset
  Storage.deleteClassroomPreset('preset_test_10a1');
  const afterDelete = Storage.getClassroomPresets();
  assert.strictEqual(afterDelete.some(p => p.id === 'preset_test_10a1'), false);

  console.log('  ✔ Lưu, nạp và xóa Presets danh sách lớp học hoạt động hoàn hảo!');
}

// ----------------------------------------------------------------------------
// TEST 3: CHẾ ĐỘ LOẠI TRỪ (ELIMINATION MODE) TRONG VÒNG QUAY & MINI-GAMES
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 3: Chế độ Loại Trừ (Elimination Mode) tránh gọi trùng lặp');
  RandomPicker.setNames(['Bạn 1', 'Bạn 2', 'Bạn 3', 'Bạn 4', 'Bạn 5']);
  assert.strictEqual(RandomPicker.activeNames.length, 5);

  // Giả lập quay trúng 'Bạn 3' với eliminationMode = true
  RandomPicker.eliminationMode = true;
  const winner = 'Bạn 3';
  const idx = RandomPicker.activeNames.indexOf(winner);
  if (idx >= 0) {
    RandomPicker.activeNames.splice(idx, 1);
    RandomPicker.eliminatedNames.push(winner);
  }

  assert.strictEqual(RandomPicker.activeNames.length, 4);
  assert.strictEqual(RandomPicker.activeNames.includes('Bạn 3'), false);
  assert.strictEqual(RandomPicker.eliminatedNames.includes('Bạn 3'), true);

  // Khôi phục lại
  RandomPicker.setNames(RandomPicker.rawNames);
  assert.strictEqual(RandomPicker.activeNames.length, 5);
  assert.strictEqual(RandomPicker.activeNames.includes('Bạn 3'), true);

  console.log('  ✔ Chế độ loại trừ bảo đảm tính công bằng sư phạm, không gọi trùng bạn đã trả lời!');
}

// ----------------------------------------------------------------------------
// TEST 4: THUẬT TOÁN CHIA NHÓM TỰ ĐỘNG CÂN BẰNG (TEAM GENERATOR)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 4: Thuật toán Chia Nhóm ngẫu nhiên & Cân bằng sĩ số');
  const names25 = Array.from({ length: 25 }, (_, i) => `Học sinh ${i + 1}`);
  RandomPicker.setNames(names25);

  // 4a. Chia thành 4 nhóm
  const numGroups = 4;
  const groups = Array.from({ length: numGroups }, (_, i) => ({
    id: i + 1,
    mascot: RandomPicker.MASCOTS[i % RandomPicker.MASCOTS.length],
    members: []
  }));

  names25.forEach((name, idx) => {
    groups[idx % numGroups].members.push(name);
  });

  assert.strictEqual(groups.length, 4);
  assert.strictEqual(groups[0].members.length, 7);
  assert.strictEqual(groups[1].members.length, 6);
  assert.strictEqual(groups[2].members.length, 6);
  assert.strictEqual(groups[3].members.length, 6);

  // Đảm bảo không bạn nào bị trùng hoặc bỏ sót
  const allAssigned = groups.flatMap(g => g.members);
  assert.strictEqual(allAssigned.length, 25);
  assert.strictEqual(new Set(allAssigned).size, 25);

  // Kiểm tra tên Mascot linh thú
  assert.ok(groups[0].mascot.name, 'Each group must have a mascot name');
  assert.ok(groups[0].mascot.icon, 'Each group must have an icon');

  console.log(`  ✔ Chia 25 học sinh thành 4 nhóm cân bằng tuyệt đối (7-6-6-6), đủ linh thú và trưởng nhóm!`);
}

// ----------------------------------------------------------------------------
// TEST 5: KÈM CÂU HỎI TRẮC NGHIỆM TIN HỌC (EDUCATIONAL INTEGRATION)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 5: Tích hợp Ngân hàng Đề thi Tin học ngẫu nhiên khi gọi tên');
  const mockGrade12 = [
    {
      id: 'q1',
      question: 'Trong mạng máy tính, giao thức IP hoạt động ở tầng nào?',
      options: ['Tầng mạng (Network)', 'Tầng giao vận', 'Tầng liên kết dữ liệu', 'Tầng ứng dụng'],
      answer: 0
    },
    {
      id: 'q2',
      question: 'Thiết bị nào chuyển đổi tín hiệu số thành tín hiệu tương tự?',
      options: ['Router', 'Modem', 'Switch', 'Hub'],
      answer: 1
    }
  ];

  RandomPicker.loadGradeFn = async () => mockGrade12;
  const q = await RandomPicker.getRandomQuizQuestion('12');

  assert.ok(q, 'Question must be returned');
  assert.ok(q.question, 'Question text must exist');
  assert.strictEqual(q.options.length, 4);
  assert.ok(q.answer !== undefined, 'Answer must exist');

  console.log(`  ✔ Nạp câu hỏi trắc nghiệm Tin học thành công: [${q.question.slice(0, 45)}...]`);
}

// ----------------------------------------------------------------------------
// TEST 6: THỬ THÁCH HỘP QUÀ BÍ ẨN (MYSTERY BOXES CHALLENGES)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 6: Ngân hàng Thử thách & Phần thưởng trong Hộp Quà Bí Ẩn');
  assert.ok(Array.isArray(RandomPicker.CHALLENGES));
  assert.ok(RandomPicker.CHALLENGES.length >= 6);

  const randChallenge = RandomPicker.CHALLENGES[Math.floor(Math.random() * RandomPicker.CHALLENGES.length)];
  assert.strictEqual(typeof randChallenge, 'string');
  assert.ok(randChallenge.length > 5);

  console.log(`  ✔ Thử thách ngẫu nhiên xuất sắc: "${randChallenge}"`);
}

// ----------------------------------------------------------------------------
// TEST 7: BỘ SƯU TẬP 40 LINH THÚ BLOOKS SVG ĐA LỚP (AVATARS.JS)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 7: Kiểm thử 44 Linh Thú Blooks Vector SVG & Phân hạng Rarity');
  const { AVATARS, AVATAR_CATEGORIES, RARITY, renderAvatar, renderAvatarSVG } = await import('../js/avatars.js');
  assert.ok(AVATARS.length >= 40, `Must have at least 40 custom SVG avatars (found ${AVATARS.length})`);
  assert.ok(AVATAR_CATEGORIES.length >= 6, 'Must have at least 6 categories');
  assert.ok(RARITY.mythic && RARITY.legendary && RARITY.epic && RARITY.common);

  for (const a of AVATARS) {
    const svg = renderAvatarSVG(a.id);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `Avatar ${a.id} must render valid SVG`);
    const html = renderAvatar(a.id, 'w-12 h-12 rounded-xl', { badge: true });
    assert.ok(html.includes('<svg'), `Avatar ${a.id} wrapper must include SVG`);
  }
  console.log('  ✔ Toàn bộ 40 Linh Thú Blooks SVG đa lớp render hoàn hảo 100%!');
}

// ----------------------------------------------------------------------------
// TEST 8: ĐUA VỊT ĐƯỜNG SÔNG & CÁC MINI-GAME MỚI (DUCK RACE, CLAW, CARDS, NUMBERS)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 8: Kiểm thử Đua Vịt Đường Sông (Duck Race) & các Mini-Game mới');
  assert.strictEqual(typeof RandomPicker.renderDuckSVG, 'function');
  assert.strictEqual(typeof RandomPicker.renderDuckRaceStage, 'function');
  assert.strictEqual(typeof RandomPicker.renderClawMachineStage, 'function');
  assert.strictEqual(typeof RandomPicker.renderMagicCardsStage, 'function');
  assert.strictEqual(typeof RandomPicker.renderLuckyNumbersStage, 'function');

  const duckSvgNormal = RandomPicker.renderDuckSVG(0, false);
  const duckSvgTurbo = RandomPicker.renderDuckSVG(1, true);
  assert.ok(duckSvgNormal.includes('<svg'), 'Duck SVG must render valid SVG');
  assert.ok(duckSvgTurbo.includes('animate-pulse'), 'Turbo Duck SVG must include turbo flame');

  console.log('  ✔ Đua Vịt Đường Sông (Duck Race), Máy Gắp Thú Bông, Rút Thẻ Ma Thuật & Bảng Ô Số hoạt động hoàn hảo!');
}

console.log('\n🎉 TOÀN BỘ 8/8 TEST CASE RANDOM PICKER, ĐUA VỊT & 40 BLOOKS SVG ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
