#!/usr/bin/env node

// mcp-server.js - Gemini RAG MCPサーバー
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const PROJECTS_FILE = './projects.json';

const EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', '.env', '.DS_Store',
  'package-lock.json', 'yarn.lock', 'logs', '.log', '__tests__',
  '.test.', '.spec.', 'policies-store',
];

// バックグラウンドアップロードの状態管理
const uploadStatus = new Map();

// プロジェクト管理関数
function loadProjects() {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { projects: [] };
  }
}

function saveProjects(projectsData) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.js': 'text/plain',  // application/javascriptではなくtext/plainを使用
    '.mjs': 'text/plain',
    '.ts': 'text/plain',  // application/typescriptではなくtext/plainを使用
    '.tsx': 'text/plain',
    '.json': 'application/json',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.py': 'text/plain',
    '.java': 'text/plain',
    '.cpp': 'text/plain',
    '.c': 'text/plain',
    '.h': 'text/plain',
    '.sh': 'text/plain',
    '.bash': 'text/plain',
    '.yaml': 'text/plain',
    '.yml': 'text/plain',
    '.xml': 'application/xml',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  };
  return mimeTypes[ext] || 'text/plain';
}

function getAllFiles(dirPath, excludePatterns = []) {
  const files = [];
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if (excludePatterns.some(pattern => fullPath.includes(pattern))) continue;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getAllFiles(fullPath, excludePatterns));
      } else {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`ディレクトリ読み込みエラー: ${dirPath}`, error.message);
  }
  return files;
}

// MCPサーバーを作成
const server = new Server(
  {
    name: 'gemini-rag-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール一覧を返す
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_projects',
        description: '登録されているプロジェクト一覧を取得します',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_project',
        description: '新しいプロジェクトを作成してファイルをアップロードします（バックグラウンドで実行）',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'プロジェクト名',
            },
            description: {
              type: 'string',
              description: 'プロジェクトの説明（任意）',
            },
            projectPath: {
              type: 'string',
              description: 'プロジェクトディレクトリの絶対パス',
            },
          },
          required: ['name', 'projectPath'],
        },
      },
      {
        name: 'get_upload_status',
        description: 'プロジェクトのファイルアップロード状況を確認します',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'プロジェクトID',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'delete_project',
        description: 'プロジェクトとそのストアを削除します',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'プロジェクトID',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'search_project',
        description: 'プロジェクトのコードとドキュメントを検索して質問に回答します',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'プロジェクトID',
            },
            question: {
              type: 'string',
              description: '質問内容',
            },
          },
          required: ['projectId', 'question'],
        },
      },
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const projectsData = loadProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projectsData.projects, null, 2),
            },
          ],
        };
      }

      case 'create_project': {
        const { name: projectName, description, projectPath } = args;

        if (!fs.existsSync(projectPath)) {
          return {
            content: [{ type: 'text', text: `エラー: ディレクトリが存在しません: ${projectPath}` }],
            isError: true,
          };
        }

        // ストア作成
        const fileSearchStore = await ai.fileSearchStores.create({
          config: { displayName: projectName },
        });

        // ファイル収集
        const allFiles = getAllFiles(projectPath, EXCLUDE_PATTERNS);
        const totalFiles = allFiles.length;

        // プロジェクトを作成（アップロード前に）
        const projectId = `project-${Date.now()}`;
        const projectsData = loadProjects();
        const newProject = {
          id: projectId,
          name: projectName,
          description: description || '',
          storeId: fileSearchStore.name,
          path: projectPath,
          createdAt: new Date().toISOString(),
          fileCount: 0, // アップロード完了後に更新
        };

        projectsData.projects.push(newProject);
        saveProjects(projectsData);

        // アップロード状態を初期化
        uploadStatus.set(projectId, {
          status: 'uploading',
          totalFiles,
          successCount: 0,
          errorCount: 0,
          progress: 0,
        });

        // 推定時間を計算（1ファイルあたり約3秒）
        const estimatedMinutes = Math.ceil((totalFiles * 3) / 60);
        console.error(`📁 ${totalFiles} ファイルを収集しました（推定処理時間: ${estimatedMinutes}分）`);

        // バックグラウンドでアップロードを実行
        (async () => {
          const BATCH_SIZE = 5;
          let successCount = 0;
          let errorCount = 0;

          for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
            const batch = allFiles.slice(i, i + BATCH_SIZE);
            const progress = Math.round((i / totalFiles) * 100);

            uploadStatus.set(projectId, {
              status: 'uploading',
              totalFiles,
              successCount,
              errorCount,
              progress,
            });

            console.error(`⏳ 進捗: ${progress}% (${i}/${totalFiles} ファイル)`);

            const uploadPromises = batch.map(async (filePath) => {
              try {
                const stats = fs.statSync(filePath);
                if (stats.size > 100 * 1024 * 1024) {
                  console.error(`⚠️  スキップ（100MB超過）: ${path.basename(filePath)}`);
                  return false;
                }

                // 空ファイルをスキップ
                if (stats.size === 0) {
                  console.error(`⚠️  スキップ（空ファイル）: ${path.basename(filePath)}`);
                  return false;
                }

                const mimeType = getMimeType(filePath);
                const relativePath = path.relative(projectPath, filePath);

                // ファイル名のサニタイズ（Gemini APIが受け付けない文字を除去）
                const sanitizedDisplayName = relativePath.replace(/[<>:"|?*]/g, '_');

                let operation = await ai.fileSearchStores.uploadToFileSearchStore({
                  file: filePath,
                  fileSearchStoreName: fileSearchStore.name,
                  config: {
                    displayName: sanitizedDisplayName,
                    mimeType
                  },
                });

                // operationの完了を待つ
                let retries = 0;
                const maxRetries = 30; // 最大60秒待つ
                while (!operation.done && retries < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  try {
                    operation = await ai.operations.get({ operation });
                  } catch (opError) {
                    console.error(`⚠️  オペレーション取得エラー: ${path.basename(filePath)} - ${opError.message}`);
                    break;
                  }
                  retries++;
                }

                if (!operation.done) {
                  console.error(`⚠️  タイムアウト: ${relativePath}`);
                  return false;
                }

                // operationのエラーをチェック
                if (operation.error) {
                  console.error(`❌ アップロード失敗: ${relativePath} - ${JSON.stringify(operation.error)}`);
                  return false;
                }

                console.error(`✅ アップロード完了: ${relativePath}`);
                return true;
              } catch (error) {
                // より詳細なエラー情報を出力
                const errorDetails = error.response?.data || error.message;
                console.error(`❌ アップロードエラー: ${path.basename(filePath)} - ${JSON.stringify(errorDetails)}`);
                return false;
              }
            });

            const results = await Promise.all(uploadPromises);
            successCount += results.filter(r => r === true).length;
            errorCount += results.filter(r => r === false).length;
          }

          console.error(`🎉 完了: ${successCount}/${totalFiles} ファイル成功, ${errorCount} エラー`);

          // アップロード完了後、プロジェクトのfileCountを更新
          const updatedData = loadProjects();
          const project = updatedData.projects.find(p => p.id === projectId);
          if (project) {
            project.fileCount = successCount;
            saveProjects(updatedData);
          }

          // アップロード状態を完了に更新
          uploadStatus.set(projectId, {
            status: 'completed',
            totalFiles,
            successCount,
            errorCount,
            progress: 100,
          });
        })().catch(error => {
          console.error(`バックグラウンドアップロードエラー:`, error);
          uploadStatus.set(projectId, {
            status: 'failed',
            totalFiles,
            successCount: 0,
            errorCount: totalFiles,
            progress: 0,
            error: error.message,
          });
        });

        // すぐにレスポンスを返す
        return {
          content: [
            {
              type: 'text',
              text: `プロジェクト「${projectName}」を作成しました。\n\nプロジェクトID: ${projectId}\n総ファイル数: ${totalFiles}\n推定処理時間: ${estimatedMinutes}分\n\nファイルアップロードをバックグラウンドで開始しました。\n進捗確認: get_upload_status ツールを使用してください。`,
            },
          ],
        };
      }

      case 'get_upload_status': {
        const { projectId } = args;
        const status = uploadStatus.get(projectId);

        if (!status) {
          return {
            content: [{ type: 'text', text: 'エラー: アップロード状態が見つかりません（既に完了している可能性があります）' }],
            isError: true,
          };
        }

        let statusText = `プロジェクトID: ${projectId}\n`;
        statusText += `状態: ${status.status}\n`;
        statusText += `進捗: ${status.progress}%\n`;
        statusText += `成功: ${status.successCount}/${status.totalFiles} ファイル\n`;
        statusText += `エラー: ${status.errorCount} ファイル`;

        if (status.error) {
          statusText += `\nエラー詳細: ${status.error}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: statusText,
            },
          ],
        };
      }

      case 'delete_project': {
        const { projectId } = args;
        const projectsData = loadProjects();
        const project = projectsData.projects.find(p => p.id === projectId);

        if (!project) {
          return {
            content: [{ type: 'text', text: 'エラー: プロジェクトが見つかりません' }],
            isError: true,
          };
        }

        // ストアを削除
        await ai.fileSearchStores.delete({
          name: project.storeId,
          config: { force: true },
        });

        // プロジェクトリストから削除
        projectsData.projects = projectsData.projects.filter(p => p.id !== projectId);
        saveProjects(projectsData);

        return {
          content: [
            {
              type: 'text',
              text: `プロジェクト「${project.name}」を削除しました。`,
            },
          ],
        };
      }

      case 'search_project': {
        const { projectId, question } = args;
        const projectsData = loadProjects();
        const project = projectsData.projects.find(p => p.id === projectId);

        if (!project) {
          return {
            content: [{ type: 'text', text: 'エラー: プロジェクトが見つかりません' }],
            isError: true,
          };
        }

        // Gemini APIに質問を送信
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: question,
          config: {
            tools: [{
              fileSearch: {
                fileSearchStoreNames: [project.storeId],
              },
            }],
          },
        });

        // 引用情報を取得
        const groundingMetadata = response.candidates[0]?.groundingMetadata || {};
        const groundingChunks = groundingMetadata.groundingChunks || [];

        const citations = groundingChunks.map(chunk => {
          const retrievedContext = chunk.retrievedContext || {};
          return {
            fileName: retrievedContext.title || retrievedContext.uri || 'Unknown',
            snippet: (retrievedContext.text || chunk.text || '').substring(0, 150),
          };
        }).filter(c => c.snippet);

        let result = `## 回答\n\n${response.text}`;

        if (citations.length > 0) {
          result += '\n\n## 引用元\n\n';
          citations.forEach((c, i) => {
            result += `${i + 1}. **${c.fileName}**\n   ${c.snippet}...\n\n`;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `未知のツール: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `エラー: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// サーバー起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gemini RAG MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
