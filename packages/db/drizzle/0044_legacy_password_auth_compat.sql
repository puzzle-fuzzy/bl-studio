-- 0043 新增 password_auth_enabled 时无法从历史随机 password_hash 区分
-- GitHub-only 账号与「先有邮箱密码、后绑定 GitHub」账号。
-- 仅恢复有历史邮箱账号行为证据的记录：邮箱验证发生在建号之后，或历史绑定/
-- 密码重置操作曾写入 auth.github/auth.password-change。新建 GitHub-only 账号的 created_at 与
-- email_verified_at 相同、updated_by 为 system，因此仍保持 false。
UPDATE "users"
SET
  "password_auth_enabled" = true,
  "updated_at" = now(),
  "updated_by" = 'migration:legacy-password-auth'
WHERE "github_id" IS NOT NULL
  AND "password_auth_enabled" = false
  AND (
    "email_verified_at" > "created_at"
    OR "updated_by" IN ('auth.github', 'auth.password-change')
  );
