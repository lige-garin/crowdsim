# Panel Status (audit 2026-06-19)

Reachable = imported & rendered from the app shell (App.tsx / AppStage /
AppInspector). Orphaned = referenced only by its own *.test. Dead = referenced
by nothing.

## Reachable (~8)
SimulationViewport, ContactNetworkView, SceneEditor (+SceneEditorLayout/
Controls/ParamPanel), BioCityAnalyticsPanel, AiImageOverlay.

## Orphaned (mount + feed real data in SP-5)
BrandIntelligencePanel, ScaleReadinessPanel, ScenarioComparisonPanel,
NeuralCorrectionPanel, ProjectWorkspacePanel, TemplateLibraryPanel,
TilesBackdropPanel, AiWorkflowPanel, CollaborationStatusPanel,
ValidationReportPanel, ExperimentSweepPanel, ExperimentSummaryPanel,
ImageGeometryPanel, TrajectoryReplayPanel.

## Dead (referenced by nothing)
DashboardPanel, DashboardV2Panel, SimulationCredibilityPanel, and the
BioCity*Acceptance/Package panels (the acceptance ones are removed in Task 6).

> NOTE: re-run the reachability grep before SP-5 to refresh this list; the
> numbers above are the 2026-06-19 snapshot.
