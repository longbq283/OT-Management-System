import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEmployeeCode, normalizeEmail } from '../../src/supabase/client.mjs';
import { planLegacyBackup, prepareRows } from '../../src/supabase/records.mjs';

const period = { year: 2026, month: 11 };
const row = { ...period, projectId: 'P1', employeeId: '23', name: 'Cán bộ giả lập', status: 'active',
  ntMinutes: 120, nnMinutes: 60, totalMinutes: 180, source: 'daily',
  days: [{ date: '2026-11-01', type: 'NT', minutes: 120 }, { date: '2026-11-03', type: 'L', minutes: 60 }] };
const projects = [{ id: 'project-fixture', code: 'P1' }];
const profiles = [{ id: 'user-fixture', status: 'active', employee_code: '00000023' }];
const memberships = [{ project_id: 'project-fixture', user_id: 'user-fixture', active: true }];

test('normalizes 1–8 ASCII digits as an exact string and restricts signup domain', () => {
  assert.equal(normalizeEmployeeCode('23'), '00000023');
  assert.equal(normalizeEmployeeCode('00000023'), '00000023');
  for (const invalid of [' 23', '000000023', '2A', '２３', '', 23]) {
    assert.throws(() => normalizeEmployeeCode(invalid), /1–8/);
  }
  assert.equal(normalizeEmail(' Fixture@BIDV.COM.VN '), 'fixture@bidv.com.vn');
  assert.throws(() => normalizeEmail('fixture@bidv.com.vn.example.invalid'), /@bidv/);
});

test('refuses collisions within imports and across different legacy periods', () => {
  assert.throws(() => prepareRows([row, { ...row, employeeId: '00000023' }], period), /Xung đột mã cán bộ/);
  const backup = { Employees: [{ employeeId: '23' }, { employeeId: '00000023' }],
    OTRecords: [row, { ...row, employeeId: '00000023', month: 12 }] };
  assert.throws(() => planLegacyBackup(backup, projects, profiles, memberships), /Xung đột mã cán bộ/);
});

test('migration only plans active rows and rejects unassigned or unmapped records', () => {
  const backup = { Employees: [{ employeeId: '23' }], OTRecords: [row, { ...row, status: 'archived' }] };
  const [plan] = planLegacyBackup(backup, projects, profiles, memberships);
  assert.equal(plan.project, 'project-fixture');
  assert.equal(plan.total, 180);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].employee_code, '00000023');
  assert.equal(plan.rows[0].nn_minutes, 60);
  assert.throws(() => planLegacyBackup(backup, projects, profiles, []), /chưa được duyệt và phân công/);
  assert.throws(() => planLegacyBackup(backup, [], profiles, memberships), /Chưa có dự án đích/);
});
