(() => {
  function mount(root, setStatus) {
    const groups = window.PHOTO_GROUPS;
    const photos = groups.flatMap(group => group.photos.map(photo => ({ ...photo, group: group.title })));
    const library = root.querySelector('.photos-library');
    const toolbar = root.querySelector('.photos-toolbar');
    const viewer = root.querySelector('.photos-viewer');
    const image = viewer.querySelector('img');
    const slider = root.querySelector('input[type="range"]');
    const position = root.querySelector('.photos-position');
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const windowElement = root.closest('dialog');
    let view = 'moments';
    let selected = -1;
    let savedScroll = 0;
    let lastWidth = 0;
    let frame;
    let touchStart = null;
    const source = (photo, size) => `assets/photos/${photo.id}-${size}.webp`;

    function makeThumbnail(photo) {
      const button = document.createElement('button');
      button.className = 'photo-thumbnail';
      button.dataset.photoId = photo.id;
      button.setAttribute('aria-label', `Open photo: ${photo.alt}`);
      button.style.flexGrow = photo.width / photo.height;
      const thumbnail = document.createElement('img');
      thumbnail.src = source(photo, 'thumb');
      thumbnail.alt = photo.alt;
      thumbnail.width = photo.width;
      thumbnail.height = photo.height;
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.draggable = false;
      button.append(thumbnail);
      return button;
    }

    function renderLibrary() {
      if (selected >= 0) return;
      const focusedId = library.contains(document.activeElement) ? document.activeElement.dataset.photoId : null;
      const scroll = library.scrollTop;
      const style = getComputedStyle(library);
      const width = library.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (width <= 0) return;
      const target = width < 550 ? Math.min(115, width / 2.7) : Number(slider.value);
      const fragment = document.createDocumentFragment();
      const visibleGroups = view === 'moments' ? groups : [{ title: 'All Photos', photos }];
      for (const group of visibleGroups) {
        const section = document.createElement('section');
        section.className = 'photos-moment';
        section.setAttribute('aria-label', group.title);
        const header = document.createElement('div');
        header.className = 'photos-moment-header';
        const title = document.createElement('strong');
        title.textContent = group.title;
        const count = document.createElement('span');
        count.textContent = `${group.photos.length} photos`;
        header.append(title, count);
        const rows = document.createElement('div');
        rows.className = 'photos-rows';
        let row = [];
        let ratios = 0;
        function flush(last = false) {
          if (!row.length) return;
          const fitHeight = (width - (row.length - 1) * 4) / ratios;
          const height = last ? Math.min(target, fitHeight) : fitHeight;
          const rowElement = document.createElement('div');
          rowElement.className = 'photos-row';
          rowElement.style.height = `${height}px`;
          rowElement.style.width = `${Math.min(width, height * ratios + (row.length - 1) * 4)}px`;
          row.forEach(photo => rowElement.append(makeThumbnail(photo)));
          rows.append(rowElement);
          row = [];
          ratios = 0;
        }
        for (const photo of group.photos) {
          const ratio = photo.width / photo.height;
          const currentHeight = (width - (row.length - 1) * 4) / ratios;
          const nextHeight = (width - row.length * 4) / (ratios + ratio);
          if (row.length && nextHeight < target && Math.abs(currentHeight - target) < Math.abs(nextHeight - target)) flush();
          row.push(photo);
          ratios += ratio;
        }
        flush(true);
        section.append(header, rows);
        fragment.append(section);
      }
      library.replaceChildren(fragment);
      library.scrollTop = scroll;
      if (focusedId) library.querySelector(`[data-photo-id="${focusedId}"]`)?.focus({ preventScroll: true });
      setStatus(`${photos.length} Photos`);
    }

    function toggleViewer(show) {
      toolbar.classList.toggle('is-viewing', show);
      for (const selector of ['.photos-size', '.photos-view-control', '.photos-count']) root.querySelector(selector).hidden = show;
      for (const selector of ['.photos-back', '.photos-position', '.photos-navigation']) root.querySelector(selector).hidden = !show;
      library.hidden = show;
      viewer.hidden = !show;
    }

    function openPhoto(index) {
      if (index < 0 || index >= photos.length) return;
      if (selected < 0) savedScroll = library.scrollTop;
      selected = index;
      const photo = photos[index];
      toggleViewer(true);
      image.src = source(photo, 'large');
      image.width = photo.width;
      image.height = photo.height;
      image.alt = photo.alt;
      position.textContent = `${index + 1} of ${photos.length}`;
      root.querySelector('[data-photo-action="previous"]').disabled = index === 0;
      root.querySelector('[data-photo-action="next"]').disabled = index === photos.length - 1;
      setStatus(photo.group);
      viewer.focus({ preventScroll: true });
    }

    function back() {
      if (selected < 0) return;
      const id = photos[selected].id;
      selected = -1;
      toggleViewer(false);
      renderLibrary();
      library.scrollTop = savedScroll;
      library.querySelector(`[data-photo-id="${id}"]`)?.focus({ preventScroll: true });
    }

    root.addEventListener('click', event => {
      const thumbnail = event.target.closest('[data-photo-id]');
      if (thumbnail) openPhoto(photos.findIndex(photo => photo.id === thumbnail.dataset.photoId));
      const viewButton = event.target.closest('[data-photo-view]');
      if (viewButton) {
        view = viewButton.dataset.photoView;
        root.querySelectorAll('[data-photo-view]').forEach(button => button.setAttribute('aria-pressed', String(button === viewButton)));
        library.scrollTop = 0;
        renderLibrary();
      }
      const action = event.target.closest('[data-photo-action]')?.dataset.photoAction;
      if (action === 'back') back();
      if (action === 'previous') openPhoto(selected - 1);
      if (action === 'next') openPhoto(selected + 1);
    }, options);
    slider.addEventListener('input', renderLibrary, options);
    root.addEventListener('keydown', event => {
      if (selected < 0 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      openPhoto(selected + (event.key === 'ArrowRight' ? 1 : -1));
    }, options);
    windowElement.addEventListener('cancel', event => {
      if (selected >= 0) { event.preventDefault(); back(); }
    }, options);
    viewer.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      touchStart = { x: event.clientX, y: event.clientY };
      viewer.setPointerCapture(event.pointerId);
    }, options);
    viewer.addEventListener('pointerup', event => {
      if (!touchStart) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) openPhoto(selected + (dx < 0 ? 1 : -1));
    }, options);
    viewer.addEventListener('pointercancel', () => { touchStart = null; }, options);
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width === lastWidth) return;
      lastWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(renderLibrary);
    });
    observer.observe(library);
    root.querySelector('.photos-count').textContent = `${photos.length} Photos`;
    renderLibrary();
    return () => { abort.abort(); observer.disconnect(); cancelAnimationFrame(frame); };
  }
  window.Photos = { mount };
})();
