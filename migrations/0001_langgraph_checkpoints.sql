CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint_type TEXT NOT NULL,
  checkpoint_data TEXT NOT NULL,
  metadata_type TEXT NOT NULL,
  metadata_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_langgraph_checkpoints_latest
  ON langgraph_checkpoints (thread_id, checkpoint_ns, created_at DESC);
