import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '../../server/game/ScoreCalculator.js';
import { Player } from '../../server/game/Player.js';
import { Card, WILD_COLOR, CARD_VALUES } from '../../server/game/Card.js';

describe('ScoreCalculator', () => {
  it('should calculate round score for winner', () => {
    const winner = new Player('p1', 'Alice');
    const p2 = new Player('p2', 'Bob');
    p2.addCards([
      new Card('c1', 'red', '5'), // 5 pts
      new Card('c2', 'blue', '9'), // 9 pts
    ]);
    const p3 = new Player('p3', 'Charlie');
    p3.addCards([
      new Card('c3', 'green', CARD_VALUES.SKIP), // 20 pts
      new Card('c4', WILD_COLOR, CARD_VALUES.WILD), // 50 pts
    ]);

    const score = ScoreCalculator.calculateRoundScore(winner, [winner, p2, p3]);
    expect(score).toBe(5 + 9 + 20 + 50); // 84
  });

  it('should return 0 when all other hands are empty', () => {
    const winner = new Player('p1', 'Alice');
    const p2 = new Player('p2', 'Bob');
    const score = ScoreCalculator.calculateRoundScore(winner, [winner, p2]);
    expect(score).toBe(0);
  });

  it('should get hand values for all players', () => {
    const p1 = new Player('p1', 'Alice');
    p1.addCards([new Card('c1', 'red', '5')]);
    const p2 = new Player('p2', 'Bob');
    p2.addCards([new Card('c2', 'blue', CARD_VALUES.REVERSE)]);

    const values = ScoreCalculator.getHandValues([p1, p2]);
    expect(values).toEqual([
      { playerId: 'p1', playerName: 'Alice', handValue: 5, cardCount: 1 },
      { playerId: 'p2', playerName: 'Bob', handValue: 20, cardCount: 1 },
    ]);
  });

  it('should get final standings sorted by total score', () => {
    const p1 = new Player('p1', 'Alice');
    p1.totalScore = 100;
    const p2 = new Player('p2', 'Bob');
    p2.totalScore = 250;
    const p3 = new Player('p3', 'Charlie');
    p3.totalScore = 150;

    const standings = ScoreCalculator.getFinalStandings([p1, p2, p3]);
    expect(standings[0].rank).toBe(1);
    expect(standings[0].playerName).toBe('Bob');
    expect(standings[0].totalScore).toBe(250);
    expect(standings[1].playerName).toBe('Charlie');
    expect(standings[2].playerName).toBe('Alice');
  });
});
