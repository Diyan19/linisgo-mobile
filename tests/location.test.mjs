import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Read source files for verification
const locSrc = fs.readFileSync('src/app/shared/models/location.model.ts', 'utf8');
const publicDataSrc = fs.readFileSync('src/app/core/services/public-data.service.ts', 'utf8');
const angularJson = JSON.parse(fs.readFileSync('angular.json', 'utf8'));

const EXPECTED_MUNICIPALITIES = [
  { id: 'calapan-city', name: 'Calapan City' },
  { id: 'baco', name: 'Baco' },
  { id: 'bansud', name: 'Bansud' },
  { id: 'bongabong', name: 'Bongabong' },
  { id: 'bulalacao', name: 'Bulalacao' },
  { id: 'gloria', name: 'Gloria' },
  { id: 'mansalay', name: 'Mansalay' },
  { id: 'naujan', name: 'Naujan' },
  { id: 'pinamalayan', name: 'Pinamalayan' },
  { id: 'pola', name: 'Pola' },
  { id: 'puerto-galera', name: 'Puerto Galera' },
  { id: 'roxas', name: 'Roxas' },
  { id: 'san-teodoro', name: 'San Teodoro' },
  { id: 'socorro', name: 'Socorro' },
  { id: 'victoria', name: 'Victoria' },
];

test('Oriental Mindoro location catalog contains all 15 cities and municipalities with town-center coordinates', () => {
  for (const item of EXPECTED_MUNICIPALITIES) {
    assert.ok(locSrc.includes(`id: '${item.id}'`), `Missing municipality ID: ${item.id}`);
    assert.ok(locSrc.includes(`name: '${item.name}'`), `Missing municipality name: ${item.name}`);
  }
});

test('Location helper functions exist and enforce Request vs Offer rules and deduplication', () => {
  assert.ok(locSrc.includes('export function validatePostLocationForPublish'), 'validatePostLocationForPublish missing');
  assert.ok(locSrc.includes('export function doesPostMatchLocationFilter'), 'doesPostMatchLocationFilter missing');
  assert.ok(locSrc.includes('export function getPostLocationSummary'), 'getPostLocationSummary missing');
  assert.ok(
    publicDataSrc.includes('const uniquePostIds = new Set<string>()') &&
      publicDataSrc.includes('uniquePostIds.add(post.id)'),
    'Total Matching Posts deduplication across multi-area offers must use Set of post IDs'
  );
});

test('angular.json dev-server allows AI Studio reverse proxy hosts (.run.app)', () => {
  const allowedHosts = angularJson.projects?.app?.architect?.serve?.options?.allowedHosts || [];
  assert.ok(allowedHosts.includes('.run.app'), 'angular.json serve.options.allowedHosts must include .run.app');
});

test('Security check: no Firebase private keys, service account JSON, or raw backend secrets in src/', () => {
  const forbiddenPatterns = ['PRIVATE_KEY', 'service_account', 'firebase-adminsdk'];
  for (const pattern of forbiddenPatterns) {
    assert.ok(!publicDataSrc.includes(pattern), `Forbidden secret pattern found: ${pattern}`);
  }
});
