import React, { useState, useEffect } from 'react';
import './Calendar.css';
import api from './api';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date()); // Default to today
  const [allEvents, setAllEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (day) => {
    if (!selectedDate) return false;
    return (
      day === selectedDate.getDate() &&
      currentDate.getMonth() === selectedDate.getMonth() &&
      currentDate.getFullYear() === selectedDate.getFullYear()
    );
  };

  const handleDateClick = (day) => {
    setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(
        <div
          key={day}
          className={`calendar-day ${isToday(day) ? 'today' : ''} ${isSelected(day) ? 'selected' : ''}`}
          onClick={() => handleDateClick(day)}
        >
          {day}
        </div>
      );
    }

    return days;
  };

  // Fetch all events from API
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await api.get('/calendar/events', { withCredentials: true });
      const events = response.data || [];
      setAllEvents(events);
    } catch (error) {
      console.error("Failed to fetch calendar events:", error);
      setAllEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch events on mount and listen for event changes
  useEffect(() => {
    fetchEvents();

    // Listen for event changes from other components
    const handleEventChange = () => {
      fetchEvents();
    };

    window.addEventListener('kanban-event-added', handleEventChange);
    window.addEventListener('kanban-event-deleted', handleEventChange);

    return () => {
      window.removeEventListener('kanban-event-added', handleEventChange);
      window.removeEventListener('kanban-event-deleted', handleEventChange);
    };
  }, []);

  // Filter events for the selected date
  const getEventsForDate = (date) => {
    if (!date) return [];

    const dateYMD = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');

    return allEvents.filter(event => {
      if (event.start?.date) {
        // Full-day events
        return event.start.date === dateYMD;
      } else if (event.start?.dateTime) {
        // Timed events
        return new Date(event.start.dateTime).toDateString() === date.toDateString();
      }
      return false;
    });
  };

  const selectedDateEvents = getEventsForDate(selectedDate);

  const formatEventDate = () => {
    if (!selectedDate) return "Today's";
    const today = new Date();
    if (selectedDate.toDateString() === today.toDateString()) {
      return "Today's";
    }
    return selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + "'s";
  };

  return (
    <div className="calendar-container">
      <div className="calendar">
        <div className="calendar-header">
          <button onClick={prevMonth} className="nav-btn">‹</button>
          <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
          <button onClick={nextMonth} className="nav-btn">›</button>
        </div>

        <div className="calendar-weekdays">
          <div className="weekday">Sun</div>
          <div className="weekday">Mon</div>
          <div className="weekday">Tue</div>
          <div className="weekday">Wed</div>
          <div className="weekday">Thu</div>
          <div className="weekday">Fri</div>
          <div className="weekday">Sat</div>
        </div>

        <div className="calendar-grid">
          {renderCalendar()}
        </div>

        <div className="todays-events-section" style={{ marginTop: '20px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px', color: '#444' }}>{formatEventDate()} Events</h3>
          <div className="events-list">
            {loading ? (
              <p style={{ fontStyle: 'italic', color: '#777' }}>Loading events...</p>
            ) : selectedDateEvents.length > 0 ? (
              selectedDateEvents.map((event, index) => (
                <div key={event.id || index} style={{
                  backgroundColor: 'rgba(233, 179, 107, 0.4)',
                  padding: '10px 15px',
                  borderRadius: '12px',
                  marginBottom: '8px',
                  border: '1px solid #e9b36b',
                  color: '#2d2d2d'
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{event.summary || '(No title)'}</div>
                  {event.start?.dateTime && (
                    <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '4px' }}>
                      {new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {event.start?.date && (
                    <div style={{ fontSize: '0.85rem', color: '#555', marginTop: '4px' }}>
                      All day
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p style={{ fontStyle: 'italic', color: '#777' }}>No events scheduled for this day.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
