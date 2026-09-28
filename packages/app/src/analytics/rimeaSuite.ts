/**
 * RiMEA's verification tests, and how far this engine has been put through
 * them (gap-closure plan 1.2). Split for B5 (2026-09-24) from one 3142-line
 * file into `./rimea/`, one module per test plus `shared.ts`/`suite.ts` --
 * see `./rimea/shared.ts` for the full account of why and how. This file is
 * now just the barrel that re-exports all of it, so nothing importing
 * `from "./rimeaSuite"` had to change.
 */
export * from "../rimea/shared";
export * from "../rimea/test01Corridor";
export * from "../rimea/test02_03StairSpeed";
export * from "../rimea/test04FundamentalDiagram";
export * from "../rimea/test05Premovement";
export * from "../rimea/test06Corner";
export * from "../rimea/test07DemographicSpeed";
export * from "../rimea/test08ParameterStudy";
export * from "../rimea/test09LargePublicSpace";
export * from "../rimea/test10EscapeRoute";
export * from "../rimea/test11TwoExitChoice";
export * from "../rimea/test12Bottleneck";
export * from "../rimea/test13StairCrowd";
export * from "../rimea/test15LargeCorner";
export * from "../rimea/test16OneDimensional";
export * from "../rimea/suite";
