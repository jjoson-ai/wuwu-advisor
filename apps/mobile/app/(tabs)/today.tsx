import { RouteGate } from "@/components/route-gate";
import { TodayScreenContent } from "@/features/today/today-screen";

export default function TodayScreen() {
  return (
    <RouteGate title="Today">
      <TodayScreenContent />
    </RouteGate>
  );
}
