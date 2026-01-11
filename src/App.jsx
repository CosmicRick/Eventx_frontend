import './App.css';
import Calendar from './Calendar.jsx';
import KanbanBoard from './Kanbanbord.jsx';
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFacebook, faInstagram, faSquareTwitter, faSquareLinkedin } from '@fortawesome/free-brands-svg-icons';
import { faPhone, faMap, faCity, faLocationArrow, faEnvelope, faArrowPointer } from '@fortawesome/free-solid-svg-icons';
import { faEnvelopeOpen, faCalendar, faFileLines, faCalendarCheck, faCalendarXmark } from '@fortawesome/free-regular-svg-icons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from './api';
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setusername] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsError, setEventsError] = useState('');
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [taskText, setTaskText] = useState('');
  const [taskHeading, setTaskHeading] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventSortOrder, setEventSortOrder] = useState('asc');
  const [view, setView] = useState('dashboard');


  const loadTasks = useCallback(async () => {
    const container = document.getElementById('tasks-container');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    if (!isAuthenticated) {
      return;
    }

    try {
      const res = await api.get('/tasks/', { withCredentials: true });
      const tasks = res.data?.tasks ?? res.data ?? [];
      if (!Array.isArray(tasks) || tasks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'input-row';
        empty.textContent = 'No tasks found';
        container.appendChild(empty);
        return;
      }
      tasks.forEach((t) => {
        const id = t?.id ?? t?.task_id ?? t?.taskId;
        const title = t?.title ?? t?.name ?? '(no title)';
        const completed = t?.status === 'completed' || t?.completed === true;

        const row = document.createElement('div');
        row.className = 'input-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';

        const label = document.createElement('span');
        label.style.marginRight = '8px';
        label.textContent = title;

        const actions = document.createElement('div');
        actions.style.marginLeft = 'auto';
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const checkbox = document.createElement('button');
        checkbox.className = 'save-btn';
        checkbox.textContent = completed ? 'Completed' : 'Task Done';
        checkbox.title = completed ? 'Task already completed' : 'Mark task as done';
        checkbox.disabled = !!completed;
        checkbox.onclick = async () => {
          try {
            await api.put(`/tasks/${id}/complete`, {}, { withCredentials: true });
            checkbox.textContent = 'Completed';
            checkbox.disabled = true;
            toast.success('Task marked as completed.');
            // Trigger Kanban sync
            window.dispatchEvent(new CustomEvent('kanban-task-completed'));
          } catch (error) {
            const message = error.response?.data?.detail ?? error.message ?? 'Failed to mark task as done';
            toast.error(message);
          }
        };

        const del = document.createElement('button');
        del.className = 'save-btn';
        del.textContent = 'Delete';
        del.title = 'Delete task';
        del.onclick = async () => {
          try {
            await api.delete(`/tasks/${id}`, { withCredentials: true });
            row.remove();
            toast.success('Task deleted.');
            // Trigger Kanban sync
            window.dispatchEvent(new CustomEvent('kanban-task-deleted'));
          } catch (error) {
            const message = error.response?.data?.detail ?? error.message ?? 'Failed to delete task';
            toast.error(message);
          }
        };

        actions.appendChild(checkbox);
        actions.appendChild(del);

        row.appendChild(label);
        row.appendChild(actions);
        container.appendChild(row);
      });
    } catch (error) {
      const message = error.response?.data?.detail ?? error.message ?? 'Failed to load tasks';
      toast.error(message);
    }
  }, [isAuthenticated]);

  const authBaseUrl = api.defaults.baseURL ?? 'http://localhost:8000';

  // Check if user is authenticated and load their profile
  const checkAuthStatus = useCallback(async () => {
    setIsCheckingAuth(true);
    setAuthError('');
    try {
      const statusRes = await api.get('/auth/status', { withCredentials: true });
      console.log('Auth status response:', statusRes.data);
      if (statusRes.data?.authenticated) {
        setIsAuthenticated(true);
        try {
          const userRes = await api.get('/user/me', { withCredentials: true });
          const email = userRes.data?.email ?? userRes.data?.name ?? '';
          const uname = userRes.data?.name ?? '';
          const profilePictureUrl = userRes.data?.profile_picture ?? userRes.data?.picture ?? '';
          console.log('User profile response:', userRes.data);
          setusername(uname);
          setUserEmail(email);
          setProfilePicture(profilePictureUrl);
        } catch (userErr) {
          console.error('Fetching user profile failed:', userErr);
          const message = userErr.response?.data?.detail ?? 'Unable to load user profile';
          setAuthError(message);
          toast.error(message);
        }
        return;
      }
      setIsAuthenticated(false);
      setUserEmail('');
      setusername('');
      setProfilePicture('');
      setIsProfileMenuOpen(false);
    } catch (error) {
      console.error('Auth status check failed:', error);
      setIsAuthenticated(false);
      setUserEmail('');
      setProfilePicture('');
      setIsProfileMenuOpen(false);
      const message = error.response?.data?.detail ?? 'Authentication check failed';
      setAuthError(message);
      toast.error(message);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  // Handle Google Login - redirect to FastAPI OAuth endpoint
  const handleGoogleLogin = async () => {
    // Redirect to your FastAPI Google OAuth endpoint
    setIsProfileMenuOpen(false);
    window.location.href = `${authBaseUrl}/auth/login`;
  };

  const handleLogout = async () => {
    setIsProfileMenuOpen(false);
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
      toast.info('Logged out successfully.');
    } catch (error) {
      console.error('Logout failed:', error);
      const message = error.response?.data?.detail ?? 'Logout failed';
      setAuthError(message);
      toast.error(message);
    } finally {
      // Clear Kanban board data from localStorage
      localStorage.removeItem('kanban_board_data');

      setIsAuthenticated(false);
      setUserEmail('');
      setProfilePicture('');
      checkAuthStatus();
    }
  };

  const toggleProfileMenu = () => {
    if (!isAuthenticated) {
      return;
    }
    setIsProfileMenuOpen((prev) => !prev);
  };

  const closeProfileMenu = () => {
    setIsProfileMenuOpen(false);
  };

  const sanitizeSummaryText = (value) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    return text.replace(/[\*#]/g, '').replace(/\s+\n/g, '\n').trim();
  };

  const formatSummary = (value, depth = 0) => {
    if (value == null) {
      return 'No insight available.';
    }
    if (typeof value === 'string') {
      return sanitizeSummaryText(value);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      return value
        .map((item, index) => {
          const line = formatSummary(item, depth + 1);
          const bullet = depth === 0 ? '•' : '◦';
          if (line.includes('\n')) {
            return `${bullet} ${line.split('\n').join('\n    ')}`;
          }
          return `${bullet} ${line}`;
        })
        .join('\n');
    }
    if (typeof value === 'object') {
      // Filter out metadata fields from AI response
      const excludeKeys = ['success', 'generated_at'];
      const entries = Object.entries(value).filter(([key]) => !excludeKeys.includes(key));

      if (entries.length === 0) return 'No data available.';

      return entries
        .map(([key, val]) => {
          const prettyKey = key.replace(/_/g, ' ');
          const label = prettyKey.charAt(0).toUpperCase() + prettyKey.slice(1);
          const formatted = formatSummary(val, depth + 1);

          // Add section divider for top-level keys
          const sectionHeader = depth === 0 ? `━━━ ${label.toUpperCase()} ━━━` : `📌 ${label}`;

          if (formatted.includes('\n')) {
            return `${sectionHeader}\n${formatted}`;
          }
          return depth === 0 ? `${sectionHeader}\n${formatted}` : `${label}: ${formatted}`;
        })
        .join('\n\n');
    }
    return sanitizeSummaryText(value);
  };

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  const refreshUpcomingEvents = useCallback(async () => {
    if (!isAuthenticated) {
      setUpcomingEvents([]);
      setEventsError('');
      setIsLoadingEvents(false);
      return;
    }

    setIsLoadingEvents(true);
    setEventsError('');
    try {
      const res = await api.get('/calendar/events', { withCredentials: true });
      const events = res.data?.events ?? res.data ?? [];
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 31);

      const filtered = events
        .map((event) => {
          const raw = event?.start?.dateTime ?? event?.start?.date ?? event?.startDate;
          if (!raw) return null;

          const isAllDay = Boolean(event?.start?.date || (event?.startDate && !event?.start?.dateTime));
          const date = isAllDay ? new Date(`${raw}T00:00:00`) : new Date(raw);
          if (Number.isNaN(date.getTime())) return null;

          const labelDate = date.toLocaleDateString();
          const labelTime = isAllDay ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const title = event?.summary ?? event?.title ?? '(no title)';
          const dateValue = date.getTime();

          return {
            id: event?.id ?? event?.eventId ?? `${title}-${date.toISOString()}`,
            label: `${labelDate}${labelTime ? ` ${labelTime}` : ''} - ${title}`,
            dateValue,
          };
        })
        .filter(Boolean)
        .filter(({ dateValue }) => dateValue >= now.getTime() && dateValue <= end.getTime())
        .sort((a, b) => a.dateValue - b.dateValue);

      setUpcomingEvents(filtered);
      setEventsError('');

      if (filtered.length === 0) {
        toast.info('No events in the next month.');
      } else {
        toast.success(`Loaded ${filtered.length} upcoming event${filtered.length === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      console.error('Failed to load events:', error);
      const message = error.response?.data?.detail ?? error.message ?? 'Failed to load events';
      setUpcomingEvents([]);
      setEventsError(message);
      toast.error(message);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [isAuthenticated]);

  const handleTaskSave = async () => {
    if (!isAuthenticated) {
      setTaskStatus('Please login with Google first.');
      toast.error('Please login with Google first.');
      return;
    }
    const head = taskHeading.trim();
    const text = taskText.trim();//here is a trim and store only trimed text 
    if (!head) {
      setTaskStatus('Please enter a task headline.');
      toast.warn('Please enter a task headline.');
      return;
    }
    if (!text) {
      setTaskStatus('Please enter a task.');
      toast.warn('Please enter a task.');
      return;
    }

    setTaskStatus('Saving task...');
    const endpointsToTry = ['/tasks/'];
    let saved = false;
    let lastError = null;

    for (const url of endpointsToTry) {
      try {
        const res = await api.post(url, {
          "title": head,
          "notes": text,
          "task_list_id": "@default"
        }, { withCredentials: true });
        if (res && res.status >= 200 && res.status < 300) {
          saved = true;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (saved) {
      setTaskStatus('Task saved successfully.');
      setTaskText('');
      setTaskHeading('');
      toast.success('Task saved successfully.');
      await loadTasks();
      // Trigger Kanban sync
      window.dispatchEvent(new CustomEvent('kanban-task-added'));
    } else {
      const msg = lastError?.response?.data?.detail ?? lastError?.message ?? 'Failed to save task';
      setTaskStatus(msg);
      toast.error(msg);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshUpcomingEvents();
      loadTasks();
    } else {
      setUpcomingEvents([]);
      setEventsError('');
      setTaskText('');
      setTaskStatus('');
      loadTasks();
      setIsProfileMenuOpen(false);
      setEventSearchQuery('');
      setEventSortOrder('asc');
    }
  }, [isAuthenticated, refreshUpcomingEvents, loadTasks]);

  const normalizedEventQuery = eventSearchQuery.trim().toLowerCase();
  const visibleEvents = upcomingEvents
    .filter(({ label }) => label.toLowerCase().includes(normalizedEventQuery))
    .slice()
    .sort((a, b) => (eventSortOrder === 'asc' ? a.dateValue - b.dateValue : b.dateValue - a.dateValue));
  const hasEvents = upcomingEvents.length > 0;
  const hasVisibleEvents = visibleEvents.length > 0;

  const toggleEventSortOrder = () => {
    setEventSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const deleteEvent = async (eventId) => {
    if (!isAuthenticated) {
      toast.error('Please login first.');
      return;
    }
    try {
      await api.delete(`/calendar/events/${eventId}`, { withCredentials: true });
      toast.success('Event deleted successfully.');
      // Refresh the events list
      refreshUpcomingEvents();
      // Trigger Kanban sync
      window.dispatchEvent(new CustomEvent('kanban-event-deleted'));
    } catch (error) {
      console.error('Failed to delete event:', error);
      const message = error.response?.data?.detail ?? error.message ?? 'Failed to delete event';
      toast.error(message);
    }
  };

  const userInitial = (userName || userEmail || '?').charAt(0).toUpperCase();

  return (
    <div className="dashboard-container">
      <ToastContainer position="top-right" autoClose={4000} pauseOnHover />
      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-links">
          <a href="#" onClick={(e) => { e.preventDefault(); setView('dashboard'); }}>Home</a>
          <a href="#" onClick={(e) => { e.preventDefault(); setView('kanban'); }}>Kanban Board</a>
          <a href="#">About Us</a>
          <a href="#">Contact Us</a>
        </div>
        <div className="logo">EvenetX</div>
        <div className="authuserinfo">
          {isCheckingAuth ? (
            <span>Checking session...</span>
          ) : isAuthenticated ? (
            <div className="Login">
              <button
                type="button"
                className="login-avatar"
                onClick={toggleProfileMenu}
                aria-haspopup="dialog"
                aria-expanded={isProfileMenuOpen}
              >
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt="Profile"
                    className="profile-avatar-image"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="profile-initial">{userInitial}</span>
                )}
              </button>
            </div>
          ) : (
            <button className="login-btn" onClick={handleGoogleLogin}>Google Login</button>
          )}
          {authError && !isCheckingAuth && (
            <span className="auth-error">{authError}</span>
          )}
        </div>
      </nav>

      {isProfileMenuOpen && isAuthenticated && (
        <div className="profile-overlay" onClick={closeProfileMenu} role="dialog" aria-modal="true">
          <div className="profile-card" onClick={(event) => event.stopPropagation()}>
            {profilePicture ? (
              <img
                src={profilePicture}
                alt="Profile"
                className="profile-card-image"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="profile-card-placeholder">{userInitial}</div>
            )}
            <h3 className="profile-name">{userName || 'Authenticated user'}</h3>
            {userEmail && <p className="profile-email">{userEmail}</p>}
            <button
              type="button"
              className="logout-btn"
              onClick={(event) => {
                event.stopPropagation();
                handleLogout();
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <header className="hero">
        <h1>EvenetX a google Workspace Hub</h1>
        <p>Make all Events at one place</p>
      </header>

      {/* Content Grid */}
      <main className="grid-layout">
        {view === 'dashboard' ? (
          <>
            <section className="card-section">
              <h2>Create Event</h2>
              <form
                className="card create-event-card"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  if (!isAuthenticated) {
                    toast.error('Please login with Google first.');
                    return;
                  }
                  const fd = new FormData(form);
                  const summary = (fd.get('summary') || '').toString().trim();
                  const description = (fd.get('description') || '').toString().trim();
                  const location = (fd.get('location') || '').toString().trim();
                  const attendeesRaw = (fd.get('attendees') || '').toString();
                  const startDate = (fd.get('startDate') || '').toString();
                  const endDateInput = (fd.get('endDate') || '').toString();
                  const startTimeInput = (fd.get('startTime') || '').toString();
                  const endTimeInput = (fd.get('endTime') || '').toString();

                  const normalizeTime = (value) => {
                    const trimmed = (value || '').toString().trim();
                    if (!trimmed) {
                      return '00:00:00';
                    }
                    return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
                  };

                  if (!summary || !startDate) {
                    toast.warn('Please enter event summary and start date.');
                    return;
                  }

                  const startTime = normalizeTime(startTimeInput);
                  const startDateTime = `${startDate}T${startTime}`;

                  let endDate = endDateInput || startDate;
                  let endTime = normalizeTime(endTimeInput || startTimeInput);

                  const startInstant = new Date(`${startDate}T${startTime}`);
                  let endInstant = new Date(`${endDate}T${endTime}`);

                  if (Number.isNaN(startInstant.getTime())) {
                    toast.warn('Please enter a valid start date and time.');
                    return;
                  }

                  if (Number.isNaN(endInstant.getTime()) || endInstant < startInstant) {
                    endDate = startDate;
                    endTime = startTime;
                    endInstant = new Date(`${endDate}T${endTime}`);
                  }

                  const endDateTime = `${endDate}T${endTime}`;

                  const attendees = attendeesRaw
                    .split(/[,;\s]+/)
                    .map((e) => e.trim())
                    .filter(Boolean);

                  const eventPayload = {
                    summary,
                    start_datetime: startDateTime,
                    end_datetime: endDateTime,
                    description,
                    location,
                    attendees,
                    timezone: 'IST',
                  };

                  const endpointsToTry = [
                    '/calendar/events',
                  ];

                  let created = false;
                  let lastError = null;

                  for (const url of endpointsToTry) {
                    try {
                      const res = await api.post(url, eventPayload, { withCredentials: true });
                      if (res && (res.status >= 200 && res.status < 300)) {
                        created = true;
                        break;
                      }
                    } catch (err) {
                      lastError = err;
                    }
                  }

                  if (created) {
                    toast.success('Event created successfully.');
                    form.reset();
                    setEventSearchQuery('');
                    setEventSortOrder('asc');
                    // Auto-refresh upcoming events list
                    refreshUpcomingEvents();
                    // Trigger Kanban sync
                    window.dispatchEvent(new CustomEvent('kanban-event-added'));
                  } else {
                    const msg =
                      lastError?.response?.data?.detail ||
                      lastError?.message ||
                      'Failed to create event';
                    toast.error(msg);

                  }
                }}
              >
                <div className="input-row">
                  <FontAwesomeIcon icon={faCalendar} />
                  <input name="summary" type="text" placeholder="Event Summary" />
                </div>
                <div className="input-row">
                  <FontAwesomeIcon icon={faCalendarCheck} /><span>StartEvent:</span>
                  <input className="startDate" name="startDate" type="date" style={{ width: '25%' }} />
                  <span>StartTime:</span>
                  <input className="startTime" name="startTime" type="time" />
                </div>
                <div className="input-row">
                  <FontAwesomeIcon icon={faCalendarCheck} /><span>End Event:</span>
                  <input className="endDate" name="endDate" type="date" style={{ width: '25%' }} />
                  <span>End Time:</span>
                  <input className="endTime" name="endTime" type="time" />
                </div>
                <div className="input-row">
                  <FontAwesomeIcon icon={faFileLines} /><input name="description" type="text" placeholder="Description" />
                </div>
                <div className="input-row">
                  <FontAwesomeIcon icon={faEnvelopeOpen} /><input
                    name="attendees"
                    type="text"
                    placeholder="Attendee emails"
                    title="You can add multiple emails separated by commas"
                  />
                </div>
                <div className="input-row">
                  <FontAwesomeIcon icon={faLocationArrow} /><input name="location" type="text" placeholder="Location" />
                </div>
                <button className="save-btn" type="submit" disabled={!isAuthenticated} title={isAuthenticated ? 'Create event' : 'Login required'}>
                  Save
                </button>
              </form>

              <section className="clock-section">
                <h2>Clock</h2>
                <div className="card clock-card">
                  <iframe
                    src="https://free.timeanddate.com/clock/ia7w4kyf/n54/tlin/fn7/fs20/fce9b36b/tct/pct/ftb/th2/ta1"
                    width="176"
                    height="90"
                    allowTransparency="true"
                  ></iframe>
                </div>
              </section>
            </section>

            <section className="card-section">
              <h2>Calendar</h2>
              <div className="card calendar-card">
                <Calendar />
              </div>
            </section>

            <div className="card-section full-width">
              <h2>Upcoming Events</h2>
              <div className="eventmanegament">
                <div className="card upcoming-card">
                  <div className="placeholder-content" style={{ marginBottom: '-2rem' }}>
                    {!isAuthenticated && <span>Login to see events</span>}
                    {isAuthenticated && (

                      <>
                        {isLoadingEvents && <span>Loading...</span>}
                        {!isLoadingEvents && eventsError && <span className="auth-error">{eventsError}</span>}
                        {!isLoadingEvents && !eventsError && (
                          <>
                            <div className="upcoming-controls">
                              <input
                                type="search"
                                value={eventSearchQuery}
                                onChange={(e) => setEventSearchQuery(e.target.value)}
                                placeholder="Search events"
                                className="upcoming-search"
                              />
                              <button
                                type="button"
                                className="save-btn upcoming-sort-toggle"
                                onClick={toggleEventSortOrder}
                              >
                                Sort: {eventSortOrder === 'asc' ? 'Asc' : 'Desc'}
                              </button>
                            </div>
                            {!hasEvents ? (
                              <span>No events in the next month</span>
                            ) : !hasVisibleEvents ? (
                              <span>No events match your search.</span>
                            ) : (
                              <div className="upcoming-events-list">
                                {visibleEvents.map(({ id, label }) => (
                                  <div key={id} className="input-row">
                                    <span>{label}</span>
                                    <button
                                      type="button"
                                      onClick={() => deleteEvent(id)}
                                      title="Delete event"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className='taskshow'>
                  <section className='TaskShow'>
                    <h2>Upcoming Task</h2>
                    <div className="card taskshow-card">
                      <div id="tasks-container" className="upcoming-events-list" style={{ marginBottom: '8px' }}></div>
                    </div>
                  </section>
                </div>
              </div>
            </div >
            <section className="card-section full-width">
              <h2>Your Tasks</h2>
              <div className="card notes-card">
                <div className='input-row'>
                  <input type="text"
                    placeholder="Enter Task Headline"
                    value={taskHeading}
                    onChange={(e) => setTaskHeading(e.target.value)}
                  />
                </div>
                <textarea
                  id="task-text"
                  placeholder="Write your event Tasks here..."
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                ></textarea>
                {taskStatus && (
                  <div
                    style={{
                      marginTop: '8px',
                      color:
                        taskStatus === 'Task saved successfully.'
                          ? '#1b5e20'
                          : taskStatus === 'Saving task...'
                            ? '#1976d2'
                            : '#d32f2f',
                    }}
                  >
                    {taskStatus}
                  </div>
                )}
                <div className="input" style={{ marginTop: '8px' }}>
                  <button
                    type="button"
                    className="save-btn"
                    onClick={async () => {
                      await handleTaskSave();
                      setTimeout(() => setTaskStatus(''), 5000);
                    }}
                    disabled={!isAuthenticated}
                    title={isAuthenticated ? 'Save task' : 'Login required'}
                  >
                    Save Task
                  </button>
                </div>
              </div>
            </section>
            <section className='kanbanbord full-width'>
              <h2>Kanban Board</h2>
              <div className="card kanban-card ">
                <KanbanBoard isAuthenticated={isAuthenticated} />
              </div>
            </section>
            <section className="card-section full-width">
              <h2>Your Task Assistance</h2>
              <div className="card ai-response-card">
                <div
                  id="ai-summary-output"
                  className="placeholder-content"
                  style={{
                    whiteSpace: 'pre-wrap',
                    textAlign: 'left',
                    lineHeight: '1.6',
                    minHeight: '60px',
                    color: '#333',
                    fontSize: '0.95rem',
                    backgroundColor: '#f7f9ff',
                    border: '1px solid #dce3f5',
                    borderRadius: '10px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
                    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
                    transition: 'box-shadow 0.2s ease-in-out'
                  }}
                >
                  <span>{isAuthenticated ? 'Ready to analyze your schedule.' : 'Login to access AI assistance.'}</span>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="save-btn"
                    disabled={!isAuthenticated}
                    onClick={async (e) => {
                      if (!isAuthenticated) return;
                      const button = e.currentTarget;
                      const output = document.getElementById('ai-summary-output');
                      if (!output) return;

                      const originalText = button.textContent;
                      button.textContent = 'Analyzing...';
                      button.disabled = true;
                      output.innerHTML = '<i>Contacting AI services...</i>';

                      try {
                        const res = await api.get('/smart-summary', { withCredentials: true });
                        const summary = res.data?.summary ?? res.data?.response ?? res.data ?? 'No insight available.';

                        let formatted = summary;
                        if (typeof formatted === 'string') {
                          try {
                            const parsed = JSON.parse(formatted);
                            formatted = parsed;
                          } catch (parseError) {
                            // Leave formatted as string when JSON parsing fails.
                          }
                        }

                        output.textContent = formatSummary(formatted);
                        toast.success('AI Insight generated.');
                      } catch (error) {
                        console.error('AI Summary error:', error);
                        const msg = error.response?.data?.detail ?? 'Failed to fetch AI summary.';
                        output.textContent = msg;
                        toast.error(msg);
                      } finally {
                        button.textContent = originalText;
                        button.disabled = false;
                      }
                    }}
                  >
                    Get AI Insights
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="full-width">
            <KanbanBoard isAuthenticated={isAuthenticated} />
          </div>
        )}
      </main >
      {/* Footer */}
      <footer footer className="footer" >
        <div className="footer-content">
          <div className="socials">
            <ol>
              <ul>
                <FontAwesomeIcon icon={faFacebook} style={{ height: '1.4rem' }} /><a href='https://www.facebook.com/supradip888'>Facebook

                </a></ul>
              <ul>
                <FontAwesomeIcon icon={faInstagram} style={{ height: '1.4rem' }} />  Instagram
              </ul>
              <ul>
                <FontAwesomeIcon icon={faSquareTwitter} style={{ height: '1.4rem' }} />Twitter</ul>
              <ul>
                <FontAwesomeIcon icon={faSquareLinkedin} style={{ height: '1.4rem' }} />LinkedIn</ul>
            </ol>
          </div>

          <div className="contact-info">
            <ol>
              <ul><FontAwesomeIcon icon={faEnvelopeOpen} style={{ height: '1.4rem' }} />Email:supradiproy737@gmail.com</ul>
              <ul><FontAwesomeIcon icon={faPhone} style={{ height: '1.4rem' }} />Phone:9831948452</ul>
              <ul><FontAwesomeIcon icon={faCity} style={{ height: '1.4rem' }} />Address:kolkata</ul>
              <ul><FontAwesomeIcon icon={faMap} style={{ height: '1.4rem' }} />Place:India</ul>
            </ol>
          </div>
          <div className='Services'>
            <ol>
              <ul><FontAwesomeIcon icon={faCalendarXmark} />Services</ul>
              <ul><FontAwesomeIcon icon={faArrowPointer} />EventManagement</ul>
              <ul><FontAwesomeIcon icon={faArrowPointer} />TaskManagement</ul>
              <ul><FontAwesomeIcon icon={faArrowPointer} />AIAssistance</ul>
            </ol>
          </div>

          <div className="footer-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Help</a>
          </div>
        </div>
      </footer >
    </div >
  );
};

export default App; 
