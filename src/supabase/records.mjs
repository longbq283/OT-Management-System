import { normalizeEmployeeCode } from './client.mjs';
import { validateRecord } from '../domain/overtime.mjs';

export const periodKey = (project, year, month) => [project, year, month].join(':');

export function fromDatabase(row) {
  return {
    id: row.id, importId: String(row.period_data_revision), projectId: row.project_id,
    employeeId: row.employee_code, name: row.full_name, unit: row.unit,
    year: row.year, month: row.month, ntMinutes: row.nt_minutes, nnMinutes: row.nn_minutes,
    unclassifiedMinutes: row.unclassified_minutes, totalMinutes: row.total_minutes, days: row.days,
    lMinutes: row.days.filter(day => day.type === 'L').reduce((sum, day) => sum + day.minutes, 0),
    source: row.source, status: row.active ? 'active' : 'archived'
  };
}

export function prepareRows(source, period) {
  const seen = new Map();
  return source.map(record => {
    const employeeCode = normalizeEmployeeCode(record.employeeId);
    if (seen.has(employeeCode)) {
      throw Error('Xung đột mã cán bộ sau chuẩn hóa: ' + seen.get(employeeCode) + ' và ' + record.employeeId + '.');
    }
    seen.set(employeeCode, record.employeeId);
    const errors = validateRecord({ ...record, employeeId: employeeCode }, { period });
    if (errors.length) throw Error('Mã ' + employeeCode + ' — ' + errors.join(' '));
    return {
      employee_code: employeeCode, full_name: record.name, unit: record.unit || '',
      source: record.source, days: record.days, nt_minutes: record.ntMinutes,
      nn_minutes: record.nnMinutes,
      unclassified_minutes: record.unclassifiedMinutes ?? record.totalMinutes - record.ntMinutes - record.nnMinutes
    };
  });
}

export function planLegacyBackup(tables, projects, profiles, memberships) {
  const byCode = new Map(projects.map(project => [project.code, project.id]));
  const people = new Map(profiles.filter(profile => profile.status === 'active')
    .map(profile => [profile.employee_code, profile.id]));
  const assigned = new Set(memberships.filter(member => member.active)
    .map(member => member.project_id + ':' + member.user_id));
  const originalCodes = new Map();
  const groups = new Map();
  // Check identities across every period, including archived employee identities.
  for (const employee of tables.Employees) {
    const code = normalizeEmployeeCode(employee.employeeId);
    if (originalCodes.has(code)) {
      throw Error('Xung đột mã cán bộ sau chuẩn hóa: ' + originalCodes.get(code) + ' và ' + employee.employeeId + '.');
    }
    originalCodes.set(code, employee.employeeId);
  }
  for (const row of tables.OTRecords.filter(record => record.status === 'active')) {
    const project = byCode.get(row.projectId);
    if (!project) throw Error('Chưa có dự án đích mang mã ' + row.projectId + '.');
    const code = normalizeEmployeeCode(row.employeeId);
    if (!assigned.has(project + ':' + people.get(code))) {
      throw Error('Mã ' + code + ' chưa được duyệt và phân công cho dự án ' + row.projectId + '.');
    }
    const key = periodKey(project, row.year, row.month);
    const group = groups.get(key) || {
      project, projectCode: row.projectId, year: row.year, month: row.month, records: [], total: 0
    };
    group.records.push(row);
    group.total += row.totalMinutes;
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, rows: prepareRows(group.records, group) }));
}
