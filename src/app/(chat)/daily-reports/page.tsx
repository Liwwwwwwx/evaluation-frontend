import { BatchListPage } from "@/components/batch-list";

export default function DailyReportsPage() {
  return <BatchListPage basePath="/batches" initialTab="reports" />;
}
