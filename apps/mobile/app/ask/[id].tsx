import { RouteGate } from "@/components/route-gate";
import { AskDetailScreenContent } from "@/features/ask/ask-detail-screen";

export default function AskDetailScreen() {
  return (
    <RouteGate title="Saved Guidance">
      <AskDetailScreenContent />
    </RouteGate>
  );
}
