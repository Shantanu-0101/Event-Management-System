from flask import Flask, render_template, request, redirect, session, url_for, flash
from models import db, Admin, Student, Event, Registration
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, timedelta
from werkzeug.utils import secure_filename
import io
import os

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///your_database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = "fa4b1e6579c52d0bbf9a361de6c8635d4333306a3bfead17a8e8e62da826e018"

db.init_app(app)

with app.app_context():
    db.create_all()

#adding admin in DB manually if not already present
with app.app_context():
    if not Admin.query.filter_by(email="admin@csmss.com").first():
        admin = Admin(name="Admin", email="admin@csmss.com", password=generate_password_hash("admin123"))
        db.session.add(admin)
        db.session.commit()

@app.route('/')
def home():
    return render_template('home.html')

#Student singin
@app.route('/student/signup', methods=['GET', 'POST'])
def student_signup():
    if request.method == 'POST':
        name        = request.form.get('name')
        email       = request.form.get('email')
        password    = request.form.get('password')
        roll_number = request.form.get('roll_number')
 
        # Check if email or roll number already exists
        existing = Student.query.filter(
            (Student.email == email) | (Student.roll_number == roll_number)
        ).first()
 
        if existing:
            flash('Email or Roll Number already registered. Please login.', 'danger')
            return redirect(url_for('student_signup'))
 
        new_student = Student(
            name=name,
            email=email,
            password=generate_password_hash(request.form['password']),      # plain text for now; use werkzeug later if needed
            roll_number=roll_number
        )
        db.session.add(new_student)
        db.session.commit()
        flash('Account created! Please login.', 'success')
        return redirect(url_for('student_login'))
 
    return render_template('student/signup.html')


# Student Login
@app.route('/student/login', methods=['GET', 'POST'])
def student_login():
    if request.method == 'POST':
        email    = request.form.get('email')
        password = request.form.get('password')
 
        student = Student.query.filter_by(email=email).first()
 
        if student and check_password_hash(student.password, password):
            session['student_id']   = student.id
            session['student_name'] = student.name
            return redirect(url_for('student_dashboard'))
        else:
            flash('Invalid email or password.', 'danger')
 
    return render_template('student/login.html')

# Student Dashboard
@app.route('/student/dashboard')
def student_dashboard():
    if 'student_id' not in session:
        return redirect(url_for('student_login'))
 
    student = Student.query.get(session['student_id'])
    events = Event.query.all()
 
    # Fetch all registrations for this student by roll number
    registrations = Registration.query.filter_by(roll_no=student.roll_number).all()
    registered_event_ids = {r.event_id for r in registrations}
 
    # Group events by category
    categories = {
        'sports': [],
        'cultural': [],
        'social': [],
        'paper_presentation': [],
        'hackathon': []
    }
    for e in events:
        if e.category in categories:
            # Calculate slots left
            reg_count = len(e.registrations)
            e.slots_left = max(0, e.max_seats - reg_count)
            categories[e.category].append(e)
 
    return render_template(
        'student/dashboard.html',
        student_name=session['student_name'],
        categories=categories,
        registered_event_ids=registered_event_ids,
        registrations=registrations
    )
 

# Logout (Generic)
@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

# Student Logout
@app.route('/student/logout')
def student_logout():
    session.clear()
    flash('Successfully logged out.', 'info')
    return redirect(url_for('home'))

#categories
@app.route('/student/events/<category>')
def student_events(category):
    if 'student_id' not in session:
        return redirect(url_for('student_login'))
 
    student = Student.query.get(session['student_id'])
    events = Event.query.filter_by(category=category).all()
 
    registrations = Registration.query.filter_by(roll_no=student.roll_number).all()
    registered_event_ids = {r.event_id for r in registrations}
 
    # Calculate slots left for each event
    for e in events:
        reg_count = len(e.registrations)
        e.slots_left = max(0, e.max_seats - reg_count)
 
    return render_template(
        'student/events.html',
        events=events,
        category=category,
        registered_event_ids=registered_event_ids
    )


# Register for an Event
@app.route('/student/register/<int:event_id>', methods=['GET', 'POST'])
def student_register(event_id):
    if 'student_id' not in session:
        return redirect(url_for('student_login'))
 
    event = Event.query.get_or_404(event_id)
    student = Student.query.get(session['student_id'])
 
    # Calculate current registrations
    reg_count = len(event.registrations)
    slots_left = max(0, event.max_seats - reg_count)
 
    if request.method == 'POST':
        # Check if this student already registered for this event
        already = Registration.query.filter_by(
            roll_no=student.roll_number,
            event_id=event_id
        ).first()
 
        if already:
            flash('You have already registered for this event.', 'warning')
            return redirect(url_for('student_dashboard'))
 
        # Check seat capacity
        if slots_left <= 0:
            flash('Sorry, this event is already full!', 'danger')
            return redirect(url_for('student_dashboard'))
 
        reg = Registration(
            student_name = request.form.get('student_name'),
            roll_no      = request.form.get('roll_no'),
            email        = request.form.get('email'),
            phone        = request.form.get('phone'),
            department   = request.form.get('department'),
            year         = request.form.get('year'),
            team_name    = request.form.get('team_name'),   # blank for solo events
            event_id     = event_id
        )
        db.session.add(reg)
        db.session.commit()
        flash(f'Successfully registered for {event.name}!', 'success')
        return redirect(url_for('student_dashboard'))
 
    # Pre-fill form with student's own data
    return render_template('student/register.html', event=event, student=student, slots_left=slots_left)



# ══════════════════════════════════════════════
# ADMIN ROUTES
# ══════════════════════════════════════════════
 
# ── Admin Login ──
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
 
        admin = Admin.query.filter_by(email=email).first()
 
        if admin and check_password_hash(admin.password, password):
            session['admin_id']   = admin.id
            session['admin_name'] = admin.name
            return redirect(url_for('admin_dashboard'))
        else:
            flash('Invalid credentials.', 'danger')
 
    return render_template('admin/login.html')
 
 
# ── Admin Logout ──
@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_id', None)
    session.pop('admin_name', None)
    return redirect(url_for('admin_login'))
 
 
# ── Admin Dashboard ──
@app.route('/admin/dashboard')
def admin_dashboard():
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
 
    total_events        = Event.query.count()
    total_registrations = Registration.query.count()
    total_students      = Student.query.count()
 
    return render_template('admin/dashboard.html',
                           admin_name=session['admin_name'],
                           total_events=total_events,
                           total_registrations=total_registrations,
                           total_students=total_students)
 
 
# ── Admin: View All Events ──
@app.route('/admin/events')
def admin_view_events():
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
 
    events = Event.query.order_by(Event.created_at.desc()).all()
    return render_template('admin/view_events.html', events=events)
 
 
# ── Admin: Add Event ──
@app.route('/admin/events/add', methods=['GET', 'POST'])
def admin_add_event():
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
 
    if request.method == 'POST':
        event_date_str = request.form.get('event_date')
        event_date = datetime.strptime(event_date_str, '%Y-%m-%d').date() if event_date_str else None
 
        new_event = Event(
            name        = request.form.get('name'),
            category    = request.form.get('category'),
            sub_event   = request.form.get('sub_event'),
            description = request.form.get('description'),
            venue       = request.form.get('venue'),
            event_date  = event_date,
            max_seats   = request.form.get('max_seats', 50)
        )
        db.session.add(new_event)
        db.session.commit()
        flash('Event added successfully!', 'success')
        return redirect(url_for('admin_view_events'))
 
    return render_template('admin/add_event.html')
 
 
# ── Admin: Delete Event ──
@app.route('/admin/events/delete/<int:event_id>', methods=['POST'])
def admin_delete_event(event_id):
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
 
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)   # cascade will delete registrations too
    db.session.commit()
    flash(f'Event "{event.name}" deleted.', 'success')
    return redirect(url_for('admin_view_events'))
 
 
# ── Admin: View All Registrations ──
@app.route('/admin/registrations')
def admin_view_registrations():
    if 'admin_id' not in session:
        return redirect(url_for('admin_login'))
 
    # Optional filter by category
    category = request.args.get('category', '')
 
    if category:
        registrations = Registration.query.join(Event).filter(Event.category == category).all()
    else:
        registrations = Registration.query.all()
 
    categories = ['sports', 'cultural', 'social', 'paper_presentation', 'hackathon']
    return render_template('admin/registrations.html',
                           registrations=registrations,
                           categories=categories,
                           selected=category)
 
 




if __name__ == '__main__':
    app.run(debug=True)