// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ISatchelRegistry} from "../src/ISatchelRegistry.sol";
import {SatchelRegistry} from "../src/SatchelRegistry.sol";

contract SatchelRegistryTest is Test {
    event Granted(
        address indexed owner,
        bytes32 indexed nsHash,
        uint256 indexed grantId,
        uint64 epoch,
        bytes32 granteeKeyHash,
        bytes wrappedKey,
        string label
    );
    event Revoked(address indexed owner, bytes32 indexed nsHash, uint256 indexed grantId, uint64 newEpoch);
    event Rotated(address indexed owner, bytes32 indexed nsHash, uint64 newEpoch);

    SatchelRegistry reg;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 constant NS = keccak256("satchel/ns/notes");
    bytes32 constant NS2 = keccak256("satchel/ns/memory");
    bytes32 constant GK = keccak256("grantee-p256-pub");

    function setUp() public {
        reg = new SatchelRegistry();
    }

    function test_epochStartsAtOne() public view {
        assertEq(reg.epochOf(alice, NS), 1);
        assertEq(reg.epochOf(bob, NS2), 1);
    }

    function test_grantStoresAndReturns() public {
        vm.prank(alice);
        (uint256 id, uint64 epoch) = reg.grant(NS, GK, hex"c0ffee", "reader app");
        assertEq(id, 1);
        assertEq(epoch, 1);
        (address o, bytes32 ns, uint64 e, bytes32 gk, bool active) = reg.grantOf(id);
        assertEq(o, alice);
        assertEq(ns, NS);
        assertEq(e, 1);
        assertEq(gk, GK);
        assertTrue(active);
        assertEq(reg.epochOf(alice, NS), 1);
    }

    function test_grantEmitsStoredFields() public {
        vm.expectEmit(true, true, true, true, address(reg));
        emit Granted(alice, NS, 1, 1, GK, hex"deadbeef", "label");
        vm.prank(alice);
        reg.grant(NS, GK, hex"deadbeef", "label");
    }

    function test_grantIdsAreGlobalAndIncreasing() public {
        vm.prank(alice);
        (uint256 a,) = reg.grant(NS, GK, "", "");
        vm.prank(bob);
        (uint256 b,) = reg.grant(NS, GK, "", "");
        vm.prank(alice);
        (uint256 c,) = reg.grant(NS2, GK, "", "");
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
        assertEq(reg.nextGrantId(), 4);
    }

    function test_grantAtCurrentEpochAfterRotate() public {
        vm.startPrank(alice);
        reg.rotate(NS);
        (uint256 id, uint64 epoch) = reg.grant(NS, GK, "", "");
        vm.stopPrank();
        assertEq(epoch, 2);
        (,, uint64 e,,) = reg.grantOf(id);
        assertEq(e, 2);
    }

    function test_revokeInactivatesAndBumpsEpoch() public {
        vm.startPrank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        vm.expectEmit(true, true, true, true, address(reg));
        emit Revoked(alice, NS, id, 2);
        uint64 ne = reg.revoke(NS, id);
        vm.stopPrank();
        assertEq(ne, 2);
        assertEq(reg.epochOf(alice, NS), 2);
        (address o,, uint64 e,, bool active) = reg.grantOf(id);
        assertEq(o, alice);
        assertEq(e, 1, "grant keeps the epoch it was issued at");
        assertFalse(active);
    }

    function test_revokeOnlyAffectsThatNamespace() public {
        vm.startPrank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        reg.revoke(NS, id);
        vm.stopPrank();
        assertEq(reg.epochOf(alice, NS2), 1);
        assertEq(reg.epochOf(bob, NS), 1);
    }

    function test_revokeTwiceReverts() public {
        vm.startPrank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        reg.revoke(NS, id);
        vm.expectRevert(SatchelRegistry.GrantInactive.selector);
        reg.revoke(NS, id);
        vm.stopPrank();
        assertEq(reg.epochOf(alice, NS), 2);
    }

    function test_revokeForeignGrantReverts() public {
        vm.prank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        vm.prank(bob);
        vm.expectRevert(SatchelRegistry.NotGrantOwner.selector);
        reg.revoke(NS, id);
        (,,,, bool active) = reg.grantOf(id);
        assertTrue(active);
        assertEq(reg.epochOf(alice, NS), 1);
        assertEq(reg.epochOf(bob, NS), 1);
    }

    function test_revokeUnknownGrantReverts() public {
        vm.prank(alice);
        vm.expectRevert(SatchelRegistry.NotGrantOwner.selector);
        reg.revoke(NS, 1);
        vm.prank(alice);
        vm.expectRevert(SatchelRegistry.NotGrantOwner.selector);
        reg.revoke(NS, type(uint256).max);
    }

    function test_revokeWrongNamespaceReverts() public {
        vm.startPrank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        vm.expectRevert(SatchelRegistry.NamespaceMismatch.selector);
        reg.revoke(NS2, id);
        vm.stopPrank();
        (,,,, bool active) = reg.grantOf(id);
        assertTrue(active);
        assertEq(reg.epochOf(alice, NS2), 1);
    }

    function test_rotateBumpsAndEmits() public {
        vm.startPrank(alice);
        vm.expectEmit(true, true, false, true, address(reg));
        emit Rotated(alice, NS, 2);
        assertEq(reg.rotate(NS), 2);
        assertEq(reg.rotate(NS), 3);
        vm.stopPrank();
        assertEq(reg.epochOf(alice, NS), 3);
    }

    function test_rotateIsPerOwner() public {
        vm.prank(alice);
        reg.rotate(NS);
        assertEq(reg.epochOf(alice, NS), 2);
        assertEq(reg.epochOf(bob, NS), 1, "bob cannot be moved by alice");
        vm.prank(bob);
        reg.rotate(NS);
        assertEq(reg.epochOf(bob, NS), 2);
        assertEq(reg.epochOf(alice, NS), 2);
    }

    function test_revokedGrantStaysReadableAndCannotBeRegranted() public {
        vm.startPrank(alice);
        (uint256 id,) = reg.grant(NS, GK, "", "");
        reg.revoke(NS, id);
        (uint256 id2, uint64 e2) = reg.grant(NS, GK, "", "");
        vm.stopPrank();
        assertEq(id2, 2);
        assertEq(e2, 2);
        (,,,, bool a1) = reg.grantOf(id);
        (,,,, bool a2) = reg.grantOf(id2);
        assertFalse(a1);
        assertTrue(a2);
    }

    function test_grantOfUnknownIsZero() public view {
        (address o, bytes32 ns, uint64 e, bytes32 gk, bool active) = reg.grantOf(42);
        assertEq(o, address(0));
        assertEq(ns, bytes32(0));
        assertEq(e, 0);
        assertEq(gk, bytes32(0));
        assertFalse(active);
    }

    function test_noValueAccepted() public {
        (bool ok,) = address(reg).call{value: 1}("");
        assertFalse(ok);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (ok,) = address(reg).call{value: 1}(abi.encodeCall(ISatchelRegistry.rotate, (NS)));
        assertFalse(ok);
        assertEq(address(reg).balance, 0);
    }

    function testFuzz_grantRoundTrip(
        address who,
        bytes32 ns,
        bytes32 gk,
        bytes calldata wrapped,
        string calldata label
    ) public {
        vm.assume(who != address(0));
        vm.expectEmit(true, true, true, true, address(reg));
        emit Granted(who, ns, 1, 1, gk, wrapped, label);
        vm.prank(who);
        (uint256 id, uint64 epoch) = reg.grant(ns, gk, wrapped, label);
        (address o, bytes32 n, uint64 e, bytes32 g, bool active) = reg.grantOf(id);
        assertEq(o, who);
        assertEq(n, ns);
        assertEq(e, epoch);
        assertEq(g, gk);
        assertTrue(active);
    }

    function testFuzz_strangerCannotRevoke(address stranger, bytes32 ns) public {
        vm.assume(stranger != alice);
        vm.prank(alice);
        (uint256 id,) = reg.grant(ns, GK, "", "");
        vm.prank(stranger);
        vm.expectRevert(SatchelRegistry.NotGrantOwner.selector);
        reg.revoke(ns, id);
        (,,,, bool active) = reg.grantOf(id);
        assertTrue(active);
    }

    function testFuzz_everyBumpCountsExactlyOnce(uint8 rotations, uint8 grants) public {
        rotations = uint8(bound(rotations, 0, 40));
        grants = uint8(bound(grants, 0, 20));
        uint64 expected = 1;
        vm.startPrank(alice);
        for (uint256 i = 0; i < rotations; i++) {
            expected++;
            assertEq(reg.rotate(NS), expected);
        }
        for (uint256 i = 0; i < grants; i++) {
            (uint256 id, uint64 e) = reg.grant(NS, GK, "", "");
            assertEq(e, expected);
            expected++;
            assertEq(reg.revoke(NS, id), expected);
        }
        vm.stopPrank();
        assertEq(reg.epochOf(alice, NS), expected);
        assertEq(reg.epochOf(bob, NS), 1);
    }
}
