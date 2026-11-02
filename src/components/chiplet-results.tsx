import { record, records, safeHttpUrl, text, type DataRecord } from "@/lib/structured-results";

const labels: Record<string, string> = { IC_STL: "Chiplet 堆叠模型", IC_RDL: "RDL 与倒装互连", IC_INTERFACE: "芯片键合界面", IC_POWER: "功率分布" };

function extensionOf(name: string) {
  const ext = name.includes(".") ? name.split(".").pop() || "" : "";
  return ext.toUpperCase().slice(0, 4) || "文件";
}

// 对齐 XIMUALPHA 的 IC_* data[{key, src, desc}]。各次调用、各模型类型独立展示。
export function ChipletResults({ frames }: { frames: DataRecord[] }) {
  return <>{frames.map((frame, index) => {
    const kind = text(frame.type);
    if (!Object.hasOwn(labels, kind)) return null;
    const label = labels[kind];
    const seen = new Set<string>();
    const files = records(frame.data).flatMap(file => {
      const url = safeHttpUrl(file.src);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [{ url, name: text(file.key) || new URL(url).pathname.split("/").pop() || "服务文件", description: text(file.desc) }];
    });
    if (!files.length) return null;
    const meta = record(frame.meta);
    const layers = typeof meta?.layer_count === "number" && Number.isFinite(meta.layer_count) ? meta.layer_count : null;
    return <details className="run-service-section chiplet-files" key={`${text(frame.request_id) || text(frame.taskid) || index}:${text(frame.type)}:${index}`}>
      <summary><span className="chiplet-files-title">{label}</span><span className="chiplet-files-count">{files.length} 个文件</span></summary>
      {layers !== null && <p className="run-score-note">服务报告层数：{layers}（按原服务口径）。</p>}
      <ul className="file-cards">{files.map(file => <li key={file.url}><a className="file-card" href={file.url} target="_blank" rel="noopener noreferrer">
        <span className="file-card-ext" aria-hidden="true">{extensionOf(file.name)}</span>
        <span className="file-card-body"><strong>{file.name}</strong>{file.description && <span>{file.description}</span>}</span>
        <span className="file-card-open">{file.name.toLowerCase().endsWith(".glb") ? "查看" : "打开"}</span>
      </a></li>)}</ul>
      <p className="run-score-note">文件由原服务提供，打开链接查看或下载。</p>
    </details>;
  })}</>;
}
