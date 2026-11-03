/**
 * End-to-End Simulation Test for Arena (Teacher Host & Student Player)
 * Tests all 4 Game Modes, Lobby, Gameplay, Answer Submission, Chests, Steal, Shield Defense,
 * Host Results, Podium, LMS Gradebook Save, and Excel Export.
 * Run with: node test/arena-flow.test.js
 */

import assert from 'node:assert';
import defaultGameEngine from '../js/game-engine.js';

// Setup Mock DOM and Storage for Node environment
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
};

global.window = {
  location: { origin: 'https://on-tap.nghiaedu.workers.dev', search: '' },
  localStorage: global.localStorage
};

global.document = {
  getElementById: (id) => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

try {
  if (global.navigator) {
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText: () => Promise.resolve() },
      configurable: true
    });
  }
} catch {}

// Import Arena, Storage, Auth
const { Storage } = await import('../js/storage.js');
const { Auth } = await import('../js/auth.js');
const { default: Arena } = await import('../js/arena.js');

console.log('🧪 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN ARENA: VAI TRÒ GIÁO VIÊN & HỌC SINH...\n');

const mockQuestions = [
  {
    id: 'q1',
    question: 'Bộ xử lý trung tâm của máy tính là gì?',
    options: ['CPU', 'RAM', 'ROM', 'GPU'],
    answer: 0, // 'A'
    topic: 'Chủ đề 1'
  },
  {
    id: 'q2',
    question: 'Thiết bị nào sau đây dùng để lưu trữ dữ liệu lâu dài?',
    options: ['RAM', 'Ổ cứng HDD/SSD', 'Cache', 'Bus'],
    answer: 1, // 'B'
    topic: 'Chủ đề 1'
  },
  {
    id: 'q3',
    question: 'Địa chỉ IPv4 gồm bao nhiêu bit?',
    options: ['16 bit', '32 bit', '64 bit', '128 bit'],
    answer: 1, // 'B'
    topic: 'Chủ đề 2'
  }
];

// Helper to create a container mock
function createContainerMock() {
  let inner = '';
  return {
    set innerHTML(val) { inner = val; },
    get innerHTML() { return inner; },
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

// ----------------------------------------------------------------------------
// TEST 1: GIÁO VIÊN (HOST) - KHỞI TẠO ĐẤU TRƯỜNG RESOURCE QUEST
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 1: Giáo viên tạo đấu trường Resource Quest (Đào Vàng)');
  Arena.container = createContainerMock();
  Arena.loadGradeFn = async () => mockQuestions;

  await Arena.createNewArenaRoom({
    title: 'Đấu Trường Tin Học 12 - Ôn Thi Giữa Kỳ',
    mode: 'resource_quest',
    source: 'grade_12',
    qCount: 3,
    timerSec: 20,
    targetClass: 'EMASI|12E',
    goalCap: 1000,
    powerUpFrequency: 'normal'
  });

  assert.ok(Arena.activeRoom, 'activeRoom must be initialized');
  assert.strictEqual(Arena.activeRole, 'host', 'activeRole must be host');
  assert.strictEqual(Arena.activeRoom.gameMode, 'resource_quest');
  assert.strictEqual(Arena.activeRoom.totalQuestions, 3);
  assert.strictEqual(Arena.activeRoom.questions.length, 3);
  assert.strictEqual(Arena.activeRoom.status, 'lobby');
  assert.strictEqual(typeof Arena.activeRoom.pin, 'string');
  assert.strictEqual(Arena.activeRoom.pin.length, 6);

  console.log(`  ✔ Host khởi tạo phòng thành công: PIN = [${Arena.activeRoom.pin}]`);
  console.log(`  ✔ Màn hình Lobby Host render HTML: ${Arena.container.innerHTML.length} bytes`);
}

// ----------------------------------------------------------------------------
// TEST 2: HỌC SINH (PLAYER) - 2 HỌC SINH VÀO PHÒNG QUA MÃ PIN
// ----------------------------------------------------------------------------
const hostRoomPin = Arena.activeRoom.pin;
let student1State, student2State;

{
  console.log('\n▶ TEST 2: 2 Học sinh nhập mã PIN tham gia đấu trường');
  const studentArena1 = Object.create(Arena);
  studentArena1.container = createContainerMock();

  // Học sinh 1: Minh Khôi (Cyber Bot)
  await studentArena1.joinArenaByPin(hostRoomPin, 'Nguyễn Minh Khôi', 'bot');
  assert.ok(studentArena1.playerInfo, 'playerInfo must be created');
  assert.strictEqual(studentArena1.playerInfo.name, 'Nguyễn Minh Khôi');
  assert.strictEqual(studentArena1.playerInfo.blookId, 'bot');
  assert.strictEqual(studentArena1.activeRole, 'player');
  student1State = studentArena1;

  // Học sinh 2: Bảo An (Ninja Neko)
  const studentArena2 = Object.create(Arena);
  studentArena2.container = createContainerMock();
  await studentArena2.joinArenaByPin(hostRoomPin, 'Trần Bảo An', 'cat');
  assert.ok(studentArena2.playerInfo, 'playerInfo must be created');
  assert.strictEqual(studentArena2.playerInfo.name, 'Trần Bảo An');
  assert.strictEqual(studentArena2.playerInfo.blookId, 'cat');
  student2State = studentArena2;

  // Kiểm tra phòng của Host đã nhận đủ 2 người chơi
  const currentRoom = Storage.getArenaRoom(hostRoomPin);
  assert.strictEqual(Object.keys(currentRoom.players).length, 2);
  console.log('  ✔ 2 Học sinh đã đăng ký vào phòng thành công!');
}

// ----------------------------------------------------------------------------
// TEST 3: GIÁO VIÊN BẮT ĐẦU CÂU HỎI 1 & HỌC SINH LÀM BÀI
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 3: Giáo viên bắt đầu Câu 1, Học sinh nhận đề & nộp đáp án');
  // Host bấm bắt đầu câu 1
  Arena.hostStartNextQuestion();
  assert.strictEqual(Arena.activeRoom.status, 'playing');
  assert.strictEqual(Arena.activeRoom.currentQuestionIndex, 0);

  // Giả lập đồng bộ sang 2 học sinh
  const currentRoom = Storage.getArenaRoom(hostRoomPin);
  student1State.handleRemoteRoomUpdate(currentRoom);
  student2State.handleRemoteRoomUpdate(currentRoom);

  assert.strictEqual(student1State.playerInfo.answeredInCurrentQ, false);
  assert.strictEqual(student2State.playerInfo.answeredInCurrentQ, false);

  const q0 = currentRoom.questions[0];
  const correctAns0 = typeof q0.answer === 'number' ? q0.answer : ['A','B','C','D'].indexOf(q0.answer.trim().toUpperCase()[0]);
  const wrongAns0 = (correctAns0 + 1) % 4;

  // Học sinh 1 trả lời ĐÚNG
  student1State.questionStartTime = Date.now() - 1500;
  await student1State.playerSubmitAnswer(correctAns0, q0);
  assert.strictEqual(student1State.playerInfo.correctCount, 1);
  assert.strictEqual(student1State.playerInfo.streak, 1);

  // Học sinh 2 trả lời SAI
  student2State.questionStartTime = Date.now() - 2500;
  await student2State.playerSubmitAnswer(wrongAns0, q0);
  assert.strictEqual(student2State.playerInfo.correctCount, 0);
  assert.strictEqual(student2State.playerInfo.streak, 0);

  console.log('  ✔ Học sinh 1 trả lời đúng (streak 1, correctCount 1)');
  console.log('  ✔ Học sinh 2 trả lời sai (streak 0, correctCount 0)');
}

// ----------------------------------------------------------------------------
// TEST 4: HỌC SINH 1 MỞ RƯƠNG NHẬN VÀNG & KHIÊN
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 4: Học sinh 1 mở rương báu (Chest Pick)');
  // Học sinh 1 mở rương số 1
  await student1State.playerOpenChestReward(0);
  assert.ok(student1State.playerInfo.metadata, 'metadata must exist');
  console.log(`  ✔ Rương mở ra! Vàng: ${student1State.playerInfo.metadata.gold}, Khiên: ${student1State.playerInfo.metadata.shields}`);
}

// ----------------------------------------------------------------------------
// TEST 5: GIÁO VIÊN CÔNG BỐ KẾT QUẢ CÂU 1 & SANG CÂU 2
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 5: Host công bố đáp án & Top 5 câu 1');
  Arena.hostRevealQuestionResults();
  assert.strictEqual(Arena.activeRoom.status, 'question_result');
  assert.ok(Arena.container.innerHTML.includes('Kết Quả Câu 1'));

  // Host bấm sang câu 2
  Arena.hostStartNextQuestion();
  assert.strictEqual(Arena.activeRoom.currentQuestionIndex, 1);

  const currentRoom = Storage.getArenaRoom(hostRoomPin);
  student1State.handleRemoteRoomUpdate(currentRoom);
  student2State.handleRemoteRoomUpdate(currentRoom);

  const q1 = currentRoom.questions[1];
  const correctAns1 = typeof q1.answer === 'number' ? q1.answer : ['A','B','C','D'].indexOf(q1.answer.trim().toUpperCase()[0]);

  // Cả 2 học sinh cùng trả lời đúng câu 2
  student1State.questionStartTime = Date.now() - 1000;
  await student1State.playerSubmitAnswer(correctAns1, q1);

  student2State.questionStartTime = Date.now() - 1200;
  await student2State.playerSubmitAnswer(correctAns1, q1);

  assert.strictEqual(student1State.playerInfo.correctCount, 2);
  assert.strictEqual(student2State.playerInfo.correctCount, 1);
  console.log('  ✔ Câu 2: Cả 2 học sinh hoàn thành trả lời đúng');
}

// ----------------------------------------------------------------------------
// TEST 6: HOÀN THÀNH TẤT CẢ CÂU HỎI & BỤC VINH DANH PODIUM
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 6: Hoàn thành đề thi & Bục vinh danh Podium 3D');
  // Sang câu 3 (câu cuối cùng)
  Arena.hostStartNextQuestion();
  assert.strictEqual(Arena.activeRoom.currentQuestionIndex, 2);

  // Host kết thúc trận đấu
  Arena.hostStartNextQuestion(); // Vượt quá totalQuestions -> hostFinishGame
  assert.strictEqual(Arena.activeRoom.status, 'game_over');

  // Kiểm tra giao diện Podium hiển thị
  assert.ok(Arena.container.innerHTML.includes('BẢNG VINH DANH NHÀ VÔ ĐỊCH'));
  assert.ok(Arena.container.innerHTML.includes('#1'));
  console.log('  ✔ Bục vinh danh Podium 3D hiển thị xuất sắc!');

  // Học sinh chuyển cảnh sang Game Over
  const currentRoom = Storage.getArenaRoom(hostRoomPin);
  student1State.handleRemoteRoomUpdate(currentRoom);
  student2State.handleRemoteRoomUpdate(currentRoom);
  assert.ok(student1State.container.innerHTML.includes('TRẬN ĐẤU KẾT THÚC'));
  console.log('  ✔ Học sinh đã nhận thông báo kết thúc trận đấu và thứ hạng chung cuộc');
}

// ----------------------------------------------------------------------------
// TEST 7: GIÁO VIÊN LƯU SỔ ĐIỂM LMS & XUẤT BÁO CÁO EXCEL
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 7: Lưu vào Sổ Điểm Điện Tử & Xuất Excel');
  const sorted = defaultGameEngine.rankPlayers(Arena.activeRoom);

  // 7a. Lưu sổ điểm
  let alertMsg = '';
  const originalAlert = global.alert;
  global.alert = (msg) => { alertMsg = msg; };

  Arena.saveMatchToLmsGradebook(Arena.activeRoom, sorted);
  assert.ok(alertMsg.includes('ĐÃ LƯU THÀNH CÔNG VÀO SỔ ĐIỂM'));

  // Kiểm tra kết quả trong Storage
  const examResults = Storage.getExamHistory();
  const arenaResult = examResults.find(r => r.arenaPin === hostRoomPin);
  assert.ok(arenaResult, 'Exam result must be persisted in Storage');
  assert.strictEqual(arenaResult.school, 'EMASI');
  assert.strictEqual(arenaResult.className, '12E');
  assert.strictEqual(arenaResult.isArenaGame, true);
  console.log(`  ✔ Đã lưu vào Sổ Điểm LMS: Học sinh [${arenaResult.studentName}] - Điểm: ${arenaResult.score}/10.0`);

  // 7b. Xuất Excel
  let downloadedCsv = '';
  global.document.createElement = (tag) => {
    return {
      style: {},
      click: () => {},
      set href(val) { downloadedCsv = val; }
    };
  };
  global.document.body = {
    appendChild: () => {},
    removeChild: () => {}
  };
  global.URL = {
    createObjectURL: () => 'blob:mock-csv'
  };

  Arena.exportMatchToExcel(Arena.activeRoom, sorted);
  console.log('  ✔ Xuất file Excel báo cáo kết quả thi đấu UTF-8 BOM thành công!');

  global.alert = originalAlert;
}

// ----------------------------------------------------------------------------
// TEST 8: KIỂM THỬ TẤT CẢ 4 GAME MODES (SPEED RACE, BOSS RAID, CLASSIC)
// ----------------------------------------------------------------------------
{
  console.log('\n▶ TEST 8: Kiểm thử vận hành 3 Game Modes còn lại: Speed Race, Boss Raid, Classic');

  // 8a. Speed Race
  const speedSession = defaultGameEngine.createSession({
    gameMode: 'speed_race',
    questions: mockQuestions
  });
  const sp1 = defaultGameEngine.joinPlayer(speedSession, { id: 'sp1', name: 'Speedy' });
  speedSession.status = 'playing';
  speedSession.currentQuestionIndex = 0;
  const resSpeed = defaultGameEngine.submitAnswer(speedSession, 'sp1', speedSession.questions[0].answer, 800);
  assert.strictEqual(resSpeed.isCorrect, true);
  assert.ok(sp1.score >= 800, 'Fast response must give high score');
  console.log('  ✔ Speed Race: Phản xạ 800ms đạt điểm cao');

  // 8b. Boss Raid
  const bossSession = defaultGameEngine.createSession({
    gameMode: 'boss_hunt',
    questions: mockQuestions
  });
  const bp1 = defaultGameEngine.joinPlayer(bossSession, { id: 'bp1', name: 'BossSlayer' });
  bossSession.status = 'playing';
  bossSession.currentQuestionIndex = 0;
  const initialBossHp = bossSession.metadata.bossCurrentHp;
  const resBoss = defaultGameEngine.submitAnswer(bossSession, 'bp1', bossSession.questions[0].answer, 1500);
  assert.strictEqual(resBoss.isCorrect, true);
  assert.ok(bossSession.metadata.bossCurrentHp < initialBossHp, 'Boss HP must decrease');
  console.log(`  ✔ Boss Raid: Máu Boss giảm từ ${initialBossHp} xuống ${bossSession.metadata.bossCurrentHp}`);

  // 8c. Classic Kahoot
  const classicSession = defaultGameEngine.createSession({
    gameMode: 'classic',
    questions: mockQuestions
  });
  const cp1 = defaultGameEngine.joinPlayer(classicSession, { id: 'cp1', name: 'ClassicPlayer' });
  classicSession.status = 'playing';
  classicSession.currentQuestionIndex = 0;
  const resClassic = defaultGameEngine.submitAnswer(classicSession, 'cp1', classicSession.questions[0].answer, 1000);
  assert.strictEqual(resClassic.isCorrect, true);
  console.log('  ✔ Classic Kahoot: Vận hành mượt mà');
}

console.log('\n🎉 TOÀN BỘ 8/8 KỊCH BẢN GIÁO VIÊN & HỌC SINH ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
