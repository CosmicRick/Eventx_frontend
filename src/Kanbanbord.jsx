import React, { useState, useEffect, useCallback } from 'react';
import { GripVertical, Plus, X, RefreshCw, LogIn, CheckCircle, Circle } from 'lucide-react';
import api from './api';
import './kanbanbord.css';

const KanbanBoard = ({ isAuthenticated: propIsAuthenticated }) => {
  const [columns, setColumns] = useState({
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
  });

  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [showInput, setShowInput] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(propIsAuthenticated ?? false);
  const [error, setError] = useState(null);

  // Fetch tasks from Google Tasks API
  const fetchTasks = useCallback(async () => {
    try {
      setSyncing(true);
      setError(null);

      const tasksRes = await api.get('/tasks/?show_completed=true', { withCredentials: true });

      const rawTasks = tasksRes.data?.tasks ?? tasksRes.data ?? [];
      const tasks = Array.isArray(rawTasks) ? rawTasks : [];

      // Separate tasks by status
      const todoTasks = tasks.filter(t => t.status !== 'completed').map(task => ({
        id: `task-${task.id}`,
        content: task.title,
        type: 'task',
        originalId: task.id,
        status: task.status,
        notes: task.notes || '',
        completed: task.completed || null
      }));

      const completedTasks = tasks.filter(t => t.status === 'completed').map(task => ({
        id: `task-${task.id}`,
        content: task.title,
        type: 'task',
        originalId: task.id,
        status: task.status,
        notes: task.notes || '',
        completed: task.completed || null
      }));

      setColumns({
        todo: {
          title: 'To Do',
          items: todoTasks
        },
        inProgress: {
          title: 'In Progress',
          items: [] // Google Tasks doesn't have "in progress" status, we track locally
        },
        done: {
          title: 'Done',
          items: completedTasks
        }
      });

    } catch (err) {
      console.error("Error fetching tasks:", err);
      if (err.response?.status === 401) {
        setIsAuthenticated(false);
      } else {
        setError('Failed to load tasks. Please try again.');
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
        setColumns({
          todo: { title: 'To Do', items: [] },
          inProgress: { title: 'In Progress', items: [] },
          done: { title: 'Done', items: [] }
        });
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
        setLoading(false);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setIsAuthenticated(false);
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

    setDraggedItem(null);
    setDraggedFrom(null);

    // Sync with Google Tasks API
    if (item.type === 'task' && item.originalId) {
      try {
        if (targetColumnId === 'done') {
          // Mark task as completed in Google Tasks
          await api.put(`/tasks/${item.originalId}/complete`, {}, { withCredentials: true });
          console.log('Task marked as completed in Google Tasks');

          // Update item status locally
          setColumns(prev => ({
            ...prev,
            done: {
              ...prev.done,
              items: prev.done.items.map(i =>
                i.id === item.id ? { ...i, status: 'completed' } : i
              )
            }
          }));
        } else if (sourceColumnId === 'done' && (targetColumnId === 'todo' || targetColumnId === 'inProgress')) {
          // Moving from done to todo/inProgress - mark as uncompleted
          await api.put(`/tasks/${item.originalId}/uncomplete`, {}, { withCredentials: true });
          console.log('Task marked as uncompleted in Google Tasks');

          // Update item status locally
          setColumns(prev => ({
            ...prev,
            [targetColumnId]: {
              ...prev[targetColumnId],
              items: prev[targetColumnId].items.map(i =>
                i.id === item.id ? { ...i, status: 'needsAction' } : i
              )
            }
          }));
        }
        // Note: Moving between todo and inProgress is local-only (Google Tasks doesn't have this state)
      } catch (err) {
        console.error("Error syncing task status:", err);
        // Revert on error
        setColumns(columns);
        setError('Failed to sync task status. Please try again.');
      }
    }
  };

  const addTask = async (columnId) => {
    if (!newTaskInput.trim()) return;

    const taskTitle = newTaskInput.trim();
    setNewTaskInput('');
    setShowInput(null);

    // Determine if task should be created as completed
    const isCompleted = columnId === 'done';

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
        notes: response.data.notes || ''
      };

      // If created as completed, also mark it complete via the API
      if (isCompleted && response.data.id) {
        await api.put(`/tasks/${response.data.id}/complete`, {}, { withCredentials: true });
        newTask.status = 'completed';
      }

      // Add to local state
      setColumns(prev => ({
        ...prev,
        [columnId]: {
          ...prev[columnId],
          items: [...prev[columnId].items, newTask]
        }
      }));

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('kanban-task-added'));

    } catch (err) {
      console.error("Error creating task:", err);
      setError('Failed to create task. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const toggleTaskComplete = async (columnId, item) => {
    if (item.type !== 'task' || !item.originalId) return;

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
      setError('Failed to update task. Please try again.');
    }
  };

  const deleteItem = async (columnId, item) => {
    // Remove from state immediately
    setColumns(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        items: prev[columnId].items.filter(i => i.id !== item.id)
      }
    }));

    // Sync with backend
    if (item.type === 'task' && item.originalId) {
      try {
        await api.delete(`/tasks/${item.originalId}`, { withCredentials: true });
        window.dispatchEvent(new CustomEvent('kanban-task-deleted'));
      } catch (err) {
        console.error("Error deleting task:", err);
        // Revert on error
        setColumns(prev => ({
          ...prev,
          [columnId]: {
            ...prev[columnId],
            items: [...prev[columnId].items, item]
          }
        }));
        setError('Failed to delete task. Please try again.');
      }
    }
  };

  const handleLogin = () => {
    window.location.href = `${api.defaults.baseURL}/auth/login`;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <div>Loading tasks from Google...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
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

  return (
    <div className="kanban-board-container">
      <div className="kanban-header">
        <h1 className="kanban-title">📋 Google Tasks Board</h1>
        <div className="kanban-header-actions">
          {error && <span className="error-message">{error}</span>}
          <button
            onClick={handleRefresh}
            className={`refresh-btn ${syncing ? 'syncing' : ''}`}
            title="Sync with Google Tasks"
            disabled={syncing}
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
                  className={`kanban-item ${columnId === 'done' ? 'completed' : ''}`}
                >
                  <div className="item-content">
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
                    <p className={columnId === 'done' ? 'task-completed' : ''}>
                      {item.content}
                    </p>
                  </div>
                  <div className="item-footer">
                    <GripVertical size={14} className="grip-icon" />
                    <button
                      onClick={() => deleteItem(columnId, item)}
                      className="delete-item-btn"
                      title="Delete task"
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

      <div className="kanban-footer">
        <p className="sync-info">
          Tasks are synced with Google Tasks. Completed tasks are saved to the Done column.
        </p>
      </div>
    </div>
  );
};

export default KanbanBoard;