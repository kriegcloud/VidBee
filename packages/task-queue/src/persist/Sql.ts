export const SQL_INSERT_TASK = `
INSERT INTO tasks (
  id, kind, parent_id, status, prev_status, status_reason, entered_status_at,
  priority, group_key, attempt, max_attempts, next_retry_at, pid,
  pid_started_at, created_at, updated_at, input_json, progress_json,
  output_json, last_error_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SQL_UPSERT_TASK = `
INSERT INTO tasks (
  id, kind, parent_id, status, prev_status, status_reason, entered_status_at,
  priority, group_key, attempt, max_attempts, next_retry_at, pid,
  pid_started_at, created_at, updated_at, input_json, progress_json,
  output_json, last_error_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  kind = excluded.kind,
  parent_id = excluded.parent_id,
  status = excluded.status,
  prev_status = excluded.prev_status,
  status_reason = excluded.status_reason,
  entered_status_at = excluded.entered_status_at,
  priority = excluded.priority,
  group_key = excluded.group_key,
  attempt = excluded.attempt,
  max_attempts = excluded.max_attempts,
  next_retry_at = excluded.next_retry_at,
  pid = excluded.pid,
  pid_started_at = excluded.pid_started_at,
  updated_at = excluded.updated_at,
  input_json = excluded.input_json,
  progress_json = excluded.progress_json,
  output_json = excluded.output_json,
  last_error_json = excluded.last_error_json
`;

export const SQL_UPSERT_PROGRESS = `
UPDATE tasks SET progress_json = ?, updated_at = strftime('%s', 'now') * 1000 WHERE id = ?
`;

export const SQL_INSERT_ATTEMPT = `
INSERT INTO attempts (id, task_id, attempt_number, started_at, raw_args_hash)
VALUES (?, ?, ?, ?, ?)
`;

export const SQL_CLOSE_ATTEMPT = `
UPDATE attempts SET
  ended_at = ?,
  exit_code = ?,
  error_category = ?,
  stdout_tail = ?,
  stderr_tail = ?
WHERE id = ?
`;

export const SQL_APPEND_JOURNAL = `
INSERT INTO process_journal (ts, op, task_id, attempt_id, pid, pid_started_at, exit_code, signal)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

export const SQL_FIND_OPEN_SPAWNS = `
SELECT s.*
FROM process_journal s
WHERE s.op = 'spawn'
  AND NOT EXISTS (
    SELECT 1 FROM process_journal c
    WHERE c.task_id = s.task_id
      AND IFNULL(c.attempt_id, '') = IFNULL(s.attempt_id, '')
      AND c.pid = s.pid
      AND c.op IN ('close', 'killed')
      AND c.seq > s.seq
  )
ORDER BY s.seq ASC
`;

export const SQL_HAS_TASK = `
SELECT 1 AS present FROM tasks WHERE id = ?
`;

export const SQL_LOAD_ALL_TASKS = `
SELECT tasks.*, (
  SELECT MIN(started_at) FROM attempts WHERE attempts.task_id = tasks.id
) AS first_started_at
FROM tasks`;

export const SQL_LOAD_LATEST_ATTEMPT = `
SELECT * FROM attempts
WHERE task_id = ?
ORDER BY attempt_number DESC
LIMIT 1
`;

export const SQL_AGE_JOURNAL = `
DELETE FROM process_journal WHERE ts < ?
`;
