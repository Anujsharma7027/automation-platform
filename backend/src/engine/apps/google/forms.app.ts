import { AppDefinition } from '../../core/integration.types';
import { authorizedRequest } from '../../core/http';
import { extractGoogleId, GOOGLE_PROVIDER, GOOGLE_SCOPES, sinceDays } from './google.shared';

const API = 'https://forms.googleapis.com/v1/forms';

interface FormItem { title?: string; questionItem?: { question?: { questionId?: string } } }
interface FormResponse { responseId: string; createTime?: string; lastSubmittedTime?: string; respondentEmail?: string; answers?: Record<string, { questionId: string; textAnswers?: { answers?: { value?: string }[] } }> }

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'question';
}

const formField = { key: 'formId', label: 'Form', type: 'string' as const, required: true, helpText: 'Paste the form editor URL (…/forms/d/<id>/edit) or its id.' };

export const formsApp: AppDefinition = {
  key: 'google_forms',
  name: 'Google Forms',
  description: 'Watch forms for new responses and create forms.',
  icon: 'simple-icons:googleforms',
  category: 'Productivity',
  auth: { type: 'oauth2', provider: GOOGLE_PROVIDER, scopes: [GOOGLE_SCOPES.formsBody, GOOGLE_SCOPES.formsResponses] },
  triggers: [
    {
      key: 'new_response',
      type: 'polling',
      name: 'New Form Response',
      description: 'Triggers when someone submits the form. Answers are available by question title.',
      inputFields: [formField],
      sample: { response_id: 'ACYDBN…', submitted_at: '2025-01-01T10:00:00Z', respondent_email: 'ada@example.com', answers: { your_name: 'Ada', email: 'ada@example.com' }, answers_list: [{ question: 'Your name', answer: 'Ada' }] },
      async poll(context) {
        const formId = extractGoogleId(context.input.formId, 'Form');
        const since = sinceDays(7).toISOString();
        const [form, responses] = await Promise.all([
          authorizedRequest<{ items?: FormItem[] }>(context.auth, `${API}/${formId}`, { query: { fields: 'items(title,questionItem(question(questionId)))' } }),
          authorizedRequest<{ responses?: FormResponse[] }>(context.auth, `${API}/${formId}/responses`, { query: { filter: `timestamp > ${since}`, pageSize: 500 } }),
        ]);
        const titles = new Map<string, string>();
        for (const item of form.items ?? []) {
          const id = item.questionItem?.question?.questionId;
          if (id) titles.set(id, item.title ?? id);
        }
        return (responses.responses ?? [])
          .sort((a, b) => String(b.lastSubmittedTime).localeCompare(String(a.lastSubmittedTime)))
          .slice(0, 50)
          .map((response) => {
            const list = Object.values(response.answers ?? {}).map((answer) => ({
              question: titles.get(answer.questionId) ?? answer.questionId,
              answer: (answer.textAnswers?.answers ?? []).map((item) => item.value ?? '').join(', '),
            }));
            return {
              id: response.responseId,
              data: {
                response_id: response.responseId,
                submitted_at: response.lastSubmittedTime ?? response.createTime ?? '',
                respondent_email: response.respondentEmail ?? '',
                answers: Object.fromEntries(list.map((item) => [slug(item.question), item.answer])),
                answers_list: list,
              },
            };
          });
      },
    },
  ],
  actions: [
    {
      key: 'create_form',
      name: 'Create Form',
      description: 'Creates a new, empty Google Form.',
      inputFields: [
        { key: 'title', label: 'Title', type: 'string', required: true },
        { key: 'description', label: 'Description', type: 'text' },
      ],
      sample: { form_id: '1FAIpQ…', responder_uri: 'https://docs.google.com/forms/d/e/…/viewform', edit_url: 'https://docs.google.com/forms/d/…/edit' },
      async run(context) {
        const form = await authorizedRequest<{ formId: string; responderUri?: string }>(context.auth, API, {
          method: 'POST', json: { info: { title: context.input.title, documentTitle: context.input.title } },
        });
        if (context.input.description) {
          await authorizedRequest(context.auth, `${API}/${form.formId}:batchUpdate`, {
            method: 'POST',
            json: { requests: [{ updateFormInfo: { info: { description: context.input.description }, updateMask: 'description' } }] },
          });
        }
        return { form_id: form.formId, responder_uri: form.responderUri ?? '', edit_url: `https://docs.google.com/forms/d/${form.formId}/edit` };
      },
    },
  ],
};
