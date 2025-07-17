from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), nullable=False)
    shortcuts = db.relationship('Shortcut', backref='user', lazy='dynamic', cascade="all, delete-orphan")

    def __init__(self, google_id, name, email):
        self.google_id = google_id
        self.name = name
        self.email = email

    def __repr__(self):
        return f'<User {self.name}>'

class Shortcut(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    key = db.Column(db.String(20), nullable=False)
    action = db.Column(db.String(20), nullable=False) # 'trash' veya 'album'
    album_id = db.Column(db.String(128), nullable=True)
    album_name = db.Column(db.String(128), nullable=True)

    def __init__(self, user_id, key, action, album_id=None, album_name=None):
        self.user_id = user_id
        self.key = key
        self.action = action
        self.album_id = album_id
        self.album_name = album_name
    
    def __repr__(self):
        return f'<Shortcut {self.key} -> {self.action}>'
