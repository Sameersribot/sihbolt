/*
  # End-to-End Encryption Schema (Signal Protocol)

  1. New Tables
    - `user_devices`
      - `id` (uuid, primary key) - Device identifier
      - `user_id` (uuid) - References profiles(id)
      - `device_name` (text) - Human-readable device name
      - `identity_key` (text) - Long-term X25519 public identity key
      - `signed_prekey` (text) - Signed prekey (rotated periodically)
      - `prekey_signature` (text) - Signature of the signed prekey
      - `one_time_prekeys` (jsonb) - Array of one-time prekeys
      - `created_at` (timestamptz) - Device registration time
      - `last_active` (timestamptz) - Last activity timestamp

    - `conversation_sessions`
      - `id` (uuid, primary key)
      - `conversation_id` (uuid) - References conversations(id)
      - `sender_device_id` (uuid) - References user_devices(id)
      - `receiver_device_id` (uuid) - References user_devices(id)
      - `root_key` (text) - Current root key
      - `chain_key_send` (text) - Sending chain key
      - `chain_key_receive` (text) - Receiving chain key
      - `send_counter` (integer) - Message counter for sending
      - `receive_counter` (integer) - Message counter for receiving
      - `previous_counter` (integer) - For skipped messages
      - `dh_send_public` (text) - Current DH sending public key
      - `dh_send_private` (text) - Current DH sending private key (stored encrypted)
      - `dh_receive` (text) - Current DH receiving public key
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `message_keys`
      - `id` (uuid, primary key)
      - `session_id` (uuid) - References conversation_sessions(id)
      - `message_number` (integer) - Message number in chain
      - `message_key` (text) - Derived message key
      - `created_at` (timestamptz)

  2. Changes to Existing Tables
    - `messages` table
      - Add `device_id` (uuid) - References user_devices(id)
      - Add `ratchet_key` (text) - Message's ratchet public key
      - Add `message_number` (integer) - Message number in chain
      - Add `previous_counter` (integer) - Previous chain length

  3. Security
    - Enable RLS on all new tables
    - Users can only access their own device keys
    - Session keys are only accessible to conversation participants
*/

-- Create user_devices table
CREATE TABLE IF NOT EXISTS user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  device_name text NOT NULL DEFAULT 'Default Device',
  identity_key text NOT NULL,
  signed_prekey text NOT NULL,
  prekey_signature text NOT NULL,
  one_time_prekeys jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_active timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, identity_key)
);

-- Create conversation_sessions table
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_device_id uuid REFERENCES user_devices(id) ON DELETE CASCADE NOT NULL,
  receiver_device_id uuid REFERENCES user_devices(id) ON DELETE CASCADE NOT NULL,
  root_key text NOT NULL,
  chain_key_send text NOT NULL,
  chain_key_receive text NOT NULL,
  send_counter integer DEFAULT 0 NOT NULL,
  receive_counter integer DEFAULT 0 NOT NULL,
  previous_counter integer DEFAULT 0 NOT NULL,
  dh_send_public text NOT NULL,
  dh_send_private text NOT NULL,
  dh_receive text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(conversation_id, sender_device_id, receiver_device_id)
);

-- Create message_keys table for skipped messages
CREATE TABLE IF NOT EXISTS message_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES conversation_sessions(id) ON DELETE CASCADE NOT NULL,
  message_number integer NOT NULL,
  message_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(session_id, message_number)
);

-- Add encryption fields to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN device_id uuid REFERENCES user_devices(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'ratchet_key'
  ) THEN
    ALTER TABLE messages ADD COLUMN ratchet_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_number'
  ) THEN
    ALTER TABLE messages ADD COLUMN message_number integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'previous_counter'
  ) THEN
    ALTER TABLE messages ADD COLUMN previous_counter integer DEFAULT 0;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_devices
CREATE POLICY "Users can view own devices"
  ON user_devices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
  ON user_devices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON user_devices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
  ON user_devices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view devices of conversation partners"
  ON user_devices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
      WHERE cp1.user_id = auth.uid()
      AND cp2.user_id = user_devices.user_id
    )
  );

-- RLS Policies for conversation_sessions
CREATE POLICY "Users can view own sessions"
  ON conversation_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = sender_device_id
      AND user_devices.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = receiver_device_id
      AND user_devices.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own sessions"
  ON conversation_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = sender_device_id
      AND user_devices.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own sessions"
  ON conversation_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = sender_device_id
      AND user_devices.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = receiver_device_id
      AND user_devices.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = sender_device_id
      AND user_devices.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_devices
      WHERE user_devices.id = receiver_device_id
      AND user_devices.user_id = auth.uid()
    )
  );

-- RLS Policies for message_keys
CREATE POLICY "Users can view own message keys"
  ON message_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN user_devices ud ON (ud.id = cs.sender_device_id OR ud.id = cs.receiver_device_id)
      WHERE cs.id = message_keys.session_id
      AND ud.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own message keys"
  ON message_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN user_devices ud ON (ud.id = cs.sender_device_id OR ud.id = cs.receiver_device_id)
      WHERE cs.id = message_keys.session_id
      AND ud.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own message keys"
  ON message_keys FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN user_devices ud ON (ud.id = cs.sender_device_id OR ud.id = cs.receiver_device_id)
      WHERE cs.id = message_keys.session_id
      AND ud.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_conversation ON conversation_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_sender ON conversation_sessions(sender_device_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_receiver ON conversation_sessions(receiver_device_id);
CREATE INDEX IF NOT EXISTS idx_message_keys_session ON message_keys(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_device ON messages(device_id);
