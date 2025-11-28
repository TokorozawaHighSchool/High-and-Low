class Card {
    constructor(number) {
        this.number = number;
    }

    toString() {
        return this.number.toString();
    }
}

class Game {
    constructor() {
    this.balance = 0;
        this.currentCard = null;
        this.nextCard = null;
        this.isPlaying = false;
        this.bet = 100;
    this.titleBoostUsed = false; // 一度だけ使えるブーストフラグ
    // Mini-game unlock state: unlocked when cumulativeEarned >= miniUnlockThreshold
    this.miniUnlockThreshold = 1000;
    this.minigameUnlocked = false;
    this.countdownTimer = null;
    this._gameOverTimeout = null; // guard for pending gameOver callback
    this.countdownRemaining = 0;
    this.winStreak = 0; // 連勝カウント
    // Combo system
    this.comboCount = 0; // visible combo (連勝によるカウント)
    this.comboDecayMs = 12000; // コンボが持続する時間（ms）
    this.comboLastWin = 0; // タイムスタンプ
    this.comboMultiplierStep = 0.08; // 1連勝ごとの倍率増加（例: 8%）
    this.comboMax = 8; // 最大連勝倍率ステップ
    this.comboInterval = null; // decay チェック用
    // tuning: how much the system should try to flip a player's correct guess per streak
    this.streakFlipFactor = 0.08; // 8% per win
    this.streakFlipCap = 0.5; // 最大 50% の確率で勝ちをひっくり返す
    this.streakThreshold = 5; // 連勝何回目からペナルティを開始するか
    // betting-based penalty: if bet is large relative to balance, increase flip chance
    // betPenaltyThreshold: 比率(例:0.25 = 25%) を超えた分からペナルティを開始
    this.betPenaltyThreshold = 0.25;
    // betPenaltyFactor: (betRatio - threshold) に掛ける係数（調整用）
    this.betPenaltyFactor = 0.6;
    // betPenaltyCap: 掛け金ベースのペナルティ確率上限
    this.betPenaltyCap = 0.75;
    // when player has zero or negative balance, cap the maximum allowed bet
    this.maxDebtBet = 1000; // default maximum bet allowed while in debt
    // --- Missions system ---
    this.missions = [
        { id: 'm1', title: '5連勝達成', desc: '5連勝を達成する', type: 'streak', target: 5, progress: 0, reward: 1000, completed: false },
        { id: 'm2', title: '累計収益: 10000円', desc: '累計で合計10000円稼ぐ', type: 'totalEarned', target: 10000, progress: 0, reward: 5000, completed: false },
    { id: 'm3', title: 'はじめの10回', desc: '10回プレイしてみよう', type: 'plays', target: 10, progress: 0, reward: 200, completed: false },
    // click mission: start with 100 clicks
    { id: 'click_100', title: 'クリックチャレンジ: 100回', desc: 'クリックを合計で100回行う', type: 'clicks', target: 100, progress: 0, reward: 200, completed: false }
    ];
    // Tracks cumulative earned across session (used for mission m2)
    this.cumulativeEarned = 0;
    // click mechanics
    this.clickValue = 1; // how much each click gives
    this.totalClicks = 0; // total number of clicks performed
    // auto-clicker: unlocked when totalClicks >= 1000
    this.autoClickUnlocked = false;
    this.autoClickInterval = null; // interval id for auto-clicker
    this.autoClickRate = 1000; // ms per automatic click (default 1s)
    }

    start() {
    // do not reset balance on start; keep persistent balance
    this.isPlaying = true;
    this.updateBalance();
    this.updateBetFromInput();
    this.drawNewCard();
    // ensure combo UI exists and start decay timer if needed
    try { this._ensureComboUI(); } catch (e) {}
    if (!this.comboInterval) this.comboInterval = setInterval(() => this._checkComboDecay(), 800);
    // stop start button wobble
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('idle');
    }

    drawNewCard() {
        this.currentCard = this.nextCard || new Card(this.getRandomNumber());
        this.nextCard = new Card(this.getRandomNumber());
        this.updateDisplay();
    }

    getRandomNumber() {
        return Math.floor(Math.random() * 13) + 1;
    }

    guess(isHigh) {
        if (!this.isPlaying) return;

    this.updateBetFromInput();
        // determine whether this is a "large bet" for triggering adrenaline FX
        let isLargeBet = false;
        if (this.balance > 0) {
            isLargeBet = (this.bet / this.balance) > 0.25;
        } else {
            // if balance is zero or negative, require an absolute bet threshold
            isLargeBet = this.bet >= 500;
        }
        // warn and short suspense tone only for large bets
        if (isLargeBet) {
            this.betWarning();
            try { this.playTone(520, 140, 'triangle'); } catch (e) {}
        }
        // Determine correctness but allow a streak-based penalty that can turn a correct
        // guess into an incorrect one (makes long winning streaks harder).
        // Calculate initial correctness based on the already-determined nextCard.
        let isCorrect = isHigh ?
            this.nextCard.number > this.currentCard.number :
            this.nextCard.number < this.currentCard.number;

        // If the guess would be correct, there is a chance it will be made incorrect.
        // We combine two penalty sources:
        //  - streak-based penalty (existing)
        //  - bet-size-based penalty: when bet is large relative to balance
        if (isCorrect) {
            let flipChance = 0;
            // streak-based penalty (only starts after threshold)
            if (this.winStreak >= this.streakThreshold) {
                const effectiveStreak = this.winStreak - (this.streakThreshold - 1); // 5連勝目が1段目
                flipChance += Math.min(this.streakFlipFactor * effectiveStreak, this.streakFlipCap);
            }
            // bet-size-based penalty
            let betPenaltyChance = 0;
            // Only apply bet-size penalty when player has positive balance.
            // If balance is zero or negative, do not penalize based on bet size so player can still play normally.
            if (this.balance > 0) {
                const betRatio = this.bet / this.balance; // e.g. 0.5 = half the balance
                if (betRatio > this.betPenaltyThreshold) {
                    // Gradually increase penalty from 0 at threshold to maxPenalty at betRatio=1
                    const maxPenalty = 0.38;
                    const scale = maxPenalty / (1 - this.betPenaltyThreshold);
                    betPenaltyChance = Math.min((betRatio - this.betPenaltyThreshold) * scale, maxPenalty);
                }
            }
            flipChance = Math.min(flipChance + betPenaltyChance, 0.95);

            if (Math.random() < flipChance) {
                // Force nextCard to a value that makes the guess incorrect.
                const cur = this.currentCard.number;
                if (isHigh) {
                    // player guessed HIGH; make nextCard <= current (so it's not higher)
                    const min = 1;
                    const max = cur; // inclusive, equality also counts as incorrect
                    this.nextCard.number = Math.floor(Math.random() * (max - min + 1)) + min;
                } else {
                    // player guessed LOW; make nextCard >= current (so it's not lower)
                    const min = cur;
                    const max = 13;
                    this.nextCard.number = Math.floor(Math.random() * (max - min + 1)) + min;
                }
                // recompute correctness after the forced change
                isCorrect = isHigh ?
                    this.nextCard.number > this.currentCard.number :
                    this.nextCard.number < this.currentCard.number;
            }
        }

        // Reveal the (possibly adjusted) next card to the player
        this.revealNextCard();

        setTimeout(() => {
            if (isCorrect) {
                // combo handling
                this.winStreak += 1; // increase streak on a genuine win
                this.comboCount = Math.min(this.comboMax, this.comboCount + 1);
                this.comboLastWin = Date.now();
                // visual small combo effect
                try { this._showComboPulse(); } catch (e) {}
                // compute combo multiplier
                const comboMultiplier = 1 + this.comboCount * this.comboMultiplierStep;
                const gain = Math.floor(this.bet * comboMultiplier);
                this.balance += gain;
                try { if (isLargeBet) this.onWinEffects(); } catch (e) {}
                // mission: update streak-based missions
                this.onWinStreakChange();
                // track earned
                this.onEarn(Math.floor(this.bet * (this.comboCount > 0 ? (1 + this.comboCount * this.comboMultiplierStep) : 1)));
                this.updateBalance();
                this.drawNewCard();
            } else {
                this.balance -= this.bet;
                this.winStreak = 0; // reset on loss
                // reset combo
                this.comboCount = 0;
                try { this._updateComboUI(); } catch (e) {}
                try { if (isLargeBet) this.onLoseEffects(); } catch (e) {}
                // mission: reset streak-based missions progress if needed
                this.onWinStreakChange();
                // Allow balance to become negative (no clamping to 0)
                this.updateBalance();
                this.drawNewCard();
            }
            // count this as a completed play for play-type missions
            this.onPlay();
        }, 900);
    }
    
    // Add method to earn 1 yen per click
    earnOne() {
        // award clickValue amount and count click
        this.balance += this.clickValue;
        this.totalClicks += 1;
        this.onEarn(this.clickValue);
        // update click-type missions progress
        this.missions.forEach(m => {
            if (m.completed) return;
            if (m.type === 'clicks') {
                m.progress += 1;
                if (m.progress >= m.target) this.completeMission(m.id);
            }
        });
        this.updateBalance();
        // check for auto-clicker unlock
    if (!this.autoClickUnlocked && this.totalClicks >= 1000) {
            this.autoClickUnlocked = true;
            this.showToast('自動クリックが解放されました！');
            // start auto-clicking immediately
            this.enableAutoClick();
            this.saveState();
        }
    }

    enableAutoClick(rateMs) {
        if (this.autoClickInterval) clearInterval(this.autoClickInterval);
        if (typeof rateMs === 'number' && rateMs > 0) this.autoClickRate = rateMs;
        // start interval to add clickValue to balance each tick
        this.autoClickInterval = setInterval(() => {
            this.balance += this.clickValue;
            this.cumulativeEarned += this.clickValue;
            this.updateBalance();
            this.onEarn(this.clickValue);
        }, this.autoClickRate);
    }

    disableAutoClick() {
        if (this.autoClickInterval) {
            clearInterval(this.autoClickInterval);
            this.autoClickInterval = null;
        }
    }

    // --- Missions helpers ---
    onWinStreakChange() {
        // update streak missions progress
        this.missions.forEach(m => {
            if (m.completed) return;
            if (m.type === 'streak') {
                m.progress = Math.max(m.progress, this.winStreak);
                if (m.progress >= m.target) this.completeMission(m.id);
            }
        });
        this.renderMissions();
    this.saveState();
    }

    onEarn(amount) {
    // centralize cumulative tracking here
    this.cumulativeEarned += amount;
        // update total earned missions and plays
        this.missions.forEach(m => {
            if (m.completed) return;
            if (m.type === 'totalEarned') {
                m.progress += amount;
                if (m.progress >= m.target) this.completeMission(m.id);
            }
            if (m.type === 'plays') {
                // plays counted when a guess resolves (treat earn from guess as play)
                // we'll increment plays elsewhere; keep safe here
            }
        });
        this.renderMissions();
    this.saveState();
    // check if mini-game should be unlocked
    this.checkMiniUnlock();
    }

    // Check and apply mini-game unlock when threshold reached
    checkMiniUnlock() {
        try {
            const launchBtn = document.getElementById('minigame-launch');
            if (!this.minigameUnlocked && this.cumulativeEarned >= this.miniUnlockThreshold) {
                this.minigameUnlocked = true;
                // enable launcher UI
                if (launchBtn) {
                    launchBtn.disabled = false;
                    launchBtn.textContent = 'ミニゲーム: 浮遊回避 (解放)';
                }
                // notify player with in-page toast
                this.showToast(`ミニゲーム「浮遊回避」が解放されました！\n累計獲得: ${this.cumulativeEarned}円`);
                this.saveState();
            } else {
                // keep UI locked if not unlocked yet
                if (launchBtn) {
                    launchBtn.disabled = !this.minigameUnlocked;
                    if (!this.minigameUnlocked) launchBtn.textContent = 'ミニゲーム: 浮遊回避 (ロック中)';
                }
            }
        } catch (e) {
            console.warn('checkMiniUnlock failed', e);
        }
    }

    // Simple toast helper — shows message for 3s with fade-out
    showToast(msg, ms = 3000) {
        try {
            const el = document.getElementById('toast');
            if (!el) {
                // fallback to alert
                alert(msg);
                return;
            }
            el.style.transition = 'opacity 300ms ease, transform 300ms ease';
            el.style.whiteSpace = 'pre-line';
            el.textContent = msg;
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.transform = 'translateX(-50%) translateY(0)';
            // hide after ms
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(() => {
                el.style.opacity = '0';
                el.style.transform = 'translateX(-50%) translateY(8px)';
                setTimeout(() => { el.style.display = 'none'; }, 350);
            }, ms);
        } catch (e) {
            console.warn('showToast failed', e);
        }
    }

    // --- Adrenaline / FX helpers ---
    _ensureAudio() {
        try {
            if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this._audioCtx = null;
        }
    }

    playTone(freq = 440, duration = 120, type = 'sine') {
        this._ensureAudio();
        if (!this._audioCtx) return;
        try {
            const ctx = this._audioCtx;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type;
            o.frequency.value = freq;
            g.gain.value = 0.0001;
            o.connect(g);
            g.connect(ctx.destination);
            const now = ctx.currentTime;
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
            o.start(now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000);
            o.stop(now + duration / 1000 + 0.02);
        } catch (e) {}
    }

    // small screen shake using body transform
    screenShake(intensity = 6, duration = 420) {
        const el = document.body;
        const start = Date.now();
        const iv = setInterval(() => {
            const elapsed = Date.now() - start;
            if (elapsed >= duration) {
                el.style.transform = '';
                el.style.transition = '';
                clearInterval(iv);
                return;
            }
            const x = (Math.random() * 2 - 1) * intensity;
            const y = (Math.random() * 2 - 1) * intensity;
            el.style.transform = `translate(${x}px, ${y}px)`;
        }, 16);
    }

    // full-screen flash (temporary overlay)
    _ensureOverlay() {
        if (this._adrenalineOverlay) return;
        const ov = document.createElement('div');
        ov.id = 'adrenaline-overlay';
        ov.style.position = 'fixed';
        ov.style.left = '0';
        ov.style.top = '0';
        ov.style.width = '100%';
        ov.style.height = '100%';
        ov.style.pointerEvents = 'none';
        ov.style.zIndex = '4000';
        ov.style.transition = 'opacity 250ms ease';
        ov.style.opacity = '0';
        document.body.appendChild(ov);
        this._adrenalineOverlay = ov;
    }

    flash(color = 'rgba(255,255,255,0.9)', duration = 220) {
        try {
            this._ensureOverlay();
            const ov = this._adrenalineOverlay;
            ov.style.background = color;
            ov.style.opacity = '0.9';
            setTimeout(() => { ov.style.opacity = '0'; }, duration);
        } catch (e) {}
    }

    // heartbeat effect on balance area: apply scale pulse
    startHeartbeat(ms = 800) {
        try {
            const el = document.querySelector('.balance-area');
            if (!el) return;
            el.style.transition = `transform 140ms ease-in-out`;
            el.style.transform = 'scale(1.06)';
            clearTimeout(this._hbTimeout);
            this._hbTimeout = setTimeout(() => { try { el.style.transform = ''; } catch (e) {} }, ms);
        } catch (e) {}
    }

    // visual warning when bet is large relative to balance
    betWarning() {
        try {
            const betInput = document.getElementById('bet-input');
            if (!betInput) return;
            betInput.style.transition = 'box-shadow 200ms ease, transform 120ms ease';
            betInput.style.boxShadow = '0 0 18px rgba(255,80,80,0.9)';
            betInput.style.transform = 'translateY(-2px)';
            clearTimeout(this._betWarnTimeout);
            this._betWarnTimeout = setTimeout(() => { try { betInput.style.boxShadow = ''; betInput.style.transform = ''; } catch (e) {} }, 800);
        } catch (e) {}
    }

    onWinEffects() {
        this.playTone(880, 240, 'sine');
        this.flash('rgba(255, 212, 64, 0.85)', 320);
        this.screenShake(4, 360);
        this.startHeartbeat(700);
        try {
            // emit a burst of gold coins from balance area
            const bal = document.querySelector('.balance-area') || document.getElementById('balance');
            let x = window.innerWidth / 2;
            let y = window.innerHeight / 3;
            if (bal) {
                const r = bal.getBoundingClientRect();
                x = r.left + r.width / 2;
                y = r.top + r.height / 2;
            }
            this._ensureCoinStyles();
            this.coinBurst(22, x, y);
        } catch (e) {}
    }

    onLoseEffects() {
        this.playTone(120, 420, 'sawtooth');
        this.flash('rgba(200,24,24,0.95)', 520);
        this.screenShake(12, 520);
        this._ensureCoinStyles();
        try {
            const bal = document.querySelector('.balance-area') || document.getElementById('balance');
            let x = window.innerWidth / 2;
            let y = window.innerHeight / 3;
            if (bal) {
                const r = bal.getBoundingClientRect();
                x = r.left + r.width / 2;
                y = r.top + r.height / 2;
            }
            // red shards / dark coins that scatter outwards
            this.lossBurst(26, x, y);
            this._showLossOverlay(`- ${this.bet}円`, x, y);
        } catch (e) {}
    }

    lossBurst(count = 12, originX = window.innerWidth/2, originY = window.innerHeight/3) {
        try {
            for (let i = 0; i < count; i++) {
                const el = document.createElement('div');
                el.className = 'coin-particle';
                // darker color for loss pieces
                el.style.background = 'radial-gradient(circle at 40% 30%, #ffd1b0, #ff8a80 30%, #b71c1c 70%)';
                const ox = (Math.random() * 160 - 80);
                const oy = (Math.random() * 120 - 60);
                el.style.left = `${originX + ox}px`;
                el.style.top = `${originY + oy}px`;
                const size = Math.round(10 + Math.random() * 22);
                el.style.width = `${size}px`;
                el.style.height = `${size}px`;
                const distX = (Math.random() * 680 + 120) * (Math.random() < 0.5 ? -1 : 1);
                const distY = -(Math.random() * 420 + 40);
                el.style.setProperty('--tx', `${distX}px`);
                el.style.setProperty('--ty', `${distY + (Math.random() * 560 + 200)}px`);
                const dur = (Math.random() * 900 + 900);
                const delay = Math.random() * 200;
                el.style.animation = `coin-fall ${dur}ms cubic-bezier(.25,.8,.25,1) ${delay}ms forwards`;
                document.body.appendChild(el);
                setTimeout(() => { try { el.remove(); } catch (e) {} }, dur + delay + 120);
            }
        } catch (e) {}
    }

    _showLossOverlay(text, x = null, y = null) {
        try {
            let o = document.getElementById('loss-overlay');
            if (!o) {
                o = document.createElement('div');
                o.id = 'loss-overlay';
                o.style.position = 'fixed';
                o.style.pointerEvents = 'none';
                o.style.zIndex = '4600';
                o.style.color = '#ffebee';
                o.style.fontWeight = '700';
                o.style.textShadow = '0 2px 12px rgba(0,0,0,0.7)';
                o.style.fontSize = '28px';
                document.body.appendChild(o);
            }
            o.textContent = text;
            if (x === null) x = window.innerWidth/2;
            if (y === null) y = window.innerHeight/3;
            o.style.left = `${x}px`;
            o.style.top = `${y}px`;
            o.style.transform = 'translate(-50%,-50%) scale(1.08)';
            o.style.opacity = '1';
            o.style.transition = 'transform 540ms cubic-bezier(.2,.9,.2,1), opacity 540ms ease';
            setTimeout(() => {
                o.style.transform = 'translate(-50%,-50%) scale(0.9)';
                o.style.opacity = '0';
            }, 380);
        } catch (e) {}
    }

    // coin particle effects
    _ensureCoinStyles() {
        if (this._coinStylesInjected) return;
        try {
            const style = document.createElement('style');
            style.id = 'coin-styles';
            style.textContent = `
            @keyframes coin-fall { 0% { transform: translate3d(0,0,0) rotate(0deg); opacity:1 } 100% { transform: translate3d(var(--tx), var(--ty), 0) rotate(520deg); opacity:0 } }
            .coin-particle { position:fixed; width:18px; height:18px; border-radius:50%; background: radial-gradient(circle at 40% 30%, #fff8b0, #ffd54f 40%, #d4af37 70%); box-shadow: 0 2px 6px rgba(0,0,0,0.45); pointer-events:none; z-index:4500; transform-origin:center; }
            `;
            document.head.appendChild(style);
        } catch (e) {}
        this._coinStylesInjected = true;
    }

    coinBurst(count = 16, originX = window.innerWidth/2, originY = window.innerHeight/3) {
        try {
            const frag = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const c = document.createElement('div');
                c.className = 'coin-particle';
                // random initial offset so they don't all overlap at start
                const ox = (Math.random() * 120 - 60);
                const oy = (Math.random() * 80 - 40);
                c.style.left = `${originX + ox}px`;
                c.style.top = `${originY + oy}px`;
                // random size for depth parallax
                const size = Math.round(12 + Math.random() * 18); // 12 - 30px
                c.style.width = `${size}px`;
                c.style.height = `${size}px`;
                // random trajectory: wider horizontal spread and varied vertical arc
                const distX = (Math.random() * 520 + 120) * (Math.random() < 0.5 ? -1 : 1);
                const distY = -(Math.random() * 340 + 80); // upward lift
                // final translation values (we'll use CSS variables)
                c.style.setProperty('--tx', `${distX}px`);
                c.style.setProperty('--ty', `${distY + (Math.random() * 420 + 160)}px`);
                // duration and delay — longer for further travel
                const dur = (Math.random() * 900 + 800); // 800ms - 1700ms
                const delay = Math.random() * 180;
                // random spin via transform: use the keyframes rotate value and randomize via CSS variable not supported; use varied durations
                c.style.animation = `coin-fall ${dur}ms cubic-bezier(.18,.9,.28,1) ${delay}ms forwards`;
                frag.appendChild(c);
                // cleanup
                setTimeout(() => { try { c.remove(); } catch (e) {} }, dur + delay + 80);
                document.body.appendChild(c);
            }
        } catch (e) {}
    }

    onPlay() {
        // called whenever a play occurs (guess resolved)
        this.missions.forEach(m => {
            if (m.completed) return;
            if (m.type === 'plays') {
                m.progress += 1;
                if (m.progress >= m.target) this.completeMission(m.id);
            }
        });
        this.renderMissions();
    this.saveState();
    }

    completeMission(id) {
        const m = this.missions.find(x => x.id === id);
        if (!m || m.completed) return;
        m.completed = true;
        // grant reward
        if (m.reward && typeof m.reward === 'number') {
            this.balance += m.reward;
            // include mission reward in cumulativeEarned per user's choice
            this.cumulativeEarned += m.reward;
        }
    this.updateBalance();
    this.renderMissions();
        // maybe show a small alert
        setTimeout(() => { alert(`ミッション達成: ${m.title}\n報酬: ${m.reward}円`); }, 200);

        // If this was a totalEarned mission, spawn the next progressive mission
    if (m.type === 'totalEarned') {
            // compute next target and reward
            const nextTarget = m.target * 10;
            const nextReward = Math.floor(m.target * 0.5); // reward = 50% of previous target
            const newId = `m_total_${nextTarget}`;
            // Avoid duplicating if already exists
            if (!this.missions.find(x => x.id === newId)) {
                const newMission = { id: newId, title: `累計収益: ${nextTarget}円`, desc: `累計で合計${nextTarget}円稼ぐ`, type: 'totalEarned', target: nextTarget, progress: 0, reward: nextReward, completed: false };
                // If player already exceeded the next target (due to reward or prior earnings), set progress and possibly complete
                newMission.progress = this.cumulativeEarned;
                this.missions.push(newMission);
                if (newMission.progress >= newMission.target) this.completeMission(newMission.id);
            }
        }
        // If this was a plays mission, spawn next scaled mission: target * 10, reward * 10
        if (m.type === 'plays') {
            const nextTarget = m.target * 10;
            const nextReward = m.reward * 10;
            const newId = `plays_${nextTarget}`;
            if (!this.missions.find(x => x.id === newId)) {
                const newMission = { id: newId, title: `はじめの${nextTarget}回`, desc: `${nextTarget}回プレイしてみよう`, type: 'plays', target: nextTarget, progress: 0, reward: nextReward, completed: false };
                // If player already has progress, set it
                newMission.progress = 0;
                this.missions.push(newMission);
                if (newMission.progress >= newMission.target) this.completeMission(newMission.id);
                setTimeout(() => { alert(`新しいプレイミッション追加: ${newMission.title}\n報酬: ${newMission.reward}円`); }, 300);
            }
        }
        // If this was a clicks mission, spawn next scaled mission and double clickValue
        if (m.type === 'clicks') {
            const nextTarget = m.target * 5;
            // more generous reward: reward = nextTarget * 2
            const nextReward = nextTarget * 2;
            const newId = `click_${nextTarget}`;
            if (!this.missions.find(x => x.id === newId)) {
                const newMission = { id: newId, title: `クリックチャレンジ: ${nextTarget}回`, desc: `クリックを合計で${nextTarget}回行う`, type: 'clicks', target: nextTarget, progress: this.totalClicks, reward: nextReward, completed: false };
                this.missions.push(newMission);
                if (newMission.progress >= newMission.target) this.completeMission(newMission.id);
            }
            // double the clickValue upon completion
            this.clickValue *= 2;
            // update earn button label
            try { this.updateClickButton(); } catch (e) {}
        }
        // If this was a streak mission, spawn next milestone: +5 target and reward x5
        if (m.type === 'streak') {
            const nextTarget = m.target + 5;
            const nextReward = m.reward * 5;
            const newId = `streak_${nextTarget}`;
            if (!this.missions.find(x => x.id === newId)) {
                const newMission = { id: newId, title: `${nextTarget}連勝達成`, desc: `${nextTarget}連勝を達成する`, type: 'streak', target: nextTarget, progress: this.winStreak, reward: nextReward, completed: false };
                this.missions.push(newMission);
                // If already achieved (unlikely), complete immediately
                if (newMission.progress >= newMission.target) this.completeMission(newMission.id);
                // show short alert about new streak mission
                setTimeout(() => { alert(`新しいミッション追加: ${newMission.title}\n報酬: ${newMission.reward}円`); }, 300);
            }
        }
        // save after mission completion and spawning
        this.saveState();
    }

    // --- Persistence ---
    saveState() {
        try {
            const state = {
                missions: this.missions,
                cumulativeEarned: this.cumulativeEarned,
                balance: this.balance,
                winStreak: this.winStreak
                ,autoClickUnlocked: this.autoClickUnlocked
            };
            localStorage.setItem('highlow_state', JSON.stringify(state));
        } catch (e) {
            // ignore storage errors
            console.warn('saveState failed', e);
        }
    }

    loadState() {
        try {
            const raw = localStorage.getItem('highlow_state');
            if (!raw) return;
            const state = JSON.parse(raw);
            if (state.missions && Array.isArray(state.missions)) this.missions = state.missions;
            if (typeof state.cumulativeEarned === 'number') this.cumulativeEarned = state.cumulativeEarned;
            if (typeof state.balance === 'number') this.balance = state.balance;
            if (typeof state.winStreak === 'number') this.winStreak = state.winStreak;
            if (typeof state.autoClickUnlocked === 'boolean') this.autoClickUnlocked = state.autoClickUnlocked;
            // resume auto-click if previously unlocked
            if (this.autoClickUnlocked) this.enableAutoClick();
        } catch (e) {
            console.warn('loadState failed', e);
        }
    }

    resetState() {
        // clear storage
        try { localStorage.removeItem('highlow_state'); } catch (e) {}
    // ensure any running countdown is stopped to prevent it from later triggering gameOver
    if (this.stopCountdown) this.stopCountdown();
        // cancel any pending gameOver callback to avoid repeated gameOver effects after reset
        if (this._gameOverTimeout) {
            clearTimeout(this._gameOverTimeout);
            this._gameOverTimeout = null;
        }
        // reset properties to initial defaults
        this.balance = 0;
        this.currentCard = null;
        this.nextCard = null;
        this.isPlaying = false;
        this.bet = 100;
        this.titleBoostUsed = false;
        this.countdownTimer = null;
        this.countdownRemaining = 0;
        this.winStreak = 0;
        // reset combo on full reset
        this.comboCount = 0;
        this.comboLastWin = 0;
        if (this.comboInterval) {
            clearInterval(this.comboInterval);
            this.comboInterval = null;
        }
        this.streakFlipFactor = 0.08;
        this.streakFlipCap = 0.5;
        this.streakThreshold = 5;
        this.missions = [
            { id: 'm1', title: '5連勝達成', desc: '5連勝を達成する', type: 'streak', target: 5, progress: 0, reward: 1000, completed: false },
            { id: 'm2', title: '累計収益: 10000円', desc: '累計で合計10000円稼ぐ', type: 'totalEarned', target: 10000, progress: 0, reward: 5000, completed: false },
            { id: 'm3', title: 'はじめの10回', desc: '10回プレイしてみよう', type: 'plays', target: 10, progress: 0, reward: 200, completed: false },
            { id: 'click_100', title: 'クリックチャレンジ: 100回', desc: 'クリックを合計で100回行う', type: 'clicks', target: 100, progress: 0, reward: 200, completed: false }
        ];
        this.cumulativeEarned = 0;
        this.clickValue = 1;
        this.totalClicks = 0;
        // update UI
        this.updateBalance();
        this.renderMissions();
    try { this._updateComboUI(); } catch (e) {}
    }

    // Renders mission list into UI
    renderMissions() {
        const list = document.getElementById('missions-list');
        if (!list) return;
        list.innerHTML = '';
        this.missions.forEach(m => {
            const li = document.createElement('li');
            const left = document.createElement('div');
            left.style.flex = '1';
            left.innerHTML = `<strong>${m.title}</strong><div style="font-size:0.9rem;color:#fffde7">${m.desc}</div>`;
            const right = document.createElement('div');
            right.style.marginLeft = '12px';
            if (m.completed) {
                right.innerHTML = `<span style="color:#ffd54f;font-weight:bold">達成</span>`;
            } else {
                right.innerHTML = `<span style="color:#fff">${Math.min(m.progress,m.target)}/${m.target}</span>`;
            }
            li.appendChild(left);
            li.appendChild(right);
            list.appendChild(li);
        });
    }
    updateBetFromInput() {
        const betInput = document.getElementById('bet-input');
        let betValue = parseInt(betInput.value, 10);
        if (isNaN(betValue) || betValue < 1) betValue = 1;
        if (this.balance > 0) {
            if (betValue > this.balance) betValue = this.balance;
        } else {
            // player is in debt: clamp to configured maximum to avoid runaway bets
            if (betValue > this.maxDebtBet) {
                betValue = this.maxDebtBet;
                try { this.showToast(`負債時は最大 ${this.maxDebtBet} 円までしか賭けられません`); } catch (e) {}
            }
        }
        this.bet = betValue;
        betInput.value = betValue;
    }

    updateBalance() {
        const balanceEl = document.getElementById('balance');
        balanceEl.textContent = this.balance;
        const balanceArea = document.querySelector('.balance-area');
        if (this.balance < 0) {
            balanceEl.classList.add('negative');
            if (balanceArea) balanceArea.classList.add('negative');
            // start countdown if not already running
            this.startCountdownIfNeeded();
        } else {
            balanceEl.classList.remove('negative');
            if (balanceArea) balanceArea.classList.remove('negative');
            // stop countdown if balance recovered
            this.stopCountdown();
        }
    }

    startCountdownIfNeeded() {
        if (this.countdownTimer) return; // already running
        const countdownEl = document.getElementById('countdown');
        if (!countdownEl) return;
        this.countdownRemaining = 30;
        countdownEl.textContent = `残り: ${this.countdownRemaining}s`;
        countdownEl.style.display = 'inline-block';
        countdownEl.classList.add('pulse');
        this.countdownTimer = setInterval(() => {
            this.countdownRemaining -= 1;
            countdownEl.textContent = `残り: ${this.countdownRemaining}s`;
            // show large overlay when 5 seconds or less
            const overlay = document.getElementById('countdown-overlay');
            if (overlay) {
                if (this.countdownRemaining <= 5 && this.countdownRemaining > 0) {
                    overlay.textContent = this.countdownRemaining.toString();
                    overlay.style.display = 'flex';
                    overlay.classList.add('show');
                } else {
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                }
            }
            if (this.countdownRemaining <= 0) {
                this.stopCountdown();
                // time's up -> game over
                this.gameOver();
            }
        }, 1000);
    }

    stopCountdown() {
        const countdownEl = document.getElementById('countdown');
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        if (countdownEl) {
            countdownEl.style.display = 'none';
            countdownEl.classList.remove('pulse');
        }
        this.countdownRemaining = 0;
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('show');
        }
    }

    // Sync the earn button label with current clickValue
    updateClickButton() {
        try {
            const el = document.getElementById('earn-btn');
            if (!el) return;
            // show per-click amount, e.g. "クリックで +2円"
            el.textContent = `クリックで +${this.clickValue}円`;
        } catch (e) {
            // ignore DOM errors
        }
    }

    revealNextCard() {
        const nextCardDisplay = document.getElementById('next-card-display');
        nextCardDisplay.textContent = this.nextCard.toString();
    }

    gameOver() {
        // prevent duplicate gameOver sequences
        if (this._gameOverTimeout) return;
        this.isPlaying = false;
        this.showGameOverEffect();
        this.hideNextCard();
        // stop countdown (if running) and reset balance to 0
        if (this.stopCountdown) this.stopCountdown();
        this.balance = 0;
        this.updateBalance();
        // schedule end-of-game UI after a short delay; store timeout id so reset can cancel it
        this._gameOverTimeout = setTimeout(() => {
            // clear guard first
            this._gameOverTimeout = null;
            alert(`ゲームオーバー！\n最終スコア: ${this.score}`);
            this.hideGameOverEffect();
            // re-enable start button idle wiggle
            const startBtn = document.getElementById('start-btn');
            if (startBtn) startBtn.classList.add('idle');
        }, 1200);
    }

    showGameOverEffect() {
        const effect = document.getElementById('gameover-effect');
        if (effect) effect.classList.add('active');
    }

    hideGameOverEffect() {
        const effect = document.getElementById('gameover-effect');
        if (effect) effect.classList.remove('active');
    }

    updateDisplay() {
        const currentCardDisplay = document.getElementById('current-card-display');
        const nextCardDisplay = document.getElementById('next-card-display');
        
        currentCardDisplay.textContent = this.currentCard.toString();
        nextCardDisplay.textContent = this.isPlaying ? '?' : '';
    }

    // --- Combo UI and logic helpers ---
    _ensureComboUI() {
        if (this._comboEl) return;
        // Prefer placing the combo display next to the title if available
        const titleEl = document.getElementById('title');
        if (titleEl && titleEl.parentNode) {
            const wrap = document.createElement('div');
            wrap.id = 'combo-title-container';
            wrap.style.display = 'inline-flex';
            wrap.style.flexDirection = 'column';
            wrap.style.alignItems = 'center';
            wrap.style.justifyContent = 'center';
            wrap.style.marginLeft = '10px';
            wrap.style.color = '#ffd54f';
            wrap.style.fontWeight = '700';
            wrap.style.lineHeight = '1';
            wrap.style.userSelect = 'none';
            wrap.innerHTML = `<div id="combo-count" style="font-size:1.15rem;">${this.comboCount > 0 ? this.comboCount : ''}</div><div id="combo-mul" style="font-size:0.75rem;color:#fffde7;opacity:0.9">x${(1 + this.comboCount * this.comboMultiplierStep).toFixed(2)}</div>`;
            // insert after title
            if (titleEl.nextSibling) titleEl.parentNode.insertBefore(wrap, titleEl.nextSibling);
            else titleEl.parentNode.appendChild(wrap);
            this._comboEl = wrap;
            this._comboCountEl = document.getElementById('combo-count');
            this._comboMulEl = document.getElementById('combo-mul');
        } else {
            // fallback to previous fixed container in top-right
            const container = document.createElement('div');
            container.id = 'combo-container';
            container.style.position = 'absolute';
            container.style.right = '18px';
            container.style.top = '18px';
            container.style.padding = '8px 12px';
            container.style.background = 'rgba(0,0,0,0.28)';
            container.style.color = '#ffd54f';
            container.style.fontWeight = '700';
            container.style.borderRadius = '10px';
            container.style.boxShadow = '0 6px 20px rgba(0,0,0,0.45)';
            container.style.zIndex = '3002';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.gap = '8px';
            container.innerHTML = `<div id="combo-label" style="font-size:0.92rem">コンボ</div><div id="combo-value" style="font-size:1.2rem">x1</div>`;
            document.body.appendChild(container);
            this._comboEl = container;
            this._comboValueEl = document.getElementById('combo-value');
        }
        this._updateComboUI();
    }

    _updateComboUI() {
        // if title-based UI exists
        if (this._comboCountEl && this._comboMulEl) {
            this._comboCountEl.textContent = this.comboCount > 0 ? this.comboCount.toString() : '';
            if (this.comboCount > 0) {
                const mul = (1 + this.comboCount * this.comboMultiplierStep);
                this._comboMulEl.textContent = `x${mul.toFixed(2)}`;
                this._comboMulEl.style.opacity = '0.95';
            } else {
                this._comboMulEl.textContent = `x1.00`;
                this._comboMulEl.style.opacity = '0.0';
            }
            return;
        }
        if (!this._comboValueEl) return;
        const mul = (1 + this.comboCount * this.comboMultiplierStep);
        this._comboValueEl.textContent = `x${mul.toFixed(2)}`;
    }

    _showComboPulse() {
        try {
            this._ensureComboUI();
            if (!this._comboEl) return;
            this._updateComboUI();
            this._comboEl.style.transition = 'transform 180ms ease, box-shadow 180ms ease';
            this._comboEl.style.transform = 'scale(1.08)';
            this._comboEl.style.boxShadow = '0 8px 26px rgba(255,213,79,0.18)';
            clearTimeout(this._comboPulseTimeout);
            this._comboPulseTimeout = setTimeout(() => { try { this._comboEl.style.transform = ''; this._comboEl.style.boxShadow = ''; } catch (e) {} }, 350);
        } catch (e) {}
    }

    _checkComboDecay() {
        try {
            if (this.comboCount <= 0) return;
            if (Date.now() - this.comboLastWin > this.comboDecayMs) {
                // decay one step
                this.comboCount = Math.max(0, this.comboCount - 1);
                this.comboLastWin = Date.now();
                this._updateComboUI();
            }
        } catch (e) {}
    }

    hideNextCard() {
        const nextCardDisplay = document.getElementById('next-card-display');
        nextCardDisplay.textContent = '';
    }

    // updateScore() {
    //     document.getElementById('score').textContent = this.score;
    // }
}

// ゲームの初期化
const game = new Game();

// load any saved state
game.loadState();
// reflect loaded state in UI
game.updateBalance();
game.renderMissions();
// ensure mini-game launcher reflects saved unlock state
game.checkMiniUnlock();

// sync earn button label with current clickValue on startup
try { game.updateClickButton(); } catch (e) {}

// 初期状態でスタートボタンを揺らす
const startBtnInit = document.getElementById('start-btn');
if (startBtnInit) startBtnInit.classList.add('idle');

// タイトルをクリックすると一度だけ残高を+1000してキラキラ演出
const titleEl = document.getElementById('title');
if (titleEl) {
    titleEl.style.cursor = 'pointer';
    titleEl.addEventListener('click', () => {
        if (!game.titleBoostUsed) {
            game.balance += 1000;
            game.updateBalance();
            game.titleBoostUsed = true;
            // sparkle クラスを一時的に追加
            titleEl.classList.add('sparkle');
            setTimeout(() => titleEl.classList.remove('sparkle'), 900);
        }
    });
}

// イベントリスナーの設定
document.getElementById('start-btn').addEventListener('click', () => {
    game.start();
});

document.getElementById('high-btn').addEventListener('click', () => {
    game.guess(true);
});

document.getElementById('low-btn').addEventListener('click', () => {
    game.guess(false);
});
 
// 1クリックで1円稼ぐボタン
const earnBtn = document.getElementById('earn-btn');
if (earnBtn) {
    earnBtn.addEventListener('click', () => {
        game.earnOne();
    });

// --- Mini-game: click to float and avoid obstacles ---
class MiniGame {
    constructor(containerIds, gameInstance) {
        this.canvas = document.getElementById(containerIds.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.startBtn = document.getElementById(containerIds.startButton);
        this.exitBtn = document.getElementById(containerIds.exitButton);
        this.timerEl = document.getElementById(containerIds.timer);
        this.panel = document.getElementById('minigame-panel');
        this.isRunning = false;
        this.player = { x: 80, y: this.canvas.height/2, vy: 0, radius: 12 };
    this._stopped = false; // guard to prevent double stop
    // gravity controls how quickly the player falls each frame — lowered for slower fall
    this.gravity = 0.35;
    this.jumpPower = -6; // smaller single-click impulse for finer control
    this.thrusting = false; // whether mouse/touch is holding thrust
    this.thrustAccel = -26; // continuous upward acceleration (px/s^2)
        this.obstacles = [];
    this.spawnInterval = 1500; // ms
        this.lastSpawn = 0;
        this.lastTime = 0;
        this.elapsed = 0;
        this.rewardPerSecond = 10; // yen per second
        // multiplier: increases every multiplierIncreaseInterval seconds
        this.multiplier = 1.0;
        this.multiplierIncreaseInterval = 10; // seconds
        this._multiplierLastIncrease = 0;
        this.game = gameInstance;

        // high score tracking (seconds)
        this.highScoreKey = 'minigame_highscore';
        this.highScore = parseFloat(localStorage.getItem(this.highScoreKey) || '0') || 0;
        // create or find a small highscore element in the panel controls
        this.highScoreEl = document.createElement('div');
        this.highScoreEl.style.fontSize = '0.9rem';
        this.highScoreEl.style.color = '#ffd54f';
        this.highScoreEl.style.marginLeft = '10px';
        this.highScoreEl.style.alignSelf = 'center';
        this.highScoreEl.textContent = `HS: ${this.highScore.toFixed(1)}s`;
        const controls = document.querySelector('.minigame-controls');
        if (controls) {
            controls.appendChild(this.highScoreEl);
            // multiplier display
            this.multiplierEl = document.createElement('div');
            this.multiplierEl.style.fontSize = '0.9rem';
            this.multiplierEl.style.color = '#80deea';
            this.multiplierEl.style.marginLeft = '10px';
            this.multiplierEl.style.alignSelf = 'center';
            this.multiplierEl.textContent = `倍率: x${this.multiplier.toFixed(2)}`;
            controls.appendChild(this.multiplierEl);
        }

    this.startBtn.addEventListener('click', () => this.start());
    this.exitBtn.addEventListener('click', () => this.stop(true));
    // click/tap: press and hold to apply continuous small upward thrust; quick tap gives a small bump
    // Input handling: short tap -> small instantaneous bump, long press -> continuous thrust
    this._pressStart = 0;
    this._longPressThreshold = 180; // ms

    // Use Pointer Events (pointerdown/up/cancel/leave) to handle mouse and touch consistently
    // ensure canvas doesn't allow browser touch gestures to steal pointer events (Chrome)
    try { this.canvas.style.touchAction = 'none'; } catch (e) {}
    this.canvas.addEventListener('pointerdown', (e) => {
        // only handle primary button/pointer
        if (e.isPrimary === false) return;
        // capture the pointer so we continue receiving events even if pointer moves outside
        try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
        this._pressStart = performance.now();
        this._pointerStartTimeout = setTimeout(() => { if (this._pressStart) this.startThrust(); }, this._longPressThreshold);
    });
    this.canvas.addEventListener('pointerup', (e) => {
        if (e.isPrimary === false) return;
        clearTimeout(this._pointerStartTimeout);
        const dur = performance.now() - (this._pressStart || 0);
        if (dur < this._longPressThreshold) {
            this.jump();
        } else {
            this.stopThrust();
        }
        this._pressStart = 0;
    });
    // pointercancel and pointerleave should cancel any pending long-press and stop thrust
    this.canvas.addEventListener('pointercancel', (e) => {
        if (e.isPrimary === false) return;
        clearTimeout(this._pointerStartTimeout);
        if (this.thrusting) this.stopThrust();
        this._pressStart = 0;
    });
    this.canvas.addEventListener('pointerleave', (e) => {
        if (e.isPrimary === false) return;
        clearTimeout(this._pointerStartTimeout);
        if (this.thrusting) this.stopThrust();
        this._pressStart = 0;
    });

    // Fallback: also attach touch listeners as non-passive to ensure Chrome on some devices
    // delivers touch events and prevents default gestures from stealing the input.
    try {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this._pressStart = performance.now();
            this._touchStartTimeout = setTimeout(() => { if (this._pressStart) this.startThrust(); }, this._longPressThreshold);
        }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => {
            clearTimeout(this._touchStartTimeout);
            const dur = performance.now() - (this._pressStart || 0);
            if (dur < this._longPressThreshold) this.jump(); else this.stopThrust();
            this._pressStart = 0;
        }, { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => {
            clearTimeout(this._touchStartTimeout);
            if (this.thrusting) this.stopThrust();
            this._pressStart = 0;
        }, { passive: false });
    } catch (e) {
        // ignore if adding options not supported
    }

    // compute gap based on elapsed time: start widening baseline 130, after 30s begin shrinking
    this.computeGap = function() {
        const baseGap = 130; // starting gap
        const minGap = 90; // smallest allowed gap
        const shrinkStart = 30; // seconds
        const shrinkDuration = 30; // seconds over which gap shrinks to minGap
        if (this.elapsed <= shrinkStart) return baseGap;
        const t = Math.min((this.elapsed - shrinkStart) / shrinkDuration, 1);
        // linear interpolation from baseGap to minGap as t goes 0->1
        return Math.round(baseGap - t * (baseGap - minGap));
    }
    }

    start() {
        this.panel.style.display = 'flex';
    this.isRunning = true;
    this._stopped = false;
        this.obstacles = [];
        this.player.y = this.canvas.height/2;
        this.player.vy = 0;
        this.elapsed = 0;
        this.lastTime = performance.now();
    this._multiplierLastIncrease = this.lastTime;
    this.multiplier = 1.0;
    if (this.multiplierEl) this.multiplierEl.textContent = `倍率: x${this.multiplier.toFixed(2)}`;
        this.lastSpawn = this.lastTime + 600;
        requestAnimationFrame((t)=>this.loop(t));
    }

    stop(force=false) {
        if (this._stopped) return;
        this._stopped = true;
        this.isRunning = false;
        // reward based on elapsed seconds — use 0.1s precision to avoid 0 reward on quick exits
        const secsRounded = Math.max(0, Math.round(this.elapsed * 10) / 10);
    // apply multiplier to reward
    const baseReward = Math.max(0, Math.floor(secsRounded * this.rewardPerSecond));
    const reward = Math.max(0, Math.floor(baseReward * this.multiplier));
        this.game.balance += reward;
        this.game.cumulativeEarned += reward;
        this.game.updateBalance();
        alert(`ミニゲーム終了: 生存 ${this.elapsed.toFixed(1)}s\n報酬: ${reward}円`);
        this.panel.style.display = 'none';
    this.timerEl.textContent = '0.0';
    // update high score if beat (reuse secsRounded computed above)
    if (secsRounded > this.highScore) {
            this.highScore = secsRounded;
            try { localStorage.setItem(this.highScoreKey, this.highScore.toString()); } catch (e) {}
            if (this.highScoreEl) this.highScoreEl.textContent = `HS: ${this.highScore.toFixed(1)}s`;
        }
    }

    jump() {
        // single quick tap: small instant bump
        if (!this.isRunning) return;
    // small responsive bump for short taps (slightly stronger)
    this.player.vy = Math.min(this.player.vy, this.jumpPower * 1.05);
    }

    startThrust() {
        if (!this.isRunning) return;
    // begin continuous thrust for long press; do not override short-tap bump
    this.thrusting = true;
    }

    stopThrust() {
        this.thrusting = false;
    }

    spawnObstacle() {
        const h = 28 + Math.random() * 80;
    const gap = this.computeGap(); // dynamic gap depending on elapsed time
        const topH = Math.random() * (this.canvas.height - gap - 40);
        // obstacle represented as top rect and bottom rect (like Flappy Bird)
        this.obstacles.push({ x: this.canvas.width + 20, w: 28, topH: topH, gap: gap, speed: 160 });
    }

    loop(timestamp) {
        if (!this.isRunning) return;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        this.elapsed += dt;
        // physics
        // apply continuous thrust if pressing (gives fine-grained control)
        if (this.thrusting) {
            this.player.vy += this.thrustAccel * dt;
        }
        this.player.vy += this.gravity;
        this.player.y += this.player.vy;
        // multiplier: increase every multiplierIncreaseInterval seconds
        if (this.multiplierIncreaseInterval > 0) {
            // convert last increase timestamp to seconds-based comparison
            const sinceLast = (timestamp - this._multiplierLastIncrease) / 1000;
            if (sinceLast >= this.multiplierIncreaseInterval) {
                // increase multiplier by a step (e.g., +0.25x per interval)
                const steps = Math.floor(sinceLast / this.multiplierIncreaseInterval);
                this.multiplier += 0.25 * steps;
                this._multiplierLastIncrease = this._multiplierLastIncrease + steps * this.multiplierIncreaseInterval * 1000;
                if (this.multiplierEl) this.multiplierEl.textContent = `倍率: x${this.multiplier.toFixed(2)}`;
            }
        }
        // spawn
        if (timestamp - this.lastSpawn > this.spawnInterval) {
            this.spawnObstacle();
            this.lastSpawn = timestamp;
        }
        // move obstacles
        for (let obs of this.obstacles) {
            obs.x -= obs.speed * dt;
        }
        // remove off-screen
        this.obstacles = this.obstacles.filter(o => o.x + o.w > -10);
        // collision
        for (let o of this.obstacles) {
            // top rect
            if (this.player.x + this.player.radius > o.x && this.player.x - this.player.radius < o.x + o.w) {
                if (this.player.y - this.player.radius < o.topH || this.player.y + this.player.radius > o.topH + o.gap) {
                    // hit
                    this.isRunning = false;
                    // still update elapsed before stop
                    this.timerEl.textContent = this.elapsed.toFixed(1);
                    setTimeout(()=> this.stop(false), 50);
                    return;
                }
            }
        }
        // bounds
        if (this.player.y - this.player.radius < 0) { this.player.y = this.player.radius; this.player.vy = 0; }
        if (this.player.y + this.player.radius > this.canvas.height) { this.player.y = this.canvas.height - this.player.radius; this.player.vy = 0; }

        // draw
        this.draw();
        this.timerEl.textContent = this.elapsed.toFixed(1);
        requestAnimationFrame((t)=>this.loop(t));
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        // background
        ctx.fillStyle = '#071818';
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        // player
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath();
        ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI*2);
        ctx.fill();
        // obstacles
        ctx.fillStyle = '#b71c1c';
        for (let o of this.obstacles) {
            ctx.fillRect(o.x, 0, o.w, o.topH);
            ctx.fillRect(o.x, o.topH + o.gap, o.w, this.canvas.height - (o.topH + o.gap));
        }
    }
}

const mini = new MiniGame({ canvas: 'minigame-canvas', startButton: 'minigame-start', exitButton: 'minigame-exit', timer: 'minigame-timer' }, game);

// launcher button
const launchBtn = document.getElementById('minigame-launch');
if (launchBtn) {
    launchBtn.addEventListener('click', () => {
        const panel = document.getElementById('minigame-panel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });
}
}

// --- チュートリアル (ゲーム内モーダルを JS で生成) ---
(function setupTutorial(){
    // チュートリアルボタンを作る（既にあれば再利用）
    let tutBtn = document.getElementById('tutorial-btn');
    if (!tutBtn) {
        tutBtn = document.createElement('button');
        tutBtn.id = 'tutorial-btn';
        tutBtn.textContent = 'チュートリアル';
        tutBtn.style.marginLeft = '8px';
        // 可能なら start-btn の隣に挿入、なければ body に追加
        const startBtnEl = document.getElementById('start-btn');
        if (startBtnEl && startBtnEl.parentNode) startBtnEl.parentNode.insertBefore(tutBtn, startBtnEl.nextSibling);
        else document.body.appendChild(tutBtn);
    }

    // モーダル本体を作る
    let modal = document.getElementById('tutorial-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tutorial-modal';
    modal.style.position = 'fixed';
    modal.style.left = '14px';
    modal.style.top = '14px';
    modal.style.display = 'none';
    modal.style.alignItems = 'flex-start';
    modal.style.justifyContent = 'flex-start';
    modal.style.background = 'transparent';
    modal.style.zIndex = '3001';

        const inner = document.createElement('div');
    inner.style.background = 'rgba(20,20,20,0.98)';
    inner.style.color = '#fff';
    inner.style.padding = '12px';
    inner.style.borderRadius = '10px';
    inner.style.width = '420px';
    inner.style.boxShadow = '0 8px 32px rgba(0,0,0,0.7)';
    inner.style.border = '3px solid #d4af37';
    inner.style.borderRadius = '12px';
                inner.innerHTML = `
                        <div class="missions-panel-inner">
                            <h2 style="margin-top:0;color:#ffd54f">チュートリアル</h2>
                            <div id="tutorial-step" style="min-height:90px;font-size:0.98rem;line-height:1.4;color:#fffde7"></div>
                            <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
                                <button id="tutorial-prev">前へ</button>
                                <button id="tutorial-next">次へ</button>
                                <button id="tutorial-close">閉じる</button>
                            </div>
                        </div>
                `;
        modal.appendChild(inner);
        document.body.appendChild(modal);
    }

    const steps = [
        'ゲームの目的: 現在のカードよりも高いか低いかを予想して賭けます。勝てば掛け金が増え、負ければ減ります。',
        '賭け方: 「ベット」欄で金額を入力し、HIGH または LOW を押します。掛け金は残高内に自動調整されます。',
        'ヒント: 連勝が続くと内部で勝ちをひっくり返す仕組みが働くことがあります。大きな賭けは注意してください。',
    'ミッション: ミッションで報酬がもらえ、累計獲得が1000円に達するとミニゲーム「浮遊回避」が解放されます。',
        'コツ: 小さな賭けで慣れてから賭け金を上げると安定します。タイトルクリックで一度だけボーナスがもらえます。'
    ];

    let idx = 0;
    function showStep(i){
        idx = Math.max(0, Math.min(i, steps.length-1));
        const el = document.getElementById('tutorial-step');
        if (el) el.textContent = steps[idx];
        const prev = document.getElementById('tutorial-prev');
        const next = document.getElementById('tutorial-next');
        if (prev) prev.disabled = idx === 0;
        if (next) next.textContent = idx === steps.length - 1 ? '終わり' : '次へ';
    }

    function openTut(){
        modal.style.display = 'flex';
        showStep(0);
    }
    function closeTut(){
        modal.style.display = 'none';
        try { localStorage.setItem('tutorial_seen', '1'); } catch (e) {}
    }

    document.getElementById('tutorial-next').addEventListener('click', () => {
        if (idx < steps.length - 1) showStep(idx + 1); else closeTut();
    });
    document.getElementById('tutorial-prev').addEventListener('click', () => showStep(idx - 1));
    document.getElementById('tutorial-close').addEventListener('click', closeTut);
    tutBtn.addEventListener('click', openTut);

    // 初回未表示なら自動表示（短い遅延）
    try {
        const seen = localStorage.getItem('tutorial_seen');
        if (!seen) setTimeout(openTut, 600);
    } catch (e) {}
})();

// Missions UI handlers
const missionsBtn = document.getElementById('missions-btn');
const missionsPanel = document.getElementById('missions-panel');
const closeMissionsBtn = document.getElementById('close-missions');
const resetBtn = document.getElementById('reset-btn');
if (missionsBtn && missionsPanel) {
    missionsBtn.addEventListener('click', () => {
        missionsPanel.style.display = 'block';
        game.renderMissions();
    });
}
if (closeMissionsBtn && missionsPanel) {
    closeMissionsBtn.addEventListener('click', () => { missionsPanel.style.display = 'none'; });
}
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (!confirm('本当にリセットしますか？ すべての進捗と残高が失われます。')) return;
        game.resetState();
        alert('リセット完了');
    });
}

// render missions once on load
document.addEventListener('DOMContentLoaded', () => { game.renderMissions(); });
