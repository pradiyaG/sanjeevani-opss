# Sanjeevani Operations Agent (React + Express + MongoDB)

An operations agent for **Challenge 05 – The Blocked Bed** (CYPHER 2026), built on the official hospital dataset
(`server/data/original/*.csv`). It reads the nine files and works through **Observe → Reason → Evaluate → Decide → Act → Explain**.
It works out why patients are stuck, ranks the problems, proposes actions for the right person to approve, and explains every step with evidence from the data.

None of the figures, issues or actions are typed into the code. When a file is replaced (for example the update released at hour 14),
every screen recalculates.

The data is synthetic. This is decision support only: every action is approved by authorised staff, and the agent never
diagnoses, prescribes, moves patients, reassigns staff or releases beds by itself.

## Run it

**Option A: Docker** (needs Docker Desktop)
```
docker compose up --build
```
Open http://localhost:4000

**Option B: VS Code with Node 20 and MongoDB**
```
cd server
npm install
npm run seed        # loads the 9 CSV files into MongoDB and runs the agent
npm run dev         # API on http://localhost:4000
```
In a second terminal:
```
cd client
npm install
npm run dev         # open http://localhost:5173
```
Sign in with any name, a work email, a staff ID such as `SMH-10234`, and a role.

## What the agent finds in the dataset (snapshot 2026-11-16 10:00)

| # | Issue | Evidence in the data |
|---|---|---|
| 1 | Emergency backed up by blocked beds, not patient volume | ED wait 90 min today vs 35 usual; 7/7 ED beds full; 9 patients "Waiting in ED – no bed"; ED-06/ED-07 held by discharges waiting on late CT reports and unsigned summaries; 10 beds free in General Wards A/B and Ortho |
| 2 | ICU full: 2 critical patients waiting | ICU 12/12; P1087 (P1) since 07:00, P1088 (P2) since 08:30; no ICU discharge pending |
| 3 | 6 discharges stuck on pending tasks | 4 General Ward discharges waiting on MRI reports for 28 h, plus 2 in ED. The 3 Paediatric discharges are "leaving within the hour", so they are **not** flagged |
| 4 | 11 test reports overdue, 6 holding a discharge | MRI T0003–T0006 12 h late, CT T0001/T0002 3 h late |
| 5 | Dr. Prakash Rao overloaded while Dr. Anita Menon has open slots | 38 patients today (usual 17), average wait 95 min; Dr. Anita Menon has 9 open slots from 11:00 to 15:00 |
| 6 | Emergency evening shift short-staffed | 1 of 2 doctors (Dr. Rahul Iyer on leave), 3 of 5 nurses |
| 7 | Complaints that trace to operations | Waiting-time and discharge-delay complaints linked to the issues above |
| 8 | Orthopaedics 10:00–11:00 runs late every day | 90 min average wait vs 24 min in other hours; 9 complaints mention it |

For **Evaluate**, each issue lists the options the agent considered, the expected effect of each, and the one it chose.
Scores are urgency × impact (1–5 each). These are demonstration settings, not validated hospital standards.

## The hour-14 update

1. Sign in as **Medical Superintendent** or **Shift Manager** and open **Data**.
2. Click **Upload update** on the row of the file that changed and choose the new CSV.
   The file is checked first: it must have the same columns. If it doesn't, nothing changes and the reason is shown.
3. Set **Snapshot time** to `2026-11-16 14:00`. The default is one hour after the latest Emergency waiting-time reading.
4. The page lists what changed: new, changed and cleared issues, and the key figures. Proposals the new data no longer supports are withdrawn.
   Decisions already made (approved, done, rejected) are kept. **Restore original dataset** puts the original files back.

## Screens and roles

The screens are Overview, Patient Triage, Issues, Actions, Beds & Discharges, Diagnostics & Staff, Complaints and Data.
Nine staff roles each see only their own screens and approve only their own kind of action. The server checks this too.
Patient Triage starts with the waiting patients from the data:
- The two ICU patients are ranked by their recorded P1/P2.
- The nine ED patients have no recorded priority, so a nurse or doctor assesses them with a written reason.
- New patients can also be registered, with a live assessment as you type.

## Tests
```
cd server
npm test                                          # agent on the dataset + update scenarios, and triage rules (32 tests)
BASE_URL=http://localhost:4000 npm run test:api   # 38 end-to-end API checks, including file uploads (server running)
```

## Project layout
```
server/  agent.js (Observe → Explain) · dataset.js (CSV files and checks) · store.js (MongoDB, re-runs, actions)
         index.js (API, roles, audit log) · auth.js · assess.js / design-triage.js / triage.js (patient triage)
         models.js · seed.js · data/original/*.csv · test/
client/  src/pages (Overview, Triage, Issues, Actions, Beds, Diag, Complaints, Data) · src/ui.jsx · src/styles.css
```

## Deploy
MongoDB Atlas (`MONGO_URI`) + Render Blueprint (`render.yaml`). GitHub Actions runs both test suites against a real MongoDB and builds the client and the Docker image.
