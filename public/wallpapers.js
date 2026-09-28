(() => {
  const wallpaper = document.querySelector('.wallpaper');
  const canvas = wallpaper?.querySelector('.wallpaper-canvas');
  if (!wallpaper || !canvas) return;

  const context = canvas.getContext('2d', { alpha: true });
  const themes = {
    yosemite: { title: 'Yosemite Breeze' },
    aurora: { title: 'Aurora Drift' },
    cosmos: { title: 'Quiet Cosmos' },
    sunset: { title: 'Liquid Sunset' },
    glass: { title: 'Reeded Glass' }
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };

  let theme = themes[safeStorage.get('alex.wallpaper.theme')] ? safeStorage.get('alex.wallpaper.theme') : 'yosemite';
  let motion = safeStorage.get('alex.wallpaper.motion') === 'off' ? false : !reduceMotion.matches;
  let animationFrame = 0;
  let lastTime = performance.now();
  let cssWidth = innerWidth;
  let cssHeight = innerHeight;
  let pointer = { x: innerWidth / 2, y: innerHeight / 2, smoothX: innerWidth / 2, smoothY: innerHeight / 2, energy: 0 };
  const ripples = [];
  const motes = Array.from({ length: 72 }, () => ({
    x: Math.random(), y: Math.random(), size: .6 + Math.random() * 2.4,
    speed: .12 + Math.random() * .5, phase: Math.random() * Math.PI * 2,
    depth: .25 + Math.random() * .9
  }));

  function resize() {
    cssWidth = innerWidth;
    cssHeight = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    requestDraw();
  }

  function updatePointerStyle() {
    const nx = pointer.smoothX / Math.max(1, cssWidth) - .5;
    const ny = pointer.smoothY / Math.max(1, cssHeight) - .5;
    wallpaper.style.setProperty('--wallpaper-shift-x', `${(-nx * 17).toFixed(2)}px`);
    wallpaper.style.setProperty('--wallpaper-shift-y', `${(-ny * 13).toFixed(2)}px`);
  }

  function drawYosemite(time) {
    for (let index = 0; index < 42; index++) {
      const mote = motes[index];
      const drift = Math.sin(time * .00028 * mote.speed + mote.phase);
      let x = ((mote.x * cssWidth + time * .006 * mote.speed) % (cssWidth + 50)) - 25;
      let y = mote.y * cssHeight + drift * 24;
      const dx = x - pointer.smoothX;
      const dy = y - pointer.smoothY;
      const distance = Math.hypot(dx, dy);
      if (distance < 150 && distance > 0) {
        const push = (150 - distance) / 150 * 24 * pointer.energy;
        x += dx / distance * push;
        y += dy / distance * push;
      }
      const alpha = .13 + (Math.sin(time * .001 + mote.phase) + 1) * .09;
      context.beginPath();
      context.fillStyle = `rgba(255,238,196,${alpha})`;
      context.arc(x, y, mote.size, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawAurora(time) {
    const colors = ['rgba(88,255,215,.18)', 'rgba(105,190,255,.14)', 'rgba(190,91,255,.16)'];
    colors.forEach((color, band) => {
      const base = cssHeight * (.24 + band * .13);
      const pullX = (pointer.smoothX / cssWidth - .5) * (20 + band * 8);
      const pullY = (pointer.smoothY / cssHeight - .5) * (14 + band * 6);
      context.beginPath();
      context.moveTo(-80, base);
      for (let x = -80; x <= cssWidth + 80; x += 28) {
        const wave = Math.sin(x * .007 + time * (.0002 + band * .00004) + band * 1.6) * (46 + band * 16);
        const cursorBell = Math.exp(-Math.pow((x - pointer.smoothX) / 260, 2)) * pullY;
        context.lineTo(x + pullX, base + wave + cursorBell);
      }
      context.strokeStyle = color;
      context.lineWidth = 70 + band * 25;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.shadowBlur = 34;
      context.shadowColor = color;
      context.stroke();
      context.shadowBlur = 0;
    });
    const glow = context.createRadialGradient(pointer.smoothX, pointer.smoothY, 0, pointer.smoothX, pointer.smoothY, 180);
    glow.addColorStop(0, `rgba(205,255,241,${.11 * pointer.energy})`);
    glow.addColorStop(1, 'rgba(205,255,241,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, cssWidth, cssHeight);
  }

  function drawCosmos(time) {
    for (const star of motes) {
      const twinkle = .32 + (Math.sin(time * .0012 * star.speed + star.phase) + 1) * .28;
      const parallaxX = (pointer.smoothX / cssWidth - .5) * 38 * star.depth;
      const parallaxY = (pointer.smoothY / cssHeight - .5) * 28 * star.depth;
      const x = (star.x * cssWidth - parallaxX + cssWidth) % cssWidth;
      const y = (star.y * cssHeight - parallaxY + cssHeight) % cssHeight;
      context.beginPath();
      context.fillStyle = `rgba(${star.depth > .72 ? '215,229,255' : '255,255,255'},${twinkle})`;
      context.arc(x, y, star.size * (.65 + star.depth * .7), 0, Math.PI * 2);
      context.fill();
    }
    const radius = 95 + Math.sin(time * .0015) * 12;
    const halo = context.createRadialGradient(pointer.smoothX, pointer.smoothY, 0, pointer.smoothX, pointer.smoothY, radius);
    halo.addColorStop(0, `rgba(142,169,255,${.14 * pointer.energy})`);
    halo.addColorStop(1, 'rgba(92,111,230,0)');
    context.fillStyle = halo;
    context.fillRect(0, 0, cssWidth, cssHeight);
  }

  function drawSunset(time) {
    for (let index = 0; index < 24; index++) {
      const bubble = motes[index];
      const baseX = bubble.x * cssWidth;
      const baseY = bubble.y * cssHeight;
      const x = baseX + Math.sin(time * .00025 * bubble.speed + bubble.phase) * 35 - (pointer.smoothX / cssWidth - .5) * 22 * bubble.depth;
      const y = baseY + Math.cos(time * .0002 * bubble.speed + bubble.phase) * 28 - (pointer.smoothY / cssHeight - .5) * 18 * bubble.depth;
      const radius = 8 + bubble.size * 10;
      context.beginPath();
      context.fillStyle = index % 3 === 0 ? 'rgba(255,229,177,.08)' : index % 3 === 1 ? 'rgba(128,110,197,.09)' : 'rgba(255,171,180,.08)';
      context.strokeStyle = 'rgba(255,255,255,.10)';
      context.lineWidth = 1;
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

  function drawGlass(time) {
    const centerX = pointer.smoothX;
    const centerY = pointer.smoothY;
    const pulse = 1 + Math.sin(time * .0017) * .025;
    const strength = (.66 + pointer.energy * .34) * pulse;
    const lobes = [
      { x: centerX, y: centerY + 32, radius: 104 },
      { x: centerX - 73, y: centerY - 49, radius: 43 },
      { x: centerX - 30, y: centerY - 82, radius: 45 },
      { x: centerX + 17, y: centerY - 88, radius: 44 },
      { x: centerX + 59, y: centerY - 65, radius: 41 },
      { x: centerX + 88, y: centerY + 2, radius: 46 }
    ];

    context.save();
    context.filter = 'blur(16px)';
    context.fillStyle = `rgba(103,91,83,${.12 * strength})`;
    for (const lobe of lobes) {
      context.beginPath();
      context.arc(lobe.x, lobe.y, lobe.radius * .86, 0, Math.PI * 2);
      context.fill();
    }
    context.filter = 'none';

    const highlight = context.createRadialGradient(centerX - 18, centerY - 28, 10, centerX, centerY, 190);
    highlight.addColorStop(0, `rgba(255,255,255,${.34 * strength})`);
    highlight.addColorStop(.48, `rgba(255,250,246,${.13 * strength})`);
    highlight.addColorStop(.72, `rgba(119,108,100,${.08 * strength})`);
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = highlight;
    context.fillRect(centerX - 220, centerY - 220, 440, 440);

    const cell = 15;
    const reach = 175;
    const startX = Math.floor((centerX - reach) / cell) * cell;
    const endX = Math.ceil((centerX + reach) / cell) * cell;
    const startY = Math.floor((centerY - reach) / cell) * cell;
    const endY = Math.ceil((centerY + reach) / cell) * cell;
    for (let y = startY; y <= endY; y += cell) {
      for (let x = startX; x <= endX; x += cell) {
        const sampleX = x + cell / 2;
        const sampleY = y + cell / 2;
        let influence = 0;
        for (const lobe of lobes) {
          const distance = Math.hypot(sampleX - lobe.x, sampleY - lobe.y);
          influence = Math.max(influence, Math.max(0, 1 - distance / lobe.radius));
        }
        if (influence <= 0) continue;
        const dx = sampleX - centerX;
        const dy = sampleY - centerY;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const bend = Math.pow(influence, 1.55) * 16 * strength;
        const shimmer = Math.sin(distance * .12 - time * .0022) * influence * 2.1;
        const offsetX = dx / distance * (bend + shimmer);
        const offsetY = dy / distance * (bend + shimmer);
        const alpha = .08 + influence * .2;
        context.fillStyle = `rgba(255,255,255,${alpha})`;
        context.strokeStyle = `rgba(93,84,79,${.08 + influence * .12})`;
        context.lineWidth = .7;
        context.fillRect(x + offsetX + 1, y + offsetY + 1, cell - 2, cell - 2);
        context.strokeRect(x + offsetX + 1.5, y + offsetY + 1.5, cell - 3, cell - 3);
      }
    }
    context.restore();
  }

  function drawRipples(now) {
    for (let index = ripples.length - 1; index >= 0; index--) {
      const ripple = ripples[index];
      const age = (now - ripple.started) / 900;
      if (age >= 1) { ripples.splice(index, 1); continue; }
      context.beginPath();
      context.arc(ripple.x, ripple.y, 18 + age * 92, 0, Math.PI * 2);
      context.strokeStyle = theme === 'glass'
        ? `rgba(92,82,76,${(1 - age) * .32})`
        : `rgba(255,255,255,${(1 - age) * .42})`;
      context.lineWidth = 1.5 + (1 - age) * 1.5;
      context.stroke();
    }
  }

  function render(now = performance.now()) {
    animationFrame = 0;
    const elapsed = Math.min(50, now - lastTime);
    lastTime = now;
    if (motion) {
      const smoothing = 1 - Math.pow(.82, elapsed / 16.67);
      pointer.smoothX += (pointer.x - pointer.smoothX) * smoothing;
      pointer.smoothY += (pointer.y - pointer.smoothY) * smoothing;
      pointer.energy += (1 - pointer.energy) * smoothing * .45;
    } else {
      pointer.smoothX = cssWidth / 2;
      pointer.smoothY = cssHeight / 2;
      pointer.energy = 0;
    }
    updatePointerStyle();
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (theme === 'yosemite') drawYosemite(now);
    if (theme === 'aurora') drawAurora(now);
    if (theme === 'cosmos') drawCosmos(now);
    if (theme === 'sunset') drawSunset(now);
    if (theme === 'glass') drawGlass(now);
    drawRipples(now);
    if (motion && !document.hidden) animationFrame = requestAnimationFrame(render);
  }

  function requestDraw() {
    if (!animationFrame) animationFrame = requestAnimationFrame(render);
  }

  function select(nextTheme) {
    if (!themes[nextTheme]) return;
    theme = nextTheme;
    wallpaper.dataset.wallpaper = theme;
    safeStorage.set('alex.wallpaper.theme', theme);
    requestDraw();
    document.dispatchEvent(new CustomEvent('wallpaperchange', { detail: { theme } }));
  }

  function setMotion(enabled, remember = true) {
    motion = Boolean(enabled);
    wallpaper.classList.toggle('motion-off', !motion);
    if (remember) safeStorage.set('alex.wallpaper.motion', motion ? 'on' : 'off');
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    requestDraw();
  }

  function mount(root, setStatus) {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const motionToggle = root.querySelector('[data-wallpaper-motion]');
    const sync = () => {
      root.querySelectorAll('[data-wallpaper-id]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wallpaperId === theme)));
      motionToggle.checked = motion;
      setStatus(`${themes[theme].title} · ${motion ? 'Interactive' : 'Still'}`);
    };
    root.addEventListener('click', event => {
      const choice = event.target.closest('[data-wallpaper-id]');
      if (!choice) return;
      select(choice.dataset.wallpaperId);
      sync();
    }, options);
    motionToggle.addEventListener('change', () => { setMotion(motionToggle.checked); sync(); }, options);
    document.addEventListener('wallpaperchange', sync, options);
    sync();
    return () => controller.abort();
  }

  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', event => {
    if (!motion) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.energy = Math.min(1.35, pointer.energy + .08);
  }, { passive: true });
  addEventListener('pointerdown', event => {
    if (!motion || event.button !== 0) return;
    ripples.push({ x: event.clientX, y: event.clientY, started: performance.now() });
    requestDraw();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });
  reduceMotion.addEventListener?.('change', event => { if (event.matches && safeStorage.get('alex.wallpaper.motion') === null) setMotion(false, false); });

  resize();
  select(theme);
  setMotion(motion, false);
  window.Wallpapers = { mount, select, setMotion };
})();
