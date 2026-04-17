import { RouteGate } from "@/components/route-gate";
import { BlueprintScreenContent } from "@/features/blueprint/blueprint-screen";

export default function BlueprintScreen() {
  return (
    <RouteGate title="Your Birth Blueprint">
      <BlueprintScreenContent />
    </RouteGate>
  );
}
