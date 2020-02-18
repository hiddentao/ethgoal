pragma solidity >=0.6.1;

import "./base/Proxy.sol";
import "./AbstractControllerBase.sol";

contract Controller is AbstractControllerBase, Proxy {
    constructor (address _impl, uint _fee, uint _judgementPeriod) Proxy(_impl) public {
        bank = address(this);
        fee = _fee;
        judgementPeriod = _judgementPeriod;
    }
}