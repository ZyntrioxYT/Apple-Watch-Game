    // ── Rating ────────────────────────────────────────────────
    const RATINGS=[
      {max:150,label:'⚡ Superhuman',color:'#ff4fc8'},
      {max:200,label:'🥷 Ninja',     color:'#00c853'},
      {max:250,label:'🎯 Sharp',     color:'#4db8ff'},
      {max:320,label:'👍 Human',     color:'#ffd700'},
      {max:420,label:'😐 Average',   color:'#aaa'},
      {max:9999,label:'🐢 Slow',     color:'#ff5555'},
    ];

    function ratingFor(ms) { return RATINGS.find(r=>ms<r.max); }

    function showRating(ms) {
      const r=ratingFor(ms);
      ratingEl.textContent=r.label; ratingEl.style.color=r.color; ratingEl.style.opacity='1';
      clearTimeout(ratingEl._t);
      ratingEl._t=setTimeout(()=>{ ratingEl.style.opacity='0'; },2000);
    }

    // ── Stats bar ─────────────────────────────────────────────
    function updateStatsBar() {
      if(!sessionTimes.length){ statsBarEl.textContent=''; return; }
      const avg=Math.round(sessionTimes.reduce((a,b)=>a+b,0)/sessionTimes.length);
      const best=Math.min(...sessionTimes);
      let html='Avg: <b>'+avg+' ms</b> &nbsp;·&nbsp; Best: <b>'+best+' ms</b>';
      if(streak>=3) html+=" &nbsp;<span class='streak-badge'>🔥 "+streak+'</span>';
      statsBarEl.innerHTML=html;
    }

    // ── Confetti ──────────────────────────────────────────────
    function launchConfetti() {
      const canvas=document.getElementById('confetti-canvas');
      canvas.width=window.innerWidth; canvas.height=window.innerHeight;
      const ctx=canvas.getContext('2d');
      const pieces=Array.from({length:70},()=>({
        x:Math.random()*canvas.width, y:Math.random()*-canvas.height*0.4,
        w:5+Math.random()*8, h:3+Math.random()*5,
        r:Math.random()*Math.PI*2, vx:(Math.random()-0.5)*3,
        vy:2+Math.random()*4, vr:(Math.random()-0.5)*0.2,
        color:['#00c853','#ffd700','#ff6b00','#4db8ff','#ff4fc8'][Math.floor(Math.random()*5)]
      }));
      let frame, tick=0;
      function draw(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        pieces.forEach(p=>{
          ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r);
          ctx.fillStyle=p.color; ctx.globalAlpha=Math.max(0,1-tick/110);
          ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
          p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; p.vy+=0.1;
        });
        tick++;
        if(tick<120) frame=requestAnimationFrame(draw);
        else ctx.clearRect(0,0,canvas.width,canvas.height);
      }
      cancelAnimationFrame(frame); tick=0; draw();
    }

    // ── Achievements ──────────────────────────────────────────
    const ACHIEVEMENTS=[
      {id:'first',   icon:'🎮',name:'First Tap',    desc:'Complete your first round',       check:s=>s.totalRounds>=1},
      {id:'sub300',  icon:'⚡',name:'Sub 300ms',    desc:'React in under 300ms',             check:s=>s.best!==null&&s.best<300},
      {id:'sub250',  icon:'🎯',name:'Sub 250ms',    desc:'React in under 250ms',             check:s=>s.best!==null&&s.best<250},
      {id:'sub200',  icon:'🥷',name:'Ninja',        desc:'React in under 200ms',             check:s=>s.best!==null&&s.best<200},
      {id:'sub150',  icon:'💫',name:'Superhuman',   desc:'React in under 150ms',             check:s=>s.best!==null&&s.best<150},
      {id:'streak5', icon:'🔥',name:'On Fire',      desc:'5-round clean streak',             check:s=>s.maxStreak>=5},
      {id:'streak10',icon:'🌋',name:'Unstoppable',  desc:'10-round clean streak',            check:s=>s.maxStreak>=10},
      {id:'rounds10',icon:'🏃',name:'Warming Up',   desc:'Play 10 rounds',                   check:s=>s.totalRounds>=10},
      {id:'rounds50',icon:'💪',name:'Dedicated',    desc:'Play 50 rounds',                   check:s=>s.totalRounds>=50},
      {id:'top3',    icon:'🏆',name:'Top 3',        desc:'Reach top 3 on the leaderboard',   check:s=>s.lbRank!==null&&s.lbRank<=3},
      {id:'first1',  icon:'🥇',name:'Champion',     desc:'Reach #1 on the leaderboard',      check:s=>s.lbRank===1},
    ];

    let achieveStats={best:null,totalRounds:0,maxStreak:0,lbRank:null};
    let unlockedAchieves=new Set(JSON.parse(localStorage.getItem('achievements')||'[]'));

    function checkAchievements() {
      achieveStats.best        = allTimeBest;
      achieveStats.totalRounds = parseInt(localStorage.getItem('totalRounds')||'0');
      achieveStats.maxStreak   = Math.max(parseInt(localStorage.getItem('maxStreak')||'0'),maxStreakSession);
      ACHIEVEMENTS.forEach(a=>{
        if(!unlockedAchieves.has(a.id)&&a.check(achieveStats)){
          unlockedAchieves.add(a.id);
          localStorage.setItem('achievements',JSON.stringify([...unlockedAchieves]));
          showAchieveToast(a);
        }
      });
    }

    function showAchieveToast(a) {
      const toast=document.getElementById('achieve-toast');
      document.getElementById('achieve-toast-icon').textContent=a.icon;
      document.getElementById('achieve-toast-text').textContent='Achievement: '+a.name;
      toast.classList.add('show');
      setTimeout(()=>toast.classList.remove('show'),3000);
    }

    // ── Firestore ─────────────────────────────────────────────
    function getLocalLeaderboard() {
      try {
        return JSON.parse(localStorage.getItem(gameConfig().localKey) || '[]');
      } catch (err) {
        console.error('Could not read local leaderboard:', err);
        return [];
      }
    }

    function saveLocalScore(time, player) {
      const entry = {
        id: player.id + '-' + Date.now(),
        uid: player.id,
        name: player.name,
        photoURL: player.photoURL || '',
        time,
        timestamp: new Date().toISOString()
      };

      const scoresByPlayer = new Map();
      getLocalLeaderboard().concat(entry).forEach(score => {
        const key = score.uid || score.id;
        const current = scoresByPlayer.get(key);
        if (!current || score.time < current.time) {
          scoresByPlayer.set(key, score);
        }
      });

      const scores = [...scoresByPlayer.values()]
        .sort((a, b) => a.time - b.time)
        .slice(0, 10);

      localStorage.setItem(gameConfig().localKey, JSON.stringify(scores));
      if (lbFilter === 'local') renderLocalLeaderboard();
    }

    function mostPlayedGameFromProfile(profile, options) {
      const counts = getProfilePlayCounts(profile, options);
      const reaction = counts.reaction || 0;
      const aim = counts.aim || 0;
      const chess = counts.chess || 0;
      const cps = counts.cps || 0;
      if (!reaction && !aim && !chess && !cps) return '—';
      const entries = [
        ['Reaction Time', reaction],
        ['Aim Trainer', aim],
        ['Chess', chess],
        ['CPS Test', cps]
      ];
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    }

    function getProfilePlayCounts(profile, options) {
      const counts = Object.assign({ reaction: 0, aim: 0, chess: 0, cps: 0 }, profile?.gamePlays || {});
      if (options?.includeLocalCps) {
        counts.cps = Math.max(counts.cps || 0, getWatchCpsPlays());
      }
      return counts;
    }

    function totalProfilePlays(profile, options) {
      const counts = getProfilePlayCounts(profile, options);
      return Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }

    function formatCpsBest() {
      const raw = parseFloat(localStorage.getItem('watchCpsBest') || '0');
      if (!raw) return '—';
      return (Math.round(raw * 10) / 10).toFixed(raw % 1 === 0 ? 0 : 1) + ' CPS';
    }

    function getWatchCpsPlays() {
      return parseInt(localStorage.getItem('watchCpsPlays') || '0', 10) || 0;
    }

    function profileGameRows(profile, statsByGame, options) {
      const counts = getProfilePlayCounts(profile, options);
      const rows = [
        {
          label: 'Reaction Time',
          value: statsByGame.reaction.best !== null ? gameConfigFor('reaction').scoreLabel(statsByGame.reaction.best) : 'No score',
          meta: counts.reaction ? counts.reaction + ' plays' : 'No plays'
        },
        {
          label: 'Aim Trainer',
          value: statsByGame.aim.best !== null ? gameConfigFor('aim').scoreLabel(statsByGame.aim.best) : 'No score',
          meta: counts.aim ? counts.aim + ' plays' : 'No plays'
        },
        {
          label: 'Chess',
          value: counts.chess ? counts.chess + ' plays' : 'No plays',
          meta: 'No leaderboard'
        },
        {
          label: 'Watch CPS',
          value: statsByGame.cps.best,
          meta: counts.cps ? counts.cps + ' plays' : 'Watch only'
        }
      ];
      return rows.map(row => (
        '<div class="player-detail-row">'+
          '<span>'+escHtml(row.label)+'</span>'+
          '<span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">'+
            '<span>'+escHtml(row.value)+'</span>'+
            '<span style="color:var(--text-dim);font-size:11px;font-weight:500;">'+escHtml(row.meta)+'</span>'+
          '</span>'+
        '</div>'
      )).join('');
    }

    async function recordGamePlay(game) {
      const player = getPlayerInfo();
      if (player.isGuest) return;
      const ref = db.collection('profiles').doc(player.id);
      const snap = await ref.get().catch(() => null);
      const current = snap?.exists ? snap.data() : {};
      const gamePlays = Object.assign({ reaction: 0, aim: 0, chess: 0, cps: 0 }, current.gamePlays || {});
      gamePlays[game] = (gamePlays[game] || 0) + 1;
      await ref.set({
        uid: player.uid,
        name: player.name,
        photoURL: player.photoURL || '',
        gamePlays,
        mostPlayedGame: mostPlayedGameFromProfile({ gamePlays }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.error('Profile play count failed:', err));
    }

    async function savePlayerProfile(player) {
      if (player.isGuest) return null;
      const ref = db.collection('profiles').doc(player.id);
      const snap = await ref.get().catch(() => null);
      const current = snap?.exists ? snap.data() : {};
      const gamePlays = Object.assign({ reaction: 0, aim: 0, chess: 0, cps: 0 }, current.gamePlays || {});
      gamePlays[activeGame] = (gamePlays[activeGame] || 0) + 1;
      const profile = {
        uid: player.uid,
        name: player.name,
        photoURL: player.photoURL || '',
        gamePlays,
        mostPlayedGame: mostPlayedGameFromProfile({ gamePlays }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(profile, { merge: true }).catch(err => console.error('Profile save failed:', err));
      return profile;
    }

    async function getPlayerCardData(uid) {
      const [profileSnap, scoreSnap] = await Promise.all([
        db.collection('profiles').doc(uid).get().catch(() => null),
        gameConfig().hasScores === false
          ? Promise.resolve(null)
          : db.collection(gameConfig().scoreCollection).doc(uid).get().catch(() => null)
      ]);
      const profile = profileSnap?.exists ? profileSnap.data() : {};
      const score = scoreSnap?.exists ? scoreSnap.data() : {};
      return {
        uid,
        name: score.name || profile.name || 'Unknown',
        photoURL: score.photoURL || profile.photoURL || '',
        time: score.time || null,
        timestamp: score.timestamp || null,
        gamePlays: profile.gamePlays || {},
        mostPlayedGame: profile.mostPlayedGame || mostPlayedGameFromProfile(profile)
      };
    }

    async function saveScore(time) {
      const player = getPlayerInfo();
      saveLocalScore(time, player);
      const profile = await savePlayerProfile(player);

      if (!player.isGuest) {
        const ref = db.collection(gameConfig().scoreCollection).doc(player.id);
        const doc = await ref.get();

        if (!doc.exists || time < doc.data().time) {
          allTimeBest = time;
          await ref.set({
            uid: player.uid, name: player.name,
            photoURL: player.photoURL, time,
            mostPlayedGame: profile?.mostPlayedGame || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // Guests can compete on Today, but only signed-in users are saved to All Time.
      const today = new Date().toISOString().slice(0,10);
      const dayRef = db.collection(gameConfig().dailyCollection).doc(today).collection('scores').doc(player.id);
      const dayDoc = await dayRef.get();
      if (!dayDoc.exists || time < dayDoc.data().time) {
        await dayRef.set({
          uid: player.uid, name: player.name,
          photoURL: player.photoURL, time,
          isGuest: player.isGuest,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    // ── Leaderboard ───────────────────────────────────────────
    function setLbFilter(f) {
      lbFilter=f;
      syncLbTabs();
      subscribeLeaderboard();
    }

    function syncLbTabs() {
      ['alltime','today','local','friends'].forEach(f => {
        document.getElementById('lb-tab-'+f)?.classList.toggle('active', f===lbFilter);
        document.getElementById('lb2-tab-'+f)?.classList.toggle('active', f===lbFilter);
      });
    }

    function renderLocalLeaderboard() {
      const docs = getLocalLeaderboard().map(score => ({
        id: score.uid || score.id,
        data: () => score
      }));
      const snapshot = { empty: docs.length === 0, docs };
      renderLbSnapshot(snapshot, 'scores');
      renderLbSnapshot(snapshot, 'scores-inline');
    }

    function renderLbSnapshot(snapshot, listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      list.innerHTML='';
      if(snapshot.empty){ list.innerHTML='<li id="lb-empty" style="color:var(--text-dim);font-size:13px;padding:16px;list-style:none;">No scores yet</li>'; return; }
      const docs = snapshot.docs ? snapshot.docs : [];
      docs.forEach((doc,i)=>{
        const s=doc.data(), uid=doc.id, isMe=uid===getPlayerInfo().id;
        if(isMe&&listId==='scores'){ achieveStats.lbRank=i+1; checkAchievements(); }
        const li=document.createElement('li');
        li.dataset.uid = uid;
        if(i===0) li.classList.add('best');
        if(isMe)  li.classList.add('is-me');
        const avatar=s.photoURL?'<img src="'+s.photoURL+'" alt="" referrerpolicy="no-referrer">'  :'<div class="avatar-placeholder"></div>';
        const youTag=isMe?'<span class="you-tag">YOU</span>':'';
        const onlineDot=onlineUsers.has(uid)?'<span class="online-dot"></span>':'';
        li.innerHTML=
          '<span class="rank">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1))+'</span>'+
          avatar+
          '<span class="lname">'+escHtml(s.name)+youTag+onlineDot+'</span>'+
          '<span class="ltime">'+gameConfig().scoreLabel(s.time)+'</span>'+
          '<span class="lb-chevron">›</span>';
        li.addEventListener('click',()=>openPlayerModal(s, i+1, uid));
        list.appendChild(li);
      });
    }

    function subscribeLeaderboard() {
      if(lbUnsub) lbUnsub();
      if (gameConfig().hasScores === false) {
        clearUnsupportedLeaderboards();
        return;
      }

      if (lbFilter === 'friends') {
        subscribeFriendsLeaderboard(['scores', 'scores-inline']);
        return;
      }

      if (lbFilter === 'local') {
        renderLocalLeaderboard();
        return;
      }

      const query = lbFilter==='alltime'
        ? db.collection(gameConfig().scoreCollection).orderBy('time').limit(10)
        : db.collection(gameConfig().dailyCollection).doc(new Date().toISOString().slice(0,10)).collection('scores').orderBy('time').limit(10);

      lbUnsub=query.onSnapshot(snapshot=>{
        renderLbSnapshot(snapshot, 'scores');
        renderLbSnapshot(snapshot, 'scores-inline');
      }, err=>console.error('Leaderboard error:',err));
    }

    subscribeLeaderboard();

    // ── Player profile modal ──────────────────────────────────
    function formatScoreTimestamp(ts) {
      if (!ts) return 'Unknown';
      const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      if (Number.isNaN(date.getTime())) return 'Unknown';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function leaderboardLabel() {
      if (lbFilter === 'alltime') return 'All Time';
      if (lbFilter === 'today') return 'Today';
      if (lbFilter === 'local') return 'Local';
      if (lbFilter === 'friends') return 'Friends';
      return 'Leaderboard';
    }

    function scoreGapLabel(score, uid) {
      const myId = getPlayerInfo().id;
      const localBest = getLocalLeaderboard().find(row => (row.uid || row.id) === myId)?.time || null;
      const myBest = allTimeBest !== null ? allTimeBest : localBest;
      if (!score || !myBest) return '—';
      if (uid === myId) return 'You';
      const diff = score - myBest;
      if (diff === 0) return 'Tied';
      return Math.abs(diff) + ' ms ' + (diff < 0 ? 'faster' : 'slower');
    }

    function localRankFor(uid) {
      const rank = getLocalLeaderboard().findIndex(row => (row.uid || row.id) === uid);
      return rank >= 0 ? '#' + (rank + 1) : 'Not ranked';
    }

    function challengeStatusLabel(uid) {
      if (gameConfig().hasScores === false) return 'Unavailable';
      if (!currentUser || !uid || uid === currentUser.uid) return 'Unavailable';
      if (!myFriends.has(uid)) return 'Friends only';
      return onlineUsers.has(uid) ? 'Ready' : 'Offline';
    }

    function friendStatusLabel(uid) {
      if (!currentUser || !uid || uid === currentUser.uid) return 'You';
      if (myFriends.has(uid)) return 'Friend';
      if (pendingOut.has(uid)) return 'Request sent';
      if (pendingIn.has(uid)) return 'Wants to add you';
      return 'Not friends';
    }

    function openPlayerModal(s, rank, uid) {
      pmCurrentUid = uid || null;
      const photo = document.getElementById('pm-photo');
      if (s.photoURL) { photo.src=s.photoURL; photo.style.display='block'; }
      else { photo.style.display='none'; }
      document.getElementById('pm-name').textContent  = escHtml(s.name);
      document.getElementById('pm-rank').textContent  = typeof rank === 'number' ? rankLabel(rank) + ' on leaderboard' : rank;
      document.getElementById('pm-best').textContent  = s.time ? gameConfig().scoreLabel(s.time) : 'No score';
      const r = s.time ? gameConfig().rating(s.time) : null;
      document.getElementById('pm-rating').textContent = r ? r.label : '—';
      document.getElementById('pm-rank-stat').textContent = typeof rank === 'number' ? '#' + rank : '—';
      document.getElementById('pm-gap').textContent = scoreGapLabel(s.time, uid);
      document.getElementById('pm-source').textContent = leaderboardLabel();
      document.getElementById('pm-status').textContent = onlineUsers.has(uid) ? 'Online now' : 'Offline';
      document.getElementById('pm-friend-status').textContent = friendStatusLabel(uid);
      document.getElementById('pm-challenge-status').textContent = challengeStatusLabel(uid);
      document.getElementById('pm-most-played').textContent = s.mostPlayedGame || mostPlayedGameFromProfile(s);
      document.getElementById('pm-last-best').textContent = formatScoreTimestamp(s.timestamp);
      document.getElementById('pm-player-id').textContent = uid ? uid.slice(0, 8) : '—';

      if (uid) {
        db.collection('profiles').doc(uid).get().then(profileDoc => {
          if (!profileDoc.exists || pmCurrentUid !== uid) return;
          const profile = profileDoc.data();
          document.getElementById('pm-most-played').textContent = profile.mostPlayedGame || mostPlayedGameFromProfile(profile);
        }).catch(() => {});
      }

      const localRank = localRankFor(uid);
      document.getElementById('pm-local-rank').textContent = localRank;
      document.getElementById('pm-local-rank-row').classList.toggle('show', localRank !== 'Not ranked');

      const isMe = uid === getPlayerInfo().id;
      document.getElementById('pm-rounds').textContent = localStorage.getItem('totalRounds') || '0';
      document.getElementById('pm-streak').textContent = localStorage.getItem('maxStreak') || '0';
      document.getElementById('pm-rounds-row').classList.toggle('show', isMe);
      document.getElementById('pm-streak-row').classList.toggle('show', isMe);

      // challenge button — only if online friend
      const cbtn = document.getElementById('pm-challenge-btn');
      if (currentUser && uid && uid !== currentUser.uid && myFriends.has(uid) && gameConfig().hasScores !== false) {
        const online = onlineUsers.has(uid);
        cbtn.style.display = 'block';
        cbtn.textContent = online ? '⚡ Challenge' : 'Offline';
        cbtn.className = online ? 'friend-btn challenge' : 'friend-btn pending';
        cbtn.disabled = !online;
      } else {
        cbtn.style.display = 'none';
      }

      // friend button
      const btn = document.getElementById('pm-friend-btn');
      if (currentUser && uid && uid !== currentUser.uid) {
        btn.style.display = 'block';
        if (myFriends.has(uid))      { btn.textContent='Remove friend'; btn.className='friend-btn remove'; }
        else if (pendingOut.has(uid)){ btn.textContent='Request sent';  btn.className='friend-btn pending'; }
        else if (pendingIn.has(uid)) { btn.textContent='Accept request';btn.className='friend-btn accept'; }
        else                         { btn.textContent='Add friend';    btn.className='friend-btn add'; }
      } else {
        btn.style.display = 'none';
      }

      openModal('player-overlay');
    }

    function rankLabel(r) {
      if (typeof r !== 'number') return r || 'Player';
      return r===1?'🥇 #1':r===2?'🥈 #2':r===3?'🥉 #3':('#'+r);
    }

    // ── Profile page ──────────────────────────────────────────
    async function renderProfile() {
      const el = document.getElementById('profile-content');
      if (!currentUser) {
        el.innerHTML = '<div style="padding:30px 0;color:var(--text-dim);font-size:15px;">Sign in to see your profile</div>' +
          '<button class="auth-submit" onclick="openAuthModal()" style="margin-top:8px;">Sign in</button>';
        return;
      }

      const avatarHtml = currentUser.photoURL
        ? '<img class="profile-avatar" src="'+currentUser.photoURL+'" alt="" referrerpolicy="no-referrer">'
        : '<div class="profile-avatar-placeholder">👤</div>';

      const profileSnap = await db.collection('profiles').doc(currentUser.uid).get().catch(() => null);
      const profileData = profileSnap?.exists ? profileSnap.data() : {};
      const counts = getProfilePlayCounts(profileData, { includeLocalCps: true });
      const statsByGame = {
        reaction: { best: null },
        aim: { best: null },
        cps: { best: formatCpsBest() }
      };
      const [reactionSnap, aimSnap] = await Promise.all([
        db.collection('scores').doc(currentUser.uid).get().catch(() => null),
        db.collection('aimScores').doc(currentUser.uid).get().catch(() => null)
      ]);
      statsByGame.reaction.best = reactionSnap?.exists ? reactionSnap.data().time : null;
      statsByGame.aim.best = aimSnap?.exists ? aimSnap.data().time : null;

      const totalPlays = totalProfilePlays(profileData, { includeLocalCps: true });
      const mostPlayed = profileData.mostPlayedGame || mostPlayedGameFromProfile(profileData, { includeLocalCps: true });
      const reactionBest = statsByGame.reaction.best !== null ? gameConfigFor('reaction').scoreLabel(statsByGame.reaction.best) : '—';
      const aimBest = statsByGame.aim.best !== null ? gameConfigFor('aim').scoreLabel(statsByGame.aim.best) : '—';
      const chessPlays = counts.chess || 0;

      // achievements
      checkAchievements();
      const achieveHtml = ACHIEVEMENTS.map(a=>{
        const unlocked = unlockedAchieves.has(a.id);
        return '<div class="achieve-item '+(unlocked?'unlocked':'achieve-locked')+'">'+
          '<div class="achieve-icon">'+a.icon+'</div>'+
          '<div class="achieve-info"><div class="achieve-name">'+a.name+'</div>'+
          '<div class="achieve-desc">'+a.desc+'</div></div></div>';
      }).join('');

      el.innerHTML =
        '<div class="profile-avatar-wrap">'+avatarHtml+'</div>'+
        '<div class="profile-name" id="profile-name-display">'+escHtml(currentUser.displayName||currentUser.email||'Player')+'</div>'+
        '<div style="margin-bottom:4px;"><button onclick="toggleNameEdit()" style="background:none;border:none;color:var(--text-dim);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;padding:2px 6px;border-radius:6px;border:1px solid var(--border);">✏️ Edit name</button></div>'+
        '<div id="name-edit-row" style="display:none;margin-bottom:14px;gap:8px;flex-direction:column;align-items:center;">'+
          '<input id="name-edit-input" style="background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:12px;color:white;font-size:16px;padding:10px 14px;outline:none;font-family:inherit;width:100%;max-width:260px;text-align:center;" maxlength="20" placeholder="New display name">'+
          '<div style="display:flex;gap:8px;">'+
            '<button onclick="saveDisplayName()" style="background:linear-gradient(135deg,var(--green),#00a844);color:white;border:none;border-radius:11px;font-size:13px;font-weight:700;padding:8px 18px;cursor:pointer;font-family:inherit;">Save</button>'+
            '<button onclick="toggleNameEdit()" style="background:var(--card);color:var(--text-dim);border:1px solid var(--border);border-radius:11px;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer;font-family:inherit;">Cancel</button>'+
          '</div>'+
          '<div id="name-edit-error" style="font-size:12px;color:#ff5555;min-height:16px;"></div>'+
        '</div>'+
        '<div class="profile-sub">'+escHtml(currentUser.email||'')+'</div>'+
        '<div class="stats-grid">'+
          '<div class="stat-card highlight"><div class="stat-val">'+escHtml(mostPlayed)+'</div><div class="stat-lbl">Most played</div></div>'+
          '<div class="stat-card"><div class="stat-val">'+totalPlays+'</div><div class="stat-lbl">Total plays</div></div>'+
          '<div class="stat-card"><div class="stat-val">'+escHtml(reactionBest)+'</div><div class="stat-lbl">Reaction best</div></div>'+
          '<div class="stat-card"><div class="stat-val">'+escHtml(aimBest)+'</div><div class="stat-lbl">Aim best</div></div>'+
        '</div>'+
        '<div class="profile-section-title">Game overview</div>'+
        '<div class="player-detail-list">'+profileGameRows(profileData, statsByGame, { includeLocalCps: true })+'</div>'+
        '<div class="profile-section-title">Friends</div>'+
        '<div class="friends-search-row">'+
          '<input class="friends-search-input" id="friend-search-input" placeholder="Search by display name..." maxlength="30" oninput="onFriendSearch(this.value)">'+
        '</div>'+
        '<div id="friend-search-results"></div>'+
        '<div class="profile-section-title" style="margin-top:8px;">Friends <span id="friends-count" style="color:var(--text-dim);font-weight:500;"></span></div>'+
        '<div id="friends-list"></div>'+
        (pendingIn.size > 0 ?
          '<div class="profile-section-title" style="margin-top:8px;">Pending requests <span style="background:#ff3d00;color:white;font-size:10px;font-weight:700;border-radius:8px;padding:1px 6px;margin-left:4px;">'+pendingIn.size+'</span></div>'+
          '<div id="pending-list"></div>' : '')+
        '<div class="profile-section-title" style="margin-top:16px;">Achievements</div>'+
        '<div class="achieve-grid">'+achieveHtml+'</div>'+
        '<div class="sign-out-row"><button class="modal-close" onclick="signOut()">Sign out</button></div>';
      setTimeout(renderFriendsList, 50);
    }

    function toggleNameEdit() {
      const row = document.getElementById('name-edit-row');
      if (!row) return;
      const showing = row.style.display !== 'none';
      row.style.display = showing ? 'none' : 'flex';
      if (!showing) {
        const input = document.getElementById('name-edit-input');
        input.value = currentUser.displayName || '';
        input.focus();
        document.getElementById('name-edit-error').textContent = '';
      }
    }

    async function saveDisplayName() {
      const input = document.getElementById('name-edit-input');
      const errEl = document.getElementById('name-edit-error');
      const name = input.value.trim();
      if (!name) { errEl.textContent = 'Name cannot be empty.'; return; }
      if (name.length < 2) { errEl.textContent = 'Name must be at least 2 characters.'; return; }
      try {
        await currentUser.updateProfile({ displayName: name });
        // update Firestore score doc with new name
        if (allTimeBest !== null) {
          await db.collection(gameConfig().scoreCollection).doc(currentUser.uid).update({ name });
        }
        await db.collection('profiles').doc(currentUser.uid).set({
          name,
          photoURL: currentUser.photoURL || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await db.collection('presence').doc(currentUser.uid).update({ name });
        document.getElementById('profile-name-display').textContent = name;
        document.getElementById('user-name').textContent = name;
        document.getElementById('name-edit-row').style.display = 'none';
        showAchieveToast({ icon: '✅', name: 'Name updated!' });
      } catch(e) {
        errEl.textContent = 'Failed to update name. Try again.';
      }
    }

    function drawChart(times) {
      const canvas=document.getElementById('mini-chart');
      if(!canvas) return;
      const ctx=canvas.getContext('2d');
      canvas.width=(canvas.offsetWidth||340)*window.devicePixelRatio;
      canvas.height=65*window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio,window.devicePixelRatio);
      const W=canvas.offsetWidth||340, H=65, pad=6;
      ctx.clearRect(0,0,W,H);
      const min=Math.min(...times), max=Math.max(...times), range=max-min||1;
      const pts=times.map((t,i)=>({x:pad+(i/Math.max(times.length-1,1))*(W-pad*2),y:H-pad-((t-min)/range)*(H-pad*2)}));
      ctx.beginPath(); ctx.strokeStyle='#00c853'; ctx.lineWidth=2; ctx.lineJoin='round';
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y)); ctx.stroke();
      ctx.beginPath(); pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.lineTo(pts[pts.length-1].x,H); ctx.lineTo(pts[0].x,H); ctx.closePath();
      ctx.fillStyle='rgba(0,200,80,0.07)'; ctx.fill();
      pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fillStyle='#00c853'; ctx.fill(); });
    }

    // ── Challenge ─────────────────────────────────────────────
    function openChallengeModal() {
      const best=allTimeBest||(sessionTimes.length?Math.min(...sessionTimes):null);
      const name=currentUser?(currentUser.displayName||'Someone'):'Someone';
      const url=window.location.href.split('?')[0]+'?challenge='+encodeURIComponent(name)+(best?'&score='+best:'');
      document.getElementById('challenge-link-box').textContent=url;
      document.getElementById('copy-btn').textContent='Copy link';
      openModal('challenge-overlay');
    }

    function copyChallenge() {
      navigator.clipboard.writeText(document.getElementById('challenge-link-box').textContent)
        .then(()=>{ document.getElementById('copy-btn').textContent='Copied!'; })
        .catch(()=>{ document.getElementById('copy-btn').textContent='Copy failed'; });
    }

    (function(){
      const p=new URLSearchParams(window.location.search);
      const c=p.get('challenge'), s=p.get('score');
      if(c){ const n=document.getElementById('guest-notice'); n.textContent='⚡ '+escHtml(c)+(s?' challenged you to beat '+s+' ms!':' challenged you!'); n.style.color=ARC_CIRC?'#ffd700':'#ffd700'; }
    })();

    // ── Multiplayer ───────────────────────────────────────────
    const MP_ROUNDS=5;
    let mpRound=0, mpCurrentPlayer=1, mpScores=[[],[]], mpWaiting=false, mpReady=false;
    let mpTimeout, mpStartTime=0;

    function openMp() { mpReset(); openModal('mp-overlay'); }

    function mpReset() {
      mpRound=0; mpCurrentPlayer=1; mpScores=[[],[]]; mpWaiting=false; mpReady=false;
      clearTimeout(mpTimeout);
      document.getElementById('mp-score-1').textContent='—';
      document.getElementById('mp-score-2').textContent='—';
      document.getElementById('mp-card-1').classList.remove('winner');
      document.getElementById('mp-card-2').classList.remove('winner');
      document.getElementById('mp-text').textContent='Tap to begin';
      document.getElementById('mp-sub').textContent='';
      document.getElementById('mp-game-box').className='';
      document.getElementById('mp-round-info').textContent='Best of '+MP_ROUNDS+' rounds each · Player 1 starts';
      mpUpdateNames();
    }

    function mpUpdateNames() {
      document.getElementById('mp-name-1').textContent='Player 1'+(mpCurrentPlayer===1?' 👆':'');
      document.getElementById('mp-name-2').textContent='Player 2'+(mpCurrentPlayer===2?' 👆':'');
    }

    function mpTap() {
      const box=document.getElementById('mp-game-box');
      const txt=document.getElementById('mp-text');
      const sub=document.getElementById('mp-sub');
      if(!mpWaiting&&!mpReady) {
        if(mpRound>=MP_ROUNDS*2) return;
        mpWaiting=true; box.className='mp-wait'; txt.textContent='Wait...'; sub.textContent='';
        clearTimeout(mpTimeout);
        mpTimeout=setTimeout(()=>{ box.className='mp-go'; txt.textContent='TAP!'; sub.textContent=''; mpStartTime=Date.now(); mpReady=true; mpWaiting=false; }, Math.random()*3000+1500);
        return;
      }
      if(mpWaiting&&!mpReady) {
        clearTimeout(mpTimeout); mpWaiting=false;
        box.className='mp-result'; txt.textContent='Too early!'; sub.textContent='Tap to try again';
        haptic('early'); return;
      }
      if(mpReady) {
        const reaction=Date.now()-mpStartTime;
        mpReady=false; mpWaiting=false; haptic('tap');
        mpScores[mpCurrentPlayer-1].push(reaction);
        const arr=mpScores[mpCurrentPlayer-1];
        const avg=Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
        document.getElementById('mp-score-'+mpCurrentPlayer).textContent=avg+' ms';
        box.className='mp-result'; txt.textContent=reaction+' ms'; sub.textContent=(ratingFor(reaction)||{label:''}).label;
        mpRound++;
        if(mpRound>=MP_ROUNDS*2){ mpFinish(); return; }
        mpCurrentPlayer=mpCurrentPlayer===1?2:1; mpUpdateNames();
        document.getElementById('mp-round-info').textContent='Round '+(mpRound+1)+' of '+(MP_ROUNDS*2)+' · Player '+mpCurrentPlayer;
        setTimeout(()=>{ txt.textContent='Tap to continue'; sub.textContent=''; box.className=''; },1500);
      }
    }

    function mpFinish() {
      const a1=mpScores[0].length?Math.round(mpScores[0].reduce((a,b)=>a+b,0)/mpScores[0].length):9999;
      const a2=mpScores[1].length?Math.round(mpScores[1].reduce((a,b)=>a+b,0)/mpScores[1].length):9999;
      const w=a1<a2?1:a2<a1?2:0;
      document.getElementById('mp-game-box').className='mp-result';
      document.getElementById('mp-text').textContent=w?'Player '+w+' wins! 🎉':'Tie game!';
      document.getElementById('mp-sub').textContent=a1+' ms vs '+a2+' ms';
      document.getElementById('mp-round-info').textContent='Game over — tap Close to play again';
      if(w) document.getElementById('mp-card-'+w).classList.add('winner');
      haptic('best');
    }
