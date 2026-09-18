(() => {
  const DRAFT_KEY = 'alex.notes.drafts.v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const authorLabel = note => (note.authorName || 'Visitor') + (note.canEdit ? ' (You)' : '');
  const colors = ['#333333', '#2875c7', '#c94f45', '#b28723'];
  const hasContent = note => !!(note.title.trim() || note.body.trim() || note.drawing.some(stroke => stroke.tool === 'pen' && stroke.points?.length));
  const pen = points => ({ tool: 'pen', color: '#333333', width: 4, points });
  // A sample made of editable drawing strokes, using the same format as visitor sketches.
  function welcomeDrawing() {
    const circle = Array.from({ length: 91 }, (_, i) => {
      const angle = i / 90 * Math.PI * 2;
      return [460 + Math.cos(angle) * (163 + Math.sin(i * 1.8) * 1.4), 245 + Math.sin(angle) * (151 + Math.cos(i * 1.3) * 1.7)];
    });
    const smile = Array.from({ length: 31 }, (_, i) => {
      const angle = .16 + i / 30 * (Math.PI - .32);
      return [461 + Math.cos(angle) * 93, 269 + Math.sin(angle) * 54 + Math.sin(i)];
    });
    return [pen(circle), pen([[401,199],[400,208],[401,220],[403,226]]), pen([[515,197],[516,206],[515,217],[516,223]]), pen(smile)];
  }
  function sampleNote() {
    return { id: 'welcome', title: 'Welcome!', body: 'Thanks for stopping by.\n\nLeave a message, say hello, or draw something that makes you smile.', authorName: 'Alex', drawing: welcomeDrawing(), createdAt: Date.UTC(2026,8,16,12), updatedAt: Date.UTC(2026,8,16,12), canEdit: false, sample: true };
  }

  function mount(root, setStatus) {
    const controller = new AbortController();
    const signal = controller.signal;
    const list = root.querySelector('.notes-list');
    const title = root.querySelector('.note-title');
    const body = root.querySelector('.note-body');
    const author = root.querySelector('.note-author');
    const authorSeparator = root.querySelector('.note-author-separator');
    const date = root.querySelector('.note-date');
    const canvas = root.querySelector('.note-canvas');
    const ctx = canvas.getContext('2d');
    const sketch = root.querySelector('.notes-sketch');
    const controls = root.querySelector('.drawing-controls');
    const post = root.querySelector('[data-note-action="post"]');
    const drawButton = root.querySelector('[data-note-action="draw"]');
    const editButton = root.querySelector('[data-note-action="edit"]');
    const deleteButton = root.querySelector('[data-note-action="delete"]');
    const message = root.querySelector('.notes-message');
    const records = new Map([['welcome', sampleNote()]]);
    const redo = new Map();
    let selected = 'welcome', editing = false, deleting = false, drawing = false, tool = 'pen', color = colors[0];
    let cursor = null, loadedMore = false, loading = false, posting = false, activeStroke = null, pointer = null;
    let retry = null, refreshTimer = null, selectionRequest = 0, listVersion = 0, storageFailed = false;
    let messageTimer = null, messageNoteId = null;
    const note = () => records.get(selected);

    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
      if (Array.isArray(drafts)) for (const draft of drafts) {
        if (typeof draft.id === 'string' && typeof draft.title === 'string' && typeof draft.body === 'string' && Array.isArray(draft.drawing) && (!draft.isNew || hasContent(draft))) records.set(draft.id, { ...draft, canEdit: true, dirty: true });
      }
    } catch { /* A missing or invalid temporary draft must not block the shared guestbook. */ }

    function showMessage(text, action = null, actionLabel = 'Retry', { noteId = null, duration = 0 } = {}) {
      if (signal.aborted || (noteId !== null && noteId !== selected)) return;
      clearTimeout(messageTimer);
      messageTimer = null;
      messageNoteId = noteId;
      message.hidden = !text;
      message.querySelector('span').textContent = text;
      message.querySelector('button').hidden = !action;
      message.querySelector('button').textContent = actionLabel;
      retry = action;
      if (text && duration) messageTimer = setTimeout(() => showMessage(''), duration);
    }
    function saveDrafts() {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify([...records.values()].filter(n => n.dirty && n.canEdit && !n.sample && (!n.isNew || hasContent(n)))));
      } catch {
        if (!storageFailed) showMessage('Your browser cannot keep a draft after closing this page. Post your note to save it.');
        storageFailed = true;
      }
    }
    async function api(path, options = {}) {
      const response = await fetch('/api/notes' + path, { ...options, signal, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...options.headers } });
      const data = await response.json();
      if (!response.ok) { const error = new Error(data.error || 'The guestbook is unavailable. Please try again.'); error.status = response.status; throw error; }
      return data;
    }
    function renderList() {
      // Welcome stays ahead of every draft and published note, including after refresh.
      const entries = [...records.values()].sort((a,b) => Number(b.id === 'welcome') - Number(a.id === 'welcome') || Number(!!b.isNew) - Number(!!a.isNew) || b.createdAt - a.createdAt);
      const fragment = document.createDocumentFragment();
      for (const item of entries) {
        const button = document.createElement('button');
        button.className = 'note-list-item';
        button.dataset.noteId = item.id;
        button.setAttribute('aria-current', String(item.id === selected));
        const label = document.createElement('strong');
        label.textContent = item.title || 'New note';
        if (item.id === 'welcome') {
          button.classList.add('is-pinned');
          const pin = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          pin.setAttribute('class', 'note-pin');
          pin.setAttribute('viewBox', '0 0 16 16');
          pin.setAttribute('role', 'img');
          pin.setAttribute('aria-label', 'Pinned note');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M5 2h6M6 2v4L4 9v1h8V9l-2-3V2M8 10v4');
          pin.append(path);
          label.prepend(pin);
        }
        const meta = document.createElement('small');
        meta.textContent = item.sample ? 'Sample note' : item.dirty ? (item.isNew ? 'Draft · Not posted' : 'Unsaved changes') : new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + authorLabel(item);
        meta.title = meta.textContent;
        const snippet = document.createElement('small');
        snippet.className = 'note-snippet';
        snippet.textContent = (item.body ?? item.snippet ?? '').replace(/\s+/g, ' ').trim() || (item.hasDrawing || item.drawing?.length ? 'Drawing' : 'Start writing…');
        button.append(label, meta, snippet);
        fragment.append(button);
      }
      if (cursor) {
        const more = document.createElement('button');
        more.className = 'notes-load-more'; more.dataset.noteAction = 'more'; more.textContent = 'More notes'; more.disabled = loading;
        fragment.append(more);
      }
      list.replaceChildren(fragment);
    }
    function fitBody() {
      body.style.height = 'auto';
      body.style.height = Math.max(112, body.scrollHeight) + 'px';
    }
    function drawStroke(stroke) {
      const points = stroke.points;
      if (!points.length) return;
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (points.length === 1) { ctx.arc(points[0][0], points[0][1], stroke.width / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.moveTo(...points[0]);
      for (let i = 1; i < points.length - 1; i++) ctx.quadraticCurveTo(...points[i], (points[i][0] + points[i+1][0]) / 2, (points[i][1] + points[i+1][1]) / 2);
      ctx.lineTo(...points.at(-1)); ctx.stroke();
    }
    function paint() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of note().drawing || []) drawStroke(stroke);
      if (activeStroke) drawStroke(activeStroke);
      ctx.globalCompositeOperation = 'source-over';
    }
    function updateControls() {
      const current = note();
      const inEditor = !!current.canEdit && (current.isNew || editing);
      const editable = inEditor && !posting && !deleting;
      title.readOnly = body.readOnly = !editable;
      title.placeholder = inEditor ? 'New note' : '';
      body.placeholder = inEditor ? 'Start writing…' : '';
      author.textContent = current.authorName ? authorLabel(current) : '';
      authorSeparator.hidden = !current.authorName;
      date.dateTime = new Date(current.updatedAt).toISOString();
      date.textContent = new Date(current.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      post.hidden = !inEditor;
      post.textContent = posting ? (current.isNew ? 'Posting…' : 'Saving…') : current.isNew ? 'Post note' : 'Save changes';
      post.disabled = posting || deleting || !current.dirty || !hasContent(current);
      editButton.hidden = deleteButton.hidden = !current.canEdit || !!current.isNew || inEditor;
      editButton.disabled = deleteButton.disabled = posting || deleting;
      deleteButton.textContent = deleting ? 'Deleting…' : 'Delete';
      drawButton.hidden = !inEditor;
      drawButton.disabled = !editable;
      drawButton.title = editable ? 'Show or hide drawing tools' : 'Create a new note to add your drawing';
      drawButton.setAttribute('aria-pressed', String(drawing && editable));
      controls.hidden = !drawing || !editable;
      sketch.classList.toggle('is-drawing', drawing && editable);
      sketch.classList.toggle('is-erasing', tool === 'eraser');
      canvas.hidden = !drawing && !current.drawing?.length;
      root.querySelector('.drawing-hint').hidden = !drawing || !editable;
      root.querySelector('[data-note-action="undo"]').disabled = !editable || !current.drawing?.length;
      root.querySelector('[data-note-action="redo"]').disabled = !editable || !redo.get(selected)?.length;
      root.querySelectorAll('[data-note-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.noteTool === tool)));
      root.querySelectorAll('[data-note-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.noteColor === color)));
      setStatus(current.sample ? 'Sample note · New notes are shared with all visitors' : current.dirty ? (current.isNew ? 'Draft · Click Post note to share' : editing ? 'Unsaved changes · Click Save changes' : 'Unsaved changes · Click Edit to continue') : current.canEdit ? (editing ? 'Editing · Save changes when you are ready' : 'Posted · Click Edit to make changes') : 'A note from a visitor');
    }
    function leaveNote() {
      showMessage('');
      finishStroke(); editing = false; drawing = false;
      if (note()?.isNew && !hasContent(note())) {
        records.delete(selected); redo.delete(selected); selected = 'welcome';
      }
      saveDrafts();
    }
    function renderEditor() {
      const current = note();
      if (messageNoteId !== null && messageNoteId !== selected) showMessage('');
      title.value = current.title; body.value = current.body || '';
      fitBody(); paint(); updateControls();
    }
    async function selectNote(id) {
      if (id !== selected) leaveNote();
      const request = ++selectionRequest;
      const current = records.get(id);
      if (!current) return;
      try {
        if (!current.sample && !current.dirty) {
          setStatus('Loading note…');
          const data = await api('/' + id);
          if (request !== selectionRequest) return;
          records.set(id, data.note);
        }
        selected = id; editing = !!current.isNew; drawing = false; showMessage('');
        root.classList.add('is-editor');
        renderList(); renderEditor();
        root.querySelector('.notes-paper').scrollTop = 0;
      } catch (error) {
        if (!signal.aborted) {
          if (error.status === 404) { records.delete(id); if (selected === id) selected = 'welcome'; }
          renderList(); renderEditor();
          showMessage(error.message, error.status === 404 ? null : () => selectNote(id));
        }
      }
    }
    async function refresh(more = false) {
      if (loading) return;
      loading = true;
      const version = listVersion;
      try {
        const data = await api(more && cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
        if (version !== listVersion) return;
        const seen = new Set(data.notes.map(item => item.id));
        const boundary = data.notes.at(-1);
        if (!more) for (const [id, old] of records) {
          const withinPage = !data.cursor || (boundary && (old.createdAt > boundary.createdAt || (old.createdAt === boundary.createdAt && id >= boundary.id)));
          if (!old.sample && !old.isNew && !old.dirty && withinPage && !seen.has(id)) {
            records.delete(id); redo.delete(id);
            if (selected === id) { selected = 'welcome'; editing = drawing = false; renderEditor(); }
          }
        }
        for (const item of data.notes) {
          const old = records.get(item.id);
          if (!old?.dirty && !(selected === item.id && editing)) records.set(item.id, { ...old, ...item });
        }
        if (more || !loadedMore) cursor = data.cursor;
        if (more) loadedMore = true;
      } catch (error) { if (!signal.aborted) showMessage('Could not load shared notes. You can still write a draft.', () => refresh(more)); }
      finally { loading = false; if (!signal.aborted) renderList(); }
    }
    function changed() {
      note().dirty = true; note().updatedAt = Date.now();
      saveDrafts(); renderList(); updateControls();
    }
    function newNote() {
      leaveNote(); ++selectionRequest;
      const now = Date.now();
      const draft = { id: crypto.randomUUID(), title: '', body: '', drawing: [], createdAt: now, updatedAt: now, canEdit: true, isNew: true, dirty: true };
      records.set(draft.id, draft); selected = draft.id; editing = true; drawing = false;
      root.classList.add('is-editor'); showMessage('');
      saveDrafts(); renderList(); renderEditor(); title.focus();
    }
    async function publish() {
      finishStroke();
      const current = note();
      if (!current.canEdit || (!current.isNew && !editing) || posting || deleting) return;
      if (!hasContent(current)) { showMessage('Write a message or add a drawing first.'); body.focus(); return; }
      posting = true; updateControls(); showMessage('');
      const submitted = copy(current);
      const submittedSelection = selectionRequest;
      const showingSubmittedNote = () => !signal.aborted && selected === submitted.id && selectionRequest === submittedSelection && root.classList.contains('is-editor');
      try {
        const data = await api(current.isNew ? '' : '/' + current.id, { method: current.isNew ? 'POST' : 'PATCH', body: JSON.stringify(submitted) });
        if (signal.aborted) return;
        ++listVersion;
        records.set(data.note.id, { ...data.note, dirty: false });
        saveDrafts();
        if (selected === data.note.id) { editing = false; drawing = false; renderEditor(); }
        renderList();
        if (showingSubmittedNote()) showMessage(submitted.isNew ? 'Posted. Everyone visiting this site can see your note.' : 'Changes saved.', null, 'Retry', { noteId: submitted.id, duration: 2000 });
      } catch (error) { if (showingSubmittedNote()) showMessage(error.message, publish); }
      finally { posting = false; if (!signal.aborted) updateControls(); }
    }
    async function startEditing() {
      const current = note();
      if (!current.canEdit || current.isNew || posting || deleting) return;
      const request = ++selectionRequest;
      try {
        if (!current.dirty) {
          const data = await api('/' + current.id);
          if (request !== selectionRequest) return;
          records.set(current.id, data.note);
        }
        editing = true; drawing = false; showMessage(''); renderEditor(); title.focus();
      } catch (error) { if (!signal.aborted) showMessage(error.message, startEditing); }
    }
    async function removeNote(id = selected) {
      const current = records.get(id);
      if (!current?.canEdit || current.isNew || current.sample || posting || deleting) return;
      ++selectionRequest;
      deleting = true; updateControls(); showMessage('');
      try {
        const deleted = await api('/' + id, { method: 'DELETE', body: JSON.stringify({ revision: current.revision }) });
        ++listVersion;
        records.delete(id); redo.delete(id); saveDrafts();
        if (selected === id) { selected = 'welcome'; editing = drawing = false; renderEditor(); }
        renderList();
        showMessage('Note deleted.', () => restoreNote(deleted), 'Undo');
      } catch (error) { if (!signal.aborted) showMessage(error.message, () => removeNote(id)); }
      finally { deleting = false; if (!signal.aborted) updateControls(); }
    }
    async function restoreNote(deleted) {
      try {
        const data = await api('/' + deleted.id + '/restore', { method: 'POST', body: JSON.stringify({ revision: deleted.revision }) });
        ++listVersion;
        leaveNote(); ++selectionRequest;
        records.set(data.note.id, data.note); selected = data.note.id;
        root.classList.add('is-editor'); renderList(); renderEditor(); showMessage('Note restored.');
      } catch (error) { if (!signal.aborted) showMessage(error.message, () => restoreNote(deleted)); }
    }
    function point(event) {
      const box = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(960, (event.clientX-box.left)/box.width*960)), Math.max(0, Math.min(540, (event.clientY-box.top)/box.height*540))].map(n => Math.round(n*10)/10);
    }
    function finishStroke() {
      if (!activeStroke) return;
      note().drawing.push(activeStroke); activeStroke = null;
      if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      pointer = null; redo.set(selected, []); changed(); paint();
    }
    canvas.addEventListener('pointerdown', event => {
      if (!drawing || !note().canEdit || (!note().isNew && !editing) || posting || deleting || pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (note().drawing.length >= 256 || note().drawing.reduce((n,s) => n+s.points.length,0) >= 20000) { showMessage('This drawing is full. Start another note for more space.'); return; }
      event.preventDefault(); pointer = event.pointerId;
      activeStroke = { tool, color, width: tool === 'eraser' ? 20 : 4, points: [point(event)] };
      canvas.setPointerCapture(pointer); paint();
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!activeStroke || event.pointerId !== pointer) return;
      event.preventDefault();
      const used = note().drawing.reduce((n,s) => n+s.points.length,0);
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) {
        const next = point(sample), last = activeStroke.points.at(-1);
        if (Math.hypot(next[0]-last[0],next[1]-last[1]) > 1 && activeStroke.points.length+used < 20000) activeStroke.points.push(next);
      }
      paint();
    }, { signal });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, finishStroke, { signal });
    title.addEventListener('input', () => { note().title = title.value; changed(); }, { signal });
    body.addEventListener('input', () => { note().body = body.value; fitBody(); changed(); }, { signal });
    root.addEventListener('click', event => {
      const selectedItem = event.target.closest('[data-note-id]');
      if (selectedItem) { selectNote(selectedItem.dataset.noteId); return; }
      const chosenTool = event.target.closest('[data-note-tool]');
      if (chosenTool) { tool = chosenTool.dataset.noteTool; updateControls(); return; }
      const chosenColor = event.target.closest('[data-note-color]');
      if (chosenColor) { color = chosenColor.dataset.noteColor; tool = 'pen'; updateControls(); return; }
      const action = event.target.closest('[data-note-action]')?.dataset.noteAction;
      if (action === 'new') newNote();
      if (action === 'list') { leaveNote(); renderList(); renderEditor(); root.classList.remove('is-editor'); }
      if (action === 'edit') startEditing();
      if (action === 'delete') removeNote();
      if (action === 'draw') { finishStroke(); drawing = !drawing; updateControls(); }
      if (action === 'post') publish();
      if (action === 'retry') { const again = retry; showMessage(''); again?.(); }
      if (action === 'more') refresh(true);
      if (action === 'undo' && note().drawing.length) { const history = redo.get(selected) || []; history.push(note().drawing.pop()); redo.set(selected,history); changed(); paint(); }
      if (action === 'redo' && redo.get(selected)?.length) { note().drawing.push(redo.get(selected).pop()); changed(); paint(); }
    }, { signal });
    document.addEventListener('click', event => {
      if (note()?.isNew && !hasContent(note()) && !root.querySelector('.notes-editor').contains(event.target) && !event.target.closest('[data-note-action],[data-note-id]')) {
        leaveNote(); renderList(); renderEditor();
      }
    }, { signal });
    const resize = new ResizeObserver(fitBody); resize.observe(root);
    saveDrafts(); renderList(); renderEditor(); refresh();
    refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    return () => { leaveNote(); clearTimeout(messageTimer); controller.abort(); resize.disconnect(); clearInterval(refreshTimer); };
  }
  window.Notes = { mount };
})();
