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
        this.score = 0;
        this.currentCard = null;
        this.nextCard = null;
        this.isPlaying = false;
    }

    start() {
        this.score = 0;
        this.isPlaying = true;
        this.updateScore();
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

        const isCorrect = isHigh ? 
            this.nextCard.number > this.currentCard.number :
            this.nextCard.number < this.currentCard.number;

        if (isCorrect) {
            this.score += 100;
            this.updateScore();
            this.drawNewCard();
        } else {
            this.gameOver();
        }
    }

    gameOver() {
        this.isPlaying = false;
        alert(`ゲームオーバー！\n最終スコア: ${this.score}`);
        this.hideNextCard();
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

    updateScore() {
        document.getElementById('score').textContent = this.score;
    }
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
