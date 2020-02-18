pragma solidity >=0.6.1;

import "./base/Proxy.sol";

contract Bank is Proxy {
  constructor (address _impl) Proxy(_impl) public {}
}
