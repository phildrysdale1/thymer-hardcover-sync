/**
 * Hardcover Books — Thymer Collection Plugin
 * Version: 1.2.0
 *
 * Creates one page (record) per book in your Hardcover library.
 * Each record gets: Title, Author, Published, Read Date,
 * Synopsis, Genres, Status, My Rating, Hardcover Rating, Progress, and Banner.
 *
 * Setup:
 * 1. Install as a Collection Plugin on a new "Books" collection
 * 2. Click "Sync Hardcover" in the collection toolbar
 * 3. Enter your Hardcover API key and Cloudflare proxy URL
 *
 * The Cloudflare proxy is required because Hardcover's API blocks
 * direct browser requests (CORS). Deploy hardcover-proxy-worker.js
 * as a Cloudflare Worker to get your proxy URL.
 */

class Plugin extends CollectionPlugin {

    onLoad() {
        this.API_KEY_STORAGE   = 'thymer_hardcover_apikey';
        this.PROXY_URL_STORAGE = 'thymer_hardcover_proxyurl';
        this.SYNC_CACHE_STORAGE = 'thymer_hardcover_synccache';
        this.syncing = false;
        this.FIELDS = {
            title: 'title',
            author: 'author',
            publishedYear: 'published_year',
            status: 'status',
            rating: 'rating',
            hcRating: 'hc_rating',
            progress: 'progress',
            genres: 'genres',
            readDate: 'read_date',
            synopsis: 'synopsis',
            hardcoverId: 'hardcover_id',
        };

        this.ui.injectCSS(this._css());

        // Setup panel — opened when not yet configured
        this.ui.registerCustomPanelType('hardcover-books-setup', (panel) => {
            this._renderSetupPanel(panel);
        });

        // Button in the collection toolbar
        this.addCollectionNavigationButton({
            label: 'Sync Hardcover',
            icon: 'refresh',
            onClick: () => this._onSyncClicked(),
        });
    }

    onUnload() {}

    // -------------------------------------------------------------------------
    // Sync trigger
    // -------------------------------------------------------------------------

    async _onSyncClicked() {
        if (!this._getApiKey() || !this._getProxyUrl()) {
            await this._openSetupPanel();
            return;
        }
        await this._runSync();
    }

    async _openSetupPanel() {
        try {
            const panel = await this.ui.createPanel();
            if (panel) {
                this.ui.setActivePanel(panel);
                panel.navigateToCustomType('hardcover-books-setup');
            }
        } catch (e) {
            this.ui.addToaster({
                title: 'Hardcover',
                message: 'Could not open setup panel: ' + e.message,
                dismissible: true,
                autoDestroyTime: 5000,
            });
        }
    }

    // -------------------------------------------------------------------------
    // Setup panel
    // -------------------------------------------------------------------------

    _renderSetupPanel(panel) {
        const render = () => {
            const el = panel.getElement();
            el.innerHTML = '';
            el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;';

            if (!this._getApiKey() || !this._getProxyUrl()) {
                this._renderSetupForm(el, async (key, proxyUrl) => {
                    this._saveApiKey(key);
                    this._saveProxyUrl(proxyUrl);
                    try {
                        // Verify the key works before proceeding
                        await this._graphql('query { me { id } }');
                        render();
                        this._runSync();
                    } catch (e) {
                        this._saveApiKey('');
                        this._saveProxyUrl('');
                        throw e;
                    }
                });
            } else {
                el.innerHTML = `
                    <div class="hc-setup">
                        <div class="hc-setup-logo">✅</div>
                        <h2 class="hc-setup-title">Hardcover Connected</h2>
                        <p class="hc-setup-desc">Your library is syncing. Click “Sync Hardcover” in the collection toolbar at any time to refresh.</p>
                        <button id="hc-disc" class="hc-btn hc-btn-danger">Disconnect</button>
                    </div>`;
                el.querySelector('#hc-disc').addEventListener('click', () => {
                    this._saveApiKey('');
                    this._saveProxyUrl('');
                    render();
                });
            }
        };
        render();
    }

    _renderSetupForm(container, onConnect) {
        container.innerHTML = `
            <div class="hc-setup">
                <div class="hc-setup-logo">📚</div>
                <h2 class="hc-setup-title">Connect Hardcover</h2>
                <p class="hc-setup-desc">
                    Sync your Hardcover library into this collection.
                    Each book will get its own page with title, author, genres, and more.
                </p>
                <div class="hc-field">
                    <label class="hc-label" for="hc-apikey">Hardcover API Key</label>
                    <input id="hc-apikey" type="password" class="hc-input"
                           placeholder="Paste your API key…" autocomplete="off" />
                    <div class="hc-field-hint">
                        <a href="https://hardcover.app/account/api" target="_blank" class="hc-link">Get your API key ↗</a>
                    </div>
                </div>
                <div class="hc-field">
                    <label class="hc-label" for="hc-proxy">Cloudflare Worker Proxy URL</label>
                    <input id="hc-proxy" type="url" class="hc-input"
                           placeholder="https://hardcover-proxy.yourname.workers.dev" />
                    <div class="hc-field-hint">
                        Required to bypass browser CORS. Deploy
                        <code>hardcover-proxy-worker.js</code> as a Cloudflare Worker
                        and paste its URL here.
                    </div>
                </div>
                <button id="hc-connect" class="hc-btn hc-btn-primary hc-btn-wide">Connect &amp; Sync</button>
                <div id="hc-err" class="hc-error" style="display:none"></div>
            </div>`;

        const inputKey   = container.querySelector('#hc-apikey');
        const inputProxy = container.querySelector('#hc-proxy');
        const btn        = container.querySelector('#hc-connect');
        const err        = container.querySelector('#hc-err');

        inputKey.value   = this._getApiKey();
        inputProxy.value = this._getProxyUrl();

        const attempt = async () => {
            let key   = (inputKey.value   || '').trim();
            let proxy = (inputProxy.value || '').trim();
            if (!key)   { err.textContent = 'Please enter your API key.';   err.style.display = 'block'; return; }
            if (!proxy) { err.textContent = 'Please enter your proxy URL.'; err.style.display = 'block'; return; }
            if (key.toLowerCase().startsWith('bearer ')) key = key.slice(7).trim();
            btn.disabled    = true;
            btn.textContent = 'Connecting…';
            err.style.display = 'none';
            try {
                await onConnect(key, proxy);
            } catch (e) {
                btn.disabled    = false;
                btn.textContent = 'Connect & Sync';
                err.textContent = e.message;
                err.style.display = 'block';
            }
        };

        btn.addEventListener('click', attempt);
        [inputKey, inputProxy].forEach(i =>
            i.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); })
        );
        setTimeout(() => inputKey.focus(), 50);
    }

    // -------------------------------------------------------------------------
    // Main sync
    // -------------------------------------------------------------------------

    async _runSync() {
        if (this.syncing) {
            this.ui.addToaster({ title: 'Hardcover', message: 'Sync already in progress.', dismissible: true, autoDestroyTime: 3000 });
            return;
        }
        this.syncing = true;

        this.ui.addToaster({
            title: 'Hardcover',
            message: 'Fetching your library…',
            dismissible: true,
            autoDestroyTime: 3000,
        });

        try {
            const books = await this._fetchAllBooks();

            // Index existing records by hardcover_id for O(1) lookup
            const existing = await this.collection.getAllRecords();
            const byHcId = new Map();
            const byTitle = new Map();
            for (const rec of existing) {
                const hcId = rec.number(this.FIELDS.hardcoverId);
                if (hcId != null) byHcId.set(hcId, rec);
                const titleKey = this._titleKey(rec.getName() || rec.text(this.FIELDS.title));
                if (titleKey && !byTitle.has(titleKey)) byTitle.set(titleKey, rec);
            }

            const cache = this._loadSyncCache();
            const newCache = {};
            let created = 0, updated = 0, skipped = 0;

            for (const book of books) {
                const fp = this._bookFingerprint(book);
                newCache[book.id] = fp;

                if (byHcId.has(book.id)) {
                    if (cache[book.id] === fp) { skipped++; continue; }
                    await this._applyToRecord(byHcId.get(book.id), book);
                    await this._sleep(0);
                    updated++;
                } else if (byTitle.has(this._titleKey(book.title))) {
                    await this._applyToRecord(byTitle.get(this._titleKey(book.title)), book);
                    await this._sleep(0);
                    updated++;
                } else {
                    await this._createRecord(book);
                    await this._sleep(0);
                    created++;
                }
            }

            this._saveSyncCache(newCache);

            this.ui.addToaster({
                title: 'Hardcover sync complete',
                message: created + ' created, ' + updated + ' updated, ' + skipped + ' unchanged',
                dismissible: true,
                autoDestroyTime: 5000,
            });
        } catch (e) {
            this.ui.addToaster({
                title: 'Hardcover sync failed',
                message: e.message,
                dismissible: true,
                autoDestroyTime: 10000,
            });
        } finally {
            this.syncing = false;
        }
    }

    // -------------------------------------------------------------------------
    // Record create / update
    // -------------------------------------------------------------------------

    async _createRecord(book) {
        const guid = this.collection.createRecord(book.title);
        if (!guid) return;
        const record = await this._waitForRecord(guid);
        if (!record) return;
        await this._applyToRecord(record, book);
    }

    async _waitForRecord(guid, attempts = 10, delayMs = 50) {
        for (let i = 0; i < attempts; i++) {
            const records = await this.collection.getAllRecords();
            const record = records.find(r => r && r.guid === guid) || null;
            if (record) return record;
            await this._sleep(delayMs);
        }
        return null;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _applyToRecord(record, book) {
        const set = (fieldName, value) => {
            if (value == null || value === '') return;
            if (Array.isArray(value) && value.length === 0) return;
            const prop = record.prop(fieldName);
            if (!prop) return;
            prop.set(value);
        };

        set(this.FIELDS.title, book.title);
        set(this.FIELDS.author, book.author);
        this._applyPublishedYear(record, book.publishedYear);
        set(this.FIELDS.readDate, book.readDate);
        set(this.FIELDS.synopsis, book.synopsis);
        this._applyRatingChoice(record, this.FIELDS.rating, book.rating);
        this._applyRatingChoice(record, this.FIELDS.hcRating, book.hcRating);
        this._setOrClear(record, this.FIELDS.progress, book.progress);
        set(this.FIELDS.hardcoverId, book.id);

        const statusProp = record.prop(this.FIELDS.status);
        if (book.status && statusProp) {
            statusProp.setChoice(book.status);
        }

        set(this.FIELDS.genres, book.genres);
        this._applyBanner(record, book.coverUrl, book.title);
    }

    // -------------------------------------------------------------------------
    // Hardcover API
    // -------------------------------------------------------------------------

    async _fetchAllBooks() {
        const queryWithObjectCachedImage = `
            query GetHardcoverLibrary {
                me {
                    user_books(
                        where: { status_id: { _in: [1, 2, 3, 4, 5] } }
                        order_by: { updated_at: desc }
                        limit: 500
                    ) {
                        book_id
                        status_id
                        rating
                        book {
                            title
                            rating
                            release_year
                            release_date
                            description
                            cached_tags
                            cached_image {
                                url
                            }
                            cached_contributors
                            contributions {
                                author {
                                    name
                                }
                            }
                        }
                        user_book_reads(
                            order_by: { started_at: desc }
                            limit: 1
                        ) {
                            progress
                            started_at
                            finished_at
                        }
                    }
                }
            }
        `;

        const queryWithScalarCachedImage = `
            query GetHardcoverLibrary {
                me {
                    user_books(
                        where: { status_id: { _in: [1, 2, 3, 4, 5] } }
                        order_by: { updated_at: desc }
                        limit: 500
                    ) {
                        book_id
                        status_id
                        rating
                        book {
                            title
                            rating
                            release_year
                            release_date
                            description
                            cached_tags
                            cached_image
                            cached_contributors
                            contributions {
                                author {
                                    name
                                }
                            }
                        }
                        user_book_reads(
                            order_by: { started_at: desc }
                            limit: 1
                        ) {
                            progress
                            started_at
                            finished_at
                        }
                    }
                }
            }
        `;

        let data;
        try {
            data = await this._graphql(queryWithObjectCachedImage);
        } catch (e) {
            const msg = e && e.message ? e.message : '';
            if (msg.includes('unexpected subselection set for non-object field')) {
                data = await this._graphql(queryWithScalarCachedImage);
            } else {
                throw e;
            }
        }

        const me = Array.isArray(data.me) ? data.me[0] : data.me;
        const userBooks = me && Array.isArray(me.user_books) ? me.user_books : [];
        return userBooks.map(ub => this._mapBook(ub));
    }

    _mapBook(ub) {
        const book  = ub.book || {};
        const reads = ub.user_book_reads || [];
        const read  = reads[0] || null;
        const rating = typeof ub.rating === 'number' ? ub.rating : parseFloat(ub.rating);
        const hcRating = typeof book.rating === 'number' ? book.rating : parseFloat(book.rating);
        const progress = this._extractProgress(ub.status_id, read);
        const authorNames = this._extractAuthorNames(book.contributions);
        const fallbackAuthorNames = this._extractAuthorNamesFromCachedContributors(book.cached_contributors);
        const mergedAuthorNames = authorNames.length ? authorNames : fallbackAuthorNames;
        const genres = this._extractGenres(book);

        return {
            id:            ub.book_id,
            title:         book.title || 'Unknown',
            author:        mergedAuthorNames.join(', '),
            publishedYear: book.release_year || this._extractYear(book.release_date),
            readDate:      this._formatReadDate(read),
            synopsis:      book.description ? book.description.replace(/\n+/g, ' ').trim() : null,
            genres:        genres,
            coverUrl:      this._extractCoverUrl(book),
            status:        this._mapStatus(ub.status_id),
            rating:        Number.isFinite(rating) ? rating : null,
            hcRating:      Number.isFinite(hcRating) ? hcRating : null,
            progress:      Number.isFinite(progress) ? progress : null,
        };
    }

    _extractProgress(statusId, read) {
        if (statusId !== 2 && statusId !== 5) return null;
        if (!read) return null;
        const progress = typeof read.progress === 'number' ? read.progress : parseFloat(read.progress);
        return Number.isFinite(progress) ? progress : null;
    }

    _setOrClear(record, fieldName, value) {
        const prop = record.prop(fieldName);
        if (!prop) return;
        if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
            this._clearProperty(prop);
            return;
        }
        prop.set(value);
    }

    _applyRatingChoice(record, fieldName, value) {
        const prop = record.prop(fieldName);
        if (!prop) return;
        const choiceId = this._ratingToChoiceId(value);
        if (!choiceId) {
            this._clearProperty(prop);
            return;
        }
        prop.setChoice(choiceId);
    }

    _ratingToChoiceId(value) {
        const numeric = typeof value === 'number' ? value : parseFloat(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        const rounded = Math.round(numeric * 2) / 2;
        const clamped = Math.max(0.5, Math.min(5, rounded));
        const whole = Math.floor(clamped);
        const half = Math.abs(clamped - whole) === 0.5 ? '5' : '0';
        return 'stars_' + whole + '_' + half;
    }

    _clearProperty(prop) {
        const count = prop.count();
        for (let i = count - 1; i >= 0; i--) {
            prop.removeValueAt(i);
        }
    }

    _applyPublishedYear(record, publishedYear) {
        const prop = record.prop(this.FIELDS.publishedYear);
        if (!prop) return;
        if (!publishedYear) {
            this._clearProperty(prop);
            return;
        }

        const dt = this._dateOnlyFromHardcoverValue(publishedYear);
        if (!dt) {
            this._clearProperty(prop);
            return;
        }
        prop.set(dt.value());
    }

    _dateOnlyFromHardcoverValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return DateTime.dateOnly(value, 0, 1);
        }

        const raw = String(value || '').trim();
        if (!raw) return null;

        const match = raw.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = match[2] ? parseInt(match[2], 10) - 1 : 0;
            const day = match[3] ? parseInt(match[3], 10) : 1;
            if (Number.isFinite(year) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                return DateTime.dateOnly(year, month, day);
            }
        }

        return DateTime.parseDateTimeString(raw);
    }

    _extractAuthorNames(contributions) {
        if (!Array.isArray(contributions)) return [];
        const unique = new Set();
        for (const c of contributions) {
            const name = c && c.author && typeof c.author.name === 'string' ? c.author.name.trim() : '';
            if (name) unique.add(name);
            if (unique.size >= 3) break;
        }
        return Array.from(unique);
    }

    _extractAuthorNamesFromCachedContributors(cachedContributors) {
        if (!Array.isArray(cachedContributors)) return [];
        const unique = new Set();
        for (const c of cachedContributors) {
            if (typeof c === 'string' && c.trim()) unique.add(c.trim());
            else if (c && typeof c.name === 'string' && c.name.trim()) unique.add(c.name.trim());
            if (unique.size >= 3) break;
        }
        return Array.from(unique);
    }

    _extractGenres(book) {
        const tags = this._extractGenresFromCachedTags(book.cached_tags);
        return tags.slice(0, 5);
    }

    _extractGenresFromCachedTags(cachedTags) {
        if (!cachedTags || typeof cachedTags !== 'object') return [];

        const genreBucket = cachedTags.Genre || cachedTags.genre || cachedTags.GENRE || [];
        if (!Array.isArray(genreBucket)) return [];

        const out = [];
        const seen = new Set();
        for (const item of genreBucket) {
            const raw = typeof item === 'string'
                ? item
                : (item && typeof item.tag === 'string' ? item.tag : '');
            const tag = raw.trim();
            if (!tag) continue;
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(key);
        }
        return out;
    }

    _extractCoverUrl(book) {
        const image = book.cached_image;
        if (!image) return null;
        if (typeof image === 'string') return image;
        if (typeof image === 'object' && typeof image.url === 'string' && image.url) return image.url;
        return null;
    }

    _buildImageFileValue(title, coverUrl) {
        const safeTitle = (title || 'book').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'book';
        return {
            name: safeTitle + '-cover.jpg',
            error: null,
            guid: null,
            imgData: null,
            imgUrl: coverUrl,
            imgClass: null,
        };
    }

    _applyBanner(record, coverUrl, title) {
        if (!coverUrl) return;

        try {
            record.setBanner(this._buildImageFileValue(title, coverUrl));
        } catch (e) {
            // Ignore banner errors so property sync still succeeds.
        }
    }

    _extractYear(releaseDate) {
        if (!releaseDate) return null;
        const y = parseInt(releaseDate.slice(0, 4), 10);
        return isNaN(y) ? null : y;
    }

    _formatReadDate(read) {
        if (!read) return null;
        const dateStr = read.finished_at || read.started_at;
        if (!dateStr) return null;
        // Hardcover dates are YYYY-MM-DD; if day is 01 it often means only month is known
        const parts = dateStr.slice(0, 10).split('-');
        if (parts.length < 2) return parts[0]; // year only
        const year  = parts[0];
        const month = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'][parseInt(parts[1], 10) - 1];
        if (!parts[2] || parts[2] === '01') return month + ' ' + year;
        return parts[2] + ' ' + month + ' ' + year;
    }

    _mapStatus(statusId) {
        switch (statusId) {
            case 1: return 'want_to_read';
            case 2: return 'currently_reading';
            case 3: return 'read';
            case 4: return 'paused';
            case 5: return 'did_not_finish';
            default: return null;
        }
    }

    _titleKey(title) {
        return (title || '').trim().toLowerCase();
    }

    async _graphql(query, variables = {}) {
        let key     = this._getApiKey();
        const proxy = this._getProxyUrl();
        if (!key)   throw new Error('No API key configured.');
        if (!proxy) throw new Error('No proxy URL configured.');
        if (key.toLowerCase().startsWith('bearer ')) key = key.slice(7).trim();

        const res = await fetch(proxy, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (res.status === 401 || res.status === 403) throw new Error('Invalid API key.');
        if (!res.ok) throw new Error('Request failed (' + res.status + '). Check your proxy URL.');

        const json = await res.json();
        if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
        return json.data;
    }

    // -------------------------------------------------------------------------
    // Sync cache (skip records whose data hasn't changed since last sync)
    // -------------------------------------------------------------------------

    _loadSyncCache() {
        try { return JSON.parse(localStorage.getItem(this.SYNC_CACHE_STORAGE) || '{}'); }
        catch { return {}; }
    }

    _saveSyncCache(cache) {
        try { localStorage.setItem(this.SYNC_CACHE_STORAGE, JSON.stringify(cache)); }
        catch {}
    }

    _bookFingerprint(book) {
        return JSON.stringify([
            book.title, book.author, book.publishedYear, book.readDate,
            book.synopsis, book.genres, book.coverUrl, book.status,
            book.rating, book.hcRating, book.progress,
        ]);
    }

    // -------------------------------------------------------------------------
    // Storage (localStorage keeps sensitive data out of Thymer's servers)
    // -------------------------------------------------------------------------

    _getApiKey()     { return localStorage.getItem(this.API_KEY_STORAGE)   || ''; }
    _getProxyUrl()   { return localStorage.getItem(this.PROXY_URL_STORAGE) || ''; }
    _saveApiKey(k)   { k ? localStorage.setItem(this.API_KEY_STORAGE,   k) : localStorage.removeItem(this.API_KEY_STORAGE);   }
    _saveProxyUrl(u) { u ? localStorage.setItem(this.PROXY_URL_STORAGE, u) : localStorage.removeItem(this.PROXY_URL_STORAGE); }

    // -------------------------------------------------------------------------
    // CSS
    // -------------------------------------------------------------------------

    _css() {
        return [
            '.hc-setup{display:flex;flex-direction:column;align-items:center;gap:16px;max-width:440px;width:100%;padding:40px 24px;text-align:center;font-family:var(--font-family,sans-serif)}',
            '.hc-setup-logo{font-size:52px;line-height:1}',
            '.hc-setup-title{font-size:22px;font-weight:700;margin:0;color:var(--fg-default,#333)}',
            '.hc-setup-desc{font-size:14px;color:var(--text-muted,#666);line-height:1.6;margin:0}',
            '.hc-field{width:100%;text-align:left}',
            '.hc-label{font-size:12px;font-weight:600;display:block;margin-bottom:5px;color:var(--fg-default,#333)}',
            '.hc-input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border-default,#ddd);border-radius:7px;font-size:14px;background:var(--bg-default,#fff);color:var(--fg-default,#333);outline:none}',
            '.hc-input:focus{border-color:var(--enum-blue-border,#4a90e2);box-shadow:0 0 0 2px rgba(74,144,226,.15)}',
            '.hc-field-hint{font-size:11px;color:var(--text-muted,#888);margin-top:5px;line-height:1.5}',
            '.hc-btn{padding:7px 16px;border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}',
            '.hc-btn:disabled{opacity:.55;cursor:not-allowed}',
            '.hc-btn-primary{background:var(--enum-blue-bg,#4a90e2);color:var(--enum-blue-fg,#fff)}',
            '.hc-btn-primary:hover:not(:disabled){opacity:.85}',
            '.hc-btn-danger{background:var(--enum-red-bg,#fee2e2);color:var(--enum-red-fg,#c00)}',
            '.hc-btn-danger:hover:not(:disabled){opacity:.8}',
            '.hc-btn-wide{width:100%;padding:10px;font-size:14px}',
            '.hc-error{color:var(--enum-red-fg,#c00);font-size:13px;text-align:center}',
            '.hc-link{color:var(--link-color,#4a90e2);text-decoration:none}',
            '.hc-link:hover{text-decoration:underline}',
        ].join('\n');
    }
}
