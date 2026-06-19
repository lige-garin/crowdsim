import { useMemo } from "react";
import {
  createBioCityFinalUiAcceptanceAudit,
  createBioCityFinalUiAcceptanceReport,
} from "./bioCityFinalUiAcceptance";

export function BioCityFinalUiAcceptancePanel() {
  const { audit, report } = useMemo(() => {
    const report = createBioCityFinalUiAcceptanceReport();

    return {
      audit: createBioCityFinalUiAcceptanceAudit(report),
      report,
    };
  }, []);

  return (
    <section className="probe-panel" aria-label="BioCity final UI acceptance">
      <h3>BioCity final UI acceptance</h3>
      <p>
        Phase 3.10 gate {audit.completeCount}/{audit.itemCount} complete |{" "}
        {audit.completionPercent}% | blockers {audit.remainingBlockers.length}
      </p>
      {report.map((item) => (
        <code key={item.id}>
          {item.id} {item.status} | {item.evidence.join(" | ")}
        </code>
      ))}
    </section>
  );
}
