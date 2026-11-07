export type GenerationChoice = { programIds: string[]; mode: "individual" | "combined"; pdf: boolean };
export function mergeGenerationChoice(previous: GenerationChoice | undefined, choice: Partial<GenerationChoice>): GenerationChoice {
  return { programIds: [], mode: "individual", pdf: false, ...previous, ...choice };
}
