import { escapeHtml } from '../domain/utils.js';

export const showToast = (message: string, tone: 'success' | 'warning' | 'danger' | 'info' = 'success'): void => {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  region.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 20);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 220);
  }, 2800);
};

export const openDialog = (title: string, body: string, size: 'sm' | 'md' | 'lg' | 'xl' = 'lg'): HTMLDialogElement => {
  const existing = document.getElementById('app-dialog');
  existing?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'app-dialog';
  dialog.className = `app-dialog ${size}`;
  dialog.innerHTML = `<div class="dialog-shell"><div class="dialog-head"><h2>${escapeHtml(title)}</h2><button type="button" class="icon-button" data-dialog-close aria-label="Close dialog">×</button></div><div class="dialog-body">${body}</div></div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-dialog-close')) dialog.close();
    if (target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
  return dialog;
};

export const confirmDialog = (title: string, message: string, confirmLabel = 'ยืนยัน'): Promise<boolean> =>
  new Promise((resolve) => {
    const dialog = openDialog(
      title,
      `<p class="dialog-message">${escapeHtml(message)}</p><div class="dialog-actions"><button type="button" class="btn ghost" data-dialog-cancel>ยกเลิก</button><button type="button" class="btn danger" data-dialog-confirm>${escapeHtml(confirmLabel)}</button></div>`,
      'sm',
    );
    dialog.querySelector('[data-dialog-cancel]')?.addEventListener('click', () => {
      resolve(false);
      dialog.close();
    });
    dialog.querySelector('[data-dialog-confirm]')?.addEventListener('click', () => {
      resolve(true);
      dialog.close();
    });
    dialog.addEventListener('cancel', () => resolve(false), { once: true });
  });
