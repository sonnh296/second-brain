-- =============================================================
-- Extend chat actions to document operations (rename / move / tag)
-- =============================================================

ALTER TABLE chat_actions DROP CONSTRAINT IF EXISTS chat_actions_action_type_check;
ALTER TABLE chat_actions ADD CONSTRAINT chat_actions_action_type_check
  CHECK (action_type IN (
    'create_note', 'update_note', 'delete_note', 'restore_note',
    'rename_document', 'move_document', 'tag_document'
  ));
