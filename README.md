# Gemini File Search MCP Server

A production-ready MCP (Model Context Protocol) server that brings Google's Gemini File Search API RAG capabilities to Claude Desktop.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.22-green.svg)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Features

- **🔒 Secure by Design**: Path validation, input sanitization, API key validation
- **⚡ Background Processing**: Non-blocking file uploads with real-time progress tracking
- **📊 Type Safety**: Written in TypeScript with comprehensive type definitions
- **✅ MCP Best Practices**: 100% compliant with Anthropic MCP guidelines
- **🎯 Production Ready**: Error handling, memory cleanup, and proper logging

## 🚀 Quick Start

### Prerequisites

- Node.js v18 or higher
- Gemini API key ([Get one here](https://aistudio.google.com/apikey))
- Claude Desktop

### Installation

```bash
# Clone the repository
git clone https://github.com/Shin0205go/gemini-file-search-demo.git
cd gemini-file-search-demo

# Install dependencies
npm install

# Create .env file with your API key
echo "GEMINI_API_KEY=your_api_key_here" > .env

# Build TypeScript
npm run build
```

### Configure Claude Desktop

Add to `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gemini-file-search": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-file-search-demo/dist/mcp-server.js"
      ],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop to load the server.

## 🛠️ Available Tools

All tools use the `gemini_` prefix to avoid conflicts with other MCP servers:

### `gemini_list_projects`
List all registered projects with optional format selection (JSON/Markdown).

### `gemini_create_project`
Create a project and upload files in background. Returns immediately with project ID.

### `gemini_get_upload_status`
Check real-time upload progress with percentage, success/error counts.

### `gemini_delete_project`
Delete a project and its Gemini File Search store (destructive operation).

### `gemini_search_project`
Search project code/docs using Gemini RAG with AI-generated answers and citations.

📖 See [README_MCP.md](./README_MCP.md) for detailed documentation.

## 💻 Development

### TypeScript Development

```bash
# Watch mode for development
npm run build:watch

# In another terminal
node dist/mcp-server.js
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

### Project Structure

```
gemini-file-search-demo/
├── src/
│   └── mcp-server.ts      # TypeScript source
├── dist/                   # Compiled JavaScript (generated)
│   ├── mcp-server.js
│   ├── mcp-server.d.ts    # Type definitions
│   └── mcp-server.js.map  # Source maps
├── tsconfig.json          # TypeScript configuration
├── package.json
├── .env                   # API key (gitignored)
├── projects.json          # Project database
└── README_MCP.md          # Detailed setup guide
```

## 🏗️ Architecture

### TypeScript Interfaces

```typescript
interface Project {
  id: string;              // UUID
  name: string;            // Unique project name
  description: string;
  storeId: string;         // Gemini File Search store ID
  path: string;            // Project directory path
  createdAt: string;       // ISO 8601 timestamp
  fileCount: number;       // Successfully uploaded files
}

interface UploadStatus {
  status: 'uploading' | 'completed' | 'failed';
  totalFiles: number;
  successCount: number;
  errorCount: number;
  progress: number;        // 0-100
  error?: string;
}
```

### Security Features

✅ **API Key Validation**: Checked at startup
✅ **Path Validation**: Blocks system directories (`/etc`, `/System`, `/Windows`)
✅ **Input Validation**: Max length, uniqueness, special character checks
✅ **Error Sanitization**: Internal details logged server-side only
✅ **File Sanitization**: Characters incompatible with Gemini API removed

## 📊 Tool Annotations

All tools include proper MCP annotations for client optimization:

| Tool | readOnly | destructive | idempotent | openWorld |
|------|----------|-------------|------------|-----------|
| gemini_list_projects | ✓ | ✗ | ✓ | ✗ |
| gemini_create_project | ✗ | ✗ | ✗ | ✓ |
| gemini_get_upload_status | ✓ | ✗ | ✓ | ✗ |
| gemini_delete_project | ✗ | ✓ | ✓ | ✓ |
| gemini_search_project | ✓ | ✗ | ✗ | ✓ |

**Legend:**
- **readOnly**: Does not modify environment
- **destructive**: May perform destructive updates
- **idempotent**: Same arguments produce same effect
- **openWorld**: Interacts with external services

## 🔧 NPM Scripts

```bash
npm run build          # Compile TypeScript
npm run build:watch    # Watch mode compilation
npm run mcp            # Build and run MCP server
npm run clean          # Remove dist directory
npm start              # Run Express web server
npm run upload         # Run standalone upload script
```

## 🐛 Troubleshooting

### TypeScript Build Errors

```bash
# Clean and rebuild
npm run clean
npm run build
```

### MCP Server Not Loading

1. Check Claude Desktop logs
2. Verify absolute paths in config
3. Ensure `dist/mcp-server.js` exists
4. Check API key is set

### Upload Issues

- **Timeout**: Normal for large projects (3 sec/file)
- **INVALID_ARGUMENT**: File mime type issue (check console logs)
- **Progress stuck**: Use `gemini_get_upload_status` to check status

## 📚 Additional Documentation

- [MCP Setup Guide](./README_MCP.md) - Detailed installation and usage
- [MCP Best Practices](https://modelcontextprotocol.io/docs/best-practices)
- [Gemini File Search API](https://ai.google.dev/gemini-api/docs/file-search)

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for MCP protocol and Claude
- [Google](https://ai.google.dev/) for Gemini API
- MCP community for feedback and examples

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Shin0205go/gemini-file-search-demo/issues)
- **Discussions**: Use GitHub Discussions for questions
- **MCP Inspector**: Debug tool for testing MCP servers

---

**Built with ❤️ using TypeScript and MCP Best Practices**
