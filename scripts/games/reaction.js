    // ── Sound ─────────────────────────────────────────────────
    let soundOn = true;
    function toggleSound() {
      soundOn = !soundOn;
      document.getElementById('sound-btn').textContent = soundOn ? '🔊' : '🔇';
    }

    function playTapSound() {
      if (!soundOn) return;
      try {
        const ctx=new(window.AudioContext||window.webkitAudioContext)();
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(900,ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(450,ctx.currentTime+0.12);
        gain.gain.setValueAtTime(0.25,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.18);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.18);
      } catch(e){}
    }

    function playChessSound(move) {
      if (!soundOn) return;
      try {
        const ctx = new(window.AudioContext||window.webkitAudioContext)();
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.connect(ctx.destination);
        master.gain.setValueAtTime(0.22, now);
        master.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(move?.captured ? 850 : 520, now);
        noiseFilter.Q.value = 0.85;
        noise.connect(noiseFilter);
        noiseFilter.connect(master);
        noise.start(now);
        noise.stop(now + 0.09);

        const body = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(move?.captured ? 180 : 130, now);
        body.frequency.exponentialRampToValueAtTime(move?.captured ? 105 : 92, now + 0.12);
        bodyGain.gain.setValueAtTime(move?.captured ? 0.1 : 0.07, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        body.connect(bodyGain);
        bodyGain.connect(master);
        body.start(now);
        body.stop(now + 0.15);

        if (move?.san?.includes('+') || move?.san?.includes('#')) {
          const accent = ctx.createOscillator();
          const accentGain = ctx.createGain();
          accent.type = 'sine';
          accent.frequency.setValueAtTime(740, now + 0.06);
          accent.frequency.exponentialRampToValueAtTime(620, now + 0.14);
          accentGain.gain.setValueAtTime(0.05, now + 0.06);
          accentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          accent.connect(accentGain);
          accentGain.connect(master);
          accent.start(now + 0.06);
          accent.stop(now + 0.16);
        }
      } catch (e) {}
    }

    // ── Haptics ───────────────────────────────────────────────
    function haptic(type) {
      if (!navigator.vibrate) return;
      if (type==='tap')   navigator.vibrate(30);
      if (type==='go')    navigator.vibrate([18,8,18]);
      if (type==='early') navigator.vibrate([50,20,50]);
      if (type==='best')  navigator.vibrate([15,8,15,8,35]);
    }

    const DEFAULT_ELO = 300;
    const RANKED_K = 24;
    const RANKED_BASE_RANGE = 120;
    const RANKED_STEP_RANGE = 70;
    const RANKED_MAX_RANGE = 520;
    const RANKED_QUEUE_MS = 90000;
    const RANKED_MATCH_START_DELAY = 3500;
    const RANKED_PRESENCE_INTERVAL_MS = 4000;
    const RANKED_PRESENCE_STALE_MS = 15000;
    let rankedRatings = { reaction: DEFAULT_ELO, aim: DEFAULT_ELO, chess: DEFAULT_ELO, cps: DEFAULT_ELO };
    let rankedQueueDocId = null;
    let rankedQueueUnsub = null;
    let rankedQueuePoll = null;
    let rankedMatchId = null;
    let rankedMatchUnsub = null;
    let rankedMatchData = null;
    let rankedStatus = 'idle';
    let rankedQueueJoinedAtMs = 0;
    let rankedStartTimer = null;
    let rankedStartedMatchId = null;
    let rankedPresenceTimer = null;
    let rankedReactionRound = 0;
    let chessLastMoveSquares = [];
    let chessLastMoveSan = '';

    function getRankedClientDeviceId() {
      let id = localStorage.getItem('rankedClientDeviceId') || sessionStorage.getItem('rankedClientSessionId');
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
      localStorage.setItem('rankedClientDeviceId', id);
      return id;
    }

    function currentRankedPlayerId() {
      if (!currentUser) return null;
      return currentUser.uid + ':' + getRankedClientDeviceId();
    }

    function rankedQueueDocIdFor(game, playerId) {
      return game + '_' + playerId.replace(/[^a-zA-Z0-9:_-]/g, '-');
    }

    function setRankedQueueState(docId, joinedAtMs) {
      rankedQueueDocId = docId;
      rankedQueueJoinedAtMs = Number(joinedAtMs) || Date.now();
      rankedStatus = 'queueing';
    }

    function clearRankedQueueState() {
      rankedQueueDocId = null;
      rankedQueueJoinedAtMs = 0;
    }

    function currentRankedMatchPlayerId(data) {
      if (!currentUser) return null;
      const sessionId = currentRankedPlayerId();
      const players = data?.players || [];
      if (sessionId && players.includes(sessionId)) return sessionId;
      if (players.includes(currentUser.uid)) return currentUser.uid;
      if (sessionId && data?.playerUids?.[sessionId] === currentUser.uid) return sessionId;
      const mapped = Object.keys(data?.playerUids || {}).find(id => data.playerUids[id] === currentUser.uid);
      return mapped || null;
    }

    function rankedOpponentId(data) {
      const selfId = currentRankedMatchPlayerId(data);
      const players = data?.players || Object.keys(data?.playerUids || {});
      if (!players.length || !selfId) return null;
      return players.find(id => id !== selfId) || null;
    }

    function currentRankedRating(game) {
      return rankedRatings[game] || DEFAULT_ELO;
    }

    function rankedRangeFor(joinedAtMs) {
      const wait = Math.max(0, Date.now() - (joinedAtMs || Date.now()));
      return Math.min(RANKED_MAX_RANGE, RANKED_BASE_RANGE + Math.floor(wait / 5000) * RANKED_STEP_RANGE);
    }

    function expectedScore(me, opp) {
      return 1 / (1 + Math.pow(10, (opp - me) / 400));
    }

    function calcNextElo(me, opp, score) {
      return Math.round(me + RANKED_K * (score - expectedScore(me, opp)));
    }

    function rankedOpponentUid(data) {
      const opponentId = rankedOpponentId(data);
      return opponentId ? (data?.playerUids?.[opponentId] || opponentId || null) : null;
    }

    function rankedOpponentName(data) {
      const opponentId = rankedOpponentId(data);
      const opponentUid = rankedOpponentUid(data);
      return opponentId ? (data?.playerNames?.[opponentId] || data?.playerNames?.[opponentUid] || 'Opponent') : 'Opponent';
    }

    function isSelfRankedMatch(data) {
      const opponentId = rankedOpponentId(data);
      const selfId = currentRankedMatchPlayerId(data);
      if (!selfId || !opponentId) return false;
      const selfUid = data?.playerUids?.[selfId] || selfId;
      const oppUid = data?.playerUids?.[opponentId] || opponentId;
      return !!selfUid && selfUid === oppUid;
    }

    function rankedScoreLabel(game, score) {
      if (score === null || score === undefined) return '—';
      if (game === 'reaction' || game === 'aim') return Math.round(score) + ' ms';
      if (game === 'cps') return Number(score).toFixed(1) + ' CPS';
      return String(score);
    }

    function defaultRankedPayload(game, playerA, playerB) {
      const startAtMs = Date.now() + RANKED_MATCH_START_DELAY;
      if (game === 'reaction') {
        return {
          startAtMs,
          roundCount: 5,
          delays: Array.from({ length: 5 }, () => 1400 + Math.round(Math.random() * 2200)),
          submissions: {}
        };
      }
      if (game === 'aim') {
        return {
          startAtMs,
          targetSize: 52,
          totalTargets: 10,
          positions: Array.from({ length: 10 }, () => ({
            x: Number((0.15 + Math.random() * 0.7).toFixed(4)),
            y: Number((0.15 + Math.random() * 0.7).toFixed(4))
          })),
          submissions: {}
        };
      }
      if (game === 'cps') {
        return {
          startAtMs,
          durationMs: 10000,
          submissions: {}
        };
      }
      const white = Math.random() > 0.5 ? playerA.playerId : playerB.playerId;
      const black = white === playerA.playerId ? playerB.playerId : playerA.playerId;
      return {
        startAtMs,
        white,
        black,
        fen: 'start',
        turn: 'w',
        history: [],
        lastMove: null
      };
    }

    function rankedMatchDoc(game, playerA, playerB) {
      return {
        game,
        mode: 'ranked',
        state: 'active',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        players: [playerA.playerId, playerB.playerId],
        authorizedUids: [...new Set([playerA.uid, playerB.uid])],
        playerUids: {
          [playerA.playerId]: playerA.uid,
          [playerB.playerId]: playerB.uid
        },
        playerNames: {
          [playerA.playerId]: playerA.name,
          [playerB.playerId]: playerB.name
        },
        playerPhotos: {
          [playerA.playerId]: playerA.photoURL || '',
          [playerB.playerId]: playerB.photoURL || ''
        },
        ratings: {
          [playerA.playerId]: playerA.rating,
          [playerB.playerId]: playerA.uid === playerB.uid ? playerA.rating : playerB.rating
        },
        result: null,
        payload: defaultRankedPayload(game, playerA, playerB)
      };
    }

    async function loadRankedRatings() {
      if (!currentUser) {
        rankedRatings = { reaction: DEFAULT_ELO, aim: DEFAULT_ELO, chess: DEFAULT_ELO, cps: DEFAULT_ELO };
        renderRankedPanel();
        return;
      }
      const snap = await db.collection('ratings').doc(currentUser.uid).get().catch(() => null);
      const data = snap?.exists ? snap.data() : {};
      rankedRatings = {
        reaction: data?.reaction || DEFAULT_ELO,
        aim: data?.aim || DEFAULT_ELO,
        chess: data?.chess || DEFAULT_ELO,
        cps: data?.cps || DEFAULT_ELO
      };
      renderRankedPanel();
    }

    function clearRankedQueueWatcher() {
      if (rankedQueueUnsub) rankedQueueUnsub();
      rankedQueueUnsub = null;
      clearInterval(rankedQueuePoll);
      rankedQueuePoll = null;
    }

    function clearRankedMatchWatcher() {
      if (rankedMatchUnsub) rankedMatchUnsub();
      rankedMatchUnsub = null;
      clearTimeout(rankedStartTimer);
      rankedStartTimer = null;
      clearInterval(rankedPresenceTimer);
      rankedPresenceTimer = null;
    }

    function resetRankedState(keepMatch) {
      clearRankedQueueWatcher();
      if (!keepMatch) {
        clearRankedMatchWatcher();
        rankedMatchId = null;
        rankedMatchData = null;
        rankedStartedMatchId = null;
      }
      clearRankedQueueState();
      rankedStatus = keepMatch ? rankedStatus : 'idle';
      renderRankedPanel();
    }

    function renderRankedPanel() {
      const queueBtn = document.getElementById('ranked-queue-btn');
      const leaveBtn = document.getElementById('ranked-leave-btn');
      const ratingBadge = document.getElementById('ranked-rating-badge');
      const sub = document.getElementById('ranked-sub');
      const note = document.getElementById('ranked-note');
      const statusVal = document.getElementById('ranked-status-val');
      const rangeVal = document.getElementById('ranked-range-val');
      const opponent = document.getElementById('ranked-opponent');
      if (!queueBtn || !leaveBtn || !ratingBadge || !sub || !note || !statusVal || !rangeVal || !opponent) return;

      ratingBadge.textContent = currentRankedRating(activeGame) + ' Elo';
      if (!currentUser) {
        statusVal.textContent = 'Sign in';
        rangeVal.textContent = '±120';
        sub.textContent = 'Sign in to queue for rated matches.';
        note.textContent = 'Each game keeps its own Elo.';
        queueBtn.textContent = 'Sign in';
        queueBtn.disabled = false;
        leaveBtn.style.display = 'none';
        opponent.style.display = 'none';
        return;
      }

      if (rankedMatchData && rankedMatchData.game === activeGame) {
        const result = rankedMatchData.result;
        const live = rankedMatchData.state !== 'complete';
        const selfId = currentRankedMatchPlayerId(rankedMatchData);
        const oppId = rankedOpponentId(rankedMatchData);
        statusVal.textContent = live ? 'Live' : 'Final';
        rangeVal.textContent = '±' + Math.abs((rankedMatchData.ratings?.[selfId] || DEFAULT_ELO) - (rankedMatchData.ratings?.[oppId] || DEFAULT_ELO));
        sub.textContent = live ? 'Matched in ranked ' + gameConfig().title.toLowerCase() + '.' : (result?.text || 'Match complete.');
        opponent.style.display = 'block';
        opponent.textContent = 'Vs ' + rankedOpponentName(rankedMatchData);
        queueBtn.textContent = live ? 'Matched' : 'Find next';
        queueBtn.disabled = live;
        leaveBtn.style.display = live ? 'block' : 'none';
        note.textContent = result?.scores && oppId
          ? 'You: ' + rankedScoreLabel(activeGame, result.scores[selfId]) + ' · ' + rankedOpponentName(rankedMatchData) + ': ' + rankedScoreLabel(activeGame, result.scores[oppId])
          : 'Winner: ' + (result?.winner === 'draw' ? 'Draw' : result?.winner ? rankedMatchData.playerNames?.[result.winner] || 'Opponent' : 'Pending');
        return;
      }

      if (rankedQueueDocId) {
        const joinedAtMs = rankedQueueJoinedAtMs || Date.now();
        statusVal.textContent = 'Queueing';
        rangeVal.textContent = '±' + rankedRangeFor(joinedAtMs);
        sub.textContent = 'Searching for a fair ' + gameConfig().title.toLowerCase() + ' match.';
        note.textContent = 'Range widens over time so you do not wait forever.';
        queueBtn.textContent = 'Cancel';
        queueBtn.disabled = false;
        leaveBtn.style.display = 'none';
        opponent.style.display = 'none';
        return;
      }

      statusVal.textContent = 'Idle';
      rangeVal.textContent = '±120';
      sub.textContent = 'Queue for a rated ' + gameConfig().title.toLowerCase() + ' match.';
      note.textContent = 'Each game keeps its own Elo.';
      queueBtn.textContent = 'Find match';
      queueBtn.disabled = false;
      leaveBtn.style.display = 'none';
      opponent.style.display = 'none';
    }

    function isRankedLiveGame(game) {
      return rankedMatchData && rankedMatchData.game === game && rankedMatchData.state !== 'complete';
    }

    function rankedPresence() {
      return Object.assign({}, rankedMatchData?.payload?.presence || {});
    }

    async function syncRankedPresence() {
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.state === 'complete') return;
      const selfId = currentRankedMatchPlayerId(rankedMatchData);
      if (!selfId) return;
      const nextPresence = Object.assign({}, rankedPresence(), {
        [selfId]: Date.now()
      });
      rankedMatchData.payload = Object.assign({}, rankedMatchData.payload || {}, { presence: nextPresence });
      await db.collection('rankedMatches').doc(rankedMatchId).set({
        payload: Object.assign({}, rankedMatchData.payload || {}, { presence: nextPresence }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.error('Presence update failed:', err));
    }

    function watchRankedPresence() {
      clearInterval(rankedPresenceTimer);
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.state === 'complete') return;
      syncRankedPresence();
      rankedPresenceTimer = setInterval(syncRankedPresence, RANKED_PRESENCE_INTERVAL_MS);
    }

    async function claimRankedForfeitFromPresence() {
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.state === 'complete') return;
      const selfId = currentRankedMatchPlayerId(rankedMatchData);
      const oppId = rankedOpponentId(rankedMatchData);
      if (!selfId || !oppId) return;
      const presence = rankedPresence();
      const ownSeenAt = Number(presence[selfId] || 0);
      const oppSeenAt = Number(presence[oppId] || 0);
      const now = Date.now();
      if (!ownSeenAt || now - ownSeenAt > RANKED_PRESENCE_STALE_MS) return;
      if (!oppSeenAt || now - oppSeenAt <= RANKED_PRESENCE_STALE_MS) return;
      await db.collection('rankedMatches').doc(rankedMatchId).set({
        state: 'complete',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        result: {
          winner: selfId,
          reason: 'forfeit',
          text: (rankedMatchData.playerNames?.[oppId] || 'Opponent') + ' forfeited',
          scores: rankedMatchData.result?.scores || {}
        }
      }, { merge: true }).catch(err => console.error('Presence forfeit failed:', err));
    }

    function activateRankedGame(game) {
      if (!GAME_CONFIG[game]) return;
      activeGame = game;
      if (game !== 'cps') localStorage.setItem('activeGame', game);
      applyActiveGameUi();
      loadActiveBest();
      subscribeLeaderboard();
      switchPage('game');
      document.getElementById('tab-selector')?.classList.add('active');
    }

    async function toggleRankedQueue() {
      if (!currentUser) { openAuthModal(); return; }
      if (rankedQueueDocId) { await cancelRankedQueue(); return; }
      if (rankedMatchData && rankedMatchData.state !== 'complete') return;
      await joinRankedQueue();
    }

    async function joinRankedQueue() {
      await loadRankedRatings();
      const game = activeGame;
      const joinedAtMs = Date.now();
      const playerId = currentRankedPlayerId();
      setRankedQueueState(rankedQueueDocIdFor(game, playerId), joinedAtMs);
      renderRankedPanel();
      const ref = db.collection('rankedQueue').doc(rankedQueueDocId);
      await ref.set({
        playerId,
        uid: currentUser.uid,
        game,
        rating: currentRankedRating(game),
        name: currentUser.displayName || 'Player',
        photoURL: currentUser.photoURL || '',
        status: 'searching',
        joinedAtMs,
        expiresAtMs: joinedAtMs + RANKED_QUEUE_MS,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      watchRankedQueue(ref);
      tryMatchmakeCurrentQueue();
    }

    function watchRankedQueue(ref) {
      clearRankedQueueWatcher();
      rankedQueueUnsub = ref.onSnapshot(async snap => {
        if (!snap.exists) {
          clearRankedQueueState();
          rankedStatus = 'idle';
          renderRankedPanel();
          return;
        }
        const data = snap.data();
        setRankedQueueState(snap.id, data.joinedAtMs);
        if (data.status === 'matched' && data.matchId) {
          const opened = await resolveRankedQueueMatch(ref, data);
          if (!opened) {
            clearRankedQueueState();
            rankedStatus = 'idle';
          }
        }
        if (data.status === 'canceled' || data.status === 'expired' || data.status === 'complete') {
          clearRankedQueueState();
          rankedStatus = 'idle';
          clearRankedQueueWatcher();
        }
        renderRankedPanel();
      });
      rankedQueuePoll = setInterval(() => {
        if (rankedQueueDocId) tryMatchmakeCurrentQueue();
      }, 3500);
    }

    async function cancelRankedQueue() {
      if (!currentUser || !rankedQueueDocId) return;
      const ref = db.collection('rankedQueue').doc(rankedQueueDocId);
      await ref.set({
        status: 'canceled',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
      resetRankedState(false);
    }

    async function expireRankedQueue(ref, data) {
      if (!ref) return;
      await ref.set({
        playerId: data?.playerId || currentRankedPlayerId(),
        uid: data?.uid || currentUser?.uid || null,
        game: data?.game || activeGame,
        rating: data?.rating || currentRankedRating(data?.game || activeGame),
        name: data?.name || currentUser?.displayName || 'Player',
        photoURL: data?.photoURL || currentUser?.photoURL || '',
        joinedAtMs: data?.joinedAtMs || rankedQueueJoinedAtMs || Date.now(),
        expiresAtMs: data?.expiresAtMs || Date.now(),
        status: 'expired',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
      clearRankedQueueWatcher();
      clearRankedQueueState();
      rankedStatus = 'idle';
      renderRankedPanel();
    }

    async function clearMatchedQueueForMatch(matchId, matchData) {
      if (!matchId || !matchData?.game || !Array.isArray(matchData.players)) return;
      const writes = matchData.players.map(playerId => {
        const ref = db.collection('rankedQueue').doc(rankedQueueDocIdFor(matchData.game, playerId));
        return ref.get().then(snap => {
          if (!snap.exists) return null;
          const data = snap.data();
          if (data.matchId !== matchId || data.status !== 'matched') return null;
          return ref.set({
            status: 'complete',
            matchId: firebase.firestore.FieldValue.delete(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }).catch(() => null);
      });
      await Promise.all(writes);
    }

    async function resolveRankedQueueMatch(queueRef, queueData) {
      if (!queueData?.matchId) return false;
      const matchSnap = await db.collection('rankedMatches').doc(queueData.matchId).get().catch(() => null);
      if (matchSnap?.exists) {
        const matchData = matchSnap.data();
        if (matchData?.state !== 'complete') {
          openRankedMatch(queueData.matchId);
          return true;
        }
        await clearMatchedQueueForMatch(queueData.matchId, matchData);
      } else if (queueRef) {
        await queueRef.set({
          status: 'canceled',
          matchId: firebase.firestore.FieldValue.delete(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
      return false;
    }

    async function tryMatchmakeCurrentQueue() {
      if (!currentUser || !rankedQueueDocId) return;
      const ownRef = db.collection('rankedQueue').doc(rankedQueueDocId);
      const ownSnap = await ownRef.get().catch(() => null);
      if (!ownSnap?.exists) {
        resetRankedState(false);
        return;
      }
      const own = ownSnap.data();
      if (own.status === 'matched' && own.matchId) {
        const opened = await resolveRankedQueueMatch(ownRef, own);
        if (!opened) resetRankedState(false);
        return;
      }
      if (own.expiresAtMs < Date.now()) {
        await expireRankedQueue(ownRef, own);
        return;
      }
      if (own.status !== 'searching') return;
      rankedQueueJoinedAtMs = own.joinedAtMs || rankedQueueJoinedAtMs;
      const range = rankedRangeFor(own.joinedAtMs);
      const candidatesSnap = await db.collection('rankedQueue')
        .where('game', '==', own.game)
        .where('status', '==', 'searching')
        .limit(20)
        .get()
        .catch(() => null);
      if (!candidatesSnap) return;
      const candidates = candidatesSnap.docs
        .filter(doc => doc.id !== rankedQueueDocId)
        .map(doc => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
        .filter(row => row.data.uid !== own.uid)
        .filter(row => row.data.expiresAtMs > Date.now())
        .filter(row => Math.abs((row.data.rating || DEFAULT_ELO) - (own.rating || DEFAULT_ELO)) <= Math.max(range, rankedRangeFor(row.data.joinedAtMs)))
        .sort((a, b) => {
          const diffA = Math.abs((a.data.rating || DEFAULT_ELO) - (own.rating || DEFAULT_ELO));
          const diffB = Math.abs((b.data.rating || DEFAULT_ELO) - (own.rating || DEFAULT_ELO));
          if (diffA !== diffB) return diffA - diffB;
          return (a.data.joinedAtMs || 0) - (b.data.joinedAtMs || 0);
        });
      if (!candidates.length) {
        renderRankedPanel();
        return;
      }

      const opponent = candidates[0];
      const matchRef = db.collection('rankedMatches').doc();
      try {
        await db.runTransaction(async tx => {
          const [freshOwn, freshOpp] = await Promise.all([tx.get(ownRef), tx.get(opponent.ref)]);
          if (!freshOwn.exists || !freshOpp.exists) throw new Error('Queue disappeared');
          const a = freshOwn.data();
          const b = freshOpp.data();
          if (a.status !== 'searching' || b.status !== 'searching') throw new Error('Already matched');
          if (a.uid === b.uid) throw new Error('Self match blocked');
          if (a.expiresAtMs < Date.now() || b.expiresAtMs < Date.now()) throw new Error('Queue expired');
          tx.set(matchRef, rankedMatchDoc(a.game, {
            playerId: a.playerId,
            uid: a.uid,
            name: a.name,
            photoURL: a.photoURL,
            rating: a.rating || DEFAULT_ELO
          }, {
            playerId: b.playerId,
            uid: b.uid,
            name: b.name,
            photoURL: b.photoURL,
            rating: b.rating || DEFAULT_ELO
          }));
          tx.set(ownRef, { status: 'matched', matchId: matchRef.id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          tx.set(opponent.ref, { status: 'matched', matchId: matchRef.id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        });
        openRankedMatch(matchRef.id);
      } catch (err) {
        if (String(err?.message || '').includes('Queue expired')) {
          await expireRankedQueue(ownRef, own);
          return;
        }
        console.error('Matchmaking retry:', err);
      }
    }

    async function restoreRankedSession() {
      if (!currentUser) return;
      const playerId = currentRankedPlayerId();
      const games = Object.keys(GAME_CONFIG);
      for (const game of games) {
        const queueId = rankedQueueDocIdFor(game, playerId);
        const ref = db.collection('rankedQueue').doc(queueId);
        const snap = await ref.get().catch(() => null);
        if (!snap?.exists) continue;
        const data = snap.data();
        if (data.uid !== currentUser.uid || data.playerId !== playerId) continue;
        if (data.status === 'searching' && data.expiresAtMs > Date.now()) {
          activeGame = game;
          if (game !== 'cps') localStorage.setItem('activeGame', game);
          setRankedQueueState(queueId, data.joinedAtMs);
          applyActiveGameUi();
          await loadActiveBest();
          subscribeLeaderboard();
          watchRankedQueue(ref);
          renderRankedPanel();
          return;
        }
        if (data.status === 'matched' && data.matchId) {
          if (await resolveRankedQueueMatch(ref, data)) return;
          continue;
        }
        if (data.status === 'searching') {
          await expireRankedQueue(ref, data);
        }
      }

      const matchesSnap = await db.collection('rankedMatches')
        .where('players', 'array-contains', playerId)
        .limit(6)
        .get()
        .catch(() => null);
      if (!matchesSnap?.docs?.length) {
        renderRankedPanel();
        return;
      }
      const matches = matchesSnap.docs
        .map(doc => ({ id: doc.id, data: doc.data() }))
        .sort((a, b) => (b.data.createdAtMs || 0) - (a.data.createdAtMs || 0));
      const liveMatch = matches.find(entry => entry.data.state !== 'complete');
      if (liveMatch) {
        openRankedMatch(liveMatch.id);
        return;
      }
      await Promise.all(matches.map(entry => clearMatchedQueueForMatch(entry.id, entry.data)));
      renderRankedPanel();
    }

    function openRankedMatch(matchId) {
      if (!matchId || rankedMatchId === matchId) return;
      clearRankedMatchWatcher();
      rankedMatchId = matchId;
      rankedMatchUnsub = db.collection('rankedMatches').doc(matchId).onSnapshot(async snap => {
        if (!snap.exists) return;
        rankedMatchData = snap.data();
        rankedStatus = rankedMatchData.state === 'complete' ? 'complete' : 'live';
        if (activeGame !== rankedMatchData.game || !document.getElementById('page-game').classList.contains('active')) {
          activateRankedGame(rankedMatchData.game);
        } else {
          applyActiveGameUi();
        }
        if (rankedMatchData.game === 'chess') syncRankedChessGame();
        watchRankedPresence();
        claimRankedForfeitFromPresence();
        scheduleRankedGameStart();
        renderRankedPanel();
        if (rankedMatchData.state === 'complete') {
          await processCompletedRankedMatch(matchId, rankedMatchData);
        }
      });
      clearRankedQueueWatcher();
      clearRankedQueueState();
    }

    async function processCompletedRankedMatch(matchId, data) {
      const selfId = currentRankedMatchPlayerId(data);
      if (!currentUser || !selfId || !data?.players?.includes(selfId)) return;
      await clearMatchedQueueForMatch(matchId, data);
      const ratingRef = db.collection('ratings').doc(currentUser.uid);
      const snap = await ratingRef.get().catch(() => null);
      const current = snap?.exists ? snap.data() : {};
      const receipts = current.processedMatches || {};
      if (receipts[matchId]) return;
      if (isSelfRankedMatch(data)) {
        await ratingRef.set({
          processedMatches: Object.assign({}, receipts, { [matchId]: true }),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(err => console.error('Rating receipt save failed:', err));
        renderRankedPanel();
        return;
      }
      const me = currentRankedRating(data.game);
      const oppUid = rankedOpponentUid(data);
      const myBase = data.ratings?.[selfId] || me;
      const oppBase = data.ratings?.[rankedOpponentId(data)] || DEFAULT_ELO;
      let score = 0.5;
      if (data.result?.winner === selfId) score = 1;
      else if (data.result?.winner && data.result.winner !== 'draw') score = 0;
      const next = calcNextElo(myBase, oppBase, score);
      rankedRatings[data.game] = next;
      await ratingRef.set({
        [data.game]: next,
        processedMatches: Object.assign({}, receipts, { [matchId]: true }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.error('Rating save failed:', err));
      renderRankedPanel();
    }

    async function leaveRankedMatch(reason) {
      if (!currentUser) return;
      if (rankedQueueDocId) { await cancelRankedQueue(); return; }
      if (!rankedMatchId || !rankedMatchData || rankedMatchData.state === 'complete') return;
      const oppId = rankedOpponentId(rankedMatchData);
      await db.collection('rankedMatches').doc(rankedMatchId).set({
        state: 'complete',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        result: {
          winner: oppId || 'draw',
          reason: 'forfeit',
          text: (oppId ? rankedMatchData.playerNames?.[oppId] || 'Opponent' : 'Opponent') + (reason === 'left_match' ? ' wins after you left' : ' wins by forfeit'),
          scores: rankedMatchData.result?.scores || {}
        }
      }, { merge: true }).catch(err => console.error('Forfeit failed:', err));
    }

    function abandonRankedMatch(reason) {
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.state === 'complete') return;
      leaveRankedMatch(reason || 'left_match');
    }

    async function resetMyRankedSessions() {
      if (!currentUser) return { matches: 0, queues: 0 };
      const queueSnap = await db.collection('rankedQueue')
        .where('uid', '==', currentUser.uid)
        .limit(20)
        .get()
        .catch(() => null);
      let queueCount = 0;
      if (queueSnap?.docs?.length) {
        await Promise.all(queueSnap.docs.map(doc => {
          const data = doc.data();
          if (!['searching', 'matched'].includes(data.status)) return Promise.resolve();
          queueCount++;
          return doc.ref.set({
            status: 'canceled',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true }).catch(() => {});
        }));
      }

      const matchSnap = await db.collection('rankedMatches')
        .where('authorizedUids', 'array-contains', currentUser.uid)
        .limit(20)
        .get()
        .catch(() => null);
      let matchCount = 0;
      if (matchSnap?.docs?.length) {
        await Promise.all(matchSnap.docs.map(doc => {
          const data = doc.data();
          if (data.state === 'complete') return Promise.resolve();
          matchCount++;
          return doc.ref.set({
            state: 'complete',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            result: {
              winner: 'draw',
              reason: 'admin_reset',
              text: 'Match ended by reset',
              scores: data.result?.scores || {}
            }
          }, { merge: true }).catch(() => {});
        }));
      }

      resetRankedState(false);
      return { matches: matchCount, queues: queueCount };
    }

    function scheduleRankedGameStart() {
      clearTimeout(rankedStartTimer);
      if (!rankedMatchData || rankedMatchData.state === 'complete') return;
      const delay = Math.max(0, (rankedMatchData.payload?.startAtMs || Date.now()) - Date.now());
      rankedStartTimer = setTimeout(() => startRankedGameIfNeeded(), delay + 10);
    }

    function startRankedGameIfNeeded() {
      if (!rankedMatchData || rankedMatchData.state === 'complete' || rankedStartedMatchId === rankedMatchId) return;
      rankedStartedMatchId = rankedMatchId;
      if (rankedMatchData.game === 'reaction') startRankedReactionGame();
      if (rankedMatchData.game === 'aim') startRankedAimGame();
      if (rankedMatchData.game === 'cps') startRankedCpsGame();
      if (rankedMatchData.game === 'chess') syncRankedChessGame();
    }

    window.addEventListener('pagehide', () => abandonRankedMatch('left_match'));

    // ── Bot mode (tap title 5x) ───────────────────────────────
    let botMode=false, titleTaps=0, titleTapTimer, botTapTimeout;

    document.getElementById('game-text').addEventListener('click', e => {
      e.stopPropagation();
      clearTimeout(titleTapTimer);
      titleTaps++;
      titleTapTimer = setTimeout(()=>{ titleTaps=0; }, 900);
      if (titleTaps>=5) {
        titleTaps=0; botMode=!botMode;
        document.getElementById('game-sub').textContent = botMode ? '🤖 Bot on' : '';
        if (!botMode) clearTimeout(botTapTimeout);
      }
    });

    // ── Arc progress ring ─────────────────────────────────────
    const ARC_CIRC = 879.6;
    function setArc(fraction, color) {
      const arc = document.getElementById('watch-arc');
      arc.style.strokeDashoffset = ARC_CIRC * (1 - fraction);
      arc.style.stroke = color || 'var(--green)';
    }

    // ── Game state ────────────────────────────────────────────
    let waiting=false, ready=false, running=false;
    let startTime=0, streak=0, maxStreakSession=0;
    let sessionTimes=[];
    let timeout, nextRoundTimeout, windowTimeout;
    let allTimeBest = null;
    let cpsRunning = false;
    let cpsCount = 0;
    let cpsEndsAt = 0;
    let cpsTimer = null;

    const ringEl   = document.getElementById('watch-ring');
    const gameText = document.getElementById('game-text');
    const gameSub  = document.getElementById('game-sub');
    const statsBarEl = document.getElementById('stats-bar');
    const ratingEl   = document.getElementById('reaction-rating');

    function setGameState(state) {
      ringEl.className = 'state-' + state;
      document.body.classList.remove('state-idle', 'state-wait', 'state-go', 'state-result');
      document.body.classList.add('state-' + state);
    }

    function startGame() {
      if (activeGame === 'cps') { startCpsGame(); return; }
      if (activeGame === 'aim') { startAimGame(); return; }
      if (activeGame === 'chimp') { startChimpGame(); return; }
      if (isRankedLiveGame('reaction')) return;
      running=true; streak=0; sessionTimes=[];
      setArc(0);
      updateStatsBar(); nextRound();
    }

    function stopGame() {
      if (activeGame === 'cps') { if (!isRankedLiveGame('cps')) resetCpsGame(); return; }
      if (activeGame === 'aim') { stopAimGame(); return; }
      if (activeGame === 'chimp') { stopChimpGame(); return; }
      if (isRankedLiveGame('reaction')) return;
      running=false; waiting=false; ready=false;
      clearTimeout(timeout); clearTimeout(nextRoundTimeout); clearTimeout(windowTimeout);
      setGameState('idle');
      gameText.textContent='Tap Start'; gameSub.textContent='';
      ratingEl.textContent=''; setArc(0);
    }

    function nextRound() {
      clearTimeout(nextRoundTimeout); clearTimeout(windowTimeout);
      setGameState('wait');
      gameText.textContent='Wait...'; gameSub.textContent='';
      setArc(0, 'var(--red, #e53935)');
      waiting=true; ready=false;

      const cfg=DIFFICULTY[difficulty];
      const delay=Math.random()*(cfg.maxDelay-cfg.minDelay)+cfg.minDelay;
      clearTimeout(timeout);
      timeout=setTimeout(()=>{
        setGameState('go');
        gameText.textContent='TAP!';
        gameSub.textContent=difficulty==='hard'?'Be quick!':'';
        setArc(1, 'var(--green)');
        startTime=Date.now(); ready=true;
        haptic('go');
        if (botMode) botTapTimeout=setTimeout(()=>{ if(ready&&botMode) handleTap(); },0);
        if (cfg.window) {
          windowTimeout=setTimeout(()=>{
            if(ready){ ready=false; waiting=false; streak=0;
              setGameState('result'); gameText.textContent='Too slow!'; gameSub.textContent='';
              setArc(0); updateStatsBar();
              if(running) nextRoundTimeout=setTimeout(nextRound,1300);
            }
          }, cfg.window);
        }
      }, delay);
    }

    function handleTap() {
      if (activeGame === 'cps') { handleCpsTap(); return; }
      if (activeGame === 'aim') return;
      if (activeGame === 'chimp') return;
      if (isRankedLiveGame('reaction')) { handleRankedReactionTap(); return; }
      if (waiting && !ready) {
        clearTimeout(timeout); streak=0;
        setGameState('result'); gameText.textContent='Too early!'; gameSub.textContent='';
        ratingEl.textContent=''; setArc(0);
        waiting=false; haptic('early'); updateStatsBar();
        if(running) nextRoundTimeout=setTimeout(nextRound,1300);
        return;
      }
      if (ready) {
        clearTimeout(windowTimeout);
        const reaction=Date.now()-startTime;
        ringEl.classList.remove('flash'); void ringEl.offsetWidth; ringEl.classList.add('flash');
        playTapSound(); haptic('tap');
        setGameState('result'); gameText.textContent=reaction+' ms';
        sessionTimes.push(reaction); streak++;
        maxStreakSession=Math.max(maxStreakSession,streak);

        const tr=parseInt(localStorage.getItem('totalRounds')||'0')+1;
        localStorage.setItem('totalRounds',tr);
        localStorage.setItem('maxStreak',Math.max(parseInt(localStorage.getItem('maxStreak')||'0'),maxStreakSession));

        // arc fills based on how good the reaction is (150ms=full, 500ms=empty)
        const arcFrac = Math.max(0, Math.min(1, 1-(reaction-150)/350));
        setArc(arcFrac);

        const isNewBest = !botMode && currentUser && (allTimeBest===null || reaction<allTimeBest);
        const isSessionBest = sessionTimes.length>1 && reaction===Math.min(...sessionTimes);

        if (isNewBest) { gameSub.textContent='🏆 New personal best!'; launchConfetti(); haptic('best'); }
        else if (isSessionBest) { gameSub.textContent='New session best!'; }
        else if (streak>=3) { gameSub.textContent='Streak: '+streak; }
        else { gameSub.textContent=''; }

        if (!botMode) { showRating(reaction); saveScore(reaction); checkAchievements(); }
        waiting=false; ready=false; updateStatsBar();
        if(running) nextRoundTimeout=setTimeout(nextRound,1400);
      }
    }

    function startRankedReactionGame() {
      running = true;
      waiting = false;
      ready = false;
      streak = 0;
      sessionTimes = [];
      rankedReactionRound = 0;
      setArc(0);
      updateStatsBar();
      nextRankedReactionRound();
    }

    function nextRankedReactionRound() {
      if (!isRankedLiveGame('reaction')) return;
      const payload = rankedMatchData.payload || {};
      if (rankedReactionRound >= (payload.roundCount || 0)) {
        submitRankedArcadeResult('reaction', {
          rounds: sessionTimes.slice(),
          score: Math.round(sessionTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, sessionTimes.length))
        });
        return;
      }
      clearTimeout(nextRoundTimeout);
      clearTimeout(windowTimeout);
      setGameState('wait');
      gameText.textContent = 'Wait...';
      gameSub.textContent = 'Round ' + (rankedReactionRound + 1) + ' of ' + payload.roundCount;
      setArc(0, 'var(--red, #e53935)');
      waiting = true;
      ready = false;
      timeout = setTimeout(() => {
        setGameState('go');
        gameText.textContent = 'TAP!';
        gameSub.textContent = 'Round ' + (rankedReactionRound + 1) + ' of ' + payload.roundCount;
        setArc(1, 'var(--green)');
        startTime = Date.now();
        ready = true;
        waiting = false;
        haptic('go');
      }, (payload.delays || [1500])[rankedReactionRound] || 1500);
    }

    function handleRankedReactionTap() {
      if (!isRankedLiveGame('reaction')) return;
      if (waiting && !ready) {
        clearTimeout(timeout);
        setGameState('result');
        gameText.textContent = 'Too early!';
        gameSub.textContent = 'Round resets';
        setArc(0);
        waiting = false;
        ready = false;
        haptic('early');
        nextRoundTimeout = setTimeout(nextRankedReactionRound, 900);
        return;
      }
      if (!ready) return;
      const reaction = Date.now() - startTime;
      clearTimeout(windowTimeout);
      playTapSound();
      haptic('tap');
      sessionTimes.push(reaction);
      setGameState('result');
      gameText.textContent = reaction + ' ms';
      gameSub.textContent = 'Saved';
      setArc(Math.max(0, Math.min(1, 1 - (reaction - 150) / 350)));
      rankedReactionRound++;
      updateStatsBar();
      waiting = false;
      ready = false;
      nextRoundTimeout = setTimeout(nextRankedReactionRound, 800);
    }
