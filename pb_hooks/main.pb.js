/// <reference path="../pb_data/types.d.ts" />
//
// Pocket PM - server-side guards that collection rules cannot express.
//
// WHY THIS FILE EXISTS
// --------------------
// PocketBase is publicly addressable at pb.pocketpm.fyi. Routing writes through
// Next.js is not a security boundary: anyone holding a session token can PATCH
// PocketBase directly and set any field the collection rules allow. So a check
// in an API route is a convention, not a control.
//
// workflow_instances.updateRule MUST let project members write `status` and
// `current_step_order`, because this app has no admin client - the workflow
// engine runs as the calling user. That leaves a hole nothing in SQL or in
// PocketBase's rule language can close: "this write must be accompanied by an
// append to another collection" is not expressible as a rule.
//
// verify:tenancy section 9 proves the hole open in production:
//   "stored approved, replayed pending - the PATCH succeeded"
//
// This file closes it for the REST path.
//
//
// WHAT THIS FILE MUST NEVER DO
// ----------------------------
// Do NOT extend these guards to ordinary business status fields. The following
// are USER-AUTHORED, and a hook over them breaks the application:
//
//   rfis.status            submittals.disposition   change_orders.status
//   punch_list.status      deficiencies.status      pay_applications.status
//   subcontractors.status  subcontractors.a401_status
//   tasks.status           drawings.status          aia_notices.status
//   safety_observations.status   dfow.phase          schedule_items.status
//   project_roles.status
//   ...and every type / priority / severity / role / category select.
//
// A PM marks an RFI answered. A superintendent closes a punch list item. Those
// are people doing their jobs, not server logic, and rejecting them would break
// the app while looking like a security improvement. The distinguishing test is
// not "is it a select field" - it is "is this value assigned by server logic?"
//
// Only workflow_instances is guarded here, and only its lifecycle fields.
//
//
// KNOWN GAP, DELIBERATE
// ---------------------
// The CPM columns (schedule_items.early_start .. is_critical, and
// projects.cpm_inputs_hash / cpm_computed_at) are server-computed but are NOT
// guarded, because persistCpm() writes them over this same REST API as the
// calling user - a hook cannot tell it from an attacker. See
// docs/workflow-hooks.md. Forging is_critical misstates a chart; forging an
// approval misstates who approved a submittal.
//
//
// COVERAGE
// --------
// Request hooks only. A migration's app.save() bypasses these, as measured in
// docs/workflow-hooks.md - that requires repo access and a deploy, which is a
// larger compromise than this control addresses. Direct SQLite writes on the
// box likewise.

//
// A NOTE ON SCOPE, WHICH COSTS AN HOUR IF YOU MISS IT
// ---------------------------------------------------
// PocketBase executes each hook handler in an ISOLATED Goja VM. The handler
// cannot see module-level constants or functions - they are `undefined` inside
// it, and the first comparison against one throws a ReferenceError that
// PocketBase reports as a generic 400 with no hint of the cause.
//
// So everything a handler needs is declared INSIDE the handler. This looks
// repetitive and is not a style choice.

/**
 * A workflow may only be created in its defined initial state.
 *
 * Rejected rather than stripped. A silent strip is the failure pattern in
 * 6bd2fba: the client receives a well-formed 200 and believes the value took.
 * The message names the offending field so the caller can act on it.
 */
onRecordCreateRequest((e) => {
    const INITIAL_STATUS = "pending";
    const body = e.requestInfo().body || {};

    if (body.status !== undefined && body.status !== INITIAL_STATUS) {
        throw new BadRequestError(
            "status cannot be set when starting a workflow - a new workflow always begins as '" +
                INITIAL_STATUS + "'. Remove the field and retry.",
        );
    }
    if (body.completed_at !== undefined && body.completed_at !== "") {
        throw new BadRequestError(
            "completed_at cannot be set when starting a workflow - it is written when the workflow finishes.",
        );
    }

    // The first step order, read from the snapshot the engine supplied.
    // Defensive: an unreadable snapshot is not this hook's problem to
    // diagnose, and the engine already refuses a template with no steps.
    let expectedStep = 1;
    try {
        const raw = e.record.get("template_snapshot");
        const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
        const steps = (snapshot && snapshot.steps) || [];
        let min = null;
        for (let i = 0; i < steps.length; i++) {
            const order = Number(steps[i].step_order);
            if (!isNaN(order) && (min === null || order < min)) min = order;
        }
        if (min !== null) expectedStep = min;
    } catch (err) {
        expectedStep = 1;
    }

    if (body.current_step_order !== undefined && Number(body.current_step_order) !== expectedStep) {
        throw new BadRequestError(
            "current_step_order cannot be chosen - a new workflow starts at step " + expectedStep + ".",
        );
    }

    // Assigned, not merely validated: the record lands in the defined initial
    // state whatever arrived in the body.
    e.record.set("status", INITIAL_STATUS);
    e.record.set("current_step_order", expectedStep);
    e.record.set("completed_at", "");
    if (e.auth) {
        e.record.set("started_by", e.auth.id);
    }

    e.next();
}, "workflow_instances");

/**
 * A state change requires a justifying action, already logged.
 *
 * The engine writes the workflow_actions row BEFORE the state change
 * (src/lib/workflow/engine.ts), so by the time this PATCH arrives the
 * justification is committed and visible here. That ordering was chosen for
 * recoverability and pays for itself again: this is a lookup rather than a
 * reimplementation of the engine in Goja.
 *
 * ## Why there is no time window
 *
 * The action write and the status write are consecutive server-side calls
 * inside one request handler. The interval between them is milliseconds and has
 * nothing to do with the user's network or a paused tab, so any wall-clock
 * tolerance would be an arbitrary constant guarding an interval it cannot
 * observe.
 *
 * Instead the action must have been written AFTER the instance's own `updated`
 * timestamp - since the last time this instance changed state. That is a
 * comparison rather than a constant, and an action from an earlier pass through
 * the same step cannot be replayed to justify a second transition.
 *
 * A `comment` cannot justify a state change: otherwise anyone could leave a
 * note and then forge a status on the strength of it.
 */
onRecordUpdateRequest((e) => {
    const JUSTIFYING = ["approve", "reject", "cancel"];
    const body = e.requestInfo().body || {};

    if (body.status === undefined && body.current_step_order === undefined) {
        e.next();
        return;
    }

    if (!e.auth) {
        throw new BadRequestError("A workflow can only be advanced by a signed-in user.");
    }

    const original = e.record.original();
    const lastChanged = original.getDateTime("updated").string();

    let justifying = [];
    try {
        justifying = $app.findRecordsByFilter(
            "workflow_actions",
            "instance = {:instance} && actor = {:actor} && step_order = {:step} && acted_at > {:since}",
            "-acted_at",
            5,
            0,
            {
                instance: original.id,
                actor: e.auth.id,
                step: original.get("current_step_order"),
                since: lastChanged,
            },
        );
    } catch (err) {
        throw new BadRequestError("Could not verify this workflow action: " + err);
    }

    let ok = false;
    for (let i = 0; i < justifying.length; i++) {
        if (JUSTIFYING.indexOf(justifying[i].get("action")) !== -1) {
            ok = true;
            break;
        }
    }

    if (!ok) {
        throw new BadRequestError(
            "A workflow's status cannot be changed directly. Record an approval, rejection, or " +
                "cancellation first - every state change must be attributable to a logged action.",
        );
    }

    e.next();
}, "workflow_instances");
