import { useEffect, useState } from "react";
import {
  addWithBehaviorWasm,
  runAgentStateMachineWasmProbe,
  runDiscreteEventWasmProbe,
  runQueueSystemWasmProbe,
  runShopDecisionWasmProbe,
} from "./behaviorWasm";
import type {
  AgentStateProbeState,
  DiscreteEventProbeState,
  MovementBackendProbeState,
  QueueSystemProbeState,
  SharedArrayBufferProbeState,
  ShopDecisionProbeState,
} from "./AppTypes";
import { runFlowFieldProbe, type FlowFieldProbeResult } from "./flowFieldProbe";
import { runGpuGridProbe, type GpuGridProbeResult } from "./gpuGridProbe";
import { runHeatmapProbe, type HeatmapProbeResult } from "./heatmapProbe";
import { runMovementBackendProbe } from "./movementBackendProbe";
import { runSharedArrayBufferProbe } from "./sharedArrayBufferProbe";
import { runSocialForceProbe, type SocialForceProbeResult } from "./socialForceProbe";
import { runWebGpuProbe, type WebGpuProbeResult } from "./webgpuProbe";

export function useAppProbes() {
  const [behaviorSmokeValue, setBehaviorSmokeValue] = useState("Loading");
  const [agentStateProbe, setAgentStateProbe] = useState<AgentStateProbeState>({
    finalCode: 0,
    labels: [],
    message: "Checking",
    restoredLabel: "Unknown",
    sabStateLabels: [],
    status: "checking",
  });
  const [shopDecisionProbe, setShopDecisionProbe] = useState<ShopDecisionProbeState>({
    browserSummary: "",
    commuterChoice: "none",
    goalChoice: "none",
    message: "Checking",
    profileLabels: [],
    shopCount: 0,
    status: "checking",
  });
  const [queueSystemProbe, setQueueSystemProbe] = useState<QueueSystemProbeState>({
    dequeued: [],
    layout: "",
    message: "Checking",
    serviceTimes: [],
    status: "checking",
    throughput: 0,
  });
  const [discreteEventProbe, setDiscreteEventProbe] = useState<DiscreteEventProbeState>(
    {
      labels: [],
      message: "Checking",
      now: 0,
      pending: 0,
      ready: 0,
      status: "checking",
    },
  );
  const [webGpuProbe, setWebGpuProbe] = useState<WebGpuProbeResult>({
    input: [1, 2, 3, 4],
    message: "Checking",
    output: [],
    status: "unsupported",
    supported: false,
  });
  const [gridProbe, setGridProbe] = useState<GpuGridProbeResult>({
    cellCounts: [],
    cellIds: [],
    cellOffsets: [],
    message: "Checking",
    sortedAgentIds: [],
    status: "unsupported",
  });
  const [socialForceProbe, setSocialForceProbe] = useState<SocialForceProbeResult>({
    message: "Checking",
    positions: [],
    status: "unsupported",
    velocities: [],
  });
  const [flowFieldProbe, setFlowFieldProbe] = useState<FlowFieldProbeResult>({
    directions: [],
    message: "Checking",
    status: "unsupported",
  });
  const [heatmapProbe, setHeatmapProbe] = useState<HeatmapProbeResult>({
    cellCounts: [],
    maxCount: 0,
    message: "Checking",
    status: "unsupported",
  });
  const [movementBackendProbe, setMovementBackendProbe] =
    useState<MovementBackendProbeState>({
      activeBackend: "cpu-compat",
      message: "Checking",
      positions: [],
      readyBackend: "cpu-compat",
      status: "unsupported",
      velocities: [],
    });
  const [sharedArrayBufferProbe] = useState<SharedArrayBufferProbeState>(() =>
    runSharedArrayBufferProbe(),
  );

  useEffect(() => {
    let cancelled = false;

    addWithBehaviorWasm(19, 23)
      .then((value) => {
        if (!cancelled) {
          setBehaviorSmokeValue(String(value));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBehaviorSmokeValue("Unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runAgentStateMachineWasmProbe()
      .then((result) => {
        if (!cancelled) {
          setAgentStateProbe({
            ...result,
            message: "Agent state machine verified",
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAgentStateProbe({
            finalCode: 0,
            labels: [],
            message:
              error instanceof Error ? error.message : "Agent state probe failed",
            restoredLabel: "Unknown",
            sabStateLabels: [],
            status: "error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runShopDecisionWasmProbe()
      .then((result) => {
        if (!cancelled) {
          setShopDecisionProbe({
            ...result,
            message: "Shop decision verified",
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShopDecisionProbe({
            browserSummary: "",
            commuterChoice: "none",
            goalChoice: "none",
            message:
              error instanceof Error ? error.message : "Shop decision probe failed",
            profileLabels: [],
            shopCount: 0,
            status: "error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runQueueSystemWasmProbe()
      .then((result) => {
        if (!cancelled) {
          setQueueSystemProbe({
            ...result,
            message: "Queue system verified",
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setQueueSystemProbe({
            dequeued: [],
            layout: "",
            message:
              error instanceof Error ? error.message : "Queue system probe failed",
            serviceTimes: [],
            status: "error",
            throughput: 0,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runDiscreteEventWasmProbe()
      .then((result) => {
        if (!cancelled) {
          setDiscreteEventProbe({
            ...result,
            message: "DES queue verified",
            status: "ready",
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDiscreteEventProbe({
            labels: [],
            message: error instanceof Error ? error.message : "DES queue probe failed",
            now: 0,
            pending: 0,
            ready: 0,
            status: "error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runHeatmapProbe().then((result) => {
      if (!cancelled) {
        setHeatmapProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runMovementBackendProbe().then((result) => {
      if (!cancelled) {
        setMovementBackendProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runWebGpuProbe().then((result) => {
      if (!cancelled) {
        setWebGpuProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runGpuGridProbe().then((result) => {
      if (!cancelled) {
        setGridProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runSocialForceProbe().then((result) => {
      if (!cancelled) {
        setSocialForceProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    runFlowFieldProbe().then((result) => {
      if (!cancelled) {
        setFlowFieldProbe(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    agentStateProbe,
    behaviorSmokeValue,
    discreteEventProbe,
    flowFieldProbe,
    gridProbe,
    heatmapProbe,
    movementBackendProbe,
    queueSystemProbe,
    sharedArrayBufferProbe,
    shopDecisionProbe,
    socialForceProbe,
    webGpuProbe,
  };
}
