(() => {
  const catalog = [
    { title: 'Memory Match', description: 'Flip the cards and find all eight pairs.' },
    { title: '2048', description: 'Slide matching tiles together to reach 2048.' },
    { title: 'Snake', description: 'Collect stars. The walls wrap, but your tail does not.' }
  ];
  const faces = ['🌼', '🍒', '🦋', '⭐', '🍀', '🌙', '🍋', '🐚'];
  const directions = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function newMemory() {
    return { cards: shuffled([...faces, ...faces]), flipped: [], matched: new Set(), moves: 0, locked: false, timeout: null };
  }

  function empty2048() {
    const game = { cells: Array(16).fill(0), score: 0, over: false, won: false };
    addTile(game);
    addTile(game);
    return game;
  }

  function addTile(game) {
    const empty = game.cells.map((value, index) => value ? -1 : index).filter(index => index >= 0);
    if (!empty.length) return;
    game.cells[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < .9 ? 2 : 4;
  }

  function canMove(game) {
    if (game.cells.includes(0)) return true;
    return game.cells.some((value, index) => (index % 4 < 3 && value === game.cells[index + 1]) || (index < 12 && value === game.cells[index + 4]));
  }

  function newSnake() {
    const game = { body: [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }], direction: 'right', nextDirection: 'right', food: null, score: 0, status: 'ready' };
    placeFood(game);
    return game;
  }

  function placeFood(game) {
    const free = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (!game.body.some(segment => segment.x === x && segment.y === y)) free.push({ x, y });
    }
    game.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function mount(root, setStatus) {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const stage = root.querySelector('.games-stage');
    const title = root.querySelector('.games-title');
    const description = root.querySelector('.games-description');
    const position = root.querySelector('.games-position');
    const dots = root.querySelector('.games-dots');
    const windowElement = root.closest('.app-window');
    let current = 0;
    let memory = newMemory();
    let numbers = empty2048();
    let snake = newSnake();
    let snakeTimer = null;
    let gesture = null;

    function stopSnake() {
      clearInterval(snakeTimer);
      snakeTimer = null;
      if (snake.status === 'playing') snake.status = 'paused';
    }

    function renderMemory() {
      const cards = memory.cards.map((face, index) => {
        const matched = memory.matched.has(index);
        const revealed = matched || memory.flipped.includes(index);
        return `<button class="games-card${revealed ? ' is-revealed' : ''}${matched ? ' is-matched' : ''}" data-games-card="${index}" aria-label="${revealed ? face : `Hidden card ${index + 1}`}" ${matched ? 'disabled' : ''}><span aria-hidden="true">${revealed ? face : '?'}</span></button>`;
      }).join('');
      const complete = memory.matched.size === 16;
      return `<section class="games-play-area games-memory" aria-label="Memory Match"><div class="games-scorebar"><span><strong>${memory.matched.size / 2}</strong><small>of 8 pairs</small></span><span><strong>${memory.moves}</strong><small>moves</small></span><button class="games-reset" data-games-action="reset-memory">New game ↻</button></div><div class="games-memory-grid">${cards}</div><p class="games-feedback" role="status">${complete ? 'You found every pair. Beautifully done!' : 'Pick two cards to reveal a pair.'}</p></section>`;
    }

    function render2048() {
      const cells = numbers.cells.map(value => `<div class="games-2048-cell${value ? ' has-tile' : ''}" data-value="${Math.min(value, 2048)}">${value || ''}</div>`).join('');
      const feedback = numbers.over ? 'No moves left. Try a new board!' : numbers.won ? 'You made 2048! Keep going if you like.' : 'Use arrow keys, swipe, or the direction buttons.';
      return `<section class="games-play-area games-number" aria-label="2048"><div class="games-scorebar"><span><strong>${numbers.score}</strong><small>score</small></span><span><strong>${Math.max(...numbers.cells)}</strong><small>best tile</small></span><button class="games-reset" data-games-action="reset-2048">New game ↻</button></div><div class="games-2048-grid games-swipe-board" data-games-board="2048" aria-label="2048 board">${cells}</div><p class="games-feedback" role="status">${feedback}</p>${directionButtons()}</section>`;
    }

    function directionButtons() {
      return '<div class="games-directions" role="group" aria-label="Move"><button data-games-direction="left" aria-label="Move left">←</button><button data-games-direction="up" aria-label="Move up">↑</button><button data-games-direction="down" aria-label="Move down">↓</button><button data-games-direction="right" aria-label="Move right">→</button></div>';
    }

    function renderSnake() {
      const occupied = new Set(snake.body.map(segment => segment.y * 16 + segment.x));
      const food = snake.food ? snake.food.y * 16 + snake.food.x : -1;
      const cells = Array.from({ length: 256 }, (_, index) => `<span class="games-snake-cell${occupied.has(index) ? ' is-snake' : ''}${index === snake.body[0].y * 16 + snake.body[0].x ? ' is-head' : ''}${index === food ? ' is-food' : ''}" aria-hidden="true">${index === food ? '★' : ''}</span>`).join('');
      const message = snake.status === 'over' ? 'Your snake caught its tail. Play again?' : snake.status === 'won' ? 'You filled the whole board!' : snake.status === 'paused' ? 'Paused. Press Resume when you are ready.' : snake.status === 'ready' ? 'Press Play or an arrow key to start.' : 'Use arrow keys, swipe, or the direction buttons.';
      return `<section class="games-play-area games-snake" aria-label="Snake"><div class="games-scorebar"><span><strong>${snake.score}</strong><small>stars</small></span><button class="games-reset" data-games-action="reset-snake">New game ↻</button></div><div class="games-snake-grid games-swipe-board" data-games-board="snake" aria-label="Snake board">${cells}</div><div class="games-snake-actions"><button class="games-primary" data-games-action="snake-toggle">${snake.status === 'playing' ? 'Pause' : snake.status === 'paused' ? 'Resume' : snake.status === 'over' || snake.status === 'won' ? 'Play again' : 'Play'}</button><p class="games-feedback" role="status">${message}</p></div>${directionButtons()}</section>`;
    }

    function renderStage() {
      stage.innerHTML = current === 0 ? renderMemory() : current === 1 ? render2048() : renderSnake();
    }

    function render() {
      title.textContent = catalog[current].title;
      description.textContent = catalog[current].description;
      position.textContent = `· ${current + 1} / 3`;
      dots.innerHTML = catalog.map((game, index) => `<button data-games-index="${index}" aria-label="Show ${game.title}" aria-current="${index === current ? 'true' : 'false'}"></button>`).join('');
      setStatus(`${catalog[current].title} · ${current + 1} of 3`);
      renderStage();
      stage.scrollTop = 0;
    }

    function switchTo(index) {
      if (current === index) return;
      if (current === 2) stopSnake();
      current = (index + catalog.length) % catalog.length;
      render();
    }

    function flipCard(index) {
      if (memory.locked || memory.matched.has(index) || memory.flipped.includes(index)) return;
      memory.flipped.push(index);
      if (memory.flipped.length === 2) {
        memory.moves++;
        const [first, second] = memory.flipped;
        if (memory.cards[first] === memory.cards[second]) {
          memory.matched.add(first);
          memory.matched.add(second);
          memory.flipped = [];
        } else {
          memory.locked = true;
          memory.timeout = setTimeout(() => {
            memory.flipped = [];
            memory.locked = false;
            memory.timeout = null;
            if (current === 0) renderStage();
          }, 850);
        }
      }
      renderStage();
    }

    function move2048(direction) {
      if (numbers.over) return;
      const before = [...numbers.cells];
      for (let line = 0; line < 4; line++) {
        const indices = Array.from({ length: 4 }, (_, offset) => {
          if (direction === 'left') return line * 4 + offset;
          if (direction === 'right') return line * 4 + 3 - offset;
          if (direction === 'up') return offset * 4 + line;
          return (3 - offset) * 4 + line;
        });
        const values = indices.map(index => numbers.cells[index]).filter(Boolean);
        const merged = [];
        for (let i = 0; i < values.length; i++) {
          if (values[i] === values[i + 1]) {
            const value = values[i] * 2;
            merged.push(value);
            numbers.score += value;
            if (value >= 2048) numbers.won = true;
            i++;
          } else merged.push(values[i]);
        }
        indices.forEach((index, offset) => { numbers.cells[index] = merged[offset] || 0; });
      }
      if (before.some((value, index) => value !== numbers.cells[index])) addTile(numbers);
      numbers.over = !canMove(numbers);
      renderStage();
    }

    function tickSnake() {
      if (current !== 2 || document.hidden || windowElement.hidden || windowElement.classList.contains('is-inactive')) {
        stopSnake();
        if (current === 2) renderStage();
        return;
      }
      snake.direction = snake.nextDirection;
      const [dx, dy] = vectors[snake.direction];
      const head = { x: (snake.body[0].x + dx + 16) % 16, y: (snake.body[0].y + dy + 16) % 16 };
      const eating = snake.food && head.x === snake.food.x && head.y === snake.food.y;
      const bodyToCheck = eating ? snake.body : snake.body.slice(0, -1);
      if (bodyToCheck.some(segment => segment.x === head.x && segment.y === head.y)) {
        stopSnake();
        snake.status = 'over';
        renderStage();
        return;
      }
      snake.body.unshift(head);
      if (eating) {
        snake.score++;
        placeFood(snake);
        if (!snake.food) {
          stopSnake();
          snake.status = 'won';
        }
      } else snake.body.pop();
      renderStage();
    }

    function toggleSnake() {
      if (snake.status === 'playing') stopSnake();
      else {
        if (snake.status === 'over' || snake.status === 'won') snake = newSnake();
        snake.status = 'playing';
        clearInterval(snakeTimer);
        snakeTimer = setInterval(tickSnake, 145);
      }
      renderStage();
    }

    function steerSnake(direction) {
      if (direction !== opposite[snake.direction]) snake.nextDirection = direction;
      if (snake.status === 'ready') toggleSnake();
    }

    function gameMove(direction) {
      if (current === 1) move2048(direction);
      else if (current === 2) steerSnake(direction);
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button.dataset.gamesIndex !== undefined) switchTo(Number(button.dataset.gamesIndex));
      else if (button.dataset.gamesCard !== undefined) flipCard(Number(button.dataset.gamesCard));
      else if (button.dataset.gamesDirection) gameMove(button.dataset.gamesDirection);
      else if (button.dataset.gamesAction === 'previous') switchTo(current - 1);
      else if (button.dataset.gamesAction === 'next') switchTo(current + 1);
      else if (button.dataset.gamesAction === 'reset-memory') {
        clearTimeout(memory.timeout);
        memory = newMemory();
        renderStage();
      } else if (button.dataset.gamesAction === 'reset-2048') {
        numbers = empty2048();
        renderStage();
      } else if (button.dataset.gamesAction === 'reset-snake') {
        stopSnake();
        snake = newSnake();
        renderStage();
      } else if (button.dataset.gamesAction === 'snake-toggle') toggleSnake();
    }, options);

    document.addEventListener('keydown', event => {
      if (windowElement.hidden || windowElement.classList.contains('is-inactive') || !directions[event.key] || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,[contenteditable="true"]')) return;
      if (current !== 1 && current !== 2) return;
      event.preventDefault();
      gameMove(directions[event.key]);
    }, options);

    root.addEventListener('pointerdown', event => {
      const target = event.target.closest('.games-swipe-board,.games-switcher');
      if (!target || event.pointerType === 'mouse') return;
      gesture = { x: event.clientX, y: event.clientY, board: target.classList.contains('games-swipe-board') };
    }, options);
    root.addEventListener('pointerup', event => {
      if (!gesture) return;
      const { x, y, board } = gesture;
      gesture = null;
      const dx = event.clientX - x;
      const dy = event.clientY - y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      if (!board && Math.abs(dx) > Math.abs(dy) * 1.2) switchTo(current + (dx < 0 ? 1 : -1));
      else if (board) gameMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && snake.status === 'playing') {
        stopSnake();
        if (current === 2) renderStage();
      }
    }, options);

    render();
    return () => {
      controller.abort();
      clearTimeout(memory.timeout);
      clearInterval(snakeTimer);
    };
  }

  window.Games = { mount };
})();
