// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ISatchelRegistry {
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

    function epochOf(address owner, bytes32 nsHash) external view returns (uint64);

    function grant(bytes32 nsHash, bytes32 granteeKeyHash, bytes calldata wrappedKey, string calldata label)
        external
        returns (uint256 grantId, uint64 epoch);

    function revoke(bytes32 nsHash, uint256 grantId) external returns (uint64 newEpoch);

    function rotate(bytes32 nsHash) external returns (uint64 newEpoch);

    function grantOf(uint256 grantId)
        external
        view
        returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active);
}
