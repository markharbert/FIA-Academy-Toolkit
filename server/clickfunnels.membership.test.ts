import assert from "node:assert/strict";
import test from "node:test";
import { handleCfEnrollmentEvent, parseCfWebhookEvent, type CfWebhookEvent } from "./clickfunnels";
import { storage } from "./storage";

type MutableStorage = Record<string, any>;

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "local-member",
    email: "member@example.com",
    cfContactId: "cf-contact",
    cfMembershipEventAt: null,
    isDisabled: false,
    cfEnrolled: false,
    cfRevokedAt: null,
    ...overrides,
  };
}

function enrollmentEvent(overrides: Partial<CfWebhookEvent> = {}): CfWebhookEvent {
  return {
    eventType: "courses/enrollment.created",
    eventId: "event-1",
    occurredAt: new Date("2026-08-24T12:00:00Z"),
    contactEmail: "member@example.com",
    contactId: "cf-contact",
    courseId: process.env.CF_COURSE_ID || "configured-course",
    firstName: "Member",
    lastName: "Example",
    ...overrides,
  };
}

test("ignores enrollment events that do not explicitly name the configured course", async () => {
  const result = await handleCfEnrollmentEvent(enrollmentEvent({ courseId: "another-course" }));
  assert.equal(result.action, "ignored_unscoped_course_event");
});

test("uses the ClickFunnels contact ID before an email lookup", async (t) => {
  const mutableStorage = storage as unknown as MutableStorage;
  const originalContactLookup = mutableStorage.getUserByCfContactId;
  const originalEmailLookup = mutableStorage.getUserByEmail;
  const originalUpdate = mutableStorage.updateUserForCfMembershipEvent;
  const profile = member();
  let emailLookupCalled = false;

  mutableStorage.getUserByCfContactId = async () => profile;
  mutableStorage.getUserByEmail = async () => {
    emailLookupCalled = true;
    return undefined;
  };
  mutableStorage.updateUserForCfMembershipEvent = async (_id: string, updates: Record<string, unknown>) => ({ ...profile, ...updates });
  t.after(() => {
    mutableStorage.getUserByCfContactId = originalContactLookup;
    mutableStorage.getUserByEmail = originalEmailLookup;
    mutableStorage.updateUserForCfMembershipEvent = originalUpdate;
  });

  const result = await handleCfEnrollmentEvent(enrollmentEvent());
  assert.equal(result.action, "granted");
  assert.equal(emailLookupCalled, false);
});

test("does not let an older revocation overwrite a newer enrollment", async (t) => {
  const mutableStorage = storage as unknown as MutableStorage;
  const originalContactLookup = mutableStorage.getUserByCfContactId;
  const originalUpdate = mutableStorage.updateUserForCfMembershipEvent;
  const profile = member();

  mutableStorage.getUserByCfContactId = async () => profile;
  mutableStorage.updateUserForCfMembershipEvent = async (_id: string, updates: Record<string, unknown>, occurredAt: Date) => {
    if (profile.cfMembershipEventAt && profile.cfMembershipEventAt > occurredAt) return undefined;
    Object.assign(profile, updates);
    return profile;
  };
  t.after(() => {
    mutableStorage.getUserByCfContactId = originalContactLookup;
    mutableStorage.updateUserForCfMembershipEvent = originalUpdate;
  });

  const newerEnrollment = enrollmentEvent({ eventId: "newer", occurredAt: new Date("2026-08-24T12:00:00Z") });
  const olderRevocation = enrollmentEvent({
    eventType: "courses/enrollment.deleted",
    eventId: "older",
    occurredAt: new Date("2026-08-24T11:00:00Z"),
  });
  assert.equal((await handleCfEnrollmentEvent(newerEnrollment)).action, "granted");
  assert.equal((await handleCfEnrollmentEvent(olderRevocation)).action, "ignored_stale_event");
  assert.equal(profile.cfEnrolled, true);
});

test("parses malformed webhook payloads without inventing a membership identity", () => {
  const parsed = parseCfWebhookEvent({ event_type: "courses/enrollment.created", data: null });
  assert.equal(parsed.contactId, null);
  assert.equal(parsed.contactEmail, null);
  assert.equal(parsed.courseId, null);
  assert.ok(parsed.occurredAt instanceof Date);
});

test("does not treat an enrollment record ID as a contact ID", () => {
  const parsed = parseCfWebhookEvent({
    event_type: "courses/enrollment.created",
    data: {
      id: "enrollment-123",
      course_id: "course-123",
      email_address: "member@example.com",
    },
  });
  assert.equal(parsed.contactId, null);
});

test("still accepts the resource ID for contact events", () => {
  const parsed = parseCfWebhookEvent({
    event_type: "contact.created",
    data: {
      id: "contact-123",
      email_address: "member@example.com",
    },
  });
  assert.equal(parsed.contactId, "contact-123");
});