# Demo script

About 12 minutes. It follows one student from finding an event to holding a verifiable certificate, then shows what staff see. `e2e/demo.spec.ts` runs these same steps against freshly seeded data, so `npx playwright test e2e/demo.spec.ts --project=desktop` is a full rehearsal.

## Before you start

1. Within an hour or two of the demo, refresh the data so the dates are right: **Robotics Workshop** is only "happening now" for 5 hours after seeding. It replaces the earlier demo data, including anything done in a rehearsal:

   ```bash
   npm run db:seed:demo
   ```

2. Open three separate browser sessions (normal, private window, another browser), one per role. Log in ahead of time.
3. For the live QR scan, the coordinator's phone must reach the deployed https site, because browsers only offer the camera on https or localhost. If you demo on localhost, use the code-entry fallback in step 4, or scan on the laptop's webcam.
4. Keep the terminal running `npm run dev` visible if there's no `RESEND_API_KEY`: emails are printed there.

| Role        | Email                                 | Password             |
| ----------- | ------------------------------------- | -------------------- |
| Student     | `student01@demo.campusevents.test`    | `demo-password-2026` |
| Second      | `student02@demo.campusevents.test`    | `demo-password-2026` |
| Coordinator | `coordinator1@demo.campusevents.test` | `demo-password-2026` |
| Admin       | `admin@demo.campusevents.test`        | `demo-password-2026` |

On a deployed site the password is the `DEMO_PASSWORD` you set when seeding.

## The script

### 1. Finding an event (visitor, 1 minute)

- Open `/events`, signed out. Filter by **Sports**, then search for "carrom".
- Open **Final-Year Project Expo**. Say: dates, venue and who can join are all public, but registering needs an account.

### 2. A student's rules are explained, not hidden (student 1, 1 minute)

- Log in as student 1 and open **Final-Year Project Expo** again. The button is disabled and says why: they're in third year. _Clear disabled-button reasons were a requirement._
- Open **Campus Clean-Up Drive**: disabled, with the date registration opens.

### 3. Seats, the waitlist and promotion (students 1 and 2, 2 minutes)

- Student 1 opens **Web Design Contest**, which shows 1 of 10 seats left, and clicks **Register**. It confirms at once.
- Student 2 opens the same event and clicks **Join the waitlist**.
- Student 1 clicks **Cancel registration** and confirms. Refresh student 2's page: they now hold the seat, with a ticket and a bell notification.
- Say: every seat change locks the event's row, and a test fires 50 parallel registrations at 10 seats and gets exactly 10.

### 4. Ticket and check-in (student 1 and coordinator, 2 minutes)

- Student 1 registers for **Carrom Tournament** and clicks **Show ticket**.
- Coordinator opens **Check-in** and chooses Carrom Tournament. Scan the QR, or type the code under "Can't scan?". A green card shows the name, roll number and department, and the counter goes up.
- Scan the same ticket again: an amber card says who let them in and when. Two phones can't both admit one ticket.

### 5. A team registers (student 3, 1 minute)

- Log in as `student03@demo.campusevents.test`, open **Inter-Department Cricket Cup** and create a team. The page says how many more members need to accept before it holds a place.

### 6. During the event (coordinator, 2 minutes)

- Open **Robotics Workshop**, which is happening now. **Registrations** shows who is in, with filters. Export it as CSV: ticket codes are left out, and the export goes in the audit log.
- **Announcements**: send a message. Everyone registered gets an email and a bell notification. The earlier "Lab change" shows as history.

### 7. After the event (coordinator and student 1, 2 minutes)

- Coordinator opens **Chess Championship → Results**: winners, certificates issued, and the feedback average and comments without names.
- Student 1 opens **My events**. Under **Past**, download the **Merit certificate** and show the PDF.
- Open its QR, or `/certificates/verify` with its code, signed out. Anyone can check it. Then try a made-up code: "Not a valid certificate".
- Student 1 opens **Research Paper Presentation** and leaves a rating. It can only be sent once.

### 8. The whole college (admin, 1 minute)

- Admin opens **Reports**: events, registrations, attendance rate, by category and department.
- Open **Users**. Changing a role or deactivating someone signs them out everywhere, at once.

### 9. If asked about security

- As student 1, open `/manage/users`: a real HTTP 403 from the server, not a hidden link.
- Log out and enter a wrong password 11 times: "Too many attempts. Try again in 15 minutes." It counts per email and address, so one locked login doesn't stop a whole campus on shared Wi-Fi.

## If something goes wrong

| What happens                           | What to do                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| The camera won't start or scan         | Type the ticket code or search by name. It's the planned fallback and uses the same rules. |
| An email doesn't arrive                | Show the bell, which doesn't depend on email. Without a key, show the terminal.            |
| "Too many attempts" on a login         | You're locked for 15 minutes. Use another demo account, or re-run the demo seed.           |
| The data looks wrong after a rehearsal | Run `npm run db:seed:demo` again, then log in again: it recreates the accounts.            |
| The deployed site is down              | Run it locally: `docker compose up -d`, then `npm run dev`. The data is already seeded.    |
