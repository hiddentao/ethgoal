pragma solidity >=0.6.1;

import "./EternalStorage.sol";

/**
 * Based on https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/ownership/Ownable.sol
 */
contract Ownable is EternalStorage {
    address private _owner;

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor () internal {
        dataAddress["owner"] = msg.sender;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return dataAddress["owner"];
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Returns true if the caller is the current owner.
     */
    function isOwner() public view returns (bool) {
        return msg.sender == dataAddress["owner"];
    }
}