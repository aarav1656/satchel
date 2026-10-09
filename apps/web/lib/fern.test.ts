import { test, expect } from "bun:test";
import type { FetchedGrant } from "satchel-sdk";
import { grantForRecord } from "./fern";

const g = (epoch: number, id = String(epoch)): FetchedGrant =>
  ({
    id,
    epoch,
    ns: "memory/trading-desk",
    nsHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
    txHash: ("0x" + id.padStart(64, "0")) as `0x${string}`,
    granteeKeyHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
    owner: ("0x" + "ef".repeat(20)) as `0x${string}`,
    wrappedKey: "0x" as `0x${string}`,
    label: "Fern",
  }) as FetchedGrant;

test("grantForRecord matches exact epoch first", () => {
  const mine = [g(1, "1"), g(2, "2")];
  expect(grantForRecord(mine, 1)?.id).toBe("1");
  expect(grantForRecord(mine, 2)?.id).toBe("2");
});

test("grantForRecord fails closed when the blob is newer than every grant", () => {
  const mine = [g(1)];
  expect(grantForRecord(mine, 2)).toBeUndefined();
});

test("mutation: treating revoked epoch as allowed would pick a stale grant", () => {
  const mine = [g(1)];
  const recordEpoch = 2;
  const broken = mine.find((x) => x.epoch === recordEpoch) ?? mine.sort((a, b) => b.epoch - a.epoch)[0]!;
  expect(broken.epoch).toBe(1);
  expect(grantForRecord(mine, recordEpoch)).toBeUndefined();
  expect(broken.epoch).not.toBe(recordEpoch);
});
