export const PORT = process.env.PORT || 3000;

export const GAME_CONSTANTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  CARDS_PER_PLAYER: 7,
  TURN_TIMEOUT_MS: 30000,
  RECONNECT_TIMEOUT_MS: 60000,
  UNO_CALL_WINDOW_MS: 2000,
  UNO_CHALLENGE_WINDOW_MS: 5000,
  UNO_PENALTY_CARDS: 4,
  ROOM_CLEANUP_MS: 2 * 60 * 60 * 1000, // 2 hours
  ROOM_CODE_LENGTH: 6,
  BOT_DELAY_MIN_MS: 500,
  BOT_DELAY_MAX_MS: 2000,
};

export const DEFAULT_HOUSE_RULES = {
  stackDrawCards: false,
  stackWildDraw4: false,
  stackDraw2OnDraw4: false,
  playMatchingCardOnDraw: true,
  forcePlayOnDraw: false,
  allowSameNumberDifferentColor: false,
  noBluffingWildDraw4: false,
  drawUntilPlayable: false,
  sevenSwapHands: false,
  zeroRotateHands: false,
  comboPlay: false,
  winCondition: 'first_out',
  pointLimit: 0,
};
