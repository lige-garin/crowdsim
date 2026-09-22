# Trajectory data used for calibration

## `eth-biwi-eth.txt`

**Source**: the ETH "Walking Pedestrians" dataset (Pellegrini, Ess, Tuytelaars
& Van Gool, "You'll Never Walk Alone: Modeling Social Behavior for
Multi-target Tracking", ICCV 2009) — a standard benchmark in the pedestrian
trajectory-prediction literature. Downloaded 2026-09-23, with the user's
explicit authorization, from the Stanford ASL `Trajectron-plus-plus`
repository's mirror of the preprocessed data:
<https://github.com/StanfordASL/Trajectron-plus-plus/blob/master/experiments/pedestrians/raw/raw/all_data/biwi_eth.txt>
(114 KB, 5492 lines).

**Format**: whitespace-separated `frame_number pedestrian_id x_meters
y_meters`, one row per pedestrian per observed frame. Frame numbers advance
in steps of 10; the trajectory-prediction literature that reuses this same
preprocessed file consistently documents that spacing as 0.4 seconds of
real time (e.g. the standard "8 observed / 12 predicted frames = 3.2 s / 4.8
s" ETH/UCY benchmark protocol) — this project has not independently
re-derived that figure from the original raw video, and uses it as
documented practice, disclosed here rather than presented as independently
verified.

**License note**: the `Trajectron-plus-plus` repository itself is
MIT-licensed, which covers that repository's own code — it is not a
re-licensing of the underlying ETH dataset, whose own original terms were
not independently checked by this project. The ETH pedestrian dataset is
one of the most widely reused benchmarks in the field (used in hundreds of
published papers without incident), and this project's use here is the same
kind of academic/research reuse — a calibration input for a research-and-
development crowd simulation project, not redistribution as a product
feature. Cite the original paper (Pellegrini et al., ICCV 2009) if this data
or anything derived from it is referenced externally.

**What it is used for**: `trajectoryCalibration.ts` /
`trajectoryCalibration.calibration.test.ts` — fitting `crowdMovement.ts`'s
own social-force parameters directly against observed pedestrian
accelerations, as a second, independent calibration method alongside the
existing fundamental-diagram fit (`2026-09-14-social-force-fundamental-diagram.md`)
that the fundamental-diagram report's own "Limits" section says this project
did not yet have: "no measured pedestrian trajectories were used."

**Scope, disclosed plainly**: one scene (ETH, an outdoor courtyard/street),
not the full ETH/UCY corpus (`biwi_hotel`, `crowds_zara01-03`,
`students001/003`, `uni_examples`, all available at the same source if a
broader fit is wanted later).
