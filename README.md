# 🏥 Sanjeevani Hospital Operations Agent

### Challenge 05 – The Blocked Bed | CYPHER 2026

## 📌 Problem Statement

Sanjeevani Multispeciality Hospital uses separate systems to manage beds, appointments, laboratory reports, discharges, staff schedules, and patient complaints. However, these systems do not clearly explain why the Emergency Department is overcrowded or why patients are waiting for beds when beds may be available in other wards.

This creates delays in patient care, discharge processes, diagnostic reports, and staff coordination.

## 💡 Proposed Solution

**Sanjeevani Hospital Operations Agent** is a web-based hospital operations management and decision-support system built using React, Express.js, and MongoDB.

It analyzes hospital operational data to identify bottlenecks, understand the reasons behind delays, prioritize issues, and recommend suitable actions for authorized hospital staff.

The system follows the workflow:

**Observe → Reason → Evaluate → Decide → Act → Explain**

## ✨ Key Features

- **Hospital Overview:** View important operational information and identify bottlenecks.
- **Patient Triage:** Assess and prioritize patients using recorded information and triage rules.
- **Bed Management:** Monitor bed availability and identify issues affecting patient admission.
- **Discharge Management:** Identify discharge delays caused by pending tasks and reports.
- **Diagnostic Monitoring:** Track overdue laboratory and diagnostic reports.
- **Staff Management:** Identify staffing shortages and workload imbalances.
- **Issue Detection:** Find operational problems and rank them according to urgency and impact.
- **Action Management:** Recommend actions for review and approval by authorized staff.
- **Complaint Management:** Connect patient complaints with operational issues.
- **Data Updates:** Upload updated CSV datasets and recalculate operational findings.
- **Role-Based Access:** Provide different permissions for different hospital staff roles.
- **Audit and Testing:** Maintain action records and test important system functions.

## 🛠️ Technologies Used

| Component | Technology |
|---|---|
| Frontend | React.js |
| Development Server | Vite |
| Backend | Node.js and Express.js |
| Database | MongoDB |
| Database Integration | Mongoose |
| Data Processing | CSV datasets and JavaScript |
| Testing | Node.js test runner and API smoke tests |
| Containerization | Docker and Docker Compose |
| Deployment Configuration | Render |
| Version Control | Git and GitHub |

## 🏗️ System Architecture

1. **Data Layer:** Stores hospital operational data, including beds, admissions, appointments, staff, diagnostics, discharges, and feedback.
2. **Backend Layer:** Processes data, identifies bottlenecks, applies triage rules, and generates recommendations.
3. **Database Layer:** Uses MongoDB to store and manage application data.
4. **Frontend Layer:** Displays dashboards, patient triage, issues, beds, diagnostics, complaints, and proposed actions.
5. **Decision-Support Layer:** Helps authorized hospital staff review evidence and approve appropriate actions.

## 📂 Project Structure

```text
sanjeevani-ops/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── ui.jsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── data/
│   │   └── original/
│   ├── test/
│   ├── agent.js
│   ├── index.js
│   ├── models.js
│   ├── store.js
│   ├── triage.js
│   ├── seed.js
│   ├── package.json
│   └── .env.example
├── .github/
│   └── workflows/
├── Dockerfile
├── docker-compose.yml
├── render.yaml
└── README.md
```

## ⚙️ Installation and Setup

### Prerequisites

Install the following tools:

- Node.js (version 20 recommended)
- npm
- MongoDB, or Docker Desktop with Docker Compose
- Git (optional for local development)

### Option 1: Run Using Docker

1. Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/sanjeevani-hospital-ops.git
```

2. Open the project folder:

```bash
cd sanjeevani-hospital-ops
```

3. Start the application:

```bash
docker compose up --build
```

4. Open the application in your browser:

```text
http://localhost:4000
```

Replace `YOUR-USERNAME` with your GitHub username.

### Option 2: Run Locally Using VS Code

**Step 1: Start MongoDB**

Make sure your MongoDB server is running.

**Step 2: Configure the backend**

Open a terminal in VS Code:

```bash
cd server
npm install
```

Copy `.env.example` to `.env` and configure the MongoDB connection and authentication secret.

**Step 3: Load the dataset**

```bash
npm run seed
```

**Step 4: Start the backend**

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:4000
```

**Step 5: Start the frontend**

Open a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the local URL displayed by Vite, usually:

```text
http://localhost:5173
```

### 🔐 Login

Use the application's login screen and provide the requested staff information and role.

Use only test or synthetic data while demonstrating the project.

## 🧪 Testing

Run the backend tests:

```bash
cd server
npm test
```

To run the API smoke tests, first ensure the backend is running, then execute:

```bash
npm run test:api
```

## 🚀 Future Enhancements

- Real-time bed and resource availability updates.
- Predictive analytics for patient waiting times.
- Improved coordination between departments.
- Notifications for delayed diagnostic reports and discharges.
- Enhanced operational dashboards and performance reports.
- Integration with authorized hospital information systems.
- Secure cloud deployment with appropriate access controls.

## 🔒 Safety and Privacy

This project is intended for operational decision support and demonstration purposes. Recommendations must be reviewed and approved by authorized hospital staff.

The system is not a substitute for clinical judgment and must not independently diagnose patients, prescribe treatment, move patients, or release beds.

The included datasets are intended for demonstration. Real patient information must not be uploaded to a public repository.

## 👥 Team

**Project Name:** Sanjeevani Hospital Operations Agent

**Hackathon Challenge:** The Blocked Bed

**Event:** CYPHER 2026

**Team Members:** Add your team members' names here.

## 📄 License

Add an appropriate open-source license if you intend to distribute this project publicly.

---

**Sanjeevani — Helping hospital teams understand operational bottlenecks and make better-informed decisions.**
