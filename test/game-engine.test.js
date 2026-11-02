/**
 * Integration Test Suite for Pluggable Game Engine & Strategy Adapters
 * Run with: node test/game-engine.test.js
 */

import assert from 'node:assert';
import {
  GameSessionManager,
  BaseGameModeHandler,
  ResourceQuestHandler,
  SpeedRaceHandler,
  BossRaidHandler,
  ClassicKahootHandler
} from '../js/game-engine.js';

console.log('🧪 BẮT ĐẦU KIỂM THỬ HỆ THỐNG GAME ENGINE PLUGGABLE ARCHITECTURE...\n');

// Mock ngân hàng câu hỏi chuẩn GDPT 2018 (hoàn toàn độc lập với game state)
const mockQuizQuestions = [
  {
    id: 'q1',
    question: 'Thiết bị nào sau đây là thiết bị vào của máy tính?',
    options: ['Bàn phím', 'Màn hình', 'Máy in', 'Loa'],
    answer: 0, // 'A'
    topic: 'Chủ đề 1: Máy tính và xã hội tri thức'
  },
  {
    id: 'q2',
    question: 'Hệ điều hành nào sau đây là mã nguồn mở?',
    options: ['Windows', 'macOS', 'Linux', 'iOS'],
    answer: 2, // 'C'
    topic: 'Chủ đề 2: Mạng máy tính và Internet'
  },
  {
    id: 'q3',
    question: 'Phát biểu nào sau đây đúng về cơ sở dữ liệu quan hệ?',
    options: ['Dữ liệu lưu dưới dạng bảng', 'Không có khóa chính', 'Không thể liên kết', 'Chỉ chứa số'],
    answer: 0, // 'A'
    topic: 'Chủ đề 4: Ứng dụng tin học'
  }
];

// ----------------------------------------------------------------------------
// TEST 1: Khởi tạo Session chuẩn & Tách biệt Data Layer
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 1: Khởi tạo Normalized Session State & Decoupled Questions');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '888999',
    gameMode: 'resource_quest',
    questions: mockQuizQuestions,
    timerSec: 20,
    goalCap: 500,
    title: 'Đấu Trường Vàng Khối 12'
  });

  assert.strictEqual(session.id, '888999');
  assert.strictEqual(session.gameMode, 'resource_quest');
  assert.strictEqual(session.status, 'lobby');
  assert.strictEqual(session.totalQuestions, 3);
  assert.strictEqual(session.questions.length, 3);
  assert.strictEqual(session.questions[0].answer, 0);
  assert.strictEqual(session.settings.goalCap, 500);
  console.log('  ✔ SessionState khởi tạo đúng cấu trúc chuẩn normalized!');
}

// ----------------------------------------------------------------------------
// TEST 2: Thêm Người Chơi Universal State + Mode-Specific State
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 2: Join Player - Universal & Mode-Specific State Isolation');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '123456',
    gameMode: 'resource_quest',
    questions: mockQuizQuestions
  });

  const p1 = engine.joinPlayer(session, { id: 'user_khoi', name: 'Minh Khôi', blookId: 'bot' });
  const p2 = engine.joinPlayer(session, { id: 'user_an', name: 'Bảo An', blookId: 'dragon' });

  assert.strictEqual(p1.id, 'user_khoi');
  assert.strictEqual(p1.score, 0);
  assert.strictEqual(p1.streak, 0);
  assert.strictEqual(p1.metadata.gold, 0);
  assert.strictEqual(p1.metadata.shields, 0);
  assert.strictEqual(Array.isArray(p1.inventory), true);

  assert.strictEqual(Object.keys(session.players).length, 2);
  console.log('  ✔ Người chơi được khởi tạo với universal state và metadata riêng biệt!');
}

// ----------------------------------------------------------------------------
// TEST 3: Authoritative SUBMIT_ANSWER (Server/Host Validation)
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 3: Authoritative Answer Evaluation (Chống gian lận Client)');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '123456',
    gameMode: 'resource_quest',
    questions: mockQuizQuestions
  });
  engine.joinPlayer(session, { id: 'p1', name: 'Học sinh 1' });
  session.status = 'playing';
  session.currentQuestionIndex = 0; // Câu 1: đáp án đúng là 0 ('A')

  // Trả lời SAI (chọn 1)
  const resultWrong = engine.submitAnswer(session, 'p1', 1, 1500);
  assert.strictEqual(resultWrong.isCorrect, false);
  assert.strictEqual(session.players['p1'].streak, 0);
  assert.strictEqual(session.players['p1'].correctCount, 0);
  assert.strictEqual(resultWrong.rewardPayload.rewardOptions.length, 0);

  // Trả lời ĐÚNG (chọn 0)
  const resultCorrect = engine.submitAnswer(session, 'p1', 0, 1200);
  assert.strictEqual(resultCorrect.isCorrect, true);
  assert.strictEqual(session.players['p1'].streak, 1);
  assert.strictEqual(session.players['p1'].correctCount, 1);
  assert.strictEqual(session.players['p1'].score > 0, true);
  // Resource Quest phải sinh đúng 3 rương bí mật
  assert.strictEqual(resultCorrect.rewardPayload.rewardOptions.length, 3);
  console.log('  ✔ Authoritative Answer Evaluation hoạt động chính xác tuyệt đối!');
}

// ----------------------------------------------------------------------------
// TEST 4: TRIGGER_ACTION - Mở Rương & Cướp Vàng Nguyên Tử (Atomic Steal)
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 4: Atomic Transactions - Mở Rương, Cướp Vàng & Khiên Thần');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '777888',
    gameMode: 'resource_quest',
    questions: mockQuizQuestions
  });
  const thief = engine.joinPlayer(session, { id: 'thief_id', name: 'Kẻ Cướp Vàng' });
  const victim = engine.joinPlayer(session, { id: 'victim_id', name: 'Nạn Nhân' });

  // Gán vàng khởi đầu cho victim
  victim.metadata.gold = 100;
  thief.metadata.gold = 20;

  // 4a. Cướp vàng thành công khi victim không có khiên
  const stealAction = {
    type: 'STEAL_EXECUTE',
    playerId: thief.id,
    targetPlayerId: victim.id,
    payload: { rate: 0.2 } // 20%
  };
  const stealResult = engine.triggerAction(session, stealAction);

  assert.strictEqual(stealResult.type, 'STEAL_SUCCESS');
  assert.strictEqual(stealResult.stolenAmount, 20); // 20% của 100 = 20
  assert.strictEqual(victim.metadata.gold, 80); // 100 - 20 = 80
  assert.strictEqual(thief.metadata.gold, 40); // 20 + 20 = 40
  console.log('  ✔ Cướp vàng nguyên tử (Atomic Steal) thành công: -20 và +20!');

  // 4b. Victim kích hoạt Khiên Thần
  victim.metadata.shields = 1;
  const blockedAction = {
    type: 'STEAL_EXECUTE',
    playerId: thief.id,
    targetPlayerId: victim.id,
    payload: { rate: 0.2 }
  };
  const blockedResult = engine.triggerAction(session, blockedAction);

  assert.strictEqual(blockedResult.type, 'STEAL_BLOCKED');
  assert.strictEqual(victim.metadata.shields, 0); // Khiên đã bị tiêu hao 1 lần
  assert.strictEqual(victim.metadata.gold, 80); // Vàng không bị mất!
  assert.strictEqual(thief.metadata.gold, 40); // Tặc không nhận được vàng!
  console.log('  ✔ Khiên Thần (Shield Defense) chặn thành công cướp vàng và trừ đúng 1 khiên!');
}

// ----------------------------------------------------------------------------
// TEST 5: Speed Race Mode (Combo Streak & Power-ups)
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 5: Speed Race Mode - Time-decay & Power-ups');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '555666',
    gameMode: 'speed_race',
    questions: mockQuizQuestions
  });
  const p1 = engine.joinPlayer(session, { id: 'racer_1', name: 'Tay Đua 1' });
  const p2 = engine.joinPlayer(session, { id: 'racer_2', name: 'Tay Đua 2' });
  session.status = 'playing';
  session.currentQuestionIndex = 0;

  // Trả lời siêu tốc (500ms)
  const resFast = engine.submitAnswer(session, 'racer_1', 0, 500);
  assert.strictEqual(resFast.isCorrect, true);
  assert.strictEqual(p1.score >= 900, true);

  // Kích hoạt Power-up Đóng Băng
  p1.inventory.push({ id: 'freeze_item', type: 'freeze', name: 'Đóng Băng' });
  const freezeAction = {
    type: 'USE_POWERUP',
    playerId: p1.id,
    targetPlayerId: p2.id,
    payload: { powerupType: 'freeze' }
  };
  const freezeResult = engine.triggerAction(session, freezeAction);

  assert.strictEqual(freezeResult.type, 'PLAYER_FROZEN');
  assert.strictEqual(p2.metadata.isFrozen, true);
  assert.strictEqual(p1.inventory.length, 0); // Item đã được tiêu thụ
  console.log('  ✔ Speed Race: Time decay và Power-up đóng băng đối thủ hoạt động xuất sắc!');
}

// ----------------------------------------------------------------------------
// TEST 6: Pluggability - Thêm Game Mode Tùy Biến (Custom Game Mode Adapter)
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 6: Pluggability - Đăng ký GameModeHandler mới mà không sửa câu hỏi');
  class CryptoMiningModeHandler extends BaseGameModeHandler {
    constructor() {
      super('crypto_mining', 'Khai Thác Tiền Ảo TinHocCoin', 'Đào coin theo block');
    }
    initPlayerState(id) {
      return { metadata: { hashes: 0, coins: 0 }, inventory: [] };
    }
    onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
      const p = currentState.players[playerId];
      if (isCorrect) {
        p.metadata.hashes += 100;
        p.metadata.coins += 1;
      }
      return { playerId, isCorrect, baseScore: p.metadata.coins * 50, multiplier: 1 };
    }
    rankPlayers(players) {
      return Object.values(players).sort((a, b) => (b.metadata?.coins || 0) - (a.metadata?.coins || 0));
    }
  }

  const engine = new GameSessionManager();
  engine.registerModeHandler(new CryptoMiningModeHandler());

  const session = engine.createSession({
    pin: '999111',
    gameMode: 'crypto_mining',
    questions: mockQuizQuestions
  });

  const miner = engine.joinPlayer(session, { id: 'm1', name: 'Thợ Đào' });
  assert.strictEqual(miner.metadata.hashes, 0);
  assert.strictEqual(miner.metadata.coins, 0);

  session.status = 'playing';
  session.currentQuestionIndex = 0;
  engine.submitAnswer(session, 'm1', 0, 1000);

  assert.strictEqual(miner.metadata.hashes, 100);
  assert.strictEqual(miner.metadata.coins, 1);
  console.log('  ✔ Pluggable Adapter Pattern hoạt động trơn tru: Tích hợp chế độ game mới 100% độc lập!');
}

// ----------------------------------------------------------------------------
// TEST 7: Lightweight Delta Sync & Leaderboard
// ----------------------------------------------------------------------------
{
  console.log('▶ TEST 7: SYNC_STATE Lightweight Delta Generation');
  const engine = new GameSessionManager();
  const session = engine.createSession({
    pin: '444333',
    gameMode: 'resource_quest',
    questions: mockQuizQuestions
  });
  const p1 = engine.joinPlayer(session, { id: 'p1', name: 'Học sinh A' });
  const p2 = engine.joinPlayer(session, { id: 'p2', name: 'Học sinh B' });

  p1.metadata.gold = 350;
  p2.metadata.gold = 520;

  const syncData = engine.syncState(session);
  assert.strictEqual(syncData.id, '444333');
  assert.strictEqual(syncData.leaderboard.length, 2);
  // Leaderboard phải được sắp xếp theo vàng (Resource Quest rule)
  assert.strictEqual(syncData.leaderboard[0].id, 'p2'); // 520 vàng đứng top 1
  assert.strictEqual(syncData.leaderboard[1].id, 'p1'); // 350 vàng đứng top 2
  // Không bao gồm mảng questions nặng hàng megabyte trong broadcast sync
  assert.strictEqual(syncData.questions, undefined);
  console.log('  ✔ Lightweight Sync Data tối ưu hóa mạng hoàn chỉnh, không rò rỉ question bank!');
}

console.log('\n🎉 TẤT CẢ 7/7 TEST CASE ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
