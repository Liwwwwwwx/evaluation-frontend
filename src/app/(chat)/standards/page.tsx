import { StandardsWorkspace } from "@/components/standards-workspace";

export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const value = (await searchParams).returnTo;
  let returnTo: string | undefined;
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    const url = new URL(value, "https://local.invalid");
    if (url.origin === "https://local.invalid" && (url.pathname === "/question-bank" || /^\/question-bank\/[^/]+$/.test(url.pathname))) {
      returnTo = url.pathname + url.search;
    }
  }
  return <StandardsWorkspace returnTo={returnTo} />;
}
