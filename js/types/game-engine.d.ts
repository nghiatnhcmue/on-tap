/**
 * TypeScript Type Definitions for Pluggable Game Engine
 * Decouples educational question banks from gamification layers.
 */

export interface QuizQuestion {
  id: string | number;
  question: string;
  options: string[];
  answer: number | string;
  explanation?: string;
  topic?: string;
  level?: string | number;
}

export interface PlayerInventoryItem {
  id: string;
  type: string;
  name: string;
  description?: string;
  params?: Record<string, any>;
}

export interface PlayerState {
  id: string; // Unique player identifier (e.g. uid)
  name: string;
  blookId: string;
  score: number; // Universal score
  streak: number; // Consecutive correct answers
  correctCount: number; // Universal correct answer counter
  currentAnswer?: number | string | null;
  answeredInCurrentQ?: boolean;
  responseTime?: number; // Milliseconds taken to answer
  // Extensible mode-specific state
  metadata: Record<string, any>; // e.g. { gold: number, shields: number, multiplier: number, isFrozen: boolean }
  inventory: PlayerInventoryItem[]; // Extensible power-up / item storage
}

export interface SessionSettings {
  timeLimitPerQuestion: number; // Seconds per question
  goalCap?: number; // e.g. gold goal, max points, or question count limit
  powerUpFrequency?: 'low' | 'normal' | 'high';
  title?: string;
  targetClass?: string;
  hostName?: string;
  allowLateJoin?: boolean;
}

export interface SessionState {
  id: string; // Session PIN or Room ID
  hostId: string;
  quizId: string;
  gameMode: string; // 'resource_quest' | 'speed_race' | 'boss_hunt' | 'classic'
  status: 'lobby' | 'playing' | 'question_result' | 'game_over';
  currentQuestionIndex: number;
  totalQuestions: number;
  questions?: QuizQuestion[]; // Question banks agnostic of game logic
  players: Record<string, PlayerState>;
  settings: SessionSettings;
  metadata?: Record<string, any>; // Mode-specific session state (e.g. bossHp)
  createdAt: number;
  updatedAt: number;
}

export interface GameAction {
  type: string; // e.g. 'CHEST_PICK', 'STEAL_EXECUTE', 'USE_POWERUP'
  playerId: string;
  targetPlayerId?: string;
  payload?: Record<string, any>;
  timestamp?: number;
}

export interface RewardOption {
  id: string;
  type: 'resource' | 'multiplier' | 'shield' | 'steal' | 'powerup' | 'none';
  label: string;
  value: any;
  icon?: string;
  description?: string;
}

export interface RewardPayload {
  playerId: string;
  isCorrect: boolean;
  baseScore: number;
  multiplier: number;
  rewardOptions?: RewardOption[];
  metadata?: Record<string, any>;
}

export interface PlayerDelta {
  playerId: string;
  scoreDelta?: number;
  metadataDelta?: Record<string, any>;
  inventoryDelta?: {
    added?: PlayerInventoryItem[];
    removed?: string[];
  };
}

export interface SessionDeltaUpdate {
  type: string;
  sessionId: string;
  playerDeltas: Record<string, PlayerDelta>;
  sessionDelta?: Partial<SessionState>;
  broadcastMessage?: string;
  timestamp: number;
}

/**
 * Strategy pattern interface for pluggable game modes
 */
export interface GameModeHandler {
  readonly modeId: string;
  readonly modeName: string;
  readonly description: string;

  /**
   * Initialize mode-specific player state variables
   */
  initPlayerState(playerId: string): {
    metadata: Record<string, any>;
    inventory: PlayerInventoryItem[];
  };

  /**
   * Hook called after authoritative answer evaluation by host/server
   */
  onAnswerEvaluated(
    playerId: string,
    isCorrect: boolean,
    responseTime: number,
    currentState: SessionState
  ): RewardPayload;

  /**
   * Handles mode-specific mechanics (atomic transactions like opening chests, stealing, using power-ups)
   */
  handlePlayerAction(action: GameAction, currentState: SessionState): SessionDeltaUpdate;

  /**
   * Evaluates if game end condition is reached (e.g. goal cap met, boss defeated, timeout)
   */
  checkEndCondition(currentState: SessionState): boolean;

  /**
   * Ranks players according to mode rules (e.g. gold for Resource Quest, score for Speed Race)
   */
  rankPlayers(players: Record<string, PlayerState>): PlayerState[];
}
