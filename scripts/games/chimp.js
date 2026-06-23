    // ── Chimp Test ────────────────────────────────────────────
    const CHIMP_GRID_CELLS = 25;
    const CHIMP_START_LEVEL = 4;
    const CHIMP_MEMORIZE_MS = 1350;
    let chimpRunning = false;
    let chimpLevel = CHIMP_START_LEVEL;
    let chimpLives = 1;
    let chimpSequence = [];
    let chimpInputIndex = 0;
    let chimpReveal = true;
    let chimpSolved = [];
    let chimpTimer = null;

    function getChimpBestLevel() {
      return parseInt(localStorage.getItem('chimpBestLevel') || '0', 10) || 0;
    }

    function getChimpLocalPlays() {
      return parseInt(localStorage.getItem('chimpPlays') || '0', 10) || 0;
    }

    function setChimpBestLevel(level) {
      if (level > getChimpBestLevel()) localStorage.setItem('chimpBestLevel', String(level));
    }

    function initChimpGame() {
      const board = document.getElementById('chimp-board');
      if (!board || board.dataset.ready === '1') {
        updateChimpHud();
        return;
      }
      board.dataset.ready = '1';
      board.innerHTML = '';
      for (let i = 0; i < CHIMP_GRID_CELLS; i++) {
        const button = document.createElement('button');
        button.className = 'chimp-cell';
        button.type = 'button';
        button.dataset.index = String(i);
        button.addEventListener('click', () => chimpTapCell(i));
        board.appendChild(button);
      }
      resetChimpGame();
    }

    function updateChimpHud() {
      document.getElementById('chimp-level-val').textContent = chimpLevel;
      document.getElementById('chimp-best-val').textContent = getChimpBestLevel();
      document.getElementById('chimp-lives-val').textContent = chimpLives;
    }

    function chimpStatus(text, sub) {
      document.getElementById('chimp-status').textContent = text;
      document.getElementById('chimp-sub').textContent = sub;
      updateChimpHud();
    }

    function resetChimpGame() {
      clearTimeout(chimpTimer);
      chimpRunning = false;
      chimpLevel = CHIMP_START_LEVEL;
      chimpLives = 1;
      chimpSequence = [];
      chimpInputIndex = 0;
      chimpReveal = true;
      chimpSolved = [];
      renderChimpBoard();
      chimpStatus('Chimp Test', 'Memorize the numbers, then tap them back in order.');
    }

    function stopChimpGame() {
      clearTimeout(chimpTimer);
      chimpRunning = false;
      chimpSequence = [];
      chimpInputIndex = 0;
      chimpReveal = true;
      chimpSolved = [];
      renderChimpBoard();
    }

    function randomChimpSequence(length) {
      const pool = Array.from({ length: CHIMP_GRID_CELLS }, (_, index) => index);
      const chosen = [];
      while (chosen.length < length && pool.length) {
        const pick = Math.floor(Math.random() * pool.length);
        chosen.push(pool.splice(pick, 1)[0]);
      }
      return chosen;
    }

    function renderChimpBoard(failedIndex) {
      const board = document.getElementById('chimp-board');
      if (!board) return;
      [...board.children].forEach((cell, index) => {
        cell.className = 'chimp-cell';
        cell.textContent = '';
        const order = chimpSequence.indexOf(index);
        if (chimpReveal && order >= 0) {
          cell.textContent = String(order + 1);
          cell.classList.add('visible');
        } else if (chimpSolved.includes(index)) {
          cell.textContent = String(order + 1);
          cell.classList.add('solved');
        }
        if (failedIndex === index) cell.classList.add('wrong');
      });
    }

    function startChimpRound() {
      chimpSequence = randomChimpSequence(chimpLevel);
      chimpInputIndex = 0;
      chimpSolved = [];
      chimpReveal = true;
      renderChimpBoard();
      chimpStatus('Level ' + chimpLevel, 'Memorize ' + chimpLevel + ' positions');
      clearTimeout(chimpTimer);
      chimpTimer = setTimeout(() => {
        chimpReveal = false;
        renderChimpBoard();
        chimpStatus('Level ' + chimpLevel, 'Tap the hidden numbers in order');
      }, CHIMP_MEMORIZE_MS + Math.min(900, (chimpLevel - CHIMP_START_LEVEL) * 120));
    }

    function startChimpGame() {
      if (!hasPremiumAccess()) {
        openPremiumModal('chimp');
        return;
      }
      localStorage.setItem('chimpPlays', String(getChimpLocalPlays() + 1));
      recordGamePlay('chimp');
      chimpRunning = true;
      chimpLevel = CHIMP_START_LEVEL;
      chimpLives = 1;
      startChimpRound();
    }

    function finishChimpGame(failedIndex) {
      chimpRunning = false;
      clearTimeout(chimpTimer);
      const cleared = Math.max(CHIMP_START_LEVEL - 1, chimpLevel - 1);
      setChimpBestLevel(cleared);
      renderChimpBoard(failedIndex);
      chimpStatus('Out at level ' + chimpLevel, 'Best cleared: ' + cleared + ' · Tap Start run to go again');
    }

    function chimpTapCell(index) {
      if (!chimpRunning || chimpReveal) return;
      const expected = chimpSequence[chimpInputIndex];
      if (index !== expected) {
        chimpLives--;
        updateChimpHud();
        finishChimpGame(index);
        return;
      }
      chimpSolved.push(index);
      chimpInputIndex++;
      renderChimpBoard();
      if (chimpInputIndex < chimpSequence.length) {
        chimpStatus('Level ' + chimpLevel, 'Good. Keep going.');
        return;
      }
      setChimpBestLevel(chimpLevel);
      chimpStatus('Level clear', 'Preparing level ' + (chimpLevel + 1));
      chimpLevel++;
      clearTimeout(chimpTimer);
      chimpTimer = setTimeout(startChimpRound, 750);
    }
