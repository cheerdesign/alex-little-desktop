(() => {
  const movies = window.SAMPLE_MOVIES;
  const artwork = movie => `assets/movies/${movie.id}.svg`;
  const make = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const clock = seconds => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;

  function mount(root, setStatus) {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const library = root.querySelector('.movies-library');
    const main = root.querySelector('.movies-main');
    const detail = root.querySelector('.movies-detail');
    const search = root.querySelector('.movies-search input');
    const grid = root.querySelector('.movies-grid');
    const stage = root.querySelector('.movies-stage');
    const stageArt = root.querySelector('.movies-stage-art');
    const seek = root.querySelector('.movies-seek');
    const elapsedLabel = root.querySelector('.movies-elapsed');
    let selected = null;
    let playing = false;
    let elapsed = 0;
    let frame = 0;
    let lastTime = 0;
    let libraryScroll = 0;

    function thumbnail(movie) {
      const wrap = make('span', 'movies-thumb');
      const img = make('img');
      img.src = artwork(movie);
      img.alt = '';
      img.width = 640;
      img.height = 360;
      img.loading = 'lazy';
      img.draggable = false;
      wrap.append(img);
      wrap.append(make('span', 'movies-thumb-play', '▶'), make('span', 'movies-thumb-duration', movie.runtime));
      return wrap;
    }

    function card(movie) {
      const button = make('button', 'movies-card');
      button.type = 'button';
      button.dataset.movieId = movie.id;
      button.setAttribute('aria-label', `Open ${movie.title} movie preview`);
      const copy = make('span', 'movies-card-copy');
      copy.append(make('strong', '', movie.title), make('small', '', `${movie.genre} · ${movie.year}`));
      button.append(thumbnail(movie), copy);
      return button;
    }

    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const visible = movies.filter(movie =>
        `${movie.title} ${movie.director} ${movie.genre} ${movie.summary}`.toLocaleLowerCase().includes(query)
      );
      grid.replaceChildren(...visible.map(card));
      root.querySelector('.movies-empty').hidden = visible.length > 0;
      setStatus(visible.length === movies.length ? `${movies.length} Movies` : `${visible.length} of ${movies.length} Movies`);
    }

    function updatePlayer() {
      const duration = selected?.preview || 20;
      const fraction = Math.min(1, elapsed / duration);
      elapsedLabel.textContent = clock(elapsed);
      seek.value = String(elapsed);
      seek.style.setProperty('--seek-progress', `${fraction * 100}%`);
      stageArt.style.transform = `scale(${1.03 + fraction * 0.13}) translateX(${-fraction * 2.5}%)`;
      stage.classList.toggle('is-playing', playing);
      stage.classList.toggle('is-finished', elapsed >= duration);
      root.querySelectorAll('[data-movie-action="play"]').forEach(button => {
        button.setAttribute('aria-label', playing ? 'Pause preview' : elapsed >= duration ? 'Replay preview' : 'Play preview');
      });
      root.querySelector('.movies-play-glyph').textContent = playing ? 'Ⅱ' : '▶';
      root.querySelector('.movies-stage-play span').textContent = elapsed >= duration ? '↺' : '▶';
    }

    function pause() {
      playing = false;
      lastTime = 0;
      cancelAnimationFrame(frame);
      updatePlayer();
    }

    function tick(now) {
      if (!playing || !selected) return;
      if (lastTime) elapsed = Math.min(selected.preview, elapsed + (now - lastTime) / 1000);
      lastTime = now;
      if (elapsed >= selected.preview) { pause(); return; }
      updatePlayer();
      frame = requestAnimationFrame(tick);
    }

    function togglePlay() {
      if (!selected) return;
      if (playing) { pause(); return; }
      if (elapsed >= selected.preview) elapsed = 0;
      playing = true;
      lastTime = 0;
      updatePlayer();
      frame = requestAnimationFrame(tick);
    }

    function openMovie(id) {
      const movie = movies.find(item => item.id === id);
      if (!movie) return;
      pause();
      selected = movie;
      elapsed = 0;
      libraryScroll = main.scrollTop;
      library.hidden = true;
      detail.hidden = false;
      stageArt.src = artwork(movie);
      stageArt.alt = `${movie.title} illustrated scene`;
      root.querySelector('.movies-stage-copy strong').textContent = movie.title;
      root.querySelector('.movies-film-info h3').textContent = movie.title;
      root.querySelector('.movies-film-meta').textContent = `${movie.director} · ${movie.year} · ${movie.genre} · ${movie.runtime}`;
      root.querySelector('.movies-film-description').textContent = movie.summary;
      root.querySelector('.movies-duration').textContent = clock(movie.preview);
      seek.max = String(movie.preview);
      detail.scrollTop = 0;
      updatePlayer();
      setStatus(`${movie.title} · Motion preview`);
      root.querySelector('.movies-back').focus({ preventScroll: true });
    }

    function back() {
      if (!selected) return;
      const oldId = selected.id;
      pause();
      selected = null;
      detail.hidden = true;
      library.hidden = false;
      render();
      main.scrollTop = libraryScroll;
      root.querySelector(`.movies-card[data-movie-id="${oldId}"]`)?.focus({ preventScroll: true });
    }

    render();
    root.addEventListener('click', event => {
      const movie = event.target.closest('[data-movie-id]');
      if (movie) { openMovie(movie.dataset.movieId); return; }
      const action = event.target.closest('[data-movie-action]')?.dataset.movieAction;
      if (action === 'back') back();
      if (action === 'play') togglePlay();
    }, options);
    root.querySelector('.movies-search').addEventListener('submit', event => { event.preventDefault(); render(); main.scrollTop = 0; }, options);
    search.addEventListener('input', () => { render(); main.scrollTop = 0; }, options);
    seek.addEventListener('input', () => { elapsed = Number(seek.value); lastTime = performance.now(); updatePlayer(); }, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, options);
    root.closest('dialog').addEventListener('cancel', event => { if (selected) { event.preventDefault(); back(); } }, options);
    return () => { pause(); controller.abort(); };
  }

  window.Movies = { mount };
})();
