import { sqliteTable, text, integer, primaryKey, foreignKey } from "drizzle-orm/sqlite-core";
export const collections = sqliteTable("collections", {
  owner: text("owner").notNull(), id: text("id").notNull(), name: text("name").notNull(), createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.id] })]);
export const records = sqliteTable("records", {
  owner: text("owner").notNull(), collectionId: text("collection_id").notNull(), id: text("id").notNull(), kind: text("kind").notNull(),
  data: text("data").notNull(), version: integer("version").notNull().default(1), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.collectionId, t.id] }),
  foreignKey({ columns: [t.owner, t.collectionId], foreignColumns: [collections.owner, collections.id] })]);
export const assets = sqliteTable("assets", {
  owner: text("owner").notNull(), hash: text("hash").notNull(), name: text("name").notNull(), mime: text("mime").notNull(),
  size: integer("size").notNull(), storageKey: text("storage_key").notNull(), createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.hash] })]);
