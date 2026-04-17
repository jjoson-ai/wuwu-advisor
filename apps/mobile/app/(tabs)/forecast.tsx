import { RouteGate } from "@/components/route-gate";
import { ForecastScreenContent } from "@/features/forecast/forecast-screen";

export default function ForecastScreen() {
  return (
    <RouteGate title="Forecast">
      <ForecastScreenContent />
    </RouteGate>
  );
}
