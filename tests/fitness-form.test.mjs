import test from 'node:test';
import assert from 'node:assert/strict';
import { getSubmissionForm } from '../app.mjs';

test('a bubbled submit event resolves to the form, not its document listener', () => {
  const form = { id: 'day-form' };
  const document = { nodeType: 9 };
  const event = { target: form, currentTarget: document };

  assert.equal(getSubmissionForm(event), form);
});
