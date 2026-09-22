/**
 * A generic, bounded Nelder–Mead simplex search over named parameters, each
 * scaled to its own bounds. Extracted from `fundamentalDiagramFit.ts`'s own
 * fitter (the fundamental-diagram calibration, 2026-09-14) so a second
 * calibration — against real trajectory data rather than a published curve
 * — can reuse the same solver instead of a second copy of this simplex
 * logic with a different cost function hardcoded into it.
 */
export function boundedNelderMead<Name extends string>(
  names: readonly Name[],
  bounds: Record<Name, readonly [number, number]>,
  start: Record<Name, number>,
  cost: (parameters: Record<Name, number>) => number,
  options: {
    maxEvaluations?: number;
    onEvaluation?: (parameters: Record<Name, number>, value: number) => void;
  } = {},
): { evaluations: number; parameters: Record<Name, number>; value: number } {
  const maxEvaluations = options.maxEvaluations ?? 60;
  const toUnit = (value: number, name: Name) =>
    (value - bounds[name][0]) / (bounds[name][1] - bounds[name][0]);
  const fromUnit = (unit: number[]) =>
    Object.fromEntries(
      names.map((name, index) => {
        const [low, high] = bounds[name];
        return [name, low + Math.min(1, Math.max(0, unit[index])) * (high - low)];
      }),
    ) as Record<Name, number>;

  let evaluations = 0;
  const evaluate = (unit: number[]) => {
    const parameters = fromUnit(unit);
    const value = cost(parameters);
    evaluations++;
    options.onEvaluation?.(parameters, value);
    return value;
  };

  const origin = names.map((name) => toUnit(start[name], name));
  let simplex = [
    origin,
    ...names.map((_, axis) =>
      origin.map((value, index) => (index === axis ? value + 0.15 : value)),
    ),
  ].map((point) => ({ point, value: evaluate(point) }));

  while (evaluations < maxEvaluations) {
    simplex.sort((a, b) => a.value - b.value);
    const best = simplex[0];
    const worst = simplex[simplex.length - 1];
    const secondWorst = simplex[simplex.length - 2];
    const centroid = names.map(
      (_, index) =>
        simplex.slice(0, -1).reduce((sum, vertex) => sum + vertex.point[index], 0) /
        (simplex.length - 1),
    );
    const along = (factor: number) =>
      centroid.map((value, index) => value + factor * (worst.point[index] - value));

    const reflected = along(-1);
    const reflectedValue = evaluate(reflected);
    if (reflectedValue < best.value) {
      const expanded = along(-2);
      const expandedValue = evaluate(expanded);
      simplex[simplex.length - 1] =
        expandedValue < reflectedValue
          ? { point: expanded, value: expandedValue }
          : { point: reflected, value: reflectedValue };
    } else if (reflectedValue < secondWorst.value) {
      simplex[simplex.length - 1] = { point: reflected, value: reflectedValue };
    } else {
      const contracted = along(0.5);
      const contractedValue = evaluate(contracted);
      if (contractedValue < worst.value) {
        simplex[simplex.length - 1] = { point: contracted, value: contractedValue };
      } else {
        simplex = simplex.map((vertex, index) =>
          index === 0
            ? vertex
            : (() => {
                const point = vertex.point.map(
                  (value, axis) => best.point[axis] + 0.5 * (value - best.point[axis]),
                );
                return { point, value: evaluate(point) };
              })(),
        );
      }
    }
  }

  simplex.sort((a, b) => a.value - b.value);
  return {
    evaluations,
    parameters: fromUnit(simplex[0].point),
    value: simplex[0].value,
  };
}
