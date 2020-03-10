pragma solidity >=0.6.1;

import "./IProxyImpl.sol";
import "./Ownable.sol";
import "./EternalStorage.sol";

/*
Based on https://github.com/zeppelinos/labs/blob/master/upgradeability_using_eternal_storage/contracts
*/
contract Proxy is Ownable {
  /**
  * @dev This event will be emitted every time the implementation gets upgraded
  * @param implementation representing the address of the upgraded implementation
  */
  event Upgraded(address indexed implementation, string version);

  /**
   * Constructor.
   */
  constructor (address _implementation) Ownable() public {
    require(_implementation != address(0), 'implementation must be valid');
    dataAddress["impl"] = _implementation;
  }

  /**
  * @dev Get the address of the implementation where every call will be delegated.
  * @return address of the implementation to which it will be delegated
  */
  function getImplementation() public view returns (address) {
    return dataAddress["impl"];
  }

  /**
   * @dev Point to a new implementation.
   * This is internal so that descendants can control access to this in custom ways.
   */
  function setImplementation(address _implementation) public onlyOwner {
    require(!dataBool["implFrozen"], 'implementation already frozen');
    require(_implementation != address(0), 'implementation must be valid');
    require(_implementation != dataAddress["impl"], 'already this implementation');

    string memory version = IProxyImpl(_implementation).getImplementationVersion();

    dataAddress["impl"] = _implementation;

    emit Upgraded(_implementation, version);
  }

  /**
   * @dev Freeze the current implementation, disallowing future implementation changes.
   */
  function freezeImplementation() public onlyOwner {
    dataBool["implFrozen"] = true;
  }

  /**
  * @dev Fallback function allowing to perform a delegatecall to the given implementation.
  * This function will return whatever the implementation call returns
  */
  fallback () external payable {
    address _impl = getImplementation();
    require(_impl != address(0), 'implementation not set');

    // solhint-disable-next-line security/no-inline-assembly
    assembly {
      let ptr := mload(0x40)
      calldatacopy(ptr, 0, calldatasize())
      let result := delegatecall(gas(), _impl, ptr, calldatasize(), 0, 0)
      let size := returndatasize()
      returndatacopy(ptr, 0, size)
      switch result
      case 0 { revert(ptr, size) }
      default { return(ptr, size) }
    }
  }

  receive() external payable {
    revert('not supported');
  }
}