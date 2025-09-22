
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
context.scale(20, 20);

const nextCanvas = document.getElementById('next');
const nextContext = nextCanvas.getContext('2d');
nextContext.scale(20, 20);

const arenaWidth = 12;
const arenaHeight = 20;

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function createPiece(type) {
    if (type === 'T') {
        return [
            [0, 0, 0],
            [1, 1, 1],
            [0, 1, 0],
        ];
    } else if (type === 'O') {
        return [
            [2, 2],
            [2, 2],
        ];
    } else if (type === 'L') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [0, 3, 3],
        ];
    } else if (type === 'J') {
        return [
            [0, 4, 0],
            [0, 4, 0],
            [4, 4, 0],
        ];
    } else if (type === 'I') {
        return [
            [0, 5, 0, 0],
            [0, 5, 0, 0],
            [0, 5, 0, 0],
            [0, 5, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 6, 6],
            [6, 6, 0],
            [0, 0, 0],
        ];
    } else if (type === 'Z') {
        return [
            [7, 7, 0],
            [0, 7, 7],
            [0, 0, 0],
        ];
    }
}

function drawMatrix(matrix, offset, ctx = context) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                // 本体
                ctx.fillStyle = colors[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                // 影（右下）
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = '#000';
                ctx.fillRect(x + offset.x + 0.15, y + offset.y + 0.15, 0.7, 0.7);
                ctx.restore();
                // 枠線
                ctx.save();
                ctx.lineWidth = 0.08;
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
                ctx.restore();
            }
        });
    });
}
let nextPiece = null;

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function collide(arena, player) {
    const m = player.matrix;
    const o = player.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (
                m[y][x] !== 0 &&
                (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0
            ) {
                return true;
            }
        }
    }
    return false;
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
        player.pos.x -= dir;
    }
}

function playerReset() {
    const pieces = 'TJLOSZI';
    if (!nextPiece) {
        nextPiece = createPiece(pieces[(Math.random() * pieces.length) | 0]);
    }
    player.matrix = nextPiece;
    nextPiece = createPiece(pieces[(Math.random() * pieces.length) | 0]);
    player.pos.y = 0;
    player.pos.x = ((arenaWidth / 2) | 0) - ((player.matrix[0].length / 2) | 0);
    drawNext();
    if (collide(arena, player)) {
        arena.forEach(row => row.fill(0));
        player.score = 0;
        updateScore();
    }
}
function drawNext() {
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    // ミノを中央に描画
    if (!nextPiece) return;
    const offset = { x: Math.floor((4 - nextPiece[0].length) / 2), y: Math.floor((4 - nextPiece.length) / 2) };
    drawMatrix(nextPiece, offset, nextContext);
}

function arenaSweep() {
    let lines = 0;
    for (let y = arena.length - 1; y >= 0; --y) {
        if (arena[y].every(cell => cell !== 0)) {
            const row = arena.splice(y, 1)[0].fill(0);
            arena.unshift(row);
            ++lines;
            ++y; // 行を消したので同じyをもう一度チェック
        }
    }
    if (lines > 0) {
        // 1列:10, 2列:30, 3列:60, 4列:100, それ以上は4列と同じ
        const scoreTable = [0, 10, 30, 60, 100];
        player.score += scoreTable[Math.min(lines, 4)];
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    requestAnimationFrame(update);
}

function draw() {
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, { x: 0, y: 0 });
    drawMatrix(player.matrix, player.pos);
}

function updateScore() {
    document.getElementById('score').innerText = 'スコア: ' + player.score;
    // スコアに応じて落下速度を調整
    if (player.score < 100) {
        dropInterval = 500;
    } else if (player.score < 300) {
        dropInterval = 350;
    } else if (player.score < 600) {
        dropInterval = 200;
    } else if (player.score < 1000) {
        dropInterval = 120;
    } else {
        dropInterval = 60;
    }
}

const colors = [
    null,
    '#FF0D72', // T
    '#0DC2FF', // O
    '#0DFF72', // L
    '#F538FF', // J
    '#FF8E0D', // I
    '#FFE138', // S
    '#3877FF', // Z
];

const arena = createMatrix(arenaWidth, arenaHeight);
const player = {
    pos: { x: 0, y: 0 },
    matrix: null,
    score: 0,
};

document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') {
        playerMove(-1);
    } else if (event.key === 'ArrowRight') {
        playerMove(1);
    } else if (event.key === 'ArrowDown') {
        playerDrop();
    } else if (event.key === 'q') {
        playerRotate(-1);
    } else if (event.key === 'w') {
        playerRotate(1);
    }
});

let isStarted = false;

function startGame() {
    arena.forEach(row => row.fill(0));
    player.score = 0;
    nextPiece = null;
    playerReset();
    updateScore();
    if (!isStarted) {
        isStarted = true;
        update();
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    startGame();
});
