// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {SatchelRegistry} from "../src/SatchelRegistry.sol";

/// Drives random grant/revoke/rotate calls from several owners (including attempts on foreign grants)
/// and keeps a ghost model of what the registry must say.
contract Handler is Test {
    SatchelRegistry public reg;
    address[] public owners;
    bytes32[] public nss;

    mapping(address => mapping(bytes32 => uint64)) public model; // expected epoch, starts at 1
    mapping(address => mapping(bytes32 => uint64)) public lastSeen; // last epoch read on chain
    uint256 public grants; // ids 1..grants exist
    mapping(uint256 => address) public gOwner;
    mapping(uint256 => bytes32) public gNs;
    mapping(uint256 => uint64) public gEpoch;
    mapping(uint256 => bytes32) public gGrantee;
    mapping(uint256 => bool) public gActive;

    bool public foreignRevokeSucceeded;
    bool public epochWentDown;
    bool public idSkipped;
    uint256 public calls;
    uint256 public foreignAttempts;
    uint256 public revokes;

    constructor(SatchelRegistry r) {
        reg = r;
        for (uint160 i = 1; i <= 3; i++) {
            owners.push(address(uint160(0xA000) + i));
        }
        for (uint256 i = 0; i < 2; i++) {
            nss.push(keccak256(abi.encode("ns", i)));
        }
    }

    function ownersLength() external view returns (uint256) {
        return owners.length;
    }

    function nssLength() external view returns (uint256) {
        return nss.length;
    }

    function _m(address o, bytes32 ns) internal view returns (uint64 e) {
        e = model[o][ns];
        if (e == 0) e = 1;
    }

    function _observe(address o, bytes32 ns) internal {
        uint64 e = reg.epochOf(o, ns);
        if (e < lastSeen[o][ns]) epochWentDown = true;
        lastSeen[o][ns] = e;
    }

    function doGrant(uint256 oi, uint256 ni, bytes32 grantee, bytes calldata wrapped) external {
        calls++;
        address o = owners[oi % owners.length];
        bytes32 ns = nss[ni % nss.length];
        vm.prank(o);
        (uint256 id, uint64 epoch) = reg.grant(ns, grantee, wrapped, "h");
        if (id != grants + 1) idSkipped = true;
        grants = id;
        gOwner[id] = o;
        gNs[id] = ns;
        gEpoch[id] = epoch;
        gGrantee[id] = grantee;
        gActive[id] = true;
        require(epoch == _m(o, ns), "grant epoch != model");
        _observe(o, ns);
    }

    function doRevoke(uint256 oi, uint256 idSeed) external {
        calls++;
        if (grants == 0) return;
        address caller = owners[oi % owners.length];
        uint256 id = (idSeed % grants) + 1;
        address o = gOwner[id];
        bytes32 ns = gNs[id];
        vm.prank(caller);
        try reg.revoke(ns, id) returns (uint64 ne) {
            // success is legal only for the true owner of an active grant
            if (caller != o || !gActive[id]) foreignRevokeSucceeded = true;
            gActive[id] = false;
            model[o][ns] = _m(o, ns) + 1;
            require(ne == model[o][ns], "revoke epoch != model");
            revokes++;
        } catch {
            if (caller != o) foreignAttempts++;
        }
        _observe(o, ns);
        _observe(caller, ns);
    }

    function doRevokeWrongNs(uint256 idSeed, uint256 ni) external {
        calls++;
        if (grants == 0) return;
        uint256 id = (idSeed % grants) + 1;
        bytes32 ns = nss[ni % nss.length];
        if (ns == gNs[id]) return;
        vm.prank(gOwner[id]);
        try reg.revoke(ns, id) {
            foreignRevokeSucceeded = true;
        } catch {}
    }

    function doRotate(uint256 oi, uint256 ni) external {
        calls++;
        address o = owners[oi % owners.length];
        bytes32 ns = nss[ni % nss.length];
        vm.prank(o);
        uint64 ne = reg.rotate(ns);
        model[o][ns] = _m(o, ns) + 1;
        require(ne == model[o][ns], "rotate epoch != model");
        _observe(o, ns);
    }
}

contract SatchelInvariantTest is Test {
    SatchelRegistry reg;
    Handler h;

    function setUp() public {
        reg = new SatchelRegistry();
        h = new Handler(reg);
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](4);
        sels[0] = Handler.doGrant.selector;
        sels[1] = Handler.doRevoke.selector;
        sels[2] = Handler.doRotate.selector;
        sels[3] = Handler.doRevokeWrongNs.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    function invariant_epochsMatchModelAndNeverDecrease() public view {
        assertFalse(h.epochWentDown(), "epoch decreased");
        for (uint256 i = 0; i < h.ownersLength(); i++) {
            for (uint256 j = 0; j < h.nssLength(); j++) {
                address o = h.owners(i);
                bytes32 ns = h.nss(j);
                uint64 want = h.model(o, ns);
                if (want == 0) want = 1;
                assertEq(reg.epochOf(o, ns), want, "epoch != model");
            }
        }
    }

    function invariant_noOwnerTouchesAnothersState() public view {
        assertFalse(h.foreignRevokeSucceeded(), "foreign or invalid revoke succeeded");
        assertFalse(h.idSkipped(), "grant ids not consecutive");
        assertEq(reg.nextGrantId(), h.grants() + 1);
        uint256 n = h.grants();
        for (uint256 id = 1; id <= n; id++) {
            (address o, bytes32 ns, uint64 e, bytes32 gk, bool active) = reg.grantOf(id);
            assertEq(o, h.gOwner(id), "owner changed");
            assertEq(ns, h.gNs(id), "ns changed");
            assertEq(e, h.gEpoch(id), "epoch at grant changed");
            assertEq(gk, h.gGrantee(id), "grantee changed");
            assertEq(active, h.gActive(id), "active != model");
            assertLe(e, reg.epochOf(o, ns), "grant epoch above namespace epoch");
        }
    }

    function invariant_reachedInterestingStates() public view {
        // guards against a vacuous run: only meaningful once the campaign has issued calls
        if (h.calls() > 30) {
            assertGt(h.grants(), 0, "no grants ever created");
        }
    }
}
