# Gemini File Search MCP Server Setup Guide

## Overview
This MCP server provides access to Gemini File Search API's RAG capabilities from Claude Desktop, enabling code search and Q&A across your projects.

## Features

✅ **Secure by Design**
- API key validation
- Path validation (blocks access to system directories)
- Input validation and sanitization
- Error message sanitization

✅ **Background Processing**
- Non-blocking file uploads
- Real-time progress tracking
- Automatic memory cleanup

✅ **MCP Best Practices Compliant**
- Proper tool naming with service prefix (`gemini_*`)
- Tool annotations (readOnly, destructive, idempotent hints)
- Multiple response formats (JSON/Markdown)
- Comprehensive error handling

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
```

Or configure it in Claude Desktop's config file (see below).

### 3. Configure Claude Desktop

Add the MCP server configuration to Claude Desktop's config file:

**macOS:**
`~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:**
`%APPDATA%\Claude\claude_desktop_config.json`

**Linux:**
`~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "gemini-file-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-file-search-demo/mcp-server.js"
      ],
      "env": {
        "GEMINI_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/` with your actual project path.

### 4. Restart Claude Desktop

Completely quit and restart Claude Desktop to load the MCP server.

## Available Tools

The MCP server provides 5 tools with the `gemini_` prefix:

### 1. `gemini_list_projects`

List all registered Gemini File Search projects.

**Parameters:**
- `response_format` (optional): `"json"` or `"markdown"` (default: `"json"`)

**Usage example:**
```
Show me all my Gemini projects
```

**Response formats:**
- **JSON**: Machine-readable structured data
- **Markdown**: Human-readable formatted list with project details

---

### 2. `gemini_create_project`

Create a new project and upload files to Gemini File Search (runs in background).

**Parameters:**
- `name` (required): Project name (max 100 characters)
- `description` (optional): Project description
- `projectPath` (required): Absolute path to the project directory

**Validation:**
- Project name must be unique
- Path must not point to system directories
- Directory must exist

**Usage example:**
```
Add /Users/shingo/Develop/my-app to Gemini RAG with name "My Application"
```

**Note:** File upload runs in background. Use `gemini_get_upload_status` to check progress.

---

### 3. `gemini_get_upload_status`

Check the upload status of a project's files.

**Parameters:**
- `projectId` (required): Project ID

**Usage example:**
```
Check upload status for project-abc123
```

**Response includes:**
- Current status (uploading/completed/failed)
- Progress percentage
- Success count / total files
- Error count

---

### 4. `gemini_delete_project`

Delete a project and its associated file search store.

**Parameters:**
- `projectId` (required): Project ID

**Usage example:**
```
Delete project project-abc123
```

**Warning:** This action is destructive and cannot be undone.

---

### 5. `gemini_search_project`

Search project code and documentation using Gemini File Search.

**Parameters:**
- `projectId` (required): Project ID
- `question` (required): Question to ask about the project

**Usage example:**
```
In the aegis-policy project, explain how authentication works
```

**Response includes:**
- AI-generated answer
- Citations with file names and relevant snippets

## File Exclusions

The following patterns are automatically excluded from upload:
- `node_modules`, `.git`, `dist`, `build`
- `.env`, `.DS_Store`
- `package-lock.json`, `yarn.lock`
- `logs`, `.log`
- `__tests__`, `.test.`, `.spec.`

## Limitations

- **File size**: Maximum 100MB per file
- **Empty files**: Automatically skipped
- **Processing time**: Approximately 3 seconds per file
- **Upload status**: Cleaned up automatically after 24 hours

## Security Features

### Path Validation
Access to the following system directories is blocked:
- `/etc`, `/var`, `/usr/bin`, `/usr/sbin`, `/bin`, `/sbin`
- `/System`, `/Library` (macOS)
- `/Windows`, `/Program Files` (Windows)

### Input Validation
- Project names: Max 100 characters, must be unique
- Paths: Validated against dangerous directories
- File names: Sanitized for API compatibility

### Error Handling
- Detailed errors logged server-side
- Sanitized messages returned to client
- No internal path or system information exposed

## Troubleshooting

### MCP Server Not Recognized

1. **Verify Claude Desktop restart**: Completely quit and restart
2. **Check config file path**: Ensure it's in the correct location
3. **Verify absolute path**: mcp-server.js path must be absolute
4. **Check file permissions**: Ensure mcp-server.js is readable

### API Key Issues

```bash
# Test if API key is set
node -e "require('dotenv').config(); console.log(process.env.GEMINI_API_KEY ? 'OK' : 'NOT SET')"
```

If you see "Error: GEMINI_API_KEY environment variable is not set" when starting the server, check your `.env` file or Claude Desktop config.

### Tools Not Working

1. **Check Node.js version**:
   ```bash
   node --version  # Should be v18 or higher
   ```

2. **Reinstall dependencies**:
   ```bash
   npm install
   ```

3. **Check server logs**: Look for error messages in Claude Desktop

### Upload Issues

**Symptoms**: Files not uploading or timing out

**Solutions**:
- Check network connection
- Verify API key has proper permissions
- Check Gemini API quotas/limits
- Use `gemini_get_upload_status` to monitor progress

## Development

### Running Tests with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node mcp-server.js
```

Then open the provided URL in your browser to test tools interactively.

### Viewing Logs

The server logs to stderr, which you can view in Claude Desktop's logs or when running with MCP Inspector.

## Tool Annotations

All tools include proper MCP annotations:

| Tool | readOnly | destructive | idempotent | openWorld |
|------|----------|-------------|------------|-----------|
| gemini_list_projects | ✓ | ✗ | ✓ | ✗ |
| gemini_create_project | ✗ | ✗ | ✗ | ✓ |
| gemini_get_upload_status | ✓ | ✗ | ✓ | ✗ |
| gemini_delete_project | ✗ | ✓ | ✓ | ✓ |
| gemini_search_project | ✓ | ✗ | ✗ | ✓ |

## Version History

### v1.0.0 (Current)
- ✅ MCP Best Practices compliant
- ✅ Security hardening (path validation, input validation)
- ✅ Background upload with progress tracking
- ✅ Tool annotations
- ✅ Response format support (JSON/Markdown)
- ✅ Automatic memory cleanup
- ✅ UUID-based project IDs

## Support

For issues or questions:
- GitHub: https://github.com/Shin0205go/gemini-file-search-demo
- Check Claude Desktop logs
- Use MCP Inspector for debugging

## License

MIT License - See LICENSE file for details
