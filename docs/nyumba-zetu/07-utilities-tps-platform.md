# Nyumba Zetu docs 07: Utilities, IoT smart meters, TPS, platform operations

## Summary (10 lines)
1. Source: public Nyumba Zetu docs, fetched via WebFetch only. Many pages are thin process checklists, so "not specified in docs" appears often.
2. Utility billing runs in 6 stages: meter setup, tariffs, readings, consumption, billing run, pre-posting review of run items.
3. There are two surfaces: Utilities (`/utilities`, manual readings per unit/period) and Smart Meters/IoT (`/iot`, polling, consumption, tariffs, billing runs, valve control).
4. Arrears enforcement ladder: warn, warn again, disconnect, (payment), reconnect. It defaults to shadow mode, which stages actions for human confirmation.
5. TPS (Tenant Purchase Scheme) bills from an amortisation schedule generated once from contract terms. Each instalment becomes an ordinary invoice.
6. TPS ownership moves on principal paid, not total paid. Certificates require zero net loan balance, no open notices and no unresolved default.
7. Boma Yangu allocation reports are queued, sent and acknowledged, with Failed/Dead handling and a shadow mode. Only payments to Boma Yangu collection accounts generate them.
8. The platform layer covers an append-only Activity Log, Platform Health (rules, findings, snooze/waive), Data Retention (3-switch shadow-first sweeper) and a super-admin-only Admin Console.
9. Two pages failed with HTTP 429 and were not retried: iot-vendors-process and iot-billing-runs-process. Their sections are placeholders.
10. Nothing was invented. Where the docs are silent, the text says "not specified in docs". RentRewards hints appear only in section 20, labelled as suggestions.

## Source URLs (base https://www.nyumbazetu.com/docs/)
Fetched OK (17):
- guides/utilities-smart-meters
- guides/iot-smart-meters-setup-process
- guides/iot-tariffs-process
- guides/iot-meter-readings-process
- guides/iot-consumption-process
- guides/iot-billing-run-items-process
- guides/iot-valve-commands-process
- guides/iot-webhook-events-process
- guides/iot-poll-failures-process
- guides/tps/overview
- guides/tps/contracts-and-billing
- guides/tps/compliance-and-ownership
- guides/tps/boma-yangu-reports
- guides/activity-log
- guides/platform-health
- guides/data-retention
- guides/admin-console

FAILED (2, HTTP 429 rate limit, not retried per proxy instruction):
- guides/iot-vendors-process
- guides/iot-billing-runs-process

Note: the fetch tool summarises pages with a small model, so detail may be lossy. Pages that looked thin may have more on the live site.

---

# PART A. Utilities and IoT smart meters

## 1. Utilities and Smart Meters (overview)
**Purpose.** Manage the full cycle from meter readings to invoices. Two surfaces:
- Utilities (`/utilities`): "utility accounts and manual readings per unit and period".
- Smart Meters/IoT (`/iot`): "connected meters: polling, consumption, tariffs, billing runs, valve control".

**Entities & fields.** The docs name entities but no field lists. All field names, types, required/optional and defaults are not specified in docs.

| Entity | Known facts |
|---|---|
| Meter | Assigned to a unit; has a vendor and credentials; active/inactive; may be valve-controllable |
| Vendor | Credentials and integration health |
| Tariff | Rate structure converting consumption to charges |
| Reading | Quality classes: stale, missing, outlier (also late, estimated) |
| Consumption | Difference between sequential readings |
| Billing run | Converts period consumption to invoices |
| Billing run item | Per-unit result |
| Manual utility reading | Per unit/period; billed as an invoice line against a lease service type |

**Flow: 6-stage cycle.**
1. Meter setup: assign meters to units and configure vendor credentials.
2. Tariff configuration.
3. Readings collection: poll automatically or enter manually. Quality checks flag stale, missing and outlier values.
4. Consumption derivation: difference between sequential readings, with quality checks before invoicing.
5. Billing run execution: convert period consumption to invoices.
6. Pre-posting review: inspect per-unit items before and after posting, to catch tariff or meter assignment errors.

**Flow: manual utility billing (no smart meters).**
1. Record the current reading per unit/period.
2. Verify consumption against historical patterns.
3. Apply the tariff and bill as an invoice line against the lease service type.
- Bulk import: Admin → Bulk Upload, type "Utility Readings".

**IoT dashboard.** Health banner (polling, consumption, billing status). Workspace cards per cycle stage with guided playbooks. Shortcuts to work tabs. Monitoring tabs: Poll Failures, Webhook Events, Vendors, Valve Commands.

**Rules & validations.**
- Never run billing over a period with unresolved reading-quality issues.
- Arrears enforcement ladder: warn → warn again → disconnect → (payment) → reconnect.
  - Both warnings must be provably sent.
  - A grace period is required before disconnect.
  - Balance is re-verified immediately before the disconnect action.
  - Defaults to shadow mode (actions staged for human confirmation).
  - Real invoices are created for reconnection charges.
  - Collections can start IoT enforcement as a ladder step, but the IoT engine keeps its own state machine.

**Troubleshooting map.**

| Issue | Likely cause |
|---|---|
| No new readings | Vendor credentials, meter mapping, inactive meter |
| Impossible consumption | Outlier reading, meter replaced without baseline, wrong unit assignment |
| Empty billing run | No period consumption or missing tariff |
| Cross-unit billing | Meter-to-unit assignment error; fix the assignment and credit the prior invoice |
| Missed disconnection | Shadow mode; manual confirmation needed |

**States.** The enforcement ladder steps above. Otherwise not specified in docs.
**Permissions.** Not specified in docs (no role matrix for IoT).
**Dependencies.** Units, leases and service types, invoices, Collections, Bulk Upload.
**Open questions (not in docs).**
- Meter and reading field definitions.
- Tariff structure options.
- Consumption formula.
- Invoice line generation details.
- Billing run approval workflow.
- Notification and alert specs.
- Poll retry logic.
- Grace period length.
- Warning channels.

## 2. IoT Smart Meters Setup
**Purpose.** Register meters, assign them to units, and prepare them for live reading collection. Stores meter identity and assignment, links meters to units and vendors, and tracks active state and controllable capability.

**Entities & fields.** Types, required/optional and defaults are all not specified in docs.

| Field | Notes |
|---|---|
| Serial/meter number | Identity |
| Unit | Assignment |
| Branch | Assignment |
| Vendor profile | Link |
| Active/inactive | Status flag |
| Valve control supported | Capability, tested if supported |
| Meter label | A consistent naming standard is recommended |

**Flow.**
1. Create or update meter records (serial numbers).
2. Assign the meter to a unit and branch.
3. Attach the vendor profile.
4. Confirm active/inactive status.
5. Test control capability if valve control is supported.
6. After polling, verify the meter appears in Readings.

**Rules.** Use a consistent naming standard. Deactivate retired or replaced meters promptly. Recheck assignments after tenant or unit changes. Done when every active unit meter is mapped correctly, vendor and control settings are valid, and readings are collected reliably.
**States.** Active/inactive only.
**Permissions.** Not specified in docs.
**Dependencies.** Units, branches, vendors.
**Open questions.** Menu path, validations, defaults, automatic behaviours, permissions.

## 3. IoT Vendors (FAILED TO FETCH)
HTTP 429 on guides/iot-vendors-process. Nothing is documented here. Facts from other pages: vendors have credentials and integration health, and a Vendors tab exists (valid credentials are a prerequisite for reading collection). Everything else is not specified in docs. Re-fetch later if needed.

## 4. IoT Tariffs
**Purpose.** Manage pricing rules applied during bill generation. Stores pricing rules and effective dates, supports updates without rewriting historical bills, and ensures billing runs apply the expected charges.

**Entities & fields.** Tariff record with rates and effective dates, optionally linked to meter groups. Field definitions are not specified in docs.

**Flow.**
1. Open the Tariffs tab.
2. Create or review tariff records for the target billing periods.
3. Validate effective dates (no incorrect overlaps).
4. Verify rates against approved pricing policy.
5. Link tariffs to meter groups as needed.
6. Re-test billing outcomes after any rate change.

**Rules.**
- Tariff updates require documented approvals (a control point; mechanism not specified).
- Date ranges are tested before billing day.
- Historical tariffs are immutable after closure.
- Done when current-period tariffs are complete and approved, no conflicting windows remain, and billing results are predictable.

**States.** Not specified in docs (the text implies current vs historical/closed).
**Permissions.** Not specified in docs.
**Dependencies.** Meter groups, billing runs.
**Open questions.** Tariff types (flat, tiered, standing charge), currency and rounding, approval workflow, validations beyond date overlap.

## 5. IoT Meter Readings
**Purpose.** Collect, review and correct smart meter readings before billing.

**Entities & fields.** Reading with a "Reading At" timestamp and a "Quality" attribute (late, estimated, outlier surfaced via filter). Other fields are not specified in docs.

**Prerequisites.** The correct property/branch context is selected, meters are active and assigned, and vendor credentials are valid.

**Flow.**
1. Open Readings.
2. Click "Start Polling" to fetch the latest readings from vendors.
3. Sort by "Reading At" to find stale meters. Filter by "Quality" for late, estimated or outlier readings.
4. Fix meter assignment or vendor settings, then re-poll and confirm quality normalises.

**Rules.**

| Issue | Action |
|---|---|
| No new readings | Check vendor account, meter mapping, active status |
| Outlier | Compare with history; confirm meter/unit mapping |
| Repeated late readings | Escalate to vendor support; track in monitoring tabs |

Done when all required meters have current readings, quality issues are resolved or triaged, and the team can proceed to consumption.
**States.** Quality values only (late, estimated, outlier, normal).
**Permissions, notifications.** Not specified in docs.
**Dependencies.** Preceding step: Tariffs. Following step: Consumption. Also Vendors and Poll Failures.
**Open questions.** Manual correction mechanics, outlier thresholds, polling schedule (automatic vs manual).

## 6. IoT Consumption
**Purpose.** Convert readings into billable usage per meter before billing runs. It calculates usage between start and end dates, flags missing boundaries and unusual changes, and produces the dataset billing runs use.

**Prerequisites.** Readings are complete for the period, tariffs are ready for the period, and branch and date range are confirmed.

**Flow.**
1. Open Consumption.
2. Click "Calculate Consumption".
3. Select the period and grain (daily or period).
4. Wait for the background job.
5. Review status, missing periods, and negative or extreme values.
6. Correct source data and rerun.

**Rules.** No unexplained negative consumption. No missing start/end readings for billed meters. Usage is reasonable against prior periods. Done when records are complete and trusted, exceptions are fixed or documented, and billing can proceed.
**States.** Job status exists (background job); values not specified in docs.
**Permissions, notifications, fields.** Not specified in docs.
**Dependencies.** Readings, Tariffs, Billing Runs.
**Open questions.** Rollover and meter-replacement handling, thresholds for "extreme", exact grain options.

## 7. IoT Billing Runs (FAILED TO FETCH)
HTTP 429 on guides/iot-billing-runs-process. Known from other pages: a billing run converts period consumption into invoices (empty run means no consumption or missing tariff). Per-unit results are viewable as Billing Run Items (section 8) and under Admin Console → Operations → IoT Billing Runs. Everything else is not specified in docs. Re-fetch later if needed.

## 8. IoT Billing Run Items
**Purpose.** Review, fix and approve meter-level results from each run. Lists each billed meter/unit result, highlights failed or skipped items, and supports targeted correction and rerun.

**Flow.**
1. Open the Billing Run Items tab.
2. Filter by status to isolate failed or disputed rows.
3. Open rows and compare with consumption and tariff context.
4. Fix upstream causes (meter mapping, consumption, tariff).
5. Rerun the affected items or run a corrected batch.
6. Confirm billable items are accurate and approved.

**Triage.**

| Issue | Fix |
|---|---|
| Missing consumption | Recompute for the period |
| Wrong rate | Validate tariff effective dates and meter linkage |
| Data mismatch | Reconfirm meter-to-unit assignment |

Done when failed items are resolved or escalated, final billable items are verified and approved, and finance posting needs minimal manual correction.
**States.** Failed, skipped and disputed are mentioned. Full state list and transitions are not specified in docs.
**Permissions, approvals, fields.** Not specified in docs ("approved" is mentioned but the process is undefined).
**Dependencies.** Billing runs, consumption, tariffs, meter setup, finance posting.

## 9. IoT Valve Commands
**Purpose.** Issue open/close commands to provider systems, track status and completion, and keep an audit history for support and compliance.

**Prerequisites.** Correct meter and unit targeted, reason documented, operator has control permission.

**Flow.**
1. Open Valve Commands.
2. Choose the meter and action (open or close).
3. Submit with a documented reason.
4. Monitor acknowledgement and completion.
5. Retry or escalate if pending.
6. Verify the service state matches intent.

**Rules.**
- Two-person verification for disconnections.
- Document customer communication before interruption.
- Escalate recurring failures to the vendor.
- Done when the command reaches a final successful state or is escalated, the service state matches intent, and the history is auditable.

**States.** "Pending", "acknowledged", "final successful state" are implied. The state machine is not specified in docs.
**Permissions.** Control permission required (name not specified).
**Dependencies.** Meters with valve capability, vendors, the enforcement ladder (section 1), audit trail.
**Open questions.** Command fields, retry policy, timeouts.

## 10. IoT Webhook Events
**Purpose.** Monitor inbound vendor events and respond to delivery failures. Shows event traffic and status, helps diagnose delivery or payload issues, and supports vendor integration troubleshooting.

**Flow.**
1. Open Webhook Events.
2. Filter by status and event type.
3. Review failed events and their response details.
4. Find patterns by vendor or event type.
5. Fix configuration or credentials.
6. Confirm the backlog clears.

**Escalate when.** Failures persist across multiple intervals, event volume from active meters drops unexpectedly, or there are repeated authentication/authorization errors. Done when event flow is normal, failure rates are tolerable, and root cause and action are documented.
**Fields, states, permissions, notifications.** Not specified in docs.
**Dependencies.** Vendors, Data Retention (webhook events are an aged table).

## 11. IoT Poll Failures
**Purpose.** Triage failed reading syncs and restore data flow. Lists failed attempts with error context, prioritises retries and fixes, and protects billing timelines.

**Flow.**
1. Open the Poll Failures tab.
2. Group or filter by reason and vendor.
3. Retry likely-transient failures.
4. Investigate persistent failures at meter or branch level.
5. Fix credentials, mapping, endpoint config or meter status.
6. Confirm fresh readings arrive.

**Priority.** (1) Failures blocking the current billing period. (2) Large meter groups with the same reason. (3) Repeated failures after retry. Done when the backlog is cleared or escalated, meters resume reporting, and billing-critical meters have no blockers.
**Fields, states, permissions, notifications.** Not specified in docs.
**Dependencies.** Readings, Vendors, Data Retention.

---

# PART B. Tenant Purchase Scheme (TPS)

## 12. TPS Overview
**Purpose.** A TPS contract is an agreement under which a resident buys the occupied unit over time, paying instalments of principal and interest instead of rent. Module label in the UI: "Ownership Plans".

**Entities & fields (contract commercial terms).**

| Field | Type | Req/Opt |
|---|---|---|
| Loan amount (financed price) | Currency | Required |
| Deposit amount (reduces financed amount) | Currency | Optional |
| Interest rate (on outstanding principal) | Percentage | Required |
| Months (term) | Integer | Required |
| Start date / first due | Date | Required |
| Furniture (financed component) | Currency | Optional |
| Escrow per month | Currency | Optional |
| Original net loan | Currency | Calculated |
| Principal paid to date | Currency | Calculated |
| Net loan balance | Currency | Calculated |

The required/optional markings come from the summary of the page. Validations and defaults are not specified in docs.

**Module destinations.** Overview (dashboard); Contracts; Amortisation Schedule; Schedules / Generation Runs / Monthly Balances; At-Risk Contracts; Compliance (Notices, Contract Default State, Compliance Jobs); Ownership (Progress, Certificates); Onboarding Lobby.

**Flow: onboarding (Onboarding Lobby).**
1. Beneficiary enters a queue with priority tiers and SLA-based routing.
2. Onboarding and outreach officers are assigned.
3. Household and income questionnaires are completed via the generic Forms engine (not a bespoke TPS form).
4. Required documents are uploaded.
5. A verification gate is passed.
6. The case is submitted for review.
7. The application becomes a TPS contract on activation (Lease applications flow).
8. The dashboard shows pipeline state, SLA remaining per case, and a "bottleneck detected" flag.

**Rules.**
- TPS sits on a lease record, with a unit and a resident.
- Billing unit is principal + interest (+ optional escrow/fees) per instalment, not rent.
- Arrears are measured against the amortisation schedule, not invoices.
- Overpayment is not simply account credit. Prepayment treatment (shorten term, reduce instalments, or surplus) is a scheme policy decision.
- External programme reports (national housing platform) can run in shadow mode.

| Aspect | Rental | TPS |
|---|---|---|
| Terminal state | Lease ends, unit re-let | Ownership transfers |
| Failure state | Termination/eviction | Default/repossession |
| Compliance | Standard tenancy | Scheme-specific notices and defaults |

**States.** Lease statuses: Defaulted, Repossessed, Completed, plus the shared lease-status vocabulary (full list not fetched).
**Permissions.** Not specified in docs.
**Dependencies.** Leases, units, residents, Forms engine, Lease applications, Allocations, Boma Yangu.
**Open questions.** Contract creation steps, state transitions, default thresholds, certificate rules, approvals, notifications.

## 13. TPS Contracts and Billing
**Purpose.** Bill TPS contracts from an amortisation schedule, generated once from contract terms. "The schedule is the contract's promise."

**Entities & fields (schedule row per instalment).**

| Field | Type |
|---|---|
| Instalment (position) | Number |
| Due date | Date |
| Scheduled opening principal | Currency |
| Scheduled principal due | Currency |
| Scheduled interest due | Currency |
| Scheduled fees due | Currency |
| Scheduled escrow due | Currency |
| Scheduled total due | Currency |
| Scheduled closing principal | Currency |

**Flow: generation.** Menu path: Finance → TPS → Contracts / Amortisation Schedule / At-Risk Contracts.
1. Verify terms (loan, deposit, rate, term, start date). Wrong terms mean regenerate and correct invoices.
2. Generate the schedule (once per contract).
3. Review the first and last instalments and confirm closing principal is zero at term end. A non-zero value means the terms and schedule disagree.
4. Each period's instalment automatically becomes an invoice, settled and allocated like any rental invoice.

**Flow: at-risk triage** (Finance → TPS → At-Risk Contracts).
1. Sort by exposure (largest net loan balance and schedule shortfall).
2. Diagnose the cause: unallocated money, misallocated money, or a genuine payment problem. Resolve allocation first.
3. Assess the default state (see Compliance).
4. Record the outcome (notices, arrangements, commitments) on the record, not just in email.

**Rules.**
- Payment position: On schedule (cumulative principal matches schedule), Ahead (more principal than scheduled), Behind (arrears; triggers at-risk).
- Prepayment must be handled as an explicit policy decision. Naively pulling principal forward without re-amortising leaves the borrower paying too much interest.

**Problems.**

| Symptom | Cause / fix |
|---|---|
| Closing principal not zero | Rate or term changed after generation; regenerate |
| Arrears though paid | Unallocated or misallocated payment |
| No instalment invoices | Generation run failed or incomplete |
| Net loan not declining | Payments settling fees/interest only; audit allocation order |

**States.** Defaulted, Repossessed, Completed, plus shared lease statuses.
**Permissions.** Not specified in docs.
**Dependencies.** Allocations, invoices, Generation Runs (also in Admin Console → TPS Generation Runs, with correlation IDs), Compliance.
**Open questions.** Amortisation method (annuity vs flat), rounding, escrow calculation, fee rules, regeneration mechanics, Collections integration.

## 14. TPS Compliance and Ownership
**Purpose.** Run formal notices, default evaluation, and ownership progress and completion.

**Entities & fields.**

| Entity | Known content |
|---|---|
| Notice | Issuance details, recipients, dates, basis ("evidentiary spine"). It has legal weight. Verify contacts first and confirm delivery via the Delivery Tracker. |
| Contract Default State | Approaching default / at threshold / formally defaulted |
| Compliance Job | Automated run that evaluates contracts and updates default states; reports contracts examined and state changes |
| Progress | Principal paid vs original net loan, remaining balance, schedule position |
| Certificate | Completion certificate, auto-populated from contract data |

**Flow: completion.**
1. Certificate issuance needs: net loan balance zero, all instalments settled, no outstanding fees, no open notices, default state cleared.
2. The certificate is generated from contract data.
3. The contract moves to Completed.
4. The certificate, final statement and notice history are retained.

**Flow: default.** default → repossession, with notice history and the recorded default state as evidence. A legal register tracks matters, hearings, parties and costs.

**Rules.** Principal paid, not total paid, moves ownership (interest, fees and escrow do not reduce the purchase balance). Scheme review checklist:
1. Reconcile principal repaid to the ledger.
2. Every defaulted contract has notice records.
3. Completed contracts have certificates.
4. Compliance jobs are current (check run dates if states look stale).

**Menus.** Finance → TPS → Compliance → Notices / Contract Default State / Compliance Jobs; Finance → TPS → Ownership → Progress / Certificates.
**Permissions, approvals, notification triggers.** Not specified in docs. Retention for notices and certificates is not specified in docs.
**Dependencies.** Delivery Tracker, legal register, amortisation schedule, ledger.
**Open questions.** Default criteria and thresholds, notice types and templates, job schedule, state transitions.

## 15. Boma Yangu Reports
**Purpose.** Console at `/tps/allocation-reports`. Reports the payment split (principal, interest, other) back to the Boma Yangu API for payments received into a Boma Yangu collection account. Other accounts generate no report.

**Entities & fields.** Report fields are not specified in docs. Known data: contract reference, split figures, API-returned failure reason, status.

**Flow.**
1. A payment arrives; the pay-to account is identified as Boma Yangu.
2. The payment is allocated across the contract schedule.
3. The split is queued as a report to the API.
4. A background job submits queued reports and records outcomes.

**Flow: queue management.**
1. Filter by status, starting with Failed.
2. Open a report to read the API failure reason.
3. If figures are wrong, fix the allocation (not the report).
4. Use the retry button (resubmits as-is).
5. Treat Dead reports as data or integration problems.

**States.**

| Status | Meaning | Terminal |
|---|---|---|
| Queued | Awaiting next pass | No |
| Processing | Submitting now | No |
| Sent | Delivered, no ack | No |
| Acknowledged | API confirmed (only status proving records agree) | Yes, success |
| Failed | Submission failed; retry available | No |
| Dead | Retries exhausted | Yes, failure |

**Rules.**
- Boma Yangu deduplicates, so a retry cannot double-report.
- Shadow mode: reports are produced and recorded identically, but nothing is submitted.
- Prolonged Sent means a far-side problem; escalate rather than retry repeatedly.

**Troubleshooting.** No report means wrong account. All queued means shadow mode, or the scheduled job is not running (check Scheduled Tasks). Repeated failures on one contract usually mean a reference mismatch. Wrong figures mean fix the allocation, then retry.
**Permissions.** Not specified in docs.
**Dependencies.** Allocations, scheduled tasks, Admin Console → Integration Jobs.
**Open questions.** Retry count and backoff, API schema, notifications, retention.

---

# PART C. Platform operations

## 16. Activity Log (audit trail)
**Purpose.** Append-only audit trail at Admin → Activities (`/activities`). Records are never edited or deleted. Wrong entries get new correction events.

**Entities & fields.**

| Field | Notes |
|---|---|
| Actor | User name or job identifier (jobs are named, never anonymous) |
| Entity type and ID | The record changed |
| Action | The operation |
| Timestamp | When |
| Before/after values | Changed fields |
| Reason | Required for material changes (case holds, skipped staged actions, score overrides); stored with the event |

**Flow.**
1. Start from the record's own timeline for narrow questions.
2. Use the central log for cross-record investigation.
3. Compare before/after values, not just that a change happened.
4. Check the actor type (job vs user) to find the root cause category.

**Per-record timelines.** Invoices (lifecycle audit), payments (allocations, refunds), collection cases (events, interactions, promises), owner statements (generation and delivery), legal matters, approval requests (decision, decider, reason), schedules (execution history with errors).

**Investigation map.** Invoice amount changed: invoice timeline, then credit/debit note. Write-off: activity log plus approval record. Case closed: case timeline. Balance discrepancy: payment/allocation history including reversals. Setting changed: log filtered to settings. Scheduled run: Scheduled Tasks history.

**Rules.** It is not a backup, not reconciliation, and not editable.
**Permissions.** "Activity Logs permission set". Retention follows organisation policy (periods not specified in docs). The trail holds personal and financial data.
**Dependencies.** Roles and permissions, approvals, collections, Admin Console audit events.

## 17. Platform Health
**Purpose.** Scans for data problems that produce "quietly wrong numbers" (leases with no billing, units without owners, unallocated payments). Path: Super Admin → Platform Health (`/health`), with sub-pages `/health/overview`, `/health/findings`, `/health/finding/:id`, `/health/rules`, `/health/scans`.

**Entities & fields.**

| Finding field | Notes |
|---|---|
| Rule/code | Check source |
| Severity | Critical, high, or lower |
| Problem; Impact | Description and downstream effect |
| Affected record | Entity type and ID |
| Detection method | Evidence basis |
| Recommended action; Suggested next step | Guidance |
| Last detected | Timestamp of last scan confirmation |
| Status | Open, resolved, snoozed, waived |

**Rule classes.** Nightly (runs automatically) and On Demand (runs only when included in a started scan). The docs state that as of August 2026 all rules carry an explicit classification, after 26 of 44 were found scheduled but never run.

**Flow.**
1. Click "Run Health Scan". Choose full or targeted, optionally filtered by severity or rule codes. Progress is real-time and a run snapshot is kept.
2. Triage the issues queue (quick filters, sorting, optional columns, export).
3. Assess impact (not only severity).
4. Fix the underlying record.
5. Record the resolution type and notes (some need a reason).
6. Re-scan to confirm.

**Status actions.** Snooze Until (requires a date). Waive (requires a reason). A waived finding stops being reported but is still true.

**Cadence.** Weekly: clear new critical and high findings. Monthly: review snoozes. Before month-end: scan and clear. Quarterly: review waivers. Run a full scan after migrations, bulk imports and configuration changes.
**Health score.** A trend indicator on Overview; watch the week-on-week direction.
**Rules page.** Catalogue with codes, enabled severities, and drill-down. Rule execution failures are shown separately from "found nothing".
**New rules (Aug 2026).** Invoices with no billing party, duplicate people in an org, expense drift from source, ledger total vs receivables mismatch, structural drift in the property spine.
**Permissions.** Super Admin. Notifications are not specified in docs.
**Dependencies.** Activity Log, Scheduled Tasks.

## 18. Data Retention
**Purpose.** Age out rows from ever-growing tables (delivery logs, webhook events, poll failures, meter readings, audit streams) to keep storage bounded. Path: Administration → Data Retention (`/data-retention`).

**Entities & fields.**

| Policy field | Notes |
|---|---|
| Policy key | Stable identifier |
| Table | Target (docs say MySQL table) |
| Mode | Shadow or armed (effective after all switches) |
| Evaluated by sweeper | Boolean |
| Strategy | Delete rows, or Blank columns (null named columns, keep row) |
| Keep (days) | Older rows are in scope |
| Aged-on column | Date column |
| Columns blanked | For the blank strategy only |
| Extra filter | Additional predicate |
| Rows per statement | Chunk size |
| Max statements per sweep | Work ceiling |
| Swept / Result | Last run and outcome |

| Run field | Notes |
|---|---|
| Mode | Shadow or armed for that run |
| Result | Succeeded, failed, or refused |
| Rows in scope; rows removed | Removed is always 0 in shadow mode |
| Chunks executed | Statement count |
| Backlog remaining | Chunk ceiling hit |
| Cutoff | Computed date |
| Error/refusal reason | Why it failed or refused |

**Safety model.** Three switches must all be on before any deletion: env `RETENTION_SWEEPER_ENABLED`, env `RETENTION_ARMED`, and per-policy `is_armed`. The default is shadow mode (counts only, deletes nothing). There is deliberately no UI toggle; changes go via migration or SQL so they leave a reviewable trail.
**Scheduling.** `RETENTION_SWEEP_HOUR_UTC` (optional) pins the sweep to one UTC hour; for example 22 is 01:00 EAT. Invalid values mean "no window" (never rounded). If unset, the cadence drifts with restarts.

**Flow: onboarding a policy.**
1. Author it disarmed (shadow).
2. Let it sweep several times and review rows in scope.
3. Check the cutoff matches keep-days.
4. Confirm the data is disposable and the regulatory retention period exceeds keep-days.
5. Arm it deliberately via migration, with the shadow evidence in the change description.
6. Watch the first armed runs; backlog clears over several sweeps.

**Troubleshooting.** Nothing removed means shadow mode (check all switches). Zero in scope means wrong date column or filter. Backlog never clears means raise max statements. Refused means read the reason. Table size unchanged means space reclamation lags. Policy not listed means it is not enabled.
**Permissions.** Access level not specified in docs.
**Dependencies.** Scheduled Tasks, Activity Log, Platform Health, Admin Console.

## 19. Admin Console
**Purpose.** `/admin` is the super-administrator-only control centre with platform-wide visibility across all organisations (no branch or unit filter). Super admin is a platform-level grant, not an org role. Non-super-admins are refused server-side. Data includes names, amounts and contacts of every org.

**Sections.**
- Operations (job streams): Allocation Runs, TPS Generation Runs, Scheduled Task Runs, Upload Runs, Retention Sweeps, IoT Billing Runs, Integration Jobs (outbound provider submissions and retries; fix credentials/mappings before requeuing), Tax Documents (submission status, retries, fiscal receipts), Broadcasts. The key insight is that a job that never ran for one org is only visible platform-wide.
- Audit & Security: Audit Events, Auth Events, User Sessions, Impersonation ("View as" with operator, target, reason, duration), Role Grants (who holds admin, at which node, since when).
- Configuration: Setting Definitions, Setting Overrides (shows the scope chain and which level wins), Retention Policies.

**Platform directory.**
- Properties (`/properties`) and Companies (`/companies`): filters live/dormant/no units, search, sort, card/table views, metrics (properties, blocks, units, occupancy, tenancies). Read-only fields: city, county, postal code, country, currency, account number.
- Clients billing status (`/admin/clients`), four states: Billed (linked and invoiced in the window); Linked, not billed (contract but no invoice, a financial risk); Suggested (name match, one-click convert); Unconverted (no match). Converting creates a customer record and the link only, with no contracts or invoices.
- Vendor Links (`/admin/vendor-links`): records that several vendor rows are one real company (for example a utility supplier per property). Nothing is merged and history stays with each row.
- Bank Registry: `/banking/banks` and `/banking/onboarding`, platform staff only. It is platform-wide, so changes affect all tenants.
- Product Feedback (`/admin/feedback`): per-surface times asked, responses and usefulness %. Response rate is a column, dismissals never count as "no", and below a minimum sample only raw counts are shown.

**Flow: stand down (deactivate) a client or property.**
1. View coverage: counts of properties, units, tenancies, schedules and staff, plus warnings (outstanding money, active tenancies).
2. Give a reason (fixed list, some need notes) and a deactivation date (may be backdated, used in reports).
3. Confirm by typing the organisation name. The record is hidden from live lists.

**Rules.**
- Deactivation does not delete. It archives with restore, and restore returns exactly what was stood down.
- Client deactivation blocks staff sign-in. This is not a security control.
- Property deactivation does not cascade to the client.
- Delete is only for genuine mistakes and refuses any non-empty record.
- Records deleted before deactivation existed show in the archive without a reason and cannot be restored.

**Troubleshooting.** An empty page or bounce means the user is not a super admin. A missing run for one org means a per-org switch is off or fairness rotation skipped it. Integration jobs accumulating means provider credentials or mappings are wrong. An odd setting means a narrower-scope override is winning. Retention sweeps removing nothing means shadow mode.
**Dependencies.** Activity Log, Data Retention, Platform Health, Settings.
**Open questions.** Deactivation reason list, field-level specs of streams, notifications.

---

## 20. RentRewards implementation hints (suggestions only, not from docs)
- Meter pipeline: meter → reading (with quality flag) → consumption (delta) → billing run → run items → invoice lines. Put a period quality gate before billing.
- Enforcement: build as a state machine with proofs of both warnings, a grace period, a balance recheck before disconnect, and a shadow default.
- TPS (if ever needed): a schedule table per contract, with arrears measured against the schedule and principal-paid tracking.
- Outbound reporting: queue states Queued/Processing/Sent/Acknowledged/Failed/Dead, idempotent retries, and a shadow flag.
- Platform: append-only audit table with actor, before/after and a reason; a retention sweeper with shadow-first and an arm switch; a health-findings table with snooze (date) and waive (reason).
