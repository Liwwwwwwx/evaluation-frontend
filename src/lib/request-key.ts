// HTTP 下仍可用；幂等键需要随机性，不依赖 UUID 格式。
export function createRequestKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
