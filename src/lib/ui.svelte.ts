/** Transient UI state: overlays, menus, dialogs and toasts. */

export type MenuItem =
  | {
      label: string;
      icon?: string;
      hint?: string;
      danger?: boolean;
      checked?: boolean;
      disabled?: boolean;
      action: () => void;
    }
  | { separator: true }
  | { header: string };

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
  /** Align the menu's right edge to x instead of its left edge. */
  alignRight?: boolean;
  onClose?: () => void;
}

export interface IconPickerState {
  x: number;
  y: number;
  onPick: (emoji: string) => void;
  onRemove?: () => void;
}

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

class UI {
  searchOpen = $state(false);
  settingsOpen = $state(false);
  trashOpen = $state(false);
  menu = $state<MenuState | null>(null);
  iconPicker = $state<IconPickerState | null>(null);
  confirmState = $state<ConfirmState | null>(null);
  toasts = $state<Toast[]>([]);
  /** Page whose title should take focus once shown (new page, "Rename"). */
  focusTitle = $state<string | null>(null);
  #toastId = 0;

  get anyModalOpen() {
    return this.searchOpen || this.settingsOpen || this.trashOpen || this.confirmState !== null;
  }

  openMenu(state: MenuState) {
    // Let a menu that's being replaced clean up (e.g. un-highlight its row).
    this.menu?.onClose?.();
    this.menu = state;
  }

  openMenuAt(anchor: Element, items: MenuItem[], opts: { alignRight?: boolean; onClose?: () => void } = {}) {
    const r = anchor.getBoundingClientRect();
    this.openMenu({
      x: opts.alignRight ? r.right : r.left,
      y: r.bottom + 6,
      items,
      alignRight: opts.alignRight,
      onClose: opts.onClose,
    });
  }

  closeMenu() {
    const m = this.menu;
    this.menu = null;
    m?.onClose?.();
  }

  pickIcon(anchor: Element | DOMRect, onPick: (emoji: string) => void, onRemove?: () => void) {
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
    this.iconPicker = { x: r.left, y: r.bottom + 6, onPick, onRemove };
  }

  confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmState = {
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        danger: opts.danger ?? false,
        resolve,
      };
    });
  }

  toast(message: string, action?: { label: string; run: () => void }, ms = 4500) {
    const id = ++this.#toastId;
    this.toasts.push({ id, message, actionLabel: action?.label, action: action?.run });
    if (this.toasts.length > 3) this.toasts.shift();
    setTimeout(() => this.dismissToast(id), ms);
  }

  dismissToast(id: number) {
    const i = this.toasts.findIndex((t) => t.id === id);
    if (i >= 0) this.toasts.splice(i, 1);
  }

  error(e: unknown) {
    console.error(e);
    this.toast(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Something went wrong');
  }
}

export const ui = new UI();
