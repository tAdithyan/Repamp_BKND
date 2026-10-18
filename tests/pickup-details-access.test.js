import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPickupDetailsFilter } from '../src/services/pickup.service.js';

test('customer pickup-details reads are scoped to the authenticated customer', () => {
  assert.deepEqual(buildPickupDetailsFilter('p1', { _id: 'customer-1', role: 'ROL_5' }), {
    _id: 'p1', customerId: 'customer-1',
  });
});

test('operator pickup-details reads are scoped to pickups assigned to that operator', () => {
  assert.deepEqual(buildPickupDetailsFilter('p1', { _id: 'operator-1', role: 'CollectionAgent' }), {
    _id: 'p1', operatorId: 'operator-1',
  });
});

test('client-admin pickup-details reads are scoped to their recurring contracts', () => {
  assert.deepEqual(buildPickupDetailsFilter('p1', { _id: 'client-1', role: 'ROL_6' }, ['contract-1']), {
    _id: 'p1', recurringContractId: { $in: ['contract-1'] },
  });
});

test('administrative pickup-details reads retain the existing permission-based scope', () => {
  assert.deepEqual(buildPickupDetailsFilter('p1', { _id: 'admin-1', role: 'ROL_2' }), { _id: 'p1' });
});
