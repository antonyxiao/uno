export class Player {
  constructor(id, name, isBot = false, botDifficulty = null) {
    this.id = id;
    this.name = name;
    this.hand = [];
    this.score = 0;
    this.totalScore = 0;
    this.isBot = isBot;
    this.botDifficulty = botDifficulty;
    this.connected = true;
    this.calledUno = false;
    this.mustCallUno = false;
    this.disconnectedAt = null;
  }

  addCards(cards) {
    this.hand.push(...cards);
    // Reset UNO status when picking up cards
    if (this.hand.length > 1) {
      this.calledUno = false;
      this.mustCallUno = false;
    }
  }

  removeCard(cardId) {
    const index = this.hand.findIndex(c => c.id === cardId);
    if (index === -1) return null;
    const card = this.hand.splice(index, 1)[0];
    return card;
  }

  getCard(cardId) {
    return this.hand.find(c => c.id === cardId) || null;
  }

  hasCard(cardId) {
    return this.hand.some(c => c.id === cardId);
  }

  hasColorInHand(color) {
    return this.hand.some(c => c.color === color);
  }

  getPlayableCards(topCard, currentColor) {
    return this.hand.filter(c => c.canPlayOn(topCard, currentColor));
  }

  get cardCount() {
    return this.hand.length;
  }

  get hasWon() {
    return this.hand.length === 0;
  }

  setDisconnected() {
    this.connected = false;
    this.disconnectedAt = Date.now();
  }

  setConnected() {
    this.connected = true;
    this.disconnectedAt = null;
  }

  toJSON(showHand = false) {
    const data = {
      id: this.id,
      name: this.name,
      cardCount: this.hand.length,
      score: this.score,
      totalScore: this.totalScore,
      isBot: this.isBot,
      botDifficulty: this.botDifficulty,
      connected: this.connected,
      calledUno: this.calledUno,
    };
    if (showHand) {
      data.hand = this.hand.map(c => c.toJSON());
    }
    return data;
  }

  setHand(cards) {
    this.hand = cards;
    this.calledUno = false;
    this.mustCallUno = false;
  }
}
