export class ScoreCalculator {
  /**
   * Calculate score for round winner.
   * Winner gets sum of all other players' remaining hand points.
   */
  static calculateRoundScore(winner, players) {
    let score = 0;
    for (const player of players) {
      if (player.id === winner.id) continue;
      for (const card of player.hand) {
        score += card.points;
      }
    }
    return score;
  }

  /**
   * Get breakdown of each player's hand value
   */
  static getHandValues(players) {
    return players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      handValue: p.hand.reduce((sum, c) => sum + c.points, 0),
      cardCount: p.hand.length,
    }));
  }

  /**
   * Get final standings sorted by total score (descending)
   */
  static getFinalStandings(players) {
    return [...players]
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((p, i) => ({
        rank: i + 1,
        playerId: p.id,
        playerName: p.name,
        totalScore: p.totalScore,
        isBot: p.isBot,
      }));
  }
}
