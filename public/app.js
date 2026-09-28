const systemMenu = document.querySelector('#system-menu');
const systemMenuTrigger = systemMenu.querySelector('summary');
const windowLayer = document.querySelector('#window-layer');
const appInfo = {
  alex: { title: 'About Alex', status: 'A little curiosity goes a long way' },
  photos: { title: 'Photos', status: '28 Photos' },
  collection: { title: 'My favorite books', status: '12 Books' },
  music: { title: 'My Favorite Music', status: '3 Songs' },
  youtube: { title: 'My Favorite Movie', status: '6 Movies' },
  play: { title: 'Game Center', status: 'Memory Match · 1 of 3' },
  wallpapers: { title: 'Dynamic Wallpapers', status: '5 interactive wallpapers' },
  guestbook: { title: 'Notes', status: 'Shared guestbook' },
  textedit: { title: 'Welcome.txt', status: 'Plain text document' }
};
const finderPages = {
  about: { title: 'About', template: 'finder-about-content', status: 'About Alex' },
  applications: { title: 'Applications', template: 'finder-applications-content', status: '7 items' },
  desktop: { title: 'Desktop', template: 'finder-desktop-content', status: '1 item' },
  welcome: { title: 'Welcome!', template: 'finder-welcome-content', status: '1 item', sidebar: 'desktop', location: 'Desktop › Welcome!' }
};
const windows = new Map();
const smallScreen = matchMedia('(max-width:600px)');
let activeWindow = null;
let stackingOrder = 0;
let nextWindowId = 0;
let resizeFrame;

function workspaceBounds() {
  const top = document.querySelector('.menu-bar').getBoundingClientRect().bottom + 8;
  const dockTop = document.querySelector('.dock').getBoundingClientRect().top;
  const bottom = Math.max(8, innerHeight - dockTop + 10);
  windowLayer.style.setProperty('--workspace-top', `${top}px`);
  windowLayer.style.setProperty('--workspace-bottom', `${bottom}px`);
  return { top, bottom, width: innerWidth, height: innerHeight };
}

function placeWindow(state, x = state.x, y = state.y) {
  const bounds = workspaceBounds();
  if (smallScreen.matches || state.element.classList.contains('maximized')) return;
  const width = state.element.offsetWidth;
  const height = state.element.offsetHeight;
  state.x = Math.max(8, Math.min(x, bounds.width - width - 8));
  state.y = Math.max(bounds.top, Math.min(y, bounds.height - bounds.bottom - height));
  state.element.style.setProperty('--window-x', `${state.x}px`);
  state.element.style.setProperty('--window-y', `${state.y}px`);
}

function updateDock() {
  document.querySelectorAll('.dock-app[data-open]').forEach(button => {
    const matching = [...windows.values()].filter(state => state.name === button.dataset.open);
    button.classList.toggle('is-active', matching.length > 0);
    button.classList.toggle('is-front', activeWindow?.name === button.dataset.open);
    button.setAttribute('aria-expanded', String(matching.some(state => !state.element.hidden)));
    if (matching.length) button.setAttribute('aria-controls', matching.map(state => state.element.id).join(' '));
    else button.removeAttribute('aria-controls');
  });
}

function activateWindow(state, focus = false) {
  if (!state || !windows.has(state.key)) return;
  const restored = state.element.hidden;
  state.element.hidden = false;
  if (activeWindow !== state || restored) {
    state.order = ++stackingOrder;
    state.element.style.zIndex = state.order;
  }
  activeWindow = state;
  for (const other of windows.values()) other.element.classList.toggle('is-inactive', other !== state);
  if (restored) placeWindow(state);
  updateDock();
  if (focus) {
    const target = state.lastFocus?.isConnected && state.lastFocus.getClientRects().length ? state.lastFocus : state.element.querySelector('[data-close]');
    target.focus({ preventScroll: true });
  }
}

function activateNextWindow(fallback) {
  const next = [...windows.values()].filter(state => !state.element.hidden).sort((a, b) => b.order - a.order)[0];
  activeWindow = null;
  if (next) activateWindow(next, true);
  else {
    updateDock();
    if (fallback?.isConnected && fallback.getClientRects().length) fallback.focus({ preventScroll: true });
  }
}

function closeWindow(state) {
  if (!windows.has(state.key)) return;
  const wasActive = activeWindow === state;
  state.dispose?.();
  state.controller.abort();
  windows.delete(state.key);
  state.element.close();
  state.element.remove();
  if (wasActive) activateNextWindow(state.returnFocus);
  else updateDock();
}

function minimizeWindow(state) {
  state.element.hidden = true;
  state.element.classList.add('is-inactive');
  if (activeWindow === state) activateNextWindow(state.returnFocus);
  else updateDock();
}

function maximizeWindow(state) {
  const maximized = state.element.classList.toggle('maximized');
  state.element.querySelector('[data-maximize]').setAttribute('aria-label', maximized ? 'Restore window size' : 'Maximize window');
  activateWindow(state);
  if (!maximized) placeWindow(state);
}

function showFinderPage(state, name) {
  const page = finderPages[name];
  const pane = state.content.querySelector('.finder-pane');
  if (!page || !pane) return;
  const focusPane = pane.contains(document.activeElement);
  pane.replaceChildren(document.getElementById(page.template).content.cloneNode(true));
  pane.setAttribute('aria-label', page.title);
  pane.scrollTop = 0;
  state.content.querySelectorAll('[data-finder-page]').forEach(button => {
    if (button.dataset.finderPage === (page.sidebar || name)) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  state.content.querySelector('[data-finder-location]').textContent = page.location || page.title;
  state.title.textContent = page.title;
  state.status.textContent = page.status;
  if (focusPane) pane.focus({ preventScroll: true });
}

async function loadWelcomeFile(state) {
  const document = state.content.querySelector('[data-text-file]');
  try {
    const response = await fetch('Welcome.txt', { signal: state.controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    document.textContent = await response.text();
  } catch (error) {
    if (error.name !== 'AbortError') document.textContent = 'Welcome.txt could not be opened. Please try again.';
  }
}

function enableDragging(state) {
  const toolbar = state.element.querySelector('.window-toolbar');
  const options = { signal: state.controller.signal };
  let drag = null;
  toolbar.addEventListener('pointerdown', event => {
    if (event.button !== 0 || smallScreen.matches || state.element.classList.contains('maximized') || event.target.closest('button')) return;
    event.preventDefault();
    const rect = state.element.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    toolbar.setPointerCapture(event.pointerId);
    state.element.classList.add('is-dragging');
  }, options);
  toolbar.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    placeWindow(state, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
  }, options);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) toolbar.addEventListener(eventName, () => {
    drag = null;
    state.element.classList.remove('is-dragging');
  }, options);
  toolbar.addEventListener('dblclick', event => {
    if (!smallScreen.matches && !event.target.closest('button')) maximizeWindow(state);
  }, options);
}

function openApp(name, trigger) {
  if (!appInfo[name]) return;
  const folder = name === 'alex' && !!trigger?.matches('.desktop-folder');
  const key = folder ? 'folder-welcome' : name;
  const returnFocus = systemMenu.contains(trigger) ? systemMenuTrigger : trigger;
  systemMenu.open = false;
  if (windows.has(key)) {
    activateWindow(windows.get(key), true);
    return;
  }
  const element = document.querySelector('#window-template').content.firstElementChild.cloneNode(true);
  const id = ++nextWindowId;
  element.id = `app-window-${id}`;
  element.dataset.app = key;
  element.classList.add('is-inactive');
  element.classList.toggle('is-finder', name === 'alex');
  element.classList.toggle('is-folder', folder);
  element.classList.toggle('is-notes', name === 'guestbook');
  element.classList.toggle('is-photos', name === 'photos');
  element.classList.toggle('is-books', name === 'collection');
  element.classList.toggle('is-music', name === 'music');
  element.classList.toggle('is-youtube', name === 'youtube');
  element.classList.toggle('is-games', name === 'play');
  element.classList.toggle('is-wallpapers', name === 'wallpapers');
  element.classList.toggle('is-textedit', name === 'textedit');
  const state = { key, name, element, returnFocus, controller: new AbortController(), order: 0, x: 8, y: 32 };
  state.content = element.querySelector('.window-content');
  state.title = element.querySelector('.window-title');
  state.status = element.querySelector('[data-window-status]');
  state.title.id = `window-title-${id}`;
  element.setAttribute('aria-labelledby', state.title.id);
  state.title.textContent = appInfo[name].title;
  state.status.textContent = appInfo[name].status;
  state.content.append(document.querySelector(`#view-${name}`).content.cloneNode(true));
  if (name === 'alex') showFinderPage(state, folder ? 'welcome' : trigger?.dataset.finderInitial || 'about');
  const options = { signal: state.controller.signal };
  element.addEventListener('pointerdown', () => activateWindow(state), { ...options, capture: true });
  element.addEventListener('focusin', event => {
    state.lastFocus = event.target;
    activateWindow(state);
  }, options);
  element.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) closeWindow(state);
    else if (event.target.closest('[data-minimize]')) minimizeWindow(state);
    else if (event.target.closest('[data-maximize]')) maximizeWindow(state);
    const finderPage = event.target.closest('[data-finder-page]');
    if (finderPage) showFinderPage(state, finderPage.dataset.finderPage);
  }, options);
  enableDragging(state);
  windowLayer.append(element);
  const slot = windows.size % 5;
  windows.set(key, state);
  element.show(); // Non-modal: the desktop, Dock, and other windows remain interactive.
  const bounds = workspaceBounds();
  placeWindow(state, (innerWidth - element.offsetWidth) / 2 + slot * 26 - 26, bounds.top + 28 + slot * 28);
  const setStatus = text => { state.status.textContent = text; };
  if (name === 'guestbook') state.dispose = window.Notes.mount(state.content.querySelector('.notes-app'), setStatus);
  if (name === 'photos') state.dispose = window.Photos.mount(state.content.querySelector('.photos-app'), setStatus);
  if (name === 'collection') state.dispose = window.Books.mount(state.content.querySelector('.books-app'), setStatus);
  if (name === 'music') state.dispose = window.Music.mount(state.content.querySelector('.music-app'), setStatus);
  if (name === 'youtube') state.dispose = window.Movies.mount(state.content.querySelector('.movies-app'), setStatus);
  if (name === 'play') state.dispose = window.Games.mount(state.content.querySelector('.games-app'), setStatus);
  if (name === 'wallpapers') state.dispose = window.Wallpapers.mount(state.content.querySelector('.wallpapers-app'), setStatus);
  if (name === 'textedit') loadWelcomeFile(state);
  activateWindow(state, true);
}

document.querySelectorAll('[data-open]').forEach(button => button.setAttribute('aria-haspopup', 'dialog'));
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-open]');
  if (trigger) openApp(trigger.dataset.open, trigger);
});
document.querySelector('#show-desktop').addEventListener('click', () => {
  systemMenu.open = false;
  for (const state of windows.values()) {
    state.element.hidden = true;
    state.element.classList.add('is-inactive');
  }
  activeWindow = null;
  updateDock();
  systemMenuTrigger.focus({ preventScroll: true });
});
document.addEventListener('pointerdown', event => {
  if (systemMenu.open && !systemMenu.contains(event.target)) systemMenu.open = false;
  if (!event.target.closest('.app-window,.dock-area,.menu-bar,[data-open]')) {
    activeWindow = null;
    for (const state of windows.values()) state.element.classList.add('is-inactive');
    updateDock();
  }
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (systemMenu.open) {
    event.preventDefault();
    systemMenu.open = false;
    systemMenuTrigger.focus({ preventScroll: true });
  } else if (activeWindow) {
    event.preventDefault();
    // Photos and Books get first chance to return from their detail view.
    const state = activeWindow;
    if (state.element.dispatchEvent(new Event('cancel', { cancelable: true }))) closeWindow(state);
  }
});
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    workspaceBounds();
    for (const state of windows.values()) if (!state.element.hidden) placeWindow(state);
  });
});
workspaceBounds();

function updateClock() {
  const now = new Date();
  const clock = document.querySelector('#menu-clock');
  clock.dateTime = now.toISOString();
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  clock.textContent = `${weekday} ${time}`;
}
updateClock();
setInterval(updateClock, 30000);
