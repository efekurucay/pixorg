"use strict";

document.addEventListener('DOMContentLoaded', () => {
    // URL'e göre doğru JS modülünü çalıştır
    if (window.location.pathname.includes('/app')) {
        AppPage.init();
    } else if (window.location.pathname.includes('/settings')) {
        SettingsPage.init();
    }
});

// GENEL FONKSİYONLAR
function showStatusMessage(message, isError = false) {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'alert'; // Önce sınıfları sıfırla
    statusEl.classList.add(isError ? 'alert-danger' : 'alert-success');
    statusEl.classList.remove('d-none');
    setTimeout(() => {
        statusEl.classList.add('d-none');
    }, 3000);
}

// ANA UYGULAMA SAYFASI MANTIĞI
const AppPage = {
    mediaCache: [],
    userShortcuts: {},
    currentMediaItem: null,

    elements: {
        loadingSpinner: null,
        mediaDisplay: null,
        videoDisplay: null,
        mediaInfo: null
    },

    async init() {
        // Elementleri bir kere bul ve sakla
        this.elements.loadingSpinner = document.getElementById('loading-spinner');
        this.elements.mediaDisplay = document.getElementById('media-display');
        this.elements.videoDisplay = document.getElementById('video-display');
        this.elements.mediaInfo = document.getElementById('media-info');
        
        await this.loadShortcuts();
        this.setupKeyListener();
        this.loadNextMedia();
    },

    async loadShortcuts() {
        try {
            const response = await fetch('/api/settings');
            if (!response.ok) throw new Error('Kısayollar yüklenemedi.');
            const data = await response.json();
            this.userShortcuts = data.shortcuts.reduce((acc, s) => {
                acc[s.key] = { action: s.action, albumId: s.album_id, albumName: s.album_name };
                return acc;
            }, {});
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    },

    async fetchMedia() {
        this.elements.loadingSpinner.classList.remove('d-none');
        this.elements.mediaDisplay.classList.add('d-none');
        this.elements.videoDisplay.classList.add('d-none');
        
        try {
            const response = await fetch('/api/media/random');
            if (!response.ok) throw new Error('Yeni medya yüklenirken bir hata oluştu.');
            const data = await response.json();
            if (data.mediaItems && data.mediaItems.length > 0) {
                this.mediaCache = data.mediaItems;
            } else {
                throw new Error('Gösterilecek başka medya kalmadı.');
            }
        } catch (error) {
            this.elements.loadingSpinner.classList.add('d-none');
            showStatusMessage(error.message, true);
        }
    },

    async loadNextMedia() {
        if (this.mediaCache.length === 0) {
            await this.fetchMedia();
            if (this.mediaCache.length === 0) return; // Fetch başarısız olduysa devam etme
        }
        
        // Rastgele bir öğe seç ve önbellekten çıkar
        const randomIndex = Math.floor(Math.random() * this.mediaCache.length);
        this.currentMediaItem = this.mediaCache.splice(randomIndex, 1)[0];
        
        this.displayMedia(this.currentMediaItem);
    },
    
    displayMedia(mediaItem) {
        const { mediaDisplay, videoDisplay, loadingSpinner, mediaInfo } = this.elements;
        mediaDisplay.classList.add('d-none');
        videoDisplay.classList.add('d-none');

        const isVideo = mediaItem.mimeType.startsWith('video');
        const displayElement = isVideo ? videoDisplay : mediaDisplay;

        // Daha iyi kalite için URL'i düzenle
        displayElement.src = `${mediaItem.baseUrl}=${isVideo ? 'dv' : 'w1600-h900'}`;

        displayElement.onload = displayElement.oncanplay = () => {
            loadingSpinner.classList.add('d-none');
            displayElement.classList.remove('d-none');
            const creationDate = new Date(mediaItem.mediaMetadata.creationTime);
            mediaInfo.textContent = `${mediaItem.filename} - ${creationDate.toLocaleDateString('tr-TR')}`;
        };
    },

    setupKeyListener() {
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    },

    async handleKeyPress(event) {
        const shortcut = this.userShortcuts[event.key];
        if (!shortcut || !this.currentMediaItem) return;
        event.preventDefault();

        try {
            const response = await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaId: this.currentMediaItem.id,
                    action: shortcut.action,
                    albumId: shortcut.albumId // action 'album' değilse backend bunu dikkate almaz
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'İşlem başarısız.');
            
            let successMessage = shortcut.action === 'trash' ? 
                'Çöp kutusuna taşındı.' : `"${shortcut.albumName}" albümüne taşındı.`;
            showStatusMessage(successMessage);
            this.loadNextMedia();
            
        } catch (error) {
            showStatusMessage(error.message, true);
        }
    }
};

// AYARLAR SAYFASI MANTIĞI
const SettingsPage = {
    elements: {},
    
    init() {
        Object.assign(this.elements, {
            form: document.getElementById('shortcut-form'),
            keyInput: document.getElementById('key-input'),
            actionSelect: document.getElementById('action-select'),
            albumContainer: document.getElementById('album-container'),
            albumSelect: document.getElementById('album-select'),
            shortcutList: document.getElementById('shortcut-list')
        });
        
        this.addEventListeners();
        this.loadSettings();
    },

    addEventListeners() {
        this.elements.keyInput.addEventListener('keydown', e => {
            e.preventDefault();
            this.elements.keyInput.value = e.key;
        });
        this.elements.actionSelect.addEventListener('change', () => {
            this.elements.albumContainer.classList.toggle('d-none', this.elements.actionSelect.value !== 'album');
        });
        this.elements.form.addEventListener('submit', (e) => this.saveShortcut(e));
    },

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if(!response.ok) throw new Error('Ayarlar yüklenemedi.');
            const data = await response.json();
            this.renderAlbums(data.albums);
            this.renderShortcuts(data.shortcuts);
        } catch(error) {
            showStatusMessage(error.message, true);
        }
    },
    
    renderAlbums(albums) {
        this.elements.albumSelect.innerHTML = albums
            .filter(album => album.isWriteable)
            .map(album => `<option value="${album.id}">${album.title}</option>`).join('');
    },

    renderShortcuts(shortcuts) {
        if(shortcuts.length === 0) {
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
        if(!payload.key || !payload.action) {
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
            if(!response.ok) throw new Error(result.error || 'Kısayol kaydedilemedi.');
            
            showStatusMessage("Kısayol başarıyla kaydedildi.");
            this.elements.form.reset();
            this.elements.albumContainer.classList.add('d-none');
            this.loadSettings(); // Listeyi yenile

        } catch(error) {
            showStatusMessage(error.message, true);
        }
    },

    async deleteShortcut(id) {
        if(!confirm('Bu kısayolu silmek istediğinizden emin misiniz?')) return;
        try {
            const response = await fetch(`/api/settings/shortcut/${id}`, { method: 'DELETE' });
            const result = await response.json();
            if(!response.ok) throw new Error(result.error || 'Kısayol silinemedi.');
            
            showStatusMessage('Kısayol silindi.');
            this.loadSettings(); // Listeyi yenile
        } catch(error) {
            showStatusMessage(error.message, true);
        }
    }
}; 