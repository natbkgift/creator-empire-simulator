let renderer: (() => void) | null = null;

export const registerRenderer = (next: () => void): void => {
  renderer = next;
};

export const requestRender = (): void => {
  renderer?.();
};
