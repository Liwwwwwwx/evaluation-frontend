import { AuthGate } from "@/components/auth-gate";
import { Workspace } from "@/components/workspace";

export default function Home() {
  return <AuthGate><Workspace /></AuthGate>;
}
