export function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* 存储不可用时不阻塞编辑 */ }
}

export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch { /* 存储不可用时不阻塞编辑 */ }
}
