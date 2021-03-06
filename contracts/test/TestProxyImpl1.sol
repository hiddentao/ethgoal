pragma solidity >=0.6.1;

import '../IProxyImpl.sol';
import './AbstractTestProxyBase.sol';
import './ITestProxyImpl.sol';

contract TestProxyImpl1 is IProxyImpl, AbstractTestProxyBase, ITestProxyImpl {
  function getImplementationVersion () public pure override returns (string memory) {
    return "test1";
  }

  function getValue() public override view returns (uint) {
    return value + 1;
  }
}
