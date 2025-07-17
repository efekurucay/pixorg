# PhotoSwipe - Google Photos Organize Aracı

Klavye kısayolları ile Google Photos arşivinizi ışık hızında organize edin! Fotoğrafları tek tuşla albümlere taşıyın veya çöp kutusuna atın.

## 🚀 Özellikler

- **Hızlı Gezinme**: Fotoğraflarınızda klavye ile hızla gezinin
- **Tek Tuş İşlemler**: Özel klavye kısayolları tanımlayın
- **Albüm Yönetimi**: Fotoğrafları doğrudan albümlere taşıyın
- **Çöp Kutusu**: Silmek istediğiniz fotoğrafları güvenli bir albümde toplayın
- **Modern Arayüz**: Bootstrap 5 ile tasarlanmış karanlık tema
- **Güvenli**: Google OAuth 2.0 ile kimlik doğrulama

## 📋 Gereksinimler

- Python 3.7+
- Google Cloud Account
- Google Photos Library API erişimi

## ⚙️ Kurulum

### 1. Python Sanal Ortamı Hazırlama

```bash
# Sanal ortam oluşturun
python -m venv venv

# Sanal ortamı aktifleştirin
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Gerekli paketleri yükleyin
pip install -r requirements.txt
```

### 2. Google Cloud API Yapılandırması

1. [Google Cloud Console](https://console.cloud.google.com/)'a gidin
2. Yeni proje oluşturun veya mevcut projeyi seçin
3. **API'ler ve Hizmetler > Kitaplık** → "Google Photos Library API" araması yapın → **Etkinleştir**
4. **API'ler ve Hizmetler > Kimlik Bilgileri** → **Kimlik Bilgileri Oluştur** → **OAuth istemci kimliği**
5. Uygulama türü: **Web uygulaması**
6. **Yetkilendirilmiş yönlendirme URI'leri**:
   ```
   http://127.0.0.1:5000/auth/callback
   ```
7. **Client ID** ve **Client Secret** değerlerini kopyalayın

### 3. Ortam Değişkenlerini Yapılandırma

`.env.example` dosyasını `.env` olarak kopyalayın:

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyip kendi değerlerinizi girin:

```env
SECRET_KEY='rastgele-güvenli-anahtar-buraya'
GOOGLE_CLIENT_ID='google-client-id-buraya'
GOOGLE_CLIENT_SECRET='google-client-secret-buraya'
```

**⚠️ ÖNEMLİ**: `.env` dosyasını asla Git'e commitlemeyin!

### 4. Uygulamayı Çalıştırma

```bash
# Flask uygulamasını başlatın
flask run

# Veya doğrudan Python ile:
python app.py
```

Tarayıcınızda http://127.0.0.1:5000 adresine gidin.

## 🎮 Kullanım

1. **Giriş Yapın**: Google hesabınızla güvenli giriş yapın
2. **Kısayol Tanımlayın**: Ayarlar sayfasından klavye kısayolları oluşturun
   - Örnek: `d` tuşu → "Silinecekler" albümü
   - Örnek: `v` tuşu → "Tatil" albümü
   - Örnek: `x` tuşu → Çöp kutusu
3. **Organize Edin**: Ana sayfada fotoğraflar arasında gezinin ve tanımladığınız tuşlara basarak organize edin

## 📂 Proje Yapısı

```
photo-organizer/
├── app.py              # Ana Flask uygulaması
├── config.py           # Yapılandırma ayarları
├── models.py           # Veritabanı modelleri
├── requirements.txt    # Python bağımlılıkları
├── .env               # Ortam değişkenleri (oluşturulacak)
├── .env.example       # Ortam değişkenleri örneği
├── static/
│   ├── css/
│   │   └── style.css  # Özel CSS stilleri
│   └── js/
│       └── main.js    # JavaScript mantığı
└── templates/
    ├── _base.html     # Ana template
    ├── index.html     # Uygulama sayfası
    ├── login.html     # Giriş sayfası
    └── settings.html  # Ayarlar sayfası
```

## 🔧 API Endpoints

- `GET /` - Ana sayfa / yönlendirme
- `GET /login` - Google OAuth başlatma
- `GET /auth/callback` - OAuth callback
- `GET /app` - Ana uygulama sayfası
- `GET /settings` - Ayarlar sayfası
- `GET /api/media/random` - Rastgele medya getir
- `POST /api/action` - Medya üzerinde işlem yap
- `GET /api/settings` - Kullanıcı ayarlarını getir
- `POST /api/settings/shortcut` - Yeni kısayol ekle
- `DELETE /api/settings/shortcut/<id>` - Kısayol sil

## 🛡️ Güvenlik

- OAuth 2.0 ile güvenli kimlik doğrulama
- HTTPS (production için önerilen)
- Hassas bilgiler ortam değişkenlerinde saklanır
- CSRF koruması için Flask-WTF eklenmesi önerilir

## 🚧 Gelecekteki İyileştirmeler

- [ ] Sayfalama ile daha büyük arşiv desteği
- [ ] Filtreleme seçenekleri (tarih, tür vb.)
- [ ] Toplu işlem desteği
- [ ] CSRF koruması
- [ ] Docker desteği
- [ ] Mobil responsive iyileştirmeler

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## ⚠️ Sorumluluk Reddi

Bu uygulama Google Photos verilerinizle etkileşim kurar. Lütfen dikkatli kullanın ve önemli fotoğraflarınızı yedeklemeyi unutmayın. 