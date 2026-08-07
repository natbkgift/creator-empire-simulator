export const numberFrom = (data: FormData, key: string, fallback = 0): number => {
  const value = Number(data.get(key));
  return Number.isFinite(value) ? value : fallback;
};

export const stringFrom = (data: FormData, key: string, fallback = ''): string =>
  String(data.get(key) ?? fallback).trim();

export const copyText = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
};
