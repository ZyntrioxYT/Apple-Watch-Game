    // ── Apple Watch UI ────────────────────────────────────────
    // Activates when screen width ≤ 220px (Watch screen sizes: 38mm=136px, 40mm=162px, 44mm=184px, 49mm=205px)
    const watchEl = document.getElementById('watch-ui');

  function isWatch() { return window.innerWidth <= 400; }

    function initWatchUI() {
      if (!isWatch()) return;

      // Hide the normal UI entirely
      document.getElementById('pages').style.display = 'none';
      document.getElementById('tab-bar').style.display = 'none';
      watchEl.style.display = 'flex';

      // subscribe leaderboard for watch
      db.collection('scores').orderBy('time').limit(5).onSnapshot(snap => {
        const list = document.getElementById('w-lb-list');
        if (!list) return;
        list.innerHTML = '';
        if (snap.empty) { list.innerHTML = '<div style="opacity:0.4;font-size:9px;">No scores yet</div>'; return; }
        snap.docs.forEach((doc, i) => {
          const s = doc.data();
          const div = document.createElement('div');
          div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:9px;border-bottom:1px solid rgba(255,255,255,0.06);';
          div.innerHTML = '<span style="opacity:0.7;margin-right:4px;">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.')+'</span>' +
            '<span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escHtml(s.name)+'</span>' +
            '<span style="color:var(--green);font-weight:700;margin-left:4px;">'+s.time+'</span>';
          list.appendChild(div);
        });
      });
    }

    function wSelectGame(game) {
      if (typeof isGameUnlocked === 'function' && !isGameUnlocked(game)) {
        if (typeof showAchieveToast === 'function') showAchieveToast({ icon: '🔒', name: unlockRequirementText(game) });
        return;
      }
      activeGame = GAME_CONFIG[game] ? game : 'reaction';
      if (game !== 'cps') localStorage.setItem('activeGame', activeGame);
      document.getElementById('w-selector-section').style.display = 'none';
      document.getElementById('w-dots').style.display = game === 'reaction' ? 'flex' : 'none';
      document.getElementById('w-game-section').style.display = game === 'reaction' ? 'flex' : 'none';
      document.getElementById('w-lb-section').style.display = 'none';
      document.getElementById('w-aim-section').style.display = game === 'aim' ? 'flex' : 'none';
      document.getElementById('w-rush-section').style.display = game === 'cps' ? 'flex' : 'none';
      document.getElementById('w-chess-section').style.display = game === 'chess' ? 'flex' : 'none';
      if (game === 'reaction') setWatchState('idle', 'Tap', '');
      else if (game === 'aim') wAimReset();
      else if (game === 'chess') { initChessGame(); renderWatchChess(); }
      else wRushReset();
    }

    // watch game state
    let wWaiting=false, wReady=false, wRunning=false, wStartTime=0;
    let wTimeout, wNextTimeout;

    function watchStart() {
      activeGame = 'reaction';
      wRunning = true;
      document.getElementById('w-start').style.display = 'none';
      watchNextRound();
    }

    function watchNextRound() {
      clearTimeout(wNextTimeout); clearTimeout(wTimeout);
      wWaiting=true; wReady=false;
      setWatchState('wait', 'Wait...', '');

      const delay = Math.random() * 3000 + 1500;
      wTimeout = setTimeout(() => {
        setWatchState('go', 'TAP!', '');
        wStartTime = Date.now();
        wReady = true; wWaiting = false;
        haptic('go');
      }, delay);
    }

    function watchHandleTap() {
      if (!wRunning) { watchStart(); return; }

      if (wWaiting && !wReady) {
        clearTimeout(wTimeout);
        wWaiting = false;
        setWatchState('idle', 'Early!', 'Tap again');
        haptic('early');
        wNextTimeout = setTimeout(watchNextRound, 1200);
        return;
      }

      if (wReady) {
        const reaction = Date.now() - wStartTime;
        wReady = false; wWaiting = false;
        haptic('tap'); playTapSound();

        const r = ratingFor(reaction);
        setWatchState('result', reaction + 'ms', r ? r.label : '');

        if (!botMode) saveScore(reaction);
        checkAchievements();

        wNextTimeout = setTimeout(watchNextRound, 1600);
      }
    }

    let wAimRunning = false;
    let wAimHits = 0;
    let wAimMisses = 0;
    let wAimTargetAt = 0;
    let wAimTimes = [];

    function wAimReset() {
      wAimRunning = false;
      wAimHits = 0;
      wAimMisses = 0;
      wAimTimes = [];
      document.getElementById('w-aim-target').classList.remove('show');
      document.getElementById('w-aim-info').textContent = 'Tap Start';
      document.getElementById('w-aim-sub').textContent = '';
      document.getElementById('w-aim-start').style.display = 'inline-block';
    }

    function wAimStart() {
      activeGame = 'aim';
      wAimRunning = true;
      wAimHits = 0;
      wAimMisses = 0;
      wAimTimes = [];
      document.getElementById('w-aim-start').style.display = 'none';
      wAimUpdate();
      wAimPlaceTarget();
    }

    function wAimPlaceTarget() {
      if (!wAimRunning) return;
      const pad = document.getElementById('w-aim-pad');
      const target = document.getElementById('w-aim-target');
      const rect = pad.getBoundingClientRect();
      const size = 34;
      target.style.left = (size / 2 + Math.random() * Math.max(1, rect.width - size)) + 'px';
      target.style.top = (size / 2 + Math.random() * Math.max(1, rect.height - size)) + 'px';
      target.classList.add('show');
      wAimTargetAt = Date.now();
    }

    function wAimUpdate() {
      const avg = wAimTimes.length ? Math.round(wAimTimes.reduce((a,b)=>a+b,0) / wAimTimes.length) : null;
      document.getElementById('w-aim-info').textContent = wAimHits + '/10' + (avg ? ' · ' + avg + 'ms' : '');
      document.getElementById('w-aim-sub').textContent = wAimMisses ? 'Misses: ' + wAimMisses : '';
    }

    function wAimHit(e) {
      e.stopPropagation();
      if (!wAimRunning) return;
      wAimTimes.push(Date.now() - wAimTargetAt);
      wAimHits++;
      haptic('tap');
      playTapSound();
      if (wAimHits >= 10) { wAimFinish(); return; }
      wAimUpdate();
      wAimPlaceTarget();
    }

    function wAimMiss(e) {
      if (!wAimRunning || e.target.id === 'w-aim-target') return;
      wAimMisses++;
      haptic('early');
      wAimUpdate();
    }

    function wAimFinish() {
      wAimRunning = false;
      document.getElementById('w-aim-target').classList.remove('show');
      document.getElementById('w-aim-start').style.display = 'inline-block';
      const avg = Math.round(wAimTimes.reduce((a,b)=>a+b,0) / wAimTimes.length);
      const score = avg + wAimMisses * 35;
      const r = aimRatingFor(score);
      document.getElementById('w-aim-info').textContent = score + 'ms avg';
      document.getElementById('w-aim-sub').textContent = r.label;
      saveScore(score);
      checkAchievements();
    }

    let wRushRunning = false;
    let wRushCount = 0;
    let wRushEndsAt = 0;
    let wRushTimer = null;

    function wRushReset() {
      wRushRunning = false;
      wRushCount = 0;
      clearInterval(wRushTimer);
      document.getElementById('w-rush-button').textContent = 'Start';
      const best = localStorage.getItem('watchCpsBest');
      document.getElementById('w-rush-info').textContent = best ? 'Best: ' + best + ' CPS' : '10 seconds';
    }

    function wRushTap() {
      if (!wRushRunning) {
        wRushRunning = true;
        wRushCount = 0;
        wRushEndsAt = Date.now() + 10000;
        document.getElementById('w-rush-button').textContent = '0';
        wRushTimer = setInterval(wRushTick, 200);
        haptic('go');
        return;
      }
      wRushCount++;
      document.getElementById('w-rush-button').textContent = wRushCount;
      haptic('tap');
    }

    function wRushTick() {
      const left = Math.max(0, Math.ceil((wRushEndsAt - Date.now()) / 1000));
      document.getElementById('w-rush-info').textContent = left + 's left';
      if (left <= 0) {
        clearInterval(wRushTimer);
        wRushRunning = false;
        const cps = (wRushCount / 10).toFixed(1);
        const best = parseFloat(localStorage.getItem('watchCpsBest') || '0');
        localStorage.setItem('watchCpsPlays', String(getWatchCpsPlays() + 1));
        if (parseFloat(cps) > best) localStorage.setItem('watchCpsBest', cps);
        document.getElementById('w-rush-button').textContent = cps;
        document.getElementById('w-rush-info').textContent = (parseFloat(cps) > best ? 'New best' : 'Done') + ' CPS · ' + wRushCount + ' taps';
        haptic('best');
      }
    }

    function renderWatchChess(lastMove) {
      const boardEl = document.getElementById('w-chess-board');
      if (!boardEl) return;
      if (!chessGame) chessGame = createChessGame();
      if (!chessGame) {
        document.getElementById('w-chess-turn').textContent = 'No engine';
        document.getElementById('w-chess-last').textContent = 'Check connection';
        return;
      }
      boardEl.innerHTML = '';
      const files = ['a','b','c','d','e','f','g','h'];
      const ranks = ['8','7','6','5','4','3','2','1'];
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const square = files[f] + ranks[r];
          const piece = chessGame.get(square);
          const cell = document.createElement('div');
          cell.className = 'w-chess-square ' + ((f + r) % 2 === 0 ? 'light' : 'dark');
          if (chessLastMoveSquares.includes(square)) cell.classList.add('last-move');
          cell.innerHTML = piece ? chessPieceMarkup(piece, true) : '';
          boardEl.appendChild(cell);
        }
      }
      document.getElementById('w-chess-turn').textContent = chessStatusText();
      document.getElementById('w-chess-last').textContent = lastMove ? 'Last: ' + lastMove : 'Say e2 to e4';
    }

    async function wChessTypeMove() {
      const move = prompt('Move, like e2 to e4');
      if (!move) return;
      const ok = await playChessMoveText(move);
      renderWatchChess(ok ? move : 'Invalid move');
      if (!ok) haptic('early');
    }

    function wChessListen() {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Speech) { wChessTypeMove(); return; }
      const rec = new Speech();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      document.getElementById('w-chess-last').textContent = 'Listening...';
      rec.onresult = async event => {
        const spoken = event.results[0][0].transcript;
        const ok = await playChessMoveText(spoken);
        renderWatchChess(ok ? spoken : 'Invalid: ' + spoken);
        if (!ok) haptic('early');
      };
      rec.onerror = () => {
        document.getElementById('w-chess-last').textContent = 'Speech failed';
        haptic('early');
      };
      rec.start();
    }

    function setWatchState(state, text, sub) {
      const tap = document.getElementById('w-tap');
      const txt = document.getElementById('w-text');
      const subtxt = document.getElementById('w-sub');
      txt.textContent = text;
      subtxt.textContent = sub;

      tap.className = 'w-circle';
      document.getElementById('watch-ui').className = '';

      if (state === 'wait')   { tap.classList.add('w-wait');   document.getElementById('watch-ui').classList.add('w-bg-wait'); }
      if (state === 'go')     { tap.classList.add('w-go');     document.getElementById('watch-ui').classList.add('w-bg-go'); }
      if (state === 'result') { tap.classList.add('w-result'); }
      if (state === 'idle')   { tap.classList.add('w-idle'); }
    }

    // Watch leaderboard paging
    let wPage = 0;
    function wTogglePage() {
      wPage = wPage === 0 ? 1 : 0;
      document.getElementById('w-game-section').style.display  = wPage === 0 ? 'flex' : 'none';
      document.getElementById('w-lb-section').style.display    = wPage === 1 ? 'flex' : 'none';
      document.getElementById('w-dot-0').style.opacity = wPage === 0 ? '1' : '0.3';
      document.getElementById('w-dot-1').style.opacity = wPage === 1 ? '1' : '0.3';
    }

    // init on load
    window.addEventListener('load', () => {
      if (isWatch()) initWatchUI();
    });
