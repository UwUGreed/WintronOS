import {
  integrationLabels,
  type IntegrationState,
} from "@/lib/integration-types";

export function IntegrationStatus({ state }: { state: IntegrationState }) {
  return (
    <span className={`integration-status integration-${state.toLowerCase()}`}>
      {integrationLabels[state]}
    </span>
  );
}
