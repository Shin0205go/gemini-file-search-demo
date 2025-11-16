# Gemini RAG MCP Server セットアップガイド

## 概要
このMCPサーバーは、Gemini File Search APIを使用したRAGシステムをClaude Desktopから利用可能にします。

## セットアップ手順

### 1. Claude Desktop設定ファイルを配置

以下のファイルをClaude Desktopの設定ディレクトリにコピーしてください：

**macOS:**
```bash
cp claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```powershell
Copy-Item claude_desktop_config.json "$env:APPDATA\Claude\claude_desktop_config.json"
```

**Linux:**
```bash
cp claude_desktop_config.json ~/.config/Claude/claude_desktop_config.json
```

### 2. API キーを設定

設定ファイル内の `GEMINI_API_KEY` を実際のAPIキーに置き換えてください：

```json
{
  "mcpServers": {
    "gemini-rag": {
      "command": "node",
      "args": [
        "/Users/shingo/Develop/gemini-file-search-demo/mcp-server.js"
      ],
      "env": {
        "GEMINI_API_KEY": "YOUR_ACTUAL_API_KEY_HERE"
      }
    }
  }
}
```

または、既存の `.env` ファイルを使用する場合は、`env` セクションを削除してください（mcp-server.js が自動的に `.env` を読み込みます）。

### 3. Claude Desktopを再起動

設定を反映させるため、Claude Desktopを完全に終了して再起動してください。

## 利用可能なツール

MCPサーバーは以下の4つのツールを提供します：

### 1. `list_projects`
登録されているプロジェクト一覧を取得します。

**使用例（Claude Desktopで）:**
```
プロジェクト一覧を見せて
```

### 2. `create_project`
新しいプロジェクトを作成してファイルをアップロードします。

**パラメータ:**
- `name`: プロジェクト名（必須）
- `description`: プロジェクトの説明（任意）
- `projectPath`: プロジェクトディレクトリの絶対パス（必須）

**使用例:**
```
/Users/shingo/Develop/my-project をRAGに追加して、プロジェクト名は「My Project」で
```

### 3. `delete_project`
プロジェクトとそのストアを削除します。

**パラメータ:**
- `projectId`: プロジェクトID（必須）

**使用例:**
```
project-1234567890 というプロジェクトを削除して
```

### 4. `search_project`
プロジェクトのコードとドキュメントを検索して質問に回答します。

**パラメータ:**
- `projectId`: プロジェクトID（必須）
- `question`: 質問内容（必須）

**使用例:**
```
aegis-policy-engineプロジェクトで、認証の仕組みについて教えて
```

## トラブルシューティング

### MCPサーバーが認識されない
1. Claude Desktopを完全に再起動したか確認
2. 設定ファイルのパスが正しいか確認
3. mcp-server.js のパスが絶対パスで正しく指定されているか確認

### ツールが動作しない
1. GEMINI_API_KEY が正しく設定されているか確認
2. Node.js がインストールされているか確認（`node --version`）
3. 依存関係がインストールされているか確認（`npm install`）

### ログの確認
MCPサーバーのログは標準エラー出力に出力されます：
```
Gemini RAG MCP Server running on stdio
```

## 注意事項

- ファイルアップロードは時間がかかる場合があります（大規模プロジェクトで5-10分程度）
- 100MB以上のファイルは自動的にスキップされます
- `node_modules`, `.git`, `dist`, `build` などは自動的に除外されます
