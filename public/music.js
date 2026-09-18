(() => {
  const time = seconds => {
    const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };

  function mount(root, setStatus) {
    const tracks = window.MUSIC_TRACKS;
    const audio = root.querySelector('audio');
    const seek = root.querySelector('.music-seek');
    const volume = root.querySelector('.music-volume');
    const title = root.querySelector('.music-now-title');
    const art = root.querySelector('.music-now-art');
    const subtitle = root.querySelector('.music-now-subtitle');
    const elapsed = root.querySelector('.music-elapsed');
    const duration = root.querySelector('.music-duration');
    const message = root.querySelector('.music-message');
    const playButton = root.querySelector('[data-music-action="play"]');
    const muteButton = root.querySelector('[data-music-action="mute"]');
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let selected = 0;
    let shuffle = false;
    let loading = false;
    let disposed = false;
    let playRequest = 0;

    const rows = tracks.map((track, index) => {
      const row = document.createElement('tr');
      row.dataset.trackIndex = index;
      const number = document.createElement('td');
      number.className = 'music-track-number';
      const trigger = document.createElement('button');
      trigger.className = 'music-row-play';
      trigger.dataset.musicTrack = index;
      trigger.innerHTML = `<span class="music-track-index">${index + 1}</span><span class="music-track-play" aria-hidden="true">▶</span><span class="music-track-pause" aria-hidden="true">Ⅱ</span>`;
      number.append(trigger);
      const name = document.createElement('td');
      const song = document.createElement('button');
      song.className = 'music-song-name';
      song.dataset.musicTrack = index;
      const cover = document.createElement('img');
      cover.src = track.artwork;
      cover.alt = '';
      cover.width = 38;
      cover.height = 38;
      cover.draggable = false;
      const label = document.createElement('span');
      label.textContent = track.title;
      song.append(cover, label);
      name.append(song);
      const length = document.createElement('td');
      length.className = 'music-track-duration';
      length.textContent = time(track.duration);
      length.title = 'Full song length';
      const store = document.createElement('td');
      store.className = 'music-track-store';
      const link = document.createElement('a');
      link.href = track.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '↗';
      link.title = `Listen to ${track.title} on Apple Music`;
      link.setAttribute('aria-label', link.title);
      store.append(link);
      row.append(number, name, length, store);
      return row;
    });
    root.querySelector('tbody').append(...rows);

    function updateProgress() {
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      elapsed.textContent = time(audio.currentTime);
      duration.textContent = time(total);
      seek.disabled = !total || !!audio.error;
      seek.max = total || 100;
      seek.value = Math.min(total, audio.currentTime) || 0;
      seek.setAttribute('aria-valuetext', `${time(audio.currentTime)} of ${time(total)}`);
      seek.style.setProperty('--range-progress', `${total ? audio.currentTime / total * 100 : 0}%`);
    }

    function updateControls() {
      const playing = !audio.paused && !audio.ended;
      root.classList.toggle('is-playing', playing);
      root.classList.toggle('is-loading', loading);
      playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      playButton.title = playing ? 'Pause' : 'Play';
      playButton.querySelector('.music-play-icon').toggleAttribute('hidden', playing);
      playButton.querySelector('.music-pause-icon').toggleAttribute('hidden', !playing);
      subtitle.textContent = loading ? 'Loading preview…' : 'Preview';
      rows.forEach((row, index) => {
        const active = index === selected;
        row.classList.toggle('is-current', active);
        row.classList.toggle('is-playing', active && playing);
        for (const button of row.querySelectorAll('[data-music-track]')) {
          button.setAttribute('aria-label', `${active && playing ? 'Pause' : 'Play preview of'} ${tracks[index].title}`);
          if (active) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
        }
      });
      setStatus(loading ? 'Loading preview…' : playing ? `Playing · ${tracks[selected].title} · Preview` : `${tracks.length} Songs`);
    }

    function showError(text) {
      loading = false;
      message.querySelector('span').textContent = text;
      message.hidden = false;
      updateControls();
    }

    function select(index) {
      playRequest++;
      audio.pause();
      selected = index;
      loading = false;
      const track = tracks[selected];
      audio.src = track.src;
      title.textContent = track.title;
      art.src = track.artwork;
      message.hidden = true;
      updateProgress();
      updateControls();
    }

    async function play() {
      const request = ++playRequest;
      message.hidden = true;
      loading = true;
      updateControls();
      if (audio.error) audio.load();
      if (audio.ended) audio.currentTime = 0;
      try {
        await audio.play();
        if (disposed || request !== playRequest) return;
        loading = false;
        updateControls();
      } catch (error) {
        if (disposed || request !== playRequest || error.name === 'AbortError') return;
        showError(error.name === 'NotAllowedError' ? 'Press Play to start the preview.' : 'This preview could not be played. Try again or listen on Apple Music.');
      }
    }

    function pause() {
      playRequest++;
      loading = false;
      audio.pause();
      updateControls();
    }

    function toggle() {
      if (!audio.paused || loading) pause();
      else play();
    }

    function nextIndex(direction) {
      if (shuffle && tracks.length > 1) return (selected + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length;
      return (selected + direction + tracks.length) % tracks.length;
    }

    function updateVolume() {
      const muted = audio.muted || audio.volume === 0;
      const value = muted ? 0 : audio.volume;
      volume.value = value;
      volume.style.setProperty('--range-progress', `${value * 100}%`);
      muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      muteButton.title = muted ? 'Unmute' : 'Mute';
      muteButton.querySelector('.music-volume-waves').toggleAttribute('hidden', muted);
      muteButton.querySelector('.music-volume-muted').toggleAttribute('hidden', !muted);
    }

    root.addEventListener('click', event => {
      const song = event.target.closest('[data-music-track]');
      if (song) {
        const index = Number(song.dataset.musicTrack);
        if (selected === index) toggle();
        else { select(index); play(); }
        return;
      }
      const action = event.target.closest('[data-music-action]')?.dataset.musicAction;
      if (action === 'play') toggle();
      if (action === 'retry') play();
      if (action === 'next') { select(nextIndex(1)); play(); }
      if (action === 'previous') {
        if (audio.currentTime > 3) { audio.currentTime = 0; updateProgress(); }
        else { select(nextIndex(-1)); play(); }
      }
      if (action === 'shuffle' || action === 'repeat') {
        const enabled = action === 'shuffle' ? !shuffle : !audio.loop;
        // These are alternative modes; both off restores list order.
        shuffle = action === 'shuffle' && enabled;
        audio.loop = action === 'repeat' && enabled;
        root.querySelector('[data-music-action="shuffle"]').setAttribute('aria-pressed', String(shuffle));
        root.querySelector('[data-music-action="repeat"]').setAttribute('aria-pressed', String(audio.loop));
      }
      if (action === 'mute') {
        if (audio.volume === 0) { audio.volume = 0.7; audio.muted = false; }
        else audio.muted = !audio.muted;
        updateVolume();
      }
    }, options);
    seek.addEventListener('input', () => {
      if (!seek.disabled) { audio.currentTime = Number(seek.value); updateProgress(); }
    }, options);
    volume.addEventListener('input', () => {
      audio.volume = Number(volume.value);
      audio.muted = false;
      updateVolume();
    }, options);
    root.addEventListener('keydown', event => {
      if (event.code === 'Space' && !event.target.closest('button, input, a')) {
        event.preventDefault();
        toggle();
      }
    }, options);
    for (const name of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) audio.addEventListener(name, updateProgress, options);
    for (const name of ['play', 'pause']) audio.addEventListener(name, updateControls, options);
    audio.addEventListener('volumechange', updateVolume, options);
    audio.addEventListener('waiting', () => { loading = !audio.paused; updateControls(); }, options);
    audio.addEventListener('playing', () => { loading = false; message.hidden = true; updateControls(); }, options);
    audio.addEventListener('error', () => showError('This preview is unavailable. Try again or listen on Apple Music.'), options);
    audio.addEventListener('ended', () => {
      loading = false;
      if (shuffle || selected < tracks.length - 1) { select(nextIndex(1)); play(); }
      else updateControls();
    }, options);
    window.addEventListener('pagehide', pause, options);
    audio.volume = Number(volume.value);
    select(0);
    updateVolume();
    return () => {
      disposed = true;
      playRequest++;
      controller.abort();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }
  window.Music = { mount };
})();
