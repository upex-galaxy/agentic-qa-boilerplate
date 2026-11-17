import * as allure from 'allure-js-commons';
import { ContentType } from 'allure-js-commons';

export interface AllureFilenameArgs {
  url: string
  suffix: string
}

export interface AttachJsonArgs {
  name: string
  data: unknown
  contentType?: ContentType
}

export interface AttachRequestResponseArgs {
  url: string
  method: string
  responseBody?: unknown
  requestBody?: unknown
}

export function generateAllureFilename(args: AllureFilenameArgs): string {
  const { url, suffix } = args;

  const cleanUrl = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');

  const segments = cleanUrl.split('/').filter(Boolean).slice(-2);
  const pathPart = segments.length > 0 ? segments.join('_') : 'root';

  const cleanPath = pathPart.replace(/[^a-z0-9]/gi, '_').slice(0, 50);

  return `${cleanPath}_${suffix}`;
}

export async function attachJsonToAllure(args: AttachJsonArgs): Promise<void> {
  const { name, data, contentType = ContentType.JSON } = args;

  try {
    if (data === undefined || data === null) {
      return;
    }

    if (typeof data === 'object' && Object.keys(data).length === 0) {
      return;
    }

    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await allure.attachment(name, content, contentType);
  }
  catch {
    // Allure might not be available in all contexts
  }
}

export async function attachRequestResponseToAllure(
  args: AttachRequestResponseArgs,
): Promise<void> {
  const { url, method, responseBody, requestBody } = args;

  try {
    if (responseBody !== undefined && responseBody !== null) {
      const isNonEmpty = typeof responseBody !== 'object' || Object.keys(responseBody).length > 0;
      if (isNonEmpty) {
        const filename = generateAllureFilename({ url, suffix: `${method}_response` });
        await attachJsonToAllure({ name: filename, data: responseBody });
      }
    }

    if (requestBody !== undefined && requestBody !== null) {
      const isNonEmpty = typeof requestBody !== 'object' || Object.keys(requestBody).length > 0;
      if (isNonEmpty) {
        const filename = generateAllureFilename({ url, suffix: `${method}_request` });
        await attachJsonToAllure({ name: filename, data: requestBody });
      }
    }
  }
  catch {
    // Allure might not be available in all contexts
  }
}
