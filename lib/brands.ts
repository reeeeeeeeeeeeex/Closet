import type { ItemRecord } from "./domain";

export const brandKey = (value: string) => value.trim().normalize("NFKC").toLowerCase();

export function itemBrands(items: ItemRecord[]): string[] {
  const brands = new Map<string, string>();
  for (const item of items) {
    const name = item.data.brand?.trim();
    if (name && !brands.has(brandKey(name))) brands.set(brandKey(name), name);
  }
  return [...brands.values()].sort((a, b) => a.localeCompare(b));
}

export function canonicalBrand(value: string, brands: string[]): string {
  return brands.find(brand => brandKey(brand) === brandKey(value)) ?? value.trim();
}
