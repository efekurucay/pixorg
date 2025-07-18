"use strict";

// --- GENEL FONKSİYONLAR ---
function showStatusMessage(message, isError = false, duration = 3000) {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'alert';
    statusEl.classList.add(isError ? 'alert-danger' : 'alert-success');
    statusEl.classList.remove('d-none');
    setTimeout(() => statusEl.classList.add('d-none'), duration);
}

// --- AYARLAR SAYFASI MANTIĞI ---
const SettingsPage = {
    elements: {},
    userShortcuts: {},

    init() {
        this.cacheElements();
        this.addEventListeners();
        this.loadSettings();
    },

    cacheElements() {
        this.elements = {
            form: document.getElementById('shortcut-form'),
            keyInput: document.getElementById('key-input'),
            actionSelect: document.getElementById('action-select'),
            albumContainer: document.getElementById('album-container'),
            albumSelect: document.getElementById('album-select'),
            shortcutList: document.getElementById('shortcut-list'),
            pickPhotosBtn: document.getElementById('pick-photos-btn'),
        };
    },

    addEventListeners() {
        this.elements.keyInput.addEventListener('keydown', e => {
            e.preventDefault();
            this.elements.keyInput.value = e.key;
        });
        this.elements.actionSelect.addEventListener('change', () => {
            this.elements.albumContainer.classList.toggle('d-none', this.elements.actionSelect.value !== 'album');
        });
        this.elements.form.addEventListener('submit', e => this.saveShortcut(e));
        this.elements.pickPhotosBtn.addEventListener('click', () => PhotoOrganizer.start());
    },

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) throw new Error('Ayarlar yüklenemedi.');
            const data = await response.json();
            this.renderAlbums(data.albums);
            this.renderShortcuts(data.shortcuts);
            this.userShortcuts = data.shortcuts.reduce((acc, s) => {
                acc[s.key] = { action: s.action, albumId: s.album_id, albumName: s.album_name };
                return acc;
            }, {});
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    },

    renderAlbums(albums) {
        if (!albums || albums.length === 0) {
            this.elements.albumSelect.innerHTML = '<option>Yazılabilir albüm bulunamadı.</option>';
            return;
        }
        this.elements.albumSelect.innerHTML = albums
            .filter(album => album.isWriteable)
            .map(album => `<option value="${album.id}">${album.title}</option>`).join('');
    },

    renderShortcuts(shortcuts) {
        if (shortcuts.length === 0) {
            this.elements.shortcutList.innerHTML = '<li class="list-group-item text-muted">Henüz bir kısayol eklenmemiş.</li>';
            return;
        }
        this.elements.shortcutList.innerHTML = shortcuts.map(s => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span><kbd>${s.key}</kbd> <i class="bi bi-arrow-right mx-2"></i> ${s.action === 'trash' ? 'Çöp Kutusu' : `Albüm: <strong>${s.album_name}</strong>`}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="SettingsPage.deleteShortcut(${s.id})"><i class="bi bi-trash"></i></button>
            </li>
        `).join('');
    },

    async saveShortcut(event) {
        event.preventDefault();
        const { keyInput, actionSelect, albumSelect } = this.elements;
        const payload = {
            key: keyInput.value,
            action: actionSelect.value,
            album_id: actionSelect.value === 'album' ? albumSelect.value : null,
            album_name: actionSelect.value === 'album' ? albumSelect.options[albumSelect.selectedIndex].text : null
        };
        if (!payload.key || !payload.action) {
            showStatusMessage("Lütfen bir tuş ve eylem seçin.", true);
            return;
        }

        try {
            const response = await fetch('/api/settings/shortcut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Kısayol kaydedilemedi.');
            showStatusMessage("Kısayol başarıyla kaydedildi.");
            this.elements.form.reset();
            this.elements.albumContainer.classList.add('d-none');
            this.loadSettings();
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    },

    async deleteShortcut(id) {
        if (!confirm('Bu kısayolu silmek istediğinizden emin misiniz?')) return;
        try {
            const response = await fetch(`/api/settings/shortcut/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Kısayol silinemedi.');
            showStatusMessage('Kısayol silindi.');
            this.loadSettings();
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    }
};

// --- FOTOĞRAF DÜZENLEYİCİ MANTIĞI ---
const PhotoOrganizer = {
    elements: {},
    mediaQueue: [],
    currentMediaIndex: -1,
    googleToken: null,

    start() {
        this.cacheElements();
        this.loadGoogleApis();
    },

    cacheElements() {
        this.elements = {
            container: document.getElementById('organizer-container'),
            loadingSpinner: document.getElementById('loading-spinner'),
            mediaDisplay: document.getElementById('media-display'),
            videoDisplay: document.getElementById('video-display'),
            mediaInfo: document.getElementById('media-info'),
            progressInfo: document.getElementById('progress-info'),
        };
    },

    loadGoogleApis() {
        gapi.load('client:picker', async () => {
            this.googleToken = gapi.client.oauth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token;
            this.createPicker();
        });
    },

    createPicker() {
        const view = new google.picker.View(google.picker.ViewId.PHOTOS);
        view.setMimeTypes("image/*,video/*");
        const picker = new google.picker.PickerBuilder()
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setAppId(window.googleApiClientId)
            .setOAuthToken(this.googleToken)
            .addView(view)
            .setCallback(this.pickerCallback.bind(this))
            .build();
        picker.setVisible(true);
    },

    async pickerCallback(data) {
        if (data[google.picker.Action.PICKED]) {
            const mediaIds = data[google.picker.Response.DOCUMENTS].map(doc => doc.id);
            if (mediaIds.length === 0) return;
            
            this.elements.container.classList.remove('d-none');
            this.elements.loadingSpinner.classList.remove('d-none');
            
            try {
                const response = await fetch('/api/media/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mediaIds })
                });
                if (!response.ok) throw new Error('Seçilen medya bilgileri alınamadı.');
                const result = await response.json();
                this.mediaQueue = result.mediaItemResults.map(item => item.mediaItem).filter(Boolean);
                this.currentMediaIndex = 0;
                this.setupKeyListener();
                this.displayCurrentMedia();
            } catch (error) {
                showStatusMessage(error.message, true);
                this.elements.loadingSpinner.classList.add('d-none');
            }
        }
    },

    displayCurrentMedia() {
        this.elements.loadingSpinner.classList.add('d-none');
        
        if (this.currentMediaIndex >= this.mediaQueue.length) {
            this.endSession();
            return;
        }

        const mediaItem = this.mediaQueue[this.currentMediaIndex];
        const { mediaDisplay, videoDisplay, mediaInfo, progressInfo } = this.elements;
        mediaDisplay.classList.add('d-none');
        videoDisplay.classList.add('d-none');

        const isVideo = mediaItem.mimeType.startsWith('video');
        const displayElement = isVideo ? videoDisplay : mediaDisplay;
        
        displayElement.src = `${mediaItem.baseUrl}=${isVideo ? 'dv' : 'w1600-h900'}`;
        displayElement.classList.remove('d-none');
        
        const creationDate = new Date(mediaItem.mediaMetadata.creationTime);
        mediaInfo.textContent = `${mediaItem.filename} - ${creationDate.toLocaleDateString('tr-TR')}`;
        progressInfo.textContent = `İlerleme: ${this.currentMediaIndex + 1} / ${this.mediaQueue.length}`;
    },

    setupKeyListener() {
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
    },

    async handleKeyPress(event) {
        if (this.currentMediaIndex === -1) return;

        const shortcut = SettingsPage.userShortcuts[event.key];
        const mediaItem = this.mediaQueue[this.currentMediaIndex];
        if (!shortcut || !mediaItem) return;
        
        event.preventDefault();

        try {
            const response = await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaId: mediaItem.id,
                    action: shortcut.action,
                    albumId: shortcut.albumId
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'İşlem başarısız.');
            
            const successMessage = shortcut.action === 'trash' ?
                'Çöp kutusuna taşındı.' : `"${shortcut.albumName}" albümüne taşındı.`;
            showStatusMessage(successMessage);
            
            this.currentMediaIndex++;
            this.displayCurrentMedia();
            
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    },

    endSession() {
        showStatusMessage('Tüm seçilen fotoğraflar düzenlendi!', false, 5000);
        this.elements.container.classList.add('d-none');
        this.currentMediaIndex = -1;
        this.mediaQueue = [];
        document.removeEventListener('keydown', this.handleKeyPress.bind(this));
    }
};

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', () => SettingsPage.init());
