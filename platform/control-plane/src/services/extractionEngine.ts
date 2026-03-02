export interface ExtractionField {
  value: unknown;
  confidence: number;
  status: "captured" | "partial" | "pending";
}

export interface ExtractionResult {
  completionScore: number;
  fields: Record<string, ExtractionField>;
}

export function runPostSessionExtraction(input: {
  transcript: Array<{role: string; text: string}>;
  schema?: {
    outcomes?: Array<{
      field: string;
      required?: boolean;
      type?: string;
    }>;
    completionThreshold?: number;
  };
}): ExtractionResult {
  const schemaOutcomes = input.schema?.outcomes ?? [];
  const transcriptText = input.transcript.map((line) => line.text).join(" ").toLowerCase();
  const fields: Record<string, ExtractionField> = {};

  let capturedRequired = 0;
  let requiredCount = 0;

  for (const outcome of schemaOutcomes) {
    const field = outcome.field;
    const hasSignal = transcriptText.includes(field.replaceAll("_", " ").toLowerCase());
    const status: ExtractionField["status"] = hasSignal ? "captured" : "pending";
    fields[field] = {
      value: hasSignal ? `derived:${field}` : null,
      confidence: hasSignal ? 0.72 : 0,
      status,
    };
    if (outcome.required) {
      requiredCount += 1;
      if (hasSignal) capturedRequired += 1;
    }
  }

  const completionScore =
    requiredCount > 0 ? capturedRequired / requiredCount : Math.min(1, Object.keys(fields).length > 0 ? 0.5 : 0);

  return {
    completionScore,
    fields,
  };
}
