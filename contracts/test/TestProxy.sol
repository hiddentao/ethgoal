pragma solidity >=0.6.1;

import '../Proxy.sol';
import './AbstractTestProxyBase.sol';

contract TestProxy is AbstractTestProxyBase, Proxy {
  constructor (address _impl) Proxy(_impl) public {
    value = 123;
  }
}
