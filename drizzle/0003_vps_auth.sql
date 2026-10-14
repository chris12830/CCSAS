CREATE TABLE vps_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','supplier')),disabled INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX vps_single_owner ON vps_users(role) WHERE role='owner';
CREATE TABLE vps_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES vps_users(id),expires_at INTEGER NOT NULL);
CREATE TABLE vps_invites(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
CREATE TABLE vps_login_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
