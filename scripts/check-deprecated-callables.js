/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'services', 'components', 'hooks', 'store'];
const FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const DEPRECATED_CALLABLES = [
  { name: 'createOrder', replacement: 'createOrderMultiItem' },
  { name: 'startSurvey', replacement: 'startTask / submitSurveyAnswer' },
  { name: 'completeSurvey', replacement: 'submitSurveyAnswer' },
  { name: 'legacyCreateOrder', replacement: 'createOrderMultiItem' },
  { name: 'legacySurvey', replacement: 'submitSurveyAnswer' },
  { name: 'getAdminUsers', replacement: 'getAdminUsersPage' },
  { name: 'getAdminTasks', replacement: 'getAdminTasksPage' },
  { name: 'getProductsForModeration', replacement: 'getProductsForModerationPage' },
  { name: 'getVendors', replacement: 'getVendorsPage' },
  { name: 'getPartners', replacement: 'getPartnersPage' },
  { name: 'getOrganizations', replacement: 'getOrganizationsPage' },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    const ext = path.extname(entry.name);
    if (FILE_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findDeprecatedUsages(content) {
  const findings = [];
  for (const item of DEPRECATED_CALLABLES) {
    const rx = new RegExp(`httpsCallable\\s*\\([^)]*['"]${item.name}['"]`, 'g');
    if (rx.test(content)) {
      findings.push(item);
    }
  }
  return findings;
}

function run() {
  const targetFiles = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const issues = [];

  for (const filePath of targetFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = findDeprecatedUsages(content);
    if (!findings.length) continue;

    for (const finding of findings) {
      issues.push({
        filePath: path.relative(ROOT, filePath),
        name: finding.name,
        replacement: finding.replacement,
      });
    }
  }

  if (!issues.length) {
    console.log('[check:deprecated-callables] No deprecated callable usage found.');
    process.exit(0);
  }

  console.error('[check:deprecated-callables] Deprecated callable usage detected:');
  for (const issue of issues) {
    console.error(`- ${issue.filePath}: "${issue.name}" -> use "${issue.replacement}"`);
  }
  process.exit(1);
}

run();
