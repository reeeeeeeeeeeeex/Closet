import { sqliteTable, text, integer, primaryKey, foreignKey, unique } from "drizzle-orm/sqlite-core";
export const colorLibrary = sqliteTable("color_library", {
  owner: text("owner").notNull(), colorKey: text("color_key").notNull(), name: text("name").notNull(), hex: text("hex"), usedAt: text("used_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.colorKey] })]);
export const colorLibrarySeeded = sqliteTable("color_library_seeded", { owner: text("owner").primaryKey() });
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), username: text("username").notNull(), usernameKey: text("username_key").notNull().unique(),
  secret: text("secret").notNull(),
});
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
export const syncMeta = sqliteTable('sync_meta', {key:text('key').primaryKey(),value:text('value').notNull()});
export const syncCollections = sqliteTable('sync_collections', {owner:text('owner').notNull(),collectionId:text('collection_id').notNull(),syncId:text('sync_id').notNull()},t=>[primaryKey({columns:[t.owner,t.collectionId]}),unique().on(t.owner,t.syncId)]);
export const syncCodes = sqliteTable('sync_codes', {codeHash:text('code_hash').primaryKey(),owner:text('owner').notNull(),expires:integer('expires').notNull()});
export const syncDevices = sqliteTable('sync_devices', {id:text('id').primaryKey(),owner:text('owner').notNull(),deviceId:text('device_id').notNull(),name:text('name').notNull(),tokenHash:text('token_hash').notNull().unique(),createdAt:text('created_at').notNull()});
export const syncReceipts = sqliteTable('sync_receipts', {deviceId:text('device_id').notNull(),requestId:text('request_id').notNull(),bodyHash:text('body_hash').notNull(),response:text('response').notNull()},t=>[primaryKey({columns:[t.deviceId,t.requestId]})]);
export const syncTombstones = sqliteTable('sync_tombstones', {owner:text('owner').notNull(),syncId:text('sync_id').notNull(),recordId:text('record_id').notNull(),deletedAt:text('deleted_at').notNull()},t=>[primaryKey({columns:[t.owner,t.syncId,t.recordId]})]);
