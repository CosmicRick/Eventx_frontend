import React, { useState, useEffect, useCallback } from 'react';
import { GripVertical, Plus, X, RefreshCw, LogIn, CheckCircle, Circle, Calendar, ListTodo } from 'lucide-react';
import api from './api';
import './kanbanbord.css';

// LocalStorage keys
const STORAGE_KEYS = {
  COLUMNS: 'kanban_columns',
  LAST_SYNC: 'kanban_last_sync',
  LOCAL_TASKS: 'kanban_local_tasks'
};

// Helper to load from localStorage
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (e) {
    console.error('Error loading from localStorage:', e);
    return defaultValue;
  }
};

// Helper to save to localStorage
const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
};

const KanbanBoard = ({ isAuthenticated: propIsAuthenticated }) => {
  const [columns, setColumns] = useState(() => loadFromStorage(STORAGE_KEYS.COLUMNS, {
    todo: {
      title: 'To Do',
      items: []
    },
    inProgress: {
      title: 'In Progress',
      items: []
    },
    done: {
      title: 'Done',
      items: []
    }
  }));

  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [showInput, setShowInput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(propIsAuthenticated ?? false);
  const [error, setError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(() => loadFromStorage(STORAGE_KEYS.LAST_SYNC, null));

  // Save columns to localStorage whenever they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.COLUMNS, columns);
  }, [columns]);

  // Fetch tasks from Google Tasks API and Calendar Events
  const fetchTasks = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);

      // Fetch both tasks and calendar events in parallel
      const [tasksRes, eventsRes] = await Promise.all([
        api.get('/tasks/?show_completed=true', { withCredentials: true }).catch(err => {
          console.error("Error fetching tasks:", err);
          return { data: { tasks: [] } };
        }),
        api.get('/calendar/events', { withCredentials: true }).catch(err => {
          console.error("Error fetching calendar events:", err);
          return { data: [] };
        })
      ]);

      // Process Google Tasks
      const rawTasks = tasksRes.data?.tasks ?? tasksRes.data ?? [];
      const tasks = Array.isArray(rawTasks) ? rawTasks : [];

      // Process Calendar Events
      const rawEvents = eventsRes.data ?? [];
      const events = Array.isArray(rawEvents) ? rawEvents : [];

      // Separate tasks by status
      const todoTasks = tasks.filter(t => t.status !== 'completed').map(task => ({
        id: `task-${task.id}`,
        content: task.title,
        type: 'task',
        originalId: task.id,
        status: task.status,
        notes: task.notes || '',
        completed: task.completed || null,
        source: 'google-tasks'
      }));

      const completedTasks = tasks.filter(t => t.status === 'completed').map(task => ({
        id: `task-${task.id}`,
        content: task.title,
        type: 'task',
        originalId: task.id,
        status: task.status,
        notes: task.notes || '',
        completed: task.completed || null,
        source: 'google-tasks'
      }));

      // Process calendar events - upcoming events go to todo
      const now = new Date();
      const upcomingEvents = events
        .filter(event => {
          const eventDate = event.start?.dateTime
            ? new Date(event.start.dateTime)
            : event.start?.date
              ? new Date(event.start.date)
              : null;
          return eventDate && eventDate >= now;
        })
        .map(event => ({
          id: `event-${event.id}`,
          content: event.summary || '(No title)',
          type: 'event',
          originalId: event.id,
          status: 'upcoming',
          eventDate: event.start?.dateTime || event.start?.date,
          isAllDay: !!event.start?.date,
          source: 'google-calendar'
        }));

      // Past events (could be shown as done if needed)
      const pastEvents = events
        .filter(event => {
          const eventDate = event.end?.dateTime
            ? new Date(event.end.dateTime)
            : event.end?.date
              ? new Date(event.end.date)
              : null;
          return eventDate && eventDate < now;
        })
        .map(event => ({
          id: `event-${event.id}`,
          content: event.summary || '(No title)',
          type: 'event',
          originalId: event.id,
          status: 'past',
          eventDate: event.start?.dateTime || event.start?.date,
          isAllDay: !!event.start?.date,
          source: 'google-calendar'
        }));

      // Load locally stored "in progress" items to preserve them
      const storedColumns = loadFromStorage(STORAGE_KEYS.COLUMNS, { inProgress: { items: [] } });
      const inProgressItems = storedColumns.inProgress?.items || [];

      // Filter out any tasks that have been moved to inProgress from todo
      const inProgressTaskIds = new Set(inProgressItems.map(i => i.id));
      const filteredTodoTasks = todoTasks.filter(t => !inProgressTaskIds.has(t.id));
      const filteredUpcomingEvents = upcomingEvents.filter(e => !inProgressTaskIds.has(e.id));

      const newColumns = {
        todo: {
          title: 'To Do',
          items: [...filteredTodoTasks, ...filteredUpcomingEvents]
        },
        inProgress: {
          title: 'In Progress',
          items: inProgressItems
        },
        done: {
          title: 'Done',
          items: [...completedTasks, ...pastEvents]
        }
      };

      setColumns(newColumns);
      saveToStorage(STORAGE_KEYS.COLUMNS, newColumns);

      // Update last sync time
      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      saveToStorage(STORAGE_KEYS.LAST_SYNC, syncTime);

    } catch (err) {
      console.error("Error fetching tasks:", err);
      if (err.response?.status === 401) {
        setIsAuthenticated(false);
      } else {
        setError('Failed to load tasks. Using cached data.');
        // Data is already loaded from localStorage on init
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  // Sync auth state from props
  useEffect(() => {
    if (propIsAuthenticated !== undefined) {
      setIsAuthenticated(propIsAuthenticated);
      if (propIsAuthenticated) {
        fetchTasks();
      } else {
        // Keep cached data but stop loading
        setLoading(false);
      }
    } else {
      checkAuthStatus();
    }
  }, [propIsAuthenticated, fetchTasks]);

  // Auto-sync every 5 minutes
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      console.log('Auto-syncing with Google Tasks...');
      fetchTasks();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchTasks]);

  // Listen for events from other components
  useEffect(() => {
    const handleSync = () => fetchTasks();

    window.addEventListener('kanban-task-added', handleSync);
    window.addEventListener('kanban-task-completed', handleSync);
    window.addEventListener('kanban-task-deleted', handleSync);

    return () => {
      window.removeEventListener('kanban-task-added', handleSync);
      window.removeEventListener('kanban-task-completed', handleSync);
      window.removeEventListener('kanban-task-deleted', handleSync);
    };
  }, [fetchTasks]);

  const checkAuthStatus = async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/status', { withCredentials: true });
      if (response.data?.authenticated) {
        setIsAuthenticated(true);
        await fetchTasks();
      } else {
        setIsAuthenticated(false);
        // Keep cached data, just stop loading
        setLoading(false);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setIsAuthenticated(false);
      // Keep cached data, just stop loading
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    await fetchTasks();
  };

  const onDragStart = (e, item, columnId) => {
    setDraggedItem(item);
    setDraggedFrom(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = async (e, targetColumnId) => {
    e.preventDefault();

    if (!draggedItem || !draggedFrom) return;
    if (draggedFrom === targetColumnId) {
      setDraggedItem(null);
      setDraggedFrom(null);
      return;
    }

    const item = draggedItem;
    const sourceColumnId = draggedFrom;

    // Update UI immediately for better UX
    const newColumns = { ...columns };
    newColumns[sourceColumnId].items = newColumns[sourceColumnId].items.filter(
      i => i.id !== item.id
    );
    newColumns[targetColumnId].items = [...newColumns[targetColumnId].items, item];
    setColumns(newColumns);
    saveToStorage(STORAGE_KEYS.COLUMNS, newColumns);

    setDraggedItem(null);
    setDraggedFrom(null);

    // Sync with Google Tasks API (only for task items, not calendar events)
    if (item.type === 'task' && item.originalId && item.source === 'google-tasks') {
      try {
        if (targetColumnId === 'done') {
          // Mark task as completed in Google Tasks
          await api.put(`/tasks/${item.originalId}/complete`, {}, { withCredentials: true });
          console.log('Task marked as completed in Google Tasks');

          // Update item status locally
          setColumns(prev => {
            const updated = {
              ...prev,
              done: {
                ...prev.done,
                items: prev.done.items.map(i =>
                  i.id === item.id ? { ...i, status: 'completed' } : i
                )
              }
            };
            saveToStorage(STORAGE_KEYS.COLUMNS, updated);
            return updated;
          });
        } else if (sourceColumnId === 'done' && (targetColumnId === 'todo' || targetColumnId === 'inProgress')) {
          // Moving from done to todo/inProgress - mark as uncompleted
          await api.put(`/tasks/${item.originalId}/uncomplete`, {}, { withCredentials: true });
          console.log('Task marked as uncompleted in Google Tasks');

          // Update item status locally
          setColumns(prev => {
            const updated = {
              ...prev,
              [targetColumnId]: {
                ...prev[targetColumnId],
                items: prev[targetColumnId].items.map(i =>
                  i.id === item.id ? { ...i, status: 'needsAction' } : i
                )
              }
            };
            saveToStorage(STORAGE_KEYS.COLUMNS, updated);
            return updated;
          });
        }
        // Note: Moving between todo and inProgress is local-only (Google Tasks doesn't have this state)
      } catch (err) {
        console.error("Error syncing task status:", err);
        // Revert on error
        setColumns(columns);
        saveToStorage(STORAGE_KEYS.COLUMNS, columns);
        setError('Failed to sync task status. Changes saved locally.');
      }
    }
    // Calendar events are local-only when moving between columns
  };

  const addTask = async (columnId) => {
    if (!newTaskInput.trim()) return;

    const taskTitle = newTaskInput.trim();
    setNewTaskInput('');
    setShowInput(null);

    // Determine if task should be created as completed
    const isCompleted = columnId === 'done';

    // Create a temporary local task first
    const tempId = `local-${Date.now()}`;
    const tempTask = {
      id: tempId,
      content: taskTitle,
      type: 'task',
      originalId: null,
      status: isCompleted ? 'completed' : 'needsAction',
      notes: "Added via Kanban Board",
      source: 'local'
    };

    // Add to local state immediately
    setColumns(prev => {
      const updated = {
        ...prev,
        [columnId]: {
          ...prev[columnId],
          items: [...prev[columnId].items, tempTask]
        }
      };
      saveToStorage(STORAGE_KEYS.COLUMNS, updated);
      return updated;
    });

    // Try to sync with Google Tasks API if authenticated
    if (isAuthenticated) {
      try {
        setSyncing(true);

        // Create task in Google Tasks API
        const response = await api.post('/tasks/', {
          title: taskTitle,
          notes: "Added via Kanban Board",
          status: isCompleted ? 'completed' : 'needsAction'
        }, { withCredentials: true });

        const newTask = {
          id: `task-${response.data.id}`,
          content: response.data.title,
          type: 'task',
          originalId: response.data.id,
          status: response.data.status,
          notes: response.data.notes || '',
          source: 'google-tasks'
        };

        // If created as completed, also mark it complete via the API
        if (isCompleted && response.data.id) {
          await api.put(`/tasks/${response.data.id}/complete`, {}, { withCredentials: true });
          newTask.status = 'completed';
        }

        // Replace temp task with real task
        setColumns(prev => {
          const updated = {
            ...prev,
            [columnId]: {
              ...prev[columnId],
              items: prev[columnId].items.map(item =>
                item.id === tempId ? newTask : item
              )
            }
          };
          saveToStorage(STORAGE_KEYS.COLUMNS, updated);
          return updated;
        });

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('kanban-task-added'));

      } catch (err) {
        console.error("Error creating task:", err);
        setError('Task saved locally. Will sync when online.');
        // Keep the local task - it's already in the state
      } finally {
        setSyncing(false);
      }
    }
  };

  const toggleTaskComplete = async (columnId, item) => {
    if (item.type !== 'task') return;

    const isCurrentlyCompleted = columnId === 'done';
    const targetColumnId = isCurrentlyCompleted ? 'todo' : 'done';

    // Update UI immediately
    const newColumns = { ...columns };
    newColumns[columnId].items = newColumns[columnId].items.filter(i => i.id !== item.id);
    newColumns[targetColumnId].items = [...newColumns[targetColumnId].items, {
      ...item,
      status: isCurrentlyCompleted ? 'needsAction' : 'completed'
    }];
    setColumns(newColumns);
    saveToStorage(STORAGE_KEYS.COLUMNS, newColumns);

    // Sync with Google Tasks if it's a synced task
    if (item.originalId && item.source === 'google-tasks') {
      try {
        if (isCurrentlyCompleted) {
          await api.put(`/tasks/${item.originalId}/uncomplete`, {}, { withCredentials: true });
        } else {
          await api.put(`/tasks/${item.originalId}/complete`, {}, { withCredentials: true });
        }
        window.dispatchEvent(new CustomEvent('kanban-task-completed'));
      } catch (err) {
        console.error("Error toggling task:", err);
        setColumns(columns); // Revert
        saveToStorage(STORAGE_KEYS.COLUMNS, columns);
        setError('Failed to update task. Changes saved locally.');
      }
    }
  };

  const deleteItem = async (columnId, item) => {
    // Remove from state immediately
    setColumns(prev => {
      const updated = {
        ...prev,
        [columnId]: {
          ...prev[columnId],
          items: prev[columnId].items.filter(i => i.id !== item.id)
        }
      };
      saveToStorage(STORAGE_KEYS.COLUMNS, updated);
      return updated;
    });

    // Sync with backend for Google Tasks
    if (item.type === 'task' && item.originalId && item.source === 'google-tasks') {
      try {
        await api.delete(`/tasks/${item.originalId}`, { withCredentials: true });
        window.dispatchEvent(new CustomEvent('kanban-task-deleted'));
      } catch (err) {
        console.error("Error deleting task:", err);
        // Revert on error
        setColumns(prev => {
          const updated = {
            ...prev,
            [columnId]: {
              ...prev[columnId],
              items: [...prev[columnId].items, item]
            }
          };
          saveToStorage(STORAGE_KEYS.COLUMNS, updated);
          return updated;
        });
        setError('Failed to delete task. Please try again.');
      }
    }
    // Calendar events and local tasks are deleted locally only
  };

  const handleLogin = () => {
    window.location.href = `${api.defaults.baseURL}/auth/login`;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div>Loading tasks...</div>
      </div>
    );
  }

  // Format last sync time
  const formatLastSync = () => {
    if (!lastSyncTime) return null;
    const date = new Date(lastSyncTime);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to format event date/time
  const formatEventTime = (item) => {
    if (item.type !== 'event' || !item.eventDate) return null;
    const date = new Date(item.eventDate);
    if (item.isAllDay) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isAuthenticated) {
    // Show cached data even when not authenticated
    const hasCachedData = columns.todo.items.length > 0 ||
      columns.inProgress.items.length > 0 ||
      columns.done.items.length > 0;

    if (!hasCachedData) {
      return (
        <div className="kanban-board-container">
          <div className="login-prompt">
            <LogIn size={48} className="login-icon" />
            <h2>Please Login</h2>
            <p>Connect your Google account to manage your tasks.</p>
            <button onClick={handleLogin} className="login-btn-kanban">
              Login with Google
            </button>
          </div>
        </div>
      );
    }
    // If there's cached data, continue to show the board with a login prompt banner
  }

  return (
    <div className="kanban-board-container">
      {!isAuthenticated && (
        <div className="offline-banner">
          <span>📴 Viewing cached data. </span>
          <button onClick={handleLogin} className="login-link">Login to sync</button>
        </div>
      )}
      <div className="kanban-header">
        <h1 className="kanban-title">📋 Tasks & Events Board</h1>
        <div className="kanban-header-actions">
          {error && <span className="error-message">{error}</span>}
          {lastSyncTime && (
            <span className="last-sync">Last sync: {formatLastSync()}</span>
          )}
          <button
            onClick={handleRefresh}
            className={`refresh-btn ${syncing ? 'syncing' : ''}`}
            title="Sync with Google"
            disabled={syncing || !isAuthenticated}
          >
            <RefreshCw size={18} className={syncing ? 'spinning' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      <div className="kanban-columns-wrapper">
        {Object.entries(columns).map(([columnId, column]) => (
          <div
            key={columnId}
            className={`kanban-column ${columnId}`}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, columnId)}
          >
            <div className="kanban-column-header">
              <h2>
                {columnId === 'done' ? '✅ ' : columnId === 'inProgress' ? '🔄 ' : '📝 '}
                {column.title}
                <span className="kanban-count">{column.items.length}</span>
              </h2>
              <button
                onClick={() => setShowInput(columnId)}
                className="add-task-btn"
                title="Add task"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="kanban-items-list">
              {showInput === columnId && (
                <div className="kanban-input-area">
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTask(columnId)}
                    placeholder="Enter task title..."
                    className="kanban-input"
                    autoFocus
                  />
                  <div className="kanban-input-actions">
                    <button onClick={() => addTask(columnId)} className="btn-primary">
                      Add Task
                    </button>
                    <button
                      onClick={() => { setShowInput(null); setNewTaskInput(''); }}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {column.items.length === 0 && !showInput && (
                <div className="empty-column">
                  <p>No tasks here</p>
                </div>
              )}

              {column.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, item, columnId)}
                  className={`kanban-item ${columnId === 'done' ? 'completed' : ''} ${item.type === 'event' ? 'event-item' : ''}`}
                >
                  <div className="item-content">
                    {item.type === 'task' && (
                      <button
                        onClick={() => toggleTaskComplete(columnId, item)}
                        className="toggle-complete-btn"
                        title={columnId === 'done' ? 'Mark as incomplete' : 'Mark as complete'}
                      >
                        {columnId === 'done' ? (
                          <CheckCircle size={18} className="check-icon completed" />
                        ) : (
                          <Circle size={18} className="check-icon" />
                        )}
                      </button>
                    )}
                    {item.type === 'event' && (
                      <span className="event-icon" title="Calendar Event">
                        <Calendar size={16} />
                      </span>
                    )}
                    <div className="item-text">
                      <p className={columnId === 'done' ? 'task-completed' : ''}>
                        {item.content}
                      </p>
                      {item.type === 'event' && item.eventDate && (
                        <span className="event-time">{formatEventTime(item)}</span>
                      )}
                      {item.source === 'local' && (
                        <span className="local-badge">Local</span>
                      )}
                    </div>
                  </div>
                  <div className="item-footer">
                    <span className="item-source">
                      {item.source === 'google-tasks' && <ListTodo size={12} title="Google Task" />}
                      {item.source === 'google-calendar' && <Calendar size={12} title="Calendar Event" />}
                    </span>
                    <GripVertical size={14} className="grip-icon" />
                    <button
                      onClick={() => deleteItem(columnId, item)}
                      className="delete-item-btn"
                      title="Delete"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KanbanBoard;