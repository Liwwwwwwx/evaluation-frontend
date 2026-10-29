import { AuthGate } from "@/components/auth-gate";
import { Workspace } from "@/components/workspace";
import { QuestionBank } from "@/components/question-bank";

export default function QuestionBankPage() {
  return <AuthGate><Workspace><QuestionBank /></Workspace></AuthGate>;
}
