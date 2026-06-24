    // ── Friends list rendering ────────────────────────────────
    async function renderFriendsList() {
      const listEl    = document.getElementById('friends-list');
      const pendingEl = document.getElementById('pending-list');
      const countEl   = document.getElementById('friends-count');
      if (!listEl) return;

      if (countEl) countEl.textContent = myFriends.size > 0 ? '('+myFriends.size+')' : '';

      // render confirmed friends
      if (myFriends.size === 0) {
        listEl.innerHTML = '<div class="friends-empty">No friends yet — search above to add some!</div>';
      } else {
        const uids = [...myFriends];
        const players = await Promise.all(uids.map(uid => getPlayerCardData(uid)));
        listEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = uids[i];
          const online = onlineUsers.has(uid);
          listEl.insertAdjacentHTML('beforeend', friendItemHtml(uid, data, 'remove', online));
        });
      }

      // render pending incoming requests
      if (pendingEl && pendingIn.size > 0) {
        const uids = [...pendingIn];
        const players = await Promise.all(uids.map(uid => getPlayerCardData(uid)));
        pendingEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = uids[i];
          pendingEl.insertAdjacentHTML('beforeend', friendItemHtml(uid, data, 'accept'));
        });
      }
    }

    function friendItemHtml(uid, data, action, online) {
      const avatar = data.photoURL
        ? '<img src="'+escHtml(data.photoURL)+'" referrerpolicy="no-referrer">'
        : '<div class="friend-avatar-ph">👤</div>';
      const onlineDot = online ? ' <span class="online-dot"></span>' : '';
      const score = data.time ? gameConfig().scoreLabel(data.time) : 'No score yet';
      let btns = '';
      if (action === 'remove') btns = '<button class="friend-btn remove" onclick="removeFriend(\''+uid+'\');renderFriendsList()">Remove</button>';
      if (action === 'accept') btns =
        '<button class="friend-btn accept" onclick="acceptFriendRequest(\''+uid+'\');renderFriendsList()" style="margin-right:6px;">Accept</button>'+
        '<button class="friend-btn decline" onclick="declineFriendRequest(\''+uid+'\');renderFriendsList()">Decline</button>';
      return '<div class="friend-item">'+avatar+
        '<div class="friend-info"><div class="friend-name">'+escHtml(data.name)+onlineDot+'</div>'+
        '<div class="friend-sub">'+escHtml(score)+'</div></div>'+
        '<div style="display:flex;gap:6px;">'+btns+'</div></div>';
    }

    let searchTimer;
    function onFriendSearch(val) {
      clearTimeout(searchTimer);
      const el = document.getElementById('friend-search-results');
      if (!val.trim()) { if (el) el.innerHTML = ''; return; }
      searchTimer = setTimeout(async () => {
        const results = await searchPlayers(val);
        if (!el) return;
        if (!results.length) { el.innerHTML = '<div class="friends-empty">No players found</div>'; return; }
        el.innerHTML = results.map(p => {
          const uid = p.uid;
          let action, label;
          if (myFriends.has(uid))     { action='remove';  label='Friends'; }
          else if (pendingOut.has(uid)){ action='pending'; label='Sent'; }
          else if (pendingIn.has(uid)) { action='accept';  label='Accept'; }
          else                         { action='add';     label='Add'; }
          return friendItemHtml(uid, p, action, onlineUsers.has(uid))
            .replace('onclick="removeFriend', 'onclick="removeFriend')  // keep existing handlers
            + ''; // friendItemHtml already generates correct btns for remove/accept
        }).join('');
        // for search results, replace accept/remove with add button for non-friends
        el.querySelectorAll('.friend-item').forEach((item, i) => {
          const uid = results[i].uid;
          if (!myFriends.has(uid) && !pendingIn.has(uid) && !pendingOut.has(uid)) {
            const btnArea = item.querySelector('div[style]');
            if (btnArea) btnArea.innerHTML = '<button class="friend-btn add" onclick="sendFriendRequest(\''+uid+'\',this)">Add</button>';
          }
        });
      }, 400);
    }

    // ── Live challenge system ─────────────────────────────────
    let activeChallengeId = null;
    let activeChallengeGame = 'reaction';
    let challengeUnsub = null;

    function sendLiveChallenge() {
      if (!sendLiveChallengeToUid(pmCurrentUid, null)) return;
      const cbtn = document.getElementById('pm-challenge-btn');
      if (cbtn) { cbtn.textContent = 'Challenge sent!'; cbtn.className = 'friend-btn pending'; cbtn.disabled = true; }
      closeModal('player-overlay');
    }

    function sendLiveChallengeToUid(toUid, toName) {
      if (!currentUser || !toUid || toUid === currentUser.uid) return false;
      if (gameConfig().hasScores === false) {
        showAchieveToast({ icon: '♟', name: 'Chess challenges are not available yet.' });
        return false;
      }
      if (!onlineUsers.has(toUid)) {
        showAchieveToast({ icon: '⚡', name: (toName || 'Friend') + ' is offline.' });
        return false;
      }
      const id = currentUser.uid + '_' + toUid + '_' + Date.now();
      db.collection('challenges').doc(id).set({
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Someone',
        fromScore: allTimeBest || null,
        game: activeGame,
        to: toUid,
        status: 'pending',
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });
      showAchieveToast({ icon: '⚡', name: 'Challenge sent to ' + (toName || 'friend') + '!' });
      return true;
    }

    function subscribeIncomingChallenges() {
      if (!currentUser) return;
      if (challengeUnsub) challengeUnsub();
      challengeUnsub = db.collection('challenges')
        .where('to', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snap => {
          snap.docChanges().forEach(change => {
            if (change.type === 'added') {
              const d = change.doc.data();
              // ignore challenges older than 30s
              const age = d.ts ? (Date.now() - d.ts.toMillis()) : 0;
              if (age > 30000) return;
              showChallengePopup(change.doc.id, d);
            }
          });
        });
    }

    auth.onAuthStateChanged(user => { if (user) subscribeIncomingChallenges(); });

    function showChallengePopup(docId, data) {
      activeChallengeId = docId;
      activeChallengeGame = GAME_CONFIG[data.game] ? data.game : 'reaction';
      document.getElementById('cp-name').textContent = escHtml(data.fromName);
      document.getElementById('cp-sub').textContent = data.fromScore
        ? gameConfigFor(activeChallengeGame).title + ' best: ' + gameConfigFor(activeChallengeGame).scoreLabel(data.fromScore)
        : 'wants to play ' + gameConfigFor(activeChallengeGame).title;
      document.getElementById('challenge-popup').classList.add('show');
      haptic('go');

      // auto-decline after 20s
      clearTimeout(window._challengeAutoDecline);
      window._challengeAutoDecline = setTimeout(() => declineChallenge(), 20000);
    }

    async function acceptChallenge() {
      clearTimeout(window._challengeAutoDecline);
      if (!activeChallengeId) return;
      db.collection('challenges').doc(activeChallengeId).update({ status: 'accepted' });
      document.getElementById('challenge-popup').classList.remove('show');
      activeGame = activeChallengeGame;
      localStorage.setItem('activeGame', activeGame);
      applyActiveGameUi();
      await loadActiveBest();
      subscribeLeaderboard();
      startChallengeCountdown();
      activeChallengeId = null;
    }

    function declineChallenge() {
      clearTimeout(window._challengeAutoDecline);
      if (activeChallengeId) {
        db.collection('challenges').doc(activeChallengeId).update({ status: 'declined' });
        activeChallengeId = null;
      }
      document.getElementById('challenge-popup').classList.remove('show');
    }

    function startChallengeCountdown() {
      // stop any current game, start a fresh one with a 3-2-1 countdown
      stopGame();
      if (activeGame === 'aim') {
        switchPage('game');
        document.getElementById('tab-selector')?.classList.add('active');
        startGame();
        return;
      }
      let count = 3;
      setGameState('wait');
      const ringEl2 = document.getElementById('watch-ring');
      const gameText2 = document.getElementById('game-text');
      const gameSub2 = document.getElementById('game-sub');
      gameText2.textContent = count;
      gameSub2.textContent = 'Challenge starts in...';
      haptic('tap');
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          gameText2.textContent = count;
          haptic('tap');
        } else {
          clearInterval(interval);
          gameSub2.textContent = '';
          startGame();
        }
      }, 1000);
      // switch to game tab
      switchPage('game');
      document.body.classList.remove('selector-mode');
      document.getElementById('tab-selector')?.classList.add('active');
    }

    // ── Online presence ──────────────────────────────────────────
    let presenceUnsub = null;
    let presenceHeartbeat = null;
    let presenceFreshnessTimer = null;
    let presenceUserId = null;
    const onlineUsers = new Set();
    const presenceDocs = new Map();
    let presenceUnloadHandler = null;
    const ONLINE_STALE_MS = 65000;

    function presencePayload(online) {
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || 'Player',
        online,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        ts: firebase.firestore.FieldValue.serverTimestamp()
      };
    }

    function startPresence() {
      if (!currentUser) return;
      clearInterval(presenceHeartbeat);
      presenceUserId = currentUser.uid;
      const ref = db.collection('presence').doc(currentUser.uid);
      ref.set(presencePayload(true), { merge: true }).catch(err => {
        console.error('Presence write error:', err);
        setFriendsStatus('Online status could not update. Check Firestore rules for presence.', 'error');
      });
      presenceHeartbeat = setInterval(() => {
        if (!currentUser) return;
        ref.set(presencePayload(true), { merge: true }).catch(err => console.error('Presence heartbeat error:', err));
      }, 20000);
      // mark offline on unload
      if (presenceUnloadHandler) {
        window.removeEventListener('beforeunload', presenceUnloadHandler);
        window.removeEventListener('pagehide', presenceUnloadHandler);
      }
      presenceUnloadHandler = () => ref.set({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      window.addEventListener('beforeunload', presenceUnloadHandler);
      window.addEventListener('pagehide', presenceUnloadHandler);
    }

    function stopPresence() {
      clearInterval(presenceHeartbeat);
      presenceHeartbeat = null;
      if (presenceUnloadHandler) {
        window.removeEventListener('beforeunload', presenceUnloadHandler);
        window.removeEventListener('pagehide', presenceUnloadHandler);
        presenceUnloadHandler = null;
      }
      const uid = presenceUserId || currentUser?.uid;
      presenceUserId = null;
      if (!uid) return;
      db.collection('presence').doc(uid).set({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(err => console.error('Presence stop error:', err));
    }

    function getPresenceMillis(data) {
      if (!data) return 0;
      const value = data.lastSeen || data.ts;
      if (!value) return 0;
      if (typeof value.toMillis === 'function') return value.toMillis();
      if (typeof value.toDate === 'function') return value.toDate().getTime();
      if (typeof value === 'number') return value;
      return 0;
    }

    function refreshOnlineUsers(forceRender) {
      const now = Date.now();
      let changed = false;
      const nextOnline = new Set();

      presenceDocs.forEach((data, uid) => {
        if (data.online === true && now - getPresenceMillis(data) <= ONLINE_STALE_MS) {
          nextOnline.add(uid);
        }
      });

      if (nextOnline.size !== onlineUsers.size) {
        changed = true;
      } else {
        nextOnline.forEach(uid => {
          if (!onlineUsers.has(uid)) changed = true;
        });
      }

      onlineUsers.clear();
      nextOnline.forEach(uid => onlineUsers.add(uid));

      if (!changed && !forceRender) return;
      if (document.getElementById('page-friends')?.classList.contains('active')) renderFriendsPage();
      document.querySelectorAll('#scores li[data-uid], #scores-inline li[data-uid]').forEach(li => {
        const uid = li.dataset.uid;
        const existing = li.querySelector('.online-dot');
        if (onlineUsers.has(uid) && !existing) {
          const nameEl = li.querySelector('.lname');
          if (nameEl) nameEl.insertAdjacentHTML('beforeend', '<span class="online-dot"></span>');
        } else if (!onlineUsers.has(uid) && existing) {
          existing.remove();
        }
      });
    }

    function subscribePresence() {
      if (presenceUnsub) presenceUnsub();
      presenceUnsub = db.collection('presence').where('online', '==', true).onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'removed') presenceDocs.delete(change.doc.id);
          else presenceDocs.set(change.doc.id, change.doc.data());
        });
        refreshOnlineUsers(true);
      }, err => {
        console.error('Presence listener error:', err);
        setFriendsStatus('Online status could not load. Check Firestore rules for presence.', 'error');
      });
      clearInterval(presenceFreshnessTimer);
      presenceFreshnessTimer = setInterval(() => refreshOnlineUsers(false), 10000);
    }

    auth.onAuthStateChanged(user => {
      if (user) { startPresence(); subscribePresence(); }
      else {
        stopPresence();
        if (presenceUnsub) presenceUnsub();
        clearInterval(presenceFreshnessTimer);
        presenceFreshnessTimer = null;
        presenceDocs.clear();
        onlineUsers.clear();
      }
    });

    // ── Friends ───────────────────────────────────────────────
    let myFriends = new Set();       // uids of confirmed friends
    let pendingOut = new Set();      // sent requests (their uid)
    let pendingIn  = new Set();      // received requests (their uid)
    let friendsUnsub = null, requestsInUnsub = null, requestsOutUnsub = null;
    let pmCurrentUid = null;         // uid shown in player modal
    let activeChatUid = null;
    let activeChatUnsub = null;

    function setFriendsStatus(message, type) {
      const el = document.getElementById('friends-status');
      if (!el) return;
      el.textContent = message || '';
      el.className = 'friends-status' + (message ? ' ' + (type || 'ok') : '');
    }

    function subscribeFriends() {
      if (!currentUser) return;
      if (friendsUnsub)  friendsUnsub();
      if (requestsInUnsub) requestsInUnsub();
      if (requestsOutUnsub) requestsOutUnsub();

      // confirmed friends
      friendsUnsub = db.collection('friends').doc(currentUser.uid).onSnapshot(doc => {
        myFriends = new Set(doc.exists ? (doc.data().list || []) : []);
        if (lbFilter === 'friends') subscribeLeaderboard();
        if (document.getElementById('page-friends')?.classList.contains('active')) renderFriendsPage();
      }, err => {
        console.error('Friends list error:', err);
        setFriendsStatus('Friends could not load. Check Firestore rules for the friends collection.', 'error');
      });

      // incoming requests
      requestsInUnsub = db.collection('friendRequests')
        .where('to', '==', currentUser.uid).onSnapshot(snap => {
          pendingIn = new Set(snap.docs.filter(d => d.data().status === 'pending').map(d => d.data().from));
          refreshFriendBadge();
          if (document.getElementById('page-friends')?.classList.contains('active')) renderFriendsPage();
        }, err => {
          console.error('Incoming friend requests error:', err);
          setFriendsStatus('Incoming requests could not load. Check Firestore rules for friendRequests.', 'error');
        });

      // outgoing requests
      requestsOutUnsub = db.collection('friendRequests')
        .where('from', '==', currentUser.uid).where('status', '==', 'pending').onSnapshot(snap => {
          pendingOut = new Set(snap.docs.map(d => d.data().to));
          if (document.getElementById('page-friends')?.classList.contains('active')) renderFriendsPage();
        }, err => {
          console.error('Outgoing friend requests error:', err);
          setFriendsStatus('Outgoing requests could not load. Check Firestore rules for friendRequests.', 'error');
        });
    }

    auth.onAuthStateChanged(user => {
      if (user) {
        subscribeFriends();
      } else {
        if (friendsUnsub) friendsUnsub();
        if (requestsInUnsub) requestsInUnsub();
        if (requestsOutUnsub) requestsOutUnsub();
        closeFriendChat();
        myFriends.clear();
        pendingIn.clear();
        pendingOut.clear();
        refreshFriendBadge();
      }
    });

    function refreshFriendBadge() {
      // badge on Friends tab
      const tab = document.getElementById('tab-friends');
      if (!tab) return;
      const existing = tab.querySelector('.notif-badge');
      if (pendingIn.size > 0) {
        if (!existing) tab.insertAdjacentHTML('beforeend', '<span class="notif-badge" style="position:absolute;top:6px;right:10px;background:#ff3d00;color:white;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px;">'+pendingIn.size+'</span>');
        else existing.textContent = pendingIn.size;
      } else if (existing) existing.remove();

      // badge inside friends page header
      const pageBadge = document.getElementById('friends-page-badge');
      if (pageBadge) {
        if (pendingIn.size > 0) { pageBadge.textContent = pendingIn.size + ' pending'; pageBadge.style.display = 'inline-block'; }
        else pageBadge.style.display = 'none';
      }
    }

    async function renderFriendsPage() {
      if (!currentUser) {
        document.getElementById('friends-online-list').innerHTML = '<div class="friends-empty">Sign in to use Friends</div>';
        document.getElementById('friends-page-incoming').innerHTML = '';
        document.getElementById('friends-page-outgoing').innerHTML = '';
        document.getElementById('friends-page-all').innerHTML = '';
        document.getElementById('friends-page-count').textContent = '';
        return;
      }

      // Online friends
      const onlineEl = document.getElementById('friends-online-list');
      const onlineFriends = [...myFriends].filter(uid => onlineUsers.has(uid));
      if (onlineFriends.length === 0) {
        onlineEl.innerHTML = '<div class="friends-empty">None of your friends are online right now</div>';
      } else {
        const players = await Promise.all(onlineFriends.map(uid => getPlayerCardData(uid)));
        onlineEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = onlineFriends[i];
          onlineEl.insertAdjacentHTML('beforeend', friendPageItemHtml(uid, data, true));
        });
      }

      // Incoming requests
      const incomingEl = document.getElementById('friends-page-incoming');
      if (pendingIn.size > 0) {
        const uids = [...pendingIn];
        const players = await Promise.all(uids.map(uid => getPlayerCardData(uid)));
        incomingEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = uids[i];
          const avatar = data.photoURL ? '<img src="'+escHtml(data.photoURL)+'" referrerpolicy="no-referrer">' : '<div class="friend-avatar-ph">👤</div>';
          incomingEl.insertAdjacentHTML('beforeend',
            '<div class="friend-item">'+avatar+
            '<div class="friend-info"><div class="friend-name">'+escHtml(data.name)+'</div><div class="friend-sub">Wants to be friends</div></div>'+
            '<div style="display:flex;gap:6px;">'+
            '<button class="friend-btn accept" onclick="acceptFriendRequest(\''+uid+'\');renderFriendsPage()">Accept</button>'+
            '<button class="friend-btn decline" onclick="declineFriendRequest(\''+uid+'\');renderFriendsPage()">Decline</button>'+
            '</div></div>');
        });
      } else {
        incomingEl.innerHTML = '<div class="friends-empty">No incoming requests</div>';
      }

      // Outgoing requests
      const outgoingEl = document.getElementById('friends-page-outgoing');
      if (pendingOut.size > 0) {
        const uids = [...pendingOut];
        const players = await Promise.all(uids.map(uid => getPlayerCardData(uid)));
        outgoingEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = uids[i];
          const avatar = data.photoURL ? '<img src="'+escHtml(data.photoURL)+'" referrerpolicy="no-referrer">' : '<div class="friend-avatar-ph">👤</div>';
          outgoingEl.insertAdjacentHTML('beforeend',
            '<div class="friend-item">'+avatar+
            '<div class="friend-info"><div class="friend-name">'+escHtml(data.name)+'</div><div class="friend-sub">Request sent</div></div>'+
            '<button class="friend-btn decline" onclick="cancelFriendRequest(\''+uid+'\');renderFriendsPage()">Cancel</button>'+
            '</div>');
        });
      } else {
        outgoingEl.innerHTML = '<div class="friends-empty">No outgoing requests</div>';
      }

      // All friends
      const allEl = document.getElementById('friends-page-all');
      const countEl = document.getElementById('friends-page-count');
      if (countEl) countEl.textContent = myFriends.size > 0 ? '('+myFriends.size+')' : '';
      if (myFriends.size === 0) {
        allEl.innerHTML = '<div class="friends-empty">No friends yet — search above to add someone!</div>';
      } else {
        const uids = [...myFriends];
        const players = await Promise.all(uids.map(uid => getPlayerCardData(uid)));
        allEl.innerHTML = '';
        players.forEach((data, i) => {
          const uid = uids[i];
          allEl.insertAdjacentHTML('beforeend', friendPageItemHtml(uid, data, onlineUsers.has(uid)));
        });
      }
    }

    function friendPageItemHtml(uid, data, online) {
      const avatar = data.photoURL ? '<img src="'+escHtml(data.photoURL)+'" referrerpolicy="no-referrer">' : '<div class="friend-avatar-ph">👤</div>';
      const onlineDot = online ? ' <span class="online-dot"></span>' : '';
      const score = data.time ? gameConfig().scoreLabel(data.time) : 'No score yet';
      const rank = myFriends.has(uid) ? 'Friend' : 'Player';
      const timestamp = data.timestamp && typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate().toISOString() : null;
      const profileData = encodeURIComponent(JSON.stringify({ uid, name: data.name || 'Unknown', photoURL: data.photoURL || '', time: data.time || null, timestamp }));
      const challengeBtn = myFriends.has(uid) && online && gameConfig().hasScores !== false
        ? '<button class="friend-btn challenge square" onclick="event.stopPropagation();sendLiveChallengeToUid(\''+uid+'\',null)">⚡</button>'
        : myFriends.has(uid) && gameConfig().hasScores !== false
          ? '<button class="friend-btn pending square" disabled>⚡</button>'
        : '';
      const chatBtn = myFriends.has(uid)
        ? '<button class="friend-btn chat square" onclick="event.stopPropagation();openFriendChat(\''+uid+'\')">💬</button>'
        : '';
      return '<div class="friend-item" onclick="openFriendProfileFromCard(this)" data-rank="'+escHtml(rank)+'" data-player="'+profileData+'">'+avatar+
        '<div class="friend-info">'+
          '<div class="friend-name">'+escHtml(data.name)+onlineDot+'</div>'+
          '<div class="friend-sub">'+escHtml(score)+(online?' · Online now':'')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;">'+
          chatBtn+
          challengeBtn+
          '<button class="friend-btn remove" onclick="event.stopPropagation();removeFriend(\''+uid+'\');renderFriendsPage()">Remove</button>'+
        '</div></div>';
    }

    function openFriendProfileFromCard(card) {
      try {
        const s = JSON.parse(decodeURIComponent(card.dataset.player || '{}'));
        openPlayerModal(s, card.dataset.rank || 'Friend', s.uid);
      } catch (err) {
        console.error('Could not open friend profile:', err);
      }
    }

    function friendChatIdFor(uid) {
      if (!currentUser || !uid) return '';
      return [currentUser.uid, uid].sort().join('_');
    }

    function chatTimestampLabel(value) {
      if (!value) return 'Now';
      const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
      if (Number.isNaN(date.getTime())) return 'Now';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function renderChatMessages(snap) {
      const el = document.getElementById('chat-messages');
      if (!el) return;
      if (!snap || snap.empty) {
        el.innerHTML = '<div class="friends-empty">No messages yet</div>';
        return;
      }
      el.innerHTML = '';
      snap.docs.forEach(doc => {
        const data = doc.data();
        const mine = data.from === currentUser?.uid;
        el.insertAdjacentHTML('beforeend',
          '<div class="chat-row '+(mine ? 'mine' : 'theirs')+'">'+
            '<div class="chat-bubble">'+escHtml(data.text || '')+'</div>'+
            '<div class="chat-time">'+escHtml(chatTimestampLabel(data.createdAt))+'</div>'+
          '</div>');
      });
      el.scrollTop = el.scrollHeight;
    }

    async function openFriendChat(uid) {
      if (!currentUser) { openAuthModal(); return; }
      if (!uid || uid === currentUser.uid || !myFriends.has(uid)) {
        setFriendsStatus('You can only chat with confirmed friends.', 'error');
        return;
      }
      activeChatUid = uid;
      const data = await getPlayerCardData(uid).catch(() => ({ name: 'Friend', photoURL: '' }));
      document.getElementById('chat-name').textContent = data.name || 'Friend';
      document.getElementById('chat-status').textContent = onlineUsers.has(uid) ? 'Online now' : 'Messages';
      const photo = document.getElementById('chat-photo');
      const ph = document.getElementById('chat-photo-ph');
      if (data.photoURL) {
        photo.src = data.photoURL;
        photo.style.display = 'block';
        ph.style.display = 'none';
      } else {
        photo.style.display = 'none';
        ph.style.display = 'flex';
      }
      const input = document.getElementById('chat-input');
      if (input) input.value = '';
      document.getElementById('chat-messages').innerHTML = '<div class="friends-empty">Loading chat...</div>';
      openModal('chat-overlay');
      if (activeChatUnsub) activeChatUnsub();
      const chatId = friendChatIdFor(uid);
      const chatRef = db.collection('friendChats').doc(chatId);
      await chatRef.set({
        participants: [currentUser.uid, uid].sort(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        participantNames: {
          [currentUser.uid]: currentUser.displayName || 'Player',
          [uid]: data.name || 'Friend'
        }
      }, { merge: true }).catch(err => {
        console.error('Friend chat init failed:', err);
        setFriendsStatus('Chat could not start. Your Firestore rules must allow friendChats writes.', 'error');
      });
      activeChatUnsub = chatRef.collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(80)
        .onSnapshot(renderChatMessages, err => {
          console.error('Friend chat error:', err);
          document.getElementById('chat-messages').innerHTML = '<div class="friends-empty">Chat could not load. Check Firestore rules.</div>';
        });
      setTimeout(() => input?.focus(), 80);
    }

    function openFriendChatFromProfile() {
      const uid = pmCurrentUid;
      closeModal('player-overlay');
      openFriendChat(uid);
    }

    function closeFriendChat() {
      if (activeChatUnsub) activeChatUnsub();
      activeChatUnsub = null;
      activeChatUid = null;
      closeModal('chat-overlay');
    }

    async function sendFriendChatMessage(event) {
      if (event) event.preventDefault();
      const input = document.getElementById('chat-input');
      const btn = document.getElementById('chat-send-btn');
      const text = (input?.value || '').trim();
      const toUid = activeChatUid;
      if (!currentUser || !toUid || !myFriends.has(toUid) || !text) return;
      if (btn) btn.disabled = true;
      try {
        const chatId = friendChatIdFor(toUid);
        const chatRef = db.collection('friendChats').doc(chatId);
        const msgRef = chatRef.collection('messages').doc();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        batch.set(chatRef, {
          participants: [currentUser.uid, toUid].sort(),
          updatedAt: now,
          lastMessage: text.slice(0, 120),
          lastSender: currentUser.uid,
          participantNames: {
            [currentUser.uid]: currentUser.displayName || 'Player',
            [toUid]: document.getElementById('chat-name')?.textContent || 'Friend'
          }
        }, { merge: true });
        batch.set(msgRef, {
          from: currentUser.uid,
          to: toUid,
          text,
          createdAt: now
        });
        await batch.commit();
        if (input) input.value = '';
      } catch (err) {
        console.error('Friend chat send failed:', err);
        setFriendsStatus('Message failed. Your Firestore rules must allow friendChats writes.', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    let friendPageSearchTimer;
    function onFriendPageSearch(val) {
      clearTimeout(friendPageSearchTimer);
      const el = document.getElementById('friends-page-search-results');
      if (!val.trim()) { if (el) el.innerHTML = ''; return; }
      friendPageSearchTimer = setTimeout(async () => {
        const results = await searchPlayers(val);
        if (!el) return;
        if (!results.length) { el.innerHTML = '<div class="friends-empty">No players found</div>'; return; }
        el.innerHTML = '';
        results.forEach(p => {
          const uid = p.uid;
          const avatar = p.photoURL ? '<img src="'+escHtml(p.photoURL)+'" referrerpolicy="no-referrer">' : '<div class="friend-avatar-ph">👤</div>';
          const online = onlineUsers.has(uid);
          const onlineDot = online ? ' <span class="online-dot"></span>' : '';
          let btn;
          if (myFriends.has(uid))      btn = '<button class="friend-btn remove" onclick="removeFriend(\''+uid+'\');renderFriendsPage()">Remove</button>';
          else if (pendingOut.has(uid)) btn = '<button class="friend-btn pending" disabled>Sent</button>';
          else if (pendingIn.has(uid))  btn = '<button class="friend-btn accept" onclick="acceptFriendRequest(\''+uid+'\');renderFriendsPage()">Accept</button>';
          else                          btn = '<button class="friend-btn add" onclick="sendFriendRequest(\''+uid+'\',this)">Add</button>';
          el.insertAdjacentHTML('beforeend',
            '<div class="friend-item">'+avatar+
            '<div class="friend-info"><div class="friend-name">'+escHtml(p.name)+onlineDot+'</div>'+
            '<div class="friend-sub">'+(p.time?gameConfig().scoreLabel(p.time):'No score yet')+'</div></div>'+
            btn+'</div>');
        });
      }, 350);
    }

    async function sendFriendRequest(toUid, btn) {
      if (!currentUser || toUid === currentUser.uid) return;
      const id = [currentUser.uid, toUid].sort().join('_');
      const originalText = btn ? btn.textContent : '';
      if (btn) {
        btn.textContent = 'Sending...';
        btn.disabled = true;
      }
      setFriendsStatus('', '');
      try {
        await db.collection('friendRequests').doc(id).set({
          from: currentUser.uid,
          to: toUid,
          status: 'pending',
          ts: firebase.firestore.FieldValue.serverTimestamp()
        });
        pendingOut.add(toUid);
        if (btn) {
          btn.textContent = 'Sent';
          btn.className = 'friend-btn pending';
        }
        setFriendsStatus('Friend request sent.', 'ok');
        if (document.getElementById('page-friends')?.classList.contains('active')) renderFriendsPage();
      } catch (err) {
        console.error('Friend request send failed:', err);
        if (btn) {
          btn.textContent = originalText || 'Add';
          btn.disabled = false;
        }
        setFriendsStatus('Friend request failed. Your Firestore rules must allow friendRequests writes.', 'error');
      }
    }

    async function acceptFriendRequest(fromUid) {
      if (!currentUser) return;
      const id = [currentUser.uid, fromUid].sort().join('_');
      await db.collection('friendRequests').doc(id).update({ status: 'accepted' });
      // add to both sides' friend lists
      const batch = db.batch();
      const myRef   = db.collection('friends').doc(currentUser.uid);
      const theirRef = db.collection('friends').doc(fromUid);
      batch.set(myRef,    { list: firebase.firestore.FieldValue.arrayUnion(fromUid) }, { merge: true });
      batch.set(theirRef, { list: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) }, { merge: true });
      await batch.commit();
      pendingIn.delete(fromUid);
      myFriends.add(fromUid);
      if (lbFilter === 'friends') subscribeLeaderboard();
    }

    async function declineFriendRequest(fromUid) {
      if (!currentUser) return;
      const id = [currentUser.uid, fromUid].sort().join('_');
      await db.collection('friendRequests').doc(id).update({ status: 'declined' });
      pendingIn.delete(fromUid);
    }

    async function cancelFriendRequest(toUid) {
      if (!currentUser) return;
      const id = [currentUser.uid, toUid].sort().join('_');
      await db.collection('friendRequests').doc(id).update({ status: 'canceled' });
      pendingOut.delete(toUid);
    }

    async function removeFriend(uid) {
      if (!currentUser) return;
      const batch = db.batch();
      batch.set(db.collection('friends').doc(currentUser.uid), { list: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true });
      batch.set(db.collection('friends').doc(uid), { list: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) }, { merge: true });
      await batch.commit();
      myFriends.delete(uid);
      if (lbFilter === 'friends') subscribeLeaderboard();
    }

    // friend action from player modal
    function pmFriendAction() {
      const uid = pmCurrentUid;
      if (!uid || !currentUser || uid === currentUser.uid) return;
      if (myFriends.has(uid))    { removeFriend(uid); closeModal('player-overlay'); }
      else if (pendingOut.has(uid)) { /* already sent */ }
      else if (pendingIn.has(uid))  { acceptFriendRequest(uid); closeModal('player-overlay'); }
      else { sendFriendRequest(uid, document.getElementById('pm-friend-btn')); }
    }

    // search players by name (exact display name, case-insensitive via stored lowercase field)
    async function searchPlayers(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const byUid = new Map();
      const addDocs = snap => {
        snap.docs.forEach(d => {
          if (d.id === currentUser?.uid) return;
          const data = d.data();
          if (!data.name?.toLowerCase().includes(q)) return;
          byUid.set(d.id, Object.assign({ uid: d.id }, byUid.get(d.id) || {}, data));
        });
      };

      const snaps = await Promise.all([
        db.collection('profiles').get().catch(() => ({ docs: [] })),
        db.collection('scores').get().catch(() => ({ docs: [] })),
        db.collection('aimScores').get().catch(() => ({ docs: [] }))
      ]);
      snaps.forEach(addDocs);
      return [...byUid.values()].slice(0, 8);
    }

    // ── Friends leaderboard ───────────────────────────────────
    function subscribeFriendsLeaderboard(listIds) {
      if (!currentUser || myFriends.size === 0) {
        listIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '<li style="color:var(--text-dim);font-size:13px;padding:16px;list-style:none;">Add friends to see their scores here</li>';
        });
        return;
      }
      const uids = [...myFriends, currentUser.uid].slice(0, 10);
      db.collection(gameConfig().scoreCollection).where(firebase.firestore.FieldPath.documentId(), 'in', uids).orderBy('time').get().then(snap => {
        if (snap.empty) {
          listIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<li style="color:var(--text-dim);font-size:13px;padding:16px;list-style:none;">None of your friends have scores yet</li>';
          });
          return;
        }
        listIds.forEach(id => renderLbSnapshot(snap, id));
      });
    }

    // ── Keyboard ──────────────────────────────────────────────
    document.addEventListener('keydown', e=>{
      if(document.getElementById('auth-overlay').classList.contains('open')){ if(e.key==='Enter') submitAuth(); return; }
      if(e.key==='Escape'){ ['auth-overlay','player-overlay','mp-overlay','challenge-overlay'].forEach(closeModal); closeFriendChat(); declineChallenge(); return; }
      if((e.key==='Enter'||e.key===' ')&&document.getElementById('page-game').classList.contains('active')){
        e.preventDefault();
        if (activeGame === 'aim') {
          if (!aimRunning) startGame();
          return;
        }
        if(!running) startGame(); else handleTap();
      }
    });

    function escHtml(str){ return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
