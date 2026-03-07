import { describe, it, expect } from 'vitest';
import { TurnManager } from '../../server/game/TurnManager.js';

describe('TurnManager', () => {
  it('should start at index 0 going clockwise', () => {
    const tm = new TurnManager(4);
    expect(tm.currentPlayerIndex).toBe(0);
    expect(tm.isClockwise).toBe(true);
  });

  it('should advance to next player clockwise', () => {
    const tm = new TurnManager(4);
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(1);
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(2);
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(3);
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(0); // wraps around
  });

  it('should reverse direction', () => {
    const tm = new TurnManager(4);
    tm.reverse();
    expect(tm.isClockwise).toBe(false);
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(3); // wraps backwards
    tm.advance();
    expect(tm.currentPlayerIndex).toBe(2);
  });

  it('should skip a player', () => {
    const tm = new TurnManager(4);
    tm.skip(); // Skip player 1, go to player 2
    expect(tm.currentPlayerIndex).toBe(2);
  });

  it('should skip in reverse direction', () => {
    const tm = new TurnManager(4);
    tm.reverse();
    tm.skip(); // Skips player 3, goes to player 2
    expect(tm.currentPlayerIndex).toBe(2);
  });

  it('should handle 2-player reverse as skip', () => {
    const tm = new TurnManager(2);
    // Start at 0, reverse and advance
    tm.reverseAndAdvance(2);
    // In 2-player, reverse acts as skip (skip + advance = same player)
    // After reverse: direction = -1, advance(skip=true) moves 2 steps
    // From 0, skip in reverse wraps around
    expect(tm.currentPlayerIndex).toBe(0); // Back to same player
  });

  it('should get next player index without advancing', () => {
    const tm = new TurnManager(4);
    expect(tm.getNextPlayerIndex()).toBe(1);
    expect(tm.currentPlayerIndex).toBe(0); // didn't change
  });

  it('should set current index', () => {
    const tm = new TurnManager(4);
    tm.setCurrentIndex(2);
    expect(tm.currentPlayerIndex).toBe(2);
  });

  it('should update player count', () => {
    const tm = new TurnManager(4);
    tm.setCurrentIndex(3);
    tm.updatePlayerCount(3);
    expect(tm.playerCount).toBe(3);
    expect(tm.currentPlayerIndex).toBe(0); // reset because was out of range
  });

  it('should keep current index if still valid after player count update', () => {
    const tm = new TurnManager(4);
    tm.setCurrentIndex(1);
    tm.updatePlayerCount(3);
    expect(tm.currentPlayerIndex).toBe(1);
  });

  it('should serialize to JSON', () => {
    const tm = new TurnManager(4);
    tm.advance();
    tm.reverse();
    const json = tm.toJSON();
    expect(json).toEqual({
      currentIndex: 1,
      direction: -1,
      playerCount: 4,
    });
  });

  it('should handle wrapping correctly with 3 players', () => {
    const tm = new TurnManager(3);
    expect(tm.currentPlayerIndex).toBe(0);
    tm.advance(); // 1
    tm.advance(); // 2
    tm.advance(); // 0
    expect(tm.currentPlayerIndex).toBe(0);
  });
});
