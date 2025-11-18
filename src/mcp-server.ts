#!/usr/bin/env node

// mcp-server.ts - Gemini File Search MCP Server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';

// Types
interface Project {
  id: string;
  name: string;
  description: string;
  storeId: string;
  path: string;
  createdAt: string;
  fileCount: number;
}

interface ProjectsData {
  projects: Project[];
}

interface UploadStatus {
  status: 'uploading' | 'completed' | 'failed';
  totalFiles: number;
  successCount: number;
  errorCount: number;
  progress: number;
  error?: string;
}

interface MimeTypeMap {
  [key: string]: string;
}

// Validate API key
if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  console.error('Please set your Gemini API key in the .env file');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Use absolute path for projects file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECTS_FILE = path.join(__dirname, '..', 'projects.json');

const EXCLUDE_PATTERNS: string[] = [
  'node_modules', '.git', 'dist', 'build', '.env', '.DS_Store',
  'package-lock.json', 'yarn.lock', 'logs', '.log', '__tests__',
  '.test.', '.spec.', 'policies-store',
];

// Background upload status management
const uploadStatus = new Map<string, UploadStatus>();

// Project management functions
function loadProjects(): ProjectsData {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(data) as ProjectsData;
  } catch (error) {
    return { projects: [] };
  }
}

function saveProjects(projectsData: ProjectsData): void {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projectsData, null, 2));
}

// Path validation to prevent access to dangerous system directories
function isPathSafe(projectPath: string): boolean {
  try {
    const resolvedPath = path.resolve(projectPath);
    const realPath = fs.realpathSync(projectPath);

    // Dangerous system directories to block
    const dangerousPatterns: string[] = [
      '/etc', '/var', '/usr/bin', '/usr/sbin', '/bin', '/sbin',
      '/System', '/Library', '/Windows', '/Program Files', '/Windows/System32'
    ];

    // Check if path starts with any dangerous pattern
    const isDangerous = dangerousPatterns.some(pattern =>
      realPath.startsWith(pattern) || resolvedPath.startsWith(pattern)
    );

    return !isDangerous;
  } catch (error) {
    // If realpath fails (symlink issues, etc.), reject the path
    return false;
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: MimeTypeMap = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.js': 'text/plain',  // Use text/plain instead of application/javascript for Gemini API compatibility
    '.mjs': 'text/plain',
    '.ts': 'text/plain',  // Use text/plain instead of application/typescript for Gemini API compatibility
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

function getAllFiles(dirPath: string, excludePatterns: string[] = []): string[] {
  const files: string[] = [];
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
    const err = error as Error;
    console.error(`Directory read error: ${dirPath}`, err.message);
  }
  return files;
}

// Create MCP server
const server = new Server(
  {
    name: 'gemini-file-search-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    {
      name: 'gemini_list_projects',
      description: 'List all registered Gemini File Search projects',
      inputSchema: {
        type: 'object',
        properties: {
          response_format: {
            type: 'string',
            enum: ['json', 'markdown'],
            description: 'Response format (default: json)',
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'gemini_create_project',
      description: 'Create a new Gemini File Search project and upload files (runs in background)',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Project name',
          },
          description: {
            type: 'string',
            description: 'Project description (optional)',
          },
          projectPath: {
            type: 'string',
            description: 'Absolute path to the project directory',
          },
        },
        required: ['name', 'projectPath'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    {
      name: 'gemini_get_upload_status',
      description: 'Check the upload status of a Gemini File Search project',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID',
          },
        },
        required: ['projectId'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'gemini_delete_project',
      description: 'Delete a Gemini File Search project and its store',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID',
          },
        },
        required: ['projectId'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: 'gemini_search_project',
      description: 'Search project code and documentation using Gemini File Search to answer questions',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Project ID',
          },
          question: {
            type: 'string',
            description: 'Question to ask about the project',
          },
        },
        required: ['projectId', 'question'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
  ];

  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'gemini_list_projects': {
        const { response_format = 'json' } = args as { response_format?: 'json' | 'markdown' };
        const projectsData = loadProjects();

        if (response_format === 'markdown') {
          const markdown = `# Gemini File Search Projects\n\n` +
            (projectsData.projects.length === 0
              ? 'No projects found.'
              : projectsData.projects.map(p =>
                  `## ${p.name}\n- **ID**: ${p.id}\n- **Files**: ${p.fileCount}\n- **Created**: ${new Date(p.createdAt).toLocaleString()}\n- **Path**: ${p.path}\n- **Description**: ${p.description || 'N/A'}\n`
                ).join('\n'));
          return { content: [{ type: 'text', text: markdown }] };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projectsData.projects, null, 2),
            },
          ],
        };
      }

      case 'gemini_create_project': {
        const { name: projectName, description, projectPath } = args as {
          name: string;
          description?: string;
          projectPath: string;
        };

        // Input validation - project name
        if (!projectName || projectName.trim().length === 0) {
          return {
            content: [{ type: 'text', text: 'Error: Project name cannot be empty' }],
            isError: true,
          };
        }
        if (projectName.length > 100) {
          return {
            content: [{ type: 'text', text: 'Error: Project name too long (max 100 characters)' }],
            isError: true,
          };
        }

        // Check for duplicate project names
        const projectsData = loadProjects();
        const existingProject = projectsData.projects.find(p => p.name === projectName);
        if (existingProject) {
          return {
            content: [{ type: 'text', text: 'Error: A project with this name already exists' }],
            isError: true,
          };
        }

        // Path validation - check existence
        if (!fs.existsSync(projectPath)) {
          return {
            content: [{ type: 'text', text: 'Error: The specified directory does not exist' }],
            isError: true,
          };
        }

        // Path validation - security check
        if (!isPathSafe(projectPath)) {
          return {
            content: [{ type: 'text', text: 'Error: Access to this directory is not allowed for security reasons' }],
            isError: true,
          };
        }

        // Create file search store
        const fileSearchStore = await ai.fileSearchStores.create({
          config: { displayName: projectName },
        });

        if (!fileSearchStore.name) {
          return {
            content: [{ type: 'text', text: 'Error: Failed to create file search store' }],
            isError: true,
          };
        }

        // Collect files
        const allFiles = getAllFiles(projectPath, EXCLUDE_PATTERNS);
        const totalFiles = allFiles.length;

        // Create project (before upload starts)
        const projectId = `project-${randomUUID()}`;
        const newProject: Project = {
          id: projectId,
          name: projectName,
          description: description || '',
          storeId: fileSearchStore.name,
          path: projectPath,
          createdAt: new Date().toISOString(),
          fileCount: 0, // Will be updated after upload completes
        };

        projectsData.projects.push(newProject);
        saveProjects(projectsData);

        // Initialize upload status
        uploadStatus.set(projectId, {
          status: 'uploading',
          totalFiles,
          successCount: 0,
          errorCount: 0,
          progress: 0,
        });

        // Calculate estimated time (approximately 3 seconds per file)
        const estimatedMinutes = Math.ceil((totalFiles * 3) / 60);
        console.error(`📁 Collected ${totalFiles} files (estimated processing time: ${estimatedMinutes} minutes)`);

        // Store store name for use in async context
        const fileSearchStoreName = fileSearchStore.name;

        // Execute upload in background
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

            console.error(`⏳ Progress: ${progress}% (${i}/${totalFiles} files)`);

            const uploadPromises = batch.map(async (filePath): Promise<boolean> => {
              try {
                const stats = fs.statSync(filePath);
                if (stats.size > 100 * 1024 * 1024) {
                  console.error(`⚠️  Skipped (exceeds 100MB): ${path.basename(filePath)}`);
                  return false;
                }

                // Skip empty files
                if (stats.size === 0) {
                  console.error(`⚠️  Skipped (empty file): ${path.basename(filePath)}`);
                  return false;
                }

                const mimeType = getMimeType(filePath);
                const relativePath = path.relative(projectPath, filePath);

                // Sanitize file name (remove characters not accepted by Gemini API)
                const sanitizedDisplayName = relativePath.replace(/[<>:"|?*]/g, '_');

                let operation = await ai.fileSearchStores.uploadToFileSearchStore({
                  file: filePath,
                  fileSearchStoreName: fileSearchStoreName,
                  config: {
                    displayName: sanitizedDisplayName,
                    mimeType
                  },
                });

                // Wait for operation to complete
                let retries = 0;
                const maxRetries = 30; // Wait up to 60 seconds
                while (!operation.done && retries < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  try {
                    operation = await ai.operations.get({ operation });
                  } catch (opError) {
                    const err = opError as Error;
                    console.error(`⚠️  Operation fetch error: ${path.basename(filePath)} - ${err.message}`);
                    break;
                  }
                  retries++;
                }

                if (!operation.done) {
                  console.error(`⚠️  Timeout: ${relativePath}`);
                  return false;
                }

                // Check operation for errors
                if (operation.error) {
                  console.error(`❌ Upload failed: ${relativePath} - ${JSON.stringify(operation.error)}`);
                  return false;
                }

                console.error(`✅ Upload complete: ${relativePath}`);
                return true;
              } catch (error) {
                // Output detailed error information
                const err = error as any;
                const errorDetails = err.response?.data || err.message;
                console.error(`❌ Upload error: ${path.basename(filePath)} - ${JSON.stringify(errorDetails)}`);
                return false;
              }
            });

            const results = await Promise.all(uploadPromises);
            successCount += results.filter(r => r === true).length;
            errorCount += results.filter(r => r === false).length;
          }

          console.error(`🎉 Completed: ${successCount}/${totalFiles} files succeeded, ${errorCount} errors`);

          // Update project fileCount after upload completes
          const updatedData = loadProjects();
          const project = updatedData.projects.find(p => p.id === projectId);
          if (project) {
            project.fileCount = successCount;
            saveProjects(updatedData);
          }

          // Update upload status to completed
          uploadStatus.set(projectId, {
            status: 'completed',
            totalFiles,
            successCount,
            errorCount,
            progress: 100,
          });

          // Clean up upload status after 24 hours
          setTimeout(() => {
            uploadStatus.delete(projectId);
            console.error(`🧹 Cleaned up upload status for project: ${projectId}`);
          }, 24 * 60 * 60 * 1000);
        })().catch(error => {
          const err = error as Error;
          console.error(`Background upload error:`, err);
          uploadStatus.set(projectId, {
            status: 'failed',
            totalFiles,
            successCount: 0,
            errorCount: totalFiles,
            progress: 0,
            error: err.message,
          });
        });

        // Return response immediately
        return {
          content: [
            {
              type: 'text',
              text: `Project "${projectName}" created successfully.\n\nProject ID: ${projectId}\nTotal files: ${totalFiles}\nEstimated processing time: ${estimatedMinutes} minutes\n\nFile upload started in background.\nTo check progress: use gemini_get_upload_status tool.`,
            },
          ],
        };
      }

      case 'gemini_get_upload_status': {
        const { projectId } = args as { projectId: string };
        const status = uploadStatus.get(projectId);

        if (!status) {
          return {
            content: [{ type: 'text', text: 'Error: Upload status not found (may have already completed)' }],
            isError: true,
          };
        }

        let statusText = `Project ID: ${projectId}\n`;
        statusText += `Status: ${status.status}\n`;
        statusText += `Progress: ${status.progress}%\n`;
        statusText += `Success: ${status.successCount}/${status.totalFiles} files\n`;
        statusText += `Errors: ${status.errorCount} files`;

        if (status.error) {
          statusText += `\nError details: ${status.error}`;
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

      case 'gemini_delete_project': {
        const { projectId } = args as { projectId: string };
        const projectsData = loadProjects();
        const project = projectsData.projects.find(p => p.id === projectId);

        if (!project) {
          return {
            content: [{ type: 'text', text: 'Error: Project not found' }],
            isError: true,
          };
        }

        // Delete store
        await ai.fileSearchStores.delete({
          name: project.storeId,
          config: { force: true },
        });

        // Remove from project list
        projectsData.projects = projectsData.projects.filter(p => p.id !== projectId);
        saveProjects(projectsData);

        return {
          content: [
            {
              type: 'text',
              text: `Project "${project.name}" deleted successfully.`,
            },
          ],
        };
      }

      case 'gemini_search_project': {
        const { projectId, question } = args as { projectId: string; question: string };
        const projectsData = loadProjects();
        const project = projectsData.projects.find(p => p.id === projectId);

        if (!project) {
          return {
            content: [{ type: 'text', text: 'Error: Project not found' }],
            isError: true,
          };
        }

        // Send question to Gemini API
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

        // Get citation information
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata || {};
        const groundingChunks = groundingMetadata.groundingChunks || [];

        const citations = groundingChunks.map((chunk: any) => {
          const retrievedContext = chunk.retrievedContext || {};
          return {
            fileName: retrievedContext.title || retrievedContext.uri || 'Unknown',
            snippet: (retrievedContext.text || '').substring(0, 150),
          };
        }).filter(c => c.snippet);

        let result = `## Answer\n\n${response.text}`;

        if (citations.length > 0) {
          result += '\n\n## Citations\n\n';
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
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // Log detailed error server-side
    console.error('Tool execution error:', error);

    // Return sanitized error to client
    return {
      content: [
        {
          type: 'text',
          text: 'An error occurred while processing your request. Please check your inputs and try again.',
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gemini File Search MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
