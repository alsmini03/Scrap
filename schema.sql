-- Books Table
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  cover_image TEXT,
  description TEXT,
  published_date TEXT,
  price TEXT,
  category TEXT,
  status TEXT NOT NULL,
  rating INTEGER DEFAULT 0,
  notes TEXT,
  progress INTEGER DEFAULT 0,
  added_at TEXT,
  completed_at TEXT,
  deleted_at TEXT,
  user_id TEXT,
  intro TEXT,
  toc TEXT,
  author_intro TEXT,
  inside TEXT,
  publisher_review TEXT,
  yes24_url TEXT,
  is_liked BOOLEAN DEFAULT FALSE
);

-- YouTube Videos Table
CREATE TABLE IF NOT EXISTS youtube_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail TEXT,
  duration TEXT,
  published_at TEXT,
  summary TEXT,
  gemini_model TEXT,
  description TEXT,
  user_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  is_liked BOOLEAN DEFAULT FALSE
);

-- Gemini Models Table
CREATE TABLE IF NOT EXISTS gemini_models (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  youtube_default BOOLEAN DEFAULT FALSE,
  report_default BOOLEAN DEFAULT FALSE,
  blog_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Gemini API Keys Table

-- Gemini Prompts Table
CREATE TABLE IF NOT EXISTS gemini_prompts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  youtube_default BOOLEAN DEFAULT FALSE,
  report_default BOOLEAN DEFAULT FALSE,
  blog_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- YouTube Tabs Table
CREATE TABLE IF NOT EXISTS youtube_tabs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Yes24 Tabs Table
CREATE TABLE IF NOT EXISTS yes24_tabs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Blog Tabs Table
CREATE TABLE IF NOT EXISTS blog_tabs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Report Tabs Table
CREATE TABLE IF NOT EXISTS report_tabs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Saved Reports Table
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  institution TEXT,
  date TEXT,
  url TEXT,
  content TEXT,
  summary TEXT,
  gemini_model TEXT,
  user_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  is_liked BOOLEAN DEFAULT FALSE,
  item_name TEXT,
  item_code TEXT
);

-- Naver Blogs Table
CREATE TABLE IF NOT EXISTS naver_blogs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  url TEXT NOT NULL,
  thumbnail TEXT,
  content TEXT,
  published_at TEXT,
  user_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  is_liked BOOLEAN DEFAULT FALSE,
  summary TEXT,
  gemini_model TEXT
);

-- Auth.js Tables (PostgreSQL Adapter)
-- https://authjs.dev/reference/adapter/pg

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  gemini_key_index INTEGER DEFAULT 1,
  gemini_key_change_phrases TEXT,
  gemini_key_change_direction TEXT DEFAULT 'asc'
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(255),
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  CONSTRAINT fk_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" VARCHAR(255) NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE,
  CONSTRAINT fk_user_session FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Gemini Queue Table
CREATE TABLE IF NOT EXISTS gemini_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'youtube', 'report'
  target_id TEXT NOT NULL, -- ID in youtube_videos or reports table
  payload JSONB NOT NULL, -- contains model, prompt, url etc.
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gemini_queue_user_status ON gemini_queue(user_id, status);
