# GatePass — Smart Event Access & Registration System

A secure, role-based event management platform designed to simplify event registration, digital pass management, and entry verification.

**Live Demo:** [GatePass Preview](gate-pass-88vd.vercel.app)  
**Demo Video:** [Demo Video Link](https://drive.google.com/file/d/1hFUnvj3_hZe6omg6iFfpZlqUQzDPRTMk/view?usp=sharing)

---

## 1. Problem Statement

Managing registrations and entry access for college events, workshops, seminars, and other gatherings can become difficult when processes rely on manual registration lists, paper passes, and disconnected spreadsheets.

These approaches can lead to:

- Time-consuming registration and verification.
- Duplicate registrations and unauthorized entry.
- Difficulty managing different access privileges.
- Inefficient pass retrieval and registration updates.
- Limited visibility into attendance and event participation.
- Security and accountability challenges when multiple organizers manage an event.

There is a need for a centralized, secure, and user-friendly system that streamlines event registration and verifies entry efficiently.

## 2. Proposed Solution

**GatePass** is a web-based event registration and access management system that connects attendees, VIP participants, and administrators through a unified platform.

It uses authenticated user accounts, role-based permissions, and a centralized database to manage event participation and access.

The platform is designed to help attendees register for events and manage their passes, while authorized administrators manage events and oversee entry verification. VIP users receive access according to their assigned permissions.

GatePass aims to reduce manual effort, improve access control, and provide a smoother event experience for both participants and organizers.

## 3. Key Features

### Authentication and Authorization
- Email-and-password authentication using Supabase Auth.
- Persistent authenticated sessions.
- Role-based access for Guest, VIP, and Admin users.
- Database-backed role assignment and authorization.
- Row Level Security (RLS) to protect sensitive data.

### Event Management
- Centralized event information and management.
- Support for event scheduling and registration workflows.
- Event visibility based on application permissions.
- Empty states when events are not available.

### Registration Management
- Authenticated event registration.
- Collection of relevant attendee information.
- Registration records linked to the authenticated user.
- Support for registration status and applicable editing deadlines.

### Digital Pass Management
- Centralized management of event passes.
- Pass revocation support, subject to authorization.
- Backend-controlled operations to protect pass ownership and validity.

### Entry Verification
- Scanner interface for event check-in.
- Backend-controlled pass verification.
- Prevention of unauthorized check-ins through server-side validation.

### Reliability and Security
- Explicit loading and error states.
- Protection against missing profile or event data.
- Server-side authorization for sensitive operations.
- Separation of public browser configuration from server-only secrets.

*Note: Individual workflows should be marked as fully operational only after successful end-to-end testing against the configured Supabase project.*

## 4. Tech Stack

| Category | Technology | Purpose |
|---|---|---|
| Frontend framework | React | Component-based user interface |
| Programming language | TypeScript | Type safety and maintainable code |
| Build tool | Vite | Development server and production builds |
| Styling | Project-configured CSS/styling system | Responsive interface and visual design |
| Backend platform | Supabase | Authentication, database, and backend services |
| Database | PostgreSQL | Persistent storage of users, events, registrations, and passes |
| Authentication | Supabase Auth | Secure email-and-password authentication |
| Database security | PostgreSQL RLS | Restricts database access according to policies |
| Server-side logic | Supabase Edge Functions / database RPCs | Handles privileged and sensitive operations |
| Package manager | pnpm | Dependency installation and project scripts |
| Deployment | Manus Preview / configured hosting | Hosting the web application |

*The exact styling library, scanner implementation, and deployment configuration should be confirmed against the repository before final submission.*

## 5. Tech Stack Justification

### React
React supports reusable UI components and interactive interfaces. It is suitable for dashboards, registration forms, event listings, and role-specific views.

### TypeScript
TypeScript provides static type checking, helping detect incorrect data assumptions and reducing runtime errors in a project that handles user identities, event records, and access permissions.

### Vite
Vite offers fast local development and efficient production builds, making it practical for rapid development and deployment.

### Supabase
Supabase provides managed authentication and PostgreSQL database services without requiring the team to build an entire authentication infrastructure from scratch. It also supports backend functions and access policies.

### PostgreSQL
A relational database is appropriate for connected entities such as users, events, registrations, passes, and check-ins. Constraints and transactions can help maintain data integrity.

### Supabase Auth
Using a dedicated authentication service provides session management and credential handling while keeping authentication separate from application-level role permissions.

### Row Level Security
RLS adds a database-level authorization layer. It helps prevent users from accessing or modifying records they are not permitted to access, even if frontend restrictions are bypassed.

### pnpm
pnpm provides efficient dependency management and reproducible project setup through the project's package manifest and lockfile.

### Overall Justification
The stack prioritizes deployability, maintainability, security, and development speed. It combines a modern frontend with managed backend infrastructure, allowing the team to focus on event workflows and user experience rather than rebuilding common infrastructure.

## 6. Architecture Overview

```text
User
  |
  v
React + TypeScript Frontend
  |
  v
Supabase Auth
  |
  v
Authenticated Session
  |
  v
Role/Profile Resolution
  |
  v
PostgreSQL + RLS
  |
  +--> Events
  +--> Registrations
  +--> Passes
  +--> Check-ins
  |
  v
Authorized Backend Functions
```

The frontend handles presentation and user interaction. Authentication establishes the user's identity, while database policies and trusted backend operations enforce permissions and protect sensitive workflows.

## 7. Setup and Usage

### Prerequisites

- Node.js compatible with the project dependencies.
- pnpm.
- A Supabase project.
- Git, if cloning the repository.

### Step 1: Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_PROJECT_DIRECTORY
```

Replace the placeholders with your actual repository URL and directory.

### Step 2: Install Dependencies

```bash
pnpm install
```

### Step 3: Configure Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Replace the placeholders with the credentials for the Supabase project intended for GatePass.

**Security notes:**
- Use only the public publishable/anon key in browser-side environment variables.
- Never expose a Supabase `service_role` key or secret key through a `VITE_` variable.
- Keep `.env.local` out of version control.
- `.env.example` is a template; it does not automatically configure the running application.

### Step 4: Initialize the Database

Apply the reviewed GatePass database migration to the intended Supabase project.

The migration should create all required tables, relationships, functions, triggers, and RLS policies expected by the application.

Verify that the schema is initialized before testing authentication and registration.

Do not run destructive reset commands against a project containing existing data.

### Step 5: Start the Development Server

```bash
pnpm dev
```

Open the local URL printed by Vite in your terminal.

### Step 6: Verify the Application

Run the available checks:

```bash
pnpm typecheck
pnpm run build
pnpm run auth:probe
```

Confirm that:

- Authentication succeeds with a valid account.
- The authenticated profile loads correctly.
- The correct role-specific dashboard appears.
- Authorized users can access their permitted features.
- Database operations respect RLS policies.
- Errors are displayed clearly rather than leaving a blank page.

### Step 7: Production Deployment

Build the frontend:

```bash
pnpm run build
```

Deploy the generated `dist/` directory to your configured hosting provider, with SPA fallback routing where required.

Configure the same public Supabase environment variables in the hosting provider's production environment. Apply the database migration to the intended production Supabase project before testing the deployed application.

## 8. How to Use GatePass

### Guest
1. Create an account or sign in.
2. Browse available events.
3. Register for an event when registration is available.
4. Access and manage eligible registrations and passes.

### VIP
1. Sign in using an account assigned the VIP role by an authorized administrator.
2. View the features and events permitted by the application's VIP policies.
3. Use the available registration and pass workflows.

### Admin
1. Sign in using an authorized administrator account.
2. Access event management features.
3. Manage event participation and registration workflows.
4. Use the authorized scanner/check-in functionality.
5. Review relevant event and attendance information where implemented.

Actual permissions depend on the backend authorization policies configured for each role.

## 9. Security Considerations

GatePass is designed around the following security principles:

- **Authentication is not authorization:** signing in does not automatically grant administrative privileges.
- **Server-side ownership validation:** sensitive operations should derive user identity from the authenticated session.
- **Role integrity:** public signup must not allow users to select privileged roles.
- **Database protection:** RLS policies must enforce access restrictions.
- **Secret management:** server-only keys must never be shipped to the browser.
- **Pass verification:** entry validation must be performed by trusted backend logic rather than trusting client-supplied ownership or status.

## 10. Team Members

| Name |
|---|
| [Pranjal Gupta] |
| [Aryan Rohada] |
| [Devendra Sahare] |


Replace the sample entries with the actual team members, roles, and contributions.

## 11. Project Links

- **Demo Video:** [](https://drive.google.com/file/d/1hFUnvj3_hZe6omg6iFfpZlqUQzDPRTMk/view?usp=sharing)
- **Source Code:** [](https://github.com/krishry/Gate_Pass.git)

*The current preview URL is a Manus Preview link and may not be a permanent production deployment.*

## 12. Future Enhancements

Potential improvements include:

- QR-code-based digital passes and faster check-in.
- Attendance analytics and event reports.
- Email confirmations and registration reminders.
- Waitlists and registration capacity management.
- Exportable attendee lists.
- Improved mobile scanner experience.
- Automated testing and monitoring.
- Accessibility and performance improvements.

These are proposed enhancements, not claims that they are already implemented.

## 13. Conclusion

GatePass aims to make event registration and entry management more organized, secure, and convenient. By combining a modern frontend with managed authentication, relational data storage, and backend-enforced authorization, it provides a foundation for a practical event access platform.

The project emphasizes working functionality, usability, deployability, and security — essential qualities for a reliable real-world application.

---

**Built with React, TypeScript, Vite, and Supabase.**
