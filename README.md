# Alex's little desktop

A mobile-friendly, Yosemite-inspired personal homepage with a shared Notes guestbook. The interface uses plain HTML, CSS, and JavaScript; a small Cloudflare Worker stores published notes and drawing strokes in Sites-managed D1.

## Preview

Run `npm install`, `npm run db:local`, then `npm run dev`. Visit http://127.0.0.1:4173. Local preview data is separate from hosted visitor notes.

## Railway deployment

The repository also includes a Node 24 server and Dockerfile for Railway. This serves the same `public/` assets and reuses the Notes API with a persistent SQLite database. To deploy it:

1. Create a Railway project from this GitHub repository. Railway will use the `Dockerfile`.
2. Attach a persistent volume to the web service. Its mount path can be `/data`; the service reads `RAILWAY_VOLUME_MOUNT_PATH` automatically. It intentionally fails to start on Railway without a volume, so guestbook posts cannot be lost on redeploy.
3. Generate a public domain for the service. The server listens on Railway's `PORT` and applies any pending `drizzle/` migrations when it starts.

Run `npm start` locally to test the Railway server at http://127.0.0.1:3000; its local SQLite file is stored in `data/`. The Railway database starts empty. Existing notes on the Sites deployment are not part of this repository and must be migrated separately if they should appear on the new domain. Anonymous author cookies belong to the old domain, so imported notes will be read-only to visitors on the new domain unless ownership is migrated deliberately. Keep the existing Sites deployment available until the new domain and data have been verified.

## Edit

- `public/index.html`: desktop and app-window templates.
- `public/styles.css` and `public/yosemite-chrome.css`: responsive desktop, Finder, menu bar, and icon-only mobile Dock.
- `public/app.js` and `public/windows.css`: independent desktop windows, stacking, focus, dragging, minimizing/restoring, Finder navigation, and clock.
- `public/notes.css` and `public/notes.js`: Yosemite Notes layout, drafts, drawing, and shared-note interactions.
- `public/photos.css`, `public/photos.js`, and `public/photos-data.js`: Yosemite Photos, grouped moments, all-photo browsing, thumbnail sizing, and a keyboard/touch-friendly photo viewer.
- `public/music.css`, `public/music.js`, and `public/music-data.js`: a light songs-only Music player with official audio previews, play/pause, previous/next, seeking, volume, and mutually exclusive shuffle and repeat-song modes. Turning both off restores playback in list order.
- `public/movies.css`, `public/movies.js`, `public/movies-data.js`, and `public/assets/movies/`: Alex Tube's single movie collection, search, original illustrated thumbnails, and interactive motion previews.
- `public/games.css` and `public/games.js`: Game Center with playable Memory Match, 2048, and Snake. It opens directly into the first game; arrows and dots switch games without resetting progress.
- `public/books.css`, `public/books.js`, and `public/books-data.js`: the iBooks-style library, with 12 sample books, cover/list views, search, sorting, and book details.
- `worker/index.js`: shared notes API, validation, anonymous ownership, and optimistic updates.
- `db/schema.ts` and `drizzle/`: database schema and generated migrations.
- `scripts/build.mjs`: emits Worker and static assets to generated `dist/`.

## Notes

Published notes show a stable anonymous name (for example, `Misty Fox`) derived on the server from the random ownership identity; the current author's name adds `(You)`. Existing posts receive the same names without a database migration. Names are display labels, may coincide, and never confer edit/delete permissions. The ownership hash is not returned to clients. Preserve the ordered name word lists to keep names stable.

Apps open in independent non-modal windows over a sharp, interactive desktop. Each app keeps its mounted content, search, scroll position, and draft state while other apps are opened. The Dock brings an existing app to the front; its indicator stays on for open or minimized windows. Red closes only that window, yellow minimizes it, and green maximizes/restores it within the space above the Dock. Drag the title bar to move desktop windows. Show desktop minimizes all windows without closing them. The desktop myPhoto folder has a separate window from Finder. On phones, apps share the available screen area while the menu bar and Dock remain accessible for switching. Escape returns from a book, photo, or movie detail first, then closes only the active window.

A read-only welcome note includes a hand-drawn smile and no editing controls. Visitors choose New note, write text, optionally use Draw (four ink colors, eraser, undo, redo), and click Post note. Published notes and drawings are shared with every visitor who can access the site. The list refreshes while Notes is open. Own published posts open read-only with Edit and Delete; Edit reveals Draw and Save changes, and saving returns to read-only mode. Delete removes the post from the shared list and offers Undo, backed by a reversible server-side deletion marker. An HTTP-only anonymous cookie establishes ownership. Other visitors cannot edit, delete, or restore someone else's posts.

Unpublished drafts with text or drawing strokes and unsaved edits are kept locally for recovery; published content lives in D1. Empty new notes (including whitespace-only text) are not stored and disappear when navigating away or closing Notes; older empty drafts are also cleaned up on open. A failed post preserves the draft and exposes Retry. The API validates drawing coordinates and content sizes, rejects cross-origin writes, limits repeated posting per visitor, supports pagination, and prevents stale edits from silently overwriting newer revisions. Losing the ownership cookie makes existing posts read-only from that browser.

Phones switch between the note list and editor with the Notes back button. Touch scrolling remains available outside the active drawing canvas. The other app windows and sample content retain their existing behavior.

Finder's Desktop location shows the desktop items as icons. Its myPhoto folder opens an empty Finder view (0 items). Opening myPhoto directly from the desktop presents a plain empty folder window without the sidebar or path bar; navigating there within Finder retains the sidebar. Photos is a separate library of 28 user-supplied images, grouped by subject without invented dates, with My Friends first. The white, justified gallery preserves image proportions. Open a thumbnail for a full image, use arrows or swipe to navigate, and choose Photos or press Escape to return to the library. Desktop users can adjust thumbnail size.

## Build and verification

`npm run build` generates the deployment output. `npm test` checks shared reads, author-only edits/deletion/restoration, drawing persistence, retry idempotency, conflicts, payload validation, and pagination using the generated SQL schema. Browser checks cover creating, drawing, undo/redo, posting, explicit edit/save states, Delete/Undo, blank draft cleanup, reopening saved notes, and the 320px mobile layout. Tests and preview posts are local only.

Sites manages the production database binding and applies packaged Drizzle migrations. Keep applied migrations immutable; generate another migration for future schema changes.

## Asset provenance

The YouTube Dock icon is a circular SVG matched to the white rim, gradient, shadow, and 512px silhouette of the Music and Books icons. Its Dock tooltip reads “YouTube”; the Dock, top menu, system menu, and Finder Applications open the local “My Favorite Movie” window. Six fictional films have original SVG scene illustrations and 20-second, silent motion previews with play/pause and seeking. The runtime labels describe the imagined films, not full playable videos.

The iBooks library uses 12 sample titles with covers from the [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers). Each entry in `public/books-data.js` records its ISBN; the source pattern is `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false`. Covers are resized and encoded as WebP for delivery. The short shelf notes are original sample copy, not excerpts from the books. Books contains books only.

Music presents Songs without a sidebar, artist pages, or album pages. The original three favorites remain: Sunset Boulevard (日落大道) by Liang Bo, Space Song by Beach House, and Pink + White by Frank Ocean. Official previews, artwork, durations, and destination links were resolved with the [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html). Audio streams directly from Apple and is not copied, cached by the application, or proxied. The player labels clips as Preview, and each song row links to Apple Music. List durations describe the full songs; the player's progress displays the actual preview duration. Playback starts only on interaction, continues while minimized or another window is active, and stops when Music is closed. Source and playback errors offer a retry and the Apple Music link.

The Photos library uses 28 images supplied by the user in `samplephotos/`. My Friends contains the Lesli Whitecotton, Amir Hosseini, and Daniel Lezuch photographs in that order, followed by the original 25 photos. Delivery copies in `public/assets/photos/` are EXIF-orientation-corrected WebP images at up to 720px (thumbnails) and 2000px (viewer), with metadata omitted. The original source files are unchanged.

Wallpaper generated with the built-in ImageGen tool and encoded as JPEG for delivery. Original size: 1586 × 992. Finder, Favorites (iBooks), Games (Game Center), and Notes use the user-supplied 512px PNG assets from `macxicons/`, copied unchanged into `public/assets/icons/`. Photos uses Apple's circular OS X Photos icon, sourced unchanged from [PhotoJoseph's February 2015 Photos for OS X article](https://photojoseph.com/tips/2015/2/5/photos-os-x-beta-os-x-10103-developer-release) ([1024px PNG](https://photojoseph.com/sites/default/files/sitegraphics/tips/2015/photos_os-x_icon.png)); it replaces the previously used Preview icon. The source folder contained no Music/iTunes icon, so Music uses a new matching SVG note icon. The Music window reuses the sample songs from Favorites.

Exact image prompt:

> Use case: photorealistic-natural
> Asset type: original desktop wallpaper background for Alex's personal website, inspired by the calm photographic atmosphere of Mac OS X Yosemite.
> Primary request: Create exactly one original landscape photograph of a monumental granite mountain valley like Yosemite at pastel dusk.
> Scene/backdrop: Layered mountain silhouettes receding into delicate atmospheric haze, with a conifer valley along the bottom.
> Subject: A large sculptural granite dome and sheer cliff occupying the right lower half, with crisp natural rock texture and gentle peach alpenglow.
> Style/medium: Photorealistic polished landscape photography, elegant and atmospheric.
> Composition/framing: Wide 16:10 landscape, ideally 2560x1600 pixels. Mountains occupy the lower 60 percent. Keep the upper middle area quiet and open for future white greeting text. Balance the dominant granite dome on the right with distant ridges on the left.
> Lighting/mood: Calm dusk; violet-blue shadows and subtle warm peach sunlight grazing the rock.
> Color palette: Pastel mauve sky fading from cool periwinkle at the top to pale warm pink near the horizon. Refined, natural, and not oversaturated.
> Constraints: One finished bitmap only. No lettering, no UI, no borders, no people, no watermarks, no logos. Do not render text in the image. No illustration or painting aesthetic.
