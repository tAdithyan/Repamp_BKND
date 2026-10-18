import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ApiError from '../src/utils/apiError.js';

const source = (await readFile(new URL('../src/services/recurringPickup.service.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/export /g, '');
test('recurring generation assigns the selected agent, leaves optional selections unassigned, and preserves existing pickups', async () => {
  const rows = [];
  const notifications = [];
  const contracts = ['agent1', null, undefined].map((operatorId, index) => ({
    _id: `contract${index}`, customerId: 'customer', operatorId, preferredTime: '09:00',
    pickupLocation: { type: 'Point', coordinates: [76, 10] }, wasteType: 'Plastic', ratePerKg: 5,
    name: 'Test', save: async () => {},
  }));
  const generate = new Function('Pickup', 'RecurringPickup', 'assertPickupDistrictServiceable', 'notifyPickupEvent', source + ';return generateRecurringPickups;')({
    exists: async query => rows.some(row => row.recurringGenerationKey === query.$or[0].recurringGenerationKey),
    create: async row => { const created = { ...row, _id: `pickup-${rows.length + 1}` }; rows.push(created); return created; },
  }, { find: async () => contracts }, async () => {}, async event => { notifications.push(event); });
  const today = new Date(2026, 8, 20, 12);
  assert.equal(await generate(today), 3);
  assert.deepEqual(rows.map(({ operatorId, status }) => [operatorId, status]), [['agent1', 'assigned'], [null, 'scheduled'], [null, 'scheduled']]);
  assert.equal(notifications.filter(event => event.event === 'recurring_pickup_reminder').length, 3);
  contracts[0].operatorId = 'agent2';
  assert.equal(await generate(today), 0);
  assert.equal(rows[0].operatorId, 'agent1');
  assert.equal(await generate(new Date(2026, 8, 21, 12)), 3);
  assert.equal(rows[3].operatorId, 'agent2');
});

test('assignment validation accepts only existing collection agents or coordinators', async () => {
  const controller = await readFile(new URL('../src/controllers/recurringPickup.controller.js', import.meta.url), 'utf8');
  const body = controller.slice(controller.indexOf('const validateOperator ='), controller.indexOf('const validateClientOwnership ='));
  const validate = new Function('mongoose', 'User', 'ApiError', body + ';return validateOperator;')(
    { Types: { ObjectId: { isValid: value => value !== 'malformed' } } },
    { exists: async query => query.role.$in.includes(query._id) }, ApiError,
  );
  for (const value of [undefined, null, '', 'ROL_3', 'ROL_4']) await validate(value);
  for (const value of ['malformed', 'ROL_5', 'missing']) await assert.rejects(validate(value), error => error.statusCode === 400);
});
