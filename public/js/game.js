// Game Client - Main game controller
(function() {
  'use strict';

  // State
  let socket = null;
  let playerId = null;
  let roomCode = null;
  let gameState = null;
  let selectedCardId = null;
  let turnTimerInterval = null;
  let turnStartTime = null;
  const TURN_TIMEOUT = 30000;
  let selectedComboIds = [];
  let comboMode = false;
  let lastCurrentPlayerId = null;

  // Init
  function init() {
    const params = new URLSearchParams(window.location.search);
    roomCode = params.get('roomCode');
    playerId = params.get('playerId');

    if (!roomCode || !playerId) {
      window.location.href = '/';
      return;
    }

    document.getElementById('roomCodeDisplay').textContent = `Room: ${roomCode}`;
    connectSocket();
    setupEventListeners();
    setupKeyboardShortcuts();
  }

  function connectSocket() {
    socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      UIHelpers.updateConnectionStatus('connected');
      // Reconnect to room
      socket.emit('reconnect-player', { playerId, roomCode }, (res) => {
        if (res.success && res.gameState) {
          updateGameState(res.gameState);
        } else {
          // Request game state
          socket.emit('game-state', null, (stateRes) => {
            if (stateRes.success) {
              updateGameState(stateRes.state);
            }
          });
        }
      });
    });

    socket.on('disconnect', () => {
      UIHelpers.updateConnectionStatus('disconnected');
    });

    socket.on('reconnecting', () => {
      UIHelpers.updateConnectionStatus('reconnecting');
    });

    // Game events
    socket.on('game-started', (state) => {
      updateGameState(state);
      UIHelpers.showToast('Game started!', 'success');
    });

    socket.on('game-state-update', (state) => {
      updateGameState(state);
    });

    socket.on('card-played', (data) => {
      addLogEntry(`${data.playerName || 'Player'} played ${formatCardName(data.card)}`);
      SoundFX.playCard();
    });

    socket.on('combo-played', (data) => {
      const name = data.playerName || 'Player';
      addLogEntry(`${name} played a combo of ${data.cardsPlayed} cards!`);
      SoundFX.playCard();
    });

    socket.on('card-drawn', (data) => {
      const name = data.playerName || 'Player';
      addLogEntry(`${name} drew ${data.count} card(s)`);
      SoundFX.drawCard();
    });

    socket.on('uno-called', (data) => {
      addLogEntry(`${data.playerName} called UNO!`);
      UIHelpers.showToast(`${data.playerName} called UNO!`, 'warning');
      SoundFX.uno();
    });

    socket.on('uno-challenged', (data) => {
      if (data.caught) {
        addLogEntry(`UNO challenge successful! +${data.penaltyCards} cards`);
        UIHelpers.showToast('UNO challenge successful!', 'success');
      }
    });

    socket.on('color-chosen', (data) => {
      addLogEntry(`Color chosen: ${data.color}`);
    });

    socket.on('turn-timeout', (data) => {
      if (data.playerId === playerId) {
        UIHelpers.showToast('Turn timed out - auto-drew', 'warning');
        SoundFX.timeout();
      }
    });

    socket.on('player-disconnected', (data) => {
      UIHelpers.showToast(`${data.playerName} disconnected`, 'warning');
    });

    socket.on('player-reconnected', (data) => {
      UIHelpers.showToast(`${data.playerName} reconnected`, 'success');
    });

    socket.on('round-over', (data) => {
      showRoundOverModal(data);
    });

    socket.on('game-over', (data) => {
      showGameOverModal(data);
    });

    socket.on('chat-message', (data) => {
      addLogEntry(`${data.playerName}: ${data.message}`);
    });

    socket.on('kicked', () => {
      UIHelpers.showToast('You were kicked from the room', 'error');
      setTimeout(() => { window.location.href = '/'; }, 2000);
    });

    socket.on('room-updated', (data) => {
      // If sent back to lobby
      if (data.status === 'waiting') {
        window.location.href = `/lobby.html?roomCode=${roomCode}&playerId=${playerId}`;
      }
    });
  }

  function setupEventListeners() {
    // Draw pile click
    document.getElementById('drawPile').addEventListener('click', () => {
      if (!isMyTurn()) return;
      drawCard();
    });

    // UNO button
    document.getElementById('unoButton').addEventListener('click', () => {
      callUno();
    });

    // Combo play button
    document.getElementById('comboPlayBtn').addEventListener('click', () => {
      playSelectedCards();
    });

    // Challenge UNO button
    document.getElementById('challengeUnoBtn').addEventListener('click', () => {
      challengeUno();
    });

    // Color picker buttons
    document.querySelectorAll('.color-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        chooseColor(color);
      });
    });

    // Log toggle
    document.getElementById('toggleLog').addEventListener('click', () => {
      document.getElementById('gameLog').classList.toggle('open');
    });

    // Leave button
    document.getElementById('btnLeave').addEventListener('click', () => {
      if (confirm('Leave the game?')) {
        socket.emit('leave-room', null, () => {
          window.location.href = '/';
        });
      }
    });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!gameState || !gameState.hand) return;

      const cards = document.querySelectorAll('#handContainer .card');
      const currentIndex = Array.from(cards).findIndex(c => c.dataset.cardId === selectedCardId);

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (cards.length > 0) {
            const newIdx = currentIndex <= 0 ? cards.length - 1 : currentIndex - 1;
            selectCard(cards[newIdx].dataset.cardId);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (cards.length > 0) {
            const newIdx = currentIndex >= cards.length - 1 ? 0 : currentIndex + 1;
            selectCard(cards[newIdx].dataset.cardId);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedCardId && isMyTurn()) {
            playCard(selectedCardId);
          }
          break;
        case ' ':
          e.preventDefault();
          if (isMyTurn()) drawCard();
          break;
        case 'u':
        case 'U':
          callUno();
          break;
      }
    });
  }

  // Game state management
  function updateGameState(state) {
    const prevCurrentPlayerId = lastCurrentPlayerId;
    gameState = state;
    comboMode = !!state.comboPlayEnabled;
    lastCurrentPlayerId = state.currentPlayerId;

    // Reset combo selection on turn change
    if (state.currentPlayerId !== prevCurrentPlayerId) {
      selectedComboIds = [];
    }

    renderOpponents();
    renderHand();
    renderPlayArea();
    updateTurnInfo();
    updateUnoButton();
    updateChallengeButton();
    updateComboButton();
    startTurnTimer();

    // Check for color choice needed
    if (state.state === 'CHOOSING_COLOR' && state.waitingForColorChoice === playerId) {
      UIHelpers.showModal('colorPickerModal');
    }

    // Check for swap target needed
    if (state.state === 'CHOOSING_SWAP_TARGET' && state.waitingForSwapTarget === playerId) {
      showSwapModal();
    }
  }

  function renderOpponents() {
    const area = document.getElementById('opponentsArea');
    area.innerHTML = '';

    if (!gameState || !gameState.players) return;

    const opponents = gameState.players.filter(p => p.id !== playerId);
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63', '#00bcd4'];

    opponents.forEach((p, i) => {
      const isActive = gameState.currentPlayerId === p.id;
      const div = document.createElement('div');
      div.className = `opponent ${isActive ? 'active-turn' : ''} ${!p.connected ? 'disconnected' : ''}`;

      const color = colors[i % colors.length];
      const initial = (p.name || '?')[0].toUpperCase();
      const displayName = UIHelpers.formatPlayerName(p.name, p.isBot);

      div.innerHTML = `
        <div class="opponent-avatar" style="background:${color}">${initial}</div>
        <div class="opponent-name">${displayName}</div>
        <span class="opponent-card-count">${p.cardCount} cards</span>
        ${p.calledUno && p.cardCount === 1 ? '<span class="uno-badge">UNO</span>' : ''}
      `;

      // Add mini card backs
      const handEl = CardRenderer.createOpponentHand(p.cardCount);
      div.appendChild(handEl);

      area.appendChild(div);
    });
  }

  function renderHand() {
    const container = document.getElementById('handContainer');
    container.innerHTML = '';

    if (!gameState || !gameState.hand) return;

    const playableIds = new Set(gameState.playableCards || []);

    gameState.hand.forEach((card, idx) => {
      const el = CardRenderer.createCard(card, { clickable: true });
      el.style.animationDelay = `${idx * 0.05}s`;

      const isPlayable = isMyTurn() && playableIds.has(card.id);
      if (isMyTurn() && !isPlayable && gameState.pendingDrawCount === 0) {
        el.classList.add('dimmed');
      }
      if (isPlayable) {
        el.classList.add('playable');
      }
      if (card.id === selectedCardId) {
        el.classList.add('selected');
      }

      // Combo selection visuals
      const comboIndex = selectedComboIds.indexOf(card.id);
      if (comboIndex !== -1) {
        el.classList.add('combo-selected');
        const badge = document.createElement('span');
        badge.className = 'combo-badge';
        badge.textContent = comboIndex + 1;
        el.appendChild(badge);
      }

      el.addEventListener('click', () => {
        if (comboMode && isMyTurn() && card.type === 'number') {
          toggleComboCard(card.id);
        } else if (selectedCardId === card.id) {
          // Second click = play
          if (isMyTurn()) playCard(card.id);
        } else {
          selectCard(card.id);
        }
      });

      container.appendChild(el);
    });
  }

  function renderPlayArea() {
    if (!gameState) return;

    // Discard pile
    const discardPile = document.getElementById('discardPile');
    discardPile.innerHTML = '';

    if (gameState.topCard) {
      const topCard = CardRenderer.createCard(gameState.topCard);
      topCard.style.cursor = 'default';
      topCard.addEventListener('mouseenter', () => {});
      discardPile.appendChild(topCard);
    }

    // Draw count
    document.getElementById('drawCount').textContent = gameState.drawPileCount || 0;

    // Color indicator
    const indicator = document.getElementById('colorIndicator');
    indicator.className = 'color-indicator';
    if (gameState.currentColor) {
      indicator.classList.add(gameState.currentColor);
    }

    // Direction
    const dirEl = document.getElementById('directionIndicator');
    dirEl.className = 'direction-indicator';
    if (gameState.direction === -1) {
      dirEl.classList.add('counter-clockwise');
    }

    // Pending draw
    const pendingEl = document.getElementById('pendingDraw');
    if (gameState.pendingDrawCount > 0) {
      pendingEl.style.display = 'block';
      pendingEl.textContent = `+${gameState.pendingDrawCount}`;
    } else {
      pendingEl.style.display = 'none';
    }
  }

  function updateTurnInfo() {
    const el = document.getElementById('turnInfo');
    if (!gameState) return;

    if (isMyTurn()) {
      el.className = 'turn-info your-turn';
      if (gameState.pendingDrawCount > 0) {
        el.textContent = `Your turn - Draw ${gameState.pendingDrawCount} cards!`;
      } else {
        el.textContent = 'Your turn!';
      }
      SoundFX.yourTurn();
    } else {
      el.className = 'turn-info';
      const current = gameState.players.find(p => p.id === gameState.currentPlayerId);
      el.textContent = current ? `${UIHelpers.formatPlayerName(current.name, current.isBot)}'s turn` : 'Waiting...';
    }
  }

  function updateUnoButton() {
    const btn = document.getElementById('unoButton');
    if (!gameState || !gameState.hand) {
      btn.classList.remove('visible');
      return;
    }

    // Show UNO button when player has exactly 2 cards and hasn't already called UNO
    // Also show when combo selection would leave 1 card
    const me = gameState.players.find(p => p.id === playerId);
    const effectiveCards = gameState.hand.length - selectedComboIds.length;
    const showUno = (gameState.hand.length === 2 || (comboMode && effectiveCards === 1 && selectedComboIds.length >= 2));
    if (showUno && !(me && me.calledUno)) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }

  function updateChallengeButton() {
    const btn = document.getElementById('challengeUnoBtn');
    if (!gameState) {
      btn.classList.remove('visible');
      return;
    }

    // Show challenge button if any opponent has 1 card and hasn't called UNO
    const opponents = gameState.players.filter(p => p.id !== playerId);
    const canChallenge = opponents.some(p => p.cardCount === 1 && !p.calledUno);

    if (canChallenge) {
      btn.classList.add('visible');
      // Store target for challenge
      const target = opponents.find(p => p.cardCount === 1 && !p.calledUno);
      btn.dataset.targetId = target.id;
    } else {
      btn.classList.remove('visible');
    }
  }

  function startTurnTimer() {
    if (turnTimerInterval) clearInterval(turnTimerInterval);

    const bar = document.getElementById('turnTimerBar');
    if (!isMyTurn()) {
      bar.style.width = '100%';
      bar.classList.remove('urgent');
      return;
    }

    turnStartTime = Date.now();
    turnTimerInterval = setInterval(() => {
      const elapsed = Date.now() - turnStartTime;
      const remaining = Math.max(0, 1 - elapsed / TURN_TIMEOUT);
      bar.style.width = (remaining * 100) + '%';
      if (remaining < 0.2) {
        bar.classList.add('urgent');
      } else {
        bar.classList.remove('urgent');
      }
      if (remaining <= 0) {
        clearInterval(turnTimerInterval);
      }
    }, 100);
  }

  // Actions
  function selectCard(cardId) {
    selectedCardId = cardId;
    renderHand();
  }

  function playCard(cardId) {
    if (!isMyTurn()) return;

    const card = gameState.hand.find(c => c.id === cardId);
    if (!card) return;

    // For wild cards, we'll show the color picker after server confirms
    socket.emit('play-card', { cardId }, (res) => {
      if (res.success) {
        selectedCardId = null;
        if (res.needsColorChoice) {
          UIHelpers.showModal('colorPickerModal');
        }
      } else {
        UIHelpers.showToast(res.error || 'Cannot play that card', 'error');
      }
    });
  }

  function drawCard() {
    if (!isMyTurn()) return;

    socket.emit('draw-card', null, (res) => {
      if (res.success) {
        if (res.canPlay && res.drawnCardId) {
          // Ask if they want to play the drawn card
          UIHelpers.showToast('You drew a playable card! Click it to play or draw again.', 'info');
          // The card will be in the updated hand, highlight it
          selectedCardId = res.drawnCardId;
        }
      } else {
        UIHelpers.showToast(res.error || 'Cannot draw', 'error');
      }
    });
  }

  function callUno() {
    socket.emit('call-uno', null, (res) => {
      if (res.success) {
        UIHelpers.showToast('UNO!', 'success');
        updateUnoButton();
      }
    });
  }

  function challengeUno() {
    const btn = document.getElementById('challengeUnoBtn');
    const targetId = btn.dataset.targetId;
    if (!targetId) return;

    socket.emit('challenge-uno', { targetId }, (res) => {
      if (res.success && res.caught) {
        UIHelpers.showToast('Challenge successful!', 'success');
      } else {
        UIHelpers.showToast('Challenge failed - they called UNO', 'error');
      }
    });
  }

  function toggleComboCard(cardId) {
    const idx = selectedComboIds.indexOf(cardId);
    if (idx !== -1) {
      selectedComboIds.splice(idx, 1);
    } else {
      selectedComboIds.push(cardId);
    }
    renderHand();
    updateComboButton();
    updateUnoButton();
  }

  function validateComboChainClient() {
    if (selectedComboIds.length < 1) return false;
    if (!gameState) return false;

    const cards = selectedComboIds.map(id => gameState.hand.find(c => c.id === id));
    if (cards.some(c => !c || c.type !== 'number')) return false;

    // First card must be playable on top card
    const top = gameState.topCard;
    const color = gameState.currentColor;
    const first = cards[0];
    if (first.color !== color && first.value !== top.value) return false;

    // Each subsequent must match previous by value (same number)
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].value !== cards[i-1].value) return false;
    }
    return true;
  }

  function playSelectedCards() {
    if (!isMyTurn() || selectedComboIds.length < 1) return;
    if (!validateComboChainClient()) {
      UIHelpers.showToast('Invalid selection', 'error');
      return;
    }

    if (selectedComboIds.length === 1) {
      // Single card — use normal play-card flow
      const cardId = selectedComboIds[0];
      socket.emit('play-card', { cardId }, (res) => {
        if (res.success) {
          selectedComboIds = [];
          selectedCardId = null;
          if (res.needsColorChoice) {
            UIHelpers.showModal('colorPickerModal');
          }
        } else {
          UIHelpers.showToast(res.error || 'Cannot play that card', 'error');
        }
      });
    } else {
      // Multiple cards — use combo flow
      socket.emit('play-combo', { cardIds: selectedComboIds }, (res) => {
        if (res.success) {
          selectedComboIds = [];
          selectedCardId = null;
        } else {
          UIHelpers.showToast(res.error || 'Cannot play combo', 'error');
        }
      });
    }
  }

  function updateComboButton() {
    const existing = document.getElementById('comboPlayBtn');
    if (!comboMode || !isMyTurn() || selectedComboIds.length < 1) {
      if (existing) existing.style.display = 'none';
      return;
    }

    const valid = validateComboChainClient();
    if (!existing) return;
    existing.style.display = 'inline-block';
    if (selectedComboIds.length === 1) {
      existing.textContent = 'Play Card';
    } else {
      existing.textContent = `Play Combo (${selectedComboIds.length} cards)`;
    }
    existing.disabled = !valid;
    if (valid) {
      existing.classList.add('valid');
    } else {
      existing.classList.remove('valid');
    }
  }

  function chooseColor(color) {
    socket.emit('choose-color', { color }, (res) => {
      if (res.success) {
        UIHelpers.hideModal('colorPickerModal');
      }
    });
  }

  function showSwapModal() {
    const picker = document.getElementById('swapPicker');
    picker.innerHTML = '';

    const opponents = gameState.players.filter(p => p.id !== playerId);
    opponents.forEach(p => {
      const div = document.createElement('div');
      div.className = 'swap-target';
      div.innerHTML = `
        <strong>${UIHelpers.formatPlayerName(p.name, p.isBot)}</strong>
        <span>${p.cardCount} cards</span>
      `;
      div.addEventListener('click', () => {
        socket.emit('swap-target', { targetId: p.id }, (res) => {
          if (res.success) {
            UIHelpers.hideModal('swapModal');
          }
        });
      });
      picker.appendChild(div);
    });

    UIHelpers.showModal('swapModal');
  }

  function showRoundOverModal(data) {
    const content = document.getElementById('endModalContent');
    const isWinner = data.winner && data.winner.id === playerId;

    if (isWinner) { UIHelpers.showConfetti(); SoundFX.win(); }

    content.innerHTML = `
      <h2>${isWinner ? 'You won the round!' : `${data.winner?.name || 'Someone'} wins!`}</h2>
      <p>Round score: ${data.roundScore}</p>
      <table class="score-table">
        <thead><tr><th>Player</th><th>Hand Value</th><th>Cards Left</th></tr></thead>
        <tbody>
          ${(data.handValues || []).map(h => `
            <tr>
              <td>${h.playerName}</td>
              <td>${h.handValue}</td>
              <td>${h.cardCount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="end-actions">
        <button class="btn-primary" onclick="document.getElementById('endModal').style.display='none'; socket.emit('rematch', null, function(r) { if(r.backToLobby) window.location.href='/lobby.html?roomCode=${roomCode}&playerId=${playerId}'; })">
          Next Round
        </button>
        <button class="btn-secondary" onclick="window.location.href='/'">Leave</button>
      </div>
    `;
    UIHelpers.showModal('endModal');
  }

  function showGameOverModal(data) {
    const content = document.getElementById('endModalContent');
    const isWinner = data.winner && data.winner.id === playerId;

    if (isWinner) { UIHelpers.showConfetti(); SoundFX.win(); }

    content.innerHTML = `
      <h2>${isWinner ? 'You won the game!' : `${data.winner?.name || 'Someone'} wins the game!`}</h2>
      <table class="score-table">
        <thead><tr><th>Rank</th><th>Player</th><th>Total Score</th></tr></thead>
        <tbody>
          ${(data.finalStandings || []).map(s => `
            <tr>
              <td>#${s.rank}</td>
              <td>${s.playerName}</td>
              <td>${s.totalScore}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="end-actions">
        <button class="btn-primary" onclick="socket.emit('rematch', null, function(r) { if(r.backToLobby) window.location.href='/lobby.html?roomCode=${roomCode}&playerId=${playerId}'; document.getElementById('endModal').style.display='none'; })">
          Rematch
        </button>
        <button class="btn-secondary" onclick="window.location.href='/'">Leave</button>
      </div>
    `;
    UIHelpers.showModal('endModal');
  }

  // Helpers
  function isMyTurn() {
    return gameState && gameState.currentPlayerId === playerId && gameState.state === 'PLAYING';
  }

  function formatCardName(card) {
    if (!card) return 'a card';
    if (card.color === 'wild') return card.value === 'wild' ? 'Wild' : 'Wild Draw 4';
    return `${card.color} ${card.value}`;
  }

  function addLogEntry(text) {
    const entries = document.getElementById('logEntries');
    if (!entries) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = text;
    entries.prepend(entry);

    // Limit log entries
    while (entries.children.length > 50) {
      entries.lastChild.remove();
    }
  }

  // Sound effects via Web Audio API
  const SoundFX = {
    _ctx: null,
    _getCtx() {
      if (!this._ctx) {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      return this._ctx;
    },
    _play(freq, type, duration, volume = 0.3) {
      try {
        const ctx = this._getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch { /* audio not available */ }
    },
    playCard() { this._play(600, 'sine', 0.1); },
    drawCard() { this._play(300, 'triangle', 0.15); },
    yourTurn() { this._play(880, 'sine', 0.08); setTimeout(() => this._play(1100, 'sine', 0.12), 100); },
    uno() { this._play(1000, 'square', 0.05, 0.2); setTimeout(() => this._play(1200, 'square', 0.1, 0.2), 80); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._play(f, 'sine', 0.2), i * 150));
    },
    timeout() { this._play(200, 'sawtooth', 0.3, 0.15); },
  };

  // Browser tab visibility handling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Pause turn timer animation when tab is hidden
      if (turnTimerInterval) clearInterval(turnTimerInterval);
    } else {
      // Resume timer and refresh state when tab becomes visible
      if (gameState && isMyTurn()) {
        startTurnTimer();
      }
      // Fetch fresh state
      if (socket && socket.connected) {
        socket.emit('game-state', null, (res) => {
          if (res.success) updateGameState(res.state);
        });
      }
    }
  });

  // Make socket available globally for onclick handlers
  window.socket = null;

  // Start
  document.addEventListener('DOMContentLoaded', () => {
    init();
    window.socket = socket;
  });
})();
