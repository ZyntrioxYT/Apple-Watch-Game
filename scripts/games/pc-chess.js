    // ── Chess ───────────────────────────────────────────────────
    let chessGame = null;
    let chessSelected = null;
    let chessFlipped = false;
    let chessBotLevel = 'none';
    let chessBotThinking = false;
    let chessBotTimeout = null;

    const CHESS_VALUES = { p:100, n:320, b:330, r:500, q:900, k:0 };
    const CHESS_GLYPHS = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' };

    function createChessGame() {
      if (typeof Chess !== 'function') return null;
      return new Chess();
    }

    function initChessGame() {
      if (!chessGame) resetChessGame(false);
      renderChessBoard();
    }

    function resetChessGame(recordPlay) {
      if (isRankedLiveGame('chess')) return syncRankedChessGame();
      chessGame = createChessGame();
      chessSelected = null;
      chessBotThinking = false;
      clearTimeout(chessBotTimeout);
      chessBotTimeout = null;
      chessLastMoveSquares = [];
      if (recordPlay !== false) recordGamePlay('chess');
      renderChessBoard();
      renderWatchChess();
    }

    function setChessBot(level) {
      if (isRankedLiveGame('chess')) return;
      chessBotLevel = level;
      document.querySelectorAll('.chess-bot-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.bot === level));
      resetChessGame();
    }

    function chessFiles() {
      return chessFlipped ? ['h','g','f','e','d','c','b','a'] : ['a','b','c','d','e','f','g','h'];
    }

    function chessRanks() {
      return chessFlipped ? ['1','2','3','4','5','6','7','8'] : ['8','7','6','5','4','3','2','1'];
    }

    function chessSquareAt(file, rank) {
      return chessFiles()[file] + chessRanks()[rank];
    }

    function chessStatusText() {
      if (!chessGame) return 'Chess engine unavailable';
      if (chessBotThinking) return 'Bot thinking...';
      if (isRankedLiveGame('chess')) {
        const mine = rankedMatchData?.payload?.white === currentRankedMatchPlayerId(rankedMatchData) ? 'w' : 'b';
        if ((rankedMatchData?.payload?.turn || 'w') === mine) return chessGame.in_check() ? 'Your move, in check' : 'Your move';
        return chessGame.in_check() ? 'Opponent to move, check on board' : 'Opponent to move';
      }
      if (chessGame.in_checkmate()) return (chessGame.turn() === 'w' ? 'Black' : 'White') + ' wins by checkmate';
      if (chessGame.in_draw()) return 'Draw';
      return (chessGame.turn() === 'w' ? 'White' : 'Black') + (chessGame.in_check() ? ' in check' : ' to move');
    }

    function setChessLastMove(move) {
      chessLastMoveSquares = move ? [move.from, move.to] : [];
      chessLastMoveSan = move?.san || '';
    }

    function chessPieceMarkup(piece, compact) {
      if (!piece) return '';
      const cls = compact ? 'w-chess-piece-glyph' : 'chess-piece-glyph';
      const colorCls = piece.color === 'w' ? ' white' : ' black';
      const glyph = CHESS_GLYPHS[piece.type] || '?';
      return '<span class="' + cls + colorCls + '" aria-hidden="true">' + glyph + '</span>';
    }

    function syncChessHistoryState() {
      if (!chessGame) return;
      const history = chessGame.history({ verbose: true });
      const last = history.length ? history[history.length - 1] : null;
      setChessLastMove(last || null);
    }

    function syncRankedChessGame() {
      if (!rankedMatchData?.payload || rankedMatchData.game !== 'chess') return;
      const incomingSan = rankedMatchData.payload.lastMove?.san || '';
      const changedMove = incomingSan && incomingSan !== chessLastMoveSan;
      chessSelected = null;
      chessBotThinking = false;
      chessGame = createChessGame();
      if (chessGame && rankedMatchData.payload.fen && rankedMatchData.payload.fen !== 'start') chessGame.load(rankedMatchData.payload.fen);
      setChessLastMove(rankedMatchData.payload.lastMove);
      if (changedMove) playChessSound(rankedMatchData.payload.lastMove);
      renderChessBoard();
      renderWatchChess(rankedMatchData.payload.lastMove?.san);
    }

    function renderChessBoard() {
      const boardEl = document.getElementById('chess-board');
      if (!boardEl || activeGame !== 'chess') return;
      if (!chessGame) {
        boardEl.innerHTML = '<div style="grid-column:1/-1;padding:20px;color:var(--text-dim);font-size:13px;">Chess engine could not load.</div>';
        return;
      }

      const legalTargets = chessSelected ? chessGame.moves({ square: chessSelected, verbose: true }).map(m => m.to) : [];
      boardEl.innerHTML = '';
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const square = chessSquareAt(f, r);
          const piece = chessGame.get(square);
          const btn = document.createElement('button');
          btn.className = 'chess-square ' + ((f + r) % 2 === 0 ? 'light' : 'dark');
          if (square === chessSelected) btn.classList.add('selected');
          if (legalTargets.includes(square)) btn.classList.add('legal');
          if (chessLastMoveSquares.includes(square)) btn.classList.add('last-move');
          btn.dataset.square = square;
          btn.innerHTML = piece ? chessPieceMarkup(piece, false) : '';
          btn.addEventListener('click', () => handleChessSquare(square));
          boardEl.appendChild(btn);
        }
      }
      document.getElementById('chess-status').textContent = chessStatusText();
      const history = isRankedLiveGame('chess') ? (rankedMatchData?.payload?.history || []) : chessGame.history();
      document.getElementById('chess-moves').innerHTML = '<strong style="color:white;">Moves</strong><br>' + (history.length ? escHtml(history.join(' ')) : 'No moves yet');
    }

    async function handleChessSquare(square) {
      if (!chessGame || chessGame.game_over() || chessBotThinking) return;
      if (isChessBotTurn()) return;
      const piece = chessGame.get(square);
      if (!chessSelected) {
        if (piece && piece.color === chessGame.turn()) chessSelected = square;
        renderChessBoard();
        return;
      }

      if (isRankedLiveGame('chess')) {
        const from = chessSelected;
        const preview = createChessGame();
        if (preview && chessGame.fen() !== 'start') preview.load(chessGame.fen());
        const move = preview?.move({ from, to: square, promotion: 'q' });
        if (!move) {
          chessSelected = piece && piece.color === chessGame.turn() ? square : null;
          renderChessBoard();
          return;
        }
        chessSelected = null;
        await submitRankedChessMove(from, square);
        return;
      }

      const move = chessGame.move({ from: chessSelected, to: square, promotion: 'q' });
      if (!move) {
        chessSelected = piece && piece.color === chessGame.turn() ? square : null;
      } else {
        chessSelected = null;
        setChessLastMove(move);
        playChessSound(move);
        haptic('tap');
        maybeUnlockChimpFromChess();
        scheduleChessBotMove();
      }
      renderChessBoard();
    }

    function flipChessBoard() {
      chessFlipped = !chessFlipped;
      renderChessBoard();
    }

    function isChessBotTurn() {
      if (isRankedLiveGame('chess')) return false;
      return chessBotLevel !== 'none' && chessGame && chessGame.turn() === 'b' && !chessGame.game_over();
    }

    function maybeUnlockChimpFromChess() {
      if (!chessGame || !['medium', 'hard'].includes(chessBotLevel)) return;
      if (!chessGame.game_over() || !chessGame.in_checkmate()) return;
      if (chessGame.turn() !== 'b') return;
      localStorage.setItem('chimpUnlocked', '1');
      if (typeof refreshGameUnlocks === 'function') refreshGameUnlocks();
      showAchieveToast({ icon: '🧠', name: 'Chimp Test unlocked' });
    }

    function scheduleChessBotMove() {
      if (!isChessBotTurn()) return;
      chessBotThinking = true;
      renderChessBoard();
      clearTimeout(chessBotTimeout);
      chessBotTimeout = setTimeout(() => {
        const move = chooseChessBotMove(chessBotLevel);
        const played = move ? chessGame.move(move) : null;
        chessBotThinking = false;
        chessBotTimeout = null;
        if (played) setChessLastMove(played);
        renderChessBoard();
        if (played) playChessSound(played);
        haptic('tap');
      }, 900 + Math.random() * 700);
    }

    function chooseChessBotMove(level) {
      const moves = chessGame.moves({ verbose: true });
      if (!moves.length) return null;
      if (level === 'easy') return moves[Math.floor(Math.random() * moves.length)];
      if (level === 'medium') return chooseMediumChessMove(moves);
      return chooseHardChessMove(moves);
    }

    function moveScore(move) {
      let score = 0;
      if (move.captured) score += (CHESS_VALUES[move.captured] || 0) - (CHESS_VALUES[move.piece] || 0) * 0.1;
      if (move.san.includes('+')) score += 45;
      if (move.san.includes('#')) score += 10000;
      if (move.flags.includes('p')) score += 800;
      if (['d4','e4','d5','e5'].includes(move.to)) score += 18;
      return score + Math.random() * 8;
    }

    function chooseMediumChessMove(moves) {
      return moves.slice().sort((a, b) => moveScore(b) - moveScore(a))[0];
    }

    function evaluateChessBoard() {
      let score = 0;
      const board = chessGame.board();
      board.forEach(row => row.forEach(piece => {
        if (!piece) return;
        const value = CHESS_VALUES[piece.type] || 0;
        score += piece.color === 'b' ? value : -value;
      }));
      if (chessGame.in_checkmate()) score += chessGame.turn() === 'w' ? 100000 : -100000;
      if (chessGame.in_draw()) score = 0;
      return score;
    }

    function chooseHardChessMove(moves) {
      let best = null;
      let bestScore = -Infinity;
      moves.forEach(move => {
        chessGame.move(move);
        let replyPenalty = 0;
        const replies = chessGame.moves({ verbose: true });
        replies.forEach(reply => {
          replyPenalty = Math.max(replyPenalty, moveScore(reply));
        });
        const score = evaluateChessBoard() + moveScore(move) - replyPenalty * 0.55;
        chessGame.undo();
        if (score > bestScore) {
          bestScore = score;
          best = move;
        }
      });
      return best || chooseMediumChessMove(moves);
    }

    function undoChessMove() {
      if (isRankedLiveGame('chess') || !chessGame) return false;
      clearTimeout(chessBotTimeout);
      chessBotTimeout = null;
      chessBotThinking = false;
      const undoCount = chessBotLevel !== 'none' ? 2 : 1;
      let undone = 0;
      while (undone < undoCount && chessGame.undo()) undone++;
      if (!undone) return false;
      chessSelected = null;
      syncChessHistoryState();
      renderChessBoard();
      renderWatchChess(chessLastMoveSan || '');
      return true;
    }

    async function submitRankedChessMove(from, to) {
      if (!currentUser || !rankedMatchId || !rankedMatchData || rankedMatchData.game !== 'chess') return false;
      const ref = db.collection('rankedMatches').doc(rankedMatchId);
      const committed = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Match missing');
        const data = snap.data();
        if (data.state === 'complete') throw new Error('Match complete');
        const payload = Object.assign({}, data.payload || {});
        const engine = createChessGame();
        if (payload.fen && payload.fen !== 'start') engine.load(payload.fen);
        const selfId = currentRankedMatchPlayerId(data);
        if (!selfId) throw new Error('Player not in ranked match');
        const myColor = payload.white === selfId ? 'w' : 'b';
        if ((payload.turn || 'w') !== myColor) throw new Error('Not your turn');
        const move = engine.move({ from, to, promotion: 'q' });
        if (!move) throw new Error('Illegal move');
        payload.fen = engine.fen();
        payload.turn = engine.turn();
        payload.history = (payload.history || []).concat(move.san);
        payload.lastMove = { from: move.from, to: move.to, san: move.san, by: selfId };
        const update = {
          payload,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (engine.game_over()) {
          let winner = 'draw';
          if (engine.in_checkmate()) winner = engine.turn() === 'w' ? payload.black : payload.white;
          update.state = 'complete';
          update.result = {
            winner,
            text: winner === 'draw' ? 'Draw' : (data.playerNames?.[winner] || 'Winner') + ' wins',
            scores: {}
          };
        }
        tx.set(ref, update, { merge: true });
        return true;
      }).catch(err => {
        console.error('Ranked chess move failed:', err);
        return false;
      });
      return committed;
    }

    function parseSpokenChessMove(text) {
      const cleaned = String(text).toLowerCase()
        .replace(/won/g, 'one')
        .replace(/too|to|two/g, '2')
        .replace(/for|four/g, '4')
        .replace(/ate/g, '8')
        .replace(/one/g, '1')
        .replace(/three/g, '3')
        .replace(/five/g, '5')
        .replace(/six/g, '6')
        .replace(/seven/g, '7')
        .replace(/eight/g, '8')
        .replace(/[^a-h1-8]/g, '');
      const match = cleaned.match(/[a-h][1-8].*?[a-h][1-8]/);
      if (!match) return null;
      const squares = match[0].match(/[a-h][1-8]/g);
      return squares && squares.length >= 2 ? { from: squares[0], to: squares[1] } : null;
    }

    async function playChessMoveText(text) {
      if (!chessGame) resetChessGame();
      const parsed = parseSpokenChessMove(text);
      if (!parsed) return false;
      if (isRankedLiveGame('chess')) {
        return await submitRankedChessMove(parsed.from, parsed.to);
      }
      const move = chessGame.move({ from: parsed.from, to: parsed.to, promotion: 'q' });
      if (!move) return false;
      chessSelected = null;
      setChessLastMove(move);
      renderChessBoard();
      renderWatchChess(move.san);
      playChessSound(move);
      haptic('tap');
      scheduleChessBotMove();
      return true;
    }
