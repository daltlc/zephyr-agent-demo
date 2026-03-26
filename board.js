/**
 * Zephyr Boards — board.js
 *
 * Defines a <z-board> custom element that registers itself into the
 * Zephyr.agent system. The AI agent discovers board actions (addTask,
 * moveTask, etc.) through the standard 5 MCP tools — no prompt hacks.
 */

/* ======================================================================
   z-board Custom Element
   ====================================================================== */

class ZBoard extends HTMLElement {
  constructor() {
    super();
    /** @type {Map<string, Object>} */
    this._tasks = new Map();
    this._nextId = 1;
    this._boundCardClick = this._handleCardClick.bind(this);
    this._boundSort = this._handleSort.bind(this);
  }

  connectedCallback() {
    this.addEventListener('click', this._boundCardClick);

    // Listen to sort events from z-sortable columns
    this.querySelectorAll('z-sortable').forEach(col => {
      col.addEventListener('sort', this._boundSort);
    });

    // Register into Zephyr agent system
    this._registerAgent();

    // Wire up prompt chips
    this.querySelectorAll('.chip[data-prompt]').forEach(chip => {
      chip.addEventListener('click', () => {
        const agent = document.getElementById('agent');
        if (agent && agent.send) agent.send(chip.dataset.prompt);
      });
    });

    // Wire up settings dropdown
    this._wireSettings();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._boundCardClick);
    this.querySelectorAll('z-sortable').forEach(col => {
      col.removeEventListener('sort', this._boundSort);
    });
  }

  /* ------------------------------------------------------------------
     Agent Registration
     ------------------------------------------------------------------ */

  _registerAgent() {
    if (typeof Zephyr === 'undefined') return;

    // Register component in Zephyr's registry
    Zephyr.components.board = {
      tag: 'z-board',
      slots: [],
      attributes: [],
      events: ['taskchange'],
      methods: []
    };

    // Register agent actions — these become discoverable via getState/describe
    Zephyr.agent._actions['z-board'] = {
      addTask: (el, params) => el._addTask(params),
      moveTask: (el, params) => el._moveTask(params),
      deleteTask: (el, params) => el._deleteTask(params),
      editTask: (el, params) => el._editTask(params),
      clearBoard: (el) => el._clearBoard(),
    };

    // Add description for agent discovery
    Zephyr.agent._descriptions = Zephyr.agent._descriptions || {};
    Zephyr.agent._descriptions.board =
      'Task board manager. Use addTask to create cards, moveTask to change columns, ' +
      'editTask to update properties, deleteTask to remove, clearBoard to reset. ' +
      'Columns: "todo", "progress", "done". ' +
      'Priorities: "high", "medium", "low".';
  }

  /* ------------------------------------------------------------------
     Task CRUD — called by Zephyr.agent.act()
     ------------------------------------------------------------------ */

  /**
   * Add a new task card to the board.
   * @param {Object} params
   * @param {string} params.title - Task title (required)
   * @param {string} [params.column="todo"] - Column: "todo", "progress", or "done"
   * @param {string} [params.priority="medium"] - Priority: "high", "medium", or "low"
   * @param {string} [params.assignee] - Assignee name
   * @param {string} [params.due] - Due date (YYYY-MM-DD)
   */
  _addTask(params) {
    if (!params?.title) return { success: false, error: 'title is required' };

    const id = 'task-' + this._nextId++;
    const task = {
      id,
      title: params.title,
      column: params.column || 'todo',
      priority: params.priority || 'medium',
      assignee: params.assignee || '',
      due: params.due || '',
    };

    this._tasks.set(id, task);
    this._renderCard(task);
    this._updateCounts();
    this._updateTimeline();
    this._updateAssigneeFilter();
    this._toast('Task created: ' + task.title);
    this._dispatch('taskchange', { action: 'add', task });

    return { success: true, id, task };
  }

  /**
   * Move a task to a different column.
   * @param {Object} params
   * @param {string} params.id - Task ID or title substring to match
   * @param {string} params.column - Target column: "todo", "progress", or "done"
   */
  _moveTask(params) {
    if (!params?.column) return { success: false, error: 'column is required' };

    const task = this._findTask(params.id || params.title);
    if (!task) return { success: false, error: 'Task not found: ' + (params.id || params.title) };

    const card = this.querySelector('#' + task.id);
    const target = this._getColumn(params.column);
    if (!card || !target) return { success: false, error: 'Column not found: ' + params.column };

    task.column = this._normalizeColumn(params.column);
    target.appendChild(card);
    this._updateCounts();
    this._updateTimeline();
    this._toast('Moved "' + task.title + '" to ' + this._columnLabel(task.column));
    this._dispatch('taskchange', { action: 'move', task });

    return { success: true, task };
  }

  /**
   * Delete a task from the board.
   * @param {Object} params
   * @param {string} params.id - Task ID or title substring to match
   */
  _deleteTask(params) {
    const task = this._findTask(params?.id || params?.title);
    if (!task) return { success: false, error: 'Task not found' };

    const card = this.querySelector('#' + task.id);
    if (card) card.remove();
    this._tasks.delete(task.id);
    this._updateCounts();
    this._updateTimeline();
    this._toast('Deleted: ' + task.title);
    this._dispatch('taskchange', { action: 'delete', task });

    return { success: true };
  }

  /**
   * Edit an existing task's properties.
   * @param {Object} params
   * @param {string} params.id - Task ID or title substring to match
   * @param {string} [params.title] - New title
   * @param {string} [params.priority] - New priority
   * @param {string} [params.assignee] - New assignee
   * @param {string} [params.due] - New due date
   * @param {string} [params.column] - Move to column
   */
  _editTask(params) {
    const task = this._findTask(params?.id || params?.title);
    if (!task) return { success: false, error: 'Task not found' };

    if (params.title && params.title !== task.title) task.title = params.title;
    if (params.priority) task.priority = params.priority;
    if (params.assignee !== undefined) task.assignee = params.assignee;
    if (params.due !== undefined) task.due = params.due;

    // Re-render the card
    const card = this.querySelector('#' + task.id);
    if (card) {
      card.replaceWith(this._createCard(task));
    }

    // Move if column changed
    if (params.column) {
      task.column = this._normalizeColumn(params.column);
      const newCard = this.querySelector('#' + task.id);
      const target = this._getColumn(task.column);
      if (newCard && target) target.appendChild(newCard);
    }

    this._updateCounts();
    this._updateTimeline();
    this._updateAssigneeFilter();
    this._toast('Updated: ' + task.title);
    this._dispatch('taskchange', { action: 'edit', task });

    return { success: true, task };
  }

  /** Clear all tasks from the board. */
  _clearBoard() {
    this._tasks.clear();
    this.querySelectorAll('.task-card').forEach(c => c.remove());
    this._updateCounts();
    this._updateTimeline();
    this._toast('Board cleared');
    this._dispatch('taskchange', { action: 'clear' });

    return { success: true };
  }

  /* ------------------------------------------------------------------
     Card Rendering
     ------------------------------------------------------------------ */

  _createCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.id = task.id;
    card.dataset.sortable = 'task';
    card.dataset.priority = task.priority;
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', task.title);

    const title = document.createElement('div');
    title.className = 'task-card-title';
    title.textContent = task.title;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'task-card-meta';

    const badge = document.createElement('span');
    badge.className = 'priority-badge';
    badge.dataset.priority = task.priority;
    badge.textContent = task.priority;
    meta.appendChild(badge);

    if (task.assignee) {
      const assignee = document.createElement('span');
      assignee.textContent = task.assignee;
      meta.appendChild(assignee);
    }

    if (task.due) {
      const due = document.createElement('span');
      due.textContent = task.due;
      meta.appendChild(due);
    }

    card.appendChild(meta);
    return card;
  }

  _renderCard(task) {
    const col = this._getColumn(task.column);
    if (col) col.appendChild(this._createCard(task));
  }

  /* ------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------ */

  _findTask(query) {
    if (!query) return null;
    // Match by ID first
    if (this._tasks.has(query)) return this._tasks.get(query);
    // Match by title substring (case-insensitive)
    const q = query.toLowerCase();
    for (const task of this._tasks.values()) {
      if (task.id === query) return task;
      if (task.title.toLowerCase().includes(q)) return task;
    }
    return null;
  }

  _normalizeColumn(col) {
    const map = {
      'todo': 'todo', 'to do': 'todo', 'to-do': 'todo',
      'progress': 'progress', 'in progress': 'progress', 'in-progress': 'progress', 'inprogress': 'progress',
      'done': 'done', 'complete': 'done', 'completed': 'done',
    };
    return map[(col || '').toLowerCase()] || 'todo';
  }

  _getColumn(col) {
    const normalized = this._normalizeColumn(col);
    return this.querySelector('#col-' + normalized);
  }

  _columnLabel(col) {
    const labels = { todo: 'To Do', progress: 'In Progress', done: 'Done' };
    return labels[col] || col;
  }

  _updateCounts() {
    const counts = { todo: 0, progress: 0, done: 0 };
    for (const task of this._tasks.values()) {
      counts[task.column] = (counts[task.column] || 0) + 1;
    }
    for (const [col, count] of Object.entries(counts)) {
      const el = this.querySelector(`.column-count[data-column="${col}"]`);
      if (el) el.textContent = count;
    }
  }

  _updateTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;

    // Clear existing items (keep empty state)
    list.querySelectorAll('.timeline-item').forEach(i => i.remove());

    if (this._tasks.size === 0) {
      const empty = list.querySelector('.empty-state');
      if (empty) empty.style.display = '';
      return;
    }

    const empty = list.querySelector('.empty-state');
    if (empty) empty.style.display = 'none';

    // Sort by due date, then by title
    const sorted = [...this._tasks.values()].sort((a, b) => {
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return a.title.localeCompare(b.title);
    });

    for (const task of sorted) {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.dataset.priority = task.priority;

      const title = document.createElement('span');
      title.className = 'timeline-item-title';
      title.textContent = task.title;
      item.appendChild(title);

      const col = document.createElement('span');
      col.className = 'timeline-item-column';
      col.textContent = this._columnLabel(task.column);
      item.appendChild(col);

      const date = document.createElement('span');
      date.className = 'timeline-item-date';
      date.textContent = task.due || 'No date';
      item.appendChild(date);

      list.appendChild(item);
    }
  }

  _updateAssigneeFilter() {
    const combobox = document.getElementById('assignee-filter');
    if (!combobox) return;
    const listbox = combobox.querySelector('[role="listbox"]');
    if (!listbox) return;

    // Collect unique assignees
    const assignees = new Set();
    for (const task of this._tasks.values()) {
      if (task.assignee) assignees.add(task.assignee);
    }

    // Keep "All Assignees", remove the rest, add new ones
    const existing = listbox.querySelectorAll('[role="option"]:not([data-value="all"])');
    existing.forEach(o => o.remove());

    for (const name of [...assignees].sort()) {
      const opt = document.createElement('div');
      opt.setAttribute('role', 'option');
      opt.dataset.value = name;
      opt.textContent = name;
      listbox.appendChild(opt);
    }
  }

  _toast(message) {
    const toast = document.getElementById('toast');
    if (toast && toast.show) toast.show(message, 3000);
  }

  _dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  /* ------------------------------------------------------------------
     Event Handlers
     ------------------------------------------------------------------ */

  _handleCardClick(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;

    const task = this._tasks.get(card.id);
    if (!task) return;

    // Populate and open the detail modal
    const modal = document.getElementById('task-detail');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    if (!modal || !content) return;

    if (title) title.textContent = task.title;
    content.innerHTML = '';

    const rows = [
      ['Priority', task.priority],
      ['Column', this._columnLabel(task.column)],
      ['Assignee', task.assignee || '—'],
      ['Due', task.due || '—'],
      ['ID', task.id],
    ];

    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'modal-detail-row';

      const lbl = document.createElement('span');
      lbl.className = 'modal-detail-label';
      lbl.textContent = label;
      row.appendChild(lbl);

      const val = document.createElement('span');
      val.textContent = value;
      row.appendChild(val);

      content.appendChild(row);
    }

    if (modal.open) modal.open();
  }

  _handleSort(e) {
    // When a card is dragged between columns, update the task's column
    const col = e.target.closest('z-sortable');
    if (!col) return;

    const colMap = {
      'col-todo': 'todo',
      'col-progress': 'progress',
      'col-done': 'done',
    };
    const column = colMap[col.id];
    if (!column) return;

    // Update all cards in this column
    col.querySelectorAll('.task-card').forEach(card => {
      const task = this._tasks.get(card.id);
      if (task && task.column !== column) {
        task.column = column;
      }
    });

    this._updateCounts();
    this._updateTimeline();
  }

  /* ------------------------------------------------------------------
     Settings Menu
     ------------------------------------------------------------------ */

  _wireSettings() {
    const dropdown = document.getElementById('settings-dropdown');
    if (!dropdown) return;

    dropdown.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.dataset.action) {
        case 'toggle-theme': {
          const html = document.documentElement;
          const isDark = html.dataset.theme === 'dark';
          if (isDark) {
            delete html.dataset.theme;
          } else {
            html.dataset.theme = 'dark';
          }
          this._toast(isDark ? 'Switched to light mode' : 'Switched to dark mode');
          break;
        }
        case 'clear-board':
          this._clearBoard();
          break;
      }
    });

    // Modal close button
    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const modal = document.getElementById('task-detail');
        if (modal && modal.close) modal.close();
      });
    }
  }
}

customElements.define('z-board', ZBoard);
