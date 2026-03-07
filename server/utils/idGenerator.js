import { v4 as uuidv4 } from 'uuid';
import { GAME_CONSTANTS } from '../config.js';

export function generatePlayerId() {
  return uuidv4();
}

export function generateRoomCode(length = GAME_CONSTANTS.ROOM_CODE_LENGTH) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateCardId() {
  return uuidv4();
}
