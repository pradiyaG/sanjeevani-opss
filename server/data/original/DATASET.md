# Challenge 05 – The Blocked Bed
**Sanjeevani Multispeciality Hospital**  ·  Data snapshot: 2026-11-16 10:00 (live snapshot)

## Files

### `admissions.csv`  (79 rows)

`admission_id`, `patient_id`, `admission_time`, `department`, `ward`, `expected_discharge`, `status`, `triage_priority`

### `appointments.csv`  (4,145 rows)

`appointment_id`, `doctor`, `department`, `datetime`, `status`, `waiting_time_min`

### `beds.csv`  (89 rows)

`bed_id`, `ward`, `bed_type`, `occupancy`, `patient_id`, `admission_discharge_status`

### `diagnostics.csv`  (71 rows)

`test_id`, `test`, `patient_id`, `department`, `status`, `requested_time`, `expected_completion`

### `discharge.csv`  (9 rows)

`request_id`, `patient_id`, `ward`, `bed_id`, `requested_time`, `pending_tasks`, `medication_status`, `document_status`

### `ed_wait_times.csv`  (184 rows)

`date`, `hour`, `ed_avg_wait_min`

### `feedback.csv`  (79 rows)

`feedback_id`, `date`, `department`, `category`, `severity`, `resolution_status`, `comment`

### `patients.csv`  (88 rows)

`patient_id`, `age_group`, `department`, `visit_type`, `status`

### `staff.csv`  (131 rows)

`staff_id`, `name`, `role`, `department`, `date`, `shift`, `availability`, `patients_assigned`

## Notes

- Extra file `ed_wait_times.csv` gives average Emergency waiting time by hour.
- `appointments.csv` covers the last 14 days plus today; today's open slots are rows with status `Open slot`.
- `admissions.csv` `triage_priority` is filled only for patients awaiting a bed (P1 most urgent).
- Data is synthetic. No real patient information.

At hour 14 an updated version of one of these files will be released. Same columns, same format.