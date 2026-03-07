/* =============================================
   UNO Lobby - Client Logic
   ============================================= */

(function () {
  'use strict';

  // ---- URL Params ----
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get('roomCode');
  const playerId = params.get('playerId');

  if (!roomCode || !playerId) {
    window.location.href = '/';
    return;
  }

  // ---- DOM References ----
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const roomLinkDisplay = document.getElementById('roomLinkDisplay');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const playerList = document.getElementById('playerList');
  const playerCount = document.getElementById('playerCount');
  const hostControls = document.getElementById('hostControls');
  const addBotBtn = document.getElementById('addBotBtn');
  const botDifficulty = document.getElementById('botDifficulty');
  const startGameBtn = document.getElementById('startGameBtn');
  const settingsContainer = document.getElementById('settingsContainer');
  const chatMessages = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const connectionDot = document.getElementById('connectionDot');
  const connectionText = document.getElementById('connectionText');
  const toastContainer = document.getElementById('toastContainer');

  // ---- State ----
  let isHost = false;
  let currentRoom = null;

  // ---- Avatar colors ----
  const avatarColors = [
    '#FF5555', '#5555FF', '#55AA55', '#FFAA00',
    '#e91e63', '#9c27b0', '#00bcd4', '#ff5722',
    '#607d8b', '#795548'
  ];

  function getAvatarColor(index) {
    return avatarColors[index % avatarColors.length];
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // ---- Room Info Display ----
  const shareLink = window.location.origin + '/join/' + roomCode;
  roomCodeDisplay.textContent = roomCode;
  roomLinkDisplay.textContent = shareLink;
  document.title = 'UNO Lobby - ' + roomCode;

  // ---- Copy Buttons ----
  function copyToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      const label = btn.querySelector('.copy-label');
      const original = label.textContent;
      label.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(function () {
        label.textContent = original;
        btn.classList.remove('copied');
      }, 2000);
    }).catch(function () {
      showToast('Failed to copy to clipboard', 'error');
    });
  }

  copyCodeBtn.addEventListener('click', function () {
    copyToClipboard(roomCode, copyCodeBtn);
  });

  copyLinkBtn.addEventListener('click', function () {
    copyToClipboard(shareLink, copyLinkBtn);
  });

  // ---- Toast Notifications ----
  function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      toast.addEventListener('animationend', function () {
        toast.remove();
      });
    }, 3000);
  }

  // ---- Socket.IO Connection ----
  var socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', function () {
    connectionDot.className = 'connection-dot';
    connectionText.textContent = 'Connected';

    // Reconnect to the room with our playerId
    socket.emit('reconnect-player', { playerId: playerId, roomCode: roomCode }, function (res) {
      if (res.success) {
        updateRoom(res.room);
        if (res.gameState) {
          // Game is in progress, redirect to game page
          window.location.href = '/game.html?roomCode=' + roomCode + '&playerId=' + playerId;
        }
      } else {
        showToast(res.error || 'Failed to reconnect to room', 'error');
        setTimeout(function () {
          window.location.href = '/';
        }, 2000);
      }
    });
  });

  socket.on('disconnect', function () {
    connectionDot.className = 'connection-dot disconnected';
    connectionText.textContent = 'Disconnected';
  });

  socket.on('reconnect_attempt', function () {
    connectionDot.className = 'connection-dot reconnecting';
    connectionText.textContent = 'Reconnecting...';
  });

  // ---- Room Updated (broadcast from server) ----
  socket.on('room-updated', function (room) {
    updateRoom(room);
  });

  function updateRoom(room) {
    currentRoom = room;
    renderPlayerList(room);
    renderSettings(room);
    updateHostState(room);
    updateStartButton(room);
  }

  // ---- Kicked ----
  socket.on('kicked', function () {
    showToast('You have been kicked from the room', 'error');
    setTimeout(function () {
      window.location.href = '/';
    }, 1500);
  });

  // ---- Game Started ----
  socket.on('game-started', function () {
    window.location.href = '/game.html?roomCode=' + roomCode + '&playerId=' + playerId;
  });

  // ---- Render Player List ----
  function renderPlayerList(room) {
    var players = room.players || [];
    playerList.innerHTML = '';
    playerCount.textContent = players.length + '/' + (room.maxPlayers || 10);

    players.forEach(function (player, index) {
      var li = document.createElement('li');
      li.className = 'player-card';

      var isMe = player.id === playerId;
      var isPlayerHost = player.id === room.hostId;
      var isBot = player.isBot;

      // Avatar
      var avatar = document.createElement('div');
      avatar.className = 'player-avatar';
      avatar.style.background = getAvatarColor(index);
      avatar.textContent = getInitials(player.name);

      // Details
      var details = document.createElement('div');
      details.className = 'player-details';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.textContent = player.name;

      // Host crown
      if (isPlayerHost) {
        var crown = document.createElement('span');
        crown.className = 'crown-icon';
        crown.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/><path d="M5 19h14v2H5z"/></svg>';
        nameSpan.appendChild(crown);
      }

      // Tags
      if (isPlayerHost) {
        var hostTag = document.createElement('span');
        hostTag.className = 'player-tag tag-host';
        hostTag.textContent = 'Host';
        nameSpan.appendChild(hostTag);
      }

      if (isBot) {
        var botTag = document.createElement('span');
        botTag.className = 'player-tag tag-bot';
        botTag.textContent = 'Bot';
        nameSpan.appendChild(botTag);
      }

      if (isMe) {
        var youTag = document.createElement('span');
        youTag.className = 'player-tag tag-you';
        youTag.textContent = 'You';
        nameSpan.appendChild(youTag);
      }

      details.appendChild(nameSpan);

      li.appendChild(avatar);
      li.appendChild(details);

      // Host actions (kick player or remove bot)
      if (isHost && !isMe && !isPlayerHost) {
        var actions = document.createElement('div');
        actions.className = 'player-actions';

        if (isBot) {
          var removeBtn = document.createElement('button');
          removeBtn.className = 'btn-remove-bot';
          removeBtn.title = 'Remove bot';
          removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          removeBtn.addEventListener('click', function () {
            socket.emit('remove-bot', { botId: player.id }, function (res) {
              if (!res.success) {
                showToast(res.error || 'Failed to remove bot', 'error');
              }
            });
          });
          actions.appendChild(removeBtn);
        } else {
          var kickBtn = document.createElement('button');
          kickBtn.className = 'btn-kick';
          kickBtn.title = 'Kick player';
          kickBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          kickBtn.addEventListener('click', function () {
            if (confirm('Kick ' + player.name + ' from the room?')) {
              socket.emit('kick-player', { targetId: player.id }, function (res) {
                if (!res.success) {
                  showToast(res.error || 'Failed to kick player', 'error');
                }
              });
            }
          });
          actions.appendChild(kickBtn);
        }

        li.appendChild(actions);
      }

      playerList.appendChild(li);
    });
  }

  // ---- Update Host State ----
  function updateHostState(room) {
    isHost = room.hostId === playerId;

    if (isHost) {
      hostControls.style.display = 'block';
      startGameBtn.style.display = '';
      settingsContainer.classList.remove('settings-disabled');
      enableSettingsInputs(true);
    } else {
      hostControls.style.display = 'none';
      startGameBtn.style.display = 'none';
      settingsContainer.classList.add('settings-disabled');
      enableSettingsInputs(false);
    }
  }

  function enableSettingsInputs(enabled) {
    var toggles = settingsContainer.querySelectorAll('input[type="checkbox"]');
    toggles.forEach(function (toggle) {
      toggle.disabled = !enabled;
    });
    var selects = settingsContainer.querySelectorAll('select[data-setting]');
    selects.forEach(function (sel) {
      sel.disabled = !enabled;
    });
  }

  // ---- Render Settings ----
  function renderSettings(room) {
    var settings = room.settings || {};

    // Update toggles
    var toggles = settingsContainer.querySelectorAll('input[type="checkbox"][data-setting]');
    toggles.forEach(function (toggle) {
      var key = toggle.getAttribute('data-setting');
      if (settings.hasOwnProperty(key)) {
        toggle.checked = !!settings[key];
      }
    });

    // Update selects
    var selects = settingsContainer.querySelectorAll('select[data-setting]');
    selects.forEach(function (sel) {
      var key = sel.getAttribute('data-setting');
      if (settings.hasOwnProperty(key)) {
        sel.value = String(settings[key]);
      }
    });
  }

  // ---- Settings Change Handlers (callback-based) ----
  settingsContainer.addEventListener('change', function (e) {
    if (!isHost) return;

    var target = e.target;
    var settingKey = target.getAttribute('data-setting');
    if (!settingKey) return;

    var value;
    if (target.type === 'checkbox') {
      value = target.checked;
    } else {
      value = target.value;
      if (/^\d+$/.test(value)) {
        value = parseInt(value, 10);
      }
    }

    var update = {};
    update[settingKey] = value;

    socket.emit('update-settings', { settings: update }, function (res) {
      if (!res.success) {
        showToast(res.error || 'Failed to update settings', 'error');
      }
    });
  });

  // ---- Update Start Button ----
  function updateStartButton(room) {
    var players = room.players || [];
    var hasEnough = players.length >= 2;
    startGameBtn.disabled = !hasEnough;

    if (hasEnough) {
      startGameBtn.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
        'Start Game (' + players.length + ' players)';
    } else {
      startGameBtn.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
        'Need at least 2 players';
    }
  }

  // ---- Start Game (callback-based) ----
  startGameBtn.addEventListener('click', function () {
    if (!isHost || startGameBtn.disabled) return;
    startGameBtn.disabled = true;
    startGameBtn.innerHTML = '<span class="spinner"></span> Starting...';

    socket.emit('start-game', {}, function (res) {
      if (!res.success) {
        showToast(res.error || 'Failed to start game', 'error');
        startGameBtn.disabled = false;
        updateStartButton(currentRoom || { players: [] });
      }
      // On success, the 'game-started' event will redirect us
    });
  });

  // ---- Add Bot (callback-based) ----
  addBotBtn.addEventListener('click', function () {
    var difficulty = botDifficulty.value;
    socket.emit('add-bot', { difficulty: difficulty }, function (res) {
      if (!res.success) {
        showToast(res.error || 'Failed to add bot', 'error');
      }
    });
  });

  // ---- Chat ----
  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = chatInput.value.trim();
    if (!message) return;

    socket.emit('chat-message', { message: message });
    chatInput.value = '';
  });

  socket.on('chat-message', function (data) {
    appendChatMessage(data.playerName, data.message, data.playerId === playerId);
  });

  function appendChatMessage(author, message, isSelf) {
    var div = document.createElement('div');
    div.className = 'chat-msg';

    var authorSpan = document.createElement('span');
    authorSpan.className = 'chat-msg-author';
    authorSpan.style.color = isSelf ? 'var(--success)' : 'var(--accent)';
    authorSpan.textContent = author + ':';

    var textSpan = document.createElement('span');
    textSpan.className = 'chat-msg-text';
    textSpan.textContent = message;

    div.appendChild(authorSpan);
    div.appendChild(textSpan);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendSystemMessage(message) {
    var div = document.createElement('div');
    div.className = 'chat-msg-system';
    div.textContent = message;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Initial system message
  appendSystemMessage('Welcome to the lobby! Waiting for players...');

})();
