    const firebaseConfig = {
      apiKey: "AIzaSyDDnBWZOwrPxCJcOPsAajx0cMmbyHTf6dY",
      authDomain: "apple-watch-game.firebaseapp.com",
      projectId: "apple-watch-game",
      storageBucket: "apple-watch-game.firebasestorage.app",
      messagingSenderId: "448909758594",
      appId: "1:448909758594:web:446d2ad94110ed04c1a49b"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db   = firebase.firestore();

    // ── Tab navigation ────────────────────────────────────────
    function switchPage(name) {
      if (name === 'selector') stopGame();
      if (name === 'lb' && gameConfig().hasScores === false) name = 'game';
      document.body.classList.toggle('selector-mode', name === 'selector');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      document.getElementById('page-' + name).classList.add('active');
      document.getElementById('tab-' + name)?.classList.add('active');
      if (name === 'profile') renderProfile();
      if (name === 'friends') renderFriendsPage();
    }

    // ── Auth ──────────────────────────────────────────────────
    let currentUser = null;
    let lbFilter = 'alltime';
    let lbUnsub  = null;
    let activeGame = localStorage.getItem('activeGame') || 'reaction';
    const GUEST_ID_KEY = 'reactionGuestId';
    const GAME_CONFIG = {
      reaction: {
        title: 'Reaction Time',
        scoreCollection: 'scores',
        dailyCollection: 'daily',
        localKey: 'reactionLocalLeaderboard',
        scoreLabel: value => value + ' ms',
        rating: ratingFor
      },
      aim: {
        title: 'Aim Trainer',
        scoreCollection: 'aimScores',
        dailyCollection: 'aimDaily',
        localKey: 'aimLocalLeaderboard',
        scoreLabel: value => value + ' ms avg',
        rating: aimRatingFor
      },
      cps: {
        title: 'CPS Test',
        hasScores: false,
        scoreLabel: value => value + ' CPS',
        rating: cpsRatingFor
      },
      chess: {
        title: 'Chess',
        hasScores: false,
        scoreLabel: value => value,
        rating: () => ({ label: 'Chess', color: '#ffffff' })
      }
    };
    if (!GAME_CONFIG[activeGame]) activeGame = 'reaction';

    function gameConfig() {
      return GAME_CONFIG[activeGame] || GAME_CONFIG.reaction;
    }

    function gameConfigFor(game) {
      return GAME_CONFIG[game] || GAME_CONFIG.reaction;
    }

    function getGuestId() {
      let id = localStorage.getItem(GUEST_ID_KEY);
      if (!id) {
        id = 'guest-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(GUEST_ID_KEY, id);
      }
      return id;
    }

    function getPlayerInfo() {
      if (currentUser) {
        return {
          id: currentUser.uid,
          uid: currentUser.uid,
          name: currentUser.displayName || 'Player',
          photoURL: currentUser.photoURL || '',
          isGuest: false
        };
      }
      return {
        id: getGuestId(),
        uid: null,
        name: 'Guest',
        photoURL: '',
        isGuest: true
      };
    }

    auth.onAuthStateChanged(async user => {
      currentUser = user;
      if (user) {
        document.getElementById('sign-in-btn').style.display = 'none';
        document.getElementById('user-info').style.display   = 'flex';
        document.getElementById('user-name').textContent     = user.displayName || user.email || 'Player';
        document.getElementById('user-photo').src            = user.photoURL || '';
        document.getElementById('guest-notice').textContent  = '';
        closeModal('auth-overlay');
        await loadActiveBest();
      } else {
        document.getElementById('sign-in-btn').style.display = 'block';
        document.getElementById('user-info').style.display   = 'none';
        document.getElementById('guest-notice').textContent  = 'Guests can place on Today. Sign in for All Time.';
        allTimeBest = null;
        resetRankedState(false);
      }
      await loadRankedRatings();
      subscribeLeaderboard();
      renderRankedPanel();
    });

    function signOut() { auth.signOut(); }

    // ── Auth modal ────────────────────────────────────────────
    let authMode = 'signin';

    function openAuthModal() {
      switchTab('signin');
      document.getElementById('auth-error').textContent = '';
      ['auth-email','auth-password','auth-display-name'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
      openModal('auth-overlay');
    }

    function switchTab(mode) {
      authMode = mode;
      document.getElementById('tab-signin').classList.toggle('active', mode==='signin');
      document.getElementById('tab-signup').classList.toggle('active', mode==='signup');
      document.getElementById('auth-title').textContent       = mode==='signin' ? 'Welcome back' : 'Create account';
      document.getElementById('auth-submit-btn').textContent  = mode==='signin' ? 'Sign in' : 'Create account';
      document.getElementById('signup-name-wrap').style.display = mode==='signup' ? 'block' : 'none';
      document.getElementById('auth-password').autocomplete  = mode==='signup' ? 'new-password' : 'current-password';
      document.getElementById('auth-error').textContent      = '';
    }

    async function submitAuth() {
      const email = document.getElementById('auth-email').value.trim();
      const pass  = document.getElementById('auth-password').value;
      const errEl = document.getElementById('auth-error');
      errEl.textContent = '';
      if (!email||!pass) { errEl.textContent='Please fill in all fields.'; return; }
      try {
        if (authMode==='signin') {
          await auth.signInWithEmailAndPassword(email, pass);
        } else {
          const name = document.getElementById('auth-display-name').value.trim() || email.split('@')[0];
          const cred = await auth.createUserWithEmailAndPassword(email, pass);
          await cred.user.updateProfile({ displayName: name });
        }
      } catch(err) { errEl.textContent = friendlyAuthError(err.code); }
    }

    function signInGoogle() {
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => {
        document.getElementById('auth-error').textContent = friendlyAuthError(err.code);
      });
    }

    function friendlyAuthError(code) {
      return ({'auth/invalid-email':'Invalid email.','auth/user-not-found':'No account with that email.','auth/wrong-password':'Incorrect password.','auth/invalid-credential':'Incorrect email or password.','auth/email-already-in-use':'Email already in use.','auth/weak-password':'Password must be 6+ characters.','auth/too-many-requests':'Too many attempts. Try later.','auth/popup-closed-by-user':''})[code]||'Something went wrong.';
    }

    // ── Modal helpers ─────────────────────────────────────────
    function openModal(id)  { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    function handleOverlayClick(e,id) { if(e.target===document.getElementById(id)) closeModal(id); }

    // ── Difficulty ────────────────────────────────────────────
    const DIFFICULTY = {
      easy:   { minDelay:2000, maxDelay:4000, window:null },
      normal: { minDelay:1500, maxDelay:4500, window:null },
      hard:   { minDelay:800,  maxDelay:3000, window:1200 },
    };
    const AIM_DIFFICULTY = {
      easy:   { targets:15, size:66 },
      normal: { targets:20, size:54 },
      hard:   { targets:25, size:42 },
    };
    let difficulty = 'normal';

    function setDifficulty(d) {
      difficulty = d;
      document.querySelectorAll('.diff-btn').forEach((b,i)=>b.classList.toggle('active',['easy','normal','hard'][i]===d));
    }
    setDifficulty('normal');

    async function loadActiveBest() {
      if (!currentUser || gameConfig().hasScores === false) { allTimeBest = null; return; }
      try {
        const doc = await db.collection(gameConfig().scoreCollection).doc(currentUser.uid).get();
        allTimeBest = doc.exists ? doc.data().time : null;
      } catch (err) {
        console.error('Could not load best score:', err);
        allTimeBest = null;
      }
    }

    async function selectGame(game) {
      if (!GAME_CONFIG[game]) return;
      stopGame();
      activeGame = game;
      if (game !== 'cps') localStorage.setItem('activeGame', game);
      applyActiveGameUi();
      await loadActiveBest();
      syncLbTabs();
      subscribeLeaderboard();
      switchPage('game');
      document.getElementById('tab-selector')?.classList.add('active');
    }

    function applyActiveGameUi() {
      document.body.classList.toggle('chess-mode', activeGame === 'chess');
      document.getElementById('reaction-panel').classList.toggle('hidden', activeGame !== 'reaction');
      document.getElementById('aim-panel').classList.toggle('hidden', activeGame !== 'aim');
      document.getElementById('cps-panel').classList.toggle('hidden', activeGame !== 'cps');
      document.getElementById('chess-panel').classList.toggle('hidden', activeGame !== 'chess');
      document.getElementById('chess-bot-row').style.display = activeGame === 'chess' && !isRankedLiveGame('chess') ? 'grid' : 'none';
      document.getElementById('difficulty-row').style.display = (activeGame === 'chess' || activeGame === 'cps') ? 'none' : 'flex';
      document.getElementById('btn-row').style.display = (activeGame === 'chess' || activeGame === 'cps') ? 'none' : 'flex';
      document.getElementById('game-mode-title').textContent = gameConfig().title;
      if (gameConfig().hasScores === false) {
        clearUnsupportedLeaderboards();
      }
      if (activeGame === 'chess') {
        initChessGame();
      }
      if (activeGame === 'cps' && !isRankedLiveGame('cps')) resetCpsGame();
      renderRankedPanel();
    }

    function clearUnsupportedLeaderboards() {
      ['scores', 'scores-inline'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<li id="lb-empty" style="color:var(--text-dim);font-size:13px;padding:16px;list-style:none;">No ' + escHtml(gameConfig().title.toLowerCase()) + ' leaderboard</li>';
      });
    }

