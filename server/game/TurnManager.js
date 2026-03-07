export class TurnManager {
  constructor(playerCount) {
    this.playerCount = playerCount;
    this.currentIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
  }

  get currentPlayerIndex() {
    return this.currentIndex;
  }

  get isClockwise() {
    return this.direction === 1;
  }

  advance(skip = false) {
    if (skip) {
      // Skip next player (advance twice)
      this.currentIndex = this._nextIndex(this._nextIndex(this.currentIndex));
    } else {
      this.currentIndex = this._nextIndex(this.currentIndex);
    }
    return this.currentIndex;
  }

  reverse() {
    this.direction *= -1;
  }

  reverseAndAdvance(playerCount) {
    this.reverse();
    // In 2-player game, reverse acts as skip
    if ((playerCount || this.playerCount) === 2) {
      return this.advance(true);
    }
    return this.advance();
  }

  skip() {
    return this.advance(true);
  }

  getNextPlayerIndex() {
    return this._nextIndex(this.currentIndex);
  }

  getSkippedPlayerIndex() {
    return this._nextIndex(this.currentIndex);
  }

  setCurrentIndex(index) {
    this.currentIndex = index;
  }

  _nextIndex(from) {
    return ((from + this.direction) % this.playerCount + this.playerCount) % this.playerCount;
  }

  updatePlayerCount(count) {
    this.playerCount = count;
    if (this.currentIndex >= count) {
      this.currentIndex = 0;
    }
  }

  toJSON() {
    return {
      currentIndex: this.currentIndex,
      direction: this.direction,
      playerCount: this.playerCount,
    };
  }
}
