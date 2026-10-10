import { colorKey, isCommonColor, itemColorStyle, type ColorValue, type LibraryColor } from "./colors";
import type { LocalDatabase } from "./local-storage";
import { itemSchema } from "./domain";

// The caller owns the transaction: a failed item save must not leave suggestions behind.
export function rememberColors(db: LocalDatabase, owner: string, values: ColorValue[], usedAt: string) {
  for (const value of values) {
    if (isCommonColor(value)) continue;
    db.prepare("INSERT INTO color_library (owner,color_key,name,hex,used_at) VALUES (?,?,?,?,?) ON CONFLICT(owner,color_key) DO UPDATE SET used_at=MAX(used_at,excluded.used_at)")
      .bind(owner, colorKey(value), value.name.trim(), value.hex, usedAt).run();
  }
}
export function getColorLibrary(db: LocalDatabase, owner: string): LibraryColor[] {
  db.transaction(() => {
    if (db.prepare("SELECT owner FROM color_library_seeded WHERE owner=?").bind(owner).rows().length) return;
    const rows = db.prepare("SELECT data,updated_at FROM records WHERE owner=? AND kind='item'").bind(owner).rows<{ data: string; updated_at: string }>();
    for (const row of rows) rememberColors(db, owner, itemColorStyle(itemSchema.parse(JSON.parse(row.data))).values, row.updated_at);
    db.prepare("INSERT INTO color_library_seeded (owner) VALUES (?)").bind(owner).run();
  });
  return db.prepare("SELECT name,hex,used_at AS usedAt FROM color_library WHERE owner=? ORDER BY used_at DESC,color_key").bind(owner).rows<LibraryColor>();
}
