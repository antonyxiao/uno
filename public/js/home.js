/* ============================================================
   UNO Online - Home Page Logic
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM refs ----
  const playerNameInput   = document.getElementById('playerName');
  const roomCodeInput     = document.getElementById('roomCodeInput');
  const btnCreateRoom     = document.getElementById('btnCreateRoom');
  const btnJoinRoom       = document.getElementById('btnJoinRoom');
  const toastContainer    = document.getElementById('toastContainer');
  const connectionDot     = document.getElementById('connectionDot');
  const connectionLabel   = document.getElementById('connectionLabel');
  const floatingCardsEl   = document.getElementById('floatingCards');

  // ---- Constants ----
  const STORAGE_KEY_NAME = 'uno_player_name';
  const CARD_COLORS      = ['fc-red', 'fc-blue', 'fc-green', 'fc-yellow'];
  const FLOATING_COUNT   = 18;

  // ---- Socket.IO ----
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // ---- Connection status ----
  socket.on('connect', function () {
    connectionDot.classList.remove('disconnected', 'reconnecting');
    connectionLabel.textContent = 'Connected';
  });

  socket.on('disconnect', function () {
    connectionDot.classList.add('disconnected');
    connectionDot.classList.remove('reconnecting');
    connectionLabel.textContent = 'Disconnected';
  });

  socket.on('reconnect_attempt', function () {
    connectionDot.classList.remove('disconnected');
    connectionDot.classList.add('reconnecting');
    connectionLabel.textContent = 'Reconnecting...';
  });

  // ---- Player name persistence ----
  function loadPlayerName() {
    var saved = localStorage.getItem(STORAGE_KEY_NAME);
    if (saved) {
      playerNameInput.value = saved;
    }
  }

  function savePlayerName() {
    var name = playerNameInput.value.trim();
    if (name) {
      localStorage.setItem(STORAGE_KEY_NAME, name);
    }
  }

  function getPlayerName() {
    var name = playerNameInput.value.trim();
    if (!name) {
      showToast('Please enter your name first.', 'warning');
      playerNameInput.focus();
      return null;
    }
    savePlayerName();
    return name;
  }

  // ---- Auto-fill room code from /join/:code URL ----
  function autoFillRoomCode() {
    var path = window.location.pathname;
    var match = path.match(/^\/join\/([A-Za-z0-9_-]+)$/);
    if (match) {
      roomCodeInput.value = match[1].toUpperCase();
      window.history.replaceState(null, '', '/');
      showToast('Room code auto-filled. Enter your name and click Join!', 'success');
      roomCodeInput.focus();
    }
  }

  // ---- Create Room (callback-based) ----
  function handleCreateRoom() {
    var name = getPlayerName();
    if (!name) return;

    setButtonLoading(btnCreateRoom, true);
    socket.emit('create-room', { playerName: name }, function (res) {
      setButtonLoading(btnCreateRoom, false);
      if (res.success) {
        var roomCode = res.room.code;
        var pid = res.playerId;
        window.location.href = '/lobby.html?roomCode=' + encodeURIComponent(roomCode) + '&playerId=' + encodeURIComponent(pid);
      } else {
        showToast(res.error || 'Failed to create room', 'error');
      }
    });
  }

  // ---- Join Room (callback-based) ----
  function handleJoinRoom() {
    var name = getPlayerName();
    if (!name) return;

    var code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      showToast('Please enter a room code.', 'warning');
      roomCodeInput.focus();
      return;
    }

    setButtonLoading(btnJoinRoom, true);
    socket.emit('join-room', { playerName: name, roomCode: code }, function (res) {
      setButtonLoading(btnJoinRoom, false);
      if (res.success) {
        var roomCode = res.room.code;
        var pid = res.playerId;
        window.location.href = '/lobby.html?roomCode=' + encodeURIComponent(roomCode) + '&playerId=' + encodeURIComponent(pid);
      } else {
        showToast(res.error || 'Failed to join room', 'error');
      }
    });
  }

  // ---- UI helpers ----

  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4000;

    var toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'info' ? ' ' + type : '');
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      toast.addEventListener('animationend', function () {
        toast.remove();
      });
    }, duration);
  }

  function setButtonLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.innerHTML = '<span class="spinner"></span>';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || btn.textContent;
    }
  }

  // ---- Floating cards background ----
  function createFloatingCards() {
    for (var i = 0; i < FLOATING_COUNT; i++) {
      var card = document.createElement('div');
      var colorClass = CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)];
      card.className = 'floating-card ' + colorClass;

      var left = Math.random() * 100;
      var duration = 12 + Math.random() * 20;
      var delay = -(Math.random() * duration);
      var scale = 0.6 + Math.random() * 0.8;

      card.style.left = left + '%';
      card.style.animationDuration = duration + 's';
      card.style.animationDelay = delay + 's';
      card.style.transform = 'scale(' + scale + ')';

      floatingCardsEl.appendChild(card);
    }
  }

  // ---- Enter key shortcuts ----
  playerNameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      if (roomCodeInput.value.trim()) {
        handleJoinRoom();
      } else {
        roomCodeInput.focus();
      }
    }
  });

  roomCodeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  });

  // Auto-uppercase room code as user types
  roomCodeInput.addEventListener('input', function () {
    var pos = roomCodeInput.selectionStart;
    roomCodeInput.value = roomCodeInput.value.toUpperCase();
    roomCodeInput.setSelectionRange(pos, pos);
  });

  // ---- Init ----
  btnCreateRoom.addEventListener('click', handleCreateRoom);
  btnJoinRoom.addEventListener('click', handleJoinRoom);

  loadPlayerName();
  autoFillRoomCode();
  createFloatingCards();
})();
