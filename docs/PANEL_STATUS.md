# Panel Status (audit 2026-06-19)

Reachable = imported & rendered from the app shell (App.tsx / AppStage /
AppInspector). Orphaned = referenced only by its own *.test. Dead = referenced
by nothing.

## Reachable (~8)
SimulationViewport, ContactNetworkView, SceneEditor (+SceneEditorLayout/
Controls/ParamPanel), BioCityAnalyticsPanel, AiImageOverlay.

## Reachable via PanelDock (SP-5a — DONE, all 14 mounted)
All previously-orphaned panels are now registered in `panelRegistry.tsx` and
reachable through `PanelDock` (mounted in `App.tsx`), each with a render-smoke
test (`panelRegistry.*.test.tsx`):
BrandIntelligencePanel, ScaleReadinessPanel, ScenarioComparisonPanel,
NeuralCorrectionPanel, ProjectWorkspacePanel, TemplateLibraryPanel,
TilesBackdropPanel, AiWorkflowPanel, CollaborationStatusPanel,
ValidationReportPanel, ExperimentSweepPanel, ExperimentSummaryPanel,
ImageGeometryPanel, TrajectoryReplayPanel.

SP-5a delivered REACHABILITY. Live brand insight + trajectory recording are
wired through `PanelDockContext`; the other 12 panels are self-contained.
Deeper real-data/backend/AI integration and turning the SP-0-flagged
fabricated features into real implementations is SP-5b (not yet done).

## Dead (referenced by nothing)
DashboardPanel, DashboardV2Panel, SimulationCredibilityPanel, and the
BioCity*Acceptance/Package panels (the acceptance ones are removed in Task 6).

> NOTE: re-run the reachability grep before SP-5 to refresh this list; the
> numbers above are the 2026-06-19 snapshot.
