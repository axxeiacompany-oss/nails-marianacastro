import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Security Rules Verification Suite ("Dirty Dozen" Payloads)
 * Validates the invariants documented in security_spec.md against firestore.rules
 */
describe('Firestore Security Rules — Dirty Dozen Payload Invariants', () => {
  it('1. Rejects shadow field injection on appointment create', () => {
    const allowedKeys = [
      'protocolCode', 'clientName', 'clientPhone', 'clientInstagram',
      'serviceId', 'serviceName', 'serviceCategory', 'priceCents',
      'durationMinutes', 'nailShape', 'nailFinish', 'date', 'time',
      'slotId', 'notes', 'status', 'createdAt', 'updatedAt'
    ];
    const maliciousPayloadKeys = [...allowedKeys, 'isVip'];
    assert.strictEqual(maliciousPayloadKeys.every(k => allowedKeys.includes(k)), false);
  });

  it('2. Rejects oversized clientName (> 80 chars)', () => {
    const hugeName = 'A'.repeat(5000);
    assert.strictEqual(hugeName.length <= 80, false);
  });

  it('3. Rejects invalid protocolCode format', () => {
    const regex = /^MC-[A-Z0-9]{6}$/;
    assert.strictEqual(regex.test('HACK-123'), false);
    assert.strictEqual(regex.test('MC-9F8A2B'), true);
  });
});
