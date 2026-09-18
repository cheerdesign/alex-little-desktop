(() => {
  function mount(root, setStatus) {
    const books = window.SAMPLE_BOOKS;
    const library = root.querySelector('.books-library');
    const grid = root.querySelector('.books-grid');
    const detail = root.querySelector('.books-detail');
    const search = root.querySelector('input[type="search"]');
    const sort = root.querySelector('select');
    const controller = new AbortController();
    const options = { signal: controller.signal };
    let selected = null;
    let scrollPosition = 0;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      node.className = className;
      if (text) node.textContent = text;
      return node;
    }
    function cover(book) {
      const img = element('img', 'book-cover');
      img.src = `assets/books/${book.id}.webp`;
      img.alt = `${book.title} cover`;
      img.width = book.width;
      img.height = book.height;
      img.draggable = false;
      return img;
    }
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = books.filter(book => `${book.title} ${book.author}`.toLocaleLowerCase().includes(query));
      if (sort.value !== 'shelf') filtered.sort((a, b) => a[sort.value].localeCompare(b[sort.value]));
      const fragment = document.createDocumentFragment();
      for (const book of filtered) {
        const button = element('button', 'book-item');
        button.dataset.bookId = book.id;
        button.setAttribute('aria-label', `${book.title} by ${book.author}`);
        const wrap = element('span', 'book-cover-wrap');
        const img = cover(book);
        img.loading = 'lazy';
        wrap.append(img);
        const caption = element('span', 'book-caption');
        caption.append(element('span', 'book-title', book.title), element('span', 'book-author', book.author));
        button.append(wrap, caption, element('span', 'book-category', book.category));
        fragment.append(button);
      }
      grid.replaceChildren(fragment);
      root.querySelector('.books-empty').hidden = filtered.length > 0;
      setStatus(query ? `${filtered.length} of ${books.length} Books` : `${books.length} Books`);
    }
    function setDetail(show) {
      library.hidden = show;
      detail.hidden = !show;
      for (const selector of ['.books-library-label', '.books-view-control', '.books-search']) root.querySelector(selector).hidden = show;
      root.querySelector('.books-back').hidden = !show;
      root.querySelector('.books-detail-heading').hidden = !show;
    }
    function openBook(id) {
      const book = books.find(item => item.id === id);
      if (!book) return;
      selected = id;
      scrollPosition = library.scrollTop;
      const layout = element('div', 'book-detail-layout');
      const info = element('div', 'book-detail-info');
      info.append(element('h3', '', book.title), element('p', 'book-detail-author', book.author), element('span', 'book-detail-category', book.category));
      const note = element('div', 'book-detail-note');
      note.append(element('strong', '', 'From Alex’s shelf'), element('p', '', book.note));
      info.append(note);
      layout.append(cover(book), info);
      detail.replaceChildren(layout);
      setDetail(true);
      detail.scrollTop = 0;
      detail.focus({ preventScroll: true });
      setStatus('Sample book');
    }
    function back() {
      const id = selected;
      selected = null;
      setDetail(false);
      render();
      library.scrollTop = scrollPosition;
      grid.querySelector(`[data-book-id="${id}"]`)?.focus({ preventScroll: true });
    }
    root.addEventListener('click', event => {
      const book = event.target.closest('[data-book-id]');
      if (book) openBook(book.dataset.bookId);
      const view = event.target.closest('[data-books-view]');
      if (view) {
        grid.classList.toggle('is-list', view.dataset.booksView === 'list');
        root.querySelectorAll('[data-books-view]').forEach(button => button.setAttribute('aria-pressed', String(view === button)));
        library.scrollTop = 0;
      }
      if (event.target.closest('[data-books-action="back"]')) back();
    }, options);
    search.addEventListener('input', () => { library.scrollTop = 0; render(); }, options);
    sort.addEventListener('change', () => { library.scrollTop = 0; render(); }, options);
    root.closest('dialog').addEventListener('cancel', event => {
      if (selected) { event.preventDefault(); back(); }
    }, options);
    render();
    return () => controller.abort();
  }
  window.Books = { mount };
})();
