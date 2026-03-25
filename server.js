const http = require('http').createServer();
const io = require('socket.io')(http, { cors: { origin: "*" } });

const PORT = 4000;
const TICK_RATE = 100;
const BOARD_SIZE = 400;
const BOX = 20;

// 定义初始出生点（支持 4 个预设位置）
const SPAWN_POINTS = [
    { x: 2 * BOX, y: 2 * BOX, dir: "RIGHT" },  // 左上
    { x: 17 * BOX, y: 17 * BOX, dir: "LEFT" }, // 右下
    { x: 17 * BOX, y: 2 * BOX, dir: "DOWN" },  // 右上
    { x: 2 * BOX, y: 17 * BOX, dir: "UP" }     // 左下
];

let gameState = {
    players: {}, 
    food: { x: 10 * BOX, y: 10 * BOX }
};

io.on('connection', (socket) => {
    console.log(`玩家接入: ${socket.id}`);
    
    // 1. 分配出生点
    const spawnIndex = Object.keys(gameState.players).length % SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[spawnIndex];

    gameState.players[socket.id] = {
        snake: [{ x: spawn.x, y: spawn.y }],
        dir: spawn.dir,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        isDead: false,
        score: 0
    };

    socket.on('move', (dir) => {
        const player = gameState.players[socket.id];
        if (player && !player.isDead) {
            // 禁止 180 度调头
            if (dir === "LEFT" && player.dir !== "RIGHT") player.dir = "LEFT";
            if (dir === "UP" && player.dir !== "DOWN") player.dir = "UP";
            if (dir === "RIGHT" && player.dir !== "LEFT") player.dir = "RIGHT";
            if (dir === "DOWN" && player.dir !== "UP") player.dir = "DOWN";
        }
    });

    // 处理复请请求
    socket.on('requestRespawn', () => {
        const player = gameState.players[socket.id];
        if (player && player.isDead) {
            const newSpawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
            player.snake = [{ x: newSpawn.x, y: newSpawn.y }];
            player.dir = newSpawn.dir;
            player.isDead = false;
            player.score = 0;
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
    });
});

// 主游戏循环：计算物理逻辑
setInterval(() => {
    const players = gameState.players;
    const ids = Object.keys(players);

    // 【第一阶段：移动所有活着的蛇】
    ids.forEach(id => {
        const p = players[id];
        if (p.isDead || !p.dir) return;

        let head = { ...p.snake[0] };
        if (p.dir === "LEFT") head.x -= BOX;
        if (p.dir === "RIGHT") head.x += BOX;
        if (p.dir === "UP") head.y -= BOX;
        if (p.dir === "DOWN") head.y += BOX;

        p.nextHead = head; // 暂存预测位置，用于后续冲突判定
    });

    // 【第二阶段：冲突与死亡判定】
    ids.forEach(id => {
        const p = players[id];
        if (p.isDead || !p.nextHead) return;

        const head = p.nextHead;

        // 1. 撞墙检查
        if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
            p.isDead = true;
            return;
        }

        // 2. 撞到自己或他人的身体
        ids.forEach(otherId => {
            const other = players[otherId];
            if (other.isDead) return;

            // 检查 head 是否撞到 other.snake 的任意一节
            // 如果 otherId 是自己，则检查是否撞到自己（从第2节开始比对）
            other.snake.forEach((seg, index) => {
                if (head.x === seg.x && head.y === seg.y) {
                    p.isDead = true;
                }
            });
        });

        // 3. 蛇头对撞判定 (Head-to-Head Duel)
        ids.forEach(otherId => {
            if (id === otherId) return; // 不跟自己比
            const other = players[otherId];
            if (other.isDead || !other.nextHead) return;

            if (head.x === other.nextHead.x && head.y === other.nextHead.y) {
                // 长度竞争：短的一方死亡。如果一样长，双亡
                if (p.snake.length < other.snake.length) {
                    p.isDead = true;
                } else if (p.snake.length === other.snake.length) {
                    p.isDead = true;
                }
            }
        });
    });

    // 【第三阶段：更新位置与吃食】
    ids.forEach(id => {
        const p = players[id];
        if (p.isDead) return;

        const head = p.nextHead;
        if (head.x === gameState.food.x && head.y === gameState.food.y) {
            p.score++;
            gameState.food = { 
                x: Math.floor(Math.random() * 20) * BOX, 
                y: Math.floor(Math.random() * 20) * BOX 
            };
        } else {
            p.snake.pop();
        }
        p.snake.unshift(head);
        delete p.nextHead; // 清除缓存
    });

    io.emit('gameUpdate', gameState);
}, TICK_RATE);

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));