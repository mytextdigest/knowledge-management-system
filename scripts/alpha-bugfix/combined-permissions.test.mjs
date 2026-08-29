import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('project Ask/Clear/Recluster use shared management policy', () => {
  for (const file of [
    'src/app/api/projects/ask/route.js',
    'src/app/api/projects/clear/route.js',
    'src/app/api/projects/[id]/recluster/route.js',
  ]) {
    const text = read(file);
    assert.match(text, /resolveProjectManagementAccess/);
    assert.doesNotMatch(text, /where:\s*\{\s*id:\s*projectId,\s*user:\s*\{\s*email:\s*session\.user\.email/);
  }
});

test('topic mutations use project management policy', () => {
  const text = read('src/app/api/projects/[id]/topics/[topicId]/route.js');
  assert.match(text, /resolveProjectManagementAccess/);
  assert.match(text, /canManage \? topic : null/);
});

test('document mutations use shared management policy and GET exposes real permissions', () => {
  for (const file of [
    'src/app/api/documents/[id]/regenerate/route.js',
    'src/app/api/documents/[id]/star/route.js',
    'src/app/api/documents/[id]/unassign/route.js',
    'src/app/api/documents/[id]/move-to-topic/route.js',
    'src/app/api/documents/[id]/ask/route.js',
    'src/app/api/documents/[id]/clear-conversation/route.js',
    'src/app/api/documents/[id]/start-conversation/route.js',
    'src/app/api/documents/[id]/route.js',
  ]) assert.match(read(file), /resolveDocumentManagementAccess/);
  const detail = read('src/app/api/documents/[id]/route.js');
  assert.match(detail, /canRegenerate: canManage/);
  assert.match(detail, /canDelete: canManage/);
});

test('repository list and detail visibility are aligned for promoted projects', () => {
  const text = read('src/app/api/org/[orgId]/repository/route.js');
  assert.match(text, /departmentId:\s*\{ in: userDeptIds \}/);
});

test('spreadsheet viewer and attachment download are available', () => {
  assert.match(read('src/app/(app)/document/page.jsx'), /\["xlsx", "xls", "csv"\]\.includes\(ext\)/);
  assert.match(read('src/lib/s3SignedUrl.js'), /ResponseContentDisposition/);
});

test('duplicate detection handles early candidates and runs a final pass', () => {
  assert.match(read('worker/classify.js'), /candidate\.contentHash \|\| computeContentHash\(candidate\.content\)/);
  assert.match(read('worker/index.js'), /Final duplicate scan/);
});

test('repository surfaces suggested project links for confirmation or dismissal', () => {
  assert.match(read('src/app/api/org/[orgId]/repository/route.js'), /projectLinks:/);
  const card = read('src/components/repository/RepositoryDocumentCard.jsx');
  assert.match(card, /Suggested for project:/);
  assert.match(card, /Add to project/);
});

test('BUG-04 project document list uses project management access and project UI surfaces mutation errors', () => {
  const list = read('src/app/api/documents/route.js');
  assert.match(list, /resolveProjectManagementAccess/);
  assert.match(list, /if \(!canManage\).*Forbidden/s);
  assert.match(list, /where:\s*\{ projectId \}/);
  assert.doesNotMatch(list, /userId:\s*dbUser\.id/);
  assert.match(list, /canStar:\s*true/);
  assert.match(list, /canDelete:\s*true/);

  const page = read('src/app/(app)/project/page.jsx');
  assert.match(page, /useToast/);
  assert.match(page, /toast\.error\(data\.error \|\| "Unable to delete this document\."\)/);
  assert.match(page, /toast\.error\(data\.error \|\| "Unable to update the document star\."\)/);
  assert.match(page, /toast\.error\(data\.error \|\| 'Unable to rename this document\.'\)/);
  assert.match(page, /<ToastProvider>/);
});

test('BUG-01 project message history uses management access and acting-user conversation', () => {
  const text = read('src/app/api/projects/messages/[projectId]/route.js');
  assert.match(text, /resolveProjectManagementAccess/);
  assert.match(text, /user:\s*actingUser/);
  assert.match(text, /if \(!canManage\).*Forbidden/s);
  assert.match(text, /where:\s*\{ projectId, userId: actingUser\.id \}/);
  assert.doesNotMatch(text, /user:\s*\{ email: session\.user\.email \}/);
  assert.doesNotMatch(text, /where:\s*\{ projectId \},\s*orderBy/);
});
