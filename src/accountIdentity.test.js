import { describe, expect, test } from "vitest";
import { createDynamicAccountIdentity } from "./accountIdentity";

describe("createDynamicAccountIdentity", () => {
  test("maps a dynamic user and normalizes handle", () => {
    const identity = createDynamicAccountIdentity({
      handle: "  CowboyBebopPilot  ",
      dynamicUser: {
        userId: "dyn-user-1",
        verifiedCredentials: [{ address: "0x1234" }],
      },
    });

    expect(identity.provider).toBe("dynamic.xyz");
    expect(identity.accountId).toBe("dyn-user-1");
    expect(identity.handle).toBe("CowboyBebopPilot");
    expect(identity.walletAddress).toBe("0x1234");
  });

  test("falls back to local identity when dynamic user is absent", () => {
    const identity = createDynamicAccountIdentity({
      handle: "ArcadeHero",
    });

    expect(identity.provider).toBe("dynamic.xyz");
    expect(identity.accountId).toBe("local-arcadehero");
    expect(identity.handle).toBe("ArcadeHero");
    expect(identity.walletAddress).toBeNull();
  });
});
