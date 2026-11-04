import { RunComparison } from "@/components/run-comparison";
import { previewComparison } from "@/lib/comparison-preview";

export default function PreviewComparisonPage() {
  return <RunComparison comparison={previewComparison} preview backHref="/preview/batches" />;
}
