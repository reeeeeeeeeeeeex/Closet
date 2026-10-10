export const GARMENT_CATEGORIES = ["top", "bottom", "dress", "outerwear"] as const;
export const FITS = { tight: "紧身", fitted: "修身", regular: "常规", loose: "宽松" } as const;
export const SHOE_FITS = { trueToSize: "合脚", large: "偏大", small: "偏小" } as const;
export const MEASUREMENTS = {
  shoulderWidth: "肩宽", chest: "胸围", waist: "腰围", hips: "臀围", thigh: "大腿围", knee: "膝围",
  legOpening: "裤脚围", length: "长度", sleeveLength: "袖长", rise: "前裆长", hem: "下摆围",
} as const;
export type Measurement = keyof typeof MEASUREMENTS;
export const CATEGORY_MEASUREMENTS: Record<string, readonly Measurement[]> = {
  top: ["shoulderWidth", "chest", "length", "sleeveLength", "hem"],
  bottom: ["waist", "hips", "thigh", "knee", "legOpening", "length", "rise"],
  dress: ["shoulderWidth", "chest", "waist", "hips", "length", "sleeveLength"],
  outerwear: ["shoulderWidth", "chest", "length", "sleeveLength", "hem"],
};
export function measurementName(category: string, measurement: Measurement): string {
  if (measurement !== "length") return MEASUREMENTS[measurement];
  return category === "bottom" ? "裤长／裙长" : category === "dress" ? "裙长／连体衣长" : "衣长";
}
export function garmentCategory(category: string) { return GARMENT_CATEGORIES.some(value => value === category); }
