export type CrowdEventScript =
  | {
      atSeconds: number;
      entranceId: string;
      kind: "close-entrance";
      sourceText: string;
    }
  | {
      atSeconds: number;
      factor: number;
      kind: "arrival-surge";
      sourceText: string;
      sourceId: string;
    }
  | {
      atSeconds: number;
      kind: "evacuation";
      reason: string;
      sourceText: string;
    };

const entranceAliases: Record<string, string> = {
  east: "east-sink",
  north: "north-exit",
  south: "south-exit",
  west: "west-source",
  东门: "east-sink",
  北门: "north-exit",
  南门: "south-exit",
  西门: "west-source",
};

export function parseNaturalLanguageEventScript(text: string): CrowdEventScript[] {
  const eventTexts = text
    .split(/[;\n。]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return eventTexts.map(parseSingleEvent);
}

function parseSingleEvent(sourceText: string): CrowdEventScript {
  const normalized = sourceText.toLowerCase();
  const atSeconds = parseClockSeconds(sourceText);

  if (
    normalized.includes("close") ||
    normalized.includes("closed") ||
    sourceText.includes("关闭")
  ) {
    return {
      atSeconds,
      entranceId: findEntranceId(sourceText),
      kind: "close-entrance",
      sourceText,
    };
  }

  if (
    normalized.includes("surge") ||
    normalized.includes("arrival") ||
    sourceText.includes("激增")
  ) {
    return {
      atSeconds,
      factor: parseFactor(sourceText),
      kind: "arrival-surge",
      sourceId: findEntranceId(sourceText),
      sourceText,
    };
  }

  return {
    atSeconds,
    kind: "evacuation",
    reason:
      normalized.includes("fire") || sourceText.includes("火") ? "fire" : "manual",
    sourceText,
  };
}

function parseClockSeconds(text: string) {
  const match = text.match(/(\d{1,2})[:：](\d{2})/);

  if (!match) {
    return 0;
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60;
}

function parseFactor(text: string) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*x/i);

  return match ? Number(match[1]) : 2;
}

function findEntranceId(text: string) {
  const normalized = text.toLowerCase();
  const match = Object.entries(entranceAliases).find(
    ([alias]) => normalized.includes(alias.toLowerCase()) || text.includes(alias),
  );

  return match?.[1] ?? "main-exit";
}
