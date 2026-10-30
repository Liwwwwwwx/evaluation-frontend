export function RunServiceInfo({ serviceName, run }: { serviceName: string; run: unknown }) {
  const metadata = run && typeof run === "object" && !Array.isArray(run) ? run as Record<string, unknown> : null;
  let address = "";
  try {
    const url = new URL(typeof metadata?.serviceAddress === "string" ? metadata.serviceAddress : "");
    if (["ws:", "wss:", "http:", "https:"].includes(url.protocol)) address = `${url.protocol}//${url.host}${url.pathname}`;
  } catch {}
  return <><div><dt>服务</dt><dd>{serviceName}</dd></div><div><dt>{address && metadata?.serviceAddressSource === "configuration" ? "服务地址（当前配置）" : "服务地址"}</dt><dd className="mono">{address || "未记录"}</dd></div></>;
}
