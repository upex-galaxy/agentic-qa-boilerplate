# Troubleshooting: Common Database and API MCP Issues

This guide documents real issues encountered during MCP configuration and their verified solutions.

---

## Database Connection Issues

### Error: `ENETUNREACH` with IPv6 Address

**Symptom:**

```
Failed to connect to PostgreSQL database: Error: connect ENETUNREACH 2600:1f18:2e13:9d37:7429:2f13:d1ef:5476:5432
```

**Cause:** Your network only supports IPv4, but Supabase is attempting to connect via IPv6.

**Solution:** Use Supabase's **Shared Pooler** instead of the direct connection.

| Type                 | Host                                 | Port |
| -------------------- | ------------------------------------ | ---- |
| ❌ Direct Connection | `db.<ref>.supabase.co`               | 5432 |
| ✅ Shared Pooler     | `aws-0-<region>.pooler.supabase.com` | 6543 |

**How to get the Shared Pooler:**

1. Supabase Dashboard → Project Settings → Database
2. Change **Method** from "Direct connection" to "Transaction" or "Session"
3. Copy the new connection string

---

### Error: `bash: !@...: event not found`

**Symptom:**

```bash
npx -y @bytebase/dbhub --dsn "postgresql://user:Password!@host..."
bash: !@host: event not found
```

**Cause:** Bash interprets `!` as a history command when using double quotes.

**Solution:** Use **single quotes** in Bash:

```bash
# ❌ Incorrect (double quotes)
npx -y @bytebase/dbhub --dsn "postgresql://user:Pass!@host/db"

# ✅ Correct (single quotes)
npx -y @bytebase/dbhub --dsn 'postgresql://user:Pass!@host/db'
```

**Alternative:** Use environment variables in JSON configuration:

```json
{
  "env": {
    "DB_PASSWORD": "Password_With_Special_Chars!@#"
  }
}
```

---

### Error: `Password authentication failed`

**Possible causes:**

1. **Incorrect password** - Verify the password in Supabase Dashboard
2. **User does not exist** - Verify that you created the user with the correct SQL
3. **Incorrect user format in Shared Pooler** - The format must be `user.project`

**Correct format for Shared Pooler:**

```
postgresql://qa_team.ionevzckjyxtpmyenbxc:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Note:** The user is `qa_team.ionevzckjyxtpmyenbxc`, NOT just `qa_team`.

---

## Windows-Specific Issues

### Error: `EPERM: operation not permitted, rmdir`

**Symptom:**

```
npm warn cleanup Failed to remove some directories
npm warn cleanup [Error: EPERM: operation not permitted, rmdir 'C:\Users\...\node_modules\@azure\...']
```

**Cause:** npm has permission issues when cleaning cache on Windows.

**Solutions (in order of preference):**

#### Option 1: Clean npm cache

```powershell
# PowerShell as Administrator
npm cache clean --force
```

Then try the command again.

#### Option 2: Manually delete cache folder

1. Close all terminals, VS Code, Cursor
2. Delete the folder: `C:\Users\<User>\AppData\Local\npm-cache\_npx`
3. Run the command again

#### Option 3: Install globally

```powershell
npm install -g @bytebase/dbhub
dbhub --transport stdio --dsn "your_connection_string"
```

---

### Error: `gyp ERR! find Python`

**Symptom:**

```
gyp ERR! find Python You need to install the latest version of Python.
error: install script from "better-sqlite3" exited with 1
```

**Cause:** DBHub has a native dependency (`better-sqlite3`) that requires Python and Build Tools to compile on Windows.

**Solutions:**

#### Option 1: Install build dependencies

1. Install Python from [python.org](https://www.python.org/downloads/)
   - ✅ Check "Add Python to PATH" during installation

2. Install Build Tools:

   ```powershell
   npm install -g windows-build-tools
   ```

3. Restart terminal and try again

#### Option 2: Use Docker (avoids compilation)

```powershell
docker run --rm -it bytebase/dbhub --transport stdio --dsn "postgresql://user:pass@host:6543/postgres"
```

MCP configuration with Docker:

```json
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "bytebase/dbhub",
        "--transport",
        "stdio",
        "--dsn",
        "postgresql://user:pass@host:6543/postgres"
      ]
    }
  }
}
```

#### Option 3: Use WSL (Windows Subsystem for Linux)

If you have WSL installed, run from there:

```bash
npx -y @bytebase/dbhub --transport stdio --dsn 'postgresql://user:pass@host:6543/postgres'
```

#### Option 4: Use Bun instead of npm

```powershell
# Install Bun
powershell -c "irm bun.sh/install.ps1 | iex"

# Run with bunx
bunx @bytebase/dbhub --transport stdio --dsn "postgresql://user:pass@host:6543/postgres"
```

---

### Differences between terminals on Windows

| Terminal       | Quotes for DSN | Escape `!`      |
| -------------- | -------------- | --------------- |
| **PowerShell** | Double `"..."` | Not necessary   |
| **CMD**        | Double `"..."` | Not necessary   |
| **Git Bash**   | Single `'...'` | Or use `\!`     |
| **WSL**        | Single `'...'` | Or use `\!`     |

---

## MCP Issues

### MCP appears as "failed" in Claude Code

**Diagnostic steps:**

1. **View error details:**

   ```bash
   claude mcp get <mcp-name>
   ```

2. **Test the command directly:**
   Copy the MCP command and run it manually in terminal to see the actual error.

3. **Verify that arguments are complete:**
   ```bash
   claude mcp list
   ```
   Review that all args appear correctly.

### Missing `--transport stdio`

If the MCP doesn't work, verify that you included `--transport stdio` in the arguments:

```json
{
  "args": [
    "-y",
    "@bytebase/dbhub",
    "--transport",
    "stdio", // ← Required
    "--dsn",
    "..."
  ]
}
```

---

## Database Permission Issues

### Error: `permission denied for table`

**Cause:** The user doesn't have permissions on the table.

**Solution:** Execute in Supabase SQL Editor:

```sql
-- For read-only user
GRANT SELECT ON ALL TABLES IN SCHEMA public TO your_user;

-- For user with DML permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_user;
```

### Error: `permission denied for sequence`

**Cause:** Missing permission for sequences (necessary for INSERT with auto-incremental IDs).

**Solution:**

```sql
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

---

## Quick Connection Verification

### Test Supabase connection manually

```bash
# With psql (if you have it installed)
psql "postgresql://qa_team.project:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# With curl (verify that the host responds)
curl -I "https://project.supabase.co/rest/v1/" -H "apikey: YOUR_ANON_KEY"
```

### Test the MCP directly

```bash
# DBHub
npx -y @bytebase/dbhub --transport stdio --dsn 'your_connection_string'

# OpenAPI MCP (verify that it loads the schema)
curl "https://project.supabase.co/rest/v1/?apikey=YOUR_ANON_KEY"
```

---

## Troubleshooting Checklist

- [ ] Are you using the **Shared Pooler** (port 6543)?
- [ ] Is the user format `user.project` for the pooler?
- [ ] Did you use **single quotes** in Bash?
- [ ] Did you include `--transport stdio` in DBHub?
- [ ] Does the user have the necessary permissions in the DB?
- [ ] Did you test the command directly in terminal?
- [ ] Did you restart Claude Desktop/Cursor after changing the config?
