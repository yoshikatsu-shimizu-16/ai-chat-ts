import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from "@langchain/langgraph";
import type { D1Database } from "@cloudflare/workers-types";
import type { RunnableConfig } from "@langchain/core/runnables";

type ChannelVersions = Record<string, number | string>;
type PendingWrite = [string, unknown];
type CheckpointListOptions = {
  limit?: number;
  before?: RunnableConfig;
  filter?: Record<string, unknown>;
};

type CheckpointRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  checkpoint_type: string;
  checkpoint_data: string;
  metadata_type: string;
  metadata_data: string;
  created_at: string;
};

function encodeBytes(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function decodeBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class D1Checkpointer extends BaseCheckpointSaver {
  constructor(private readonly database: D1Database) {
    super();
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    if (typeof threadId !== "string" || !threadId) return undefined;
    const checkpointNamespace = String(config.configurable?.checkpoint_ns ?? "");
    const checkpointId = config.configurable?.checkpoint_id;
    const row = await this.database
      .prepare(
        `SELECT * FROM langgraph_checkpoints
         WHERE thread_id = ?1 AND checkpoint_ns = ?2
           AND (?3 IS NULL OR checkpoint_id = ?3)
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(threadId, checkpointNamespace, checkpointId ?? null)
      .first<CheckpointRow>();
    if (!row) return undefined;

    return {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: await this.serde.loadsTyped(row.checkpoint_type, decodeBytes(row.checkpoint_data)),
      metadata: await this.serde.loadsTyped(row.metadata_type, decodeBytes(row.metadata_data)),
      ...(row.parent_checkpoint_id
        ? {
            parentConfig: {
              configurable: {
                thread_id: row.thread_id,
                checkpoint_ns: row.checkpoint_ns,
                checkpoint_id: row.parent_checkpoint_id,
              },
            },
          }
        : {}),
    };
  }

  async *list(config: RunnableConfig, options: CheckpointListOptions = {}) {
    const threadId = config.configurable?.thread_id;
    if (typeof threadId !== "string" || !threadId) return;
    const limit = options.limit ?? 20;
    const rows = await this.database
      .prepare(
        `SELECT * FROM langgraph_checkpoints
         WHERE thread_id = ?1
         ORDER BY created_at DESC LIMIT ?2`,
      )
      .bind(threadId, limit)
      .all<CheckpointRow>();
    for (const row of rows.results) {
      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint: await this.serde.loadsTyped(row.checkpoint_type, decodeBytes(row.checkpoint_data)),
        metadata: await this.serde.loadsTyped(row.metadata_type, decodeBytes(row.metadata_data)),
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions?: ChannelVersions,
  ) {
    void _newVersions;
    const threadId = config.configurable?.thread_id;
    if (typeof threadId !== "string" || !threadId) {
      throw new Error("thread_id is required for D1 checkpoint persistence");
    }
    const checkpointNamespace = String(config.configurable?.checkpoint_ns ?? "");
    const [[checkpointType, checkpointData], [metadataType, metadataData]] = await Promise.all([
      this.serde.dumpsTyped(checkpoint),
      this.serde.dumpsTyped(metadata),
    ]);
    await this.database
      .prepare(
        `INSERT OR REPLACE INTO langgraph_checkpoints
         (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
          checkpoint_type, checkpoint_data, metadata_type, metadata_data, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        threadId,
        checkpointNamespace,
        checkpoint.id,
        config.configurable?.checkpoint_id ?? null,
        checkpointType,
        encodeBytes(checkpointData),
        metadataType,
        encodeBytes(metadataData),
        checkpoint.ts,
      )
      .run();
    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNamespace,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(_config: RunnableConfig, _writes: PendingWrite[], _taskId: string) {
    // 現在のグラフは割り込み・再開を使わないため、保留中の書き込みは不要。
    // 割り込みノードを追加する場合は、このメソッドで専用テーブルへ保存する。
    void _config;
    void _writes;
    void _taskId;
    // This graph has no interruptible tasks, so there are no pending writes to persist.
  }

  async deleteThread(threadId: string) {
    await this.database
      .prepare("DELETE FROM langgraph_checkpoints WHERE thread_id = ?1")
      .bind(threadId)
      .run();
  }
}
