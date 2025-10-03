// 矢印キーでフルーツを左右に動かす
document.addEventListener('keydown', e => {
    if (!fallingFruit || gameOver) return;
    const moveStep = 24; // 動かす幅
    if (e.key === 'ArrowLeft') {
        fallingFruit.x -= moveStep;
        if (fallingFruit.x - fallingFruit.radius < 0) {
            fallingFruit.x = fallingFruit.radius;
        }
    } else if (e.key === 'ArrowRight') {
        fallingFruit.x += moveStep;
        if (fallingFruit.x + fallingFruit.radius > canvas.width) {
            fallingFruit.x = canvas.width - fallingFruit.radius;
        }
    }
});
// スイカゲームの基本ロジック
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// フルーツの種類
const fruits = [
    { name: 'さくらんぼ', color: '#e74c3c', radius: 18 },
    { name: 'いちご', color: '#ff6384', radius: 22 },
    { name: 'ぶどう', color: '#8e44ad', radius: 26 },
    { name: 'デコポン', color: '#ffb347', radius: 30 },
    { name: 'かき', color: '#ff7f50', radius: 34 },
    { name: 'りんご', color: '#27ae60', radius: 38 },
    { name: 'なし', color: '#ffe4a1', radius: 42 },
    { name: 'もも', color: '#fd79a8', radius: 46 },
    { name: 'パイナップル', color: '#ffe066', radius: 50 },
    { name: 'メロン', color: '#00b894', radius: 54 },
    { name: 'スイカ', color: '#009432', radius: 58 }
];



let fallingFruit = null;
let fruitList = [];
let score = 0;
let gameOver = false;
let isDropping = false; // フルーツが落下中か

function spawnFruit() {
    if (gameOver) return;
    // さくらんぼ〜かきまでをランダムで出現
    const type = Math.floor(Math.random() * 5); // 0〜4: さくらんぼ, いちご, ぶどう, デコポン, かき
    fallingFruit = {
        ...fruits[type],
        x: canvas.width / 2,
        y: 40,
        vy: 0,
        type: type
    };
    isDropping = false;
}

function drawFruit(fruit) {
    // 本体
    ctx.beginPath();
    ctx.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
    ctx.fillStyle = fruit.color;
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.stroke();

    // 果物ごとの特徴
    ctx.save();
    switch (fruit.name) {
        case 'さくらんぼ':
            // ヘタ
            ctx.strokeStyle = '#7c4a02';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fruit.x, fruit.y - fruit.radius);
            ctx.lineTo(fruit.x, fruit.y - fruit.radius - 10);
            ctx.stroke();
            // 葉
            ctx.beginPath();
            ctx.fillStyle = '#2ecc40';
            ctx.ellipse(fruit.x + 4, fruit.y - fruit.radius - 8, 4, 2, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'いちご':
            // ヘタ
            ctx.fillStyle = '#2ecc40';
            ctx.beginPath();
            ctx.moveTo(fruit.x, fruit.y - fruit.radius);
            ctx.lineTo(fruit.x - 6, fruit.y - fruit.radius - 8);
            ctx.lineTo(fruit.x + 6, fruit.y - fruit.radius - 8);
            ctx.closePath();
            ctx.fill();
            // 粒
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i;
                ctx.beginPath();
                ctx.ellipse(fruit.x + Math.cos(angle) * (fruit.radius - 5), fruit.y + Math.sin(angle) * (fruit.radius - 8), 2, 3, angle, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'ぶどう':
            // ぶどうの粒
            ctx.fillStyle = '#a29bfe';
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.arc(fruit.x - 6 + i * 4, fruit.y + 10, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'デコポン':
            // デコ
            ctx.fillStyle = '#f6e58d';
            ctx.beginPath();
            ctx.arc(fruit.x, fruit.y - fruit.radius + 5, 6, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'かき':
            // ヘタ
            ctx.fillStyle = '#2ecc40';
            ctx.beginPath();
            ctx.arc(fruit.x, fruit.y - fruit.radius + 4, 6, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'りんご':
            // ヘタ
            ctx.strokeStyle = '#7c4a02';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fruit.x, fruit.y - fruit.radius);
            ctx.lineTo(fruit.x, fruit.y - fruit.radius - 10);
            ctx.stroke();
            // 葉
            ctx.beginPath();
            ctx.fillStyle = '#2ecc40';
            ctx.ellipse(fruit.x + 6, fruit.y - fruit.radius - 6, 5, 2, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'なし':
            // 形を少し変える
            ctx.beginPath();
            ctx.ellipse(fruit.x, fruit.y + 6, fruit.radius * 0.9, fruit.radius, 0, 0, Math.PI * 2);
            ctx.fillStyle = fruit.color;
            ctx.fill();
            break;
        case 'もも':
            // ピンクのグラデーション
            const grad = ctx.createRadialGradient(fruit.x, fruit.y, fruit.radius / 2, fruit.x, fruit.y, fruit.radius);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(1, fruit.color);
            ctx.beginPath();
            ctx.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            break;
        case 'パイナップル':
            // 葉
            ctx.fillStyle = '#2ecc40';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.ellipse(fruit.x - 6 + i * 6, fruit.y - fruit.radius, 4, 10, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            // 模様
            ctx.strokeStyle = '#e1b12c';
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(fruit.x - fruit.radius + 4, fruit.y - fruit.radius + 8 + i * 8);
                ctx.lineTo(fruit.x + fruit.radius - 4, fruit.y - fruit.radius + 8 + i * 8);
                ctx.stroke();
            }
            break;
        case 'メロン':
            // 網目模様
            ctx.strokeStyle = '#fff';
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.arc(fruit.x, fruit.y, fruit.radius - 4 - i * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            break;
        case 'スイカ':
            // 縞模様
            ctx.strokeStyle = '#145a32';
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.arc(fruit.x, fruit.y, fruit.radius - 2 - i * 3, 0, Math.PI * 2);
                ctx.stroke();
            }
            break;
    }
    ctx.restore();
    // 名前表示（デバッグ用）
    // ctx.font = '10px sans-serif';
    // ctx.fillStyle = '#222';
    // ctx.fillText(fruit.name, fruit.x - fruit.radius / 2, fruit.y);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const f of fruitList) drawFruit(f);
    if (fallingFruit) drawFruit(fallingFruit);
    // スコア表示
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#333';
    ctx.fillText('スコア: ' + score, 20, 40);
    if (gameOver) {
        ctx.font = '48px sans-serif';
        ctx.fillStyle = 'red';
        ctx.fillText('ゲームオーバー', 60, canvas.height / 2);
    }
}

function isCollide(f1, f2) {
    const dx = f1.x - f2.x;
    const dy = f1.y - f2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < f1.radius + f2.radius - 2; // 少し余裕
}

function mergeFruits() {
    let merged = false;
    let toAdd = [];
    let toRemove = new Set();
    for (let i = 0; i < fruitList.length; i++) {
        for (let j = i + 1; j < fruitList.length; j++) {
            const a = fruitList[i];
            const b = fruitList[j];
            if (a.type === b.type && isCollide(a, b) && a.type < fruits.length - 1 && a.color === b.color) {
                const newType = a.type + 1;
                const newFruit = {
                    ...fruits[newType],
                    x: (a.x + b.x) / 2,
                    y: (a.y + b.y) / 2,
                    vy: (a.vy + b.vy) / 2,
                    type: newType
                };
                toAdd.push(newFruit);
                toRemove.add(i);
                toRemove.add(j);
                score += (newType + 1) * 10;
                merged = true;
                break;
            }
        }
        if (merged) break;
    }
    if (merged) {
        // 削除対象を降順で削除
        const removeArr = Array.from(toRemove).sort((a, b) => b - a);
        for (const idx of removeArr) {
            fruitList.splice(idx, 1);
        }
        // 新しいフルーツを追加
        fruitList.push(...toAdd);
    }
    return merged;
}

function update() {
    if (gameOver) return;
    if (fallingFruit && isDropping) {
        // 重力を適用
        fallingFruit.vy += 0.4;
        
        // 次の位置を予測
        const nextY = fallingFruit.y + fallingFruit.vy;
        let landed = false;
        
        // 底との衝突チェック
        if (nextY + fallingFruit.radius >= canvas.height) {
            fallingFruit.y = canvas.height - fallingFruit.radius;
            fallingFruit.vy = 0;
            landed = true;
        }
        
        // フルーツとの衝突チェック
        if (!landed) {
            for (const f of fruitList) {
                const dx = fallingFruit.x - f.x;
                const dy = nextY - f.y;
                const distance = Math.hypot(dx, dy);
                const minDist = fallingFruit.radius + f.radius;
                
                if (distance < minDist) {
                    // 同じ種類なら合体
                    if (fallingFruit.type === f.type && fallingFruit.color === f.color && fallingFruit.type < fruits.length - 1) {
                        fallingFruit.y = f.y - f.radius - fallingFruit.radius;
                        fallingFruit.vy = 0;
                        landed = true;
                        break;
                    }
                    
                    // 異なる種類との衝突
                    const angle = Math.atan2(dy, dx);
                    const isTopCollision = dy < 0 && Math.abs(dx) < minDist * 0.7;
                    
                    if (isTopCollision) {
                        // 上からの衝突なら積み重ねる
                        fallingFruit.y = f.y - f.radius - fallingFruit.radius;
                        fallingFruit.vy = 0;
                        landed = true;
                        break;
                    } else {
                        // 横からの衝突なら反発
                        const pushoutDist = (minDist - distance) + 1;
                        const pushX = Math.cos(angle) * pushoutDist;
                        const pushY = Math.sin(angle) * pushoutDist;
                        
                        fallingFruit.x = f.x + Math.cos(angle) * minDist;
                        fallingFruit.y = f.y + Math.sin(angle) * minDist;
                        fallingFruit.vy *= -0.5;
                        
                        // 横方向への追加の押し出し
                        if (Math.abs(dx) < minDist * 0.8) {
                            fallingFruit.x += Math.sign(dx) * 3;
                        }
                    }
                }
            }
        }
        
        // 衝突がなければ落下を続ける
        if (!landed) {
            fallingFruit.y = nextY;
        }
        
        // 着地処理
        if (landed) {
            fruitList.push(fallingFruit);
            // ゲームオーバー判定
            if (fallingFruit.y - fallingFruit.radius < 0) {
                gameOver = true;
            }
            fallingFruit = null;
            spawnFruit();
            isDropping = false;
        }
    }
    // フルーツの落下
    for (const f of fruitList) {
        f.vy = f.vy || 0;
        f.vy += 0.4;
        f.y += f.vy;
        // 底で止める
        if (f.y + f.radius > canvas.height) {
            f.y = canvas.height - f.radius;
            f.vy = 0;
        }
    }
    // 合体処理
    let merged;
    do {
        merged = mergeFruits();
    } while (merged);
}

function gameLoop() {
    update();
    draw();
    if (!gameOver) {
        requestAnimationFrame(gameLoop);
    }
}


canvas.addEventListener('click', e => {
    if (fallingFruit && !gameOver) {
        fallingFruit.x = e.offsetX;
    }
});



// ボタンでフルーツを落とす
window.addEventListener('DOMContentLoaded', () => {
    spawnFruit();
    document.getElementById('dropBtn').addEventListener('click', () => {
        if (!fallingFruit || isDropping || gameOver) return;
        isDropping = true;
        fallingFruit.vy = 0;
    });
    gameLoop();
});
