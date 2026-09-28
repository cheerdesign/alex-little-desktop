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
    galaxy: { title: 'Flowing Galaxy' }
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} }
  };

  const savedTheme = safeStorage.get('alex.wallpaper.theme');
  let theme = savedTheme === 'glass' ? 'galaxy' : themes[savedTheme] ? savedTheme : 'yosemite';
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
  const galaxyDust = Array.from({ length: 420 }, () => ({
    position: Math.random() * 1.24,
    offset: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5,
    size: .35 + Math.random() * 2.25,
    speed: .55 + Math.random() * .75,
    phase: Math.random() * Math.PI * 2,
    depth: .2 + Math.random() * .95,
    warmth: Math.random()
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

  function drawGalaxy(time) {
    const flow = time * .000009;
    const phase = time * .00004;
    const pointerX = pointer.smoothX / Math.max(1, cssWidth) - .5;
    const pointerY = pointer.smoothY / Math.max(1, cssHeight) - .5;
    const centerX = cssWidth * .54 - pointerX * 34;
    const centerY = cssHeight * .5 - pointerY * 26;
    const bandWidth = Math.max(150, cssHeight * .32);

    context.save();
    context.translate(centerX, centerY);
    context.rotate(-.2 + Math.sin(phase * .45) * .018);
    context.scale(1, .36);
    const core = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(260, cssWidth * .28));
    core.addColorStop(0, 'rgba(255,246,220,.35)');
    core.addColorStop(.13, 'rgba(179,202,255,.26)');
    core.addColorStop(.4, 'rgba(124,91,221,.16)');
    core.addColorStop(1, 'rgba(25,21,82,0)');
    context.fillStyle = core;
    context.beginPath();
    context.arc(0, 0, Math.max(260, cssWidth * .28), 0, Math.PI * 2);
    context.fill();
    context.restore();

    const ribbons = [
      ['rgba(93,116,255,.10)', 155, 0],
      ['rgba(164,95,255,.12)', 108, 1.8],
      ['rgba(105,211,255,.09)', 72, 3.6],
      ['rgba(255,214,180,.075)', 38, 5.1]
    ];
    for (const [color, width, offset] of ribbons) {
      context.beginPath();
      for (let x = -120; x <= cssWidth + 120; x += 28) {
        const diagonal = (x - cssWidth / 2) * -.19;
        const wave = Math.sin(x * .0045 + phase + offset) * (31 + width * .08) + Math.sin(x * .009 - phase * .63 + offset) * 12;
        const y = centerY + diagonal + wave;
        if (x === -120) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = color;
      context.lineWidth = width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.shadowBlur = 34;
      context.shadowColor = color;
      context.stroke();
    }
    context.shadowBlur = 0;

    for (const star of motes) {
      const x = (star.x * cssWidth - pointerX * 24 * star.depth + cssWidth) % cssWidth;
      const y = (star.y * cssHeight - pointerY * 18 * star.depth + cssHeight) % cssHeight;
      const twinkle = .12 + (Math.sin(time * .00075 * star.speed + star.phase) + 1) * .13;
      context.beginPath();
      context.fillStyle = `rgba(215,226,255,${twinkle})`;
      context.arc(x, y, star.size * .65, 0, Math.PI * 2);
      context.fill();
    }

    for (const dust of galaxyDust) {
      const position = (dust.position + flow * dust.speed) % 1.24;
      let x = (position - .12) * cssWidth;
      const diagonal = (x - cssWidth / 2) * -.19;
      const centerWave = Math.sin(x * .0045 + phase + dust.phase * .08) * 34 + Math.sin(x * .009 - phase * .63 + dust.phase) * 12;
      let y = centerY + diagonal + centerWave + dust.offset * bandWidth;
      x -= pointerX * 36 * dust.depth;
      y -= pointerY * 26 * dust.depth;
      const dx = x - pointer.smoothX;
      const dy = y - pointer.smoothY;
      const distance = Math.hypot(dx, dy);
      if (distance < 145 && distance > 0) {
        const push = (145 - distance) / 145 * 16 * pointer.energy * dust.depth;
        x += dx / distance * push;
        y += dy / distance * push;
      }
      const density = Math.max(.12, 1 - Math.abs(dust.offset));
      const twinkle = .55 + Math.sin(time * .0011 * dust.speed + dust.phase) * .3;
      const alpha = Math.min(.92, (.12 + density * .62) * twinkle);
      const color = dust.warmth > .82 ? '255,226,194' : dust.warmth > .45 ? '202,219,255' : '180,167,255';
      context.beginPath();
      context.fillStyle = `rgba(${color},${alpha})`;
      context.arc(x, y, dust.size * (.55 + dust.depth * .55), 0, Math.PI * 2);
      context.fill();
      if (dust.size > 2.1 && density > .55) {
        context.beginPath();
        context.strokeStyle = `rgba(${color},${alpha * .25})`;
        context.lineWidth = .8;
        context.moveTo(x - 5 * dust.depth, y + 1.2);
        context.lineTo(x + 5 * dust.depth, y - 1.2);
        context.stroke();
      }
    }

    const cursorGlow = context.createRadialGradient(pointer.smoothX, pointer.smoothY, 0, pointer.smoothX, pointer.smoothY, 170);
    cursorGlow.addColorStop(0, `rgba(157,179,255,${.1 * pointer.energy})`);
    cursorGlow.addColorStop(1, 'rgba(111,88,225,0)');
    context.fillStyle = cursorGlow;
    context.fillRect(0, 0, cssWidth, cssHeight);
    context.shadowBlur = 0;
  }

  function drawRipples(now) {
    for (let index = ripples.length - 1; index >= 0; index--) {
      const ripple = ripples[index];
      const age = (now - ripple.started) / 900;
      if (age >= 1) { ripples.splice(index, 1); continue; }
      context.beginPath();
      context.arc(ripple.x, ripple.y, 18 + age * 92, 0, Math.PI * 2);
      context.strokeStyle = `rgba(255,255,255,${(1 - age) * .42})`;
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
    if (theme === 'galaxy') drawGalaxy(now);
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
