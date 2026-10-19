/* ══════════════════════════════════════════════════════════════
   CineVault v2 — Main Application
   ══════════════════════════════════════════════════════════════ */

const CFG = window.CV_CONFIG;

// ─── TMDB API helpers ─────────────────────────────────────────
const _cache = new Map();
const _inflight = new Map();

async function tmdb(path, opts = {}) {
  const url = `${CFG.TMDB_BASE}/${path.replace(/^\//, '')}`;
  if (!opts.signal && _cache.has(url)) return _cache.get(url);
  if (!opts.signal && _inflight.has(url)) return _inflight.get(url);

  const p = fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${CFG.TMDB_TOKEN}`, 'Content-Type': 'application/json' }
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        showToast('⚠️ TMDB auth failed — check your token');
      }
      return null;
    }
    if (!opts.signal) _cache.set(url, data);
    return data;
  }).catch(() => null);

  if (!opts.signal) {
    _inflight.set(url, p);
    p.finally(() => _inflight.delete(url));
  }
  return p;
}

function posterUrl(path, size = 'w342') {
  if (!path) return null;
  return `${CFG.IMG_BASE}${size}${path}`;
}

function mapMovie(m) {
  if (!m) return null;
  const va = m.vote_average;
  return {
    id: m.id,
    title: m.title || m.original_title || 'Untitled',
    year: (m.release_date || '').slice(0, 4) || '',
    poster: posterUrl(m.poster_path),
    backdrop: posterUrl(m.backdrop_path, 'w780'),
    rating: va && va > 0 ? Number(va).toFixed(1) : null,
    genreIds: m.genre_ids || [],
    overview: m.overview || '',
  };
}

// ─── Local Storage helpers ────────────────────────────────────
function lsGet(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { }
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── State ───────────────────────────────────────────────────
let favorites = lsGet('cv2_fav', []);
let watchlist = lsGet('cv2_watch', []);
let ratings = lsGet('cv2_ratings', {});
let history = lsGet('cv2_history', []);
let bingo = lsGet('cv2_bingo', []);
let tiers = lsGet('cv2_tiers', { S: [], A: [], B: [], C: [], D: [], F: [] });
let streak = lsGet('cv2_streak', { days: [], total: 0, longest: 0 });
let theme = lsGet('cv2_theme', 'dark');

let currentMovie = null;
let searchPage = 1;
let searchQuery = '';
let searchSort = 'popularity.desc';
let activeMoodId = null;
let dragging = null;

// ─── Persistence helpers ──────────────────────────────────────
const save = {
  fav() { lsSet('cv2_fav', favorites); },
  watch() { lsSet('cv2_watch', watchlist); },
  ratings() { lsSet('cv2_ratings', ratings); },
  history() { lsSet('cv2_history', history); },
  bingo() { lsSet('cv2_bingo', bingo); },
  tiers() { lsSet('cv2_tiers', tiers); },
  streak() { lsSet('cv2_streak', streak); },
};

function inList(list, id) { return list.some(m => m.id === id); }

function toggleList(list, movie, saveKey, label) {
  const idx = list.findIndex(m => m.id === movie.id);
  if (idx >= 0) { list.splice(idx, 1); showToast(`Removed from ${label}`); }
  else { list.unshift(movie); showToast(`Added to ${label} ✓`); }
  save[saveKey]();
  updateBadges();
}

function addToHistory(movie) {
  history = [movie, ...history.filter(m => m.id !== movie.id)].slice(0, 50);
  save.history();
}

// ─── Theme ───────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.getElementById('btn-theme').textContent = theme === 'light' ? '☀️' : '🌙';
}

// ─── Badges ──────────────────────────────────────────────────
function updateBadges() {
  const badge = document.getElementById('watchlist-badge');
  badge.textContent = watchlist.length;
  badge.style.display = watchlist.length > 0 ? 'inline' : 'none';
}

// ─── Skeleton card ────────────────────────────────────────────
function skeletonCard() {
  return `<div class="skeleton">
    <div class="skeleton-inner"></div>
    <div class="skeleton-body">
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  </div>`;
}

// ─── Movie Card ───────────────────────────────────────────────
function movieCard(movie) {
  const isFav = inList(favorites, movie.id);
  const isWatch = inList(watchlist, movie.id);
  const myRating = ratings[movie.id] || 0;

  return `
  <div class="movie-card" data-id="${movie.id}">
    <div class="card-actions">
      <button class="action-btn fav${isFav ? ' active' : ''}" data-action="fav" title="Favorite">❤️</button>
      <button class="action-btn watch${isWatch ? ' active' : ''}" data-action="watch" title="Watchlist">🔖</button>
    </div>
    <div class="movie-card__poster-wrap">
      ${movie.poster
      ? `<img src="${movie.poster}" alt="${esc(movie.title)}" loading="lazy"/>`
      : `<div class="movie-card__placeholder">🎬</div>`}
    </div>
    <div class="movie-card__body">
      <p class="movie-card__title">${esc(movie.title)}</p>
      <div class="movie-card__meta">
        <span class="movie-card__year">${movie.year || '—'}</span>
        ${movie.rating ? `<span class="movie-card__rating">⭐ ${movie.rating}</span>` : ''}
        ${myRating > 0 ? `<span class="movie-card__rating" style="color:var(--accent)">★${myRating}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Render grids ─────────────────────────────────────────────
function renderGrid(containerId, movies) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = movies.map(movieCard).join('');
  el.querySelectorAll('.movie-card').forEach(card => {
    const id = Number(card.dataset.id);
    card.addEventListener('click', e => {
      if (e.target.closest('.card-actions')) return;
      const movie = findMovieAnywhere(id);
      if (movie) openModal(movie);
    });
    card.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const movie = findMovieAnywhere(id);
        if (!movie) return;
        if (btn.dataset.action === 'fav') {
          toggleList(favorites, movie, 'fav', '❤️ Favorites');
          btn.classList.toggle('active', inList(favorites, id));
        } else {
          toggleList(watchlist, movie, 'watch', '🔖 Watchlist');
          btn.classList.toggle('active', inList(watchlist, id));
        }
      });
    });
  });
}

// Keep a flat map of all movies we've seen for quick lookup
const movieMap = new Map();
function registerMovies(movies) {
  movies.forEach(m => movieMap.set(m.id, m));
}
function findMovieAnywhere(id) {
  return movieMap.get(id) || null;
}

// ─── Home sections ────────────────────────────────────────────
async function loadHomeSection(path, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({ length: 8 }, skeletonCard).join('');
  const data = await tmdb(path);
  const movies = (data?.results || []).map(mapMovie).filter(Boolean);
  registerMovies(movies);
  renderGrid(containerId, movies);
}

async function loadHome() {
  await Promise.all([
    loadHomeSection('trending/movie/week', 'trending-grid'),
    loadHomeSection('movie/top_rated', 'toprated-grid'),
    loadHomeSection('movie/now_playing', 'nowplaying-grid'),
    loadHomeSection('movie/upcoming', 'upcoming-grid'),
  ]);
}

// ─── Search ───────────────────────────────────────────────────
let searchDebounceTimer = null;
let searchAC = null;

function setupSearch() {
  ['hero-search-input', 'nav-search-input'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', e => {
      clearTimeout(searchDebounceTimer);
      const q = e.target.value.trim();
      if (!q) {
        hideLiveDropdown();
        if (!activeMoodId) showHomeSections();
        return;
      }
      searchDebounceTimer = setTimeout(() => fetchLiveDropdown(q, id === 'hero-search-input' ? 'hero-dropdown' : 'nav-dropdown'), 280);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        hideLiveDropdown();
        if (q) runSearch(q);
      }
    });
    el.addEventListener('blur', () => setTimeout(hideLiveDropdown, 200));
  });
}

async function fetchLiveDropdown(q, dropId) {
  if (searchAC) searchAC.abort();
  searchAC = new AbortController();
  try {
    const data = await tmdb(`search/movie?query=${encodeURIComponent(q)}&page=1`, { signal: searchAC.signal });
    const results = (data?.results || []).slice(0, 5).map(mapMovie).filter(Boolean);
    registerMovies(results);
    showLiveDropdown(dropId, results);
  } catch { }
}

function showLiveDropdown(dropId, movies) {
  const el = document.getElementById(dropId);
  if (!el) return;
  if (!movies.length) { el.classList.add('hidden'); return; }
  el.innerHTML = movies.map(m => `
    <div class="live-item" data-id="${m.id}">
      ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)}"/>` : '<div class="live-item__no-img">🎬</div>'}
      <div>
        <p class="live-item__title">${esc(m.title)}</p>
        <p class="live-item__year">${m.year || '—'}</p>
      </div>
    </div>`).join('');
  el.querySelectorAll('.live-item').forEach(item => {
    item.addEventListener('click', () => {
      hideLiveDropdown();
      const movie = findMovieAnywhere(Number(item.dataset.id));
      if (movie) openModal(movie);
    });
  });
  el.classList.remove('hidden');
}

function hideLiveDropdown() {
  document.querySelectorAll('.live-dropdown').forEach(el => el.classList.add('hidden'));
}

async function runSearch(q, page = 1, sort = null, genreId = null) {
  searchQuery = q || searchQuery;
  searchPage = page;
  searchSort = sort || searchSort;

  showSearchSection();
  const grid = document.getElementById('search-grid');
  if (page === 1) {
    document.getElementById('search-title').textContent =
      genreId ? `${document.querySelector('.mood-chip.active')?.textContent || 'Genre'} Movies`
        : `Results for "${searchQuery}"`;
    grid.innerHTML = Array.from({ length: 12 }, skeletonCard).join('');
  } else {
    const more = document.getElementById('btn-load-more');
    more.textContent = 'Loading…';
    more.disabled = true;
  }

  let path;
  if (genreId) {
    path = `discover/movie?with_genres=${genreId}&sort_by=${searchSort}&page=${page}`;
  } else {
    path = `search/movie?query=${encodeURIComponent(searchQuery)}&page=${page}`;
  }

  const data = await tmdb(path);
  const movies = (data?.results || []).map(mapMovie).filter(Boolean);
  registerMovies(movies);

  if (page === 1) {
    renderGrid('search-grid', movies);
  } else {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = movies.map(movieCard).join('');
    wrapper.querySelectorAll('.movie-card').forEach(card => {
      const id = Number(card.dataset.id);
      card.addEventListener('click', e => {
        if (e.target.closest('.card-actions')) return;
        const movie = findMovieAnywhere(id);
        if (movie) openModal(movie);
      });
      card.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const movie = findMovieAnywhere(id);
          if (!movie) return;
          if (btn.dataset.action === 'fav') {
            toggleList(favorites, movie, 'fav', '❤️ Favorites');
            btn.classList.toggle('active', inList(favorites, id));
          } else {
            toggleList(watchlist, movie, 'watch', '🔖 Watchlist');
            btn.classList.toggle('active', inList(watchlist, id));
          }
        });
      });
      grid.appendChild(card);
    });
    const more = document.getElementById('btn-load-more');
    more.textContent = 'Load More';
    more.disabled = false;
  }

  const hasMore = data?.page < data?.total_pages;
  document.getElementById('search-more-row').style.display = hasMore ? 'flex' : 'none';
}

function showSearchSection() {
  document.getElementById('hero').classList.add('collapsed');
  document.getElementById('navbar-search-wrap').classList.add('visible');
  document.getElementById('search-section').classList.remove('hidden');
  ['trending-section', 'toprated-section', 'nowplaying-section', 'upcoming-section'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function showHomeSections() {
  activeMoodId = null;
  document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('hero').classList.remove('collapsed');
  document.getElementById('navbar-search-wrap').classList.remove('visible');
  document.getElementById('search-section').classList.add('hidden');
  ['trending-section', 'toprated-section', 'nowplaying-section', 'upcoming-section'].forEach(id => {
    document.getElementById(id)?.classList.remove('hidden');
  });
}

// ─── Modal ────────────────────────────────────────────────────
async function openModal(movie) {
  currentMovie = movie;
  addToHistory(movie);

  const overlay = document.getElementById('movie-modal');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Set backdrop
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.style.backgroundImage = movie.backdrop ? `url(${movie.backdrop})` : 'none';

  // Set poster
  const poster = document.getElementById('modal-poster');
  poster.src = movie.poster || '';
  poster.alt = movie.title;
  if (!movie.poster) poster.style.display = 'none';
  else poster.style.display = '';

  // Title
  document.getElementById('modal-title').textContent = movie.title;

  // Chips
  document.getElementById('modal-chips').innerHTML =
    `<span class="chip">${movie.year || 'N/A'}</span>`;

  // Ratings
  document.getElementById('modal-ratings').innerHTML =
    movie.rating ? `<div class="rating-item rating-imdb">⭐ ${movie.rating} <span>TMDB</span></div>` : '';

  // Overview tab
  document.getElementById('modal-tab-overview').innerHTML = `
    <p class="modal__overview">${esc(movie.overview || 'No overview available.')}</p>
    <div class="modal__meta-grid" id="modal-meta-grid">
      <div class="meta-label">Loading details…</div><div></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px;margin-bottom:4px">
      <span style="font-size:12px;color:var(--text-muted);font-weight:500">Your rating:</span>
      <div class="star-rating">${[1, 2, 3, 4, 5].map(s =>
    `<button class="star-btn${(ratings[movie.id] || 0) >= s ? ' active' : ''}" data-star="${s}">★</button>`
  ).join('')}</div>
    </div>`;

  document.querySelectorAll('#modal-tab-overview .star-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = Number(btn.dataset.star);
      ratings[movie.id] = s;
      save.ratings();
      document.querySelectorAll('#modal-tab-overview .star-btn').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.star) <= s));
      showToast(`Rated ${s} ★`);
    });
  });

  // Set tabs to overview
  setModalTab('overview');

  // Actions
  renderModalActions();

  // Load full details
  const detail = await tmdb(`movie/${movie.id}?append_to_response=credits,release_dates`);
  if (detail && currentMovie?.id === movie.id) enrichModal(detail, movie);
}

function enrichModal(d, movie) {
  // Update chips
  const chips = document.getElementById('modal-chips');
  const rated = (() => {
    const us = d.release_dates?.results?.find(r => r.iso_3166_1 === 'US');
    return us?.release_dates?.map(x => x.certification).filter(Boolean)[0] || null;
  })();
  chips.innerHTML = [
    `<span class="chip">${movie.year || 'N/A'}</span>`,
    rated ? `<span class="chip${['R', 'TV-MA', 'NC-17'].includes(rated) ? ' chip--red' : ''}">${rated}</span>` : '',
    d.runtime ? `<span class="chip">${d.runtime} min</span>` : '',
    ...(d.genres || []).map(g => `<span class="chip">${g.name}</span>`),
  ].join('');

  // Rating
  const va = d.vote_average;
  document.getElementById('modal-ratings').innerHTML =
    va && va > 0 ? `<div class="rating-item rating-imdb">⭐ ${Number(va).toFixed(1)} <span>TMDB</span></div>` : '';

  // Meta grid
  const director = d.credits?.crew?.find(c => c.job === 'Director');
  const cast = d.credits?.cast?.slice(0, 8).map(c => c.name).join(', ');
  const revenue = d.revenue > 0
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(d.revenue)
    : null;
  const rows = [
    director ? ['Director', director.name] : null,
    cast ? ['Cast', cast] : null,
    d.production_countries?.length ? ['Country', d.production_countries.map(c => c.name).join(', ')] : null,
    revenue ? ['Box Office', revenue] : null,
    d.spoken_languages?.length ? ['Language', d.spoken_languages.map(l => l.name).join(', ')] : null,
  ].filter(Boolean);

  document.getElementById('modal-meta-grid').innerHTML = rows.map(([l, v]) =>
    `<div class="meta-label">${l}</div><div class="meta-value">${esc(v)}</div>`
  ).join('');

  // Enrich currentMovie
  currentMovie = { ...currentMovie, ...mapMovie(d), fullLoaded: true, director: director?.name, cast };
  movieMap.set(currentMovie.id, currentMovie);
}

function renderModalActions() {
  const m = currentMovie;
  if (!m) return;
  const isFav = inList(favorites, m.id);
  const isWatch = inList(watchlist, m.id);
  document.getElementById('modal-actions').innerHTML = `
    <button class="btn-action btn-action--primary" id="ma-watch">
      ${isWatch ? '🔖 On Watchlist' : '+ Watchlist'}
    </button>
    <button class="btn-action btn-action--secondary" id="ma-fav">
      ${isFav ? '❤️ Favorited' : '🤍 Favorite'}
    </button>
    <button class="btn-action btn-action--gold" id="ma-trailer">▶ Trailer</button>
    <button class="btn-action btn-action--secondary" id="ma-share">📋 Share</button>`;

  document.getElementById('ma-watch').addEventListener('click', () => {
    toggleList(watchlist, m, 'watch', '🔖 Watchlist');
    renderModalActions();
  });
  document.getElementById('ma-fav').addEventListener('click', () => {
    toggleList(favorites, m, 'fav', '❤️ Favorites');
    renderModalActions();
  });
  document.getElementById('ma-trailer').addEventListener('click', () => {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(m.title + ' official trailer')}`, '_blank');
  });
  document.getElementById('ma-share').addEventListener('click', () => {
    navigator.clipboard?.writeText(`Check out "${m.title}" on CineVault!`);
    showToast('Copied to clipboard!');
  });
}

function setModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  ['overview', 'similar', 'director'].forEach(t => {
    document.getElementById(`modal-tab-${t}`)?.classList.toggle('hidden', t !== tab);
  });

  if (tab === 'similar' && currentMovie) loadSimilar();
  if (tab === 'director' && currentMovie) loadDirectorFilms();
}

async function loadSimilar() {
  const el = document.getElementById('modal-tab-similar');
  el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Loading…</p>';
  const data = await tmdb(`movie/${currentMovie.id}/recommendations`);
  const movies = (data?.results || []).slice(0, 12).map(mapMovie).filter(Boolean);
  registerMovies(movies);
  if (!movies.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No similar movies found.</p>'; return; }
  el.innerHTML = `<div class="similar-grid">${movies.map(m => `
    <div class="similar-thumb" data-id="${m.id}">
      ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)}" loading="lazy"/>` : '<div style="aspect-ratio:2/3;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;">🎬</div>'}
      <p>${esc(m.title)}</p>
    </div>`).join('')}</div>`;
  el.querySelectorAll('.similar-thumb').forEach(el => {
    el.addEventListener('click', () => {
      const movie = findMovieAnywhere(Number(el.dataset.id));
      if (movie) openModal(movie);
    });
  });
}

async function loadDirectorFilms() {
  const el = document.getElementById('modal-tab-director');
  el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Loading…</p>';
  const detail = await tmdb(`movie/${currentMovie.id}?append_to_response=credits`);
  const director = detail?.credits?.crew?.find(c => c.job === 'Director');
  if (!director) { el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Director info unavailable.</p>'; return; }

  const credits = await tmdb(`person/${director.id}/movie_credits`);
  const seen = new Set([currentMovie.id]);
  const films = (credits?.crew || [])
    .filter(c => c.job === 'Director' && !seen.has(c.id) && seen.add(c.id))
    .slice(0, 12)
    .map(c => mapMovie({ ...c, genre_ids: [] }))
    .filter(Boolean);
  registerMovies(films);

  el.innerHTML = `<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">More from ${esc(director.name)}</p>
    <div class="similar-grid">${films.map(m => `
    <div class="similar-thumb" data-id="${m.id}">
      ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)}" loading="lazy"/>` : '<div style="aspect-ratio:2/3;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;">🎬</div>'}
      <p>${esc(m.title)}</p>
    </div>`).join('')}</div>`;
  el.querySelectorAll('.similar-thumb').forEach(el => {
    el.addEventListener('click', () => {
      const movie = findMovieAnywhere(Number(el.dataset.id));
      if (movie) openModal(movie);
    });
  });
}

function closeModal() {
  document.getElementById('movie-modal').classList.add('hidden');
  document.body.style.overflow = '';
  currentMovie = null;
}

// ─── Side Panel ───────────────────────────────────────────────
function openPanel(title, html) {
  document.getElementById('side-panel-title').innerHTML = title;
  document.getElementById('side-panel-body').innerHTML = html;
  document.getElementById('side-overlay').classList.remove('hidden');
  document.getElementById('side-panel').classList.remove('hidden');
}

function closePanel() {
  document.getElementById('side-overlay').classList.add('hidden');
  document.getElementById('side-panel').classList.add('hidden');
}

function panelListHTML(list, emptyMsg) {
  if (!list.length) return `<div class="panel-empty"><span>📭</span>${emptyMsg}</div>`;
  return list.map(m => `
    <div class="panel-item" data-id="${m.id}">
      ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)}"/>` : '<div class="panel-item__no-img">🎬</div>'}
      <div class="panel-item__info">
        <p class="panel-item__title">${esc(m.title)}</p>
        <p class="panel-item__year">${m.year || '—'}</p>
      </div>
      <button class="panel-item__remove" data-remove-id="${m.id}">✕</button>
    </div>`).join('');
}

function bindPanelList(listRef, saveKey, label) {
  document.querySelectorAll('[data-remove-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = Number(btn.dataset.removeId);
      const idx = listRef.findIndex(m => m.id === id);
      if (idx >= 0) { listRef.splice(idx, 1); save[saveKey](); updateBadges(); }
      btn.closest('.panel-item').remove();
      showToast(`Removed from ${label}`);
    });
  });
  document.querySelectorAll('.panel-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-remove-id]')) return;
      const movie = findMovieAnywhere(Number(item.dataset.id));
      if (movie) { closePanel(); openModal(movie); }
    });
  });
}

function openWatchlistPanel() {
  openPanel('🔖 Watchlist', panelListHTML(watchlist, 'Your watchlist is empty'));
  bindPanelList(watchlist, 'watch', '🔖 Watchlist');
}

function openFavoritesPanel() {
  openPanel('❤️ Favorites', panelListHTML(favorites, 'No favorites yet'));
  bindPanelList(favorites, 'fav', '❤️ Favorites');
}

function openStreakPanel() {
  const today = new Date().toDateString();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i); return d;
  });
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const current = (() => {
    let s = 0;
    const sorted = [...(streak.days || [])].sort();
    if (!sorted.length) return 0;
    let d = new Date(sorted[sorted.length - 1]);
    while (streak.days?.includes(d.toDateString())) { s++; d.setDate(d.getDate() - 1); }
    return s;
  })();

  openPanel('🔥 Watch Streak', `
    <div class="streak-bar">
      <div class="streak-count">${current}</div>
      <div class="streak-label">day streak 🔥</div>
      <div class="streak-week">
        ${week.map(d => {
    const ds = d.toDateString();
    const watched = streak.days?.includes(ds);
    const isToday = ds === today;
    return `<div class="streak-day${watched ? ' watched' : isToday ? ' today' : ''}">${days[d.getDay()]}</div>`;
  }).join('')}
      </div>
      <button class="streak-log-btn" id="streak-log-btn">✅ Log Movie Watched Today</button>
      <div class="streak-totals">
        <div class="streak-stat"><div class="streak-stat__num">${streak.total || 0}</div><div class="streak-stat__label">Total</div></div>
        <div class="streak-stat"><div class="streak-stat__num">${streak.longest || 0}</div><div class="streak-stat__label">Best Streak</div></div>
        <div class="streak-stat"><div class="streak-stat__num">${current}</div><div class="streak-stat__label">Current</div></div>
      </div>
    </div>
    <div class="theme-row">
      <span class="theme-row-label">Theme:</span>
      <button class="theme-btn" id="tb-dark"  style="background:#0a0c12;border-color:${theme === 'dark' ? 'var(--gold)' : 'var(--border)'}"></button>
      <button class="theme-btn" id="tb-light" style="background:#f0f2f8;border-color:${theme === 'light' ? '#c4911a' : 'rgba(0,0,0,0.15)'}"></button>
    </div>`);

  document.getElementById('streak-log-btn')?.addEventListener('click', () => {
    const today2 = new Date().toDateString();
    if (!streak.days) streak.days = [];
    if (!streak.days.includes(today2)) {
      streak.days.push(today2);
      streak.total = (streak.total || 0) + 1;
      save.streak();
      showToast('🔥 Streak logged!');
      openStreakPanel(); // re-render
    } else { showToast('Already logged today!'); }
  });
  document.getElementById('tb-dark')?.addEventListener('click', () => { theme = 'dark'; lsSet('cv2_theme', theme); applyTheme(); openStreakPanel(); });
  document.getElementById('tb-light')?.addEventListener('click', () => { theme = 'light'; lsSet('cv2_theme', theme); applyTheme(); openStreakPanel(); });
}
// ─── About ────────────────────────────────────────────────────
function openAbout() { document.getElementById('about-modal').classList.remove('hidden'); }
function closeAbout() { document.getElementById('about-modal').classList.add('hidden'); }
// ─── Bingo ────────────────────────────────────────────────────
function openBingo() {
  document.getElementById('bingo-modal').classList.remove('hidden');
  renderBingo();
}
function closeBingo() {
  document.getElementById('bingo-modal').classList.add('hidden');
}

function checkBingo() {
  const size = 5;
  const lines = [];
  for (let i = 0; i < size; i++) {
    lines.push(Array.from({ length: size }, (_, j) => i * size + j));
    lines.push(Array.from({ length: size }, (_, j) => j * size + i));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return lines.some(line => line.every(idx => bingo.includes(idx) || CFG.BINGO_CELLS[idx]?.isFree));
}

function renderBingo() {
  const cells = CFG.BINGO_CELLS;
  document.getElementById('bingo-grid').innerHTML = cells.map((cell, i) => `
    <div class="bingo-cell${cell.isFree ? ' free' : ''}${bingo.includes(i) ? ' checked' : ''}" data-i="${i}">
      <div class="bingo-cell__icon">${cell.icon}</div>
      <div class="bingo-cell__text">${cell.text}</div>
      ${bingo.includes(i) ? '<div class="bingo-cell__check">✅</div>' : ''}
    </div>`).join('');

  document.querySelectorAll('.bingo-cell').forEach(el => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.i);
      if (bingo.includes(i)) bingo = bingo.filter(x => x !== i);
      else bingo.push(i);
      save.bingo();
      renderBingo();
    });
  });

  const hasBingo = checkBingo();
  document.getElementById('bingo-win-banner').classList.toggle('hidden', !hasBingo);
  document.getElementById('bingo-score').textContent =
    `${bingo.length} / ${cells.filter(c => !c.isFree).length} completed • Click cells to mark`;
}

// ─── Tier List ────────────────────────────────────────────────
const TIER_COLORS = { S: '#ff7675', A: '#fd9644', B: '#ffd32a', C: '#26de81', D: '#45aaf2', F: '#a55eea' };

function openTier() {
  document.getElementById('tier-modal').classList.remove('hidden');
  renderTier();
}
function closeTier() {
  document.getElementById('tier-modal').classList.add('hidden');
}

function allUserMovies() {
  const seen = new Set();
  return [...favorites, ...watchlist, ...history].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id); return true;
  });
}

function renderTier() {
  const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
  const rankedIds = new Set(Object.values(tiers).flat());
  const unranked = allUserMovies().filter(m => !rankedIds.has(m.id));

  document.getElementById('tier-container').innerHTML = TIERS.map(t => `
    <div class="tier-row">
      <div class="tier-label" style="background:${TIER_COLORS[t]}">${t}</div>
      <div class="tier-movies" data-tier="${t}" id="tier-row-${t}">
        ${(tiers[t] || []).map(id => {
    const m = findMovieAnywhere(id) || { id, title: 'Unknown', poster: null };
    return chipHTML(m);
  }).join('')}
      </div>
    </div>`).join('');

  document.getElementById('tier-unranked').innerHTML = unranked.map(chipHTML).join('');

  document.querySelectorAll('.tier-movies').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (!dragging) return;
      const tier = zone.dataset.tier;
      // Remove from all tiers
      Object.keys(tiers).forEach(t => { tiers[t] = (tiers[t] || []).filter(id => id !== dragging.id); });
      if (tier) { if (!tiers[tier]) tiers[tier] = []; tiers[tier].unshift(dragging.id); }
      save.tiers();
      renderTier();
    });
  });

  document.getElementById('tier-unranked').addEventListener('dragover', e => e.preventDefault());
  document.getElementById('tier-unranked').addEventListener('drop', e => {
    e.preventDefault();
    if (!dragging) return;
    Object.keys(tiers).forEach(t => { tiers[t] = (tiers[t] || []).filter(id => id !== dragging.id); });
    save.tiers();
    renderTier();
  });
}

function chipHTML(m) {
  return `<div class="tier-chip" draggable="true" data-id="${m.id}" title="${esc(m.title)}">
    ${m.poster ? `<img src="${m.poster}" alt="${esc(m.title)}"/>` : ''}
    <span>${esc(m.title)}</span>
  </div>`;
}

function bindChipDrag(container) {
  container.querySelectorAll('.tier-chip').forEach(chip => {
    chip.addEventListener('dragstart', () => {
      dragging = findMovieAnywhere(Number(chip.dataset.id)) || { id: Number(chip.dataset.id) };
    });
    chip.addEventListener('dragend', () => { dragging = null; });
  });
}

// Re-bind drag after render
const origRenderTier = renderTier;
function renderTierAndBind() {
  origRenderTier();
  document.querySelectorAll('.tier-chip').forEach(chip => {
    chip.addEventListener('dragstart', () => {
      dragging = findMovieAnywhere(Number(chip.dataset.id)) || { id: Number(chip.dataset.id) };
    });
    chip.addEventListener('dragend', () => { dragging = null; });
  });
}

// ─── Surprise me ─────────────────────────────────────────────
async function surpriseMe() {
  const page = Math.floor(Math.random() * 5) + 1;
  const data = await tmdb(`movie/popular?page=${page}`);
  const movies = (data?.results || []).map(mapMovie).filter(Boolean);
  registerMovies(movies);
  if (movies.length) openModal(movies[Math.floor(Math.random() * movies.length)]);
}

// ─── Event Binding ────────────────────────────────────────────
function bindEvents() {
  // Logo → home
  document.getElementById('logo-btn').addEventListener('click', () => {
    showHomeSections();
    document.getElementById('hero-search-input').value = '';
    document.getElementById('nav-search-input').value = '';
    searchQuery = '';
  });

  // Surprise
  document.getElementById('btn-surprise').addEventListener('click', surpriseMe);

  // Mood chips
  document.querySelectorAll('.mood-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const genreId = chip.dataset.genre;
      const isActive = chip.classList.contains('active');
      document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
      if (isActive) { activeMoodId = null; showHomeSections(); return; }
      chip.classList.add('active');
      activeMoodId = genreId;
      runSearch('', 1, 'popularity.desc', genreId);
    });
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    searchSort = e.target.value;
    if (activeMoodId) runSearch('', 1, searchSort, activeMoodId);
    else if (searchQuery) runSearch(searchQuery, 1, searchSort);
  });

  // Load more
  document.getElementById('btn-load-more').addEventListener('click', () => {
    searchPage++;
    if (activeMoodId) runSearch('', searchPage, searchSort, activeMoodId);
    else runSearch(searchQuery, searchPage, searchSort);
  });

  // Modal
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('movie-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Modal tabs
  document.querySelectorAll('.modal-tab').forEach(btn => {
    btn.addEventListener('click', () => setModalTab(btn.dataset.tab));
  });

  // Navbar buttons
  document.getElementById('btn-watchlist').addEventListener('click', openWatchlistPanel);
  document.getElementById('btn-favorites').addEventListener('click', openFavoritesPanel);
  document.getElementById('btn-streak').addEventListener('click', openStreakPanel);
  document.getElementById('btn-bingo').addEventListener('click', openBingo);
  document.getElementById('btn-tier').addEventListener('click', openTierAndBind);

  // Side panel close
  document.getElementById('side-panel-close').addEventListener('click', closePanel);
  document.getElementById('side-overlay').addEventListener('click', closePanel);
  // About
  document.getElementById('btn-about').addEventListener('click', openAbout);
  document.getElementById('about-close').addEventListener('click', closeAbout);
  document.getElementById('about-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAbout();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAbout(); });
  // Bingo close
  document.getElementById('bingo-close').addEventListener('click', closeBingo);
  document.getElementById('bingo-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBingo();
  });

  // Tier close
  document.getElementById('tier-close').addEventListener('click', closeTier);
  document.getElementById('tier-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeTier();
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    lsSet('cv2_theme', theme);
    applyTheme();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closePanel();
      closeBingo();
      closeTier();
      hideLiveDropdown();
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const heroInput = document.getElementById('hero-search-input');
      const navInput = document.getElementById('nav-search-input');
      (navInput.offsetParent ? navInput : heroInput).focus();
    }
  });

  // Scroll → show nav search
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY > 300;
    document.getElementById('navbar-search-wrap').classList.toggle('visible', scrolled && !document.getElementById('search-section').classList.contains('hidden') === false);
  });
}

function openTierAndBind() {
  document.getElementById('tier-modal').classList.remove('hidden');
  renderTierAndBind();
}

// ─── Init ─────────────────────────────────────────────────────
async function init() {
  applyTheme();
  updateBadges();
  setupSearch();
  bindEvents();
  await loadHome();
}

document.addEventListener('DOMContentLoaded', init);
