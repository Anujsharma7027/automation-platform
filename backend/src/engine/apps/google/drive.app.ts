import { AppDefinition, StepContext } from '../../core/integration.types';
import { authorizedRequest } from '../../core/http';
import { driveQueryLiteral, GOOGLE_PROVIDER, GOOGLE_SCOPES, idempotencyToken } from './google.shared';
import { randomBytes } from 'node:crypto';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,mimeType,createdTime,modifiedTime,webViewLink,size,parents,owners(emailAddress)';

interface DriveFile { id: string; name: string; mimeType: string; createdTime?: string; modifiedTime?: string; webViewLink?: string; size?: string; parents?: string[]; owners?: { emailAddress?: string }[] }

function toFileData(file: DriveFile): Record<string, unknown> {
  return {
    id: file.id,
    name: file.name,
    mime_type: file.mimeType,
    created_time: file.createdTime ?? '',
    modified_time: file.modifiedTime ?? '',
    web_view_link: file.webViewLink ?? '',
    size: file.size ? Number(file.size) : 0,
    parent_id: file.parents?.[0] ?? '',
    owner_email: file.owners?.[0]?.emailAddress ?? '',
  };
}

/** Finds a file created by an earlier attempt of the same step (retry safety). */
async function findExisting(context: StepContext): Promise<DriveFile | undefined> {
  const token = idempotencyToken(context.idempotencyKey);
  const result = await authorizedRequest<{ files?: DriveFile[] }>(context.auth, API, {
    query: { q: `appProperties has { key='taskvynStep' and value=${driveQueryLiteral(token)} } and trashed = false`, fields: `files(${FILE_FIELDS})`, pageSize: 1 },
  });
  return result.files?.[0];
}

const folderField = { key: 'folderId', label: 'Folder', type: 'select' as const, dynamicOptions: 'folders', helpText: 'Leave empty for My Drive.' };

export const driveApp: AppDefinition = {
  key: 'google_drive',
  name: 'Google Drive',
  description: 'Watch Drive for new files and create files or folders.',
  icon: 'logos:google-drive',
  category: 'Storage',
  auth: { type: 'oauth2', provider: GOOGLE_PROVIDER, scopes: [GOOGLE_SCOPES.drive] },
  triggers: [
    {
      key: 'new_file',
      type: 'polling',
      name: 'New File',
      description: 'Triggers when a file is added (optionally inside a specific folder).',
      inputFields: [folderField, { key: 'includeFolders', label: 'Include folders', type: 'boolean', default: false }],
      sample: { id: '1xYz', name: 'report.pdf', mime_type: 'application/pdf', web_view_link: 'https://drive.google.com/…', size: 20480, created_time: '2025-01-01T10:00:00.000Z' },
      async poll(context) {
        const clauses = ['trashed = false'];
        if (context.input.folderId) clauses.push(`${driveQueryLiteral(String(context.input.folderId))} in parents`);
        if (!context.input.includeFolders) clauses.push(`mimeType != '${FOLDER}'`);
        const result = await authorizedRequest<{ files?: DriveFile[] }>(context.auth, API, {
          query: { q: clauses.join(' and '), orderBy: 'createdTime desc', pageSize: 50, fields: `files(${FILE_FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true },
        });
        return (result.files ?? []).map((file) => ({ id: file.id, data: toFileData(file) }));
      },
    },
  ],
  actions: [
    {
      key: 'create_file_from_text',
      name: 'Create File From Text',
      description: 'Creates a new file (or Google Doc) from text content.',
      inputFields: [
        { key: 'name', label: 'File name', type: 'string', required: true },
        { key: 'content', label: 'Content', type: 'text', required: true },
        folderField,
        { key: 'mimeType', label: 'File type', type: 'select', default: 'text/plain', options: [
          { label: 'Plain text', value: 'text/plain' }, { label: 'CSV', value: 'text/csv' },
          { label: 'HTML', value: 'text/html' }, { label: 'JSON', value: 'application/json' },
        ] },
        { key: 'convertToGoogleDoc', label: 'Convert to Google Doc/Sheet', type: 'boolean', default: false },
      ],
      sample: { id: '1xYz', name: 'notes.txt', mime_type: 'text/plain', web_view_link: 'https://drive.google.com/…' },
      async run(context) {
        const existing = await findExisting(context);
        if (existing) return toFileData(existing);
        const sourceType = String(context.input.mimeType ?? 'text/plain');
        const target = context.input.convertToGoogleDoc
          ? sourceType === 'text/csv' ? 'application/vnd.google-apps.spreadsheet' : 'application/vnd.google-apps.document'
          : sourceType;
        const metadata = {
          name: context.input.name,
          mimeType: target,
          ...(context.input.folderId ? { parents: [context.input.folderId] } : {}),
          appProperties: { taskvynStep: idempotencyToken(context.idempotencyKey) },
        };
        const boundary = `taskvyn${randomBytes(12).toString('hex')}`;
        const body = [
          `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
          `--${boundary}`, `Content-Type: ${sourceType}; charset=UTF-8`, '', String(context.input.content ?? ''),
          `--${boundary}--`, '',
        ].join('\r\n');
        const file = await authorizedRequest<DriveFile>(context.auth, UPLOAD, {
          method: 'POST', query: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: true },
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
        });
        return toFileData(file);
      },
    },
    {
      key: 'create_folder',
      name: 'Create Folder',
      description: 'Creates a new folder.',
      inputFields: [{ key: 'name', label: 'Folder name', type: 'string', required: true }, { ...folderField, label: 'Parent folder' }],
      sample: { id: '1Fold', name: 'Invoices', mime_type: FOLDER, web_view_link: 'https://drive.google.com/…' },
      async run(context) {
        const existing = await findExisting(context);
        if (existing) return toFileData(existing);
        const folder = await authorizedRequest<DriveFile>(context.auth, API, {
          method: 'POST', query: { fields: FILE_FIELDS, supportsAllDrives: true },
          json: {
            name: context.input.name, mimeType: FOLDER,
            ...(context.input.folderId ? { parents: [context.input.folderId] } : {}),
            appProperties: { taskvynStep: idempotencyToken(context.idempotencyKey) },
          },
        });
        return toFileData(folder);
      },
    },
  ],
  optionLoaders: {
    async folders(context) {
      const result = await authorizedRequest<{ files?: DriveFile[] }>(context.auth, API, {
        query: { q: `mimeType = '${FOLDER}' and trashed = false`, orderBy: 'name', pageSize: 200, fields: 'files(id,name)' },
      });
      return (result.files ?? []).map((file) => ({ label: file.name, value: file.id }));
    },
  },
};
