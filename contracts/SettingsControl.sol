pragma solidity >=0.5.8;

import "./EternalStorage.sol";
import "./ISettings.sol";

contract SettingsControl is EternalStorage {
  constructor (address _settings) public {
    dataAddress["settings"] = _settings;
  }

  function settings () internal view returns (ISettings) {
    return ISettings(dataAddress["settings"]);
  }
}