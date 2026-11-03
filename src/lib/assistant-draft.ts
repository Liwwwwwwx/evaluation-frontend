const draftKeys = {
  score: "evaluation-assistant-score-v1",
  standards: "evaluation-assistant-standards-v1",
} as const;

export function assistantDraftKey(kind: keyof typeof draftKeys, userId: unknown): string | null {
  return typeof userId === "string" && userId.trim() ? `${draftKeys[kind]}:${userId}` : null;
}

export function clearAssistantDrafts(userId: unknown) {
  for (const kind of ["score", "standards"] as const) {
    clearDraft(draftKeys[kind]); // 旧版未按账户隔离的草稿不能安全迁移。
    clearDraft(assistantDraftKey(kind, userId));
  }
}

export function readDraft<T>(key: string | null): T | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string | null, value: unknown) {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* 存储不可用时不阻塞编辑 */ }
}

export function clearDraft(key: string | null) {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch { /* 存储不可用时不阻塞编辑 */ }
}
