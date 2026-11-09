# Try it yourself

A guided first run of the whole app, about 30 minutes. You'll play a student, a coordinator and an admin, and tick things off as you go. Everything here is made-up data on your own computer, so you can't break anything: `npm run db:seed:demo` puts it all back.

For a short version to present to others, use [DEMO.md](DEMO.md).

## 1. Start it (5 minutes)

Open Docker Desktop and wait until it says it's running. Then, in a terminal in this folder:

```bash
docker compose up -d
```

```bash
npm run setup
```

```bash
npm run dev
```

Open http://localhost:3000. Keep this terminal visible: **emails appear there** instead of being sent, including the links you'll need.

If the demo data is more than a few hours old, its dates have drifted: **Robotics Workshop** is only "happening now" for 5 hours after seeding, and **Carrom Tournament** only takes registrations for 18. Refresh it in a second terminal, which also undoes anything you tried earlier:

```bash
npm run db:seed:demo
```

## 2. Be three people at once

Logging in and out gets tiring, so open three separate sessions: a normal window, a private window and another browser. Every demo account uses the password `demo-password-2026`.

| Who         | Email                                 | Use it for               |
| ----------- | ------------------------------------- | ------------------------ |
| Student     | `student01@demo.campusevents.test`    | Registering, tickets     |
| Student 2   | `student02@demo.campusevents.test`    | The waitlist             |
| Coordinator | `coordinator1@demo.campusevents.test` | Check-in, results        |
| Admin       | `admin@demo.campusevents.test`        | Creating events, reports |

Students go up to `student60`. Coordinator 1 runs Chess, Robotics, Carrom and Cricket; coordinators 2 and 3 run the others.

## 3. As a visitor (3 minutes)

Stay logged out.

- [ ] Open **Events**. You see the published events, but no **Alumni Career Talk**, because it's a draft.
- [ ] Search for `carrom`, then clear it and try a category filter. The list narrows each time.
- [ ] Click the **Past** tab and open **Chess Championship**. The winners are listed on the public page.
- [ ] Back on the **Upcoming** tab, open **Web Design Contest**. It says 1 of 10 seats left, and asks you to log in to register.
- [ ] Go to http://localhost:3000/manage/users. You're sent to the login page.

## 4. As a brand-new student (5 minutes)

This is the part that uses your own details. Use any made-up email.

- [ ] **Sign up** with a made-up name, email and roll number like `TEST001`.
- [ ] A banner asks you to verify your email. Open **Carrom Tournament**: **Register** is disabled and says why.
- [ ] Find the email in the terminal running `npm run dev`, and open its link.
- [ ] Open **Carrom Tournament** again and click **Register**. It confirms at once.
- [ ] Click **Show ticket**. There's a QR code and a code you can type.
- [ ] Check the terminal: a "you're confirmed" email was printed. Check the bell at the top too.

Keep this window open for section 6.

## 5. The rules, as student 1 and 2 (5 minutes)

Log in as student 1, and student 2 in another window.

- [ ] Student 1 opens **Final-Year Project Expo**. Register is disabled: it's for final-year CSE and IT, and they're in third year.
- [ ] Student 1 opens **Campus Clean-Up Drive**. Disabled, with the date registration opens.
- [ ] Student 1 registers for **Web Design Contest** and takes the last seat.
- [ ] Student 2 opens the same event. The button now says **Join the waitlist**. Click it.
- [ ] Student 1 clicks **Cancel registration** and confirms.
- [ ] Refresh student 2's window. They now hold the seat and have a ticket. The bell has the news.
- [ ] Student 1 opens **Inter-Department Cricket Cup**, creates a team, and invites student 2's roll number, `IT2602`. It says how many more need to accept.
- [ ] Student 2 opens **My events**, sees the invite, and accepts.

## 6. At the door, as the coordinator (5 minutes)

Log in as coordinator 1.

- [ ] Open **Check-in**, then **Carrom Tournament**. The counter shows who's in so far.
- [ ] Copy the ticket code from your new student's ticket page. Paste it under "Can't scan?" and click **Find**. A green card shows who they are, and the counter goes up.
- [ ] Do it again with the same code. An amber card warns they're already in, and says who let them in and when.
- [ ] Click **Undo** on a check-in, then check them in again by searching their name.
- [ ] **Try the camera** with **Scan tickets**: on a laptop, hold the ticket page on your phone up to the webcam. A phone browser only offers its camera on https, so this needs the deployed site.

## 7. Running an event (3 minutes)

Still as coordinator 1, open **My events to run**, then **Robotics Workshop**, which is happening now.

- [ ] **Registrations** lists 22 people. Filter by department, then export a CSV and open it. There are no ticket codes in it.
- [ ] **Announcements** shows an earlier "Lab change". Send a new one. The terminal prints the emails.
- [ ] Go back to **My events to run**. It lists only the four events coordinator 1 runs, not all of them. Log in as `coordinator2@demo.campusevents.test` in another session and it lists different ones.

## 8. After an event (4 minutes)

- [ ] Coordinator 1 opens **Chess Championship**, then **Results**: winners, certificates issued, and feedback without names.
- [ ] Student 1 opens **My events**, and under **Past** downloads the **Merit certificate**. Open the PDF: it has their name, place, the event and a QR code.
- [ ] Type the code printed under the QR into http://localhost:3000/certificates/verify. Try a made-up code as well. The QR itself points at the site's address, so a phone can only follow it once the site is deployed.
- [ ] Student 1 clicks **Give feedback** on **Research Paper Presentation** and sends a rating. The form doesn't come back: it's once only.

## 9. As the admin (4 minutes)

- [ ] **Reports** shows events, registrations and the attendance rate, by category and department.
- [ ] **Manage events → New event**: create one with dates in the future and publish it. Then find it logged out, on the **Events** page.
- [ ] Cancel that event. Anyone registered is told, and their ticket stops working.
- [ ] **Users**: change a student's role. If they're logged in elsewhere, they're signed out at once.
- [ ] **Departments**, **Categories** and **Venues**: add one of each.

## 10. Try to break it

- [ ] Log in as student 1 and go to http://localhost:3000/manage/users. You get a "no access" page.
- [ ] In a private window, enter a wrong password 11 times on one account. You're locked out for 15 minutes, while other accounts still work. Use an account you don't need, or run `npm run db:seed:demo` afterwards.
- [ ] As any student, open **Profile** and try to upload a text file renamed to `.jpg` as the photo. It's refused.
- [ ] Narrow your browser to phone width, or open the site on your phone if it's deployed. Nothing should scroll sideways.
- [ ] Use the sun icon to switch between light and dark.

Found something odd? Note the page, which account you were using and what you expected.

## What I couldn't test for you

These need your accounts or your hands, so they've never been run for real:

| Not yet tested                  | What it needs                                                       |
| ------------------------------- | ------------------------------------------------------------------- |
| Scanning with a real phone      | The site deployed on https, then section 6                          |
| Real emails and the inline QR   | A free Resend key in `.env` as `RESEND_API_KEY`, and a real address |
| Photo and poster uploads online | A free Cloudinary key in `.env` as `CLOUDINARY_URL`                 |
| Scheduled reminders on Vercel   | The site deployed, with `CRON_SECRET` set                           |
| Scanning a certificate's QR     | The site deployed on https, with `APP_URL` set                      |
| Google sign-in                  | Google keys and your college's email domain                         |
| A real screen reader            | NVDA is free on Windows, if you want to try                         |

## If something goes wrong

| What you see                           | What to do                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run setup` waits for the database | Docker Desktop isn't running. Start it, run `docker compose up -d`, and try again                                        |
| Docker Desktop won't start             | Quit it, rename `%LOCALAPPDATA%\Docker\run` to something else, and start it again. Never use "Reset to factory defaults" |
| Port 3000 is already in use            | Another `npm run dev` is running, so close it                                                                            |
| A demo login is refused                | Run `npm run db:seed:demo`, which recreates the accounts, then log in again                                              |
| "Too many attempts"                    | Wait 15 minutes, use another account, or run `npm run db:seed:demo`                                                      |
| An event isn't in the state described  | The dates drift by the hour. Run `npm run db:seed:demo`                                                                  |

## Automatic checks

To have the computer do all of this, close `npm run dev` first, then:

```bash
npm test
```

```bash
npm run test:integration
```

```bash
npm run test:e2e
```

The last one takes about 15 minutes, and opens no windows while it works.
