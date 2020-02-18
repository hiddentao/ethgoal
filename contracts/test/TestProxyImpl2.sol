pragma solidity >=0.6.1;

import '../base/IProxyImpl.sol';
import './AbstractTestProxyBase.sol';
import './ITestProxyImpl.sol';

contract TestProxyImpl2 is IProxyImpl, AbstractTestProxyBase, ITestProxyImpl {
  function getImplementationVersion () public pure override returns (string memory) {
    return "test2";
  }

  function getValue() public override view returns (uint) {
    return value + 2;
  }
}
