pragma solidity >=0.6.1;

import "./Ownable.sol";
import "./IProxyImpl.sol";
import "./ISettings.sol";

contract SettingsImpl is Ownable, ISettings, IProxyImpl {
  constructor () public Ownable() {}

  function getImplementationVersion() public override pure returns (string memory) {
    return "v1";
  }

  function setController(address _contract) public override onlyOwner {
    dataAddress["controller"] = _contract;
  }

  function getController() public override view returns (address) {
    return dataAddress["controller"];
  }

  function setBank(address _contract) public override onlyOwner {
    dataAddress["bank"] = _contract;
  }

  function getBank() public override view returns (IBank) {
    return IBank(dataAddress["bank"]);
  }

  function setPaymentUnit(address _contract) public override onlyOwner {
    dataAddress["unit"] = _contract;
  }

  function getPaymentUnit() public override view returns (IERC20) {
    return IERC20(dataAddress["unit"]);
  }

  function setChai(address _contract) public override onlyOwner {
    dataAddress["chai"] = _contract;
  }

  function getChai() public override view returns (IChai) {
    return IChai(dataAddress["chai"]);
  }

  function getTime() public override view returns (uint) {
    return now;
  }
}