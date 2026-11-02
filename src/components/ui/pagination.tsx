import { Button } from "./button";
import styles from "./ui.module.css";

export function Pagination({ page, pages, total, onPageChange, pageSize, disabled = false, className }: {
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  disabled?: boolean;
  className?: string;
}) {
  const safePages = Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), safePages);
  const start = pageSize && total > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const end = pageSize ? Math.min(safePage * pageSize, total) : total;
  const summary = pageSize && total > 0 ? `第 ${start}–${end} 条 / 共 ${total} 条` : `共 ${total} 条`;

  return <nav className={[styles.pagination, className].filter(Boolean).join(" ")} aria-label="分页">
    <p className={styles.paginationSummary}>{summary}</p>
    <div className={styles.paginationControls}>
      <Button variant="secondary" disabled={disabled || safePage <= 1} onClick={() => onPageChange(Math.max(1, safePage - 1))}>上一页</Button>
      <span className={styles.pageIndicator}>第 {safePage} / {safePages} 页</span>
      <Button variant="secondary" disabled={disabled || safePage >= safePages} onClick={() => onPageChange(Math.min(safePages, safePage + 1))}>下一页</Button>
    </div>
  </nav>;
}
