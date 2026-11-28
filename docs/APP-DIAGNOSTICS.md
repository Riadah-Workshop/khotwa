# App diagnostics and app updates

For the system administrator only (the **Diagnostics** tab of the administrator console). Its purpose is to find problems
and fix them in the next release. It is not a monitoring tool for people.

## What it shows

| Card | What it answers |
| --- | --- |
| Server health | Is the database answering (and how fast)? Did every migration run (it names a missing table or column)? Are e-mail, the public address and file storage configured? Settings are shown as yes/no, never as values. |
| Problems reported | What went wrong on the website or in the app, how many times, how many different people, on which page, in which app version. A problem is counted once however often it happens; marking it solved hides it, and it reopens by itself if it comes back. |
| Phones and apps | For the cafeteria agent: is location allowed (without it arrivals are not recorded), is the camera allowed (without it he cannot scan), is the phone's battery saver on. For everyone in the app: notifications, and whether the installed app version is older than allowed. Also which app versions are in use. |
| App releases | The newest app version and the oldest one still allowed, per platform (see below). |
| Recent sign-ins | When each person signed in, their role, school and channel (website / Android / iOS). 180 days are kept. |

## What is collected, and what is not

A report says **what** went wrong and **where**: a script error, a failed request (HTTP 5xx), a screen that crashed. It never
holds what a person typed or saw, a position, an IP address, a device identifier or a name. Before it is stored the server
removes phone numbers, e-mail addresses, IP addresses, long ids and tokens from the message, and the host and query string
from addresses (`lib/app-report.ts`, tested in `scripts/test-app-version.mjs`).

* A phone's state is two things: which permissions are allowed, and the system version and model name.
* A browser is not recorded at all, except the cafeteria agent's, because his arrival alerts depend on its location permission.
* Problems older than 90 days, phones not heard from for 180 days and stamps older than 180 days are removed as new ones arrive.
* The list never holds more than 500 distinct problems; when full, a solved one goes first, then the one seen least often.

Not collected yet: **background location permission** and **battery saver** cannot be read from the web view. They show as
"unknown" (and raise no finding) until the app shell reports them.

## How the pages report

`app/native/health.tsx` (mounted on every page) listens for script errors and unhandled promises, and for requests of this
site that come back as a server error. `app/error.tsx` shows a way out when a screen crashes and reports it. At most 8
problems are sent per page load and the same one only once; nothing is sent while signed out. The phone's state is sent at
most every 12 hours, or at once when a permission is refused.

## App updates

The website updates every phone by itself the moment it is published: the app shell shows the live site. What a store has to
deliver is the shell itself, so the app asks `GET /api/app/version?platform=android&version=1.4.2` (public; the app's own
user-agent tag is preferred over the query). The answer is `current`, `available`, `required` or `unknown`:

* **available** — a slim bar at the top of the app: *Update* / *Later*.
* **required** — the installed version is older than the minimum: a full page asks for the update before anything else.
* The administrator sets *latest*, *oldest allowed*, a store (or download) link and a short note per platform in Diagnostics → App releases. Nothing is asked of anybody until a release is saved.
* In the Android app from Google Play the update downloads and installs inside the app. On iOS, or when the app was installed from a file, the link from the release is opened.

## Roles

| Endpoint | Who |
| --- | --- |
| `GET /api/app/version` | everybody (nothing private in the answer) |
| `POST /api/app/report` | every signed-in role, the read-only school manager included; never anonymous |
| `GET/POST /api/admin/diagnostics` | the system administrator only |
