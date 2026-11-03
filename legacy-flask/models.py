from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

# Student Table
class Student(db.Model):
    __tablename__ = 'Students'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False, unique=True)
    password = db.Column(db.String(200), nullable=False)
    roll_number = db.Column(db.String(20), nullable=False, unique=True)

#Admin
class Admin(db.Model):
    __tablename__ = 'admins'

    id       = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(50),  unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)   # store hashed password ideally

    def __repr__(self):
        return f'<Admin {self.username}>'

# Events
class Event(db.Model):
    __tablename__ = 'events'

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(100), nullable=False)        # e.g. "Carrom Championship"
    category    = db.Column(db.String(50),  nullable=False)        # sports / cultural / social / paper_presentation / hackathon
    sub_event   = db.Column(db.String(100), nullable=False)        # e.g. "Carrom", "Chess", "Dance"
    description = db.Column(db.Text,        nullable=True)         # short info about the event
    venue       = db.Column(db.String(150), nullable=True)         # where it's held
    event_date  = db.Column(db.Date,        nullable=True)         # date of the event
    max_seats   = db.Column(db.Integer,     default=50)            # optional seat limit
    created_at  = db.Column(db.DateTime,    default=datetime.now(timezone.utc))

    # One event can have many registrations
    registrations = db.relationship('Registration', backref='event', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Event {self.name} | {self.category}>'


#Registration
class Registration(db.Model):
    __tablename__ = 'registrations'

    id              = db.Column(db.Integer, primary_key=True)
    student_name    = db.Column(db.String(100), nullable=False)
    roll_no         = db.Column(db.String(20),  nullable=False)
    email           = db.Column(db.String(120), nullable=False)
    phone           = db.Column(db.String(15),  nullable=True)
    department      = db.Column(db.String(50),  nullable=True)     # e.g. "Computer Science"
    year            = db.Column(db.String(10),  nullable=True)     # e.g. "2nd Year"
    team_name       = db.Column(db.String(100), nullable=True)     # used for hackathons / group events
    registered_at   = db.Column(db.DateTime,    default=datetime.now(timezone.utc))

    # Foreign key → events table
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)

    def __repr__(self):
        return f'<Registration {self.student_name} → Event {self.event_id}>'


