import { useMemo } from "react";
import { bioCityDemoScene } from "./bioCityDemoScene";
import {
  createBioCityVisualAcceptanceAudit,
  createBioCityVisualAcceptanceReport,
} from "./bioCityVisualAcceptance";

export function BioCityVisualAcceptancePanel() {
  const { audit, report } = useMemo(() => {
    const report = createBioCityVisualAcceptanceReport(bioCityDemoScene);

    return {
      audit: createBioCityVisualAcceptanceAudit(report),
      report,
    };
  }, []);

  return (
    <section className="probe-panel" aria-label="BioCity visual acceptance">
      <h3>BioCity visual acceptance</h3>
      <p>
        Phase 3.7 gate {audit.completeCount}/{audit.itemCount} complete |{" "}
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
