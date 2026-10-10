// Roles, screens and permissions (taken from the Sanjeevani Operations Agent design).
// tabs: screens the role can open. approve: action kinds it can approve or reject.
// register: can add waiting patients. clinical: can confirm or change a triage level. data: can upload updated dataset files.
const ROLES = {
  'Medical Superintendent': { tabs: ['Overview', 'Patient Triage', 'Issues', 'Actions', 'Beds & Discharges', 'Diagnostics & Staff', 'Complaints', 'Data'], approve: ['discharge', 'lab', 'bed', 'staff', 'workload', 'sched', 'complaint', 'triage'], register: true, clinical: true, admin: true, data: true },
  'Doctor': { tabs: ['Overview', 'Patient Triage', 'Beds & Discharges', 'Diagnostics & Staff'], approve: ['bed', 'triage'], register: true, clinical: true },
  'Nurse': { tabs: ['Patient Triage', 'Beds & Discharges'], approve: [], register: true, clinical: true },
  'Nursing Head': { tabs: ['Overview', 'Patient Triage', 'Issues', 'Actions', 'Beds & Discharges', 'Diagnostics & Staff'], approve: ['staff', 'bed', 'triage'], register: true, clinical: true },
  'Lab Supervisor': { tabs: ['Overview', 'Issues', 'Actions', 'Diagnostics & Staff'], approve: ['lab'], register: false, clinical: false },
  'Shift Manager': { tabs: ['Overview', 'Patient Triage', 'Issues', 'Actions', 'Beds & Discharges', 'Diagnostics & Staff', 'Complaints', 'Data'], approve: ['staff', 'sched', 'workload', 'bed', 'triage'], register: true, clinical: false, data: true },
  'Department Head': { tabs: ['Overview', 'Patient Triage', 'Issues', 'Actions', 'Beds & Discharges', 'Diagnostics & Staff'], approve: ['workload', 'sched', 'staff', 'triage'], register: true, clinical: true },
  'Discharge Coordinator': { tabs: ['Overview', 'Issues', 'Actions', 'Beds & Discharges'], approve: ['discharge'], register: false, clinical: false },
  'Front Office / Reception': { tabs: ['Patient Triage', 'Actions', 'Complaints'], approve: ['sched', 'complaint'], register: true, clinical: false },
};
const ROLE_NAMES = Object.keys(ROLES);
const DEPARTMENT_NAMES = ['Emergency', 'Critical Care', 'General Medicine', 'Cardiology', 'Orthopaedics', 'Paediatrics', 'Gynaecology', 'Neurology', 'ENT', 'Dermatology'];

module.exports = { ROLES, ROLE_NAMES, DEPARTMENT_NAMES };
