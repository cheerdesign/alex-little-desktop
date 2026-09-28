(() => {
  const pet = document.querySelector('.desktop-pet');
  const desktop = document.querySelector('.desktop');
  const canvas = pet?.querySelector('.desktop-pet-canvas');
  if (!pet || !desktop || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const SIZE = 64;
  const STOP_DISTANCE = 42;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let x = Math.max(8, (desktop.clientWidth - SIZE) * .46);
  let y = Math.max(40, Math.min(desktop.clientHeight - 150, (desktop.clientHeight - SIZE) * .52));
  let pointerX = x + SIZE / 2;
  let pointerY = y + SIZE / 2;
  let hasPointer = false;
  let dragging = false;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let facing = 1;
  let walkFrame = 0;
  let idleFrame = 0;
  let lastFrame = performance.now();
  let lastStep = lastFrame;
  let alertTimer = 0;

  const palette = {
    outline: '#3b271d',
    ear: '#a45f37',
    fur: '#e6ac55',
    light: '#f7d58b',
    cream: '#fff0bf',
    collar: '#4f86bb',
    tag: '#f4c84b',
    tongue: '#e87772',
    shadow: 'rgba(34,24,35,.22)',
  };

  function rect(px, py, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, width, height);
  }

  function drawDog(state) {
    ctx.clearRect(0, 0, 32, 32);
    ctx.save();
    if (facing < 0) {
      ctx.translate(32, 0);
      ctx.scale(-1, 1);
    }

    const walking = state === 'walk';
    const grabbed = state === 'grabbed';
    const bob = reducedMotion ? 0 : walking && walkFrame ? -1 : 0;
    ctx.translate(0, bob);

    rect(6, 29, 21, 2, palette.shadow);

    // Tail, with a two-frame wag.
    const tailY = grabbed ? 15 : walking && walkFrame ? 12 : 14;
    rect(2, tailY + 2, 3, 3, palette.outline);
    rect(4, tailY, 3, 4, palette.outline);
    rect(6, tailY - 1, 4, 3, palette.outline);
    rect(3, tailY + 2, 2, 1, palette.fur);
    rect(5, tailY + 1, 2, 2, palette.light);
    rect(7, tailY, 3, 1, palette.fur);

    // Body.
    rect(7, 14, 17, 12, palette.outline);
    rect(9, 13, 12, 2, palette.outline);
    rect(8, 16, 15, 8, palette.fur);
    rect(10, 15, 10, 3, palette.light);
    rect(9, 20, 13, 4, palette.light);

    // Legs alternate while walking and dangle when held.
    if (grabbed) {
      rect(9, 24, 5, 7, palette.outline);
      rect(19, 24, 5, 7, palette.outline);
      rect(10, 24, 3, 5, palette.light);
      rect(20, 24, 3, 5, palette.fur);
    } else if (walking && walkFrame) {
      rect(8, 23, 6, 6, palette.outline);
      rect(19, 24, 6, 5, palette.outline);
      rect(9, 23, 4, 4, palette.light);
      rect(21, 24, 3, 3, palette.fur);
    } else {
      rect(9, 23, 5, 7, palette.outline);
      rect(20, 23, 5, 7, palette.outline);
      rect(10, 23, 3, 5, palette.light);
      rect(21, 23, 3, 5, palette.fur);
    }

    // Head and floppy ear.
    rect(16, 7, 12, 12, palette.outline);
    rect(18, 6, 8, 2, palette.outline);
    rect(17, 8, 10, 10, palette.fur);
    rect(18, 8, 7, 5, palette.light);
    rect(15, grabbed ? 5 : 7, 5, grabbed ? 9 : 10, palette.outline);
    rect(16, grabbed ? 6 : 8, 3, grabbed ? 7 : 7, palette.ear);

    // Face and muzzle.
    rect(24, 12, 6, 6, palette.outline);
    rect(24, 13, 5, 4, palette.cream);
    rect(29, 14, 2, 2, palette.outline);
    if (grabbed) {
      rect(23, 9, 2, 3, palette.outline);
      rect(24, 9, 1, 1, '#fff');
      rect(26, 18, 2, 2, palette.tongue);
    } else if (idleFrame === 3) {
      rect(22, 11, 3, 1, palette.outline);
    } else {
      rect(23, 10, 2, 2, palette.outline);
      rect(24, 10, 1, 1, '#fff');
    }

    // Collar and tag.
    rect(17, 17, 8, 2, palette.outline);
    rect(18, 17, 6, 1, palette.collar);
    rect(21, 19, 2, 2, palette.outline);
    rect(21, 19, 1, 1, palette.tag);

    ctx.restore();
  }

  function desktopPoint(event) {
    const bounds = desktop.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function clampPosition() {
    const maxX = Math.max(0, desktop.clientWidth - SIZE);
    const dockClearance = matchMedia('(max-width: 600px)').matches ? 78 : 80;
    const maxY = Math.max(28, desktop.clientHeight - SIZE - dockClearance);
    x = Math.max(0, Math.min(maxX, x));
    y = Math.max(18, Math.min(maxY, y));
  }

  function placePet() {
    clampPosition();
    pet.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  }

  function showAlert(duration = 900) {
    window.clearTimeout(alertTimer);
    pet.classList.add('is-alert');
    alertTimer = window.setTimeout(() => {
      if (!dragging) pet.classList.remove('is-alert');
    }, duration);
  }

  function setPointer(event) {
    const point = desktopPoint(event);
    pointerX = point.x;
    pointerY = point.y;
    hasPointer = true;
  }

  function startDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    setPointer(event);
    dragging = true;
    dragPointerId = event.pointerId;
    dragOffsetX = pointerX - x;
    dragOffsetY = pointerY - y;
    pet.classList.add('is-dragging');
    pet.setPointerCapture?.(event.pointerId);
    showAlert(1200);
    drawDog('grabbed');
  }

  function moveDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    setPointer(event);
    x = pointerX - dragOffsetX;
    y = pointerY - dragOffsetY;
    placePet();
  }

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    dragging = false;
    pet.classList.remove('is-dragging');
    pet.releasePointerCapture?.(event.pointerId);
    dragPointerId = null;
    showAlert(650);
  }

  function animate(now) {
    const elapsed = Math.min(48, now - lastFrame);
    lastFrame = now;
    let state = 'idle';

    if (dragging) {
      state = 'grabbed';
    } else if (hasPointer) {
      const centerX = x + SIZE / 2;
      const centerY = y + SIZE / 2;
      const dx = pointerX - centerX;
      const dy = pointerY - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance > STOP_DISTANCE) {
        state = 'walk';
        if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
        const speed = reducedMotion ? 8 : Math.min(5.1, .8 + (distance - STOP_DISTANCE) * .035);
        const step = Math.min(distance - STOP_DISTANCE, speed * elapsed / 16.67);
        x += dx / distance * step;
        y += dy / distance * step;
        placePet();
      }
    }

    if (state === 'walk' && now - lastStep > 145) {
      walkFrame = walkFrame ? 0 : 1;
      lastStep = now;
    }
    idleFrame = Math.floor(now / 720) % 8;
    drawDog(state);
    requestAnimationFrame(animate);
  }

  window.addEventListener('pointermove', event => {
    if (dragging) return;
    setPointer(event);
  }, { passive: true });
  window.addEventListener('pointerdown', event => {
    if (pet.contains(event.target)) return;
    setPointer(event);
    showAlert(700);
  }, { passive: true, capture: true });
  pet.addEventListener('pointerdown', startDrag);
  pet.addEventListener('pointermove', moveDrag);
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);
  pet.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    showAlert(800);
  });
  window.addEventListener('resize', placePet);

  placePet();
  drawDog('idle');
  requestAnimationFrame(animate);
})();
