import { RouteGate } from "@/components/route-gate";
import { AskScreenContent } from "@/features/ask/ask-screen";

export default function AskScreen() {
  return (
    <RouteGate title="Ask">
      <AskScreenContent />
    </RouteGate>
  );
}
