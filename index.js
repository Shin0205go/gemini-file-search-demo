// index.js
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config'; // .envファイルを読み込むために必要

// 環境変数からAPIキーを取得
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

// プロジェクトのパス
const PROJECT_PATH = '/Users/shingo/Develop/aegis-policy-engine';

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
  'logs',          // ログファイルを除外
  '.log',          // .logファイルを除外
  '__tests__',     // テストファイルを除外
  '.test.',        // .test.ts などを除外
  '.spec.',        // .spec.ts などを除外
  'policies-store', // ポリシー履歴を除外
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

  // 拡張子がない場合やマッピングがない場合はtext/plainとして扱う
  return mimeTypes[ext] || 'text/plain';
}

// ディレクトリを再帰的に走査してファイルパスを収集
function getAllFiles(dirPath, excludePatterns = []) {
  const files = [];

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);

      // 除外パターンチェック
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

async function runFileSearchDemo() {
  console.log('デモを開始します。');

  // --- 1. ファイル検索ストアの作成 ---
  console.log('1. ファイル検索ストアを作成中...');
  let fileSearchStore;
  try {
    fileSearchStore = await ai.fileSearchStores.create({
      config: { displayName: 'Node.js Demo Knowledge Base' },
    });
    console.log(`   ストアID: ${fileSearchStore.name}`);
  } catch (error) {
    console.error('ストア作成エラー:', error);
    return;
  }

  // --- 2. ファイルのアップロードとインポート ---
  console.log('2. プロジェクト内のファイルを収集中...');
  const allFiles = getAllFiles(PROJECT_PATH, EXCLUDE_PATTERNS);
  console.log(`   収集したファイル数: ${allFiles.length}`);

  console.log('3. ファイルをアップロードしてストアにインポート中...');
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath = allFiles[i];
    const relativePath = path.relative(PROJECT_PATH, filePath);

    try {
      // ファイルサイズチェック（100MB以上はスキップ）
      const stats = fs.statSync(filePath);
      if (stats.size > 100 * 1024 * 1024) {
        console.log(`   [${i + 1}/${allFiles.length}] スキップ（大きすぎる）: ${relativePath}`);
        errorCount++;
        continue;
      }

      console.log(`   [${i + 1}/${allFiles.length}] アップロード中: ${relativePath}`);

      // ファイルをアップロードしてストアにインポート
      const mimeType = getMimeType(filePath);
      let operation = await ai.fileSearchStores.uploadToFileSearchStore({
        file: filePath,
        fileSearchStoreName: fileSearchStore.name,
        config: {
          displayName: relativePath,
          mimeType: mimeType
        },
      });

      // インポート操作が完了するのを待機（ポーリング）
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        operation = await ai.operations.get({ operation });
      }

      successCount++;
    } catch (error) {
      const errorMsg = error.error?.message || error.message || JSON.stringify(error);
      console.error(`   エラー: ${relativePath} - ${errorMsg}`);
      errorCount++;
    }
  }

  console.log(`\n   アップロード完了: 成功 ${successCount}件、エラー ${errorCount}件`);
  console.log('   ナレッジベースが利用可能になりました。');

  // --- 4. クエリの実行（検索と回答生成） ---
  const question = 'このプロジェクトは何をするものですか？主要な機能を説明してください。';
  console.log(`\n4. 質問を実行します: "${question}"`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: question,
      config: {
        // ここで作成したストアをツールとして指定します
        tools: [{
            fileSearch: {
                fileSearchStoreNames: [fileSearchStore.name]
            }
        }],
      }
    });

    console.log('\n--- Geminiの回答 ---');
    console.log(response.text);

    // 引用情報を確認
    const citations = response.candidates[0].groundingMetadata?.groundingChunks || [];
    if (citations.length > 0) {
      console.log('\n--- 根拠となった引用情報 ---');
      citations.forEach(chunk => {
        console.log(`  ファイル名: ${chunk.web?.title || 'Unknown'}`);
        console.log(`  テキストスニペット: "${chunk.text}"`);
      });
    }

  } catch (error) {
    console.error('モデル実行エラー:', error);
  }

  // --- 5. ストア情報を表示（保持） ---
  console.log('\n=== ストア情報 ===');
  console.log(`ストアID: ${fileSearchStore.name}`);
  console.log('このストアは削除されません。後で再利用できます。');
  console.log('手動で削除する場合は以下のコマンドを使用してください:');
  console.log(`  await ai.fileSearchStores.delete({ name: '${fileSearchStore.name}', config: { force: true } });`);
}

runFileSearchDemo();