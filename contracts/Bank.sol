pragma solidity >=0.6.1;

import "./Proxy.sol";
import "./SettingsControl.sol";

contract Bank is Proxy, SettingsControl {
  constructor (address _impl, address _settings) SettingsControl(_settings) Proxy(_impl) public {}
}
