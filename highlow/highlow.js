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
        // 次のカードを表示
        this.revealNextCard();

        const isCorrect = isHigh ?
            this.nextCard.number > this.currentCard.number :
            this.nextCard.number < this.currentCard.number;

        setTimeout(() => {
            if (isCorrect) {
                this.balance += this.bet;
                this.updateBalance();
                this.drawNewCard();
            } else {
                this.balance -= this.bet;
                // Allow balance to become negative (no clamping to 0)
                this.updateBalance();
                this.drawNewCard();
            }
        }, 900);
    }
    
    // Add method to earn 1 yen per click
    earnOne() {
        this.balance += 1;
        this.updateBalance();
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
