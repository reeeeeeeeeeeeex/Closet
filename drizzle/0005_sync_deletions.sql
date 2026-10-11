CREATE TABLE sync_tombstones (owner TEXT NOT NULL, sync_id TEXT NOT NULL, record_id TEXT NOT NULL, deleted_at TEXT NOT NULL, PRIMARY KEY(owner,sync_id,record_id));
