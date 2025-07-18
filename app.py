import os
import requests
from flask import Flask, session, redirect, request, url_for, render_template, jsonify
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest, AuthorizedSession
from functools import wraps

from config import Config
from models import db, User, Shortcut

# Flask uygulamasını başlat
app = Flask(__name__)
app.config.from_object(Config)

# Veritabanını uygulamaya bağla
db.init_app(app)

# --- DECORATORS & HELPER FONKSİYONLAR ---

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'credentials' not in session:
            return redirect(url_for('login'))
        # Burada token süresinin dolup dolmadığını kontrol edip refresh token kullanabilirsiniz.
        # google-auth kütüphanesi bunu büyük ölçüde otomatize eder.
        return f(*args, **kwargs)
    return decorated_function

def api_error(message, status_code=400):
    response = jsonify({'error': message})
    response.status_code = status_code
    return response

def get_authorized_session():
    """Kimlik doğrulaması yapılmış ve kullanıma hazır bir requests session nesnesi döner."""
    if 'credentials' not in session:
        return None
    
    creds = Credentials(**session['credentials'])

    # Token'ın süresinin dolup dolmadığını kontrol et ve gerekirse yenile
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleAuthRequest())
        # Yenilenen credentials'ı session'a geri kaydet
        session['credentials'] = {
            'token': creds.token,
            'refresh_token': creds.refresh_token,
            'token_uri': creds.token_uri,
            'client_id': creds.client_id,
            'client_secret': creds.client_secret,
            'scopes': creds.scopes
        }

    # google-auth kütüphanesinin kendi yetkilendirilmiş session nesnesini kullan
    authed_session = AuthorizedSession(creds)
    return authed_session

def _move_media_to_album(g_session, media_id, album_id):
    """Verilen medyayı verilen albüme taşıyan temel fonksiyon."""
    url = f"https://photoslibrary.googleapis.com/v1/albums/{album_id}:batchAddMediaItems"
    payload = {'mediaItemIds': [media_id]}
    response = g_session.post(url, json=payload)
    if response.status_code == 200:
        return jsonify({'success': True})
    return api_error(f"API Hatası: Medya albüme taşınamadı. Detay: {response.text}", response.status_code)

def get_or_create_album_by_title(g_session, title):
    """Verilen başlıkta bir albüm arar, bulamazsa oluşturur."""
    response = g_session.get("https://photoslibrary.googleapis.com/v1/albums?pageSize=50")
    if response.status_code != 200:
        return None
    
    albums = response.json().get('albums', [])
    existing_album = next((album for album in albums if album.get('title') == title), None)
    
    if existing_album:
        return existing_album
    else:
        create_payload = {'album': {'title': title}}
        response = g_session.post("https://photoslibrary.googleapis.com/v1/albums", json=create_payload)
        return response.json() if response.status_code == 200 else None

# --- TEMEL ROTALAR (Sayfa Gezintisi) ---

@app.route('/')
def home():
    if 'credentials' in session:
        return redirect(url_for('app_main'))
    return render_template('login.html')

@app.route('/login')
def login():
    # Kimlik doğrulama akışını başlat
    flow = Flow.from_client_config(
        {'web': {
            'client_id': app.config['GOOGLE_CLIENT_ID'],
            'client_secret': app.config['GOOGLE_CLIENT_SECRET'],
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'redirect_uris': [url_for('auth_callback', _external=True)]
        }},
        scopes=app.config['PHOTOS_SCOPE']
    )
    flow.redirect_uri = url_for('auth_callback', _external=True)
    authorization_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent')
    session['state'] = state
    return redirect(authorization_url)

@app.route('/auth/callback')
def auth_callback():
    # Google'dan gelen yanıtı işle
    flow = Flow.from_client_config(
        {'web': {
            'client_id': app.config['GOOGLE_CLIENT_ID'],
            'client_secret': app.config['GOOGLE_CLIENT_SECRET'],
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'redirect_uris': [request.base_url]
        }},
        scopes=app.config['PHOTOS_SCOPE'],
        state=session['state']
    )
    flow.redirect_uri = url_for('auth_callback', _external=True)
    try:
        flow.fetch_token(authorization_response=request.url)
        creds = flow.credentials
        print(f"DEBUG - Token credentials: {creds.to_json()}")
        print(f"DEBUG - Access token: {creds.token}")

        # Token ile doğrudan test isteği at
        test_session = requests.Session()
        test_session.headers.update({'Authorization': f'Bearer {creds.token}'})
        test_response = test_session.get('https://www.googleapis.com/oauth2/v3/userinfo')
        print(f"DEBUG - userinfo test status: {test_response.status_code}, body: {test_response.text}")
        if test_response.status_code != 200:
            print(f"DEBUG - Token Test Failed: {test_response.status_code} - {test_response.text}")
            session.clear()
            return redirect(url_for('home'))

        # Token başarılı, session'a kaydet
        session['credentials'] = {
            'token': creds.token,
            'refresh_token': creds.refresh_token,
            'token_uri': flow.client_config['token_uri'],
            'client_id': flow.client_config['client_id'],
            'client_secret': flow.client_config['client_secret'],
            'scopes': creds.scopes
        }

        user_info = test_response.json()
        print(f"DEBUG - user_info: {user_info}")
        google_id = user_info.get('sub') or user_info.get('id')
        user_name = user_info.get('name', 'Bilinmeyen Kullanıcı')
        user_email = user_info.get('email', '')
        if not google_id:
            print("DEBUG - Google ID alınamadı")
            session.clear()
            return redirect(url_for('home'))
        user = User.query.filter_by(google_id=google_id).first()
        if not user:
            user = User(google_id=google_id, name=user_name, email=user_email)
            db.session.add(user)
        else:
            user.name = user_name
            user.email = user_email
        db.session.commit()
        session['user_db_id'] = user.id
        print(f"DEBUG - User saved with ID: {user.id}")
        return redirect(url_for('app_main'))
    except Exception as e:
        import traceback
        print(f"DEBUG - OAuth Error: {e}")
        print(traceback.format_exc())
        session.clear()
        return redirect(url_for('home'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/app')
@login_required
def app_main():
    # API kısıtlamaları nedeniyle ana sayfa artık doğrudan ayarlara yönlendiriyor.
    return redirect(url_for('settings'))

@app.route('/settings')
@login_required
def settings():
    return render_template('settings.html')

# --- API ENDPOINTS (JavaScript tarafından çağrılır) ---

@app.route('/api/media/get', methods=['POST'])
@login_required
def get_media_details():
    media_ids = request.json.get('mediaIds')
    if not media_ids:
        return api_error('Eksik parametre: mediaIds gerekli.', 400)
    
    g_session = get_authorized_session()
    if not g_session:
        return api_error('Oturum yetkilendirilemedi.', 401)
    
    # Google Photos API'si batchGet ile tek seferde 50 öğe alabilir.
    url = "https://photoslibrary.googleapis.com/v1/mediaItems:batchGet"
    params = {'mediaItemIds': media_ids}
    
    try:
        response = g_session.get(url, params=params)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.HTTPError as err:
        print(f"DEBUG - API Hatası: {err.response.text}")
        return api_error(f"Medya detayları getirilemedi: {err.response.json().get('error', {}).get('message', 'Bilinmeyen API hatası')}", err.response.status_code)
    except Exception as e:
        print(f"DEBUG - Genel Hata: {e}")
        return api_error(f"Beklenmedik bir hata oluştu: {e}", 500)

@app.route('/api/action', methods=['POST'])
@login_required
def perform_action():
    data = request.json
    if not data:
        return api_error('Geçersiz istek: JSON verisi bulunamadı.', 400)
    g_session = get_authorized_session()
    if not g_session:
        return api_error('Oturum yetkilendirilemedi.', 401)
    action = data.get('action')
    media_id = data.get('mediaId')

    if not all([action, media_id]):
        return api_error('Eksik parametre: action ve mediaId gerekli.')

    if action == 'trash':
        trash_album = get_or_create_album_by_title(g_session, app.config['TRASH_ALBUM_TITLE'])
        if not trash_album:
            return api_error('Çöp Kutusu albümü bulunamadı veya oluşturulamadı.')
        return _move_media_to_album(g_session, media_id, trash_album['id'])
    
    elif action == 'album':
        album_id = data.get('albumId')
        if not album_id:
            return api_error('Eksik parametre: action "album" ise albumId gerekli.')
        return _move_media_to_album(g_session, media_id, album_id)
        
    return api_error('Geçersiz eylem türü.')

@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings_data():
    user = db.session.get(User, session.get('user_db_id'))
    if not user:
        return api_error('Kullanıcı bulunamadı.', 404)
    g_session = get_authorized_session()
    if not g_session:
        return api_error('Oturum yetkilendirilemedi.', 401)
    
    shortcuts = [{
        'id': s.id, 'key': s.key, 'action': s.action, 
        'album_id': s.album_id, 'album_name': s.album_name
    } for s in user.shortcuts]

    albums_response = g_session.get("https://photoslibrary.googleapis.com/v1/albums?pageSize=50")
    
    return jsonify({
        'shortcuts': shortcuts, 
        'albums': albums_response.json().get('albums', []) if albums_response.status_code == 200 else []
    })

@app.route('/api/settings/shortcut', methods=['POST'])
@login_required
def save_shortcut():
    data = request.json
    user = db.session.get(User, session.get('user_db_id'))
    if not user:
        return api_error('Kullanıcı bulunamadı.', 404)
    if not data or 'key' not in data or 'action' not in data:
        return api_error('Eksik parametre: key ve action gerekli.', 400)

    new_shortcut = Shortcut(
        user_id=user.id,
        key=data['key'],
        action=data['action'],
        album_id=data.get('album_id'),
        album_name=data.get('album_name')
    )
    db.session.add(new_shortcut)
    db.session.commit()
    return jsonify({'success': True, 'id': new_shortcut.id})

@app.route('/api/settings/shortcut/<int:shortcut_id>', methods=['DELETE'])
@login_required
def delete_shortcut(shortcut_id):
    user = db.session.get(User, session.get('user_db_id'))
    if not user:
        return api_error('Kullanıcı bulunamadı.', 404)
    shortcut = Shortcut.query.filter_by(id=shortcut_id, user_id=user.id).first()
    if shortcut:
        db.session.delete(shortcut)
        db.session.commit()
        return jsonify({'success': True})
    return api_error('Kısayol bulunamadı veya silme yetkiniz yok.', 404)

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    with app.app_context():
        db.create_all() # Veritabanı ve tabloları uygulama başlamadan oluştur
    app.run(host="127.0.0.1", port=5000, debug=True)
