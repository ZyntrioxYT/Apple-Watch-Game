    // ── Aim Trainer ─────────────────────────────────────────────
    let aimRunning = false;
    let aimHits = 0;
    let aimMisses = 0;
    let aimTargetAt = 0;
    let aimTimes = [];

    function aimRatingFor(ms) {
      if (ms < 450) return { label:'⚡ Deadeye', color:'#ff4fc8' };
      if (ms < 650) return { label:'🎯 Sharp', color:'#00c853' };
      if (ms < 850) return { label:'👍 Steady', color:'#4db8ff' };
      if (ms < 1100) return { label:'😐 Warmup', color:'#ffd700' };
      return { label:'🐢 Slow', color:'#ff5555' };
    }

    function aimElements() {
      return {
        board: document.getElementById('aim-board'),
        target: document.getElementById('aim-target'),
        hits: document.getElementById('aim-hit-count'),
        avg: document.getElementById('aim-avg'),
        accuracy: document.getElementById('aim-accuracy'),
        rating: document.getElementById('aim-rating'),
        stats: document.getElementById('aim-stats-bar')
      };
    }

    function startAimGame() {
      if (isRankedLiveGame('aim')) return startRankedAimGame();
      aimRunning = true;
      aimHits = 0;
      aimMisses = 0;
      aimTimes = [];
      const els = aimElements();
      els.board.className = 'ready';
      els.rating.textContent = '';
      updateAimHud();
      placeAimTarget();
    }

    function stopAimGame() {
      if (isRankedLiveGame('aim')) return;
      aimRunning = false;
      const els = aimElements();
      els.target.classList.remove('show');
      els.board.className = '';
      els.stats.textContent = '';
      els.rating.textContent = '';
      updateAimHud();
    }

    function placeAimTarget() {
      if (!aimRunning) return;
      const els = aimElements();
      const rect = els.board.getBoundingClientRect();
      if (isRankedLiveGame('aim')) {
        const payload = rankedMatchData.payload || {};
        const point = (payload.positions || [])[aimHits];
        const size = payload.targetSize || 52;
        const radius = size / 2;
        els.target.style.width = size + 'px';
        els.target.style.height = size + 'px';
        els.target.style.left = (radius + (rect.width - size) * Math.min(1, Math.max(0, point?.x || 0.5))) + 'px';
        els.target.style.top = (radius + (rect.height - size) * Math.min(1, Math.max(0, point?.y || 0.5))) + 'px';
        els.target.classList.add('show');
        aimTargetAt = Date.now();
        return;
      }
      const cfg = AIM_DIFFICULTY[difficulty];
      const radius = cfg.size / 2;
      const x = radius + Math.random() * Math.max(1, rect.width - cfg.size);
      const y = radius + Math.random() * Math.max(1, rect.height - cfg.size);
      els.target.style.width = cfg.size + 'px';
      els.target.style.height = cfg.size + 'px';
      els.target.style.left = x + 'px';
      els.target.style.top = y + 'px';
      els.target.classList.add('show');
      aimTargetAt = Date.now();
    }

    function updateAimHud() {
      const payload = rankedMatchData?.payload || {};
      const totalTargets = isRankedLiveGame('aim') ? (payload.totalTargets || 10) : AIM_DIFFICULTY[difficulty].targets;
      const els = aimElements();
      const attempts = aimHits + aimMisses;
      const avg = aimTimes.length ? Math.round(aimTimes.reduce((a,b)=>a+b,0) / aimTimes.length) : null;
      const accuracy = attempts ? Math.round((aimHits / attempts) * 100) : 100;
      els.hits.textContent = aimHits + '/' + totalTargets;
      els.avg.textContent = avg ? avg + 'ms' : '—';
      els.accuracy.textContent = accuracy + '%';
      els.stats.textContent = aimRunning ? 'Misses: ' + aimMisses : '';
    }

    function finishAimGame() {
      aimRunning = false;
      const els = aimElements();
      els.target.classList.remove('show');
      els.board.className = 'finished';
      const avg = Math.round(aimTimes.reduce((a,b)=>a+b,0) / aimTimes.length);
      const penalty = aimMisses * 35;
      const score = avg + penalty;
      const rating = aimRatingFor(score);
      const tr = parseInt(localStorage.getItem('totalRounds') || '0') + 1;
      localStorage.setItem('totalRounds', tr);
      els.rating.textContent = rating.label;
      els.rating.style.color = rating.color;
      els.stats.textContent = 'Score: ' + score + 'ms avg' + (penalty ? ' · +' + penalty + 'ms misses' : '');
      if (isRankedLiveGame('aim')) {
        submitRankedArcadeResult('aim', {
          score,
          times: aimTimes.slice(),
          misses: aimMisses
        });
        return;
      }
      showRating(score);
      saveScore(score);
      checkAchievements();
      if (currentUser && (allTimeBest === null || score < allTimeBest)) {
        launchConfetti();
        haptic('best');
      }
    }

    function hitAimTarget(e) {
      e.stopPropagation();
      if (!aimRunning) return;
      const elapsed = Date.now() - aimTargetAt;
      aimTimes.push(elapsed);
      aimHits++;
      playTapSound();
      haptic('tap');
      updateAimHud();
      if (aimHits >= (isRankedLiveGame('aim') ? (rankedMatchData?.payload?.totalTargets || 10) : AIM_DIFFICULTY[difficulty].targets)) finishAimGame();
      else placeAimTarget();
    }

    function aimBoardMiss(e) {
      if (!aimRunning || e.target.id === 'aim-target') return;
      aimMisses++;
      haptic('early');
      updateAimHud();
    }

    function startRankedAimGame() {
      if (!isRankedLiveGame('aim')) return;
      aimRunning = true;
      aimHits = 0;
      aimMisses = 0;
      aimTimes = [];
      const els = aimElements();
      els.board.className = 'ready';
      els.rating.textContent = '';
      els.stats.textContent = 'Ranked match live';
      updateAimHud();
      placeAimTarget();
    }

    function cpsRatingFor(value) {
      if (value >= 9) return { label:'Elite', color:'#ff4fc8' };
      if (value >= 7.5) return { label:'Fast', color:'#00c853' };
      if (value >= 6) return { label:'Sharp', color:'#4db8ff' };
      if (value >= 4.5) return { label:'Steady', color:'#ffd700' };
      return { label:'Warmup', color:'#ff7777' };
    }

    function resetCpsGame() {
      cpsRunning = false;
      cpsCount = 0;
      clearInterval(cpsTimer);
      cpsTimer = null;
      document.getElementById('cps-button').textContent = 'Start';
      document.getElementById('cps-button').classList.remove('running');
      document.getElementById('cps-info').textContent = '10 second test';
      document.getElementById('cps-sub').textContent = 'Tap to begin';
    }

    function startCpsGame() {
      if (isRankedLiveGame('cps')) return startRankedCpsGame();
      cpsRunning = true;
      cpsCount = 0;
      cpsEndsAt = Date.now() + 10000;
      document.getElementById('cps-button').classList.add('running');
      document.getElementById('cps-button').textContent = '0';
      document.getElementById('cps-sub').textContent = 'Tap fast';
      clearInterval(cpsTimer);
      cpsTimer = setInterval(tickCpsGame, 100);
      haptic('go');
    }

    function handleCpsTap() {
      if (isRankedLiveGame('cps') && Date.now() < (rankedMatchData?.payload?.startAtMs || 0)) return;
      if (!cpsRunning) {
        startCpsGame();
        return;
      }
      cpsCount++;
      document.getElementById('cps-button').textContent = cpsCount;
      haptic('tap');
    }

    function tickCpsGame() {
      const left = Math.max(0, cpsEndsAt - Date.now());
      document.getElementById('cps-info').textContent = (left / 1000).toFixed(1) + 's left';
      if (left <= 0) finishCpsGame();
    }

    function finishCpsGame() {
      clearInterval(cpsTimer);
      cpsTimer = null;
      cpsRunning = false;
      const cps = Number((cpsCount / 10).toFixed(1));
      const best = parseFloat(localStorage.getItem('watchCpsBest') || '0');
      const rating = cpsRatingFor(cps);
      localStorage.setItem('watchCpsPlays', String(getWatchCpsPlays() + 1));
      if (cps > best) localStorage.setItem('watchCpsBest', String(cps));
      document.getElementById('cps-button').textContent = cps.toFixed(1);
      document.getElementById('cps-button').classList.remove('running');
      document.getElementById('cps-info').textContent = rating.label;
      document.getElementById('cps-sub').textContent = (cps > best ? 'New best' : 'Done') + ' · ' + cpsCount + ' taps';
      if (isRankedLiveGame('cps')) {
        submitRankedArcadeResult('cps', { score: cps, taps: cpsCount });
        return;
      }
      haptic('best');
    }

    function startRankedCpsGame() {
      if (!isRankedLiveGame('cps')) return;
      cpsRunning = true;
      cpsCount = 0;
      cpsEndsAt = (rankedMatchData?.payload?.startAtMs || Date.now()) + (rankedMatchData?.payload?.durationMs || 10000);
      document.getElementById('cps-button').classList.add('running');
      document.getElementById('cps-button').textContent = '0';
      document.getElementById('cps-info').textContent = '10.0s left';
      document.getElementById('cps-sub').textContent = 'Ranked live';
      clearInterval(cpsTimer);
      cpsTimer = setInterval(tickCpsGame, 100);
    }

    async function submitRankedArcadeResult(game, result) {
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.game !== game) return;
      const ref = db.collection('rankedMatches').doc(rankedMatchId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        if (data.state === 'complete') return;
        const players = data.players || [];
        const scores = Object.assign({}, data.result?.scores || {});
        scores[currentUser.uid] = result.score;
        const payload = Object.assign({}, data.payload || {});
        const submissions = Object.assign({}, payload.submissions || {}, {
          [currentUser.uid]: Object.assign({}, result, { finishedAtMs: Date.now() })
        });
        payload.submissions = submissions;
        const update = {
          payload,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (players.every(uid => submissions[uid])) {
          const [a, b] = players;
          let winner = 'draw';
          if (game === 'cps') winner = scores[a] === scores[b] ? 'draw' : (scores[a] > scores[b] ? a : b);
          else winner = scores[a] === scores[b] ? 'draw' : (scores[a] < scores[b] ? a : b);
          update.state = 'complete';
          update.result = {
            winner,
            text: winner === 'draw' ? 'Draw' : (data.playerNames?.[winner] || 'Winner') + ' wins',
            scores
          };
        }
        tx.set(ref, update, { merge: true });
      }).catch(err => console.error('Ranked result failed:', err));
      if (game === 'reaction') gameSub.textContent = 'Waiting for opponent...';
      if (game === 'aim') document.getElementById('aim-stats-bar').textContent = 'Waiting for opponent...';
      if (game === 'cps') document.getElementById('cps-sub').textContent = 'Waiting for opponent...';
    }

