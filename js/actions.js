import { BANKST_API_BASE } from './config.js';

class ActionHub {
  constructor() {
    this.modal = null;
    this.setupModal();
  }

  setupModal() {
    let dialog = document.getElementById('actionModal');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'actionModal';
      dialog.className = 'system-modal';
      document.body.appendChild(dialog);
    }
    this.modal = dialog;

    this.modal.addEventListener('click', (e) => {
      const rect = this.modal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) this.close();
    });
  }

  async execute(actionId, context = {}) {
    console.log(`[ActionHub] Executing ${actionId}`, context);

    switch (actionId) {
      case 'interaction':
        this.renderInteractionForm(context);
        break;
      case 'note':
        this.renderNoteForm(context);
        break;
      case 'master-import':
        this.handleImport(context);
        break;
      default:
        console.warn(`Unknown action: ${actionId}`);
    }
  }

  open() {
    this.modal.showModal();
    this.modal.classList.add('is-open');
  }

  close() {
    this.modal.classList.remove('is-open');
    setTimeout(() => this.modal.close(), 180);
  }

  renderInteractionForm(ctx) {
    this.modal.innerHTML = `
      <div class="modal-header">
        <div class="eyebrow">Log Interaction</div>
        <div class="modal-title">${ctx.entityLabel || 'Entity'}</div>
      </div>
      <form class="modal-body" id="interactionForm">
        <div class="input-group">
          <label class="rail-label">Type</label>
          <select name="type" class="system-select">
            <option value="call">Phone Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="conference">Conference</option>
          </select>
        </div>
        <div class="input-group">
          <label class="rail-label">Summary</label>
          <textarea name="summary" class="system-textarea" placeholder="Key takeaways..." autofocus></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="toolbar-button" data-close-modal>Cancel</button>
          <button type="submit" class="toolbar-button is-active">Save Interaction</button>
        </div>
      </form>
    `;
    this.open();

    this.modal.querySelector('#interactionForm').onsubmit = (e) => {
      e.preventDefault();
      // TODO: POST to BANKST_API_BASE + '/interactions'
      this.close();
    };

    this.modal.querySelector('[data-close-modal]').onclick = () => this.close();
  }

  renderNoteForm(ctx) {
    this.modal.innerHTML = `
      <div class="modal-header">
        <div class="eyebrow">Add Note</div>
        <div class="modal-title">${ctx.entityLabel || 'Entity'}</div>
      </div>
      <form class="modal-body" id="noteForm">
        <div class="input-group">
          <label class="rail-label">Note</label>
          <textarea name="body" class="system-textarea" placeholder="Write a note..." autofocus></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="toolbar-button" data-close-modal>Cancel</button>
          <button type="submit" class="toolbar-button is-active">Save Note</button>
        </div>
      </form>
    `;
    this.open();

    this.modal.querySelector('#noteForm').onsubmit = (e) => {
      e.preventDefault();
      // TODO: POST to BANKST_API_BASE + '/notes'
      this.close();
    };

    this.modal.querySelector('[data-close-modal]').onclick = () => this.close();
  }

  async handleImport(ctx) {
    console.log('[ActionHub] Importing entity...', ctx.id);
    // TODO: POST to BANKST_API_BASE + '/master/import'
  }
}

export const actions = new ActionHub();
