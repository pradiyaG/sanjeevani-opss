// The hospital dataset (Challenge 05 – The Blocked Bed): file list, CSV reading and checks.
// Every file keeps its own columns. An updated file must have exactly the same columns.
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = {
  'admissions.csv': { key: 'admission_id', columns: ['admission_id', 'patient_id', 'admission_time', 'department', 'ward', 'expected_discharge', 'status', 'triage_priority'] },
  'appointments.csv': { key: 'appointment_id', columns: ['appointment_id', 'doctor', 'department', 'datetime', 'status', 'waiting_time_min'] },
  'beds.csv': { key: 'bed_id', columns: ['bed_id', 'ward', 'bed_type', 'occupancy', 'patient_id', 'admission_discharge_status'] },
  'diagnostics.csv': { key: 'test_id', columns: ['test_id', 'test', 'patient_id', 'department', 'status', 'requested_time', 'expected_completion'] },
  'discharge.csv': { key: 'request_id', columns: ['request_id', 'patient_id', 'ward', 'bed_id', 'requested_time', 'pending_tasks', 'medication_status', 'document_status'] },
  'ed_wait_times.csv': { key: null, columns: ['date', 'hour', 'ed_avg_wait_min'] },
  'feedback.csv': { key: 'feedback_id', columns: ['feedback_id', 'date', 'department', 'category', 'severity', 'resolution_status', 'comment'] },
  'patients.csv': { key: 'patient_id', columns: ['patient_id', 'age_group', 'department', 'visit_type', 'status'] },
  'staff.csv': { key: null, columns: ['staff_id', 'name', 'role', 'department', 'date', 'shift', 'availability', 'patients_assigned'] },
};
const NAMES = Object.keys(FILES);
const ORIGINAL_DIR = path.join(__dirname, 'data', 'original');

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  const s = String(text).replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { q = false; i += 1; continue; }
      field += c; i += 1; continue;
    }
    if (c === '"' && field === '') { q = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// Reads one file's text and checks it. Returns { rows } or { error }.
function readFile(name, text) {
  const spec = FILES[name];
  if (!spec) return { error: `Unknown file "${name}". Expected one of: ${NAMES.join(', ')}.` };
  const table = parseCsv(text);
  if (!table.length) return { error: `${name} is empty.` };
  const header = table[0].map((h) => h.trim());
  const missing = spec.columns.filter((c) => !header.includes(c));
  const extra = header.filter((c) => !spec.columns.includes(c));
  if (missing.length || extra.length) {
    return { error: `${name} must have the same columns as before. ${missing.length ? `Missing: ${missing.join(', ')}. ` : ''}${extra.length ? `Unexpected: ${extra.join(', ')}.` : ''}`.trim() };
  }
  const rows = [];
  const problems = [];
  table.slice(1).forEach((cells, n) => {
    if (cells.length !== header.length) { problems.push(`row ${n + 2} has ${cells.length} values instead of ${header.length}`); return; }
    const o = {};
    header.forEach((h, k) => { o[h] = cells[k].trim(); });
    if (spec.key && !o[spec.key]) { problems.push(`row ${n + 2} has no ${spec.key}`); return; }
    rows.push(o);
  });
  if (!rows.length) return { error: `${name} has no usable rows.${problems.length ? ` ${problems.slice(0, 3).join('; ')}.` : ''}` };
  return { rows, skipped: problems };
}

function readOriginal() {
  const out = {};
  for (const name of NAMES) {
    const r = readFile(name, fs.readFileSync(path.join(ORIGINAL_DIR, name), 'utf8'));
    if (r.error) throw new Error(r.error);
    out[name] = r.rows;
  }
  return out;
}

// Short key used inside the agent: 'beds.csv' -> 'beds'
const short = (name) => name.replace(/\.csv$/, '');

module.exports = { FILES, NAMES, parseCsv, readFile, readOriginal, short, ORIGINAL_DIR };
