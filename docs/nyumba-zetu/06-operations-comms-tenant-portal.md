# Nyumba Zetu docs 06: Operations, Communications, Tenant Portal

## Summary (10 lines)
1. Covers 13 docs pages; 12 fetched, 1 failed (documents-and-templates, HTTP 429, not retried per instruction).
2. Service requests: 4 origins, one queue, Open > In Progress > Completed; costs must carry unit/block attribution to reach owner statements.
3. Amenities: facility + booking; fees snapshotted at booking; overstay/no-show enforced only if actual start/end recorded; billed to a dedicated service type.
4. Visitors: separate Console (/visitors) and Gate (/visitors/desk) screens; blacklist flag; on-site register.
5. Scheduled tasks: master switch + per-job switch (both default OFF outside prod), shadow mode, approval, org rotation with per-branch limits.
6. Forms: versioned questionnaire engine, single-use share links, reviewer Approve / Request Changes / Decline (limited release).
7. Reservations: short-stay nightly bookings, DB-enforced no-overlap, explicit status machine, folio with append-only reversal lines, separate payment posture.
8. Work/assignments: assignment roles (tenant/unit/branch scope) > entity assignments > My Work (generated items) > tasks > comments.
9. Sales pipeline: Leads then Opportunity stages Qualify > Viewing > Offer > Application > Closed; stops at application, never creates leases.
10. Communications/templates/notices/polls/portal: unified message ledger with status lifecycle, opt-out/contact-report system, versioned templates + audience-query broadcasts, notice board, polls, resident portal deriving access from unit associations.

## Source URLs (base https://www.nyumbazetu.com/docs/)
- guides/service-requests (OK)
- guides/amenities (OK)
- guides/visitors (OK)
- guides/scheduled-tasks (OK)
- guides/documents-and-templates (FAILED: proxy HTTP 429 rate limit, "do not fetch again")
- guides/forms (OK)
- guides/reservations (OK)
- guides/work-and-assignments (OK)
- guides/sales-pipeline (OK)
- guides/communications (OK)
- guides/message-templates (OK)
- guides/notices-and-polls (OK)
- guides/tenant-portal (OK)

Note: content was returned by WebFetch's summarising model, not raw HTML; treat exact wording as approximate. "Not specified in docs" is used where the docs are silent.

---

## 1. Service Requests
**Purpose:** Maintenance work lifecycle from report to closure, with cost tracking and recovery.

**Menu:** Operations > Service Requests > Add. Reports: /reports/service-request-reports. Views: grid and kanban (by status).

**Origins:** Tenant portal; staff logging (phone/in person); planned maintenance (asset maintenance schedules / scheduled tasks); inspection findings. All land in one queue.

### Entities & fields
| Field | Type | Req | Notes |
|---|---|---|---|
| Location | Unit/Block | Yes | Drives cost attribution and contractor destination |
| Reporter | Tenant or staff | Yes | For follow-up contact |
| Problem description | Text | Yes | Observations, not assumed causes |
| Category | Selection | Yes | Routes the work |
| Priority | Level | Yes | Sets service-level expectation (levels not specified in docs) |
| Evidence | Photo attachments | Listed with required fields | Settles scope disputes |
| Assignee | In-house staff or vendor | Yes (explicit, at triage) | |
| Due date | Date | Set at triage | Aligned to priority |
| Notes | Text | During work | Findings/actions |
| Cost entries | Parts and labour | During work | Linked to expenses |
| Vendor | Ref | Optional | |
| Before/after photos | Files | Optional | |
| Resolution note | Text | At closure | |

### Flow
1. Log request (Operations > Service Requests > Add) or receive from portal/schedule/inspection.
2. Triage: validate legitimacy and location.
3. Assign to staff or vendor; set due date by priority; contact reporter.
4. Work: status Open > In Progress; record notes, costs, vendor, photos.
5. Close: confirm completion (photos, sign-off, tenant confirmation, not contractor claim alone); record final cost; notify reporter; set final status with resolution note.

### Rules
- Unassigned = unowned; filter for orphans.
- Expense without unit/block attribution never reaches an owner statement (cost stays with the manager).
- Costs flow to property cost reporting, owner statements (if owner bears), and tenant invoice lines (if lease permits).
- Closing without notifying reporter tends to cause a duplicate request.
- Reports: outstanding by age/priority, unit workload, category mix, completion time vs commitments.

### States
Open > In Progress > Completed ("typical progression"). Full list not specified in docs.

### Permissions
Not specified in docs.

### Dependencies
Assets (maintenance schedules), Scheduled Tasks, Expenses, Vendors, Tenant Portal, Communications; Work items (assignment creates work item).

### Open questions
Priority levels and SLA values; category list for staff (portal list in section 13); cancelled/rejected/on-hold states; approval of costs; exact tenant recharge mechanics; notification triggers; roles.

---

## 2. Amenities and Bookings
**Purpose:** Shared facilities (clubhouse, gym, pool, function room, guest parking) with resident bookings, fees and penalties.

**Menu:** Operations > Amenities & Bookings (/amenities).

### Amenity fields
| Field | Type | Notes |
|---|---|---|
| Name | text | |
| Code | text | Stable id for reports |
| Description | text | Optional |
| Who may use | policy | All residents / residents in good standing / specific blocks |
| Require booking | bool | Prevents double-booking on high-demand amenities |
| Guests allowed | bool | |
| Maximum guests | number | Cap per booking |
| Guest fee | currency | Per guest; set explicitly even if 0 |
| Overstay fee | currency | If actual use exceeds booked window |
| No-show penalty | currency | |
| Appearance | optional | Display in listings |
| Status | Active/Inactive | Deactivate, never delete (keeps history) |

### Booking fields
Amenity (ref, req); Context (resident/unit/lease, req); Starts, Ends (datetime, req); Actual start, Actual end (optional but needed for fees); Guests (number); Pricing snapshot (auto, immutable); Notes. Base fee field on amenity: not specified in docs (charge table mentions "base fee").

### Flow
1. Define amenity.
2. Create booking (staff, or resident via portal if enabled). Fees snapshotted automatically.
3. Staff record actual start/end.
4. Charges: within window = base fee; beyond end = overstay fee; never appeared = no-show penalty; guests = guest fee x count (capped at max).
5. Charges appear as invoice lines on the resident's lease, under a dedicated amenity service type.
6. Weekly review of upcoming bookings; reconcile bookings/fees vs invoiced charges.

### Rules
Fee changes never retroactive (snapshot). Without actual times, overstay/no-show cannot be enforced. Recommended: separate amenity service type, not generic service charge. Portal bookings share one list with staff bookings and obey eligibility/guest limits.

### States
Amenity: Active/Inactive. Booking status states: not specified in docs.

### Permissions / notifications / approvals
Not specified in docs (messaging examples elsewhere mention amenity confirmations as a Communications source).

### Dependencies
Invoices & Payments, Chart of Accounts (service type), Tenant Portal, Visitors, Service Requests.

### Open questions
Booking statuses and cancellation, base fee location, conflict detection logic, how no-show is recorded, availability rules/hours, deposit handling, approval, roles.

---

## 3. Visitors
**Purpose:** Visitor register and gate security control.

### Screens
| Screen | Route | Users | Function |
|---|---|---|---|
| Console | /visitors | Managers | Dashboard, visits list, visitor directory, approvals, watchlist, incidents, visit types catalog |
| Gate | /visitors/desk | Barrier staff | Search, two lists, check-in/check-out |

### Visitor record fields (types/required not specified in docs)
First name, last name, date of birth, company, address, email; host name, unit, block; expected arrival/departure; actual arrival/departure; duration on site (hours); check-in notes, check-out notes; status including blacklist.

### Flow
1. (Optional) Resident pre-registers visitor with expected times.
2. Check in at gate: record arrival and notes; may call host to verify; blacklist hit flagged on registration attempt.
3. On site: register shows current occupants with elapsed hours.
4. Check out: record departure and notes.
5. End of shift: reconcile open check-ins.

### Rules
Gate screen deliberately separate from console. Blacklist: document reasons, review periodically, define escalation path; verify against ID documents (name variations bypass). Collect only what policy needs; restrict by permission; retention per policy. Reports: who was on site in a period, frequency by visitor/host, busiest units, check-out compliance.

### States
Visit: expected/on-site/checked-out implied; blacklist status. Formal list not specified in docs.

### Permissions
A dedicated "Visitors" permission set; role mapping not specified.

### Dependencies
Residents (host contact), Amenities (guests), Communications (visitor notifications listed as an Operations source).

### Open questions
Approvals workflow mechanics, visit types fields, incident fields, blacklist removal/appeal, notifications, field validations, retention periods.

---

## 4. Scheduled Tasks
**Purpose:** Monitor/control background jobs. Operations > Scheduled Tasks (/schedules).

### Schedule record
| Section | Fields |
|---|---|
| Identity | Name, job name, job type |
| Basics | Recurrence rule, Anchor (offsets same-cadence jobs), Next run, Priority (not specified) |
| Approval | Approval status, approval request, approved by, approved at |
| Execution | Execution ID, last status (Success/Failure/Never run), started/ended, duration, result, error message |
| Metadata | Raw config (format not specified) |

### Actions
Execute now (confirm; on financial jobs performs real transactions immediately, verify branch and period); Pause (stop future runs); Cancel job (permanent, confirm).

### Rules
- Two switches must both be ON: master scheduler (environment; default OFF in non-prod) and per-job (default OFF for new jobs).
- Shadow mode: money-touching and resident-contacting engines first compute and stage actions for human confirmation.
- Fairness: large populations processed organisation by organisation, with per-branch limits, so big branches cannot starve others.
- Some schedules need approval before activation (request, approver, timestamp recorded).
- Next run in the past = paused/disabled scheduler.

### Jobs listed
Recurring invoice generation; allocation of unallocated payments; penalties; collections sweep; IoT polling and billing; owner statement generation; communication dispatch; integration submission (eTIMS queue).

### Diagnostics
Nothing runs = master OFF; one job idle = job switch/paused; ran but no change = shadow mode or no matching records; branch skipped = rotation; duplicates = manual run overlapped.

### Permissions/notifications
Not specified in docs.

### Open questions
Recurrence rule syntax, retry policy, who may approve, priority semantics, locking against overlaps, calendar feature link.

---

## 5. Documents and Templates
**NOT FETCHED** (HTTP 429, proxy told not to retry). Nothing documented here. Open: document types, templates, e-signature/acknowledgement links (the tenant portal page mentions secure single-use acknowledgement/signature email links), storage. Re-fetch later if needed.

---

## 6. Forms (limited release; formerly "Assessments" at /assessments until Aug 2026)
**Purpose:** Build questionnaires once; send as secure link or fill on a phone.

### Concepts
Form (named questionnaire); Version (published frozen revision); Response (one completed instance against a subject); Subject (prospective tenant or lease); Share link (secure single-use URL).

### Routes
/forms (overview), /forms/<code>, /forms/templates (library), /forms/templates/new and /<id> (builder), /forms/links (shared), /forms/capture (officer completion), /forms/<id> (response + review), /form/<token> (public).

### Builder fields
Name, code (immutable), subject type (immutable), sections (each = one wizard step), questions, conditions ("Show only when", "Require only when"), reporting keys (optional). Question types: short text, long text, number, money (KES), date, single choice, dropdown, multi-select, yes/no, photo(s), signature, document upload, repeatable group.

### Share link fields
| Field | Notes |
|---|---|
| Recipient name | Required, shown on form |
| Phone or email | Optional; enables system send |
| Expiry | 7/14/30/90 days, default 14 |
Delivery: copy link manually, or "Send it for me" via communications queue (SMS/email). Link statuses: Not opened, Started, Completed, Withdrawn (Withdraw unavailable after completion).

### Flow
1. Build form; Save & publish (freezes version; later edits create new draft, old responses untouched).
2. Share (published only) or capture as officer.
3. Respondent: no login, logo page, step-by-step, autosave per step; expired/withdrawn/used links show generic closed message.
4. Officer capture: resume drafts, one step per screen, progress bar, final free-text catch-all; Submit validates completeness, jumps to first incomplete step; after submit read-only; "Open a correction" creates amended version.
5. Review: Approve (no outbound notification); Request Changes (reason required, shown to respondent, link reopens 7 days, same response); Decline (reason required, ends).

### Templates shipped
Tenant Application; Move-in Inspection; Move-out Inspection; Household Affordability Assessment.

### States
Form: Draft, Published (uninstalled returns to gallery). Response: draft (in progress), submitted (awaiting review), reviewed.

### Rules
Photo/signature/document/repeatable answers excluded from on-screen summaries (included in CSV). Summaries: Amounts (count, average, total) and Choice distribution, only for questions with reporting keys. Uninstall voids links, blocked if responses exist.

### Permissions
Share, export (CSV), uninstall need administrator role. Reviewer role not stated.

### Limitations
Share-link responses are counted but cannot yet be opened individually; response opening only via lease's capture list.

### Dependencies
Communications queue, leases, prospects; contrasts with Application Checklists (gate stages, store no values).

### Open questions
Reviewer role, validations per type, file limits, notification of reviewer decision beyond reasons.

---

## 7. Reservations (short-stay, Beta, org feature flag)
**Purpose:** Nightly bookings of furnished units alongside leases. Menu: Reservations (/reservations).

### Lease vs Reservation
Nightly vs monthly/annual; single folio at checkout vs recurring invoices; Guest vs Resident; payment posture vs arrears/statements. A unit cannot have a lease and a reservation overlapping.

### Booking fields
| Field | Notes |
|---|---|
| Unit | Picker lists all units incl. long-let; check Availability tab |
| Check-in / check-out | Check-out after check-in; min 1 night |
| Guest name (req), email, phone | Guest record, not linked to a lease |
| Rate plan | Read-only dropdown, set at onboarding |
| Channel | Direct, Airbnb, Booking.com, Expedia, VRBO, agent, corporate, other |
| Nightly rate | Required |
| Cleaning fee | Optional |
| Tax | % or fixed (toggle) |
| Discount | % or fixed (toggle) |
| Deposit | Optional |
| Initial status | Inquiry, Reserved or Confirmed; folio created with it |
| Turnover status | Clean, Dirty, In progress, Inspected, Out of service (manual field only) |

### Folio formula
```
nights = max(1, out - in)
room = nights * rate
discount_base = room + cleaning
discount = pct ? pct*discount_base : entered
tax_base = discount_base - discount
tax = pct ? pct*tax_base : entered
subtotal = room + cleaning + tax - discount
balance_due = subtotal - deposit
```
Discount resolves before tax; computed in whole cents; preview equals server.

### Status machine
Inquiry > Reserved, Cancelled. Reserved > Confirmed, Cancelled. Confirmed > Checked in, Cancelled, No-show. Checked in > In house, Checked out. In house > Checked out. Checked out > Completed, Refunded. Cancelled > Refunded. No-show > Refunded. Completed, Refunded terminal. In house optional; no cancel after arrival; corrections via folio reversals.

### Folio
States: Open, Closed, Voided (latter two reject entries). Line types: Room, Cleaning, Tax, Deposit (positive), Discount (negative), Damage, Incidental, Commission (positive), Adjustment (either). No edit/delete; reverse a line once; original and reversal both visible.

### Payment posture (independent of status)
Unpaid, Deposit received, Partially paid, Paid, Overpaid, Refunded.

### Rules
Overlap rejected by database constraint across every entry path.

### Not implemented (per docs)
Editing bookings (cancel and rebook); channel sync; commission reconciliation; owner payouts from stays; eTIMS on folios; guest messaging; dedicated reports; housekeeping workflow.

### Permissions
Not specified (points to roles-and-permissions guide). Webhooks: see webhooks overview (not detailed).

### Open questions
How payments are recorded on folio, deposit refund flow, rate plan structure, tax config.

---

## 8. Work and Assignments
**Purpose:** Route generated work to responsible officers.

### Layer 1: Assignment roles
Name (req), Scope (req: tenant/unit/branch), Status (available/unavailable). Changing scope does not re-scope existing assignments. Different from user (permission) roles.

### Layer 2: Entity assignments
Role (must match entity type), Entity (tenant/unit/branch), Officer (any active user, not necessarily admin), Period (open-ended or end-dated). Unassigned entities still generate work but appear in no queue; ended assignments stop routing, keep history; branch-level covers portfolio, tenant/unit for exceptions.

### Layer 3: My Work (Operations > My Work, /work-items)
Shows directly assigned plus role-routed items. Columns: Item (collection case/service request/task), Entity, Role, Due, Status (Open, in progress, done). Items are generated, not typed.

### Layer 4: Tasks
Title and description, Assignee, Due date, Priority, Status (open/in progress/complete) all required; related entity (tenant/unit/lease/case) optional but makes it findable.

### Layer 5: Comments
On tasks, collection cases, service requests, opportunities; visible to anyone with record access; permanent.

### Automatic work items
Collections cases; service request assignment; failed meter polls; expiring leases.

### Open questions
Permissions, notifications, reassignment, audit, bulk assignment, priority scale, transitions.

---

## 9. Sales Pipeline and Leads
**Menu:** Operations > Sales (/sales).

### Lead fields
| Field | Notes |
|---|---|
| Contact | name/phone/email |
| Source | campaign/listing/channel (ROI) |
| Interest | unit, unit type or portfolio |
| Status | New, contacted, qualified, disqualified |
| Owner | first-contact person |
One lead per person, not per unit.

### Opportunity
Fields: unit ref, expected value (not specified), stage, owner, loss reason (required on lost).
Stages: 1 Qualify (requirement, budget, timing; disqualify early) > 2 Viewing (schedule, record, link unit) > 3 Offer (rent, deposit, start date, concessions) > 4 Application (continues in Applications) > 5 Closed (Won = lease created, Lost = with reason).

### Rules
Pipeline stops at application submission and never creates leases; Applications does screening and lease creation. Follows assignment layer; follow-ups in owner's queue. Metrics: lead volume by source, qualified-to-won, stage age, loss reasons, wins by source. Pitfalls: stale open opps inflate value; duplicate leads; missing source.

### Open questions
Permissions, notifications, approvals, validations, automation, conversion lead-to-opportunity mechanics, how Closed-Won is recorded.

---

## 10. Communications
**Route:** Operations > Communications. Channels: SMS, email, push, WhatsApp, one ledger.

### Surfaces
Overview /communications/overview; Delivery Tracker /communications/tracker; Contact Reports /communications/contact-reports; Mailbox /mailbox; Chat /chat; Templates /message-templates (Beta); Notice Board /communications/notice-board; Polls /polls.

### Overview metrics
Messages sent (per message, so email+WhatsApp = 2); Confirmed delivered + rate; Didn't reach anyone + main cause; Replies. SMS stays "awaiting confirmation" permanently and is excluded from delivery rate.

### Channel configuration (Settings > Communication Channels)
Org-wide with per-property override; per channel Use / Do not use / Inherit; default fallback email + WhatsApp; per message-type channel exceptions. Password resets and welcomes are email/WhatsApp only (disabling both blocks resets; UI warns). Disallowed channels are hidden in the send dialog; messages via them recorded Skipped. Statements via SMS are Skipped.

### Scoped sends
Pre-selected rows lock scope (pickers hidden), review shows resolved count and flags excess, "Ignore my selection" widens after confirm.

### Message preferences page (public link in email footer, no sign-in)
Choices: not my number/email (blocks everything, including security messages); stop everything; stop only selected types. Categories: bills and statements; payment reminders; property notices and announcements. Applies per address+channel. Never blocked (unless wrong-number): password resets, OTPs, welcome, payment confirmations. Unclassified types default to property notice. Each choice raises a contact report.

### Contact reports
Arrive via STOP reply, free-text parsed for "wrong person"/"stop sending", preferences page, Gmail/Outlook unsubscribe. Messaging stops immediately; one auto-reply per report on same channel. Queue: contact, content, wait time (oldest first). After "I'll take this": correct contact supplied (replace, block old); remove (blocked, unreachable); right after all (resume, verify first); no working contact (remove, keep blocked); reported by mistake (resume, close). Markers shown on records: "Not sending WhatsApp and text message", "WhatsApp may not work" (retries continue); not in exports.

### Delivery tracker columns
Channel, direction, recipient/name, sender, subject/message, type/category, source type/id, status, attempts/max, scheduled/next run, sent at, response, batch no, sentiment. Resend Selected re-queues only failed/rejected/undelivered (about 1 minute); no "resend all".

### Status lifecycle
Pending/Staged/Queued; Processing; Sent (handed to provider); Delivered; Read/Viewed/Clicked; Undelivered/Failed/Rejected; Delayed/Paused; Skipped; Not required/Not tracked.

### Sources
Documents (invoice/receipt/statement), collections, promises, operations (service requests, visitors, amenities), broadcasts, system (approvals, job completion).

### Rules
Collection strategies carry "max contacts per week" across channels; multiple engines can harass, audit frequency. No messages = dispatch job off. Fix source data, not message.

### Permissions
Not specified in docs.

### Open questions
Retry counts/backoff, provider integrations, WhatsApp template approval, inbound parsing details, sentiment engine.

---

## 11. Message Templates and Broadcasts
**Routes:** /message-templates (+ /new, /:id/edit, /:id/versions, /:id/preview, /categories, /variables, /broadcasts).

### Template fields
Name, code, category, channel (SMS/email/WhatsApp/push), language (variants), content (subject, body with variables), version (draft/published), status (controls module access).

### Variables
Tenant name, amounts, due dates, unit, paybill, officer name, promise date, etc. Inserted via editor. Unresolved variable renders as blank.

### Flow (authoring)
1 Draft (SMS under 160 chars). 2 Insert variables. 3 Preview (shows rendered length; SMS 3+ parts fragmentation). 4 Send test (returns communication reference; check Tracker). 5 Publish (may require approval).

### Broadcasts
Template + audience (live query: residents, leases, owners, filters like block or minimum balance) + channel + schedule. Check recipient count, preview on real recipients, watch Tracker by batch. Only operator-initiated bulk messages; dunning and promise reminders belong in collection strategies for frequency caps.

### Categories
Group templates and filter what other modules see.

### Permissions/approval
Publish may need approval; edit vs publish permissions not specified.

### Open questions
Approval config, versioning rollback, language fallback, scheduling granularity.

---

## 12. Notices and Polls
### Notice board (/communications/notice-board)
1. Headline and message (live preview). 2. Audience: Residents, Staff, Everyone. 3. Visibility window start/end (outside window shows to nobody). 4. Property scope (required). 5. Toggles: "Show it", "Pin to the top". Console: counts (showing now, scheduled, hidden/finished), filter by status/audience, search, list/card, read count per notice. Retire by end date or toggle off. Residents see live notices as a banner on sign-in and in the portal; managers see counts only of live notices.

### Polls (/polls)
Question (single), options, audience, period (explicit open/close), results. Residents vote in the portal; results shown after close; may publish results as a notice. A poll is advisory, not governance.

### Permissions
Separate permission sets for notice publishing and polls admin.

### Rules/issues
Pair notice with broadcast (published is not pushed). Outdated notices linger if toggle not turned off.

### Open questions
Resident notification on publish, approvals, edit/delete after publish, bulk ops, one vote per resident enforcement, anonymity, quorum.

---

## 13. Tenant Portal (/tenant-portal)
**Purpose:** Resident-facing view of units, money, requests; all actions write to operator records.

### Sections
| Section | Detail |
|---|---|
| Home | Balance due, recent activity, quick actions |
| Pay | Pay to operator-exposed bank accounts; M-Pesa STK prompt to a handset the resident enters; attribution by unit not number; rate limits per 10 minutes (distinct off-record numbers per unit; distinct units per handset); all attempts logged |
| Statement/invoices | Tapping a line shows how a payment was applied; shows invoices, payments, credits, adjustments, refunds with balance effect |
| Requests | Category + subcategory + description required, photos optional; lands in operator queue |
| Documents | Shared by operator plus resident uploads |
| Profile | Personal details, phone (drives SMS), email (needed for access), emergency contacts, ID verification, notification preferences |
| Readings | Submit meter readings where property uses resident-submitted readings |
| Switch unit | For multi-unit residents |

Request categories: Plumbing (leak, blocked drain, no hot water), Electrical (outage, lighting), HVAC (no cooling), Appliances (fridge), Doors, Cleaning, Pest, Noise, Safety concerns, Inspections, General.

### Access flow
1. Resident record has valid email and phone. 2. Unit associations current (end-date stale ones). 3. Invite. 4. Confirm sign-in. Access derives from unit associations; two units means both visible. Single resident role implied.

### Rules
Payment is not a settled invoice until allocated. Residents never see operator queues, other residents, internal notes, approvals. Default channels: email and SMS from resident record.

### Public surfaces
/apply (lease application); secure single-use acknowledgement/signature links.

### Troubleshooting
Can't sign in: email/active status. Paid but balance shows: allocation. Old unit: association end date. No invoice: Tracker (sent is not delivered). Request ignored: queue/assignment. No statement: period/associations.

### Open questions
Invitation mechanics, password reset, session timeout, 2FA, upload limits, profile change approval, reading validation, receipts, failure handling, payment methods other than M-Pesa.

---

## Cross-cutting notes for RentRewards
- Generated work items plus assignment roles are a reusable routing core for collections, service requests, leases expiring.
- Unified outbound message ledger with source type/id and statuses is the backbone for notifications, opt-outs and audit.
- Snapshot-at-creation of fees, append-only reversal lines and DB constraints for overlap are patterns worth copying.
