import { buildMime, toEmailData } from './gmail.app';

describe('gmail app', () => {
  it('builds MIME without header injection and encodes UTF-8 subjects', () => {
    const raw = Buffer.from(buildMime({ to: 'a@b.co\r\nBcc: evil@x.co', subject: 'Héllo', body: 'Body' }), 'base64url').toString('utf8');
    expect(raw).toContain('To: a@b.co Bcc: evil@x.co');
    expect(raw).not.toMatch(/^Bcc:/m);
    expect(raw).toContain('Subject: =?UTF-8?B?');
  });

  it('extracts headers, body and attachments', () => {
    const data = toEmailData({
      id: 'm1', threadId: 't1', internalDate: '0',
      payload: {
        headers: [{ name: 'From', value: 'Ada <ada@x.co>' }, { name: 'Subject', value: 'S' }],
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('hello').toString('base64url') } },
          { filename: 'a.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att', size: 3 } },
        ],
      },
    });
    expect(data).toMatchObject({ from_email: 'ada@x.co', subject: 'S', body_plain: 'hello', attachment_count: 1 });
  });
});
