import { Deck } from './Deck.js';
import { TurnManager } from './TurnManager.js';
import { RuleEngine } from './RuleEngine.js';
import { ScoreCalculator } from './ScoreCalculator.js';
import { CARD_VALUES, WILD_COLOR } from './Card.js';
import { GAME_CONSTANTS } from '../config.js';

export const GAME_STATES = {
  WAITING: 'WAITING',
  DEALING: 'DEALING',
  PLAYING: 'PLAYING',
  CHOOSING_COLOR: 'CHOOSING_COLOR',
  CHOOSING_SWAP_TARGET: 'CHOOSING_SWAP_TARGET',
  DRAW_PENDING: 'DRAW_PENDING',
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER',
};

export class GameEngine {
  constructor(players, houseRules = {}) {
    this.players = players;
    this.deck = null;
    this.turnManager = null;
    this.ruleEngine = new RuleEngine(houseRules);
    this.state = GAME_STATES.WAITING;
    this.currentColor = null;
    this.pendingDrawCount = 0;
    this.roundNumber = 0;
    this.log = [];
    this.lastPlayedCard = null;
    this.waitingForColorChoice = null; // playerId waiting for color choice
    this.waitingForSwapTarget = null; // playerId waiting to choose swap target
    this.unoCallTimers = new Map(); // playerId -> timeout
    this.drawnCard = null; // Card drawn but not yet played/kept
    this.drawnPlayerId = null;
  }

  startGame() {
    this.roundNumber++;
    this.deck = new Deck();
    this.turnManager = new TurnManager(this.players.length);
    this.state = GAME_STATES.DEALING;

    // Reset players
    for (const p of this.players) {
      p.hand = [];
      p.score = 0;
      p.calledUno = false;
      p.mustCallUno = false;
    }

    // Deal cards
    const hands = this.deck.deal(this.players.length, GAME_CONSTANTS.CARDS_PER_PLAYER);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].setHand(hands[i]);
    }

    // Start discard pile
    const startCard = this.deck.startDiscard();
    this.currentColor = startCard.color;
    this.lastPlayedCard = startCard;

    this._addLog(`Round ${this.roundNumber} started`);

    // Handle starting card effects
    this._handleStartingCardEffect(startCard);

    this.state = GAME_STATES.PLAYING;
    this.pendingDrawCount = 0;

    // If starting card is a draw card, set pending
    if (startCard.value === CARD_VALUES.DRAW_TWO) {
      this.pendingDrawCount = 2;
    }

    return this.getPublicState();
  }

  _handleStartingCardEffect(card) {
    switch (card.value) {
      case CARD_VALUES.SKIP:
        this.turnManager.advance(); // Skip first player
        this._addLog(`Starting card is Skip - ${this.players[0].name} is skipped`);
        break;
      case CARD_VALUES.REVERSE:
        this.turnManager.reverse();
        if (this.players.length === 2) {
          this.turnManager.advance(); // In 2-player, reverse = skip
        }
        this._addLog('Starting card is Reverse - direction reversed');
        break;
      case CARD_VALUES.DRAW_TWO:
        this._addLog(`Starting card is Draw Two - ${this.getCurrentPlayer().name} must draw 2`);
        break;
      case CARD_VALUES.WILD:
        // First player gets to choose color
        this.currentColor = null;
        this.state = GAME_STATES.CHOOSING_COLOR;
        this.waitingForColorChoice = this.getCurrentPlayer().id;
        this._addLog('Starting card is Wild - first player chooses color');
        break;
      // WILD_DRAW_FOUR is already prevented by deck.startDiscard()
    }
  }

  playCard(playerId, cardId, chosenColor = null) {
    const player = this._getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const currentPlayer = this.getCurrentPlayer();
    if (this.state !== GAME_STATES.PLAYING) {
      // Allow jump-in even if not your turn
      if (this.ruleEngine.rules.allowSameNumberDifferentColor) {
        const card = player.getCard(cardId);
        if (card && this.ruleEngine.canJumpIn(card, this.deck.getTopDiscard())) {
          return this._executeJumpIn(player, card);
        }
      }
      return { success: false, error: 'Not in playing state' };
    }

    // Check if it's this player's turn (or jump-in)
    if (currentPlayer.id !== playerId) {
      if (this.ruleEngine.rules.allowSameNumberDifferentColor) {
        const card = player.getCard(cardId);
        if (card && this.ruleEngine.canJumpIn(card, this.deck.getTopDiscard())) {
          return this._executeJumpIn(player, card);
        }
      }
      return { success: false, error: 'Not your turn' };
    }

    const card = player.getCard(cardId);
    if (!card) return { success: false, error: 'Card not in hand' };

    const topCard = this.deck.getTopDiscard();

    // Check if there's a pending draw and player is trying to stack
    if (this.pendingDrawCount > 0) {
      if (this.ruleEngine.canStackDrawCard(card, topCard, this.pendingDrawCount)) {
        return this._executePlay(player, card, chosenColor);
      }
      return { success: false, error: 'Must draw cards or stack a draw card' };
    }

    // Validate play
    if (!this.ruleEngine.canPlayCard(card, topCard, this.currentColor, player)) {
      return { success: false, error: 'Cannot play this card' };
    }

    return this._executePlay(player, card, chosenColor);
  }

  _executePlay(player, card, chosenColor) {
    player.removeCard(card.id);
    this.deck.addToDiscard(card);
    this.lastPlayedCard = card;

    this._addLog(`${player.name} played ${card.toString()}`);

    // Handle UNO status
    if (player.hand.length === 1) {
      player.mustCallUno = true;
    }

    // Handle wild card color choice
    if (card.isWild()) {
      if (chosenColor && ['red', 'blue', 'green', 'yellow'].includes(chosenColor)) {
        this.currentColor = chosenColor;
        this._addLog(`${player.name} chose ${chosenColor}`);
      } else {
        this.state = GAME_STATES.CHOOSING_COLOR;
        this.waitingForColorChoice = player.id;
        return { success: true, needsColorChoice: true };
      }
    } else {
      this.currentColor = card.color;
    }

    // Check for win
    if (player.hand.length === 0) {
      return this._handleRoundEnd(player);
    }

    // Handle card effects
    return this._handleCardEffect(card, player, chosenColor);
  }

  _executeJumpIn(player, card) {
    // Find this player's index and set it as current
    const playerIndex = this.players.indexOf(player);
    this.turnManager.setCurrentIndex(playerIndex);

    player.removeCard(card.id);
    this.deck.addToDiscard(card);
    this.lastPlayedCard = card;
    this.currentColor = card.color;

    this._addLog(`${player.name} jumped in with ${card.toString()}!`);

    if (player.hand.length === 1) {
      player.mustCallUno = true;
    }

    if (player.hand.length === 0) {
      return this._handleRoundEnd(player);
    }

    // Handle card effects
    return this._handleCardEffect(card, player);
  }

  _handleCardEffect(card, player, chosenColor) {
    const drawAmount = this.ruleEngine.getDrawAmount(card);

    switch (card.value) {
      case CARD_VALUES.SKIP:
        this.turnManager.skip();
        this._addLog(`${this.players[this.turnManager.getSkippedPlayerIndex()]?.name || 'Next player'} was skipped`);
        break;

      case CARD_VALUES.REVERSE:
        if (this.players.length === 2) {
          this.turnManager.reverse();
          this.turnManager.advance(true); // Acts as skip in 2-player
        } else {
          this.turnManager.reverseAndAdvance(this.players.length);
        }
        this._addLog('Direction reversed');
        return { success: true, effect: 'reverse' };

      case CARD_VALUES.DRAW_TWO:
        this.pendingDrawCount += 2;
        this.turnManager.advance();
        this._addLog(`${this.getCurrentPlayer().name} must draw ${this.pendingDrawCount} cards`);
        return { success: true, effect: 'draw2', pendingDraw: this.pendingDrawCount };

      case CARD_VALUES.WILD_DRAW_FOUR:
        this.pendingDrawCount += 4;
        this.turnManager.advance();
        this._addLog(`${this.getCurrentPlayer().name} must draw ${this.pendingDrawCount} cards`);
        return { success: true, effect: 'wild_draw4', pendingDraw: this.pendingDrawCount };

      default:
        // Check for seven swap
        if (this.ruleEngine.shouldSwapHands(card)) {
          this.state = GAME_STATES.CHOOSING_SWAP_TARGET;
          this.waitingForSwapTarget = player.id;
          return { success: true, needsSwapTarget: true };
        }
        // Check for zero rotate
        if (this.ruleEngine.shouldRotateHands(card)) {
          this._rotateHands();
          this.turnManager.advance();
          return { success: true, effect: 'rotate' };
        }
        this.turnManager.advance();
        break;
    }

    return { success: true };
  }

  drawCard(playerId) {
    const player = this._getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (this.state === GAME_STATES.CHOOSING_COLOR || this.state === GAME_STATES.CHOOSING_SWAP_TARGET) {
      return { success: false, error: 'Must complete current action first' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId && this.state === GAME_STATES.PLAYING) {
      return { success: false, error: 'Not your turn' };
    }

    // Handle pending draw count (from +2/+4)
    if (this.pendingDrawCount > 0) {
      const drawn = this.deck.draw(this.pendingDrawCount);
      player.addCards(drawn);
      this._addLog(`${player.name} drew ${drawn.length} cards`);
      this.pendingDrawCount = 0;
      this.turnManager.advance();
      return { success: true, drawnCount: drawn.length, cards: drawn.map(c => c.toJSON()) };
    }

    // Normal draw
    if (this.ruleEngine.shouldDrawUntilPlayable()) {
      return this._drawUntilPlayable(player);
    }

    const drawn = this.deck.draw(1);
    if (drawn.length === 0) {
      return { success: false, error: 'No cards left to draw' };
    }

    player.addCards(drawn);
    this._addLog(`${player.name} drew a card`);

    const drawnCard = drawn[0];
    const topCard = this.deck.getTopDiscard();

    // Check if drawn card can be played
    if (drawnCard.canPlayOn(topCard, this.currentColor)) {
      if (this.ruleEngine.mustPlayDrawnCard()) {
        // Auto-play the drawn card
        return this.playCard(playerId, drawnCard.id);
      }
      if (this.ruleEngine.canPlayDrawnCard()) {
        // Player can choose to play it or keep it
        this.drawnCard = drawnCard;
        this.drawnPlayerId = playerId;
        return {
          success: true,
          drawnCount: 1,
          cards: [drawnCard.toJSON()],
          canPlay: true,
          drawnCardId: drawnCard.id,
        };
      }
    }

    // Can't play drawn card, turn passes
    this.turnManager.advance();
    return { success: true, drawnCount: 1, cards: [drawnCard.toJSON()], canPlay: false };
  }

  keepDrawnCard(playerId) {
    if (this.drawnPlayerId !== playerId) {
      return { success: false, error: 'No drawn card pending for you' };
    }
    this.drawnCard = null;
    this.drawnPlayerId = null;
    this.turnManager.advance();
    return { success: true };
  }

  _drawUntilPlayable(player) {
    const drawn = [];
    const topCard = this.deck.getTopDiscard();
    let playableCard = null;

    while (!playableCard) {
      const cards = this.deck.draw(1);
      if (cards.length === 0) break;
      drawn.push(cards[0]);
      player.addCards(cards);
      if (cards[0].canPlayOn(topCard, this.currentColor)) {
        playableCard = cards[0];
      }
    }

    this._addLog(`${player.name} drew ${drawn.length} card(s)`);

    if (playableCard) {
      if (this.ruleEngine.mustPlayDrawnCard()) {
        return this.playCard(player.id, playableCard.id);
      }
      this.drawnCard = playableCard;
      this.drawnPlayerId = player.id;
      return {
        success: true,
        drawnCount: drawn.length,
        cards: drawn.map(c => c.toJSON()),
        canPlay: true,
        drawnCardId: playableCard.id,
      };
    }

    this.turnManager.advance();
    return { success: true, drawnCount: drawn.length, cards: drawn.map(c => c.toJSON()), canPlay: false };
  }

  chooseColor(playerId, color) {
    if (this.state !== GAME_STATES.CHOOSING_COLOR) {
      return { success: false, error: 'Not choosing color' };
    }
    if (this.waitingForColorChoice !== playerId) {
      return { success: false, error: 'Not your choice' };
    }
    if (!['red', 'blue', 'green', 'yellow'].includes(color)) {
      return { success: false, error: 'Invalid color' };
    }

    this.currentColor = color;
    this.state = GAME_STATES.PLAYING;
    this.waitingForColorChoice = null;

    this._addLog(`Color chosen: ${color}`);

    // Check if the player who played the wild has won
    const player = this._getPlayer(playerId);
    if (player && player.hand.length === 0) {
      return this._handleRoundEnd(player);
    }

    // Handle draw effects if the wild card was a WD4
    if (this.lastPlayedCard && this.lastPlayedCard.value === CARD_VALUES.WILD_DRAW_FOUR) {
      this.pendingDrawCount += 4;
      this.turnManager.advance();
      this._addLog(`${this.getCurrentPlayer().name} must draw ${this.pendingDrawCount} cards`);
      return { success: true, effect: 'wild_draw4', pendingDraw: this.pendingDrawCount };
    }

    if (this.lastPlayedCard && this.lastPlayedCard.value === CARD_VALUES.WILD) {
      this.turnManager.advance();
    }

    return { success: true };
  }

  chooseSwapTarget(playerId, targetId) {
    if (this.state !== GAME_STATES.CHOOSING_SWAP_TARGET) {
      return { success: false, error: 'Not choosing swap target' };
    }
    if (this.waitingForSwapTarget !== playerId) {
      return { success: false, error: 'Not your choice' };
    }

    const player = this._getPlayer(playerId);
    const target = this._getPlayer(targetId);
    if (!target) return { success: false, error: 'Target player not found' };
    if (target.id === playerId) return { success: false, error: 'Cannot swap with yourself' };

    // Swap hands
    const tempHand = player.hand;
    player.setHand(target.hand);
    target.setHand(tempHand);

    this.state = GAME_STATES.PLAYING;
    this.waitingForSwapTarget = null;

    this._addLog(`${player.name} swapped hands with ${target.name}`);

    this.turnManager.advance();
    return { success: true, effect: 'swap' };
  }

  _rotateHands() {
    if (this.players.length < 2) return;

    const hands = this.players.map(p => p.hand);
    if (this.turnManager.isClockwise) {
      // Rotate clockwise: each player gets the hand of the player before them
      const lastHand = hands[hands.length - 1];
      for (let i = hands.length - 1; i > 0; i--) {
        this.players[i].setHand(hands[i - 1]);
      }
      this.players[0].setHand(lastHand);
    } else {
      // Rotate counter-clockwise
      const firstHand = hands[0];
      for (let i = 0; i < hands.length - 1; i++) {
        this.players[i].setHand(hands[i + 1]);
      }
      this.players[hands.length - 1].setHand(firstHand);
    }

    this._addLog('All hands rotated!');
  }

  playCombo(playerId, cardIds) {
    const player = this._getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (this.state !== GAME_STATES.PLAYING) {
      return { success: false, error: 'Not in playing state' };
    }

    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.pendingDrawCount > 0) {
      return { success: false, error: 'Must draw cards first' };
    }

    // Look up all cards from player's hand
    const cards = [];
    for (const id of cardIds) {
      const card = player.getCard(id);
      if (!card) return { success: false, error: `Card ${id} not in hand` };
      cards.push(card);
    }

    const topCard = this.deck.getTopDiscard();
    const validation = this.ruleEngine.validateComboChain(cards, topCard, this.currentColor, player);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Remove all cards from hand, add to discard
    for (const card of cards) {
      player.removeCard(card.id);
      this.deck.addToDiscard(card);
    }

    // Last card determines state
    const lastCard = cards[cards.length - 1];
    this.lastPlayedCard = lastCard;
    this.currentColor = lastCard.color;

    this._addLog(`${player.name} played a combo of ${cards.length} cards!`);

    // Handle UNO
    if (player.hand.length === 1) {
      player.mustCallUno = true;
    }

    // Check for win
    if (player.hand.length === 0) {
      return this._handleRoundEnd(player);
    }

    // Advance turn (no card effects for number-only combos)
    this.turnManager.advance();

    return { success: true, effect: 'combo', cardsPlayed: cards.length };
  }

  callUno(playerId) {
    const player = this._getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!this.ruleEngine.isComboPlayEnabled() && player.hand.length > 2) {
      return { success: false, error: 'Can only call UNO with 1-2 cards' };
    }

    player.calledUno = true;
    player.mustCallUno = false;
    this._addLog(`${player.name} called UNO!`);
    return { success: true };
  }

  challengeUno(challengerId, targetId) {
    const challenger = this._getPlayer(challengerId);
    const target = this._getPlayer(targetId);
    if (!challenger || !target) return { success: false, error: 'Player not found' };

    if (target.hand.length !== 1) {
      return { success: false, error: 'Target does not have 1 card' };
    }

    if (target.calledUno) {
      return { success: false, error: 'Target already called UNO', caught: false };
    }

    // Target forgot to call UNO - penalty
    const penaltyCards = this.deck.draw(GAME_CONSTANTS.UNO_PENALTY_CARDS);
    target.addCards(penaltyCards);
    target.mustCallUno = false;

    this._addLog(`${challenger.name} caught ${target.name} not calling UNO! ${target.name} draws ${GAME_CONSTANTS.UNO_PENALTY_CARDS} cards`);
    return { success: true, caught: true, penaltyCards: penaltyCards.length };
  }

  _handleRoundEnd(winner) {
    const roundScore = ScoreCalculator.calculateRoundScore(winner, this.players);
    winner.score = roundScore;
    winner.totalScore += roundScore;

    this._addLog(`${winner.name} wins round ${this.roundNumber}! Score: ${roundScore}`);

    const handValues = ScoreCalculator.getHandValues(this.players);

    // Check if game is completely over
    if (this.ruleEngine.hasReachedPointLimit(this.players)) {
      this.state = GAME_STATES.GAME_OVER;
      const finalStandings = ScoreCalculator.getFinalStandings(this.players);
      return {
        success: true,
        roundOver: true,
        gameOver: true,
        winner: winner.toJSON(false),
        roundScore,
        handValues,
        finalStandings,
      };
    }

    this.state = GAME_STATES.ROUND_OVER;
    return {
      success: true,
      roundOver: true,
      gameOver: false,
      winner: winner.toJSON(false),
      roundScore,
      handValues,
    };
  }

  startNextRound() {
    if (this.state !== GAME_STATES.ROUND_OVER) {
      return { success: false, error: 'Not in round over state' };
    }
    return this.startGame();
  }

  getCurrentPlayer() {
    return this.players[this.turnManager.currentPlayerIndex];
  }

  _getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  _addLog(message) {
    this.log.push({
      timestamp: Date.now(),
      message,
      round: this.roundNumber,
    });
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return false;

    const player = this.players[index];
    // Return cards to deck
    while (player.hand.length > 0) {
      const card = player.hand.pop();
      this.deck.addToDiscard(card);
    }

    this.players.splice(index, 1);
    this.turnManager.updatePlayerCount(this.players.length);

    if (this.players.length < 2) {
      if (this.players.length === 1) {
        return this._handleRoundEnd(this.players[0]);
      }
      this.state = GAME_STATES.GAME_OVER;
    }

    return true;
  }

  getGameState(forPlayerId = null) {
    const topCard = this.deck ? this.deck.getTopDiscard() : null;
    const state = {
      state: this.state,
      currentColor: this.currentColor,
      topCard: topCard ? topCard.toJSON() : null,
      drawPileCount: this.deck ? this.deck.drawPileCount : 0,
      discardPileCount: this.deck ? this.deck.discardPileCount : 0,
      currentPlayerIndex: this.turnManager ? this.turnManager.currentPlayerIndex : 0,
      currentPlayerId: this.getCurrentPlayer()?.id || null,
      direction: this.turnManager ? this.turnManager.direction : 1,
      pendingDrawCount: this.pendingDrawCount,
      roundNumber: this.roundNumber,
      log: this.log.slice(-20),
      players: this.players.map(p => p.toJSON(false)),
      waitingForColorChoice: this.waitingForColorChoice,
      waitingForSwapTarget: this.waitingForSwapTarget,
      comboPlayEnabled: this.ruleEngine.isComboPlayEnabled(),
    };

    // Include the requesting player's hand
    if (forPlayerId) {
      const player = this._getPlayer(forPlayerId);
      if (player) {
        state.hand = player.hand.map(c => c.toJSON());
        state.playableCards = player.getPlayableCards(
          topCard, this.currentColor
        ).map(c => c.id);
      }
    }

    return state;
  }

  getPublicState() {
    return this.getGameState(null);
  }
}
