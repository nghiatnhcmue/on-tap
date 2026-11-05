/**
 * TinHocHub - Decoupled Game Engine & Strategy Adapters
 * Architecture: Pluggable Game Modes over Decoupled Question Sets
 * Strictly separates educational data (question banks/sessions) from gamification layers.
 */

// ============================================================================
// 1. BASE GAME MODE HANDLER (ABSTRACT ADAPTER)
// ============================================================================

export class BaseGameModeHandler {
  constructor(modeId, modeName, description = '') {
    this.modeId = modeId;
    this.modeName = modeName;
    this.description = description;
  }

  /**
   * Initializes mode-specific player state
   * @param {string} playerId
   * @returns {{ metadata: Record<string, any>, inventory: Array<any> }}
   */
  initPlayerState(playerId) {
    return {
      metadata: {},
      inventory: []
    };
  }

  /**
   * Hook called after authoritative answer evaluation by host/server
   * @param {string} playerId
   * @param {boolean} isCorrect
   * @param {number} responseTime
   * @param {object} currentState
   * @returns {object} RewardPayload
   */
  onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
    const baseScore = isCorrect ? 100 : 0;
    return {
      playerId,
      isCorrect,
      baseScore,
      multiplier: 1,
      rewardOptions: []
    };
  }

  /**
   * Handles mode-specific mechanics atomically (e.g. chests, steals, power-ups)
   * @param {object} action
   * @param {object} currentState
   * @returns {object} SessionDeltaUpdate
   */
  handlePlayerAction(action, currentState) {
    return {
      type: action.type,
      sessionId: currentState.id,
      playerDeltas: {},
      timestamp: Date.now()
    };
  }

  /**
   * Checks if session end condition has been reached
   * @param {object} currentState
   * @returns {boolean}
   */
  checkEndCondition(currentState) {
    if (!currentState.questions || currentState.questions.length === 0) return true;
    return currentState.currentQuestionIndex >= currentState.questions.length - 1;
  }

  /**
   * Default ranking: by universal score descending
   * @param {Record<string, object>} players
   * @returns {Array<object>}
   */
  rankPlayers(players) {
    return Object.values(players || {}).sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}

// ============================================================================
// 2. RESOURCE QUEST HANDLER (GOLD QUEST STYLE: CHESTS, MULTIPLIERS, SHIELDS, STEALS)
// ============================================================================

export class ResourceQuestHandler extends BaseGameModeHandler {
  constructor() {
    super(
      'resource_quest',
      'Đào Vàng & Rương Báu (Resource Quest)',
      'Trả lời đúng mở 1 trong 3 rương báu bí mật nhận Vàng, Nhân đôi x2, Khiên bảo vệ hoặc Cướp vàng'
    );
  }

  initPlayerState(playerId) {
    return {
      metadata: {
        gold: 0,
        shields: 0,
        multiplier: 1,
        chestsOpened: 0,
        pendingChests: []
      },
      inventory: []
    };
  }

  onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
    const player = currentState.players[playerId];
    if (!player) {
      return { playerId, isCorrect, baseScore: 0, multiplier: 1, rewardOptions: [] };
    }

    if (!isCorrect) {
      // Sai câu hỏi -> reset combo
      return {
        playerId,
        isCorrect: false,
        baseScore: 0,
        multiplier: 1,
        rewardOptions: []
      };
    }

    // Đúng câu hỏi -> tính điểm phổ thông và tạo ngẫu nhiên 3 phương án rương
    const streak = player.streak || 1;
    const baseScore = Math.round(100 * (1 + (streak - 1) * 0.1));

    // Bộ khả năng phần thưởng rương
    const possibleRewards = [
      { id: 'gold_25', type: 'resource', label: '+25 Vàng 🪙', value: 25, icon: 'fa-coins' },
      { id: 'gold_50', type: 'resource', label: '+50 Vàng 🪙', value: 50, icon: 'fa-coins' },
      { id: 'gold_100', type: 'resource', label: '+100 Vàng Jackpot! 💰', value: 100, icon: 'fa-sack-dollar' },
      { id: 'gold_200', type: 'resource', label: '+200 Vàng Đại Thắng! 👑', value: 200, icon: 'fa-gem' },
      { id: 'mult_2x', type: 'multiplier', label: 'Nhân Đôi x2 Toàn Bộ Vàng! 🔥', value: 2, icon: 'fa-fire-flame-curved' },
      { id: 'shield_up', type: 'shield', label: '+1 Khiên Thần Bảo Hộ 🛡️', value: 1, icon: 'fa-shield-halved' },
      { id: 'steal_20', type: 'steal', label: 'Cướp 20% Vàng Của Bạn Khác! ⚡', value: 0.2, icon: 'fa-bolt' }
    ];

    // Xáo trộn chọn 3 phần thưởng cho 3 rương
    const shuffled = [...possibleRewards].sort(() => 0.5 - Math.random());
    const rewardOptions = shuffled.slice(0, 3);

    // Lưu vào metadata của người chơi để server-authoritative xác thực khi pick
    player.metadata.pendingChests = rewardOptions;

    return {
      playerId,
      isCorrect: true,
      baseScore,
      multiplier: player.metadata.multiplier || 1,
      rewardOptions,
      metadata: { pendingChestsCount: rewardOptions.length }
    };
  }

  handlePlayerAction(action, currentState) {
    const { type, playerId, targetPlayerId, payload } = action;
    const player = currentState.players[playerId];
    if (!player) {
      return {
        type,
        sessionId: currentState.id,
        playerDeltas: {},
        broadcastMessage: 'Người chơi không tồn tại trong phiên.',
        timestamp: Date.now()
      };
    }

    // 1. HÀNH ĐỘNG MỞ RƯƠNG (CHEST_PICK)
    if (type === 'CHEST_PICK') {
      const chestIndex = typeof payload?.chestIndex === 'number' ? payload.chestIndex : 0;
      const options = player.metadata.pendingChests || [];
      const selectedReward = options[chestIndex] || options[0] || {
        id: 'gold_25',
        type: 'resource',
        label: '+25 Vàng 🪙',
        value: 25
      };

      // Xóa pending chests để chống exploit mở lại rương
      player.metadata.pendingChests = [];
      player.metadata.chestsOpened = (player.metadata.chestsOpened || 0) + 1;

      let scoreDelta = 0;
      let goldDelta = 0;
      let shieldsDelta = 0;
      let broadcastMessage = '';

      if (selectedReward.type === 'resource') {
        goldDelta = selectedReward.value;
        player.metadata.gold = (player.metadata.gold || 0) + goldDelta;
        scoreDelta = goldDelta * 10;
        player.score = (player.score || 0) + scoreDelta;
        broadcastMessage = `[${player.name}] đã mở rương nhận được ${selectedReward.label}!`;
      } else if (selectedReward.type === 'multiplier') {
        const currentGold = player.metadata.gold || 10;
        goldDelta = currentGold; // Nhân đôi tức cộng thêm đúng lượng hiện có
        player.metadata.gold = currentGold * 2;
        scoreDelta = goldDelta * 10;
        player.score = (player.score || 0) + scoreDelta;
        broadcastMessage = `[${player.name}] kích hoạt ${selectedReward.label}!`;
      } else if (selectedReward.type === 'shield') {
        shieldsDelta = 1;
        player.metadata.shields = Math.min(3, (player.metadata.shields || 0) + shieldsDelta);
        broadcastMessage = `[${player.name}] nhận được Khiên Thần bảo hộ 🛡️!`;
      } else if (selectedReward.type === 'steal') {
        // Cho phép cướp vàng -> cần tiếp tục chọn target
        player.metadata.canSteal = true;
        player.metadata.stealRate = selectedReward.value || 0.2;
        broadcastMessage = `[${player.name}] mở được quyền Năng Cướp Vàng ⚡!`;
      }

      return {
        type: 'CHEST_OPENED',
        sessionId: currentState.id,
        playerDeltas: {
          [playerId]: {
            playerId,
            scoreDelta,
            metadataDelta: {
              gold: player.metadata.gold,
              shields: player.metadata.shields,
              chestsOpened: player.metadata.chestsOpened,
              canSteal: !!player.metadata.canSteal
            }
          }
        },
        reward: selectedReward,
        broadcastMessage,
        timestamp: Date.now()
      };
    }

    // 2. HÀNH ĐỘNG CƯỚP VÀNG TỪ ĐỐI THỦ (STEAL_EXECUTE) - GIAO DỊCH NGUYÊN TỬ (ATOMIC TRANSACTION)
    if (type === 'STEAL_EXECUTE') {
      const victim = currentState.players[targetPlayerId];
      if (!victim || victim.id === playerId) {
        return {
          type: 'STEAL_FAILED',
          sessionId: currentState.id,
          playerDeltas: {},
          broadcastMessage: 'Mục tiêu cướp vàng không hợp lệ!',
          timestamp: Date.now()
        };
      }

      player.metadata.canSteal = false;

      // KIỂM TRA KHIÊN BẢO VỆ CỦA NẠN NHÂN (SHIELD DEFENSE)
      const victimShields = victim.metadata.shields || 0;
      if (victimShields > 0) {
        // Trừ 1 khiên của nạn nhân, chặn hoàn toàn cướp vàng
        victim.metadata.shields = victimShields - 1;
        const blockedMsg = `🛡️ [${player.name}] cố cướp vàng của [${victim.name}], nhưng Khiên Thần của [${victim.name}] đã đánh bật thành công!`;
        return {
          type: 'STEAL_BLOCKED',
          sessionId: currentState.id,
          playerDeltas: {
            [victim.id]: {
              playerId: victim.id,
              metadataDelta: { shields: victim.metadata.shields }
            },
            [player.id]: {
              playerId: player.id,
              metadataDelta: { canSteal: false }
            }
          },
          broadcastMessage: blockedMsg,
          timestamp: Date.now()
        };
      }

      // THỰC HIỆN CƯỚP VÀNG ATOMIC
      const victimGold = victim.metadata.gold || 0;
      const rate = payload?.rate || player.metadata.stealRate || 0.2;
      const stolenAmount = victimGold > 0 ? Math.max(5, Math.floor(victimGold * rate)) : 0;

      victim.metadata.gold = Math.max(0, victimGold - stolenAmount);
      player.metadata.gold = (player.metadata.gold || 0) + stolenAmount;

      const successMsg = stolenAmount > 0
        ? `⚡ [${player.name}] đã cướp thành công ${stolenAmount} vàng từ [${victim.name}]!`
        : `⚡ [${player.name}] đã cố cướp vàng nhưng [${victim.name}] không có vàng!`;

      return {
        type: 'STEAL_SUCCESS',
        sessionId: currentState.id,
        playerDeltas: {
          [victim.id]: {
            playerId: victim.id,
            metadataDelta: { gold: victim.metadata.gold }
          },
          [player.id]: {
            playerId: player.id,
            metadataDelta: {
              gold: player.metadata.gold,
              canSteal: false
            }
          }
        },
        stolenAmount,
        victimId: victim.id,
        thiefId: player.id,
        broadcastMessage: successMsg,
        timestamp: Date.now()
      };
    }

    return super.handlePlayerAction(action, currentState);
  }

  checkEndCondition(currentState) {
    const goalCap = currentState.settings?.goalCap;
    if (goalCap && goalCap > 0) {
      const hasReachedGoal = Object.values(currentState.players || {}).some(
        p => (p.metadata?.gold || 0) >= goalCap
      );
      if (hasReachedGoal) return true;
    }
    return super.checkEndCondition(currentState);
  }

  rankPlayers(players) {
    return Object.values(players || {}).sort((a, b) => {
      const goldA = a.metadata?.gold || 0;
      const goldB = b.metadata?.gold || 0;
      if (goldB !== goldA) return goldB - goldA;
      if ((b.correctCount || 0) !== (a.correctCount || 0)) return (b.correctCount || 0) - (a.correctCount || 0);
      return (b.score || 0) - (a.score || 0);
    });
  }
}

// ============================================================================
// 3. SPEED RACE HANDLER (WAYGROUND STYLE: POWER-UPS, STREAK MULTIPLIER, FREEZE)
// ============================================================================

export class SpeedRaceHandler extends BaseGameModeHandler {
  constructor() {
    super(
      'speed_race',
      'Đua Top Tốc Độ & Power-ups (Speed Race)',
      'Phản xạ nhanh nhận điểm cao, tạo combo x1.5, x2, x3 và mở khóa thẻ trợ giúp Đóng băng, 50/50'
    );
  }

  initPlayerState(playerId) {
    return {
      metadata: {
        multiplier: 1,
        isFrozen: false,
        freezeExpiresAt: 0,
        speedBonus: 0
      },
      inventory: []
    };
  }

  onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
    const player = currentState.players[playerId];
    if (!player) {
      return { playerId, isCorrect, baseScore: 0, multiplier: 1, rewardOptions: [] };
    }

    if (!isCorrect) {
      return { playerId, isCorrect: false, baseScore: 0, multiplier: 1, rewardOptions: [] };
    }

    const timeLimitMs = (currentState.settings?.timeLimitPerQuestion || 20) * 1000;
    const clampedTime = Math.min(timeLimitMs, Math.max(500, responseTime || 3000));
    // Time decay formula: fast answers yield up to 1000 points, slow answers yield ~500 points
    const timeFactor = 1 - clampedTime / (2 * timeLimitMs);
    const streak = player.streak || 1;
    const comboMultiplier = Math.min(3.0, 1.0 + (streak - 1) * 0.25);

    const baseScore = Math.round(1000 * timeFactor * comboMultiplier);

    // Khi streak >= 3 -> Tặng power-up ngẫu nhiên vào inventory
    const grantedPowerups = [];
    if (streak % 3 === 0) {
      const powerupList = [
        { id: `freeze_${Date.now()}`, type: 'freeze', name: 'Băng Giá Làm Chậm', description: 'Đóng băng đối thủ 4 giây' },
        { id: `double_${Date.now()}`, type: 'double_points', name: 'Nhân Đôi Điểm Câu Tới', description: 'Nhân đôi 2x điểm câu tiếp theo' }
      ];
      const picked = powerupList[Math.floor(Math.random() * powerupList.length)];
      player.inventory.push(picked);
      grantedPowerups.push(picked);
    }

    return {
      playerId,
      isCorrect: true,
      baseScore,
      multiplier: comboMultiplier,
      rewardOptions: grantedPowerups.map(p => ({
        id: p.id,
        type: 'powerup',
        label: p.name,
        value: p.type
      }))
    };
  }

  handlePlayerAction(action, currentState) {
    const { type, playerId, targetPlayerId, payload } = action;
    const player = currentState.players[playerId];
    if (!player) return super.handlePlayerAction(action, currentState);

    if (type === 'USE_POWERUP') {
      const powerupType = payload?.powerupType;
      const itemIdx = player.inventory.findIndex(item => item.type === powerupType);
      if (itemIdx === -1) {
        return {
          type: 'POWERUP_FAILED',
          sessionId: currentState.id,
          playerDeltas: {},
          broadcastMessage: 'Người chơi không sở hữu power-up này!',
          timestamp: Date.now()
        };
      }

      // Xóa item khỏi inventory
      const usedItem = player.inventory.splice(itemIdx, 1)[0];

      if (powerupType === 'freeze' && targetPlayerId) {
        const victim = currentState.players[targetPlayerId];
        if (victim) {
          victim.metadata.isFrozen = true;
          victim.metadata.freezeExpiresAt = Date.now() + 4000;
          return {
            type: 'PLAYER_FROZEN',
            sessionId: currentState.id,
            playerDeltas: {
              [victim.id]: {
                playerId: victim.id,
                metadataDelta: {
                  isFrozen: true,
                  freezeExpiresAt: victim.metadata.freezeExpiresAt
                }
              },
              [player.id]: {
                playerId: player.id,
                inventoryDelta: { removed: [usedItem.id] }
              }
            },
            broadcastMessage: `❄️ [${player.name}] đã đóng băng [${victim.name}] trong 4 giây!`,
            timestamp: Date.now()
          };
        }
      }

      if (powerupType === 'double_points') {
        player.metadata.multiplier = 2.0;
        return {
          type: 'DOUBLE_POINTS_ACTIVATED',
          sessionId: currentState.id,
          playerDeltas: {
            [player.id]: {
              playerId: player.id,
              metadataDelta: { multiplier: 2.0 },
              inventoryDelta: { removed: [usedItem.id] }
            }
          },
          broadcastMessage: `🔥 [${player.name}] kích hoạt x2 Điểm câu hỏi tiếp theo!`,
          timestamp: Date.now()
        };
      }
    }

    return super.handlePlayerAction(action, currentState);
  }

  rankPlayers(players) {
    return Object.values(players || {}).sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}

// ============================================================================
// 4. BOSS RAID HANDLER (CO-OP COOPERATIVE MODE)
// ============================================================================

export class BossRaidHandler extends BaseGameModeHandler {
  constructor() {
    super(
      'boss_hunt',
      'Săn Boss Diệt Bug (Co-op Boss Raid)',
      'Cả lớp cùng hợp lực đánh bại Siêu Trùm Bug khổng lồ trước khi hết giờ'
    );
  }

  initPlayerState(playerId) {
    return {
      metadata: { totalDamageDealt: 0 },
      inventory: []
    };
  }

  onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
    const player = currentState.players[playerId];
    if (!player || !isCorrect) {
      return { playerId, isCorrect: false, baseScore: 0, multiplier: 1 };
    }

    const damage = Math.floor(120 + Math.random() * 80);
    player.metadata.totalDamageDealt = (player.metadata.totalDamageDealt || 0) + damage;

    if (currentState.metadata?.bossCurrentHp !== undefined) {
      currentState.metadata.bossCurrentHp = Math.max(0, currentState.metadata.bossCurrentHp - damage);
      if (currentState.metadata.bossCurrentHp === 0) {
        currentState.metadata.bossDefeated = true;
      }
    }

    return {
      playerId,
      isCorrect: true,
      baseScore: damage * 5,
      multiplier: 1,
      metadata: { damageDealt: damage, bossHp: currentState.metadata?.bossCurrentHp }
    };
  }

  checkEndCondition(currentState) {
    if (currentState.metadata?.bossCurrentHp !== undefined && currentState.metadata.bossCurrentHp <= 0) {
      return true;
    }
    return super.checkEndCondition(currentState);
  }

  rankPlayers(players) {
    return Object.values(players || {}).sort((a, b) => {
      const dmgA = a.metadata?.totalDamageDealt || 0;
      const dmgB = b.metadata?.totalDamageDealt || 0;
      if (dmgB !== dmgA) return dmgB - dmgA;
      return (b.score || 0) - (a.score || 0);
    });
  }
}

// ============================================================================
// 5. CLASSIC KAHOOT HANDLER
// ============================================================================

export class ClassicKahootHandler extends BaseGameModeHandler {
  constructor() {
    super(
      'classic',
      'Tốc Độ Cổ Điển (Kahoot Style)',
      'Cạnh tranh tính điểm theo tốc độ và độ chính xác cổ điển'
    );
  }

  onAnswerEvaluated(playerId, isCorrect, responseTime, currentState) {
    if (!isCorrect) {
      return { playerId, isCorrect: false, baseScore: 0, multiplier: 1 };
    }
    const timeLimitMs = (currentState.settings?.timeLimitPerQuestion || 20) * 1000;
    const clampedTime = Math.min(timeLimitMs, Math.max(300, responseTime || 2000));
    const score = Math.round(1000 * (1 - clampedTime / (2 * timeLimitMs)));
    return {
      playerId,
      isCorrect: true,
      baseScore: score,
      multiplier: 1
    };
  }

  rankPlayers(players) {
    return Object.values(players || {}).sort((a, b) => (b.score || 0) - (a.score || 0));
  }
}

// ============================================================================
// 6. GAME SESSION MANAGER (AUTHORITATIVE EVENT-DRIVEN ORCHESTRATOR)
// ============================================================================

export class GameSessionManager {
  constructor() {
    this.handlers = new Map();

    // Đăng ký các mode handlers mặc định
    this.registerModeHandler(new ResourceQuestHandler());
    this.registerModeHandler(new SpeedRaceHandler());
    this.registerModeHandler(new BossRaidHandler());
    this.registerModeHandler(new ClassicKahootHandler());

    // Đăng ký alias tương thích ngược
    const rq = this.handlers.get('resource_quest');
    if (rq) this.handlers.set('gold_quest', rq);

    const sr = this.handlers.get('speed_race');
    if (sr) this.handlers.set('speed_racer', sr);

    const bh = this.handlers.get('boss_hunt');
    if (bh) this.handlers.set('boss_raid', bh);

    const cl = this.handlers.get('classic');
    if (cl) this.handlers.set('classic_kahoot', cl);
  }

  /**
   * Đăng ký thêm GameModeHandler tùy biến (Pluggable Architecture)
   * @param {BaseGameModeHandler} handler
   */
  registerModeHandler(handler) {
    if (!handler || !handler.modeId) {
      throw new Error('GameModeHandler must provide a valid modeId');
    }
    this.handlers.set(handler.modeId, handler);
  }

  /**
   * Lấy GameModeHandler theo ID
   * @param {string} modeId
   * @returns {BaseGameModeHandler}
   */
  getModeHandler(modeId) {
    return this.handlers.get(modeId) || this.handlers.get('resource_quest') || this.handlers.get('classic');
  }

  /**
   * Khởi tạo Session chuẩn (Normalized State Container)
   * Tách biệt hoàn toàn Question models khỏi Game models
   * @param {object} params
   * @returns {object} SessionState
   */
  createSession(params) {
    const mode = params.gameMode || 'resource_quest';
    const questions = Array.isArray(params.questions) ? params.questions : [];
    const totalQuestions = questions.length;
    const timeLimitPerQuestion = params.timerSec || params.timeLimitPerQuestion || 20;

    const session = {
      id: String(params.pin || params.id || Math.floor(100000 + Math.random() * 900000)),
      hostId: params.hostId || 'host',
      quizId: params.quizId || 'quiz_default',
      gameMode: mode,
      status: 'lobby', // 'lobby' | 'playing' | 'question_result' | 'game_over'
      currentQuestionIndex: -1,
      totalQuestions,
      questions, // Educational question bank decoupled from game mechanics
      players: {},
      settings: {
        timeLimitPerQuestion,
        goalCap: params.goalCap || 0,
        powerUpFrequency: params.powerUpFrequency || 'normal',
        title: params.title || 'Đấu Trường TinHocHub',
        targetClass: params.targetClass || 'all',
        hostName: params.hostName || 'Thầy/Cô'
      },
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Khởi tạo metadata riêng cho Boss Raid nếu chọn chế độ này
    if (mode === 'boss_hunt' || mode === 'boss_raid') {
      const bossHp = Math.max(1000, totalQuestions * 350);
      session.metadata = {
        bossMaxHp: bossHp,
        bossCurrentHp: bossHp,
        bossDefeated: false
      };
    }

    return session;
  }

  /**
   * Học sinh tham gia phòng đấu trường
   * @param {object} session
   * @param {object} playerParams
   * @returns {object} PlayerState
   */
  joinPlayer(session, playerParams) {
    if (!session) return null;
    session.players = session.players || {};
    const id = String(playerParams.id || playerParams.uid || `player_${Date.now()}`);
    const name = playerParams.name || 'Dũng sĩ Blook';
    const blookId = playerParams.blookId || 'bot';

    const handler = this.getModeHandler(session.gameMode);
    const modeState = handler.initPlayerState(id);

    const playerState = {
      id,
      name,
      blookId,
      score: 0,
      streak: 0,
      correctCount: 0,
      currentAnswer: null,
      answeredInCurrentQ: false,
      metadata: modeState.metadata || {},
      inventory: modeState.inventory || []
    };

    session.players[id] = playerState;
    session.updatedAt = Date.now();
    return playerState;
  }

  /**
   * Xác thực Authoritative câu trả lời từ học sinh
   * Chống gian lận điểm số từ phía client
   * @param {object} session
   * @param {string} playerId
   * @param {number|string} answerIndex
   * @param {number} responseTime
   * @returns {{ isCorrect: boolean, rewardPayload: object, deltaUpdate: object }}
   */
  submitAnswer(session, playerId, answerIndex, responseTime = 2000) {
    session.players = session.players || {};
    const player = session.players[playerId];
    if (!player) {
      throw new Error(`Player ${playerId} not found in session ${session.id}`);
    }

    if (session.status !== 'playing') {
      throw new Error(`Cannot submit answer when session status is ${session.status}`);
    }

    const question = session.questions[session.currentQuestionIndex];
    if (!question) {
      throw new Error(`Question at index ${session.currentQuestionIndex} not found`);
    }

    // 1. Authoritative correctness evaluation
    let correctIdx = 0;
    if (typeof question.answer === 'number') {
      correctIdx = question.answer;
    } else if (typeof question.answer === 'string') {
      const char = question.answer.trim().toUpperCase()[0];
      correctIdx = ['A', 'B', 'C', 'D'].indexOf(char);
      if (correctIdx === -1) correctIdx = 0;
    }

    const isCorrect = (Number(answerIndex) === correctIdx);

    // 2. Cập nhật universal attributes
    player.currentAnswer = answerIndex;
    player.answeredInCurrentQ = true;
    player.responseTime = responseTime;

    if (isCorrect) {
      player.streak = (player.streak || 0) + 1;
      player.correctCount = (player.correctCount || 0) + 1;
    } else {
      player.streak = 0;
    }

    // 3. Gọi Hook của Game Mode
    const handler = this.getModeHandler(session.gameMode);
    const rewardPayload = handler.onAnswerEvaluated(playerId, isCorrect, responseTime, session);

    // Cập nhật điểm universal
    const scoreAdd = (rewardPayload.baseScore || 0) * (rewardPayload.multiplier || 1);
    player.score = (player.score || 0) + scoreAdd;

    session.updatedAt = Date.now();

    // 4. Tạo Delta Update
    const deltaUpdate = {
      type: 'ANSWER_EVALUATED',
      sessionId: session.id,
      playerDeltas: {
        [playerId]: {
          playerId,
          scoreDelta: scoreAdd,
          metadataDelta: player.metadata
        }
      },
      broadcastMessage: isCorrect ? `[${player.name}] đã trả lời đúng!` : null,
      timestamp: Date.now()
    };

    return {
      isCorrect,
      rewardPayload,
      deltaUpdate
    };
  }

  /**
   * Kích hoạt hành động game (TRIGGER_ACTION)
   * Đảm bảo tính nguyên tử (atomic transaction) khi tương tác nhiều người chơi
   * @param {object} session
   * @param {object} action
   * @returns {object} SessionDeltaUpdate
   */
  triggerAction(session, action) {
    const handler = this.getModeHandler(session.gameMode);
    const deltaUpdate = handler.handlePlayerAction(action, session);
    session.updatedAt = Date.now();

    // Kiểm tra điều kiện kết thúc trận
    if (handler.checkEndCondition(session)) {
      session.status = 'game_over';
      deltaUpdate.sessionDelta = { status: 'game_over' };
    }

    return deltaUpdate;
  }

  /**
   * Đồng bộ State nhẹ (Lightweight Delta / Leaderboard State)
   * Tránh nghẽn mạng băng thông khi truyền qua Realtime DB / WebSocket
   * @param {object} session
   * @returns {object}
   */
  syncState(session) {
    const handler = this.getModeHandler(session.gameMode);
    const ranked = handler.rankPlayers(session.players);

    // Bảng xếp hạng thu gọn nhẹ nhàng
    const lightweightLeaderboard = ranked.map((p, index) => ({
      rank: index + 1,
      id: p.id,
      name: p.name,
      blookId: p.blookId,
      score: p.score,
      streak: p.streak,
      correctCount: p.correctCount,
      gold: p.metadata?.gold || 0,
      shields: p.metadata?.shields || 0
    }));

    return {
      id: session.id,
      status: session.status,
      gameMode: session.gameMode,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.totalQuestions,
      leaderboard: lightweightLeaderboard,
      metadata: session.metadata,
      updatedAt: session.updatedAt
    };
  }

  /**
   * Lấy bảng xếp hạng theo quy tắc của Game Mode hiện tại
   * @param {object} session
   * @returns {Array<object>}
   */
  rankPlayers(session) {
    if (!session) return [];
    session.players = session.players || {};
    const handler = this.getModeHandler(session.gameMode);
    return handler.rankPlayers(session.players);
  }
}

// Instance mặc định dùng cho toàn ứng dụng
export const defaultGameEngine = new GameSessionManager();
export default defaultGameEngine;
