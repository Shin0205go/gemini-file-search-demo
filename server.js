// server.js - 汎用NotebookLM風Webアプリケーション
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const app = express();
const PORT = 3000;

// 環境変数からAPIキーを取得
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

// プロジェクト設定ファイルのパス
const PROJECTS_FILE = './projects.json';

// プロジェクト設定を読み込む
function loadProjects() {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('プロジェクト設定の読み込みエラー:', error);
    return { projects: [] };
  }
}

// プロジェクト設定を保存する
function saveProjects(projectsData) {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2));
    return true;
  } catch (error) {
    console.error('プロジェクト設定の保存エラー:', error);
    return false;
  }
}

// 除外するパターン
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.env',
  '.DS_Store',
  'package-lock.json',
  'yarn.lock',
  'logs',
  '.log',
  '__tests__',
  '.test.',
  '.spec.',
  'policies-store',
];

// ファイル拡張子からmimeTypeを取得
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.cpp': 'text/x-c++src',
    '.c': 'text/x-csrc',
    '.sh': 'text/x-shellscript',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.xml': 'application/xml',
  };
  return mimeTypes[ext] || 'text/plain';
}

// ディレクトリを再帰的に走査してファイルパスを収集
function getAllFiles(dirPath, excludePatterns = []) {
  const files = [];
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      if (excludePatterns.some(pattern => fullPath.includes(pattern))) {
        continue;
      }
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

// ミドルウェア
app.use(express.json());
app.use(express.static('public'));

// チャット履歴を保持（メモリ内、プロジェクトごと）
const chatHistories = {};

// プロジェクト一覧取得エンドポイント
app.get('/api/projects', (req, res) => {
  const projectsData = loadProjects();
  res.json(projectsData);
});

// プロジェクト追加エンドポイント
app.post('/api/projects', async (req, res) => {
  try {
    const { name, description, projectPath } = req.body;

    if (!name || !projectPath) {
      return res.status(400).json({ error: '名前とパスが必要です' });
    }

    // ディレクトリが存在するかチェック
    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({ error: 'ディレクトリが存在しません' });
    }

    console.log(`新しいプロジェクトを作成中: ${name}`);

    // ファイル検索ストアを作成
    const fileSearchStore = await ai.fileSearchStores.create({
      config: { displayName: name },
    });

    console.log(`ストア作成完了: ${fileSearchStore.name}`);

    // ファイルを収集
    const allFiles = getAllFiles(projectPath, EXCLUDE_PATTERNS);
    console.log(`収集したファイル数: ${allFiles.length}`);

    // ファイルをアップロード
    let successCount = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 100 * 1024 * 1024) continue;

        const mimeType = getMimeType(filePath);
        const relativePath = path.relative(projectPath, filePath);

        let operation = await ai.fileSearchStores.uploadToFileSearchStore({
          file: filePath,
          fileSearchStoreName: fileSearchStore.name,
          config: { displayName: relativePath, mimeType: mimeType },
        });

        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          operation = await ai.operations.get({ operation });
        }

        successCount++;
      } catch (error) {
        console.error(`ファイルアップロードエラー: ${filePath}`, error.message);
      }
    }

    // プロジェクトを保存
    const projectsData = loadProjects();
    const newProject = {
      id: `project-${Date.now()}`,
      name,
      description: description || '',
      storeId: fileSearchStore.name,
      path: projectPath,
      createdAt: new Date().toISOString(),
      fileCount: successCount,
    };

    projectsData.projects.push(newProject);
    saveProjects(projectsData);

    res.json({ success: true, project: newProject });
  } catch (error) {
    console.error('プロジェクト作成エラー:', error);
    res.status(500).json({ error: 'プロジェクト作成に失敗しました', details: error.message });
  }
});

// プロジェクト削除エンドポイント
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectsData = loadProjects();
    const project = projectsData.projects.find(p => p.id === id);

    if (!project) {
      return res.status(404).json({ error: 'プロジェクトが見つかりません' });
    }

    // ストアを削除
    await ai.fileSearchStores.delete({
      name: project.storeId,
      config: { force: true }
    });

    // プロジェクトリストから削除
    projectsData.projects = projectsData.projects.filter(p => p.id !== id);
    saveProjects(projectsData);

    res.json({ success: true });
  } catch (error) {
    console.error('プロジェクト削除エラー:', error);
    res.status(500).json({ error: 'プロジェクト削除に失敗しました', details: error.message });
  }
});

// チャットエンドポイント（プロジェクト指定）
app.post('/api/chat', async (req, res) => {
  try {
    const { question, projectId } = req.body;

    if (!question) {
      return res.status(400).json({ error: '質問が空です' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'プロジェクトが選択されていません' });
    }

    // プロジェクト情報を取得
    const projectsData = loadProjects();
    const project = projectsData.projects.find(p => p.id === projectId);

    if (!project) {
      return res.status(404).json({ error: 'プロジェクトが見つかりません' });
    }

    console.log(`[${project.name}] 質問受信: ${question}`);

    // Gemini APIに質問を送信
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: question,
      config: {
        tools: [{
          fileSearch: {
            fileSearchStoreNames: [project.storeId]
          }
        }],
      }
    });

    // 引用情報を取得
    const groundingMetadata = response.candidates[0]?.groundingMetadata || {};
    const groundingChunks = groundingMetadata.groundingChunks || [];

    const citationTexts = groundingChunks.map(chunk => {
      const retrievedContext = chunk.retrievedContext || {};
      const title = retrievedContext.title || retrievedContext.uri || 'Unknown';
      const text = retrievedContext.text || chunk.text || '';

      return {
        fileName: title,
        snippet: text.substring(0, 200)
      };
    }).filter(c => c.snippet);

    // チャット履歴に追加
    if (!chatHistories[projectId]) {
      chatHistories[projectId] = [];
    }

    const chatEntry = {
      timestamp: new Date().toISOString(),
      question,
      answer: response.text,
      citations: citationTexts
    };
    chatHistories[projectId].push(chatEntry);

    res.json({
      answer: response.text,
      citations: citationTexts,
      timestamp: chatEntry.timestamp
    });

  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      details: error.message
    });
  }
});

// チャット履歴取得エンドポイント（プロジェクト指定）
app.get('/api/history/:projectId', (req, res) => {
  const { projectId } = req.params;
  res.json({ history: chatHistories[projectId] || [] });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 汎用NotebookLM Server running at http://localhost:${PORT}`);
  const projectsData = loadProjects();
  console.log(`📚 登録済みプロジェクト数: ${projectsData.projects.length}`);
});
