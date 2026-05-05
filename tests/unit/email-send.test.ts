import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted to the top of the file before any other code runs, which
// means we can't reference top-level `const`s or `class`es from inside its
// factory — they don't exist yet at hoist time. The supported escape hatches
// are vi.hoisted() (for sharing references) or defining the mock entirely
// inside the factory closure. We use the former so the test bodies below can
// reach `mockResendSend` for assertions.
const { mockResendSend } = vi.hoisted(() => ({
  mockResendSend: vi.fn(),
}));

vi.mock("resend", () => {
  class MockResend {
    emails = { send: mockResendSend };
    constructor(_apiKey: string) {}
  }
  return { Resend: MockResend };
});

const mockFromFn = vi.fn();
const mockInsertFn = vi.fn();
const mockSelectFn = vi.fn();
const mockSingleFn = vi.fn();
const mockUpdateFn = vi.fn();
const mockEqFn = vi.fn();
const mockDeleteFn = vi.fn();
const mockUpsertFn = vi.fn();
const mockMaybeSingleFn = vi.fn();

function setupChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    eq: mockEqFn,
    insert: mockInsertFn,
    select: mockSelectFn,
    single: mockSingleFn,
    update: mockUpdateFn,
    delete: mockDeleteFn,
    upsert: mockUpsertFn,
    maybeSingle: mockMaybeSingleFn,
    from: mockFromFn,
  };

  mockFromFn.mockReturnValue(chain);
  mockInsertFn.mockReturnValue(chain);
  mockSelectFn.mockReturnValue(chain);
  mockSingleFn.mockReturnValue({ data: { id: "log-id-1" } });
  mockUpdateFn.mockReturnValue(chain);
  mockEqFn.mockReturnValue(chain);
  mockDeleteFn.mockReturnValue(chain);
  mockUpsertFn.mockReturnValue(chain);
  mockMaybeSingleFn.mockReturnValue({ data: null });

  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({ from: mockFromFn }),
}));

import { sendEmail, _resetResendClient } from "@/lib/email/send";
import { hashEmail } from "@/lib/email/suppressions";

function resetAllMocks() {
  vi.clearAllMocks();
  setupChain();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Wuwu <noreply@wuwu.ai>";
  _resetResendClient();
}

const baseInput = {
  to: "test@example.com",
  template: "verify",
  subject: "Verify your email",
  html: "<p>Click here</p>",
  text: "Click here",
  idempotencyKey: "key-1",
  userId: null,
};

describe("sendEmail", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("happy path: calls Resend and returns { ok: true, status: 'sent' }", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "msg-123" },
      error: null,
    });

    const result = await sendEmail(baseInput);

    expect(result).toEqual({
      ok: true,
      messageId: "msg-123",
      status: "sent",
    });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("duplicate idempotency key: second call returns duplicate, Resend NOT called again", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "msg-123" },
      error: null,
    });

    const result1 = await sendEmail(baseInput);

    mockSingleFn.mockReturnValue({ data: null });

    const result2 = await sendEmail({
      ...baseInput,
      idempotencyKey: "key-1",
    });

    expect(result1).toEqual({
      ok: true,
      messageId: "msg-123",
      status: "sent",
    });
    expect(result2).toEqual({
      ok: true,
      messageId: null,
      status: "duplicate",
    });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("suppressed: returns suppressed and Resend NOT called", async () => {
    mockMaybeSingleFn.mockReturnValue({ data: { email_hash: "somehash" } });

    const result = await sendEmail(baseInput);

    expect(result).toEqual({
      ok: true,
      messageId: null,
      status: "suppressed",
    });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("Resend API error: returns { ok: false, status: 'failed' }, does NOT throw", async () => {
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: "Rate limit exceeded", name: "rate_limit_error" },
    });

    const result = await sendEmail(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("Rate limit exceeded");
    }
  });

  it("Resend throws exception: still returns { ok: false }, never re-throws", async () => {
    mockResendSend.mockRejectedValue(new Error("Network timeout"));

    const result = await sendEmail(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("Network timeout");
    }
  });

  it("hashes email with SHA-256, never logs raw email", async () => {
    mockResendSend.mockResolvedValue({
      data: { id: "msg-456" },
      error: null,
    });

    await sendEmail(baseInput);

    const insertCall = mockInsertFn.mock.calls[0];
    const loggedData = insertCall[0];

    expect(loggedData.to_email_hash).not.toBe(baseInput.to);
    expect(loggedData.to_email_hash.length).toBe(64);
    expect(loggedData.to_email_domain).toBe("example.com");
    expect(JSON.stringify(loggedData)).not.toContain("test@example.com");
  });

  it("uses EMAIL_FROM env var as sender", async () => {
    process.env.EMAIL_FROM = "Custom <custom@wuwu.ai>";
    mockResendSend.mockResolvedValue({
      data: { id: "msg-789" },
      error: null,
    });

    await sendEmail(baseInput);

    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Custom <custom@wuwu.ai>",
      }),
    );
  });
});

describe("hashEmail", () => {
  it("produces SHA-256 hex digest of lowercased email", async () => {
    const hash = await hashEmail("Test@Example.COM");
    const hash2 = await hashEmail("test@example.com");
    expect(hash).toBe(hash2);
    expect(hash.length).toBe(64);
  });

  it("produces different hashes for different emails", async () => {
    const hash1 = await hashEmail("a@example.com");
    const hash2 = await hashEmail("b@example.com");
    expect(hash1).not.toBe(hash2);
  });
});