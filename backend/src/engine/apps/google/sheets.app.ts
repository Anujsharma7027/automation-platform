import { AppDefinition, StepContext } from '../../core/integration.types';
import { authorizedRequest } from '../../core/http';
import { PermanentIntegrationError } from '../../core/errors';
import { extractGoogleId, GOOGLE_PROVIDER, GOOGLE_SCOPES } from './google.shared';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const WINDOW = 50;

const spreadsheetField = { key: 'spreadsheetId', label: 'Spreadsheet', type: 'string' as const, required: true, helpText: 'Paste the spreadsheet URL or id.' };
const sheetField = { key: 'sheetName', label: 'Worksheet', type: 'select' as const, required: true, dynamicOptions: 'worksheets' };

function range(sheetName: unknown, cells = ''): string {
  const name = String(sheetName ?? '').trim();
  if (!name) throw new PermanentIntegrationError('Worksheet is required');
  return encodeURIComponent(`'${name.replace(/'/g, "''")}'${cells ? `!${cells}` : ''}`);
}

async function readValues(context: StepContext, cells = 'A1:ZZ'): Promise<string[][]> {
  const id = extractGoogleId(context.input.spreadsheetId, 'Spreadsheet');
  const result = await authorizedRequest<{ values?: string[][] }>(context.auth, `${API}/${id}/values/${range(context.input.sheetName, cells)}`, {
    query: { majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' },
  });
  return result.values ?? [];
}

function rowObject(headers: string[], row: string[], rowNumber: number): Record<string, unknown> {
  const data: Record<string, unknown> = { row_number: rowNumber, values: row };
  headers.forEach((name, index) => {
    const key = name.trim() || `column_${index + 1}`;
    data[key] = row[index] ?? '';
  });
  return data;
}

async function toRow(context: StepContext): Promise<string[]> {
  const values = context.input.values;
  if (Array.isArray(values)) return values.map((value) => (value === null || value === undefined ? '' : String(value)));
  if (!values || typeof values !== 'object') throw new PermanentIntegrationError('Row values must be a JSON object or array');
  const [headers = []] = await readValues(context, '1:1');
  const entries = values as Record<string, unknown>;
  const unknown = Object.keys(entries).filter((key) => !headers.includes(key));
  if (unknown.length) throw new PermanentIntegrationError(`Columns not found in header row: ${unknown.join(', ')}`);
  return headers.map((name) => (entries[name] === undefined || entries[name] === null ? '' : String(entries[name])));
}

export const sheetsApp: AppDefinition = {
  key: 'google_sheets',
  name: 'Google Sheets',
  description: 'Watch spreadsheets for new rows and add or update rows.',
  icon: 'simple-icons:googlesheets',
  category: 'Productivity',
  auth: { type: 'oauth2', provider: GOOGLE_PROVIDER, scopes: [GOOGLE_SCOPES.sheets] },
  triggers: [
    {
      key: 'new_row',
      type: 'polling',
      name: 'New Spreadsheet Row',
      description: 'Triggers when a new row is added to the bottom of a worksheet. Row 1 must contain headers.',
      inputFields: [spreadsheetField, sheetField],
      sample: { row_number: 2, Name: 'Ada Lovelace', Email: 'ada@example.com', values: ['Ada Lovelace', 'ada@example.com'] },
      async poll(context) {
        const [headers = [], ...rows] = await readValues(context);
        const items = rows
          .map((row, index) => ({ row, rowNumber: index + 2 }))
          .filter(({ row }) => row.some((cell) => String(cell).trim() !== ''))
          .slice(-WINDOW)
          .reverse();
        return items.map(({ row, rowNumber }) => ({ id: `row:${rowNumber}`, data: rowObject(headers, row, rowNumber) }));
      },
    },
  ],
  actions: [
    {
      key: 'append_row',
      name: 'Create Spreadsheet Row',
      description: 'Adds a row at the bottom of a worksheet.',
      inputFields: [
        spreadsheetField, sheetField,
        { key: 'values', label: 'Row values', type: 'json', required: true, placeholder: '{"Name": "{{trigger.from}}", "Email": "{{trigger.from_email}}"}', helpText: 'JSON object keyed by header name, or a JSON array in column order.' },
      ],
      sample: { spreadsheet_id: '1AbC…', updated_range: "'Sheet1'!A5:B5", updated_rows: 1 },
      async run(context) {
        const id = extractGoogleId(context.input.spreadsheetId, 'Spreadsheet');
        const row = await toRow(context);
        const result = await authorizedRequest<{ updates?: { updatedRange?: string; updatedRows?: number } }>(
          context.auth, `${API}/${id}/values/${range(context.input.sheetName, 'A1')}:append`, {
            method: 'POST',
            query: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
            json: { values: [row] },
          });
        return { spreadsheet_id: id, updated_range: result.updates?.updatedRange ?? '', updated_rows: result.updates?.updatedRows ?? 0 };
      },
    },
    {
      key: 'update_row',
      name: 'Update Spreadsheet Row',
      description: 'Overwrites the values of an existing row.',
      inputFields: [
        spreadsheetField, sheetField,
        { key: 'rowNumber', label: 'Row number', type: 'number', required: true },
        { key: 'values', label: 'Row values', type: 'json', required: true, helpText: 'JSON object keyed by header name, or a JSON array in column order.' },
      ],
      sample: { spreadsheet_id: '1AbC…', updated_range: "'Sheet1'!A3:B3", updated_cells: 2 },
      async run(context) {
        const id = extractGoogleId(context.input.spreadsheetId, 'Spreadsheet');
        const rowNumber = Number(context.input.rowNumber);
        if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new PermanentIntegrationError('Row number must be a positive integer');
        const row = await toRow(context);
        const result = await authorizedRequest<{ updatedRange?: string; updatedCells?: number }>(
          context.auth, `${API}/${id}/values/${range(context.input.sheetName, `A${rowNumber}`)}`, {
            method: 'PUT', query: { valueInputOption: 'USER_ENTERED' }, json: { values: [row] },
          });
        return { spreadsheet_id: id, updated_range: result.updatedRange ?? '', updated_cells: result.updatedCells ?? 0 };
      },
    },
  ],
  optionLoaders: {
    async worksheets(context) {
      const id = extractGoogleId(context.input.spreadsheetId, 'Spreadsheet');
      const result = await authorizedRequest<{ sheets?: { properties: { title: string } }[] }>(context.auth, `${API}/${id}`, {
        query: { fields: 'sheets.properties.title' },
      });
      return (result.sheets ?? []).map((sheet) => ({ label: sheet.properties.title, value: sheet.properties.title }));
    },
  },
};
