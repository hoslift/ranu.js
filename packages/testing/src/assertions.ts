/**
 * Asserts that the response HTTP status code equals the expected status.
 */
export function expectStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected response status ${expectedStatus}, but received ${response.status} (${response.statusText || 'No Status Text'}).`,
    );
  }
}

/**
 * Asserts that a response header exists and optionally matches the expected string or regular expression.
 */
export function expectHeader(
  response: Response,
  header: string,
  expectedValue?: string | RegExp,
): string {
  const value = response.headers.get(header);
  if (value === null) {
    throw new Error(`Expected header "${header}" to be present on response, but it was not found.`);
  }

  if (expectedValue !== undefined) {
    if (typeof expectedValue === 'string') {
      if (value !== expectedValue) {
        throw new Error(
          `Expected header "${header}" to equal "${expectedValue}", but received "${value}".`,
        );
      }
    } else if (expectedValue instanceof RegExp) {
      if (!expectedValue.test(value)) {
        throw new Error(
          `Expected header "${header}" ("${value}") to match pattern ${expectedValue.toString()}.`,
        );
      }
    }
  }

  return value;
}

/**
 * Asserts that the response body is JSON and optionally checks values against a matcher.
 */
export async function expectJson<T = unknown>(
  response: Response,
  matcher?: Partial<T> | ((data: T) => void | boolean),
): Promise<T> {
  const text = await response.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch (err: any) {
    throw new Error(
      `Failed to parse response body as JSON. Received text: "${text.slice(0, 200)}": ${err.message}`,
    );
  }

  if (matcher) {
    if (typeof matcher === 'function') {
      const result = matcher(json);
      if (result === false) {
        throw new Error(`JSON response did not satisfy custom matcher function: ${JSON.stringify(json)}`);
      }
    } else if (typeof matcher === 'object' && matcher !== null) {
      for (const [key, expectedVal] of Object.entries(matcher)) {
        const actualVal = (json as any)[key];
        if (JSON.stringify(actualVal) !== JSON.stringify(expectedVal)) {
          throw new Error(
            `JSON property mismatch on "${key}": expected ${JSON.stringify(expectedVal)}, but got ${JSON.stringify(actualVal)}. Full body: ${JSON.stringify(json)}`,
          );
        }
      }
    }
  }

  return json;
}

/**
 * Asserts that the response body text matches the expected string or pattern.
 */
export async function expectText(
  response: Response,
  matcher?: string | RegExp,
): Promise<string> {
  const text = await response.text();
  if (matcher !== undefined) {
    if (typeof matcher === 'string') {
      if (!text.includes(matcher)) {
        throw new Error(
          `Expected response text to contain "${matcher}", but received: "${text.slice(0, 200)}"`,
        );
      }
    } else if (matcher instanceof RegExp) {
      if (!matcher.test(text)) {
        throw new Error(
          `Expected response text to match pattern ${matcher.toString()}, but received: "${text.slice(0, 200)}"`,
        );
      }
    }
  }
  return text;
}

/**
 * Asserts that the response is an HTTP redirect (301, 302, 303, 307, 308).
 */
export function expectRedirect(
  response: Response,
  expectedLocation?: string | RegExp,
  expectedStatus?: number,
): void {
  const redirectStatuses = [301, 302, 303, 307, 308];
  if (!redirectStatuses.includes(response.status)) {
    throw new Error(
      `Expected a redirect status (301, 302, 303, 307, 308), but received ${response.status}.`,
    );
  }

  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(
      `Expected redirect status ${expectedStatus}, but received ${response.status}.`,
    );
  }

  if (expectedLocation !== undefined) {
    expectHeader(response, 'location', expectedLocation);
  }
}
