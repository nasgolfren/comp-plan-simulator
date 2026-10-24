export interface View {
  /** Full HTML of the page. */
  render(): string;
  /** Called after the HTML is in the DOM (draw charts, attach listeners). */
  mount?(root: HTMLElement): void;
  /** Called when stored data changes; refresh results without replacing focused inputs. */
  update?(root: HTMLElement, changed: string): void;
}
