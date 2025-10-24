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
    this.countdownTimer = null;
    this.countdownRemaining = 0;
    this.winStreak = 0; // 連勝カウント
    // tuning: how much the system should try to flip a player's correct guess per streak
    this.streakFlipFactor = 0.08; // 8% per win
    this.streakFlipCap = 0.5; // 最大 50% の確率で勝ちをひっくり返す
    this.streakThreshold = 5; // 連勝何回目からペナルティを開始するか
    // --- Missions system ---
    this.missions = [
        { id: 'm1', title: '5連勝達成', desc: '5連勝を達成する', type: 'streak', target: 5, progress: 0, reward: 1000, completed: false },
        { id: 'm2', title: '累計収益: 10000円', desc: '累計で合計10000円稼ぐ', type: 'totalEarned', target: 10000, progress: 0, reward: 5000, completed: false },
    { id: 'm3', title: 'はじめの10回', desc: '10回プレイしてみよう', type: 'plays', target: 10, progress: 0, reward: 200, completed: false },
    // click mission: start with 100 clicks
    { id: 'click_100', title: 'クリックチャレンジ: 100回', desc: 'クリックを合計で100回行う', type: 'clicks', target: 100, progress: 0, reward: 100, completed: false }
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

        // If the guess would be correct, there is a chance (scaled by winStreak)
        // that the system will make it incorrect by adjusting nextCard to an
        // unfavorable value before revealing.
        // only start applying penalty once the winStreak reaches threshold
        if (isCorrect && this.winStreak >= this.streakThreshold) {
            const effectiveStreak = this.winStreak - (this.streakThreshold - 1); // 5連勝目が1段目
            const flipChance = Math.min(this.streakFlipFactor * effectiveStreak, this.streakFlipCap);
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
        // If this was a clicks mission, spawn next scaled mission and double clickValue
        if (m.type === 'clicks') {
            const nextTarget = m.target * 5;
            const nextReward = m.target; // reward equals the number of clicks of the target
            const newId = `click_${nextTarget}`;
            if (!this.missions.find(x => x.id === newId)) {
                const newMission = { id: newId, title: `クリックチャレンジ: ${nextTarget}回`, desc: `クリックを合計で${nextTarget}回行う`, type: 'clicks', target: nextTarget, progress: this.totalClicks, reward: nextReward, completed: false };
                this.missions.push(newMission);
                if (newMission.progress >= newMission.target) this.completeMission(newMission.id);
            }
            // double the clickValue upon completion
            this.clickValue *= 2;
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
            { id: 'click_100', title: 'クリックチャレンジ: 100回', desc: 'クリックを合計で100回行う', type: 'clicks', target: 100, progress: 0, reward: 100, completed: false }
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
        this.isPlaying = false;
        this.showGameOverEffect();
        this.hideNextCard();
    // stop countdown (if running) and reset balance to 0
    if (this.stopCountdown) this.stopCountdown();
    this.balance = 0;
    this.updateBalance();
        setTimeout(() => {
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
}

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
