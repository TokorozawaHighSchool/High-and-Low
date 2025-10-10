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
    this.balance = 500;
        this.currentCard = null;
        this.nextCard = null;
        this.isPlaying = false;
        this.bet = 100;
    }

    start() {
    this.balance = 500;
    this.isPlaying = true;
    this.updateBalance();
    this.updateBetFromInput();
    this.drawNewCard();
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
                if (this.balance < 0) this.balance = 0;
                this.updateBalance();
                if (this.balance === 0) {
                    this.gameOver();
                } else {
                    this.drawNewCard();
                }
            }
        }, 900);
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
        document.getElementById('balance').textContent = this.balance;
    }

    revealNextCard() {
        const nextCardDisplay = document.getElementById('next-card-display');
        nextCardDisplay.textContent = this.nextCard.toString();
    }

    gameOver() {
        this.isPlaying = false;
        this.showGameOverEffect();
        this.hideNextCard();
        setTimeout(() => {
            alert(`ゲームオーバー！\n最終スコア: ${this.score}`);
            this.hideGameOverEffect();
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
