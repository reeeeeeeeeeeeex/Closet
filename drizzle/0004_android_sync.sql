CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sync_collections (owner TEXT NOT NULL, collection_id TEXT NOT NULL, sync_id TEXT NOT NULL, PRIMARY KEY(owner,collection_id), UNIQUE(owner,sync_id));
CREATE TABLE sync_codes (code_hash TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE sync_devices (id TEXT PRIMARY KEY, owner TEXT NOT NULL, device_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE sync_receipts (device_id TEXT NOT NULL, request_id TEXT NOT NULL, body_hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(device_id,request_id));
