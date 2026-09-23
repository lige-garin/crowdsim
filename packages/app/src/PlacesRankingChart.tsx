import { buildPlacesRankingOption, type RankedPlace } from "./placesRanking";
import { EChart } from "./EChart";

export function PlacesRankingChart({
  language,
  places,
}: {
  language: "en" | "zh";
  places: readonly RankedPlace[];
}) {
  return (
    <EChart
      ariaLabel={language === "zh" ? "停留与等待人次排名" : "Stays and waits ranking"}
      height={Math.max(60, places.length * 22)}
      option={buildPlacesRankingOption(places)}
    />
  );
}
