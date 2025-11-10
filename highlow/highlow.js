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
    }

    start() {
    // do not reset balance on start; keep persistent balance
    this.isPlaying = true;
    this.updateBalance();
    this.updateBetFromInput();
    this.drawNewCard();
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
            if (this.balance > 0) {
                const betRatio = this.bet / this.balance; // e.g. 0.5 = half the balance
                if (betRatio > this.betPenaltyThreshold) {
                    betPenaltyChance = Math.min((betRatio - this.betPenaltyThreshold) * this.betPenaltyFactor, this.betPenaltyCap);
                }
            } else if (this.bet > 0) {
                // if balance is zero or negative, treat as high-risk
                betPenaltyChance = this.betPenaltyCap;
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
                this.balance += this.bet;
                this.winStreak += 1; // increase streak on a genuine win
                // mission: update streak-based missions
                this.onWinStreakChange();
                // track earned
                this.onEarn(this.bet);
                this.updateBalance();
                this.drawNewCard();
            } else {
                this.balance -= this.bet;
                this.winStreak = 0; // reset on loss
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
        if (betValue > this.balance && this.balance > 0) betValue = this.balance;
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
        this.lastSpawn = this.lastTime + 600;
        requestAnimationFrame((t)=>this.loop(t));
    }

    stop(force=false) {
        if (this._stopped) return;
        this._stopped = true;
        this.isRunning = false;
        // reward based on elapsed seconds — use 0.1s precision to avoid 0 reward on quick exits
        const secsRounded = Math.max(0, Math.round(this.elapsed * 10) / 10);
        const reward = Math.max(0, Math.floor(secsRounded * this.rewardPerSecond));
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
        const gap = 90; // gap for the player
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
        'ミッション: ミッションで報酬がもらえ、累計獲得でミニゲームが解放されます。',
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
