// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISatchelRegistry} from "./ISatchelRegistry.sol";

/// Grant registry for satchel. Namespaces are keyed by (msg.sender, nsHash), so an owner can only ever
/// touch its own. No admin, no upgrade path, no fees. Epochs only increase.
contract SatchelRegistry is ISatchelRegistry {
    struct Grant {
        address owner;
        uint64 epoch;
        bool active;
        bytes32 nsHash;
        bytes32 granteeKeyHash;
    }

    error NotGrantOwner();
    error NamespaceMismatch();
    error GrantInactive();

    uint256 public nextGrantId = 1;

    // 0 means "never used", which reads as epoch 1
    mapping(address owner => mapping(bytes32 nsHash => uint64)) private _epoch;
    mapping(uint256 grantId => Grant) private _grants;

    function epochOf(address owner, bytes32 nsHash) public view returns (uint64 e) {
        e = _epoch[owner][nsHash];
        if (e == 0) e = 1;
    }

    function grant(bytes32 nsHash, bytes32 granteeKeyHash, bytes calldata wrappedKey, string calldata label)
        external
        returns (uint256 grantId, uint64 epoch)
    {
        epoch = epochOf(msg.sender, nsHash);
        grantId = nextGrantId++;
        _grants[grantId] = Grant(msg.sender, epoch, true, nsHash, granteeKeyHash);
        emit Granted(msg.sender, nsHash, grantId, epoch, granteeKeyHash, wrappedKey, label);
    }

    function revoke(bytes32 nsHash, uint256 grantId) external returns (uint64 newEpoch) {
        Grant storage g = _grants[grantId];
        if (g.owner != msg.sender) revert NotGrantOwner();
        if (g.nsHash != nsHash) revert NamespaceMismatch();
        if (!g.active) revert GrantInactive();
        g.active = false;
        newEpoch = epochOf(msg.sender, nsHash) + 1;
        _epoch[msg.sender][nsHash] = newEpoch;
        emit Revoked(msg.sender, nsHash, grantId, newEpoch);
    }

    function rotate(bytes32 nsHash) external returns (uint64 newEpoch) {
        newEpoch = epochOf(msg.sender, nsHash) + 1;
        _epoch[msg.sender][nsHash] = newEpoch;
        emit Rotated(msg.sender, nsHash, newEpoch);
    }

    function grantOf(uint256 grantId)
        external
        view
        returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)
    {
        Grant storage g = _grants[grantId];
        return (g.owner, g.nsHash, g.epoch, g.granteeKeyHash, g.active);
    }
}
