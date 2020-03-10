pragma solidity >=0.6.1;

import "./Proxy.sol";
import "./SettingsControl.sol";

contract Bank is Proxy, SettingsControl {
  constructor (address _settings, address _impl) SettingsControl(_settings) Proxy(_impl) public {}
}
