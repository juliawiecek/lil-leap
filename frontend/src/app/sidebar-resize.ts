import { computed, signal } from '@angular/core';

/** Width limits for a resizable sidebar, in pixels. Below `compact` only icons fit, so labels hide. */
export interface SidebarLimits {
  min: number;
  compact: number;
  default: number;
  max: number;
}

/**
 * A sidebar whose edge drags to resize, from an icon strip up to a wide panel, with keyboard
 * steps on the edge and a double-click to collapse or re-open. The width is remembered per browser
 * under `storageKey`. The novice and advanced dashboards share this so both edges behave alike.
 */
export class SidebarResize {
  /** Sidebar width in pixels. */
  readonly width = signal(0);
  /** Narrow enough that only icons fit, so labels are hidden. */
  readonly collapsed = computed(() => this.width() < this.limits.compact);
  /** True while the edge is being dragged, so the width follows the pointer without easing. */
  readonly resizing = signal(false);
  readonly min: number;
  readonly max: number;
  /** The width to return to when the sidebar re-opens. */
  #openWidth: number;

  constructor(
    private readonly storageKey: string,
    private readonly limits: SidebarLimits,
    /** The grid shell whose left edge the drag is measured from. */
    private readonly shellSelector: string,
  ) {
    this.min = limits.min;
    this.max = limits.max;
    this.#openWidth = limits.default;
    this.width.set(this.#stored());
  }

  /** Collapse to icons, or re-open at the last open width. */
  toggle(): void {
    if (this.collapsed()) {
      this.#set(this.#openWidth);
    } else {
      this.#openWidth = this.width();
      this.#set(this.limits.min);
    }
  }

  /** Drags the sidebar's edge; letting go in the icon-only range snaps to the icon strip. */
  start(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const shell = (event.currentTarget as HTMLElement).closest(this.shellSelector) as HTMLElement | null;
    const left = shell?.getBoundingClientRect().left ?? 0;
    this.resizing.set(true);
    const move = (moved: PointerEvent): void => this.width.set(this.#clamp(moved.clientX - left));
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.resizing.set(false);
      if (this.collapsed()) {
        this.#set(this.limits.min);
      } else {
        this.#openWidth = this.width();
        this.#set(this.width());
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Keyboard resizing on the edge: arrows step 16px, Home collapses, End opens fully. */
  keys(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -16, ArrowRight: 16 };
    if (event.key in steps) {
      event.preventDefault();
      this.#set(this.width() + steps[event.key]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.#set(event.key === 'Home' ? this.limits.min : this.limits.max);
    } else {
      // Other keys retain their native browser behavior.
    }
  }

  #clamp(width: number): number {
    return Math.round(Math.min(this.limits.max, Math.max(this.limits.min, width)));
  }

  #stored(): number {
    try {
      const saved = Number(globalThis.localStorage?.getItem(this.storageKey));
      return saved ? this.#clamp(saved) : this.limits.default;
    } catch {
      return this.limits.default;
    }
  }

  #set(width: number): void {
    const next = this.#clamp(width);
    this.width.set(next);
    try {
      globalThis.localStorage?.setItem(this.storageKey, String(next));
    } catch {
      // Storage can be unavailable (private windows); the width just isn't remembered.
    }
  }
}
