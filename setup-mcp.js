#!/usr/bin/env node

/**
 * Nebula MCP Setup Script
 *
 * Automatically configures Nebula MCP server for detected AI tools:
 * - Claude Code
 * - Claude Desktop
 * - Cursor IDE
 * - Gemini CLI
 * - Codex CLI (OpenAI)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get absolute path to nebula-mcp.js
const MCP_SERVER_PATH = path.join(__dirname, 'bin', 'nebula-mcp.js');
const NEBULA_URL = process.env.NEBULA_URL || 'http://localhost:3000';

// Config file locations
const CONFIG_PATHS = {
  claudeCode: path.join(process.env.HOME, '.claude.json'),
  claudeDesktop: path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  cursor: path.join(process.env.HOME, '.cursor', 'mcp.json'),
  gemini: path.join(process.env.HOME, '.gemini', 'settings.json'),
  codex: path.join(process.env.HOME, '.codex', 'config.toml'),
};

// Nebula MCP server configuration
const NEBULA_MCP_CONFIG = {
  command: 'node',
  args: [MCP_SERVER_PATH],
  env: {
    NEBULA_URL: NEBULA_URL
  }
};

// Helper to check if command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper to read JSON file
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Helper to write JSON file
function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// Helper to backup file
function backupFile(filePath) {
  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.backup-${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  }
  return null;
}

// Detect installed AI tools
function detectTools() {
  const tools = {};

  // Claude Code
  if (commandExists('claude')) {
    tools.claudeCode = { name: 'Claude Code', configPath: CONFIG_PATHS.claudeCode };
  }

  // Claude Desktop
  if (fs.existsSync(path.dirname(CONFIG_PATHS.claudeDesktop))) {
    tools.claudeDesktop = { name: 'Claude Desktop', configPath: CONFIG_PATHS.claudeDesktop };
  }

  // Cursor
  if (commandExists('cursor') || fs.existsSync(path.join(process.env.HOME, '.cursor'))) {
    tools.cursor = { name: 'Cursor IDE', configPath: CONFIG_PATHS.cursor };
  }

  // Gemini CLI
  if (commandExists('gemini')) {
    tools.gemini = { name: 'Gemini CLI', configPath: CONFIG_PATHS.gemini };
  }

  // Codex CLI
  if (commandExists('codex')) {
    tools.codex = { name: 'Codex CLI', configPath: CONFIG_PATHS.codex };
  }

  return tools;
}

// Configure Claude Code
function configureClaudeCode(configPath) {
  let config = readJSON(configPath) || {};

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers['nebula-notebook'] = NEBULA_MCP_CONFIG;
  writeJSON(configPath, config);
}

// Configure Claude Desktop
function configureClaudeDesktop(configPath) {
  let config = readJSON(configPath) || {};

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers['nebula-notebook'] = NEBULA_MCP_CONFIG;
  writeJSON(configPath, config);
}

// Configure Cursor
function configureCursor(configPath) {
  let config = readJSON(configPath) || {};

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers['nebula-notebook'] = NEBULA_MCP_CONFIG;
  writeJSON(configPath, config);
}

// Configure Gemini CLI
function configureGemini(configPath) {
  let config = readJSON(configPath) || {};

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  config.mcpServers['nebula-notebook'] = NEBULA_MCP_CONFIG;
  writeJSON(configPath, config);
}

// Configure Codex CLI (TOML format)
function configureCodex(configPath) {
  const tomlContent = `
[mcp_servers.nebula-notebook]
command = "node"
args = ["${MCP_SERVER_PATH}"]

[mcp_servers.nebula-notebook.env]
NEBULA_URL = "${NEBULA_URL}"
`;

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let existingContent = '';
  if (fs.existsSync(configPath)) {
    existingContent = fs.readFileSync(configPath, 'utf8');
    // Check if nebula-notebook already exists
    if (existingContent.includes('[mcp_servers.nebula-notebook]')) {
      // Remove existing nebula-notebook config
      existingContent = existingContent.replace(/\[mcp_servers\.nebula-notebook\][\s\S]*?(?=\[|$)/g, '');
    }
  }

  fs.writeFileSync(configPath, existingContent + tomlContent);
}

// Prompt user for confirmation
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Main setup function
async function main() {
  console.log('\n🔍 Detecting installed AI tools...\n');

  const tools = detectTools();
  const toolNames = Object.keys(tools);

  if (toolNames.length === 0) {
    console.log('❌ No supported AI tools detected.');
    console.log('\nSupported tools: Claude Code, Claude Desktop, Cursor, Gemini CLI, Codex CLI');
    process.exit(1);
  }

  console.log('Found:');
  toolNames.forEach(key => {
    console.log(`  ✓ ${tools[key].name}`);
  });
  console.log('');

  // Show configuration details
  console.log('📦 Nebula MCP server will be configured at:');
  console.log(`    ${MCP_SERVER_PATH}\n`);
  console.log(`⚙️  Environment: NEBULA_URL=${NEBULA_URL}\n`);

  console.log('⚙️  Configure Nebula MCP for:');
  toolNames.forEach(key => {
    console.log(`    [✓] ${tools[key].name} (${tools[key].configPath})`);
  });
  console.log('');

  // Confirm with user
  const confirmed = await promptUser('Continue? (y/N): ');
  if (!confirmed) {
    console.log('❌ Setup cancelled.');
    process.exit(0);
  }

  console.log('\n💾 Backing up configs...');
  const backups = {};
  toolNames.forEach(key => {
    const backup = backupFile(tools[key].configPath);
    if (backup) {
      backups[key] = backup;
      console.log(`✓ Backed up ${path.basename(tools[key].configPath)} → ${path.basename(backup)}`);
    }
  });

  // Configure each tool
  console.log('');
  const configurators = {
    claudeCode: configureClaudeCode,
    claudeDesktop: configureClaudeDesktop,
    cursor: configureCursor,
    gemini: configureGemini,
    codex: configureCodex,
  };

  for (const key of toolNames) {
    try {
      console.log(`⚙️  Configuring ${tools[key].name}...`);
      configurators[key](tools[key].configPath);
      console.log(`✓ Added nebula-notebook to ${path.basename(tools[key].configPath)}`);
    } catch (error) {
      console.error(`✗ Failed to configure ${tools[key].name}: ${error.message}`);
      if (backups[key]) {
        console.log(`  → Restored from backup: ${backups[key]}`);
        fs.copyFileSync(backups[key], tools[key].configPath);
      }
    }
  }

  console.log('\n✅ Setup complete! Restart your AI tools to use Nebula MCP.');
  console.log('\nVerify with:');
  if (tools.claudeCode) console.log('  - claude mcp list');
  if (tools.cursor) console.log('  - Cursor → Settings → Model Context Protocol');
  if (tools.gemini) console.log('  - gemini mcp list');
  if (tools.codex) console.log('  - codex mcp list');
  console.log('');
}

main().catch(error => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
});
